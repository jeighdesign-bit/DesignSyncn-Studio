import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, Flame, ShieldCheck, Zap, X, TrendingUp, AlertCircle, ExternalLink } from 'lucide-react';
import { PLANS } from '../lib/subscriptionTypes';
import type { PlanId, BillingState } from '../lib/subscriptionTypes';

// ─── Spinner SVG ──────────────────────────────────────────────────────────────
const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#fff' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    style={{ animation: 'ds-spin 0.7s linear infinite', flexShrink: 0 }}
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

// ─── Token Usage Bar ─────────────────────────────────────────────────────────
const TokenBar: React.FC<{ remaining: number; total: number; planId: PlanId }> = ({
  remaining, total, planId
}) => {
  const isUnlimited = total >= 999999 || planId === 'enterprise';
  const pct = isUnlimited ? 100 : Math.max(0, Math.min(100, (remaining / Math.max(total, 1)) * 100));
  const lowTokens = !isUnlimited && pct < 25;
  const barColor = isUnlimited
    ? '#7c3aed'
    : lowTokens
      ? '#ef4444'
      : pct < 60
        ? '#f59e0b'
        : '#00e676';

  return (
    <div style={{ width: '100%', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: '#8899a6', fontFamily: 'monospace', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          AI Generation Credits
        </span>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'monospace',
          color: barColor,
          letterSpacing: '0.04em'
        }}>
          {isUnlimited ? '∞ UNLIMITED' : `${remaining} / ${total} left`}
        </span>
      </div>
      <div style={{
        height: '5px',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '99px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
          borderRadius: '99px',
          transition: 'width 0.5s ease',
          boxShadow: `0 0 8px ${barColor}66`,
        }} />
      </div>
      {lowTokens && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px' }}>
          <AlertCircle size={10} color="#ef4444" />
          <span style={{ fontSize: '10px', color: '#ef4444', fontFamily: 'monospace' }}>
            Low credits — upgrade to continue generating
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Plan Icon Map ─────────────────────────────────────────────────────────────
const PLAN_ICONS: Record<PlanId, React.ReactNode> = {
  free: <Zap size={18} color="#6b7280" />,
  pro: <Flame size={18} color="#f59e0b" style={{ filter: 'drop-shadow(0 0 6px #f59e0b)' }} />,
  enterprise: <ShieldCheck size={18} color="#7c3aed" style={{ filter: 'drop-shadow(0 0 6px #7c3aed)' }} />,
};

// ─── Success Checkmark Animation ─────────────────────────────────────────────
const SuccessBadge: React.FC<{ planName: string }> = ({ planName }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    animation: 'ds-fadeUp 0.4s ease-out',
  }}>
    <div style={{
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #00e676, #00bcd4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 0 24px rgba(0, 230, 118, 0.5)',
      animation: 'ds-popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <Check size={24} color="#fff" strokeWidth={3} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Plan Activated!</div>
      <div style={{ fontSize: '11px', color: '#00e676', marginTop: '2px' }}>{planName} is now live</div>
    </div>
  </div>
);

// ─── Pricing Card ─────────────────────────────────────────────────────────────
interface PricingCardProps {
  plan: typeof PLANS[number];
  billingState: BillingState;
  checkoutLoading: PlanId | null;
  successPlan: PlanId | null;
  onCheckout: (planId: PlanId) => void;
  onManageBilling?: () => void;
}

const PricingCard: React.FC<PricingCardProps> = ({
  plan, billingState, checkoutLoading, successPlan, onCheckout, onManageBilling
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isCurrentPlan = billingState.planId === plan.id;
  const isLoading = checkoutLoading === plan.id;
  const isAnyLoading = checkoutLoading !== null;
  const isSuccess = successPlan === plan.id;
  const canUpgrade = !isCurrentPlan && plan.id !== 'free';
  const isPro = plan.id === 'pro';
  const isEnterprise = plan.id === 'enterprise';

  // Dynamic border based on state
  const getBorder = () => {
    if (isCurrentPlan) return `2px solid ${plan.accentColor}`;
    if (isHovered && canUpgrade) return `2px solid ${plan.accentColor}99`;
    if (plan.isPopular) return `2px solid #0070f3`;
    return '1px solid rgba(255, 255, 255, 0.06)';
  };

  const getBackground = () => {
    if (isCurrentPlan) {
      if (isPro) return 'linear-gradient(180deg, #091a36 0%, #060914 100%)';
      if (isEnterprise) return 'linear-gradient(180deg, #12083a 0%, #060914 100%)';
      return 'linear-gradient(180deg, #111820 0%, #090b14 100%)';
    }
    if (isHovered && canUpgrade) {
      if (isPro) return 'linear-gradient(180deg, #091a36 0%, #060914 100%)';
      if (isEnterprise) return 'linear-gradient(180deg, #12083a 0%, #060914 100%)';
    }
    if (plan.isPopular) return 'linear-gradient(180deg, #091326 0%, #060914 100%)';
    return '#090b14';
  };

  const getBoxShadow = () => {
    if (isCurrentPlan || (isHovered && canUpgrade)) {
      return `0 16px 48px ${plan.glowColor}, 0 0 0 1px ${plan.accentColor}22`;
    }
    if (plan.isPopular) return '0 12px 32px rgba(0, 112, 243, 0.12)';
    return 'none';
  };

  // CTA button render
  const renderCTA = () => {
    if (isCurrentPlan && plan.id === 'free') {
      return (
        <button disabled style={ctaStyles.current}>
          Current Plan
        </button>
      );
    }

    if (isCurrentPlan) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button disabled style={ctaStyles.active(plan.accentColor)}>
            <Check size={13} style={{ flexShrink: 0 }} />
            {plan.ctaActivatedText}
          </button>
          {onManageBilling && (
            <button
              onClick={onManageBilling}
              style={ctaStyles.manage}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLButtonElement).style.color = '#8899a6';
              }}
            >
              <ExternalLink size={11} />
              Manage Billing
            </button>
          )}
        </div>
      );
    }

    if (isSuccess) {
      return (
        <button disabled style={{ ...ctaStyles.success, animation: 'ds-popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <Check size={14} strokeWidth={3} />
          Activated!
        </button>
      );
    }

    if (plan.id === 'free') {
      return (
        <button disabled style={ctaStyles.current}>
          Current Plan
        </button>
      );
    }

    return (
      <button
        onClick={() => onCheckout(plan.id)}
        disabled={isAnyLoading}
        style={{
          ...ctaStyles.upgrade(plan.id, isLoading, isHovered, plan.accentColor),
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isHovered && !isLoading ? 'translateY(-1px) scale(1.01)' : 'none',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isLoading ? (
          <>
            <Spinner size={14} />
            Processing...
          </>
        ) : (
          <>
            <TrendingUp size={14} style={{ flexShrink: 0 }} />
            {plan.ctaText}
          </>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        background: getBackground(),
        border: getBorder(),
        borderRadius: '14px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: getBoxShadow(),
        transform: (isHovered && canUpgrade) ? 'translateY(-5px)' : 'none',
        cursor: canUpgrade ? 'pointer' : 'default',
        overflow: 'visible',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => { if (canUpgrade && !isAnyLoading) onCheckout(plan.id); }}
    >
      {/* Most Popular badge */}
      {plan.isPopular && !isCurrentPlan && (
        <div style={{
          position: 'absolute',
          top: '-13px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(90deg, #0070f3, #00bcd4)',
          color: '#fff',
          fontSize: '9px',
          fontWeight: 800,
          textTransform: 'uppercase',
          padding: '4px 14px',
          borderRadius: '12px',
          letterSpacing: '0.1em',
          boxShadow: '0 4px 12px rgba(0, 112, 243, 0.35)',
          whiteSpace: 'nowrap',
        }}>
          Most Popular
        </div>
      )}

      {/* Current Plan badge */}
      {isCurrentPlan && (
        <div style={{
          position: 'absolute',
          top: '-13px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: `linear-gradient(90deg, ${plan.accentColor}, ${plan.accentColor}cc)`,
          color: '#fff',
          fontSize: '9px',
          fontWeight: 800,
          textTransform: 'uppercase',
          padding: '4px 14px',
          borderRadius: '12px',
          letterSpacing: '0.1em',
          boxShadow: `0 4px 12px ${plan.glowColor}`,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <Check size={9} strokeWidth={3} /> Active Plan
        </div>
      )}

      {/* Plan Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: isCurrentPlan ? '#fff' : '#e2e8f0' }}>
          {plan.name}
        </span>
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '10px',
          background: `${plan.accentColor}18`,
          border: `1px solid ${plan.accentColor}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.25s ease',
          boxShadow: isHovered ? `0 0 12px ${plan.glowColor}` : 'none',
        }}>
          {PLAN_ICONS[plan.id]}
        </div>
      </div>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '36px',
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          fontFamily: 'Outfit, sans-serif',
        }}>
          ${plan.price}
        </span>
        <span style={{ fontSize: '12px', color: '#8899a6', fontWeight: 500 }}>
          / {plan.period}
        </span>
      </div>

      {/* Token label */}
      <div style={{
        fontSize: '10.5px',
        color: plan.id === 'free' ? '#6b7280' : plan.accentColor,
        fontWeight: 700,
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        {plan.tokens}
      </div>

      {/* Description */}
      <p style={{
        fontSize: '12px',
        color: '#8899a6',
        marginBottom: '16px',
        lineHeight: '1.5',
        minHeight: '36px',
      }}>
        {plan.description}
      </p>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }} />

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '22px', flex: 1 }}>
        {plan.features.map((feat, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: `${plan.accentColor}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '1px',
            }}>
              <Check size={9} color={plan.id === 'free' ? '#6b7280' : '#00e676'} strokeWidth={3} />
            </div>
            <span style={{ fontSize: '11.5px', color: '#b3c3d2', lineHeight: '1.45' }}>
              {feat.trim()}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div onClick={e => e.stopPropagation()}>
        {renderCTA()}
      </div>
    </div>
  );
};

// ─── CTA Button Styles ───────────────────────────────────────────────────────
const ctaStyles = {
  current: {
    width: '100%',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#495b6c',
    padding: '11px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'default',
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  active: (accentColor: string) => ({
    width: '100%',
    background: `${accentColor}18`,
    border: `1px solid ${accentColor}44`,
    color: accentColor,
    padding: '11px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    letterSpacing: '0.02em',
  } as React.CSSProperties),

  upgrade: (planId: PlanId, isLoading: boolean, isHovered: boolean, accentColor: string) => {
    const base = {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 700,
      cursor: isLoading ? 'default' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '7px',
      letterSpacing: '0.01em',
      border: 'none',
    } as React.CSSProperties;

    if (planId === 'pro') {
      return {
        ...base,
        background: isLoading
          ? '#0055c4'
          : isHovered
            ? 'linear-gradient(135deg, #005ed6, #0099e6)'
            : 'linear-gradient(135deg, #0070f3, #00bcd4)',
        color: '#fff',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 112, 243, 0.5), 0 0 0 1px rgba(0, 112, 243, 0.3)'
          : '0 4px 14px rgba(0, 112, 243, 0.3)',
      };
    }

    return {
      ...base,
      background: isLoading
        ? `${accentColor}44`
        : isHovered
          ? `${accentColor}cc`
          : `${accentColor}99`,
      color: '#fff',
      border: `1px solid ${accentColor}66`,
      boxShadow: isHovered
        ? `0 8px 24px ${accentColor}44`
        : `0 4px 14px ${accentColor}22`,
    };
  },

  manage: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#8899a6',
    padding: '8px 16px',
    borderRadius: '7px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  success: {
    width: '100%',
    background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.2), rgba(0, 188, 212, 0.2))',
    border: '1px solid rgba(0, 230, 118, 0.4)',
    color: '#00e676',
    padding: '11px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
};

// ─── Main UpgradeModal Component ───────────────────────────────────────────────
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Legacy compatibility
  onSubscribe?: (planName: string, tokenAmount: number) => void;
  // New props from useBillingState
  billingState?: BillingState;
  checkoutLoading?: PlanId | null;
  successPlan?: PlanId | null;
  errorMessage?: string | null;
  onCheckout?: (planId: PlanId) => void;
  onManageBilling?: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onSubscribe,
  billingState,
  checkoutLoading = null,
  successPlan = null,
  errorMessage = null,
  onCheckout,
  onManageBilling,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const t = setTimeout(() => setIsVisible(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  // Default billing state for legacy usage
  const activeBillingState: BillingState = billingState || {
    planId: 'free',
    status: 'active',
    tokensRemaining: 10,
    tokensTotal: 10,
  };

  // Handle checkout — supports both new and legacy modes
  const handleCheckout = (planId: PlanId) => {
    if (onCheckout) {
      onCheckout(planId);
    } else if (onSubscribe) {
      // Legacy: directly call onSubscribe
      const plan = PLANS.find(p => p.id === planId);
      if (plan) onSubscribe(plan.name, plan.tokenCount);
    }
  };

  // Find the current active plan name for success banner
  const activePlanName = PLANS.find(p => p.id === successPlan)?.name || '';
  const currentPlan = PLANS.find(p => p.id === activeBillingState.planId);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <>
      {/* ── Keyframe Animations ── */}
      <style>{`
        @keyframes ds-spin { to { transform: rotate(360deg); } }
        @keyframes ds-slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ds-fadeOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(12px) scale(0.97); }
        }
        @keyframes ds-fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ds-popIn {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes ds-overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ds-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* ── Backdrop ── */}
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(3, 4, 8, 0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
          overflowY: 'auto',
          animation: isOpen ? 'ds-overlayIn 0.2s ease-out' : 'none',
        }}
      >
        {/* ── Modal Panel ── */}
        <div
          style={{
            backgroundColor: '#070a13',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '960px',
            position: 'relative',
            boxShadow: '0 32px 80px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255,255,255,0.04)',
            padding: '36px 32px 32px',
            animation: isOpen ? 'ds-slideUp 0.35s cubic-bezier(0.34, 1.06, 0.64, 1)' : 'ds-fadeOut 0.25s ease-in',
          }}
        >
          {/* ── Close Button ── */}
          <button
            id="upgrade-modal-close"
            onClick={onClose}
            aria-label="Close pricing modal"
            style={{
              position: 'absolute',
              top: '18px',
              right: '18px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#8899a6',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              zIndex: 10,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.16)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.35)';
              (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
              (e.currentTarget as HTMLButtonElement).style.color = '#8899a6';
            }}
          >
            <X size={15} />
          </button>

          {/* ── Header ── */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            {/* Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: 'linear-gradient(90deg, rgba(0, 112, 243, 0.12), rgba(0, 229, 255, 0.12))',
              border: '1px solid rgba(0, 112, 243, 0.25)',
              borderRadius: '99px',
              padding: '5px 14px',
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#00e5ff',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '16px',
            }}>
              <Sparkles size={11} />
              AI Creator Credits
            </div>

            <h2 style={{
              fontSize: 'clamp(22px, 4vw, 30px)',
              fontWeight: 800,
              color: '#fff',
              marginBottom: '10px',
              letterSpacing: '-0.025em',
              fontFamily: 'Outfit, sans-serif',
              lineHeight: 1.15,
            }}>
              Unlock Infinite Apparel Creativity
            </h2>
            <p style={{
              color: '#8899a6',
              fontSize: '13px',
              maxWidth: '560px',
              margin: '0 auto',
              lineHeight: '1.6',
            }}>
              {activeBillingState.tokensRemaining <= 0
                ? "You've exhausted your creation tokens. Upgrade to continue drafting stunning dye-sublimation masterpieces."
                : `You're on the ${currentPlan?.name} — ${activeBillingState.tokensRemaining === 999999 ? 'unlimited credits' : `${activeBillingState.tokensRemaining} credits remaining`}.`
              }
            </p>

            {/* Token Usage Bar */}
            <div style={{ maxWidth: '420px', margin: '16px auto 0' }}>
              <TokenBar
                remaining={activeBillingState.tokensRemaining}
                total={activeBillingState.tokensTotal}
                planId={activeBillingState.planId}
              />
            </div>
          </div>

          {/* ── Global Success Banner ── */}
          {successPlan && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.08), rgba(0, 188, 212, 0.08))',
              border: '1px solid rgba(0, 230, 118, 0.2)',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'ds-fadeUp 0.4s ease-out',
            }}>
              <SuccessBadge planName={activePlanName} />
            </div>
          )}

          {/* ── Error Banner ── */}
          {errorMessage && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              animation: 'ds-fadeUp 0.3s ease-out',
            }}>
              <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', color: '#f87171', lineHeight: 1.4 }}>
                {errorMessage}
              </span>
            </div>
          )}

          {/* ── Pricing Cards Grid ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: '20px',
            marginBottom: '24px',
          }}>
            {PLANS.map(plan => (
              <PricingCard
                key={plan.id}
                plan={plan}
                billingState={activeBillingState}
                checkoutLoading={checkoutLoading}
                successPlan={successPlan}
                onCheckout={handleCheckout}
                onManageBilling={onManageBilling}
              />
            ))}
          </div>

          {/* ── Footer ── */}
          <div style={{
            textAlign: 'center',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Secured by Stripe', '·', 'Cancel anytime', '·', '256-bit SSL encrypted'].map((item, i) => (
                <span key={i} style={{
                  fontSize: '11px',
                  color: item === '·' ? '#374151' : '#4b5563',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  {item === 'Secured by Stripe' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  )}
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
