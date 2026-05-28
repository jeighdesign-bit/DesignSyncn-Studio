import React, { useState, useEffect } from 'react';
import type { Project } from '../types';
import {
  Sparkles, RefreshCw,
  Check, Clock, AlertTriangle,
  Shield, Shirt, Layers, Settings,
  TriangleAlert, CircleCheck, Info, ArrowRight,
  Ruler, Palette, Cpu, Eye,
  ChevronDown, ChevronUp, Paperclip, PanelRight
} from 'lucide-react';
import { generateProductionCanvasStates } from '../lib/measurements';


// ─── Types ────────────────────────────────────────────────────────────────────

type GarmentPanel = 'front' | 'back' | 'left-sleeve' | 'right-sleeve' | 'collar';
type PanelStatus = 'empty' | 'configured' | 'generated' | 'approved';
type ZoneType = 'seam' | 'safe' | 'sponsor' | 'design';
type InkMode = 'cmyk' | 'rgb' | 'neon';

interface PanelConfig {
  id: GarmentPanel;
  label: string;
  shortLabel: string;
  prompt: string;
  status: PanelStatus;
  zones: ZoneType[];
}

interface StyleDNA {
  id: string;
  name: string;
  tag: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  patternDensity: 'minimal' | 'moderate' | 'heavy';
  typographyWeight: 'light' | 'medium' | 'bold';
  description: string;
}

interface ZoneCompliance {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error' | 'info';
  detail: string;
}

interface GeneratedConcept {
  id: string;
  panelId: GarmentPanel;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  patternKey: string;
  timestamp: string;
}

interface AIDesignStudioProps {
  project: Project;
  presets: any[];
  aiGenerating: boolean;
  onUpdateProject: (updates: Partial<Project>) => void;
  onPresetSelect: (id: string) => void;
  onGenerate: () => void;
  onHandoffToProduction: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLE_DNA: StyleDNA[] = [
  {
    id: 'esports-pro',
    name: 'Esports Pro',
    tag: 'COMPETITIVE',
    primaryColor: '#0a0a1a',
    secondaryColor: '#0070f3',
    accentColor: '#00e5ff',
    patternDensity: 'heavy',
    typographyWeight: 'bold',
    description: 'Aggressive geometry, high contrast panels, cyber typography'
  },
  {
    id: 'street-league',
    name: 'Street League',
    tag: 'URBAN',
    primaryColor: '#111111',
    secondaryColor: '#ff4d4d',
    accentColor: '#ffcc00',
    patternDensity: 'moderate',
    typographyWeight: 'bold',
    description: 'Bold block colors, graffiti-inspired panel flow'
  },
  {
    id: 'classic-athletic',
    name: 'Classic Athletic',
    tag: 'SPORT',
    primaryColor: '#002147',
    secondaryColor: '#c8102e',
    accentColor: '#ffffff',
    patternDensity: 'minimal',
    typographyWeight: 'medium',
    description: 'Clean side panels, traditional sports typography'
  },
  {
    id: 'neon-sublimation',
    name: 'Neon Sublimation',
    tag: 'NEON-INK',
    primaryColor: '#080818',
    secondaryColor: '#7c3aed',
    accentColor: '#00ff88',
    patternDensity: 'heavy',
    typographyWeight: 'bold',
    description: 'Fluorescent inks, reactive color zones, glow-safe bleed'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    tag: 'CLEAN',
    primaryColor: '#f5f5f5',
    secondaryColor: '#1a1a2e',
    accentColor: '#0070f3',
    patternDensity: 'minimal',
    typographyWeight: 'light',
    description: 'White base, accent piping, studio-clean composition'
  },
  {
    id: 'tactical-camo',
    name: 'Tactical Camo',
    tag: 'MILITARY',
    primaryColor: '#2d3a1f',
    secondaryColor: '#4a5e2a',
    accentColor: '#c8a84b',
    patternDensity: 'heavy',
    typographyWeight: 'medium',
    description: 'Disruption pattern fills, subdued palette, matte finish'
  }
];

const PANEL_PROMPT_CHIPS: Record<GarmentPanel, string[]> = {
  front: ['Bold geometric centerpiece', 'Gradient fade from collar', 'Sponsor zone clean white', 'Armor-plate pattern overlay'],
  back: ['Number zone clear white background', 'Full-back graphic with name clearance', 'Diagonal stripe flow', 'Mirror front panel design'],
  'left-sleeve': ['Vertical stripe accent', 'Team color gradient fade', 'Logo placement zone', 'Diagonal mesh pattern'],
  'right-sleeve': ['Solid secondary color', 'Piping accent line', 'Match left sleeve mirror', 'Number accent strip'],
  collar: ['Contrast color binding', 'Sublimation gradient fade', 'Clean white inner collar', 'Pattern continuation']
};

const INITIAL_PANELS: PanelConfig[] = [
  { id: 'front', label: 'Front Body', shortLabel: 'Front', prompt: '', status: 'empty', zones: ['sponsor', 'safe', 'seam', 'design'] },
  { id: 'back', label: 'Back Body', shortLabel: 'Back', prompt: '', status: 'empty', zones: ['safe', 'seam', 'design'] },
  { id: 'left-sleeve', label: 'Left Sleeve', shortLabel: 'L.Sleeve', prompt: '', status: 'empty', zones: ['seam', 'design'] },
  { id: 'right-sleeve', label: 'Right Sleeve', shortLabel: 'R.Sleeve', prompt: '', status: 'empty', zones: ['seam', 'design'] },
  { id: 'collar', label: 'Collar', shortLabel: 'Collar', prompt: '', status: 'empty', zones: ['seam'] },
];

const STATUS_COLOR: Record<PanelStatus, string> = {
  empty: '#444',
  configured: '#f59e0b',
  generated: '#0070f3',
  approved: '#00e676',
};

const ZONE_COLORS: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
  seam: { fill: 'rgba(239,68,68,0.08)', stroke: '#ef4444', label: 'Seam Danger Zone' },
  safe: { fill: 'rgba(234,179,8,0.08)', stroke: '#eab308', label: 'Name/# Safe Zone' },
  sponsor: { fill: 'rgba(0,112,243,0.1)', stroke: '#0070f3', label: 'Sponsor Logo Zone' },
  design: { fill: 'rgba(0,230,118,0.05)', stroke: '#00e676', label: 'Free Design Zone' },
};

