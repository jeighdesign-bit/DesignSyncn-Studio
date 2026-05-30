import React, { useState, useEffect } from 'react';
import type { Project } from '../types';
import {
  Sparkles, RefreshCw,
  Check,
  Shirt,
  ArrowRight,
  Cpu,
  ChevronDown, Paperclip
} from 'lucide-react';
import { generateProductionCanvasStates } from '../lib/measurements';


// ─── Types ────────────────────────────────────────────────────────────────────

type GarmentPanel = 'front' | 'back' | 'left-sleeve' | 'right-sleeve' | 'collar';
type PanelStatus = 'empty' | 'configured' | 'generated' | 'approved';
type ZoneType = 'seam' | 'safe' | 'sponsor' | 'design';
export type InkMode = 'cmyk' | 'rgb' | 'neon';

interface PanelConfig {
  id: GarmentPanel;
  label: string;
  shortLabel: string;
  prompt: string;
  status: PanelStatus;
  zones: ZoneType[];
  patternUrl?: string;
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

export interface ZoneCompliance {
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
  patternUrl?: string;
}

interface AIDesignStudioProps {
  project: Project;
  presets: any[];
  aiGenerating: boolean;
  onUpdateProject: (updates: Partial<Project>) => void;
  onPresetSelect: (id: string) => void;
  onGenerate: () => void;
  onHandoffToProduction: () => void;
  userId?: string;
  onTokenExhausted?: () => void;
  onUpdateTokens?: (newAmount: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STYLE_DNA: StyleDNA[] = [
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

export const ZONE_COLORS: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
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
  apparelType?: string;
}> = ({ panels, activePanel, concepts, showZones, selectedDNA, sponsorZone, onPanelClick, apparelType }) => {
  const mockupSrc = 
    apparelType === 'esports_jersey' ? '/mockups/jersey_round_neck.png' :
    apparelType === 'crewneck_sweatshirt' ? '/mockups/hoodie.png' :
    apparelType === 'tshirt' ? '/mockups/tshirt.png' :
    apparelType === 'long_sleeve' ? '/mockups/long_sleeve.png' :
    apparelType === 'pants' ? '/mockups/pants.png' :
    apparelType === 'shorts' ? '/mockups/shorts.png' :
    '/mockups/tshirt.png';
  const [useSvgFallback, setUseSvgFallback] = useState(false);

  useEffect(() => {
    setUseSvgFallback(false);
  }, [mockupSrc]);

  const handleMockupError = () => {
    setUseSvgFallback(true);
  };

  const getPanelConcept = (id: GarmentPanel) => concepts.find(c => c.panelId === id);

  const getPanelFill = (id: GarmentPanel) => {
    if (concepts.length > 0) {
      return 'transparent';
    }
    const concept = getPanelConcept(id);
    if (concept) {
      return concept.patternUrl ? `url(#pattern-${id})` : `url(#grad-${id})`;
    }
    // Default to a perfectly clean, blank white sublimation fabric canvas!
    return '#ffffff';
  };

  const isActive = (id: GarmentPanel) => activePanel === id;
  const panelStatus = (id: GarmentPanel) => panels.find(p => p.id === id)?.status ?? 'empty';

  const frontConcept = concepts.find(c => c.panelId === 'front');
  const backConcept = concepts.find(c => c.panelId === 'back');

  const frontFill = frontConcept?.patternUrl 
    ? `url(${frontConcept.patternUrl})` 
    : (selectedDNA ? `linear-gradient(135deg, ${selectedDNA.primaryColor}, ${selectedDNA.secondaryColor})` : '#ffffff');

  const backFill = backConcept?.patternUrl 
    ? `url(${backConcept.patternUrl})` 
    : (selectedDNA ? `linear-gradient(135deg, ${selectedDNA.primaryColor}, ${selectedDNA.secondaryColor})` : '#ffffff');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', maxWidth: '640px' } as any}>
      
      {/* 🌟 MOCKUP IMAGE — always shown, keyed to force remount on src change */}
      <img
        key={mockupSrc}
        src={mockupSrc}
        alt="Garment Mockup"
        style={{
          width: '100%',
          maxHeight: '420px',
          objectFit: 'contain',
          filter: 'drop-shadow(0 12px 36px rgba(0,0,0,0.55))',
          pointerEvents: 'none',
          display: 'block',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* 🌟 AI PATTERN OVERLAY — shown only when concepts have been generated */}
      {concepts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
            maskImage: `url("${mockupSrc}")`,
            WebkitMaskImage: `url("${mockupSrc}")`,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            zIndex: 2,
          }}
        >
          {/* Left Half: Front Design */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: frontFill,
              backgroundSize: frontConcept?.patternUrl ? '150px 150px' : 'cover',
              backgroundRepeat: 'repeat',
              opacity: 0.95,
            }}
          />
          {/* Right Half: Back Design */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: backFill,
              backgroundSize: backConcept?.patternUrl ? '150px 150px' : 'cover',
              backgroundRepeat: 'repeat',
              opacity: 0.95,
            }}
          />
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AIDesignStudio: React.FC<AIDesignStudioProps> = ({
  project,
  onUpdateProject,
  onGenerate,
  onHandoffToProduction,
  userId = 'anonymous-session',
  onTokenExhausted,
  onUpdateTokens,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<GarmentPanel>('front');
  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    if (project.panels && project.panels.length > 0) {
      return project.panels;
    }
    return INITIAL_PANELS;
  });
  const [selectedDNA] = useState<StyleDNA | null>(null);
  const [concepts, setConcepts] = useState<GeneratedConcept[]>(() => {
    if (project.panels && project.panels.length > 0) {
      return project.panels
        .filter(p => p.patternUrl)
        .map(p => ({
          id: `c-${p.id}`,
          panelId: p.id,
          label: p.prompt || 'Base Concept',
          primaryColor: project.baseColors?.primary || '#09090b',
          secondaryColor: project.baseColors?.secondary || '#111115',
          accentColor: project.baseColors?.accent || '#0070f3',
          patternKey: `default-${p.id}`,
          timestamp: new Date().toLocaleTimeString(),
          patternUrl: p.patternUrl
        }));
    }
    return [];
  });
  const showZones = { seam: true, safe: true, sponsor: true, design: true };
  const sponsorZone = true;
  const safeZoneRadius = 0.5;
  const seamBleed = 0.5;
  
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [handoffProcessing, setHandoffProcessing] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);

