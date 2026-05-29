// ─── DesignSync Subscription Type Definitions ─────────────────────────────────

export type PlanId = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  period: string;
  tokens: string;
  tokenCount: number;
  tokenLabel: string;
  description: string;
  features: string[];
  isPopular: boolean;
  ctaText: string;
  ctaActivatedText: string;
  accentColor: string;
  glowColor: string;
  borderColor: string;
}

export interface BillingState {
  planId: PlanId;
  status: SubscriptionStatus;
  tokensRemaining: number;
  tokensTotal: number;
  periodEnd?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    period: 'forever',
    tokens: '10 TOKENS',
    tokenCount: 10,
    tokenLabel: '10 tokens',
    description: 'Test the waters of AI-driven apparel styling.',
    features: [
      '10 Free AI Generations',
      '3D creased mockup masking',
      'Standard Sandbox Mode',
      'Standard JPEG Export',
    ],
    isPopular: false,
    ctaText: 'Current Plan',
    ctaActivatedText: 'Current Plan',
    accentColor: '#6b7280',
    glowColor: 'rgba(107, 114, 128, 0.15)',
    borderColor: 'rgba(107, 114, 128, 0.25)',
  },
  {
    id: 'pro',
    name: 'Pro Creator',
    price: 29,
    period: 'month',
    tokens: '500 TOKENS / MO',
    tokenCount: 500,
    tokenLabel: '500 tokens/mo',
    description: 'Ideal for designers, local leagues, and premium creators.',
    features: [
      '500 High-Fidelity AI generations',
      'Flux Schnell HD rendering',
      'Recraft Infinite SVG vector output',
      'Full custom sponsor logo slots',
      'Priority generation speed (under 3s)',
      'Pre-Flight compliance check access',
    ],
    isPopular: true,
    ctaText: 'Upgrade to Pro',
    ctaActivatedText: 'Pro Active ✓',
    accentColor: '#0070f3',
    glowColor: 'rgba(0, 112, 243, 0.25)',
    borderColor: '#0070f3',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Brand',
    price: 89,
    period: 'month',
    tokens: 'UNLIMITED TOKENS',
    tokenCount: 999999,
    tokenLabel: 'Unlimited',
    description: 'For apparel factories, sublimation shops, and professional teams.',
    features: [
      'Unlimited AI generations',
      'Dedicated custom sizing rules',
      'Lossless 300 DPI SVG/PNG exports',
      'Exclusive Neon Sublimation ink checking',
      'Dedicated server queue priority',
      'Full Stripe integration & invoices',
    ],
    isPopular: false,
    ctaText: 'Go Unlimited',
    ctaActivatedText: 'Enterprise Active ✓',
    accentColor: '#7c3aed',
    glowColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: 'rgba(124, 58, 237, 0.6)',
  },
];