// ─── Panel Garment SVG Component ──────────────────────────────────────────────

const GarmentFlat: React.FC<{
  panels: PanelConfig[];
  activePanel: GarmentPanel;
  concepts: GeneratedConcept[];
  showZones: Record<ZoneType, boolean>;
  selectedDNA: StyleDNA | null;
  sponsorZone: boolean;
  safeZone: number;
  seamBleed: number;
  onPanelClick: (id: GarmentPanel) => void;
}> = ({ panels, activePanel, concepts, showZones, selectedDNA, sponsorZone, onPanelClick }) => {

  const getPanelConcept = (id: GarmentPanel) => concepts.find(c => c.panelId === id);

  const getPanelFill = (id: GarmentPanel) => {
    const concept = getPanelConcept(id);
    const dna = selectedDNA;
    if (concept) return `url(#grad-${id})`;
    if (dna) return `${dna.primaryColor}cc`;
    return '#16161f';
  };

  const isActive = (id: GarmentPanel) => activePanel === id;
  const panelStatus = (id: GarmentPanel) => panels.find(p => p.id === id)?.status ?? 'empty';

  return (
    <svg
      viewBox="0 0 640 440"
      className="ap-garment-flat-svg"
      style={{ width: '100%', height: '100%', maxHeight: '420px' }}
    >
      <defs>
        {/* Gradients per panel based on concepts / dna */}
        {['front','back','left-sleeve','right-sleeve','collar'].map(pid => {
          const c = getPanelConcept(pid as GarmentPanel);
          const dna = selectedDNA;
          const p = c?.primaryColor ?? dna?.primaryColor ?? '#16161f';
          const s = c?.secondaryColor ?? dna?.secondaryColor ?? '#1e1e2e';
          const a = c?.accentColor ?? dna?.accentColor ?? '#0070f3';
          return (
            <linearGradient key={pid} id={`grad-${pid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={p} />
              <stop offset="60%" stopColor={s} />
              <stop offset="100%" stopColor={a} stopOpacity={0.4} />
            </linearGradient>
          );
        })}

        {/* Seam hatch pattern */}
        <pattern id="seam-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.5" />
        </pattern>

        {/* Safe zone dash */}
        <pattern id="safe-dash" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="rgba(234,179,8,0.05)" />
        </pattern>

        {/* Drop shadow filter */}
        <filter id="panel-shadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.6" />
        </filter>
        <filter id="active-glow">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#0070f3" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* ── BACK BODY PANEL (left side) ── */}
      <g
        onClick={() => onPanelClick('back')}
        style={{ cursor: 'pointer' }}
        filter={isActive('back') ? 'url(#active-glow)' : 'url(#panel-shadow)'}
      >
        {/* Main back body */}
        <path
          d="M 30,120 L 60,90 L 100,105 L 110,80 L 180,75 L 180,360 L 30,360 Z"
          fill={getPanelFill('back')}
          stroke={isActive('back') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('back') ? 2 : 1}
        />
        {/* Seam danger zone - back */}
        {showZones.seam && (
          <path
            d="M 35,125 L 62,95 L 98,109 L 107,85 L 175,80 L 175,355 L 35,355 Z"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.7"
          />
        )}
        {/* Name / Number safe zone - back center */}
        {showZones.safe && (
          <rect x="60" y="150" width="105" height="140" rx="2"
            fill="rgba(234,179,8,0.07)"
            stroke="#eab308"
            strokeWidth="1"
            strokeDasharray="5 4"
          />
        )}
        {/* Design zone fill - back */}
        {showZones.design && panelStatus('back') === 'empty' && (
          <path
            d="M 40,130 L 65,100 L 100,113 L 110,88 L 172,82 L 172,352 L 40,352 Z"
            fill="rgba(0,230,118,0.04)"
            stroke="#00e676"
            strokeWidth="0.5"
            strokeDasharray="8 6"
          />
        )}
        {/* Panel label */}
        <text x="105" y="275" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="0.08em">BACK</text>
        {/* Status dot */}
        <circle cx="170" cy="88" r="5" fill={STATUS_COLOR[panelStatus('back')]} />
        {/* Active ring */}
        {isActive('back') && <circle cx="170" cy="88" r="7" fill="none" stroke="#0070f3" strokeWidth="1.5" opacity="0.7" />}
      </g>

      {/* ── RIGHT SLEEVE (back side — left in back view) ── */}
      <g onClick={() => onPanelClick('right-sleeve')} style={{ cursor: 'pointer' }}
        filter={isActive('right-sleeve') ? 'url(#active-glow)' : 'url(#panel-shadow)'}>
        <path
          d="M 30,120 L 60,90 L 100,105 L 85,195 L 5,175 Z"
          fill={getPanelFill('right-sleeve')}
          stroke={isActive('right-sleeve') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('right-sleeve') ? 2 : 1}
        />
        {showZones.seam && (
          <path d="M 35,122 L 63,94 L 97,108 L 82,192 L 8,173 Z"
            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        )}
        <text x="50" y="148" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="monospace">R.SLV</text>
        <circle cx="62" cy="92" r="4" fill={STATUS_COLOR[panelStatus('right-sleeve')]} />
        {isActive('right-sleeve') && <circle cx="62" cy="92" r="6" fill="none" stroke="#0070f3" strokeWidth="1.5" opacity="0.7" />}
      </g>

      {/* ── LEFT SLEEVE (back side — right in back view) ── */}
      <g onClick={() => onPanelClick('left-sleeve')} style={{ cursor: 'pointer' }}
        filter={isActive('left-sleeve') ? 'url(#active-glow)' : 'url(#panel-shadow)'}>
        <path
          d="M 180,75 L 230,70 L 265,90 L 265,180 L 195,195 Z"
          fill={getPanelFill('left-sleeve')}
          stroke={isActive('left-sleeve') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('left-sleeve') ? 2 : 1}
        />
        {showZones.seam && (
          <path d="M 182,78 L 228,73 L 262,93 L 262,177 L 197,192 Z"
            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        )}
        <text x="222" y="138" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="monospace">L.SLV</text>
        <circle cx="232" cy="72" r="4" fill={STATUS_COLOR[panelStatus('left-sleeve')]} />
        {isActive('left-sleeve') && <circle cx="232" cy="72" r="6" fill="none" stroke="#0070f3" strokeWidth="1.5" opacity="0.7" />}
      </g>

      {/* SEPARATOR LINE */}
      <line x1="300" y1="60" x2="300" y2="410" stroke="#1e1e2e" strokeWidth="3" />
      <text x="300" y="425" textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="7" fontFamily="monospace" letterSpacing="0.12em">FRONT / BACK LAYOUT</text>

      {/* ── FRONT BODY PANEL (right side) ── */}
      <g onClick={() => onPanelClick('front')} style={{ cursor: 'pointer' }}
        filter={isActive('front') ? 'url(#active-glow)' : 'url(#panel-shadow)'}>
        <path
          d="M 330,120 L 360,90 L 400,105 L 460,75 L 530,75 L 540,80 L 545,105 L 590,90 L 620,120 L 620,360 L 330,360 Z"
          fill={getPanelFill('front')}
          stroke={isActive('front') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('front') ? 2 : 1}
        />
        {/* Collar notch on front */}
        <path d="M 450,75 Q 475,100 500,75" fill="none" stroke={isActive('collar') ? '#0070f3' : '#555'} strokeWidth={isActive('collar') ? 2 : 1} />

        {/* Seam danger zone - front */}
        {showZones.seam && (
          <path
            d="M 338,125 L 365,96 L 403,110 L 462,80 L 526,80 L 538,85 L 542,109 L 587,95 L 614,125 L 614,354 L 338,354 Z"
            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.7"
          />
        )}
        {/* Sponsor zone - front top chest */}
        {showZones.sponsor && sponsorZone && (
          <rect x="390" y="115" width="180" height="65" rx="3"
            fill="rgba(0,112,243,0.12)"
            stroke="#0070f3"
            strokeWidth="1.2"
            strokeDasharray="6 4"
          />
        )}
        {sponsorZone && (
          <text x="480" y="152" textAnchor="middle" fill="#0070f3" fontSize="8" fontFamily="monospace" fontWeight="bold" opacity="0.7">SPONSOR ZONE</text>
        )}
        {/* Name/Number safe zone - front back */}
        {showZones.safe && (
          <rect x="370" y="215" width="220" height="100" rx="2"
            fill="rgba(234,179,8,0.07)"
            stroke="#eab308"
            strokeWidth="1"
            strokeDasharray="5 4"
          />
        )}
        {showZones.safe && (
          <text x="480" y="270" textAnchor="middle" fill="#eab308" fontSize="7" fontFamily="monospace" opacity="0.6">NAME / # SAFE ZONE</text>
        )}
        {/* Free design zone */}
        {showZones.design && (
          <rect x="345" y="130" width="280" height="218" rx="2"
            fill="rgba(0,230,118,0.03)"
            stroke="#00e676"
            strokeWidth="0.5"
            strokeDasharray="10 8"
          />
        )}
        {/* Panel label */}
        <text x="480" y="340" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="0.08em">FRONT</text>
        {/* Status dot */}
        <circle cx="610" cy="130" r="5" fill={STATUS_COLOR[panelStatus('front')]} />
        {isActive('front') && <circle cx="610" cy="130" r="7" fill="none" stroke="#0070f3" strokeWidth="1.5" opacity="0.7" />}
      </g>

      {/* ── LEFT SLEEVE (front side) ── */}
      <g onClick={() => onPanelClick('left-sleeve')} style={{ cursor: 'pointer' }}
        filter={isActive('left-sleeve') ? 'url(#active-glow)' : 'url(#panel-shadow)'}>
        <path
          d="M 330,120 L 360,90 L 400,105 L 390,200 L 310,185 Z"
          fill={getPanelFill('left-sleeve')}
          stroke={isActive('left-sleeve') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('left-sleeve') ? 2 : 1}
        />
        {showZones.seam && (
          <path d="M 335,122 L 363,94 L 397,108 L 387,197 L 314,182 Z"
            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        )}
        <text x="355" y="152" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="monospace">L.SLV</text>
      </g>

      {/* ── RIGHT SLEEVE (front side) ── */}
      <g onClick={() => onPanelClick('right-sleeve')} style={{ cursor: 'pointer' }}
        filter={isActive('right-sleeve') ? 'url(#active-glow)' : 'url(#panel-shadow)'}>
        <path
          d="M 590,90 L 620,120 L 690,175 L 615,195 L 600,105 Z"
          fill={getPanelFill('right-sleeve')}
          stroke={isActive('right-sleeve') ? '#0070f3' : '#2a2a3e'}
          strokeWidth={isActive('right-sleeve') ? 2 : 1}
        />
        {showZones.seam && (
          <path d="M 592,93 L 617,123 L 686,172 L 612,192 L 602,108 Z"
            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        )}
        <text x="640" y="148" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="monospace">R.SLV</text>
      </g>

      {/* ── COLLAR PANEL (front) ── */}
      <g onClick={() => onPanelClick('collar')} style={{ cursor: 'pointer' }}>
        <path
          d="M 450,75 Q 475,105 500,75 L 540,80 L 530,75 Q 505,65 475,68 Q 445,65 460,75 Z"
          fill={getPanelFill('collar')}
          stroke={isActive('collar') ? '#0070f3' : '#3a3a4e'}
          strokeWidth={isActive('collar') ? 2 : 1}
        />
        <circle cx="475" cy="80" r="4" fill={STATUS_COLOR[panelStatus('collar')]} />
      </g>

      {/* Zone Legend */}
      <g transform="translate(310, 370)">
        {showZones.seam && <><rect x="0" y="0" width="8" height="8" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" /><text x="11" y="8" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">Seam Zone</text></>}
        {showZones.safe && <><rect x="80" y="0" width="8" height="8" fill="none" stroke="#eab308" strokeWidth="1" strokeDasharray="3 2" /><text x="91" y="8" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">Safe Zone</text></>}
        {showZones.sponsor && sponsorZone && <><rect x="158" y="0" width="8" height="8" fill="rgba(0,112,243,0.2)" stroke="#0070f3" strokeWidth="1" /><text x="169" y="8" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">Sponsor</text></>}
        {showZones.design && <><rect x="225" y="0" width="8" height="8" fill="none" stroke="#00e676" strokeWidth="0.5" strokeDasharray="4 3" /><text x="236" y="8" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">Design Area</text></>}
      </g>
    </svg>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AIDesignStudio: React.FC<AIDesignStudioProps> = ({
  project,
  onUpdateProject,
  onGenerate,
  onHandoffToProduction,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<GarmentPanel>('front');
  const [panels, setPanels] = useState<PanelConfig[]>(INITIAL_PANELS);
  const [selectedDNA, setSelectedDNA] = useState<StyleDNA | null>(null);
  const [concepts, setConcepts] = useState<GeneratedConcept[]>([]);
  const [showZones, setShowZones] = useState<Record<ZoneType, boolean>>({
    seam: true, safe: true, sponsor: true, design: true
  });
  const [sponsorZone, setSponsorZone] = useState(true);
  const [safeZoneRadius, setSafeZoneRadius] = useState(0.5);
  const [seamBleed, setSeamBleed] = useState<0.25 | 0.5 | 0.75>(0.5);
  const [inkMode, setInkMode] = useState<InkMode>('cmyk');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [handoffProcessing, setHandoffProcessing] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);

  const [rightPanelExpanded, setRightPanelExpanded] = useState(true);
  const [activePanelDropdown, setActivePanelDropdown] = useState(false);
  const [accordions, setAccordions] = useState({
    dna: true,
    constraints: false,
    status: false,
    compliance: false,
    logs: false
  });

  const LOADING_MSGS = [
    '[PANEL AI] Mapping front body layout zones...',
    '[SAFE ZONE] Calculating name clearance margin...',
    '[SPONSOR] Detecting chest placement boundaries...',
    '[SEAM] Applying bleed compensation matrix...',
    '[COLOR] Mapping sublimation ink density...',
    '[VECTOR] Compositing panel flow gradients...',
    '[COMPLIANCE] Running zone conflict check...',
    '[ENGINE] Finalizing production layout data...',
  ];

  useEffect(() => {
    if (!generating) return;
    let i = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    const t = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[i]);
    }, 420);
    return () => clearInterval(t);
  }, [generating]);

  const pushLog = (msg: string) =>
    setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);

  const activeConfig = panels.find(p => p.id === activePanel)!;

  const updatePanel = (id: GarmentPanel, updates: Partial<PanelConfig>) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleGenerate = () => {
    const configuredPanels = panels.filter(p => p.prompt.trim() !== '' || selectedDNA !== null);
    if (configuredPanels.length === 0 && !selectedDNA) return;

    setGenerating(true);
    onGenerate();
    pushLog(`AI Engine: Generating layout for ${configuredPanels.length > 0 ? configuredPanels.length + ' configured panels' : 'all panels via Style DNA'}`);

    const dna = selectedDNA;
    const targetPanels: GarmentPanel[] = ['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'];

    setTimeout(() => {
      const newConcepts: GeneratedConcept[] = targetPanels.map(pid => {
        const panel = panels.find(p => p.id === pid);
        return {
          id: `c-${pid}-${Date.now()}`,
          panelId: pid,
          label: panel?.prompt || (dna ? dna.name : 'Base Concept'),
          primaryColor: dna?.primaryColor ?? project.baseColors.primary,
          secondaryColor: dna?.secondaryColor ?? project.baseColors.secondary,
          accentColor: dna?.accentColor ?? project.baseColors.accent,
          patternKey: `${dna?.id ?? 'default'}-${pid}`,
          timestamp: new Date().toLocaleTimeString(),
        };
      });

      setConcepts(newConcepts);
      setPanels(prev => prev.map(p => ({
        ...p,
        status: p.prompt.trim() !== '' || selectedDNA !== null ? 'generated' : 'configured'
      })));
      setGenerating(false);
      pushLog(`✓ Panel layout generated — ${targetPanels.length} panels mapped successfully`);
      pushLog(`✓ Zone compliance: seam bleed ${seamBleed}", safe margin ${safeZoneRadius}"`);
    }, 3200);
  };

  const handleApprovePanel = (id: GarmentPanel) => {
    updatePanel(id, { status: 'approved' });
    pushLog(`✓ Panel "${panels.find(p => p.id === id)?.label}" approved for production`);
  };

  const handleHandoff = () => {
    setHandoffProcessing(true);
    pushLog('Initializing Apparel Production AI Mapping Engine...');
    
    let currentStep = 0;
    const steps = [
      'Analyzing generated artwork patterns and dye-sub color mode...',
      'Detecting brand assets: primary crest, sponsor branding...',
      'Loading customizable rules: collar spacing, margins, safety bounds...',
      'Identifying zones: Front chest logo, Back upper surname, Sleeve sponsors...',
      'Mapping elements: splitting graphics into flat sublimation patterns...',
      'Finalizing vector layout sheets for Front, Back, Sleeves, and Collar...'
    ];

    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        pushLog(steps[currentStep]);
        currentStep++;
      } else {
        clearInterval(interval);
        
        // Generate Fabric JSON canvas states based on project parameters
        const generatedStates = generateProductionCanvasStates(project);
        
        // Save back to project state
        onUpdateProject({
          canvasStates: generatedStates
        });
        
        pushLog('✓ Production mapping completed successfully.');
        setHandoffProcessing(false);
        setHandoffDone(true);
        setTimeout(() => onHandoffToProduction(), 600);
      }
    }, 600);
  };

  // ── Zone Compliance ────────────────────────────────────────────────────────
  const configuredCount = panels.filter(p => p.status !== 'empty').length;
  const approvedCount = panels.filter(p => p.status === 'approved').length;
  const hasFrontConfig = panels.find(p => p.id === 'front')?.status !== 'empty';
  const hasBackConfig = panels.find(p => p.id === 'back')?.status !== 'empty';

  const zoneCompliance: ZoneCompliance[] = [
    {
      id: 'seam',
      label: 'Seam Bleed',
      status: 'ok',
      detail: `${seamBleed}" bleed applied to all panels`
    },
    {
      id: 'safe',
      label: 'Name / # Safe Zone',
      status: safeZoneRadius >= 0.4 ? 'ok' : 'warn',
      detail: safeZoneRadius >= 0.4 ? `${safeZoneRadius}" margin — adequate clearance` : 'Margin may clip player names'
    },
    {
      id: 'sponsor',
      label: 'Sponsor Zone',
      status: sponsorZone ? (hasFrontConfig ? 'ok' : 'warn') : 'info',
      detail: sponsorZone ? (hasFrontConfig ? 'Reserved — front chest clear' : 'Reserved but front panel not configured') : 'Sponsor zone not reserved'
    },
    {
      id: 'ink',
      label: 'Ink Mode',
      status: inkMode === 'cmyk' ? 'ok' : inkMode === 'neon' ? 'warn' : 'ok',
      detail: inkMode === 'cmyk' ? 'CMYK — print-safe' : inkMode === 'rgb' ? 'RGB — check printer profile' : 'Neon — verify fluorescent ink stock'
    },
    {
      id: 'panels',
      label: 'Panel Coverage',
      status: configuredCount >= 4 ? 'ok' : configuredCount >= 2 ? 'warn' : 'error',
      detail: `${configuredCount}/5 panels configured`
    },
    {
      id: 'front-back',
      label: 'Front & Back',
      status: hasFrontConfig && hasBackConfig ? 'ok' : 'warn',
      detail: hasFrontConfig && hasBackConfig ? 'Both main panels configured' : 'Front and/or back panel missing'
    },
  ];

  const complianceIcon = (status: ZoneCompliance['status']) => {
    if (status === 'ok') return <CircleCheck size={11} style={{ color: '#00e676' }} />;
    if (status === 'warn') return <TriangleAlert size={11} style={{ color: '#f59e0b' }} />;
    if (status === 'error') return <AlertTriangle size={11} style={{ color: '#ef4444' }} />;
    return <Info size={11} style={{ color: '#0070f3' }} />;
  };

  const allCompliant = zoneCompliance.every(z => z.status === 'ok' || z.status === 'info');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ap-engine-layout" style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      
      {/* ═══ CENTER Dominant Viewport & Floating controls ═══════════════════ */}
      <div className="ap-center-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: '#06060c' }}>
        
        {/* Minimal top breadcrumb bar */}
        <div className="ap-center-topbar">
          <div className="ap-topbar-breadcrumb">
            <Sparkles size={13} style={{ color: 'var(--accent-blue)' }} />
            <span className="ap-topbar-stage">Generate</span>
            <span className="ap-topbar-sep">·</span>
            <span className="ap-topbar-project">{project.name}</span>
          </div>
          <button
            onClick={() => setRightPanelExpanded(!rightPanelExpanded)}
            className="ap-topbar-toggle"
            title="Toggle Settings Panel"
          >
            <PanelRight size={16} style={{ color: rightPanelExpanded ? 'var(--accent-blue)' : '#ffffff' }} />
          </button>
        </div>

        {/* Flat Canvas Workspace with interactive mockups */}
        <div className="ap-flat-canvas-wrapper ap-canvas-dotgrid">



          {/* Canvas loading/generating overlay states */}
          {generating && (
            <div className="ap-generation-overlay">
              <div className="ap-gen-spinner-wrap">
                <div className="ap-gen-spinner" />
                <div className="ap-gen-label">{loadingMsg || 'Running apparel design synthesizer...'}</div>
                <div className="ap-gen-sub">Panel-aware AI creative engine synthesising textures</div>
              </div>
            </div>
          )}

          {handoffProcessing && (
            <div className="ap-generation-overlay" style={{ background: 'rgba(7, 10, 18, 0.96)', backdropFilter: 'blur(4px)', zIndex: 50 }}>
              <div style={{ width: '85%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontWeight: 'bold', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  <Cpu size={14} className="animate-pulse" /> APPAREL PRODUCTION AI ENGINE
                </div>
                <div style={{ background: '#04060a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '10.5px', color: '#4ade80', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '170px', textAlign: 'left', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  <div style={{ borderBottom: '1px solid rgba(74, 222, 128, 0.12)', paddingBottom: '6px', marginBottom: '6px', color: 'var(--text-disabled)', display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    <span>Vector Diagnostics Module v4.2</span>
                    <span className="animate-pulse" style={{ color: 'var(--accent-blue)' }}>● RUNNING</span>
                  </div>
                  {actionLog.slice(0, 5).reverse().map((log, index) => (
                    <div key={index} style={{ opacity: index === 4 ? 1 : 0.4 + (index * 0.15), transition: 'opacity 0.2s', lineHeight: '1.4' }}>
                      {log}
                    </div>
                  ))}
                  <div className="animate-pulse" style={{ color: '#fff', marginTop: 'auto' }}>_</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                  <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
                    <div className="animate-pulse" style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, transparent, var(--accent-blue), transparent)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actual Flat Garment SVG Blueprint preview */}
          <div style={{ transform: 'scale(1.02)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <GarmentFlat
              panels={panels}
              activePanel={activePanel}
              concepts={concepts}
              showZones={showZones}
              selectedDNA={selectedDNA}
              sponsorZone={sponsorZone}
              safeZone={safeZoneRadius}
              seamBleed={seamBleed}
              onPanelClick={(id) => {
                setActivePanel(id);
              }}
            />
          </div>

          {/* FLOATING SUGGESTIONS FOR THE ACTIVE PANEL - Floats just above prompt bar */}
          <div className="ap-chips-floating-container">
            {PANEL_PROMPT_CHIPS[activePanel].map(chip => (
              <button
                key={chip}
                className="ap-chip"
                onClick={() => updatePanel(activePanel, { prompt: chip, status: 'configured' })}
              >
                + {chip}
              </button>
            ))}
          </div>

          {/* BOTTOM-CENTER FLOATING AI PROMPT BAR */}
          <div className="ap-bottom-prompt-bar">
            {/* Panel Selector Dropdown Trigger */}
            <div style={{ position: 'relative' }}>
              <button
                className="ap-prompt-dropdown-btn"
                onClick={() => setActivePanelDropdown(!activePanelDropdown)}
              >
                <Shirt size={13} style={{ color: STATUS_COLOR[activeConfig.status] }} />
                <span>{activeConfig.shortLabel} Panel</span>
                <ChevronDown size={12} style={{ opacity: 0.6 }} />
              </button>
              
              {activePanelDropdown && (
                <div className="ap-prompt-dropdown-menu">
                  {panels.map(p => (
                    <button
                      key={p.id}
                      className={`ap-prompt-dropdown-item ${activePanel === p.id ? 'active' : ''}`}
                      onClick={() => {
                        setActivePanel(p.id);
                        setActivePanelDropdown(false);
                      }}
                    >
                      <span className="ap-dropdown-dot" style={{ background: STATUS_COLOR[p.status] }} />
                      <span>{p.label}</span>
                      {activePanel === p.id && <Check size={11} style={{ marginLeft: 'auto', color: 'var(--accent-blue)' }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Attachment Button */}
            <button 
              className="ap-prompt-attachment-btn" 
              title="Attach logo or reference illustration"
              onClick={() => {
                pushLog('Creative Studio: Prompt attachment added as design guidance');
              }}
            >
              <Paperclip size={15} />
            </button>

            {/* Prompt Text input field */}
            <input
              type="text"
              className="ap-prompt-textarea"
              placeholder={`Describe details for ${activeConfig.label.toLowerCase()} (e.g., "${PANEL_PROMPT_CHIPS[activePanel][0]}")...`}
              value={activeConfig.prompt}
              onChange={e => {
                updatePanel(activePanel, {
                  prompt: e.target.value,
                  status: e.target.value.trim() ? 'configured' : 'empty'
                });
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && activeConfig.prompt.trim() !== '') {
                  handleGenerate();
                }
              }}
            />

            {/* Generate Action Button */}
            <button
              className={`ap-prompt-generate-btn ${generating ? 'loading' : ''}`}
              onClick={handleGenerate}
              disabled={generating || (panels.every(p => p.prompt.trim() === '') && !selectedDNA)}
            >
              {generating ? (
                <><RefreshCw size={13} className="animate-spin" /></>
              ) : (
                <><Sparkles size={13} /> <span>Generate</span></>
              )}
            </button>
          </div>

        </div>

        {/* Canvas Bottom Info Bar — minimal */}
        <div className="ap-canvas-infobar">
          <div className="ap-canvas-info-item">
            <Layers size={10} />
            <span>{concepts.length > 0 ? `${concepts.length} panels` : 'No panels yet'}</span>
          </div>
          <div className="ap-canvas-info-item">
            <Palette size={10} />
            <span>{inkMode.toUpperCase()}</span>
          </div>
          <div className="ap-canvas-info-item" style={{ marginLeft: 'auto' }}>
            <span className={`ap-status-dot ${allCompliant ? 'ok' : 'warn'}`} />
            <span style={{ color: allCompliant ? '#00e676' : '#f59e0b' }}>
              {allCompliant ? 'Ready' : 'Review needed'}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ COLLAPSIBLE RIGHT PANEL (Inspector) ═══════════════════════════════ */}
      <div 
        className="ap-right-panel"
        style={{
          width: rightPanelExpanded ? '320px' : '0px',
          minWidth: rightPanelExpanded ? '320px' : '0px',
          borderLeft: rightPanelExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10,10,15,0.45)',
          backdropFilter: 'blur(16px)',
          height: '100%',
          zIndex: 10
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {/* HEADER */}
          <div className="ap-right-header">
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.85)', fontFamily: 'Outfit, sans-serif' }}>Design Settings</span>
            <span className="ap-right-count" style={{ background: approvedCount === 5 ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.04)', color: approvedCount === 5 ? '#00e676' : 'rgba(255,255,255,0.4)' }}>
              {approvedCount}/5
            </span>
          </div>

          {/* ACCORDION 1: STYLE DNA LIBRARY */}
          <div className="ap-accordion-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button 
              className="ap-accordion-header"
              onClick={() => setAccordions(p => ({ ...p, dna: !p.dna }))}
              style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
                <Palette size={13} style={{ color: 'var(--accent-blue)' }} /> Styles
              </span>
              {accordions.dna ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
            </button>
            
            {accordions.dna && (
              <div className="ap-accordion-content" style={{ padding: '4px 16px 16px' }}>
                <div className="ap-style-dna-grid">
                  {STYLE_DNA.map(dna => (
                    <div
                      key={dna.id}
                      className={`ap-dna-card ${selectedDNA?.id === dna.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedDNA(selectedDNA?.id === dna.id ? null : dna);
                        if (selectedDNA?.id !== dna.id) {
                          onUpdateProject({
                            baseColors: {
                              ...project.baseColors,
                              primary: dna.primaryColor,
                              secondary: dna.secondaryColor,
                              accent: dna.accentColor,
                            }
                          });
                          pushLog(`Style DNA: "${dna.name}" selected`);
                        }
                      }}
                      style={{ padding: '8px', borderRadius: '10px', minHeight: '44px' }}
                    >
                      <div className="ap-dna-swatch" style={{ width: '28px', height: '22px' }}>
                        <div style={{ background: dna.primaryColor, flex: 2 }} />
                        <div style={{ background: dna.secondaryColor, flex: 1.5 }} />
                        <div style={{ background: dna.accentColor, flex: 0.5 }} />
                      </div>
                      <div className="ap-dna-info">
                        <div className="ap-dna-name" style={{ fontSize: '10px' }}>{dna.name}</div>
                        <div className="ap-dna-tag" style={{ fontSize: '7px' }}>{dna.tag}</div>
                      </div>
                      {selectedDNA?.id === dna.id && <div className="ap-dna-check" style={{ width: '12px', height: '12px' }}><Check size={6} /></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 2: GARMENT PRODUCTION CONSTRAINTS */}
          <div className="ap-accordion-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button 
              className="ap-accordion-header"
              onClick={() => setAccordions(p => ({ ...p, constraints: !p.constraints }))}
              style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
                <Settings size={13} style={{ color: 'var(--accent-blue)' }} /> Constraints
              </span>
              {accordions.constraints ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
            </button>
            
            {accordions.constraints && (
              <div className="ap-accordion-content" style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                <div className="ap-constraint-block">
                  <div className="ap-constraint-row">
                    <label className="ap-constraint-label" style={{ fontSize: '10px' }}>
                      <Shield size={11} /> Sponsor Safe Margin
                    </label>
                    <button
                      className={`ap-toggle ${sponsorZone ? 'on' : ''}`}
                      onClick={() => setSponsorZone(v => !v)}
                    >
                      <span className="ap-toggle-knob" />
                    </button>
                  </div>
                  <div className="ap-constraint-hint" style={{ fontSize: '8px' }}>Reserve chest bounds for team placement</div>
                </div>

                <div className="ap-constraint-block">
                  <div className="ap-constraint-row">
                    <label className="ap-constraint-label" style={{ fontSize: '10px' }}>
                      <Ruler size={11} /> Name/# Clearance
                    </label>
                    <span className="ap-constraint-value" style={{ fontSize: '10px' }}>{safeZoneRadius}"</span>
                  </div>
                  <input
                    type="range"
                    min="0.25" max="1.0" step="0.05"
                    value={safeZoneRadius}
                    onChange={e => setSafeZoneRadius(parseFloat(e.target.value))}
                    className="ap-range-slider"
                  />
                  <div className="ap-range-labels" style={{ fontSize: '8px' }}><span>0.25"</span><span>0.5"</span><span>1.0"</span></div>
                </div>

                <div className="ap-constraint-block">
                  <div className="ap-constraint-row" style={{ marginBottom: '6px' }}>
                    <label className="ap-constraint-label" style={{ fontSize: '10px' }}>
                      <Layers size={11} /> Flat Seam Bleed
                    </label>
                  </div>
                  <div className="ap-bleed-options">
                    {([0.25, 0.5, 0.75] as const).map(val => (
                      <button
                        key={val}
                        className={`ap-bleed-opt ${seamBleed === val ? 'active' : ''}`}
                        onClick={() => setSeamBleed(val)}
                        style={{ padding: '4px', fontSize: '9px' }}
                      >
                        {val}"
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ap-constraint-block">
                  <div className="ap-constraint-row" style={{ marginBottom: '6px' }}>
                    <label className="ap-constraint-label" style={{ fontSize: '10px' }}>
                      <Palette size={11} /> Ink Settings
                    </label>
                  </div>
                  <div className="ap-ink-options">
                    {(['cmyk', 'rgb', 'neon'] as const).map(mode => (
                      <button
                        key={mode}
                        className={`ap-ink-opt ${inkMode === mode ? 'active' : ''}`}
                        onClick={() => setInkMode(mode)}
                        style={{ padding: '4px', fontSize: '9px' }}
                      >
                        {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ap-constraint-block" style={{ borderBottom: 'none' }}>
                  <div className="ap-section-label" style={{ marginBottom: '8px', fontSize: '9px' }}><Eye size={11} /> Overlay visibility</div>
                  {(Object.keys(showZones) as ZoneType[]).map(zone => (
                    <div key={zone} className="ap-constraint-row" style={{ marginBottom: '6px' }}>
                      <label className="ap-constraint-label" style={{ color: ZONE_COLORS[zone].stroke, fontSize: '9.5px' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '1.5px', border: `1px solid ${ZONE_COLORS[zone].stroke}`, marginRight: '4px' }} />
                        {ZONE_COLORS[zone].label.replace(' Zone', '').replace(' Area', '')}
                      </label>
                      <button
                        className={`ap-toggle ${showZones[zone] ? 'on' : ''}`}
                        onClick={() => setShowZones(prev => ({ ...prev, [zone]: !prev[zone] }))}
                      >
                        <span className="ap-toggle-knob" />
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>

          {/* ACCORDION 3: INTERACTIVE PANEL STATUS BOARD */}
          <div className="ap-accordion-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button 
              className="ap-accordion-header"
              onClick={() => setAccordions(p => ({ ...p, status: !p.status }))}
              style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
                <Shirt size={13} style={{ color: 'var(--accent-blue)' }} /> Panels
              </span>
              {accordions.status ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
            </button>
            
            {accordions.status && (
              <div className="ap-accordion-content" style={{ padding: '0 12px 16px' }}>
                <div className="ap-panel-status-board" style={{ padding: 0, borderBottom: 'none' }}>
                  {panels.map(p => (
                    <div
                      key={p.id}
                      className={`ap-panel-status-item ${activePanel === p.id ? 'active' : ''}`}
                      onClick={() => setActivePanel(p.id)}
                      style={{ padding: '5px 8px' }}
                    >
                      <div className="ap-panel-status-dot" style={{ background: STATUS_COLOR[p.status], width: '6px', height: '6px' }} />
                      <div className="ap-panel-status-info">
                        <div className="ap-panel-status-name" style={{ fontSize: '10.5px' }}>{p.label}</div>
                        <div className="ap-panel-status-state" style={{ fontSize: '7.5px' }}>{p.status}</div>
                      </div>
                      <div className="ap-panel-status-actions">
                        {p.status === 'generated' && (
                          <button className="ap-status-approve" onClick={e => { e.stopPropagation(); handleApprovePanel(p.id); }} style={{ width: '18px', height: '18px' }}>
                            <Check size={8} />
                          </button>
                        )}
                        {p.status === 'approved' && <CircleCheck size={12} style={{ color: '#00e676' }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 4: ZONE COMPLIANCE REPORT */}
          <div className="ap-accordion-section" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button 
              className="ap-accordion-header"
              onClick={() => setAccordions(p => ({ ...p, compliance: !p.compliance }))}
              style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
                <Shield size={13} style={{ color: 'var(--accent-blue)' }} /> Design Checks
              </span>
              {accordions.compliance ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
            </button>
            
            {accordions.compliance && (
              <div className="ap-accordion-content" style={{ padding: '0 16px 16px' }}>
                <div className="ap-compliance-list">
                  {zoneCompliance.map(item => (
                    <div key={item.id} className="ap-compliance-item" style={{ padding: '4px 6px' }}>
                      <div className="ap-compliance-icon">{complianceIcon(item.status)}</div>
                      <div className="ap-compliance-text">
                        <div className="ap-compliance-label" style={{ fontSize: '9.5px' }}>{item.label}</div>
                        <div className="ap-compliance-detail" style={{ fontSize: '8.5px' }}>{item.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 5: LOGS */}
          <div className="ap-accordion-section">
            <button 
              className="ap-accordion-header"
              onClick={() => setAccordions(p => ({ ...p, logs: !p.logs }))}
              style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)' }}>
                <Clock size={13} style={{ color: 'var(--accent-blue)' }} /> Activity
              </span>
              {accordions.logs ? <ChevronUp size={14} style={{ opacity: 0.6 }} /> : <ChevronDown size={14} style={{ opacity: 0.6 }} />}
            </button>
            
            {accordions.logs && (
              <div className="ap-accordion-content" style={{ padding: '0 16px 16px' }}>
                <div className="ap-log-entries" style={{ maxHeight: '140px' }}>
                  {actionLog.length === 0 ? (
                    <div className="ap-log-empty" style={{ fontSize: '9px' }}>Empty audit trail.</div>
                  ) : (
                    actionLog.slice(0, 10).map((entry, i) => (
                      <div key={i} className="ap-log-entry" style={{ fontSize: '8.5px', padding: '2px 0' }}>{entry}</div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* PRODUCTION HANDOFF SUBMIT FOOTER */}
        <div className="ap-handoff-section" style={{ padding: '16px 20px', background: 'rgba(15,15,20,0.85)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="ap-handoff-summary" style={{ marginBottom: '8px' }}>
            <div className="ap-handoff-stat" style={{ padding: '4px' }}>
              <span className="ap-handoff-stat-val" style={{ color: configuredCount >= 2 ? '#00e676' : '#f59e0b', fontSize: '12px' }}>{configuredCount}</span>
              <span className="ap-handoff-stat-label" style={{ fontSize: '7px' }}>Panels</span>
            </div>
            <div className="ap-handoff-stat" style={{ padding: '4px' }}>
              <span className="ap-handoff-stat-val" style={{ color: approvedCount > 0 ? '#00e676' : '#555', fontSize: '12px' }}>{approvedCount}</span>
              <span className="ap-handoff-stat-label" style={{ fontSize: '7px' }}>Approved</span>
            </div>
            <div className="ap-handoff-stat" style={{ padding: '4px' }}>
              <span className="ap-handoff-stat-val" style={{ color: allCompliant ? '#00e676' : '#f59e0b', fontSize: '12px' }}>{allCompliant ? '✓' : '⚠'}</span>
              <span className="ap-handoff-stat-label" style={{ fontSize: '7px' }}>Compliant</span>
            </div>
          </div>
          
          <button
            className={`ap-handoff-btn ${handoffProcessing ? 'processing' : ''} ${handoffDone ? 'done' : ''}`}
            onClick={handleHandoff}
            disabled={handoffProcessing || handoffDone}
            style={{
              padding: '12px',
              fontSize: '12px',
              borderRadius: '10px',
              background: handoffDone ? 'rgba(0,230,118,0.1)' : 'var(--accent-blue)',
              color: '#fff',
              border: handoffDone ? '1px solid rgba(0,230,118,0.3)' : 'none',
              boxShadow: handoffDone ? 'none' : '0 4px 16px rgba(0,112,243,0.3)',
              cursor: handoffProcessing || handoffDone ? 'default' : 'pointer'
            }}
          >
            {handoffDone ? (
              <><Check size={14} /> Sent to Production</>
            ) : handoffProcessing ? (
              <><RefreshCw size={13} className="animate-spin" /> Mapped vector meshes...</>
            ) : (
              <><ArrowRight size={14} /> Send to Refine / Studio</>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
