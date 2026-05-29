import { useState, useEffect, useCallback } from 'react';
import type { BillingState, PlanId, CheckoutResult } from './subscriptionTypes';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const DEFAULT_BILLING_STATE: BillingState = {
  planId: 'free',
  status: 'active',
  tokensRemaining: 10,
  tokensTotal: 10,
};

export function useBillingState(userId: string | undefined) {
  const [billingState, setBillingState] = useState<BillingState>(DEFAULT_BILLING_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [successPlan, setSuccessPlan] = useState<PlanId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Sync billing state from server ──────────────────────────────────────────
  const syncBillingState = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `${SERVER_URL}/api/subscription/status?userId=${encodeURIComponent(userId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setBillingState({
          planId: data.planId || 'free',
          status: data.status || 'active',
          tokensRemaining: data.tokensRemaining ?? 10,
          tokensTotal: data.tokensTotal ?? 10,
          periodEnd: data.periodEnd,
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
        });
      }
    } catch (e) {
      console.warn('[useBillingState] Failed to sync billing state:', e);
      // Graceful degradation — fall back to token balance from legacy endpoint
      try {
        const fallback = await fetch(`${SERVER_URL}/api/ai/tokens/balance?userId=${encodeURIComponent(userId)}`);
        if (fallback.ok) {
          const d = await fallback.json();
          setBillingState(prev => ({
            ...prev,
            tokensRemaining: d.balance ?? prev.tokensRemaining,
            tokensTotal: d.balance > 10 ? (d.balance >= 500 ? 500 : d.balance) : 10,
          }));
        }
      } catch { /* silent */ }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ── Initial sync on mount / userId change ────────────────────────────────
  useEffect(() => {
    syncBillingState();
  }, [syncBillingState]);

  // ── Check for Stripe success return ─────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSuccess = params.get('stripe_success');
    const planId = params.get('plan_id') as PlanId | null;

    if (stripeSuccess === '1' && planId) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Show success feedback
      setSuccessPlan(planId);
      // Re-sync to pick up newly activated plan
      syncBillingState();
      setTimeout(() => setSuccessPlan(null), 4000);
    }
  }, [syncBillingState]);

  // ── Initiate Stripe Checkout ─────────────────────────────────────────────
  const initiateCheckout = useCallback(async (planId: PlanId) => {
    if (planId === 'free') return; // Can't checkout to free
    if (checkoutLoading) return;   // Already processing

    setCheckoutLoading(planId);
    setErrorMessage(null);

    try {
      const res = await fetch(`${SERVER_URL}/api/subscription/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          userId: userId || 'anonymous-session',
          successUrl: `${window.location.href}?stripe_success=1&plan_id=${planId}`,
          cancelUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Checkout failed');
      }

      const { url }: CheckoutResult = await res.json();
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (e: any) {
      console.error('[useBillingState] Checkout error:', e);
      setErrorMessage(e.message || 'Failed to start checkout. Please try again.');
      setCheckoutLoading(null);
    }
  }, [userId, checkoutLoading]);

  // ── Cancel subscription ──────────────────────────────────────────────────
  const cancelSubscription = useCallback(async () => {
    if (!billingState.stripeSubscriptionId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: billingState.stripeSubscriptionId,
          userId: userId,
        }),
      });
      if (res.ok) {
        await syncBillingState();
      }
    } catch (e) {
      console.error('[useBillingState] Cancel error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [billingState.stripeSubscriptionId, userId, syncBillingState]);

  // ── Grant tokens directly (dev shortcut / legacy compatibility) ──────────
  const grantTokensDirect = useCallback(async (planId: string, tokenAmount: number) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/ai/tokens/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId || 'anonymous-session', amount: tokenAmount }),
      });
      if (res.ok) {
        const data = await res.json();
        setBillingState(prev => ({
          ...prev,
          tokensRemaining: data.balance,
          tokensTotal: tokenAmount === 999999 ? 999999 : tokenAmount,
          planId: planId === 'Pro Creator' ? 'pro' : planId === 'Enterprise Brand' ? 'enterprise' : 'free',
        }));
        setSuccessPlan(planId === 'Pro Creator' ? 'pro' : 'enterprise');
        setTimeout(() => setSuccessPlan(null), 4000);
      }
    } catch (e) {
      console.error('[useBillingState] Grant tokens error:', e);
    }
  }, [userId]);

  return {
    billingState,
    isLoading,
    checkoutLoading,
    successPlan,
    errorMessage,
    syncBillingState,
    initiateCheckout,
    cancelSubscription,
    grantTokensDirect,
    setBillingState,
  };
}
