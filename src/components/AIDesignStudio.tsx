import React, { useState, useEffect, useRef } from 'react';
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


export const ZONE_COLORS: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
  seam: { fill: 'rgba(239,68,68,0.08)', stroke: '#ef4444', label: 'Seam Danger Zone' },
  safe: { fill: 'rgba(234,179,8,0.08)', stroke: '#eab308', label: 'Name/# Safe Zone' },
  sponsor: { fill: 'rgba(0,112,243,0.1)', stroke: '#0070f3', label: 'Sponsor Logo Zone' },
  design: { fill: 'rgba(0,230,118,0.05)', stroke: '#00e676', label: 'Free Design Zone' },
};

const GarmentFlat: React.FC<{
  concepts: GeneratedConcept[];
  selectedDNA: StyleDNA | null;
  apparelType?: string;
  scaleMode?: 'cover' | 'tiled';
}> = ({ concepts, selectedDNA, apparelType, scaleMode = 'cover' }) => {
  const mockupSrc = 
    apparelType === 'esports_jersey' ? '/mockups/jersey_round_neck.png' :
    apparelType === 'crewneck_sweatshirt' ? '/mockups/hoodie.png' :
    apparelType === 'tshirt' ? '/mockups/tshirt.png' :
    apparelType === 'long_sleeve' ? '/mockups/long_sleeve.png' :
    apparelType === 'pants' ? '/mockups/pants.png' :
    apparelType === 'shorts' ? '/mockups/shorts.png' :
    '/mockups/tshirt.png';

  // Show front concept by default; if viewing back panel selector, use back
  const frontConcept = concepts.find(c => c.panelId === 'front');
  const backConcept = concepts.find(c => c.panelId === 'back');

  // Pick the best available design to show (front takes priority)
  const primaryConcept = frontConcept || concepts[0];

  const primaryFill = primaryConcept?.patternUrl 
    ? `url(${primaryConcept.patternUrl})` 
    : (selectedDNA ? `linear-gradient(135deg, ${selectedDNA.primaryColor}, ${selectedDNA.secondaryColor})` : 'transparent');

  const backgroundSize = scaleMode === 'tiled' ? '150px 150px' : 'cover';
  const backgroundRepeat = scaleMode === 'tiled' ? 'repeat' : 'no-repeat';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', maxWidth: '640px' } as any}>
      
      {/* 🌟 MOCKUP IMAGE — always shown */}
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

      {/* 🌟 AI PATTERN OVERLAY — single full-cover over the whole garment */}
      {concepts.length > 0 && primaryConcept?.patternUrl && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
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
            background: primaryFill,
            backgroundSize: backgroundSize,
            backgroundRepeat: backgroundRepeat,
            backgroundPosition: 'center',
            opacity: 0.93,
          }}
        />
      )}

      {/* Back panel generated — compact indicator chip bottom-right */}
      {backConcept?.patternUrl && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '14px',
          zIndex: 10,
          background: 'rgba(6,6,12,0.82)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '4px 10px 4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backdropFilter: 'blur(12px)',
          fontSize: '9px',
          fontWeight: 700,
          color: '#00e676',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            width: '22px',
            height: '15px',
            borderRadius: '3px',
            backgroundImage: `url(${backConcept.patternUrl})`,
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            border: '1px solid rgba(0,230,118,0.25)',
            flexShrink: 0,
          }} />
          Back ✓
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
  const [patternScaleMode, setPatternScaleMode] = useState<'cover' | 'tiled'>('cover');
  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    if (project.panels && project.panels.length > 0) {
      return project.panels;
    }
    return INITIAL_PANELS;
  });
  
  // Track reference image per-panel for part-aware uploads
  const [panelReferences, setPanelReferences] = useState<Record<GarmentPanel, string | null>>({
    front: null,
    back: null,
    'left-sleeve': null,
    'right-sleeve': null,
    collar: null
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = 512;
            canvas.height = 512;
            
            // Draw the entire uploaded image to fit the 512x512 canvas, preserving 100% of graphic detail (like side panels)
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 512, 512);
            const processedDataUrl = canvas.toDataURL('image/png');
            setPanelReferences(prev => ({
              ...prev,
              [activePanel]: processedDataUrl
            }));
            pushLog(`Creative Studio: Reference image for ${activePanel} uploaded and processed`);
          } else {
            setPanelReferences(prev => ({
              ...prev,
              [activePanel]: reader.result as string
            }));
            pushLog(`Creative Studio: Reference image for ${activePanel} uploaded`);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const [selectedDNA] = useState<StyleDNA | null>(null);
  const [concepts, setConcepts] = useState<GeneratedConcept[]>([]);

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


  const updatePanel = (id: GarmentPanel, updates: Partial<PanelConfig>) => {
    const next = panels.map(p => p.id === id ? { ...p, ...updates } : p);
    setPanels(next);
    onUpdateProject({ panels: next });
  };

  const handleGenerate = async (overridePanels?: PanelConfig[]) => {
    const panelsToUse = overridePanels || panels;
    
    // Determine which panels should be generated in this run:
    // 1. The active panel (if configured)
    // 2. Any panel with status === 'configured' (edited but not yet generated)
    let targetPanels = (['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'] as GarmentPanel[]).filter(pid => {
      const panel = panelsToUse.find(p => p.id === pid);
      if (!panel) return false;
      
      // Always generate the active panel if it has a prompt or reference image
      if (pid === activePanel) {
        return panel.prompt.trim() !== '' || panelReferences[pid] !== null;
      }
      
      // Otherwise, only generate if it is configured (edited) but not yet generated
      return panel.status === 'configured' && (panel.prompt.trim() !== '' || panelReferences[pid] !== null);
    });

    // Smart UX Logic: If this is the very first generation in the project (no panels have been generated yet),
    // we want to cohesively generate BOTH Front and Back body panels together by default so the user gets
    // a completed look. Later panel switches act as individual panel refinements.
    const hasAnyGenerated = panelsToUse.some(p => p.status === 'generated' || p.status === 'approved');
    if (!hasAnyGenerated) {
      const isBodyPanel = activePanel === 'front' || activePanel === 'back';
      if (isBodyPanel) {
        if (!targetPanels.includes('front')) targetPanels.push('front');
        if (!targetPanels.includes('back')) targetPanels.push('back');
      }
    }

    if (targetPanels.length === 0) {
      pushLog("AI Engine: No new or active panels are configured for generation.");
      return;
    }

    setGenerating(true);
    onGenerate();
    pushLog(`AI Engine: Generating layout for ${targetPanels.length} configured panel(s): ${targetPanels.join(', ')}`);

    const dna = selectedDNA;

    try {
      const newConcepts: GeneratedConcept[] = [];
      const colors = [
        project.baseColors.primary,
        project.baseColors.secondary,
        project.baseColors.accent || '#ffcc00'
      ];

      // Generate patterns for targeted panels asynchronously via DesignSync AI Gateway
      for (const pid of targetPanels) {
        const panel = panelsToUse.find(p => p.id === pid);
        
        // Cohesive Design Copying: If generating Front and Back together on the first run,
        // make the unconfigured body panel copy the prompt and reference image of the active one.
        let promptToUse = panel?.prompt.trim();
        let referenceToUse = panelReferences[pid];
        if (!hasAnyGenerated && (pid === 'front' || pid === 'back')) {
          const activePanelConfig = panelsToUse.find(p => p.id === activePanel);
          if (!promptToUse && activePanelConfig) {
            promptToUse = activePanelConfig.prompt.trim();
          }
          if (!referenceToUse) {
            referenceToUse = panelReferences[activePanel];
          }
        }

        const basePrompt = promptToUse || (dna ? `${dna.name} sports style: ${dna.description}` : 'sports jersey technical pattern');
        const refinedPrompt = `${basePrompt}, flat vector seamless sports pattern, tileable fabric texture`;

        pushLog(`[Secure AI Router] Routing ${pid} prompt to Replicate (Flux)...`);

        const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${SERVER_URL}/api/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: refinedPrompt,
            providerMode: 'recraft',
            baseColors: colors,
            userId: userId,
            referenceImage: referenceToUse
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
          patternUrl: data.url
        });
      }

      // Merge new concepts into state, retaining other panels' previously generated concepts
      setConcepts(prev => {
        const filtered = prev.filter(c => !targetPanels.includes(c.panelId));
        return [...filtered, ...newConcepts];
      });

      const updatedPanels = panelsToUse.map(p => {
        const concept = newConcepts.find(c => c.panelId === p.id);
        if (concept) {
          return {
            ...p,
            status: 'generated' as const,
            patternUrl: concept.patternUrl
          };
        }
        return p;
      });

      setPanels(updatedPanels);
      onUpdateProject({
        panels: updatedPanels
      });
      pushLog(`✓ Panel layout generated — ${targetPanels.length} panel(s) updated successfully`);
      pushLog(`✓ Zone compliance: seam bleed ${seamBleed}", safe margin ${safeZoneRadius}"`);
    } catch (e: any) {
      console.error(e);
      alert(`AI Generation failed: ${e.message}`);
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

          {/* Floating Left Panel Selector (Part-Aware AI Controller) */}
          <div 
            className="ap-left-floating-toolbar"
            style={{
              position: 'absolute',
              left: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 35,
              background: 'rgba(10, 10, 15, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '12px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              width: '48px',
            }}
          >
            {(['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'] as GarmentPanel[]).map((pid) => {
              const panel = panels.find(p => p.id === pid);
              const isActive = activePanel === pid;
              
              // Define panel-specific status light color
              let statusDot = null;
              if (panel?.status === 'generated' && panel.patternUrl) {
                statusDot = <span style={{ position: 'absolute', top: '3px', right: '3px', width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 6px #00e676' }} />;
              } else if (panel?.prompt || panelReferences[pid]) {
                statusDot = <span style={{ position: 'absolute', top: '3px', right: '3px', width: '6px', height: '6px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 6px #eab308' }} />;
              }

              // Determine icon
              let icon = null;
              if (pid === 'front') {
                icon = (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ap-panel-icon">
                    <path d="M 6,3 L 8,5 L 16,5 L 18,3 L 22,8 L 19,10 L 18,9 L 18,21 L 6,21 L 6,9 L 5,10 L 2,8 Z" />
                    <path d="M 9,5 Q 12,9 15,5" strokeWidth="1.5" />
                  </svg>
                );
              } else if (pid === 'back') {
                icon = (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ap-panel-icon">
                    <path d="M 6,3 L 8,5 L 16,5 L 18,3 L 22,8 L 19,10 L 18,9 L 18,21 L 6,21 L 6,9 L 5,10 L 2,8 Z" />
                    <rect x="9.5" y="9.5" width="5" height="6" rx="0.5" strokeWidth="1.5" />
                  </svg>
                );
              } else if (pid === 'left-sleeve') {
                icon = (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ap-panel-icon">
                    <path d="M 6,3 L 8,5 L 16,5 L 18,3 L 22,8 L 19,10 L 18,9 L 18,21 L 6,21 L 6,9 L 5,10 L 2,8 Z" strokeDasharray="2 2" strokeOpacity="0.4" />
                    <path d="M 6,3 L 2,8 L 5,10 L 6,9 Z" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                );
              } else if (pid === 'right-sleeve') {
                icon = (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ap-panel-icon">
                    <path d="M 6,3 L 8,5 L 16,5 L 18,3 L 22,8 L 19,10 L 18,9 L 18,21 L 6,21 L 6,9 L 5,10 L 2,8 Z" strokeDasharray="2 2" strokeOpacity="0.4" />
                    <path d="M 18,3 L 22,8 L 19,10 L 18,9 Z" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                );
              } else if (pid === 'collar') {
                icon = (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ap-panel-icon">
                    <path d="M 6,3 L 8,5 L 16,5 L 18,3 L 22,8 L 19,10 L 18,9 L 18,21 L 6,21 L 6,9 L 5,10 L 2,8 Z" strokeDasharray="2 2" strokeOpacity="0.4" />
                    <path d="M 8,5 Q 12,10 16,5 Z" fill="currentColor" fillOpacity="0.4" />
                  </svg>
                );
              }

              return (
                <button
                  key={pid}
                  className={`ap-toolbar-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActivePanel(pid)}
                  title={panel?.label || pid}
                  style={{ 
                    position: 'relative', 
                    width: '36px', 
                    height: '36px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '10px',
                    transition: 'all 0.2s',
                    background: isActive ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                    border: isActive ? '1px solid rgba(0, 112, 243, 0.3)' : '1px solid transparent',
                    color: isActive ? 'var(--accent-blue)' : 'rgba(255,255,255,0.6)'
                  }}
                >
                  {icon}
                  {statusDot}
                  
                  {/* Tooltip labels */}
                  <span style={{
                    position: 'absolute',
                    left: '52px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#0a0a0f',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize: '9.5px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.15s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 40
                  }} className="ap-floating-tooltip">
                    {panel?.shortLabel || pid}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Actual Flat Garment SVG Blueprint preview */}
          <div style={{ transform: 'scale(1.02)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <GarmentFlat
              concepts={concepts}
              selectedDNA={selectedDNA}
              apparelType={project.apparelType}
              scaleMode={patternScaleMode}
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
            {/* Design Mapping Mode Button */}
            <button
              className="ap-prompt-dropdown-btn"
              onClick={() => setPatternScaleMode(prev => prev === 'cover' ? 'tiled' : 'cover')}
              title={patternScaleMode === 'cover' ? 'Switch to Tiled Texture Mode' : 'Switch to Full-Panel Placement Mode'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Cpu size={12} style={{ color: patternScaleMode === 'cover' ? '#00ff88' : '#ffcc00' }} />
              <span>{patternScaleMode === 'cover' ? 'Placement (Fit)' : 'Textured (Tile)'}</span>
            </button>

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

            {/* Hidden File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />

            {/* Attachment Button */}
            <button 
              className="ap-prompt-attachment-btn" 
              title={`Attach reference style image specifically for ${activePanel}`}
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              <Paperclip size={15} />
            </button>

            {/* Reference Image Thumbnail Preview */}
            {panelReferences[activePanel] && (
              <div className="ap-prompt-ref-preview">
                <img src={panelReferences[activePanel] || ''} alt="reference" />
                <button 
                  onClick={() => setPanelReferences(prev => ({ ...prev, [activePanel]: null }))} 
                  className="ap-prompt-ref-remove-btn"
                  title="Remove reference image"
                >
                  ×
                </button>
              </div>
            )}

            {/* Prompt Text input field */}
            <input
              type="text"
              className="ap-prompt-textarea"
              placeholder={`Describe design vision for the ${panels.find(p => p.id === activePanel)?.label || activePanel}...`}
              value={panels.find(p => p.id === activePanel)?.prompt || ''}
              onChange={e => {
                updatePanel(activePanel, {
                  prompt: e.target.value,
                  status: e.target.value.trim() ? 'configured' : 'empty'
                });
              }}
              onKeyDown={e => {
                const currentPrompt = panels.find(p => p.id === activePanel)?.prompt || '';
                const hasRefImage = !!panelReferences[activePanel];
                if (e.key === 'Enter' && (currentPrompt.trim() !== '' || hasRefImage)) {
                  handleGenerate(panels);
                }
              }}
            />

            {/* Generate Action Button */}
            <button
              className={`ap-prompt-generate-btn ${generating ? 'loading' : ''}`}
              onClick={() => {
                handleGenerate(panels);
              }}
              disabled={generating || (!panels.some(p => p.prompt.trim() !== '') && !panelReferences[activePanel])}
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
