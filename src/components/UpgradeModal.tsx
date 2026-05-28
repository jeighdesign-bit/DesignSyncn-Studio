import React from 'react';
import { X, Sparkles, Check, Flame, ShieldCheck, Zap } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: (planName: string, tokenAmount: number) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, onSubscribe }) => {
  if (!isOpen) return null;

  const plans = [
    {
      name: 'Free Trial',
      price: '$0',
      period: 'forever',
      tokens: '10 tokens',
      description: 'Test the waters of AI-driven apparel styling.',
      features: [
        '10 Free AI Generations',
        '3D creased mockup masking',
        'Standard Sandbox Mode',
        'Standard JPEG Export'
      ],
      isPopular: false,
      ctaText: 'Current Plan',
      ctaDisabled: true,
      icon: <Zap className="text-gray-400" size={20} />
    },
    {
      name: 'Pro Creator',
      price: '$29',
      period: 'month',
      tokens: '500 tokens / mo',
      description: 'Ideal for designers, local leagues, and premium creators.',
      features: [
        '500 High-Fidelity AI generations',
        'Flux Schnell HD rendering',
        'Recraft Infinite SVG vector output',
        'Full custom sponsor logo slots',
        'Priority generation speed (under 3s)',
        'Pre-Flight compliance check access'
      ],
      isPopular: true,
      ctaText: 'Upgrade to Pro',
      ctaDisabled: false,
      icon: <Flame className="text-yellow-400 animate-pulse" size={20} />
    },
    {
      name: 'Enterprise Brand',
      price: '$89',
      period: 'month',
      tokens: 'Unlimited tokens',
      description: 'For apparel factories, sublimation shops, and professional teams.',
      features: [
        'Unlimited AI generations',
        'Dedicated custom sizing rules',
        ' Lossless 300 DPI SVG/PNG exports',
        'Exclusive Neon Sublimation ink checking',
        'Dedicated server queue priority',
        'Full Stripe integration & invoices'
      ],
      isPopular: false,
      ctaText: 'Go Unlimited',
      ctaDisabled: false,
      icon: <ShieldCheck className="text-blue-400 animate-bounce" size={20} />
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(3, 4, 8, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '24px',
      overflowY: 'auto'
    }}>
      <div style={{
        backgroundColor: '#070a13',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '920px',
        position: 'relative',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
        padding: '32px',
        animation: 'slideUp 0.3s ease-out'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#a1a1aa',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            e.currentTarget.style.color = '#f87171';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = '#a1a1aa';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>

        {/* Header Title */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(90deg, rgba(0, 112, 243, 0.15), rgba(0, 229, 255, 0.15))',
            border: '1px solid rgba(0, 112, 243, 0.3)',
            borderRadius: '20px',
            padding: '6px 16px',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#00e5ff',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '12px'
          }}>
            <Sparkles size={12} /> AI Creator Credits Limit
          </div>
          <h2 style={{
            fontSize: '28px',
            fontWeight: 800,
            color: '#fff',
            marginBottom: '8px',
            letterSpacing: '-0.02em'
          }}>
            Unlock Infinite Apparel Creativity
          </h2>
          <p style={{ color: '#8899a6', fontSize: '14px', maxWidth: '580px', margin: '0 auto', lineHeight: '1.5' }}>
            You've exhausted your free trial creation tokens. Upgrade to one of our premium plans to continue drafting stunning dye-sublimation masterpieces!
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
          marginBottom: '16px'
        }}>
          {plans.map((plan, idx) => (
            <div
              key={idx}
              style={{
                background: plan.isPopular ? 'linear-gradient(180deg, #091326 0%, #060914 100%)' : '#090b14',
                border: plan.isPopular ? '2px solid #0070f3' : '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: plan.isPopular ? '0 12px 32px rgba(0, 112, 243, 0.15)' : 'none'
              }}
            >
              {plan.isPopular && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0070f3',
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  letterSpacing: '0.08em'
                }}>
                  Most Popular
                </div>
              )}

              {/* Plan Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{plan.name}</span>
                {plan.icon}
              </div>

              {/* Pricing details */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '6px' }}>
                <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{plan.price}</span>
                <span style={{ fontSize: '12px', color: '#8899a6' }}>/ {plan.period}</span>
              </div>
              <div style={{
                fontSize: '11px',
                color: plan.isPopular ? '#00e5ff' : '#8899a6',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '16px'
              }}>
                {plan.tokens}
              </div>

              {/* Description */}
              <p style={{ fontSize: '12px', color: '#8899a6', marginBottom: '20px', lineHeight: '1.4', minHeight: '34px' }}>
                {plan.description}
              </p>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }} />

              {/* Features List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px', flex: 1 }}>
                {plan.features.map((feat, fidx) => (
                  <div key={fidx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Check size={13} style={{ color: '#00e676', marginTop: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '11.5px', color: '#b3c3d2', lineHeight: '1.4' }}>{feat}</span>
                  </div>
                ))}
              </div>

              {/* Subscribe CTA */}
              <button
                onClick={() => !plan.ctaDisabled && onSubscribe(plan.name, plan.name === 'Pro Creator' ? 500 : 999999)}
                disabled={plan.ctaDisabled}
                style={{
                  width: '100%',
                  background: plan.ctaDisabled ? 'rgba(255,255,255,0.03)' : (plan.isPopular ? '#0070f3' : 'rgba(255,255,255,0.06)'),
                  border: plan.ctaDisabled ? '1px solid rgba(255,255,255,0.02)' : (plan.isPopular ? '1px solid #0070f3' : '1px solid rgba(255,255,255,0.1)'),
                  color: plan.ctaDisabled ? '#495b6c' : '#fff',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: plan.ctaDisabled ? 'default' : 'pointer',
                  transition: 'background 0.2s, transform 0.1s'
                }}
                onMouseEnter={(e) => {
                  if (!plan.ctaDisabled) {
                    e.currentTarget.style.background = plan.isPopular ? '#005ed6' : 'rgba(255,255,255,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!plan.ctaDisabled) {
                    e.currentTarget.style.background = plan.isPopular ? '#0070f3' : 'rgba(255,255,255,0.06)';
                  }
                }}
              >
                {plan.ctaText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
