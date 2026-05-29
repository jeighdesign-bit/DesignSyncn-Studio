import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowRight, Play, Sparkles, Layers, Sliders, Download,
  FileText, Zap, CheckCircle, ChevronDown, Star, Users, Cpu, Globe,
  Check, Flame, ShieldCheck, TrendingUp
} from 'lucide-react';
import { PLANS } from '../lib/subscriptionTypes';


interface LandingPageProps {
  session: Session | null;
  onEnterWorkspace: () => void;
  onShowAuth: () => void;
  onSignOut: () => void;
  onSelectPlan?: (planName: string, tokenAmount: number) => void;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: <Sparkles size={20} />,
    tag: 'AI GENERATION',
    title: 'Prompt-to-Garment AI Designer',
    desc: 'Type a concept, get a full sublimation pattern. Supports reference images, esports-ready style presets, and real-time texture mapping.',
    preview: 'ai',
  },
  {
    icon: <Sliders size={20} />,
    tag: 'PRODUCTION STUDIO',
    title: 'Photoshop-Grade Edit Environment',
    desc: 'Rulers, guides, real measurement layers, and a full layer stack — all calibrated in inches for print-room precision.',
    preview: 'studio',
  },
  {
    icon: <Layers size={20} />,
    tag: 'FULL LAYOUT SYSTEM',
    title: 'Front / Back / Sleeve Layout Engine',
    desc: 'Arrange your full garment in a single workspace. Front, back, sleeves, collar — all production-mapped and export-ready.',
    preview: 'layout',
  },
  {
    icon: <Zap size={20} />,
    tag: 'AUTOMATION ENGINE',
    title: 'Smart Roster & Logo Automation',
    desc: 'Upload a CSV roster. DesignSync auto-places names, numbers, and logos — scaled and aligned per your production rules.',
    preview: 'roster',
  },
  {
    icon: <FileText size={20} />,
    tag: 'PROJECT SYSTEM',
    title: 'Cloud Workspace & Project Hub',
    desc: 'Multi-project dashboard, autosave, reusable templates, and Supabase-powered cloud sync across your entire team.',
    preview: 'cloud',
  },
  {
    icon: <Download size={20} />,
    tag: 'EXPORT ENGINE',
    title: 'Pre-Flight Checks & Print-Ready Export',
    desc: 'Automatic DPI validation (300+), CMYK conversion checks, and one-click SVG/PDF blueprint export for your print partner.',
    preview: 'export',
  },
];

const steps = [
  { num: '01', title: 'Create Project', desc: 'Name your garment, pick the apparel type, set canvas size & DPI.' },
  { num: '02', title: 'Generate Design', desc: 'Describe your pattern. AI synthesizes textures and maps them to panels.' },
  { num: '03', title: 'Customize Layout', desc: 'Fine-tune layers, place logos, adjust production rules and measurements.' },
  { num: '04', title: 'Prepare Production', desc: 'Upload your roster CSV. Names and numbers auto-scale and align.' },
  { num: '05', title: 'Export Print-Ready Files', desc: 'Run pre-flight checks and download CMYK-ready SVG / PDF blueprints.' },
];

const garments = [
  { name: 'Esports Jersey', icon: '🎮', color: '#0070f3' },
  { name: 'Basketball Jersey', icon: '🏀', color: '#f5a623' },
  { name: 'Hoodie', icon: '👕', color: '#7928ca' },
  { name: 'Polo Shirt', icon: '🏌️', color: '#00e676' },
  { name: 'Long Sleeve', icon: '🦺', color: '#ff0055' },
  { name: 'Compression Wear', icon: '⚡', color: '#3291ff' },
];

const testimonials = [
  { quote: 'Reduced our sublimation production prep time by 70%. What used to take 2 days now takes 3 hours.', name: 'Marcus T.', role: 'Head of Production, StrikeWear PH', rating: 5 },
  { quote: 'The roster automation alone is worth it. 50 jerseys, all names auto-placed and scaled. Zero manual work.', name: 'Andrea L.', role: 'Creative Director, Apex Apparel', rating: 5 },
  { quote: 'Finally a tool that understands sublimation. Real measurements, CMYK support, and AI that actually gets esports aesthetics.', name: 'Kyle R.', role: 'Team Lead, NovaSub Studios', rating: 5 },
];

