import React, { useState, useRef, useEffect } from 'react';
import type { Project } from '../types';
import { MockupView } from './MockupView';
import {
  Sparkles, RefreshCw, Upload, ChevronDown, ChevronRight,
  Zap, Type, Maximize2, Shuffle, Layers,
  Check, Clock, Image,
  Wand2, Scissors, AlignCenter, Sliders, Shield,
  Eye, Star, RotateCcw, Send
} from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  prompt: string;
  style: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

interface AiVersion {
  id: string;
  label: string;
  prompt: string;
  presetId: string;
  accentColor: string;
  primaryColor: string;
  secondaryColor: string;
  timestamp: string;
  action?: string;
}

interface AIDesignStudioProps {
  project: Project;
  presets: Preset[];
  aiGenerating: boolean;
  onUpdateProject: (updates: Partial<Project>) => void;
  onPresetSelect: (id: string) => void;
  onGenerate: () => void;
  onHandoffToProduction: () => void;
}

// ─── AI Action Categories ─────────────────────────────────────────────────────

const AI_ACTIONS = [
  {
    id: 'remover',
    label: 'Remover Tools',
    icon: Scissors,
    color: '#ff4d6d',
    tools: [
      { id: 'rm-logo', label: 'Remove Logo', time: '~3s' },
      { id: 'rm-text', label: 'Remove Text', time: '~2s' },
      { id: 'rm-number', label: 'Remove Number', time: '~2s' },
      { id: 'rm-bg', label: 'Remove Background', time: '~5s' },
      { id: 'rm-graphic', label: 'Remove Graphics', time: '~4s' },
    ],
  },
  {
    id: 'font',
    label: 'Font Generator',
    icon: Type,
    color: '#7c3aed',
    tools: [
      { id: 'font-esports', label: 'Esports Typography', time: '~4s' },
      { id: 'font-number', label: 'Jersey Number Style', time: '~3s' },
      { id: 'font-name', label: 'Player Name Style', time: '~3s' },
      { id: 'font-futuristic', label: 'Futuristic Preset', time: '~2s' },
    ],
  },
  {
    id: 'enhance',
    label: 'Enhancement',
    icon: Maximize2,
    color: '#0070f3',
    tools: [
      { id: 'enh-upscale', label: 'Upscale Quality', time: '~8s' },
      { id: 'enh-sharpen', label: 'Sharpen Details', time: '~4s' },
      { id: 'enh-vector', label: 'Vector Enhance', time: '~6s' },
      { id: 'enh-print', label: 'Print Optimization', time: '~5s' },
      { id: 'enh-color', label: 'Color Enhancement', time: '~3s' },
    ],
  },
  {
    id: 'variation',
    label: 'Design Variations',
    icon: Shuffle,
    color: '#00e676',
    tools: [
      { id: 'var-remix', label: 'Remix Design', time: '~6s' },
      { id: 'var-colorway', label: 'Create Colorways', time: '~5s' },
      { id: 'var-alt', label: 'Alternate Versions', time: '~7s' },
      { id: 'var-sleeve', label: 'Matching Sleeves', time: '~4s' },
      { id: 'var-typo', label: 'Alt Typography', time: '~3s' },
    ],
  },
  {
    id: 'apparel',
    label: 'Smart Apparel',
    icon: Shield,
    color: '#f5a623',
    tools: [
      { id: 'app-sleeve', label: 'Sleeve Balancing', time: '~4s' },
      { id: 'app-symmetry', label: 'Symmetry Generate', time: '~5s' },
      { id: 'app-edge', label: 'Edge Cleanup', time: '~3s' },
      { id: 'app-safe', label: 'Print-Safe Adjust', time: '~4s' },
      { id: 'app-align', label: 'Sublimation Align', time: '~3s' },
    ],
  },
];

// ─── Simulated Reference Inspirations ────────────────────────────────────────

const REFERENCE_CHIPS = [
  'Aggressive esports front panel',
  'Gradient sleeve flow',
  'Neon collar accent',
  'Dark sci-fi pattern',
  'Cyber typography burst',
];

