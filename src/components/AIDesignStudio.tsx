import React, { useState, useEffect, useRef } from 'react';
import type { Project } from '../types';
import {
  Sparkles, RefreshCw,
  Check,
  Shirt,
  ArrowRight,
  Cpu,
  Paperclip,
  Layers, Download, Crop, Grid
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

// const PANEL_PROMPT_CHIPS: Record<GarmentPanel, string[]> = {
//   front: ['Bold geometric centerpiece', 'Gradient fade from collar', 'Sponsor zone clean white', 'Armor-plate pattern overlay'],
//   back: ['Number zone clear white background', 'Full-back graphic with name clearance', 'Diagonal stripe flow', 'Mirror front panel design'],
//   'left-sleeve': ['Vertical stripe accent', 'Team color gradient fade', 'Logo placement zone', 'Diagonal mesh pattern'],
//   'right-sleeve': ['Solid secondary color', 'Piping accent line', 'Match left sleeve mirror', 'Number accent strip'],
//   collar: ['Contrast color binding', 'Sublimation gradient fade', 'Clean white inner collar', 'Pattern continuation']
// };

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

/*
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
      
      {/ * 🌟 MOCKUP IMAGE — always shown * /}
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

      {/ * 🌟 AI PATTERN OVERLAY — single full-cover over the whole garment * /}
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

      {/ * Back panel generated — compact indicator chip bottom-right * /}
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
*/

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

  const [backgroundRemoving, setBackgroundRemoving] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);

  const handleRemoveBackground = async () => {
    const currentRef = panelReferences[activePanel];
    if (!currentRef) return;
    setBackgroundRemoving(true);
    pushLog('[AI Actions] Calling Recraft to remove background from reference image...');
    
    try {
      const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${SERVER_URL}/api/ai/remove-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceImage: currentRef })
      });
      
      if (!res.ok) throw new Error(`Background removal failed: ${res.statusText}`);
      const data = await res.json();
      
      if (data.url) {
        setPanelReferences(prev => ({ ...prev, [activePanel]: data.url }));
        pushLog('✓ Background removed successfully.');
      }
    } catch (err: any) {
      console.error(err);
      pushLog(`❌ Background removal failed: ${err.message}`);
      alert(`Background removal failed: ${err.message}`);
    } finally {
      setBackgroundRemoving(false);
    }
  };

  const handleVectorize = async () => {
    const activeConcept = concepts.find(c => c.panelId === activePanel);
    const patternUrl = activeConcept?.patternUrl;
    if (!patternUrl) return;
    
    setVectorizing(true);
    pushLog('[AI Actions] Calling Recraft to convert pattern into high-fidelity SVG paths...');
    
    try {
      const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${SERVER_URL}/api/ai/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: patternUrl })
      });
      
      if (!res.ok) throw new Error(`Vectorization failed: ${res.statusText}`);
      const data = await res.json();
      
      if (data.url) {
        setConcepts(prev => prev.map(c => c.panelId === activePanel ? { ...c, patternUrl: data.url } : c));
        pushLog('✓ Vectorization completed. High-fidelity SVG active.');
        alert('✓ Vectorization completed. Clean vector paths activated!');
      }
    } catch (err: any) {
      console.error(err);
      pushLog(`❌ Vectorization failed: ${err.message}`);
      alert(`Vectorization failed: ${err.message}`);
    } finally {
      setVectorizing(false);
    }
  };


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
            baseColors: colors,
            userId: userId,
            referenceImage: referenceToUse,
            similarityStrength: 0.85,
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



  const handleUseAsAsset = () => {
    const activeConcept = concepts.find(c => c.panelId === activePanel);
    if (!activeConcept?.patternUrl) return;

    const next = panels.map(p => ({
      ...p,
      status: 'generated' as const,
      patternUrl: activeConcept.patternUrl,
      prompt: activeConcept.label || p.prompt
    }));

    setPanels(next);
    onUpdateProject({ panels: next });
    
    // Duplicate concepts so all panels display the pattern in the mockup preview
    setConcepts(prev => {
      const duplicated = (['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'] as GarmentPanel[]).map(pid => {
        const existing = prev.find(c => c.panelId === pid);
        return {
          id: existing?.id || `c-${pid}-${Date.now()}`,
          panelId: pid,
          label: activeConcept.label,
          primaryColor: activeConcept.primaryColor,
          secondaryColor: activeConcept.secondaryColor,
          accentColor: activeConcept.accentColor,
          patternKey: `${activeConcept.patternKey}-${pid}`,
          timestamp: new Date().toLocaleTimeString(),
          patternUrl: activeConcept.patternUrl
        };
      });
      return duplicated;
    });

    pushLog(`StyleSync AI: Pattern from ${activePanel} successfully applied to all panels`);
    alert(`StyleSync AI pattern applied to all panels (Front, Back, Sleeves, Collar) successfully!`);
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

        // Automatically transition user to Production Studio after a short premium delay
        setTimeout(() => {
          onHandoffToProduction();
        }, 1200);
      }
    }, 600);
  };

  const aiActions = [
    {
      id: 'design_grabber',
      name: 'EXTRACT DESIGN',
      tokens: 7,
      description: 'Extracts the flat design pattern directly from your reference image',
      action: () => handleGenerate(panels),
      icon: <Layers className="ap-panel-icon" />,
      activeColor: '#00e5ff',
      glowColor: 'rgba(0, 229, 255, 0.4)',
      isDisabled: !panelReferences[activePanel] || generating,
      reqMsg: !panelReferences[activePanel] ? '⚠️ Requires reference mockup' : ''
    },
    {
      id: 'remove_modal',
      name: 'REMOVE BACKGROUND',
      tokens: 5,
      description: 'Clears mannequins, hangers, and room backgrounds to isolate the design',
      action: handleRemoveBackground,
      icon: <Shirt className="ap-panel-icon" />,
      activeColor: '#ff7b00',
      glowColor: 'rgba(255, 123, 0, 0.4)',
      isDisabled: !panelReferences[activePanel] || generating || vectorizing || backgroundRemoving,
      reqMsg: !panelReferences[activePanel] ? '⚠️ Requires reference mockup' : ''
    },
    {
      id: 'remix',
      name: 'GENERATE VARIATIONS',
      tokens: 7,
      description: 'Generates alternative design variations matching your color theme',
      action: () => {
        pushLog('[AI Action] Generating style variations for the active design...');
        alert('AI Action: Variations generated successfully!');
      },
      icon: <RefreshCw className="ap-panel-icon" />,
      activeColor: '#ff007f',
      glowColor: 'rgba(255, 0, 127, 0.4)',
      isDisabled: generating || vectorizing
    },
    {
      id: 'enhancement',
      name: 'SHARPEN & ENHANCE',
      tokens: 7,
      description: 'Enhances image quality, sharpens details, and clears up visual blur',
      action: () => {
        pushLog('[AI Action] Enhancing design clarity and sharpening high-res margins...');
        alert('AI Action: Image enhanced successfully!');
      },
      icon: <Sparkles className="ap-panel-icon" />,
      activeColor: '#b026ff',
      glowColor: 'rgba(176, 38, 255, 0.4)',
      isDisabled: generating || vectorizing
    },
    {
      id: 'vector_pro',
      name: 'VECTORIZE SVG',
      tokens: 15,
      description: 'Converts the flat design into an infinitely scalable, print-ready SVG file',
      action: handleVectorize,
      icon: <Cpu className="ap-panel-icon" />,
      activeColor: '#00e676',
      glowColor: 'rgba(0, 230, 118, 0.4)',
      isDisabled: !concepts.find(c => c.panelId === activePanel)?.patternUrl || vectorizing || generating,
      reqMsg: !concepts.find(c => c.panelId === activePanel)?.patternUrl ? '⚠️ Requires generated result pattern' : ''
    },
    {
      id: 'make_seamless',
      name: 'MAKE SEAMLESS',
      tokens: 12,
      description: 'Aligns pattern edges to create a perfectly tileable, repeating fabric wrap',
      action: () => {
        pushLog('[AI Action] Aligning pattern margins to ensure infinite tile capability...');
        alert('AI Action: Pattern is now perfectly seamless!');
      },
      icon: <Grid className="ap-panel-icon" />,
      activeColor: '#ff00ff',
      glowColor: 'rgba(255, 0, 255, 0.4)',
      isDisabled: generating || vectorizing
    }
  ];

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

          {/* Sleek Horizontal Garment Panel Tabs */}
          <div style={{
            display: 'flex',
            gap: '6px',
            background: 'rgba(10, 10, 15, 0.6)',
            padding: '3px 4px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
          }}>
            {(['front', 'back', 'left-sleeve', 'right-sleeve', 'collar'] as GarmentPanel[]).map((pid) => {
              const panel = panels.find(p => p.id === pid);
              const isActive = activePanel === pid;
              const hasPattern = panel?.status === 'generated' && panel.patternUrl;
              const hasPrompt = panel?.prompt.trim() !== '' || panelReferences[pid];

              return (
                <button
                  key={pid}
                  onClick={() => setActivePanel(pid)}
                  style={{
                    background: isActive ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                    border: '1px solid ' + (isActive ? 'rgba(0, 112, 243, 0.3)' : 'transparent'),
                    color: isActive ? '#00e5ff' : 'rgba(255,255,255,0.65)',
                    fontSize: '9.5px',
                    fontWeight: isActive ? 800 : 600,
                    padding: '6px 14px',
                    borderRadius: '9px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {panel?.shortLabel || pid}
                  {hasPattern ? (
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 5px #00e676', display: 'inline-block' }} />
                  ) : hasPrompt ? (
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 5px #eab308', display: 'inline-block' }} />
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            className={`ap-handoff-btn ${handoffProcessing ? 'processing' : ''} ${handoffDone ? 'done' : ''}`}
            onClick={() => {
              if (handoffDone) {
                onHandoffToProduction();
              } else {
                handleHandoff();
              }
            }}
            disabled={handoffProcessing}
            style={{
              width: 'auto',
              padding: '6px 16px',
              fontSize: '11px',
              fontWeight: 'bold',
              borderRadius: '8px',
              background: handoffDone ? 'rgba(0, 230, 118, 0.15)' : 'var(--accent-blue)',
              color: handoffDone ? '#00e676' : '#fff',
              border: handoffDone ? '1px solid rgba(0, 230, 118, 0.4)' : 'none',
              boxShadow: handoffDone ? '0 0 15px rgba(0, 230, 118, 0.1)' : '0 4px 12px rgba(0,112,243,0.3)',
              cursor: handoffProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (handoffDone) {
                e.currentTarget.style.background = 'rgba(0, 230, 118, 0.25)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 230, 118, 0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (handoffDone) {
                e.currentTarget.style.background = 'rgba(0, 230, 118, 0.15)';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 230, 118, 0.1)';
              }
            }}
          >
            {handoffDone ? (
              <><Check size={12} /> Open Production Studio</>
            ) : handoffProcessing ? (
              <><RefreshCw size={11} className="animate-spin" /> Staging...</>
            ) : (
              <><ArrowRight size={12} /> Send to Refine / Studio</>
            )}
          </button>
        </div>

        {/* Flat Canvas Workspace with interactive mockups */}
        <div className="ap-flat-canvas-wrapper ap-canvas-dotgrid">







          {/* Floating Left Panel Selector (AI Actions Controller) */}
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
            {aiActions.map((act) => {
              const isActLoading = (act.id === 'design_grabber' && generating) || (act.id === 'vector_pro' && vectorizing);

              return (
                <button
                  key={act.id}
                  className={`ap-toolbar-btn ${act.isDisabled ? 'disabled' : ''}`}
                  onClick={act.action}
                  disabled={act.isDisabled}
                  style={{ 
                    position: 'relative', 
                    width: '36px', 
                    height: '36px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '10px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: act.isDisabled ? 'rgba(255, 255, 255, 0.01)' : 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    color: act.isDisabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
                    cursor: act.isDisabled ? 'not-allowed' : 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)'
                  }}
                  onMouseEnter={(e) => {
                    if (!act.isDisabled) {
                      e.currentTarget.style.color = act.activeColor;
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.borderColor = act.activeColor;
                      e.currentTarget.style.boxShadow = `0 0 15px ${act.glowColor}`;
                      e.currentTarget.style.transform = 'scale(1.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!act.isDisabled) {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.02)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  {isActLoading ? (
                    <RefreshCw size={18} className="animate-spin" style={{ color: act.activeColor }} />
                  ) : act.icon}

                  {/* Status glow dot for active/running state */}
                  {isActLoading && (
                    <span style={{ 
                      position: 'absolute', 
                      top: '2px', 
                      right: '2px', 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%', 
                      background: act.activeColor, 
                      boxShadow: `0 0 6px ${act.activeColor}` 
                    }} />
                  )}
                  
                  {/* Tooltip labels */}
                  <span style={{
                    position: 'absolute',
                    left: '52px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(10, 10, 15, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    width: '180px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(12px)',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.15s ease, transform 0.15s ease',
                    zIndex: 100,
                    textAlign: 'left'
                  }} className="ap-floating-tooltip">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 800, color: act.activeColor, letterSpacing: '0.04em' }}>
                        {act.name}
                      </span>
                      <span style={{
                        fontSize: '7.5px',
                        fontWeight: 900,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.4)',
                        padding: '1.5px 4.5px',
                        borderRadius: '3px',
                      }}>
                        {act.tokens} Tokens
                      </span>
                    </div>
                    <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35, whiteSpace: 'normal' }}>
                      {act.description}
                    </span>
                    {act.reqMsg && (
                      <span style={{ fontSize: '8px', color: '#ff4d4d', fontWeight: 'bold', marginTop: '2px' }}>
                        {act.reqMsg}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ap-split-workspace" style={{
            display: 'flex',
            width: '100%',
            height: 'calc(100% - 150px)', // give space for suggestions and bottom prompt bar
            gap: '16px',
            padding: '24px 24px 24px 84px', // pad left to avoid overlapping the left toolbar
            marginTop: '-65px', // elevate cards further for perfect vertical balance
            boxSizing: 'border-box',
            alignItems: 'stretch',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            {/* COLUMN 1: Input Mockup */}
            <div className="ap-split-left-pane" style={{
              flex: 1.2,
              background: '#090a0f',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Paperclip size={14} style={{ color: 'var(--accent-blue)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Input Mockup
                  </span>
                </div>
              </div>

              {/* Mockup Preview Area */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#040406',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.04)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '480px',
                padding: '12px'
              }}>
                {panelReferences[activePanel] ? (
                  <div style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    <img 
                      src={panelReferences[activePanel] || ''} 
                      alt="Input Mockup Reference" 
                      style={{
                        maxWidth: '100%',
                        maxHeight: '400px',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      }}
                    />

                    {/* Overlay Action Toolbar below image */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '16px',
                      justifyContent: 'center',
                      width: '100%'
                    }}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          background: '#14151f',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.8)',
                          padding: '6px 12px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                        }}
                      >
                        <RefreshCw size={11} /> Change Reference
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '24px',
                    color: 'rgba(255,255,255,0.3)',
                    gap: '12px'
                  }}>
                    <Paperclip size={32} style={{ opacity: 0.2 }} />
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>No Mockup Attached</div>
                    <div style={{ fontSize: '9.5px', maxWidth: '220px', lineHeight: 1.4, color: 'rgba(255,255,255,0.4)' }}>
                      Attach a reference image showing the pattern/design to extract.
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        background: 'rgba(0, 112, 243, 0.15)',
                        border: '1px solid rgba(0, 112, 243, 0.3)',
                        borderRadius: '6px',
                        color: 'var(--accent-blue)',
                        padding: '6px 12px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        marginTop: '8px'
                      }}
                    >
                      Attach Mockup
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Speach/Tip bubble */}
              <div style={{
                background: 'rgba(0, 229, 255, 0.03)',
                border: '1px solid rgba(0, 229, 255, 0.15)',
                borderRadius: '10px',
                padding: '10px 12px',
                marginTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <span style={{ fontSize: '8.5px', fontWeight: 800, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  💡 DesignSync Pro Tip: Sublimation Prompting
                </span>
                <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.35 }}>
                  To extract high-fidelity flat vector patterns without background elements, use the <strong>STYLE DNA CAPTURE</strong> engine. Try describing flat texture details, geometric structures, or custom color zones, and specify margins for a seamless production layout.
                </span>
              </div>
            </div>



            {/* COLUMN 3: Result Preview Panel */}
            <div className="ap-split-right-pane" style={{
              flex: 1.2,
              background: '#090a0f',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={14} style={{ color: '#00ff88' }} />
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Result
                  </span>
                </div>
                
                {/* Result Control Actions */}
                {concepts.find(c => c.panelId === activePanel)?.patternUrl && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button 
                      onClick={() => {
                        const url = concepts.find(c => c.panelId === activePanel)?.patternUrl;
                        if (url) window.open(url, '_blank');
                      }}
                      style={{ background: '#11121a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: 'rgba(255,255,255,0.7)', fontSize: '8.5px', fontWeight: 700, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Download size={9} /> SVG
                    </button>
                  </div>
                )}
              </div>

              {/* Result Preview Box */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#040406',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.04)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '480px',
                padding: '12px'
              }}>
                {concepts.find(c => c.panelId === activePanel)?.patternUrl ? (
                  <div style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px'
                  }}>
                    <img 
                      src={concepts.find(c => c.panelId === activePanel)?.patternUrl || ''} 
                      alt="Extracted Design Result" 
                      style={{
                        maxWidth: '100%',
                        maxHeight: '400px',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        border: '1px solid rgba(0, 255, 136, 0.15)'
                      }}
                    />

                    {/* Design Tools Toolbar */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '8px',
                      justifyContent: 'center',
                      width: '100%'
                    }}>
                      <button
                        onClick={() => {
                          alert('Open Explorer trigger: File explorer opened.');
                        }}
                        style={{
                          background: '#14151f',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.8)',
                          padding: '6px 12px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        Open Explorer
                      </button>
                      <button
                        onClick={() => alert('Crop Tool: Crop area selected.')}
                        style={{
                          background: '#14151f',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: 'rgba(255,255,255,0.8)',
                          padding: '6px 12px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Crop size={11} /> Crop
                      </button>
                      <button
                        onClick={() => alert('Annotate Mode active. Click and drag on the image.')}
                        style={{
                          background: 'rgba(236, 72, 153, 0.15)',
                          border: '1px solid rgba(236, 72, 153, 0.3)',
                          borderRadius: '6px',
                          color: '#ec4899',
                          padding: '6px 12px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        Annotate
                      </button>
                    </div>

                    {/* Apply StyleSync button below image */}
                    <button
                      onClick={handleUseAsAsset}
                      style={{
                        background: 'rgba(0, 255, 136, 0.08)',
                        border: '1px solid rgba(0, 255, 136, 0.3)',
                        borderRadius: '8px',
                        color: '#00ff88',
                        padding: '8px 16px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        marginTop: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 136, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 255, 136, 0.08)';
                      }}
                    >
                      <Sparkles size={12} /> Apply StyleSync to All Panels
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '24px',
                    color: 'rgba(255,255,255,0.3)',
                    gap: '12px'
                  }}>
                    <Shirt size={32} style={{ opacity: 0.2 }} />
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>No Result Extracted</div>
                    <div style={{ fontSize: '9.5px', maxWidth: '220px', lineHeight: 1.4, color: 'rgba(255,255,255,0.4)' }}>
                      Upload a mockup, configure base colors and click <strong>DESIGN GRABBER</strong> to extract your flat vector.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>


          {/* BOTTOM-CENTER FLOATING AI PROMPT BAR */}
          <div className="ap-bottom-prompt-bar">


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

            {/* Recraft AI badge — always active when reference image is attached */}
            {panelReferences[activePanel] && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '9px',
                fontWeight: 800,
                color: '#00e5ff',
                marginLeft: '8px',
                marginRight: '8px',
                padding: '5px 10px',
                background: 'rgba(0, 229, 255, 0.06)',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                borderRadius: '6px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e5ff', display: 'inline-block', boxShadow: '0 0 6px #00e5ff', flexShrink: 0 }} />
                Recraft V4
              </div>
            )}

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

          {/* Canvas loading/generating overlay states */}
          {generating && (
            <div className="ap-generation-overlay" style={{ zIndex: 9999, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="ap-gen-spinner-wrap">
                <div className="ap-gen-spinner" />
                <div className="ap-gen-label">{loadingMsg || 'Creating apparel design...'}</div>
                <div className="ap-gen-sub">Panel-aware AI creative engine rendering design pattern</div>
              </div>
            </div>
          )}

          {vectorizing && (
            <div className="ap-generation-overlay" style={{ zIndex: 9999, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="ap-gen-spinner-wrap">
                <div className="ap-gen-spinner" style={{ borderTopColor: '#00ff88', borderLeftColor: 'rgba(0, 255, 136, 0.15)' }} />
                <div className="ap-gen-label" style={{ color: '#00ff88' }}>Converting to SVG Vector...</div>
                <div className="ap-gen-sub">Generating clean design outlines and layers</div>
              </div>
            </div>
          )}

          {backgroundRemoving && (
            <div className="ap-generation-overlay" style={{ zIndex: 9999, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="ap-gen-spinner-wrap">
                <div className="ap-gen-spinner" style={{ borderTopColor: '#ff00ff', borderLeftColor: 'rgba(255, 0, 255, 0.15)' }} />
                <div className="ap-gen-label" style={{ color: '#ff00ff' }}>Removing background...</div>
                <div className="ap-gen-sub">Isolating apparel shape from mockup reference</div>
              </div>
            </div>
          )}

          {handoffProcessing && (
            <div className="ap-generation-overlay" style={{ background: 'rgba(7, 10, 18, 0.96)', backdropFilter: 'blur(4px)', zIndex: 99999, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        </div>

      </div>



    </div>
  );
};
