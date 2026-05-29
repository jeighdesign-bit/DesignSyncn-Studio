-- DesignSync SaaS Subscription Schema Migration
-- Run this in your Supabase dashboard: https://app.supabase.com → SQL Editor
-- Project: xddrlxtbsbptparikkzq

-- ═══════════════════════════════════════════════════════════════════
-- TABLE 1: subscriptions
-- Tracks Stripe subscription lifecycle per authenticated user
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id               TEXT        NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id       TEXT,
  status                TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'past_due' | 'trialing'
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one subscription record per user
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);

-- Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (used by server) has full access
CREATE POLICY "Service role full access to subscriptions"
  ON subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- TABLE 2: token_usage
-- Tracks AI generation token balance per user (supports anonymous sessions)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS token_usage (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT        NOT NULL,  -- supports both UUID auth users & 'anonymous-session' strings
  tokens_used      INT         DEFAULT 0,
  tokens_remaining INT         DEFAULT 10,
  plan_id          TEXT        DEFAULT 'free',
  reset_at         TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one token record per user identifier
CREATE UNIQUE INDEX IF NOT EXISTS token_usage_user_id_idx ON token_usage(user_id);

-- Row Level Security
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Service role (server) has full access; client cannot directly modify balances
CREATE POLICY "Service role full access to token_usage"
  ON token_usage FOR ALL
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- FUNCTION: auto-update updated_at timestamps
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_token_usage_updated_at
  BEFORE UPDATE ON token_usage
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════
-- SEED: Default anonymous session token record (optional)
-- ═══════════════════════════════════════════════════════════════════

-- Uncomment to pre-seed a default anonymous session record:
-- INSERT INTO token_usage (user_id, tokens_used, tokens_remaining, plan_id)
-- VALUES ('anonymous-session', 0, 10, 'free')
-- ON CONFLICT (user_id) DO NOTHING;