export const AIDesignStudio: React.FC<AIDesignStudioProps> = ({
  project,
  presets,
  aiGenerating,
  onUpdateProject,
  onPresetSelect,
  onGenerate,
  onHandoffToProduction,
}) => {
  // ── Local State ──────────────────────────────────────────────────────────────
  const [designCategory, setDesignCategory] = useState<'esports' | 'futuristic'>('esports');
  const [openActions, setOpenActions] = useState<string[]>(['enhance']);
  const [activeToolAction, setActiveToolAction] = useState<string | null>(null);
  const [toolProgress, setToolProgress] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [versions, setVersions] = useState<AiVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [referenceUploaded, setReferenceUploaded] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [handoffProcessing, setHandoffProcessing] = useState<boolean>(false);
  const [handoffDone, setHandoffDone] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upgraded Concept Grid & Momentum states
  const [viewMode, setViewMode] = useState<'detail' | 'grid'>('grid');
  const [activeLoadingMessage, setActiveLoadingMessage] = useState<string>('[AI Engine] Analyzing print canvas...');

  const pushLog = (msg: string) => {
    setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 14)]);
  };

  const loadingMessages = [
    '[AI Engine] Analyzing print canvas...',
    '[Sublimation] Mapping layout zones...',
    '[Vector Art] Balancing sleeve composition...',
    '[Print Safe] Optimizing sponsor alignment...',
    '[Aesthetics] Synthesizing print-safe margins...',
    '[Render] Finalizing 3D blueprint matrices...',
  ];

  useEffect(() => {
    if (!aiGenerating) return;
    let idx = 0;
    setActiveLoadingMessage(loadingMessages[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % loadingMessages.length;
      setActiveLoadingMessage(loadingMessages[idx]);
    }, 400);
    return () => clearInterval(interval);
  }, [aiGenerating]);

  // ── Generate handler ─────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (!project.prompt && !project.selectedPresetId) return;
    onGenerate();
    pushLog(`Generating: "${project.prompt || (presets.find(p => p.id === project.selectedPresetId)?.name ?? '')}"`);

    const preset = presets.find(p => p.id === project.selectedPresetId);
    
    // Construct the combined prompt behind the scenes
    const userPrompt = project.prompt || preset?.prompt || 'Style Preset';
    const apparelName = project.apparelType === 'esports_jersey' ? 'Esports Raglan Jersey' : 'Crewneck Sweatshirt';
    const teamContext = project.teamName ? ` for team '${project.teamName}'` : '';
    const styleContext = project.stylePreference ? ` with a ${project.stylePreference} aesthetic` : '';
    const visionContext = project.designVision ? `. Design Vision: ${project.designVision}` : '';
    
    const colors = `Primary: ${project.baseColors.primary}, Secondary: ${project.baseColors.secondary}, Accent: ${project.baseColors.accent}, Highlight: ${project.baseColors.highlight}`;
    const combinedPrompt = `${userPrompt}${teamContext}${styleContext}. Applied to a ${apparelName} with color palette [${colors}]${visionContext}.`;

    setTimeout(() => {
      const baseId = Date.now();
      const variantSuffixes = [
        { suffix: 'Alpha Core', pColor: project.baseColors.primary, sColor: project.baseColors.secondary, aColor: project.baseColors.accent },
        { suffix: 'Beta Shift', pColor: project.baseColors.secondary, sColor: project.baseColors.primary, aColor: project.baseColors.accent },
        { suffix: 'Gamma Grid', pColor: project.baseColors.primary, sColor: project.baseColors.accent, aColor: project.baseColors.highlight },
        { suffix: 'Delta Apex', pColor: '#121217', sColor: project.baseColors.secondary, aColor: '#00e676' }
      ];

      const generatedVersions: AiVersion[] = variantSuffixes.map((varSpec, index) => ({
        id: `v-${baseId}-${index}`,
        label: `${(project.prompt || preset?.name || 'Concept')} ${varSpec.suffix}`,
        prompt: `${combinedPrompt} (Variation ${varSpec.suffix})`,
        presetId: project.selectedPresetId || '',
        primaryColor: varSpec.pColor,
        secondaryColor: varSpec.sColor,
        accentColor: varSpec.aColor,
        timestamp: new Date().toLocaleTimeString(),
        action: `Generated Concept V${index + 1}`
      }));

      setVersions(prev => [...generatedVersions, ...prev]);
      setActiveVersionId(generatedVersions[0].id); // select the first one by default
      setViewMode('grid'); // switch to grid view to show variations
      pushLog(`✓ Generated 4 distinct style concepts successfully.`);
    }, 1900);
  };

  // ── AI Action Tool handler ───────────────────────────────────────────────────
  const runToolAction = (toolId: string, toolLabel: string, seconds: number) => {
    if (toolProgress[toolId] === 'running') return;
    setActiveToolAction(toolId);
    setToolProgress(prev => ({ ...prev, [toolId]: 'running' }));
    pushLog(`AI Action: ${toolLabel} — processing...`);
    setTimeout(() => {
      setToolProgress(prev => ({ ...prev, [toolId]: 'done' }));
      setActiveToolAction(null);
      pushLog(`✓ ${toolLabel} complete.`);
      // Add result as a new version
      const preset = presets.find(p => p.id === project.selectedPresetId);
      const newVersion: AiVersion = {
        id: `v${Date.now()}`,
        label: `${toolLabel}`,
        prompt: toolLabel,
        presetId: project.selectedPresetId ?? '',
        accentColor: preset?.accentColor ?? project.baseColors.accent,
        primaryColor: preset?.primaryColor ?? project.baseColors.primary,
        secondaryColor: preset?.secondaryColor ?? project.baseColors.secondary,
        timestamp: new Date().toLocaleTimeString(),
        action: toolLabel,
      };
      setVersions(prev => [newVersion, ...prev]);
      setActiveVersionId(newVersion.id);
    }, seconds * 1000);
  };

  // ── Reference Upload ─────────────────────────────────────────────────────────
  const handleReferenceUpload = () => {
    setReferenceUploaded(true);
    pushLog('Reference image uploaded — moodboard analysis complete.');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setReferenceUploaded(true);
    pushLog('Reference image dropped — style analysis active.');
  };

  // ── Production Handoff ───────────────────────────────────────────────────────
  const handleHandoff = () => {
    setHandoffProcessing(true);
    pushLog('Sending approved design to Production Studio...');
    setTimeout(() => {
      pushLog('✓ Artwork mapped to garment templates. Production Studio ready.');
      setHandoffProcessing(false);
      setHandoffDone(true);
      setTimeout(() => onHandoffToProduction(), 800);
    }, 1600);
  };

  // ── Toggle action accordion ──────────────────────────────────────────────────
  const toggleAction = (id: string) => {
    setOpenActions(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const filteredPresets = presets.filter(p =>
    designCategory === 'esports'
      ? ['cyber-hex', 'mech-plate'].includes(p.id)
      : ['glitch-camo', 'retro-grid'].includes(p.id)
  );

  const hasGeneratedContent = versions.length > 0 || !!project.selectedPresetId;
  const activeVersion = versions.find(v => v.id === activeVersionId);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="ai-studio-layout">

      {/* ═══ LEFT PANEL ═══════════════════════════════════════════════════════ */}
      <div className="ai-left-panel">

        {/* Panel Header */}
        <div className="ai-left-header">
          <div className="ai-left-badge"><Sparkles size={9} /> AI DESIGN STUDIO</div>
          <div className="ai-left-title">Apparel Generator</div>
          <div className="ai-left-subtitle">Create, refine, and generate production-ready designs</div>
        </div>

        {/* ── SECTION 1: Prompt Input ── */}
        <div className="ai-section">
          <div className="ai-section-label">
            <Wand2 size={11} /> Prompt
          </div>
          <textarea
            className="ai-prompt-input"
            placeholder={`Describe your jersey design...\ne.g. "Futuristic black and purple esports jersey with flame accents and cyber typography"`}
            value={project.prompt}
            onChange={e => onUpdateProject({ prompt: e.target.value })}
            rows={4}
          />
          <div className="ai-prompt-meta">
            <span className="ai-char-count">{project.prompt.length}/500</span>
          </div>

          {/* Prompt Chips */}
          <div className="ai-chip-row">
            {REFERENCE_CHIPS.map(chip => (
              <button
                key={chip}
                className="ai-chip"
                onClick={() => onUpdateProject({ prompt: chip })}
              >
                + {chip}
              </button>
            ))}
          </div>

          <button
            className={`ai-generate-btn ${aiGenerating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={aiGenerating || (!project.prompt && !project.selectedPresetId)}
          >
            {aiGenerating ? (
              <><RefreshCw size={14} className="animate-spin" /> Generating Design...</>
            ) : (
              <><Sparkles size={14} /> Generate Apparel Design</>
            )}
          </button>
        </div>

        {/* ── SECTION 2: Reference Upload ── */}
        <div className="ai-section">
          <div className="ai-section-label">
            <Image size={11} /> Reference & Moodboard
          </div>
          <div
            className={`ai-reference-zone ${isDragOver ? 'drag-over' : ''} ${referenceUploaded ? 'uploaded' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleReferenceUpload} />
            {referenceUploaded ? (
              <>
                <div className="ai-ref-uploaded-icon"><Check size={16} /></div>
                <div className="ai-ref-uploaded-label">Reference Active</div>
                <div className="ai-ref-uploaded-sub">Style analysis running</div>
              </>
            ) : (
              <>
                <Upload size={20} className="ai-ref-icon" />
                <div className="ai-ref-label">Drop reference image</div>
                <div className="ai-ref-sub">Competitor jersey, moodboard, or inspiration</div>
              </>
            )}
          </div>
          {referenceUploaded && (
            <button className="ai-ref-clear" onClick={() => setReferenceUploaded(false)}>
              ✕ Clear reference
            </button>
          )}
        </div>

        {/* ── SECTION 3: Style Presets ── */}
        <div className="ai-section">
          <div className="ai-section-label">
            <Star size={11} /> Style Presets
          </div>
          <div className="ai-cat-tabs">
            <button
              className={`ai-cat-tab ${designCategory === 'esports' ? 'active' : ''}`}
              onClick={() => setDesignCategory('esports')}
            >Esports</button>
            <button
              className={`ai-cat-tab ${designCategory === 'futuristic' ? 'active' : ''}`}
              onClick={() => setDesignCategory('futuristic')}
            >Streetwear</button>
          </div>
          <div className="ai-presets-grid">
            {filteredPresets.map(preset => (
              <div
                key={preset.id}
                className={`ai-preset-card ${project.selectedPresetId === preset.id ? 'active' : ''}`}
                onClick={() => onPresetSelect(preset.id)}
              >
                <div
                  className="ai-preset-thumb"
                  style={{ background: `linear-gradient(145deg, ${preset.primaryColor}, ${preset.secondaryColor} 60%, ${preset.accentColor}33)` }}
                >
                  <div className="ai-preset-geo" style={{ borderColor: preset.accentColor }} />
                  {project.selectedPresetId === preset.id && (
                    <div className="ai-preset-check" style={{ background: preset.accentColor }}><Check size={8} /></div>
                  )}
                </div>
                <div className="ai-preset-label">{preset.name}</div>
                <div className="ai-preset-accent-bar" style={{ background: preset.accentColor }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 4: AI Actions Toolkit ── */}
        <div className="ai-section ai-section-actions">
          <div className="ai-section-label">
            <Zap size={11} /> AI Actions Toolkit
          </div>
          <div className="ai-actions-list">
            {AI_ACTIONS.map(category => {
              const Icon = category.icon;
              const isOpen = openActions.includes(category.id);
              return (
                <div key={category.id} className="ai-action-category">
                  <button
                    className={`ai-action-header ${isOpen ? 'open' : ''}`}
                    onClick={() => toggleAction(category.id)}
                  >
                    <div className="ai-action-header-left">
                      <div className="ai-action-icon-wrap" style={{ background: `${category.color}18`, border: `1px solid ${category.color}40` }}>
                        <Icon size={11} style={{ color: category.color }} />
                      </div>
                      <span>{category.label}</span>
                    </div>
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {isOpen && (
                    <div className="ai-action-tools">
                      {category.tools.map(tool => {
                        const status = toolProgress[tool.id] ?? 'idle';
                        return (
                          <button
                            key={tool.id}
                            className={`ai-tool-btn ${status}`}
                            onClick={() => {
                              const secs = parseInt(tool.time.replace(/[^0-9]/g, ''), 10);
                              runToolAction(tool.id, tool.label, secs);
                            }}
                            disabled={status === 'running' || activeToolAction !== null}
                          >
                            <span className="ai-tool-name">{tool.label}</span>
                            <span className="ai-tool-time">
                              {status === 'running' ? <RefreshCw size={9} className="animate-spin" /> : status === 'done' ? <Check size={9} style={{ color: '#00e676' }} /> : tool.time}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ═══ CENTER PANEL ═══════════════════════════════════════════════════════ */}
      <div className="ai-center-panel" style={{ background: 'var(--bg-primary)' }}>

        {/* Center Top Bar */}
        <div className="ai-center-topbar">
          <div className="ai-center-title-group">
            <div className="ai-center-badge">
              <Eye size={10} /> {viewMode === 'grid' && versions.length > 0 ? 'CONCEPTS GRID' : 'LIVE PREVIEW'}
            </div>
            <span className="ai-center-title">{project.name}</span>
          </div>
          <div className="ai-center-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* View Mode Toggle Buttons */}
            {versions.length > 0 && (
              <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-muted)', marginRight: '6px' }}>
                <button
                  className={`studio-ctrl-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', background: viewMode === 'grid' ? 'var(--bg-hover)' : 'transparent', border: 'none', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px' }}
                >
                  <Layers size={10} /> Grid View
                </button>
                <button
                  className={`studio-ctrl-btn ${viewMode === 'detail' ? 'active' : ''}`}
                  onClick={() => setViewMode('detail')}
                  style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', background: viewMode === 'detail' ? 'var(--bg-hover)' : 'transparent', border: 'none', color: viewMode === 'detail' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px' }}
                >
                  <Eye size={10} /> Detail View
                </button>
              </div>
            )}

            {activeVersion && (
              <div className="ai-active-version-badge">
                <Check size={10} /> {activeVersion.label}
              </div>
            )}
          </div>
        </div>

        {/* MockupView / Concept Grid wrapper */}
        <div className="ai-mockup-wrapper" style={{ minHeight: '0', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {aiGenerating && (
            <div className="ai-generation-overlay">
              <div className="ai-gen-spinner-wrap">
                <div className="ai-gen-spinner" />
                <div className="ai-gen-label" style={{ textShadow: '0 0 10px rgba(0, 112, 243, 0.4)' }}>
                  {activeLoadingMessage}
                </div>
                <div className="ai-gen-sub">AI is mapping your custom concepts to layout templates</div>
              </div>
            </div>
          )}

          {viewMode === 'grid' && versions.length > 0 ? (
            <div className="ai-concept-grid" style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: '16px',
              padding: '24px',
              height: '100%',
              boxSizing: 'border-box',
              overflowY: 'auto'
            }}>
              {versions.slice(0, 4).map((version, index) => {
                const isActive = activeVersionId === version.id;
                return (
                  <div
                    key={version.id}
                    className={`ai-concept-card ${isActive ? 'active' : ''}`}
                    style={{
                      position: 'relative',
                      background: 'rgba(var(--bg-secondary-rgb), 0.75)',
                      backdropFilter: 'blur(16px)',
                      border: isActive ? '2px solid var(--accent-blue)' : '1px solid var(--border-muted)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: '12px',
                      transition: 'all 0.2s',
                      boxShadow: isActive ? '0 0 20px rgba(var(--accent-blue-rgb), 0.25)' : 'none',
                    }}
                    onClick={() => {
                      setActiveVersionId(version.id);
                      // Update project colors to match this active version!
                      onUpdateProject({
                        baseColors: {
                          ...project.baseColors,
                          primary: version.primaryColor,
                          secondary: version.secondaryColor,
                          accent: version.accentColor
                        }
                      });
                    }}
                  >
                    {/* Visual Card Gradient Header Backdrop */}
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, height: '4px',
                      background: `linear-gradient(90deg, ${version.primaryColor}, ${version.secondaryColor}, ${version.accentColor})`
                    }} />

                    {/* Badge number */}
                    <div style={{ position: 'absolute', top: 10, left: 12, fontSize: '9px', fontWeight: '800', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: version.accentColor, fontFamily: 'monospace' }}>
                      CONCEPT V{index + 1}
                    </div>

                    {/* Miniature Colored Garment SVG Preview */}
                    <div style={{
                      height: '130px',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      margin: '10px 0'
                    }}>
                      <div 
                        style={{
                          position: 'absolute',
                          width: '80px',
                          height: '95px',
                          background: `linear-gradient(135deg, ${version.primaryColor} 0%, ${version.secondaryColor} 60%, ${version.accentColor}33 100%)`,
                          clipPath: project.apparelType === 'esports_jersey'
                            ? 'polygon(20% 15%, 26% 8%, 50% 12%, 74% 8%, 80% 15%, 88% 38%, 78% 40%, 79% 95%, 21% 95%, 22% 40%, 12% 38%)'
                            : project.apparelType === 'hoodie'
                            ? 'polygon(18% 28%, 28% 22%, 50% 25%, 72% 22%, 82% 28%, 92% 52%, 82% 54%, 78% 95%, 22% 95%, 18% 54%, 8% 52%)'
                            : 'polygon(15% 20%, 26% 12%, 50% 16%, 74% 12%, 85% 20%, 92% 42%, 81% 44%, 82% 95%, 18% 95%, 19% 44%, 8% 42%)',
                          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {/* Overlay texture details */}
                        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, #fff 4px, #fff 8px)', mixBlendMode: 'overlay' }} />
                        <svg viewBox="0 0 100 120" style={{ width: '100%', height: '100%', stroke: version.accentColor, strokeWidth: '1.2', fill: 'none', opacity: 0.8 }}>
                          {project.apparelType === 'esports_jersey' && (
                            <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,112 C 60,117 40,117 21,112 L 22,54 L 8,50 Z" />
                          )}
                          {project.apparelType === 'tshirt' && (
                            <path d="M 18,22 C 32,15 68,15 82,22 L 95,48 L 82,51 L 80,110 L 20,110 L 18,51 L 5,48 Z" />
                          )}
                          {project.apparelType === 'hoodie' && (
                            <>
                              <path d="M 18,32 C 32,25 68,25 82,32 L 95,58 L 84,60 L 80,112 L 20,112 L 16,60 L 5,58 Z" />
                              <path d="M 32,29 C 30,10 70,10 68,29 Z" />
                            </>
                          )}
                          {(!project.apparelType || (project.apparelType !== 'esports_jersey' && project.apparelType !== 'tshirt' && project.apparelType !== 'hoodie')) && (
                            <path d="M 20,25 C 35,15 65,15 80,25 L 92,50 L 80,53 L 78,110 L 22,110 L 20,53 L 8,50 Z" />
                          )}
                        </svg>
                      </div>
                    </div>

                    {/* Card Title Label */}
                    <div style={{ width: '100%', textAlign: 'center', marginTop: '4px', zIndex: 2 }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {version.label}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginTop: '2px' }}>
                        {version.action || 'Concept'}
                      </span>
                    </div>

                    {/* Hover Translucent Overlay Action Bar */}
                    <div className="concept-overlay" style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(var(--bg-primary-rgb), 0.96)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: 0,
                      pointerEvents: 'none',
                      transition: 'opacity 0.2s',
                      borderRadius: '12px',
                      padding: '16px',
                      boxSizing: 'border-box'
                    }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: version.accentColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                        V1 Setup Matrix
                      </span>
                      
                      <button
                        className="ai-quick-btn"
                        style={{ width: '100%', padding: '6px', fontSize: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveVersionId(version.id);
                          setViewMode('detail'); // switch to Detail inspect!
                          pushLog(`Inspecting detailed 3D Mockup for ${version.label}`);
                        }}
                      >
                        <Eye size={10} /> Refine & Edit
                      </button>

                      <button
                        className="ai-quick-btn"
                        style={{ width: '100%', padding: '6px', fontSize: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          runToolAction('qk-remix', `Remix ${version.label.split(' ').pop()}`, 4);
                        }}
                      >
                        <RefreshCw size={10} /> Remix Variation
                      </button>

                      <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                        <button
                          className="ai-quick-btn"
                          style={{ flex: 1, padding: '5px', fontSize: '9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            runToolAction('qk-upscale', 'Upscale HD', 5);
                          }}
                        >
                          <Maximize2 size={9} /> Upscale
                        </button>
                        <button
                          className="ai-quick-btn"
                          style={{ flex: 1, padding: '5px', fontSize: '9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Apply style preset
                            onPresetSelect('cyber-hex');
                            pushLog(`Style "Cyber Hex" queued for ${version.label}`);
                          }}
                        >
                          <Sliders size={9} /> Style
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <MockupView project={project} />
          )}
        </div>

        {/* Center Info Bar */}
        {hasGeneratedContent && !aiGenerating && (
          <div className="ai-center-infobar">
            <div className="ai-center-info-item">
              <Layers size={11} />
              <span>{versions.length > 0 ? `${versions.length} version${versions.length > 1 ? 's' : ''} generated` : 'Style preset active'}</span>
            </div>
            <div className="ai-center-info-item">
              <AlignCenter size={11} />
              <span>Sublimation layout ready</span>
            </div>
            <div className="ai-center-info-item">
              <Shield size={11} />
              <span>Print-safe margins: ✓</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ RIGHT PANEL ════════════════════════════════════════════════════════ */}
      <div className="ai-right-panel">

        {/* Right Header */}
        <div className="ai-right-header">
          <span className="ai-right-title">Outputs & Versions</span>
          {versions.length > 0 && (
            <span className="ai-right-count">{versions.length}</span>
          )}
        </div>

        {/* Version History */}
        <div className="ai-versions-list">
          {versions.length === 0 ? (
            <div className="ai-versions-empty">
              <div className="ai-versions-empty-icon"><Sparkles size={22} /></div>
              <div className="ai-versions-empty-label">No outputs yet</div>
              <div className="ai-versions-empty-sub">Generate a design to see versions here</div>
            </div>
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                className={`ai-version-card ${activeVersionId === version.id ? 'active' : ''}`}
                onClick={() => setActiveVersionId(version.id)}
                title={`Behind-the-scenes Prompt:\n${version.prompt}`}
              >
                <div
                  className="ai-version-thumb"
                  style={{ background: `linear-gradient(135deg, ${version.primaryColor}, ${version.secondaryColor} 60%, ${version.accentColor}44)` }}
                >
                  <div className="ai-version-thumb-geo" style={{ borderColor: version.accentColor }} />
                  {activeVersionId === version.id && (
                    <div className="ai-version-active-dot" style={{ background: version.accentColor }} />
                  )}
                </div>
                <div className="ai-version-info">
                  <div className="ai-version-label">{version.label}</div>
                  <div className="ai-version-action">{version.action}</div>
                  <div className="ai-version-time">{version.timestamp}</div>
                </div>
                {activeVersionId === version.id && (
                  <div className="ai-version-active-badge"><Check size={8} /></div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Quick Actions */}
        {versions.length > 0 && (
          <div className="ai-right-quick-actions">
            <div className="ai-right-section-label">Quick Actions</div>
            <button className="ai-quick-btn" onClick={() => runToolAction('qk-remix', 'Remix Active', 4)}>
              <RotateCcw size={11} /> Remix Active
            </button>
            <button className="ai-quick-btn" onClick={() => runToolAction('qk-colorway', 'New Colorway', 4)}>
              <Sliders size={11} /> New Colorway
            </button>
            <button className="ai-quick-btn" onClick={() => runToolAction('qk-upscale', 'Upscale Quality', 5)}>
              <Maximize2 size={11} /> Upscale Quality
            </button>
          </div>
        )}

        {/* Activity Log */}
        <div className="ai-right-log">
          <div className="ai-right-section-label">
            <Clock size={10} /> Studio Log
            <div className={`ai-log-dot ${aiGenerating || activeToolAction ? 'pulsing' : ''}`} />
          </div>
          <div className="ai-log-entries">
            {actionLog.length === 0 ? (
              <div className="ai-log-empty">Activity will appear here.</div>
            ) : (
              actionLog.slice(0, 6).map((entry, i) => (
                <div key={i} className="ai-log-entry">{entry}</div>
              ))
            )}
          </div>
        </div>

        {/* Production Handoff CTA */}
        <div className="ai-handoff-section">
          <div className="ai-handoff-desc">
            Finalize your design and send it to the Production Studio for automatic garment mapping.
          </div>
          <button
            className={`ai-handoff-btn ${handoffProcessing ? 'processing' : ''} ${handoffDone ? 'done' : ''}`}
            onClick={handleHandoff}
            disabled={handoffProcessing || handoffDone}
          >
            {handoffDone ? (
              <><Check size={15} /> Mapped to Production</>
            ) : handoffProcessing ? (
              <><RefreshCw size={14} className="animate-spin" /> Mapping Artwork...</>
            ) : (
              <><Send size={14} /> Send to Production</>
            )}
          </button>
          {!handoffDone && (
            <div className="ai-handoff-meta">
              <div className="ai-handoff-step"><div className="ai-handoff-dot" />Map to garment panels</div>
              <div className="ai-handoff-step"><div className="ai-handoff-dot" />Align sublimation zones</div>
              <div className="ai-handoff-step"><div className="ai-handoff-dot" />Apply print-safe margins</div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