const faqs = [
  { q: 'Can I export print-ready files?', a: 'Yes. DesignSync exports production-ready SVG and PDF blueprints with embedded measurement guides, calibrated at your target DPI.' },
  { q: 'Does this support sublimation printing workflows?', a: 'Absolutely. The entire platform is built around sublimation production — from CMYK color modes to real-inch measurement rules for every panel.' },
  { q: 'Can I upload my own templates?', a: 'Yes. You can upload your own flat garment templates and the AI will map generated patterns onto your exact panel shapes.' },
  { q: 'Can I automate team rosters?', a: 'Yes. Upload a CSV with player names, numbers, and sizes. DesignSync auto-places, scales, and aligns each entry per your production rules.' },
  { q: 'Will CMYK export be fully supported?', a: 'CMYK color mode is already available for project setup. Full end-to-end CMYK export pipeline is on the Q3 roadmap.' },
];

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap size={18} color="#6b7280" />,
  pro: <Flame size={18} color="#f59e0b" style={{ filter: 'drop-shadow(0 0 6px #f59e0b)' }} />,
  enterprise: <ShieldCheck size={18} color="#7c3aed" style={{ filter: 'drop-shadow(0 0 6px #7c3aed)' }} />,
};

interface LandingPricingCardProps {
  plan: typeof PLANS[number];
  onSelect: (planName: string) => void;
}

