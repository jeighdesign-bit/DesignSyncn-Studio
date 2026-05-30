import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { stripe, STRIPE_PRICE_IDS, WEBHOOK_SECRET } from './stripe.js';
import dotenv from 'dotenv';
import { getUserTokens } from './ai-gateway.js';
dotenv.config();

export const subscriptionRouter = Router();

// ─── Supabase admin client (service role) ────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

// ─── Plan token limits ────────────────────────────────────────────────────────
const PLAN_TOKENS: Record<string, number> = {
  free: 999999, // Unlocked for development & local pairing
  pro: 500,
  enterprise: 999999,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateTokenRecord(userId: string, planId = 'free') {
  const { data } = await supabaseAdmin
    .from('token_usage')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data) return data;

  // Create new token record
  const tokens = PLAN_TOKENS[planId] ?? 10;
  const { data: created } = await supabaseAdmin
    .from('token_usage')
    .insert([{
      user_id: userId,
      tokens_used: 0,
      tokens_remaining: tokens,
      plan_id: planId,
      reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }])
    .select()
    .single();
  return created;
}

async function activatePlan(userId: string, planId: string, stripeData: {
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  periodEnd?: Date;
}) {
  const tokens = PLAN_TOKENS[planId] ?? 10;

  // Upsert subscription record
  await supabaseAdmin.from('subscriptions').upsert([{
    user_id: userId,
    plan_id: planId,
    stripe_customer_id: stripeData.customerId,
    stripe_subscription_id: stripeData.subscriptionId,
    stripe_price_id: stripeData.priceId,
    status: 'active',
    current_period_end: stripeData.periodEnd?.toISOString(),
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });

  // Update token balance
  await supabaseAdmin.from('token_usage').upsert([{
    user_id: userId,
    tokens_used: 0,
    tokens_remaining: tokens,
    plan_id: planId,
    reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });

  console.log(`✅ Activated plan '${planId}' for user ${userId} | Tokens: ${tokens === 999999 ? 'Unlimited' : tokens}`);
}

// ─── GET /api/subscription/status ────────────────────────────────────────────
subscriptionRouter.get('/status', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // Get subscription record
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get token balance
    const tokenRecord = await getOrCreateTokenRecord(userId, sub?.plan_id || 'free');
    const planId = sub?.plan_id || 'free';
    const tokensTotal = PLAN_TOKENS[planId] ?? 10;

    return res.json({
      planId,
      status: sub?.status || 'active',
      tokensRemaining: tokenRecord?.tokens_remaining ?? 10,
      tokensTotal: tokensTotal === 999999 ? 999999 : tokensTotal,
      periodEnd: sub?.current_period_end,
      stripeCustomerId: sub?.stripe_customer_id,
      stripeSubscriptionId: sub?.stripe_subscription_id,
    });
  } catch (e: any) {
    console.error('❌ /status error:', e);
    const memTokens = getUserTokens(userId);
    return res.json({ planId: 'free', status: 'active', tokensRemaining: memTokens, tokensTotal: 10 });
  }
});

// ─── POST /api/subscription/checkout ─────────────────────────────────────────
subscriptionRouter.post('/checkout', async (req: Request, res: Response) => {
  const { planId, userId, successUrl, cancelUrl } = req.body;

  if (!planId || !['pro', 'enterprise'].includes(planId)) {
    return res.status(400).json({ error: 'Invalid planId. Must be pro or enterprise.' });
  }

  // If Stripe is not configured, return a mock response for dev
  if (!stripe) {
    console.log(`🔧 [DEV] Mock checkout for plan '${planId}' — no Stripe key configured.`);
    // Directly activate plan in dev mode
    await activatePlan(userId || 'anonymous-session', planId, {});
    return res.json({
      url: `${successUrl}&dev_mock=1`,
      sessionId: `mock_session_${Date.now()}`,
    });
  }

  const priceId = STRIPE_PRICE_IDS[planId];
  if (!priceId) {
    return res.status(500).json({ error: `No Stripe Price ID configured for plan '${planId}'. Set STRIPE_${planId.toUpperCase()}_PRICE_ID in server/.env` });
  }

  try {
    // Lookup or create Stripe customer
    let customerId: string | undefined;
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    } else if (userId !== 'anonymous-session') {
      // Create a customer in Stripe tied to this user
      const customer = await stripe.customers.create({
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const sessionParams: any = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, planId },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    };

    if (customerId) {
      sessionParams.customer = customerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    console.error('❌ /checkout error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/subscription/cancel ───────────────────────────────────────────
subscriptionRouter.post('/cancel', async (req: Request, res: Response) => {
  const { subscriptionId, userId } = req.body;

  if (!stripe) {
    await activatePlan(userId || 'anonymous-session', 'free', {});
    return res.json({ success: true, message: '[DEV] Mock cancellation — downgraded to free.' });
  }

  try {
    // Cancel at period end (graceful)
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscriptionId);

    return res.json({ success: true });
  } catch (e: any) {
    console.error('❌ /cancel error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/subscription/portal ────────────────────────────────────────────
subscriptionRouter.get('/portal', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;

  if (!stripe) {
    return res.json({ url: '#' });
  }

  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: 'No billing record found.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: process.env.APP_URL || 'http://localhost:5173',
    });

    return res.json({ url: session.url });
  } catch (e: any) {
    console.error('❌ /portal error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/subscription/webhook ──────────────────────────────────────────
// NOTE: This route requires raw body — configured in index.ts before JSON middleware
subscriptionRouter.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(200).json({ received: true });
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe Webhook: ${event.type}`);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        if (!userId || !planId) break;

        // Fetch subscription from Stripe for period details
        let periodEnd: Date | undefined;
        let subId: string | undefined;
        let priceId: string | undefined;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          subId = sub.id;
          priceId = sub.items.data[0]?.price?.id;
          // SDK v2026 returns current_period_end as string | number — handle both
          const periodRaw = (sub as any).current_period_end;
          periodEnd = typeof periodRaw === 'number'
            ? new Date(periodRaw * 1000)
            : periodRaw ? new Date(periodRaw) : undefined;
        }

        await activatePlan(userId, planId, {
          customerId: session.customer as string,
          subscriptionId: subId,
          priceId,
          periodEnd,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const { data: record } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id, plan_id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (record) {
          const periodRaw = (sub as any).current_period_end;
          const periodIso = typeof periodRaw === 'number'
            ? new Date(periodRaw * 1000).toISOString()
            : periodRaw ? new Date(periodRaw).toISOString() : null;
          await supabaseAdmin.from('subscriptions').update({
            status: sub.status,
            current_period_end: periodIso,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: record } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (record?.user_id) {
          await activatePlan(record.user_id, 'free', {
            customerId: sub.customer as string,
          });
          await supabaseAdmin.from('subscriptions').update({
            status: 'canceled',
            plan_id: 'free',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabaseAdmin.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', invoice.subscription);
        }
        break;
      }
    }
  } catch (e: any) {
    console.error(`❌ Webhook handler error for ${event.type}:`, e.message);
  }

  return res.json({ received: true });
});