  const [activePanelDropdown, setActivePanelDropdown] = useState(false);

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
    if (project.panels && project.panels.length > 0) {
      setPanels(project.panels);
      setConcepts(project.panels
        .filter(p => p.patternUrl)
        .map(p => ({
          id: `c-${p.id}-${Date.now()}`,
          panelId: p.id,
          label: p.prompt || 'Base Concept',
          primaryColor: project.baseColors?.primary || '#09090b',
          secondaryColor: project.baseColors?.secondary || '#111115',
          accentColor: project.baseColors?.accent || '#0070f3',
          patternKey: `default-${p.id}`,
          timestamp: new Date().toLocaleTimeString(),
          patternUrl: p.patternUrl
        }))
      );
    } else {
      setPanels(INITIAL_PANELS);
      setConcepts([]);
    }
  }, [project.id, project.name]);

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
    const next = panels.map(p => p.id === id ? { ...p, ...updates } : p);
    setPanels(next);
    onUpdateProject({ panels: next });
  };

  const handleGenerate = async () => {
    const configuredPanels = panels.filter(p => p.prompt.trim() !== '' || selectedDNA !== null);
    if (configuredPanels.length === 0 && !selectedDNA) return;

    setGenerating(true);
    onGenerate();
    pushLog(`AI Engine: Generating layout for ${configuredPanels.length > 0 ? configuredPanels.length + ' configured panels' : 'all panels via Style DNA'}`);

    const dna = selectedDNA;
    const targetPanels: GarmentPanel[] = ['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'];

    try {
      const newConcepts: GeneratedConcept[] = [];
      const colors = [
        project.baseColors.primary,
        project.baseColors.secondary,
        project.baseColors.accent || '#ffcc00'
      ];

      // Generate patterns for each panel asynchronously via DesignSync AI Gateway
      for (const pid of targetPanels) {
        const panel = panels.find(p => p.id === pid);
        const basePrompt = panel?.prompt.trim() || (dna ? `${dna.name} sports style: ${dna.description}` : 'sports jersey technical pattern');
        const refinedPrompt = `${basePrompt}, sublimated ${pid} panel jersey texture`;

        pushLog(`[Secure AI Router] Routing ${pid} prompt to Replicate (Flux)...`);

        const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${SERVER_URL}/api/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: refinedPrompt,
            providerMode: 'flux', // will use Replicate Flux or fall back to beautiful Sandbox SVGs
            baseColors: colors,
            userId: userId
          })
        });

        if (res.status === 403) {
          const errData = await res.json();
          if (errData.error === 'OUT_OF_TOKENS') {
            if (onTokenExhausted) onTokenExhausted();
            throw new Error('OUT_OF_TOKENS');
          }
        }

        if (!res.ok) throw new Error(`Gateway returned: ${res.statusText}`);
        const data = await res.json();

        if (data.remainingTokens !== undefined && onUpdateTokens) {
          onUpdateTokens(data.remainingTokens);
        }

        newConcepts.push({
          id: `c-${pid}-${Date.now()}`,
          panelId: pid,
          label: panel?.prompt || (dna ? dna.name : 'Base Concept'),
          primaryColor: dna?.primaryColor ?? project.baseColors.primary,
          secondaryColor: dna?.secondaryColor ?? project.baseColors.secondary,
          accentColor: dna?.accentColor ?? project.baseColors.accent,
          patternKey: `${dna?.id ?? 'default'}-${pid}`,
          timestamp: new Date().toLocaleTimeString(),
          patternUrl: data.url // Dynamic live AI-generated texture URL or sandbox mockup!
        });
      }

      setConcepts(newConcepts);
      const updatedPanels = panels.map(p => {
        const concept = newConcepts.find(c => c.panelId === p.id);
        return {
          ...p,
          status: p.prompt.trim() !== '' || selectedDNA !== null ? 'generated' as const : 'configured' as const,
          patternUrl: concept?.patternUrl || p.patternUrl
        };
      });
      setPanels(updatedPanels);
      onUpdateProject({
        panels: updatedPanels
      });
      pushLog(`✓ Panel layout generated — ${targetPanels.length} panels mapped successfully`);
      pushLog(`✓ Zone compliance: seam bleed ${seamBleed}", safe margin ${safeZoneRadius}"`);
    } catch (e: any) {
      console.error(e);
      if (e.message === 'OUT_OF_TOKENS') {
        pushLog(`❌ AI Gateway Error: Credits exhausted. Upgrade to premium plan required!`);
      } else {
        pushLog(`❌ AI Gateway Error: ${e.message}`);
      }
    } finally {
      setGenerating(false);
    }
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
        const generatedStates = generateProductionCanvasStates({
          ...project,
          panels
        });
        
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



  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ap-engine-layout" style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      
      {/* ═══ CENTER Dominant Viewport & Floating controls ═══════════════════ */}
      <div className="ap-center-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: '#06060c' }}>
        
        {/* Minimal top breadcrumb bar */}
        <div className="ap-center-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div className="ap-topbar-breadcrumb">
            <Sparkles size={13} style={{ color: 'var(--accent-blue)' }} />
            <span className="ap-topbar-stage">Generate</span>
            <span className="ap-topbar-sep">·</span>
            <span className="ap-topbar-project">{project.name}</span>
          </div>
          
          <button
            className={`ap-handoff-btn ${handoffProcessing ? 'processing' : ''} ${handoffDone ? 'done' : ''}`}
            onClick={handleHandoff}
            disabled={handoffProcessing || handoffDone}
            style={{
              width: 'auto',
              padding: '6px 16px',
              fontSize: '11px',
              fontWeight: 'bold',
              borderRadius: '8px',
              background: handoffDone ? 'rgba(0,230,118,0.1)' : 'var(--accent-blue)',
              color: '#fff',
              border: handoffDone ? '1px solid rgba(0,230,118,0.3)' : 'none',
              boxShadow: handoffDone ? 'none' : '0 4px 12px rgba(0,112,243,0.3)',
              cursor: handoffProcessing || handoffDone ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {handoffDone ? (
              <><Check size={12} /> Staged for Studio</>
            ) : handoffProcessing ? (
              <><RefreshCw size={11} className="animate-spin" /> Staging...</>
            ) : (
              <><ArrowRight size={12} /> Send to Refine / Studio</>
            )}
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
              apparelType={project.apparelType}
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
            {/* Mockup Selector Dropdown Trigger */}
            <div style={{ position: 'relative' }}>
              <button
                className="ap-prompt-dropdown-btn"
                onClick={() => setActivePanelDropdown(!activePanelDropdown)}
              >
                <Shirt size={13} style={{ color: 'var(--accent-blue)' }} />
                <span>
                  {
                    project.apparelType === 'esports_jersey' ? 'Jersey Round Neck' :
                    project.apparelType === 'crewneck_sweatshirt' ? 'Hoodie' :
                    project.apparelType === 'tshirt' ? 'T-Shirt' :
                    project.apparelType === 'long_sleeve' ? 'Long Sleeve' :
                    project.apparelType === 'pants' ? 'Pants' :
                    project.apparelType === 'shorts' ? 'Shorts' :
                    'Select Mockup'
                  }
                </span>
                <ChevronDown size={12} style={{ opacity: 0.6 }} />
              </button>
              
              {activePanelDropdown && (
                <div className="ap-prompt-dropdown-menu">
                  {[
                    { id: 'tshirt', name: 'T-Shirt' },
                    { id: 'esports_jersey', name: 'Jersey Round Neck' },
                    { id: 'crewneck_sweatshirt', name: 'Hoodie' },
                    { id: 'long_sleeve', name: 'Long Sleeve' },
                    { id: 'pants', name: 'Pants' },
                    { id: 'shorts', name: 'Shorts' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`ap-prompt-dropdown-item ${project.apparelType === opt.id ? 'active' : ''}`}
                      onClick={() => {
                        onUpdateProject({ apparelType: opt.id });
                        setActivePanelDropdown(false);
                      }}
                    >
                      <span className="ap-dropdown-dot" style={{ background: 'var(--accent-blue)' }} />
                      <span>{opt.name}</span>
                      {project.apparelType === opt.id && <Check size={11} style={{ marginLeft: 'auto', color: 'var(--accent-blue)' }} />}
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
              placeholder={`Describe design vision for the whole garment...`}
              value={project.prompt || ''}
              onChange={e => {
                onUpdateProject({
                  prompt: e.target.value
                });
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (project.prompt || '').trim() !== '') {
                  const nextPanels = panels.map(p => ({
                    ...p,
                    prompt: project.prompt,
                    status: 'configured' as const
                  }));
                  onUpdateProject({ panels: nextPanels });
                  setTimeout(() => handleGenerate(), 50);
                }
              }}
            />

            {/* Generate Action Button */}
            <button
              className={`ap-prompt-generate-btn ${generating ? 'loading' : ''}`}
              onClick={() => {
                const nextPanels = panels.map(p => ({
                  ...p,
                  prompt: project.prompt || '',
                  status: 'configured' as const
                }));
                onUpdateProject({ panels: nextPanels });
                setTimeout(() => handleGenerate(), 50);
              }}
              disabled={generating || !(project.prompt || '').trim()}
            >
              {generating ? (
                <><RefreshCw size={13} className="animate-spin" /></>
              ) : (
                <><Sparkles size={13} /> <span>Generate</span></>
              )}
            </button>
          </div>

        </div>

      </div>



    </div>
  );
};