const LandingPricingCard: React.FC<LandingPricingCardProps> = ({ plan, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isPro = plan.id === 'pro';
  const isEnterprise = plan.id === 'enterprise';
  const isFree = plan.id === 'free';

  const getBorder = () => {
    if (isHovered) return `2px solid ${plan.accentColor}99`;
    if (plan.isPopular) return `2px solid #0070f3`;
    return '1px solid rgba(255, 255, 255, 0.06)';
  };

  const getBackground = () => {
    if (isHovered) {
      if (isPro) return 'linear-gradient(180deg, #091a36 0%, #060914 100%)';
      if (isEnterprise) return 'linear-gradient(180deg, #12083a 0%, #060914 100%)';
      return 'linear-gradient(180deg, #111820 0%, #090b14 100%)';
    }
    if (plan.isPopular) return 'linear-gradient(180deg, #091326 0%, #060914 100%)';
    return '#090b14';
  };

  const getBoxShadow = () => {
    if (isHovered) {
      return `0 16px 48px ${plan.glowColor}, 0 0 0 1px ${plan.accentColor}22`;
    }
    if (plan.isPopular) return '0 12px 32px rgba(0, 112, 243, 0.12)';
    return 'none';
  };

  const getCtaStyle = () => {
    const base: React.CSSProperties = {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '7px',
      letterSpacing: '0.01em',
      border: 'none',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: isHovered ? 'translateY(-1px) scale(1.01)' : 'none',
      marginTop: 'auto',
    };

    if (isPro) {
      return {
        ...base,
        background: isHovered
          ? 'linear-gradient(135deg, #005ed6, #0099e6)'
          : 'linear-gradient(135deg, #0070f3, #00bcd4)',
        color: '#fff',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 112, 243, 0.5), 0 0 0 1px rgba(0, 112, 243, 0.3)'
          : '0 4px 14px rgba(0, 112, 243, 0.3)',
      };
    }

    if (isFree) {
      return {
        ...base,
        background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isHovered ? '0 4px 12px rgba(255, 255, 255, 0.05)' : 'none',
      };
    }

    return {
      ...base,
      background: isHovered
        ? `${plan.accentColor}cc`
        : `${plan.accentColor}99`,
      color: '#fff',
      border: `1px solid ${plan.accentColor}66`,
      boxShadow: isHovered
        ? `0 8px 24px ${plan.accentColor}44`
        : `0 4px 14px ${plan.accentColor}22`,
    };
  };

  return (
    <div
      style={{
        background: getBackground(),
        border: getBorder(),
        borderRadius: '14px',
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: getBoxShadow(),
        transform: isHovered ? 'translateY(-5px)' : 'none',
        cursor: 'pointer',
        overflow: 'visible',
        textAlign: 'left',
        minHeight: '440px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(plan.name)}
    >
      {/* Most Popular badge */}
      {plan.isPopular && (
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
          zIndex: 2,
        }}>
          Most Popular
        </div>
      )}

      {/* Plan Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
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
        {plan.features.map((feat, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
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
      <button style={getCtaStyle()}>
        {isFree ? (
          'Get Started Free'
        ) : (
          <>
            <TrendingUp size={14} style={{ flexShrink: 0 }} />
            {isPro ? 'Upgrade to Pro' : 'Go Unlimited'}
          </>
        )}
      </button>
    </div>
  );
};


// ─── Feature Preview Components ────────────────────────────────────────────────

function FeaturePreview({ type }: { type: string }) {
  if (type === 'ai') return (
    <div className="lp-card-preview">
      <div className="lp-terminal-line"><span className="lp-prompt">&gt;</span> generate &quot;cyber hexgrid neon esports pattern&quot;</div>
      <div className="lp-progress-track"><div className="lp-progress-fill" style={{ width: '75%' }} /></div>
      <div className="lp-terminal-line dim">↳ Synthesizing texture layers... 75%</div>
      <div className="lp-color-swatches">
        <span className="lp-swatch" style={{ background: '#0070f3' }} />
        <span className="lp-swatch" style={{ background: '#7928ca' }} />
        <span className="lp-swatch" style={{ background: '#00e676' }} />
        <span className="lp-swatch" style={{ background: '#ff0055' }} />
      </div>
    </div>
  );
  if (type === 'studio') return (
    <div className="lp-card-preview">
      <div className="lp-ruler-row"><div className="lp-ruler-tick" /><div className="lp-ruler-tick" /><div className="lp-ruler-tick" /><div className="lp-ruler-tick" /><div className="lp-ruler-tick" /></div>
      <div className="lp-layer-row"><span className="lp-layer-dot blue" />Front Panel<span className="lp-layer-badge">300 DPI</span></div>
      <div className="lp-layer-row"><span className="lp-layer-dot purple" />Logo Layer<span className="lp-layer-badge">Locked</span></div>
      <div className="lp-layer-row"><span className="lp-layer-dot green" />Player Names<span className="lp-layer-badge">Auto-Scale</span></div>
    </div>
  );
  if (type === 'layout') return (
    <div className="lp-card-preview lp-layout-preview">
      <div className="lp-panel active">FRONT</div>
      <div className="lp-panel">BACK</div>
      <div className="lp-panel sm">L.SLV</div>
      <div className="lp-panel sm">R.SLV</div>
    </div>
  );
  if (type === 'roster') return (
    <div className="lp-card-preview">
      <div className="lp-roster-row"><span>JAY</span><span className="blue">#7</span><span className="green">✓ 100%</span></div>
      <div className="lp-roster-row"><span>RODRIGUEZ</span><span className="blue">#14</span><span className="warn">⚡ 82%</span></div>
      <div className="lp-roster-row"><span>CHEN</span><span className="blue">#21</span><span className="green">✓ 100%</span></div>
      <div className="lp-roster-row dim"><span>+47 more players auto-mapped</span></div>
    </div>
  );
  if (type === 'cloud') return (
    <div className="lp-card-preview">
      <div className="lp-cloud-row"><Globe size={10} /><span>Synced to cloud</span><span className="green">Live</span></div>
      <div className="lp-cloud-row"><Cpu size={10} /><span>Esports Championship Jersey</span><span className="dim">Saved 2s ago</span></div>
      <div className="lp-cloud-row"><Users size={10} /><span>Retro Vaporwave Sweatshirt</span><span className="dim">Draft</span></div>
    </div>
  );
  if (type === 'export') return (
    <div className="lp-card-preview">
      <div className="lp-export-badge ok">✓ Pre-flight: PASSED</div>
      <div className="lp-check-row"><CheckCircle size={10} color="#00e676" />DPI: 300 — High Res</div>
      <div className="lp-check-row"><CheckCircle size={10} color="#00e676" />Color mode: CMYK</div>
      <div className="lp-check-row"><CheckCircle size={10} color="#00e676" />Bleed: 0.25" — Ready</div>
    </div>
  );
  return null;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LandingPage({ session, onEnterWorkspace, onShowAuth, onSignOut, onSelectPlan }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const handlePrimary = () => session ? onEnterWorkspace() : onShowAuth();

  const handleSelectPlanCard = (planName: string) => {
    const tokenAmount = planName === 'Pro Creator' ? 500 : planName === 'Enterprise Brand' ? 999999 : 10;
    if (onSelectPlan) {
      onSelectPlan(planName, tokenAmount);
    }
    // If not logged in, we can save the plan choice to localStorage
    if (!session) {
      localStorage.setItem('ds_pending_subscription_plan', planName);
      localStorage.setItem('ds_pending_subscription_tokens', String(tokenAmount));
      handlePrimary();
    }
  };

  return (
    <div className="lp-root">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
          <img
            src="/DesignSync Logo.png"
            alt="DesignSync"
            width="44"
            height="44"
            style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(255, 78, 48, 0.5))' }}
          />
        </div>
        
        <div className="lp-nav-links">
          <a href="#features" className="lp-nav-link-dropdown">
            Product <ChevronDown size={12} className="lp-nav-chevron" />
          </a>
          <a href="#templates" className="lp-nav-link-dropdown">
            Garments <ChevronDown size={12} className="lp-nav-chevron" />
          </a>
          <a href="#pricing">Pricing</a>
          <a href="#how" className="lp-nav-link-dropdown">
            Docs <ChevronDown size={12} className="lp-nav-chevron" />
          </a>
        </div>
        
        <div className="lp-nav-actions">
          {session ? (
            <div className="lp-nav-user-pill">
              <div className="lp-nav-avatar" onClick={onEnterWorkspace} title="Go to Dashboard">
                {session.user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="lp-nav-user-info" onClick={onEnterWorkspace}>
                <span className="lp-nav-user-email">{session.user?.email}</span>
                <span className="lp-nav-user-role">Pro Workspace</span>
              </div>
              <button className="lp-nav-signout-btn" onClick={onSignOut} title="Sign Out">
                Sign out
              </button>
            </div>
          ) : (
            <>
              <button className="lp-btn-ghost" onClick={onShowAuth}>Log In</button>
              <button className="lp-btn-primary" onClick={onShowAuth}>
                Get Started <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-glow lp-glow-blue" />
        <div className="lp-hero-glow lp-glow-purple" />
        
        {/* Floating Assets */}
        <div className="lp-floating-asset lp-asset-blueprint">
          <div className="lp-app-canvas blueprint-grid" style={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
            <svg viewBox="0 0 140 160" className="lp-jersey-svg">
              <path d="M 28,28 C 45,15 95,15 112,28 L 125,115 L 112,122 L 112,148 L 28,148 L 28,122 L 15,115 Z" fill="rgba(0,112,243,0.08)" stroke="#0070f3" strokeWidth="1.5" />
              <path d="M 55,28 Q 70,18 85,28" fill="none" stroke="#7928ca" strokeWidth="1.5" />
              <line x1="28" y1="45" x2="15" y2="80" stroke="#0070f3" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5"/>
              <line x1="112" y1="45" x2="125" y2="80" stroke="#0070f3" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5"/>
              <rect x="52" y="70" width="36" height="40" fill="none" stroke="#0070f3" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.6" rx="1"/>
              <text x="70" y="96" fill="#0070f3" fontSize="18" textAnchor="middle" fontFamily="Outfit" fontWeight="800" opacity="0.9">7</text>
            </svg>
          </div>
        </div>

        <div className="lp-floating-asset lp-asset-card">
          <div className="lp-app-frame" style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
            <div className="lp-app-topbar">
              <div className="lp-dot red" /><div className="lp-dot yellow" /><div className="lp-dot green" />
              <span className="lp-app-title" style={{ fontSize: '10px' }}>roster_sync.csv</span>
            </div>
            <div className="lp-app-body" style={{ padding: '12px', background: '#0a0a0c' }}>
              <div className="lp-rule-row" style={{ fontSize: '11px', marginBottom: '8px' }}><span>JAY #7</span><span className="green">✓ 100%</span></div>
              <div className="lp-rule-row" style={{ fontSize: '11px', marginBottom: '8px' }}><span>MARK #10</span><span className="green">✓ 100%</span></div>
              <div className="lp-rule-row" style={{ fontSize: '11px' }}><span>LEX #23</span><span className="green">✓ 100%</span></div>
            </div>
          </div>
        </div>

        <div className="lp-floating-asset lp-asset-palette">
          <div className="lp-card-preview" style={{ background: '#0a0a0c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
            <div className="lp-layer-row"><span className="lp-layer-dot blue" />Front Panel<span className="lp-layer-badge">300 DPI</span></div>
            <div className="lp-layer-row"><span className="lp-layer-dot purple" />Logo Layer<span className="lp-layer-badge">Locked</span></div>
            <div className="lp-layer-row"><span className="lp-layer-dot green" />Player Names<span className="lp-layer-badge">Auto-Scale</span></div>
          </div>
        </div>

        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <Sparkles size={12} /> Used by 5,000+ teams worldwide
          </div>
          <h1 className="lp-hero-h1">
            From Design<br />
            <span className="lp-gradient-text">to Production.</span>
          </h1>
          <p className="lp-hero-sub">
            The professional sublimation workspace for design teams. Generate AI garment patterns, customize layouts with real production measurements, automate your roster, and export print-ready files.
          </p>
          <div className="lp-hero-ctas">
            <button className="lp-btn-primary lp-btn-lg" onClick={handlePrimary}>
              Start Designing <ArrowRight size={16} />
            </button>
            <button className="lp-btn-outline lp-btn-lg">
              <Play size={14} fill="currentColor" /> Watch Demo
            </button>
          </div>
          <div className="lp-hero-stats">
            <div className="lp-stat"><span className="lp-stat-num">300+</span><span className="lp-stat-label">DPI Verified</span></div>
            <div className="lp-stat-divider" />
            <div className="lp-stat"><span className="lp-stat-num">5 Panels</span><span className="lp-stat-label">Full Layout</span></div>
            <div className="lp-stat-divider" />
            <div className="lp-stat"><span className="lp-stat-num">CSV</span><span className="lp-stat-label">Roster Import</span></div>
            <div className="lp-stat-divider" />
            <div className="lp-stat"><span className="lp-stat-num">CMYK</span><span className="lp-stat-label">Print-Ready</span></div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-tag"><Cpu size={12} /> Platform Capabilities</div>
          <h2 className="lp-section-h2">Engineered for Manufacturing Precision</h2>
          <p className="lp-section-sub">Every feature built around real sublimation production — from first sketch to print room delivery.</p>
        </div>
        <div className="lp-features-grid">
          {features.map((f, i) => (
            <div
              className="lp-feature-card"
              key={i}
              style={{
                top: `calc(100px + ${i * 40}px)`,
                '--card-index': i,
                zIndex: i + 1,
              } as React.CSSProperties}
            >
              <div className="lp-feature-left">
                <div className="lp-feature-top">
                  <div className="lp-feature-icon">{f.icon}</div>
                  <div className="lp-feature-tag">{f.tag}</div>
                </div>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
              <div className="lp-feature-right">
                <FeaturePreview type={f.preview} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how" className="lp-section lp-how-section">
        <div className="lp-glow-divider" />
        <div className="lp-section-header">
          <div className="lp-section-tag"><Zap size={12} /> Workflow</div>
          <h2 className="lp-section-h2">From Idea to Print-Ready in 5 Steps</h2>
          <p className="lp-section-sub">A streamlined production workflow that your entire team can follow.</p>
        </div>
        <div className="lp-steps">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`lp-step ${activeStep === i ? 'active' : ''}`}
              onClick={() => setActiveStep(i)}
            >
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-content">
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
              {i < steps.length - 1 && <div className="lp-step-connector" />}
            </div>
          ))}
        </div>
      </section>

      {/* ── TEMPLATES ────────────────────────────────────────────────────── */}
      <section id="templates" className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-tag"><Layers size={12} /> Supported Garments</div>
          <h2 className="lp-section-h2">Built for Every Sublimation Garment</h2>
          <p className="lp-section-sub">All garment types come with production-calibrated panel templates.</p>
        </div>
        <div className="lp-garment-grid">
          {garments.map((g, i) => (
            <div className="lp-garment-card" key={i} style={{ '--glow': g.color } as React.CSSProperties}>
              <div className="lp-garment-icon">{g.icon}</div>
              <div className="lp-garment-name">{g.name}</div>
              <div className="lp-garment-glow" style={{ background: g.color }} />
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="lp-section lp-testi-section">
        <div className="lp-glow-divider lp-glow-right" />
        <div className="lp-section-header">
          <div className="lp-section-tag"><Star size={12} /> Testimonials</div>
          <h2 className="lp-section-h2">Trusted by Production Teams</h2>
        </div>
        <div className="lp-testi-grid">
          {testimonials.map((t, i) => (
            <div className="lp-testi-card" key={i}>
              <div className="lp-testi-stars">{'★'.repeat(t.rating)}</div>
              <p className="lp-testi-quote">"{t.quote}"</p>
              <div className="lp-testi-author">
                <div className="lp-testi-avatar">{t.name.charAt(0)}</div>
                <div>
                  <div className="lp-testi-name">{t.name}</div>
                  <div className="lp-testi-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-tag"><CheckCircle size={12} /> Pricing</div>
          <h2 className="lp-section-h2">Simple, Transparent Pricing</h2>
          <p className="lp-section-sub">Start free. Scale as your production volume grows.</p>
        </div>
        <div className="lp-pricing-grid">
          {PLANS.map((p) => (
            <LandingPricingCard
              key={p.id}
              plan={p}
              onSelect={handleSelectPlanCard}
            />
          ))}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-faq-section">
        <div className="lp-section-header">
          <div className="lp-section-tag">FAQ</div>
          <h2 className="lp-section-h2">Frequently Asked Questions</h2>
        </div>
        <div className="lp-faq-list">
          {faqs.map((f, i) => (
            <div className={`lp-faq-item ${openFaq === i ? 'open' : ''}`} key={i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div className="lp-faq-q">
                {f.q}
                <ChevronDown size={16} className="lp-faq-chevron" />
              </div>
              {openFaq === i && <div className="lp-faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="lp-cta-section">
        <div className="lp-cta-glow" />
        <div className="lp-section-tag" style={{ justifyContent: 'center' }}><Sparkles size={12} /> Ready to Ship</div>
        <h2 className="lp-cta-h2">Start Your First<br /><span className="lp-gradient-text">Production Project</span></h2>
        <p className="lp-cta-sub">Join the next generation of sublimation studios. No credit card required.</p>
        <div className="lp-cta-btns">
          <button className="lp-btn-primary lp-btn-lg" onClick={handlePrimary}>
            Start Free Today <ArrowRight size={16} />
          </button>
          <button className="lp-btn-ghost lp-btn-lg" onClick={handlePrimary}>Log In</button>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <div className="lp-nav-dot" />
          DesignSync
          <p className="lp-footer-tagline">Sublimation Apparel Operating System</p>
        </div>
        <div className="lp-footer-links">
          <div className="lp-footer-col">
            <div className="lp-footer-col-title">Product</div>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#templates">Templates</a>
            <a href="#how">How It Works</a>
          </div>
          <div className="lp-footer-col">
            <div className="lp-footer-col-title">Resources</div>
            <a href="#">Documentation</a>
            <a href="#">Roadmap</a>
            <a href="#">Changelog</a>
            <a href="#">API</a>
          </div>
          <div className="lp-footer-col">
            <div className="lp-footer-col-title">Company</div>
            <a href="#">About</a>
            <a href="#">Contact</a>
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          © 2026 DesignSync. All rights reserved. Built for sublimation production teams.
        </div>
      </footer>

    </div>
  );
}
