import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Project, RosterPlayer } from '../types';
import {
  MousePointer2, Type, Square, Hand, Move,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Shield, Ruler,
} from 'lucide-react';
import { AssetsLayersPanel } from './AssetsLayersPanel';
import { RuleEngine } from './RuleEngine';
import { RosterHub } from './RosterHub';
import { FabricCanvas, type FabricCanvasHandle, type FabricLayer, type ToolMode } from './FabricCanvas';
import {
  formatMeasurement, unitLabel, calcSafeZones,
  getGarmentDimensions, type MeasurementUnit, type ObjectBounds,
  type GarmentTemplate
} from '../lib/measurements';
import * as fabric from 'fabric';

// ─── Garment Template Setup ──────────────────────────────────────────────────

const defaultTemplate: GarmentTemplate = {
  id: 'tshirt',
  name: 'T-Shirt',
  category: 'sportswear',
  baseSize: 'M',
  baseMeasurements: {
    frontWidth: 21,
    frontHeight: 30,
    backWidth: 21,
    backHeight: 30,
    sleeveWidth: 10,
    sleeveHeight: 15,
    collarWidth: 14,
    collarHeight: 8
  },
  sizeStep: 2,
  supportedSizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
  files: {
    front: "/templates/tshirt/front.svg",
    back: "/templates/tshirt/back.svg",
    "left-sleeve": "/templates/tshirt/left-sleeve.svg",
    "right-sleeve": "/templates/tshirt/right-sleeve.svg"
  }
};

const getLayoutOffsets = (_template: GarmentTemplate, _size: string) => {
  return {
    sleeves: { x: 60, y: 100 },
    sleeves_right: { x: 1380, y: 100 },
    front: { x: 60, y: 920 },
    back: { x: 1220, y: 920 },
    collar: { x: 920, y: 760 },
    totalW: 2400,
    totalH: 2400
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ProductionStudioProps {
  project: Project;
  activePlayer: RosterPlayer | undefined;
  onUpdateProject: (updates: Partial<Project>) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Inspector
// ─────────────────────────────────────────────────────────────────────────────

interface TextInspectorProps {
  activeObj: fabric.IText | null;
  onApply: (props: Partial<fabric.ITextProps>) => void;
}

const TextInspector: React.FC<TextInspectorProps> = ({ activeObj, onApply }) => {
  const [fontFamily, setFontFamily] = useState(activeObj?.fontFamily ?? 'Outfit');
  const [fontSize, setFontSize] = useState(activeObj?.fontSize ?? 48);
  const [fontWeight, setFontWeight] = useState<string>(String(activeObj?.fontWeight ?? '800'));
  const [textColor, setTextColor] = useState(activeObj?.fill as string ?? '#ffffff');
  const [textAlign, setTextAlign] = useState(activeObj?.textAlign ?? 'center');

  useEffect(() => {
    if (!activeObj) return;
    setFontFamily(activeObj.fontFamily ?? 'Outfit');
    setFontSize(activeObj.fontSize ?? 48);
    setFontWeight(String(activeObj.fontWeight ?? '800'));
    setTextColor(activeObj.fill as string ?? '#ffffff');
    setTextAlign(activeObj.textAlign ?? 'center');
  }, [activeObj]);

  const apply = (patch: Partial<fabric.ITextProps>) => {
    if (!activeObj) return;
    activeObj.set(patch as any);
    activeObj.canvas?.requestRenderAll();
    onApply(patch);
  };

  const applyPreset = (type: 'name' | 'number') => {
    const patch = type === 'name'
      ? { fontFamily: 'Outfit', fontSize: 72, fontWeight: '800', textAlign: 'center', fill: '#ffffff' }
      : { fontFamily: 'monospace', fontSize: 120, fontWeight: '900', textAlign: 'center', fill: '#ffffff' };
    apply(patch as any);
    setFontFamily(patch.fontFamily);
    setFontSize(patch.fontSize);
    setFontWeight(patch.fontWeight);
    setTextAlign(patch.textAlign as 'left' | 'center' | 'right');
    setTextColor('#ffffff');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto', height: '100%' }}>
      {!activeObj && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-disabled)', fontSize: '12px' }}>
          Select a text object on the canvas to edit its properties.
        </div>
      )}

      {/* Presets */}
      <div className="inspector-card">
        <div className="inspector-label">Typography Presets</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="inspector-btn-toggle" style={{ flex: 1 }} onClick={() => applyPreset('name')}>Player Name</button>
          <button className="inspector-btn-toggle" style={{ flex: 1 }} onClick={() => applyPreset('number')}>Player Number</button>
        </div>
      </div>

      {/* Font */}
      <div className="inspector-card">
        <div className="inspector-label">Character</div>
        <div className="inspector-control-group">
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Font Family</label>
          <select
            value={fontFamily}
            onChange={e => { setFontFamily(e.target.value); apply({ fontFamily: e.target.value } as any); }}
            className="inspector-input-dark"
          >
            <option value="Outfit">Outfit (Default)</option>
            <option value="Inter">Inter</option>
            <option value="monospace">Industry Esports</option>
            <option value="Impact">Impact Condensed</option>
            <option value="sans-serif">System Sans</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="inspector-control-group">
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Size (pt)</label>
            <input type="number" value={fontSize} className="inspector-input-dark"
              onChange={e => { const v = Number(e.target.value); setFontSize(v); apply({ fontSize: v } as any); }} />
          </div>
          <div className="inspector-control-group">
            <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Weight</label>
            <select value={fontWeight} className="inspector-input-dark"
              onChange={e => { setFontWeight(e.target.value); apply({ fontWeight: e.target.value } as any); }}>
              <option value="400">Regular</option>
              <option value="700">Bold</option>
              <option value="800">Extra Bold</option>
              <option value="900">Black</option>
            </select>
          </div>
        </div>

        {/* Color */}
        <div className="inspector-control-group">
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Fill Color</label>
          <div className="inspector-control-row">
            <input type="color" value={textColor}
              onChange={e => { setTextColor(e.target.value); apply({ fill: e.target.value } as any); }}
              style={{ width: '32px', height: '32px', border: '1px solid var(--border-muted)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={textColor.toUpperCase()} className="inspector-input-dark"
              onChange={e => { setTextColor(e.target.value); apply({ fill: e.target.value } as any); }}
              style={{ flex: 1, fontFamily: 'monospace' }} />
          </div>
        </div>

        {/* Alignment */}
        <div className="inspector-control-group">
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Alignment</label>
          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-muted)', gap: '2px' }}>
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} onClick={() => { setTextAlign(a); apply({ textAlign: a } as any); }}
                className={`inspector-btn-toggle ${textAlign === a ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {a === 'left' ? <AlignLeft size={12} /> : a === 'center' ? <AlignCenter size={12} /> : <AlignRight size={12} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shape Inspector
// ─────────────────────────────────────────────────────────────────────────────

interface ShapeInspectorProps {
  activeObj: fabric.Rect | null;
  onApply: (props: Record<string, unknown>) => void;
}

const ShapeInspector: React.FC<ShapeInspectorProps> = ({ activeObj, onApply }) => {
  const [fillColor, setFillColor] = useState(activeObj?.fill as string ?? '#0070f3');
  const [strokeColor, setStrokeColor] = useState(activeObj?.stroke as string ?? '#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(activeObj?.strokeWidth ?? 2);
  const [opacity, setOpacity] = useState((activeObj?.opacity ?? 1) * 100);
  const [cornerRadius, setCornerRadius] = useState((activeObj as any)?.rx ?? 8);

  useEffect(() => {
    if (!activeObj) return;
    setFillColor(activeObj.fill as string ?? '#0070f3');
    setStrokeColor(activeObj.stroke as string ?? '#ffffff');
    setStrokeWidth(activeObj.strokeWidth ?? 2);
    setOpacity((activeObj.opacity ?? 1) * 100);
    setCornerRadius((activeObj as any).rx ?? 8);
  }, [activeObj]);

  const apply = (patch: Record<string, unknown>) => {
    if (!activeObj) return;
    activeObj.set(patch as any);
    activeObj.canvas?.requestRenderAll();
    onApply(patch);
  };

  const applyPreset = (preset: 'sponsor' | 'stripe' | 'patch') => {
    const patches: Record<string, Record<string, unknown>> = {
      sponsor: { fill: '#000000', stroke: '#ffffff', strokeWidth: 1, opacity: 0.6, width: 180, height: 60, rx: 4, ry: 4 },
      stripe: { fill: '#0070f3', stroke: '', strokeWidth: 0, opacity: 1, width: 280, height: 14, rx: 0, ry: 0 },
      patch: { fill: '#111115', stroke: '#ffffff', strokeWidth: 2, opacity: 1, width: 96, height: 96, rx: 48, ry: 48 },
    };
    apply(patches[preset]);
    setFillColor(patches[preset].fill as string);
    setStrokeColor(patches[preset].stroke as string);
    setStrokeWidth(patches[preset].strokeWidth as number);
    setOpacity((patches[preset].opacity as number) * 100);
    setCornerRadius(patches[preset].rx as number);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto', height: '100%' }}>
      {!activeObj && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-disabled)', fontSize: '12px' }}>
          Select a shape on the canvas to edit its properties.
        </div>
      )}

      {/* Presets */}
      <div className="inspector-card">
        <div className="inspector-label">Shape Presets</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="inspector-btn-toggle" style={{ fontSize: '10px', flex: 1 }} onClick={() => applyPreset('sponsor')}>Sponsor Box</button>
          <button className="inspector-btn-toggle" style={{ fontSize: '10px', flex: 1 }} onClick={() => applyPreset('stripe')}>Accent Stripe</button>
          <button className="inspector-btn-toggle" style={{ fontSize: '10px', flex: 1 }} onClick={() => applyPreset('patch')}>Round Patch</button>
        </div>
      </div>

      {/* Style */}
      <div className="inspector-card">
        <div className="inspector-label">Style</div>
        <div className="inspector-control-group">
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Fill Color</label>
          <div className="inspector-control-row">
            <input type="color" value={fillColor}
              onChange={e => { setFillColor(e.target.value); apply({ fill: e.target.value }); }}
              style={{ width: '32px', height: '32px', border: '1px solid var(--border-muted)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={fillColor.toUpperCase()} className="inspector-input-dark"
              onChange={e => { setFillColor(e.target.value); apply({ fill: e.target.value }); }}
              style={{ flex: 1, fontFamily: 'monospace' }} />
          </div>
        </div>
        <div className="inspector-control-group">
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Stroke Color</label>
          <div className="inspector-control-row">
            <input type="color" value={strokeColor}
              onChange={e => { setStrokeColor(e.target.value); apply({ stroke: e.target.value }); }}
              style={{ width: '32px', height: '32px', border: '1px solid var(--border-muted)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', padding: 0 }} />
            <input type="text" value={strokeColor.toUpperCase()} className="inspector-input-dark"
              onChange={e => { setStrokeColor(e.target.value); apply({ stroke: e.target.value }); }}
              style={{ flex: 1, fontFamily: 'monospace' }} />
          </div>
        </div>
        <div className="inspector-control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Stroke Width</span>
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{strokeWidth}px</span>
          </div>
          <input type="range" min="0" max="20" step="0.5" value={strokeWidth}
            onChange={e => { const v = Number(e.target.value); setStrokeWidth(v); apply({ strokeWidth: v }); }}
            style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
        </div>
        <div className="inspector-control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Opacity</span>
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{Math.round(opacity)}%</span>
          </div>
          <input type="range" min="0" max="100" value={opacity}
            onChange={e => { const v = Number(e.target.value); setOpacity(v); apply({ opacity: v / 100 }); }}
            style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
        </div>
        <div className="inspector-control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Corner Radius</span>
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{cornerRadius}px</span>
          </div>
          <input type="range" min="0" max="100" value={cornerRadius}
            onChange={e => { const v = Number(e.target.value); setCornerRadius(v); apply({ rx: v, ry: v }); }}
            style={{ width: '100%', accentColor: 'var(--accent-blue)' }} />
        </div>
      </div>
    </div>
  );
};

// Helper functions for merging and splitting single views and master sheet JSON
const splitMasterCanvasJSON = (masterJSONStr: string, offsets: any) => {
  try {
    const master = JSON.parse(masterJSONStr);
    const objects = master.objects || [];
    
    const frontObjects: any[] = [];
    const backObjects: any[] = [];
    const sleevesObjects: any[] = [];
    const collarObjects: any[] = [];

    objects.forEach((obj: any) => {
      if (obj.__isArtboard) return;
      
      const panel = obj.__panel;
      if (!panel) return;

      const newObj = { ...obj };
      delete newObj.__panel;
      delete newObj.clipPath;

      if (panel === 'front') {
        newObj.left -= offsets.front.x;
        newObj.top -= offsets.front.y;
        frontObjects.push(newObj);
      } else if (panel === 'back') {
        newObj.left -= offsets.back.x;
        newObj.top -= offsets.back.y;
        backObjects.push(newObj);
      } else if (panel === 'collar') {
        newObj.left -= offsets.collar.x;
        newObj.top -= offsets.collar.y;
        collarObjects.push(newObj);
      } else if (panel === 'sleeves') {
        newObj.left -= offsets.sleeves.x;
        newObj.top -= offsets.sleeves.y;
        sleevesObjects.push(newObj);
      }
    });

    const createViewState = (objs: any[]) => {
      return JSON.stringify({
        version: master.version,
        objects: objs
      });
    };

    return {
      front: createViewState(frontObjects),
      back: createViewState(backObjects),
      sleeves: createViewState(sleevesObjects),
      collar: createViewState(collarObjects)
    };
  } catch (e) {
    console.error('Failed to split master canvas JSON:', e);
    return null;
  }
};

const createMasterCanvasJSON = (views: { front: string; back: string; sleeves: string; collar: string }, offsets: any) => {
  try {
    const masterObjects: any[] = [];
    let version = '';

    const processView = (jsonStr: string, offsetX: number, offsetY: number, panelKey: string) => {
      if (!jsonStr) return;
      const data = JSON.parse(jsonStr);
      if (data.version) version = data.version;
      const objs = data.objects || [];
      objs.forEach((obj: any) => {
        if (obj.__isArtboard) return;
        const newObj = { ...obj };
        newObj.left += offsetX;
        newObj.top += offsetY;
        newObj.__panel = panelKey;
        masterObjects.push(newObj);
      });
    };

    processView(views.front, offsets.front.x, offsets.front.y, 'front');
    processView(views.back, offsets.back.x, offsets.back.y, 'back');
    processView(views.collar, offsets.collar.x, offsets.collar.y, 'collar');
    processView(views.sleeves, offsets.sleeves.x, offsets.sleeves.y, 'sleeves');
    processView(views.sleeves, offsets.sleeves_right.x, offsets.sleeves_right.y, 'sleeves_right');

    return JSON.stringify({
      version,
      objects: masterObjects
    });
  } catch (e) {
    console.error('Failed to create master canvas JSON:', e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Main ProductionStudio Component
// ─────────────────────────────────────────────────────────────────────────────

export const ProductionStudio: React.FC<ProductionStudioProps> = ({
  project,
  onUpdateProject,
  zoom,
  setZoom,
  pan,
  setPan,
}) => {
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [canvasBg, setCanvasBg] = useState<'white' | 'dark' | 'transparent' | 'checkerboard'>('white');
  const [layers, setLayers] = useState<FabricLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [activeTextObj, setActiveTextObj] = useState<fabric.IText | null>(null);
  const [activeShapeObj, setActiveShapeObj] = useState<fabric.Rect | null>(null);

  // ── Measurement system state ──────────────────────────────────────────────
  const [selectedBounds, setSelectedBounds] = useState<ObjectBounds | null>(null);
  const [showSafeZones, setShowSafeZones] = useState(false);

  // Load templates manifest dynamically
  const [templates, setTemplates] = useState<GarmentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    fetch('/templates/manifest.json')
      .then(res => res.json())
      .then((data: GarmentTemplate[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
        }
        setLoadingTemplates(false);
      })
      .catch(err => {
        console.error('Failed to load templates:', err);
        setLoadingTemplates(false);
      });
  }, []);

  const activeTemplate = React.useMemo(() => {
    return templates.find(t => t.id === project.apparelType) || defaultTemplate;
  }, [templates, project.apparelType]);

  const activePlayer = React.useMemo(() => {
    return project.roster.find(p => p.id === project.activePlayerId);
  }, [project.roster, project.activePlayerId]);

  const activeSize = activePlayer?.size ?? 'M';

  const dims = React.useMemo(() => {
    return getGarmentDimensions(activeTemplate, activeSize);
  }, [activeTemplate, activeSize]);

  const layoutOffsets = React.useMemo(() => {
    return getLayoutOffsets(activeTemplate, activeSize);
  }, [activeTemplate, activeSize]);

  // Current unit from project settings
  const unit: MeasurementUnit = (project.measurementUnit as MeasurementUnit) ?? 'inches';

  // Independent history stacks per view, initialized from project.canvasStates if present
  const undoHistory = useRef<Record<string, string[]>>({
    front: project.canvasStates?.front ? [project.canvasStates.front] : [],
    back: project.canvasStates?.back ? [project.canvasStates.back] : [],
    sleeves: project.canvasStates?.sleeves ? [project.canvasStates.sleeves] : [],
    collar: project.canvasStates?.collar ? [project.canvasStates.collar] : []
  });
  const redoHistory = useRef<Record<string, string[]>>({ front: [], back: [], sleeves: [], collar: [] });
  const currentView = project.activeCanvasView;
  const masterCanvasState = useRef<string>('{"objects":[]}');

  const fabricRef = useRef<FabricCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Artboard dimensions (in pixels at 40px/in) ────────────────────────────
  const CANVAS_W = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'front' || view === 'back') return 1120;
    if (view === 'sleeves') return 960;
    if (view === 'collar') return 560;
    if (view === 'full') return 2400;
    return 1120;
  }, [project.activeCanvasView]);

  const CANVAS_H = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'front' || view === 'back') return 1360;
    if (view === 'sleeves') return 640;
    if (view === 'collar') return 320;
    if (view === 'full') return 2400;
    return 1360;
  }, [project.activeCanvasView]);

  const viewportRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    const el = viewportRef.current;
    if (el) {
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const vwSafe = vw - 22;
      const vhSafe = vh - 22;
      const fitZoom = Math.min(0.95, Math.min(vwSafe / CANVAS_W, vhSafe / CANVAS_H) * 0.88);
      setZoom(fitZoom);
      
      const panX = 22 + (vwSafe / 2 - (CANVAS_W / 2) * fitZoom);
      const panY = 22 + (vhSafe / 2 - (CANVAS_H / 2) * fitZoom);
      setPan({ x: panX, y: panY });
    } else {
      setZoom(0.45);
      setPan({ x: 22, y: 22 });
    }
  }, [CANVAS_W, CANVAS_H, setZoom, setPan]);

  const fitProductionSheetToViewport = useCallback(() => {
    resetView();
  }, [resetView]);

  // Auto-fit on mount
  useEffect(() => {
    const timer = setTimeout(() => resetView(), 120);
    return () => clearTimeout(timer);
  }, [resetView]);

  // Panel sizing (preserved from original)
  const [studioLeftWidth, setStudioLeftWidth] = useState(() => {
    const saved = localStorage.getItem('ds-studio-left-width');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [studioRightWidth, setStudioRightWidth] = useState(() => {
    const saved = localStorage.getItem('ds-studio-right-width');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [studioBottomHeight, setStudioBottomHeight] = useState(() => {
    const saved = localStorage.getItem('ds-studio-bottom-height');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingBottom, setIsDraggingBottom] = useState(false);

  useEffect(() => { localStorage.setItem('ds-studio-left-width', studioLeftWidth.toString()); }, [studioLeftWidth]);
  useEffect(() => { localStorage.setItem('ds-studio-right-width', studioRightWidth.toString()); }, [studioRightWidth]);
  useEffect(() => { localStorage.setItem('ds-studio-bottom-height', studioBottomHeight.toString()); }, [studioBottomHeight]);

  // ── Panel resize handlers ──────────────────────────────────────────────────
  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startW = studioLeftWidth;
    const move = (me: MouseEvent) => setStudioLeftWidth(Math.max(180, Math.min(480, startW + me.clientX - startX)));
    const up = () => { setIsDraggingLeft(false); document.body.style.cursor = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startW = studioRightWidth;
    const move = (me: MouseEvent) => setStudioRightWidth(Math.max(240, Math.min(600, startW + startX - me.clientX)));
    const up = () => { setIsDraggingRight(false); document.body.style.cursor = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const startResizeBottom = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingBottom(true);
    document.body.style.cursor = 'row-resize';
    const startY = e.clientY;
    const startH = studioBottomHeight;
    const move = (me: MouseEvent) => setStudioBottomHeight(Math.max(120, Math.min(500, startH + startY - me.clientY)));
    const up = () => { setIsDraggingBottom(false); document.body.style.cursor = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Prevent shortcuts if typing in any text editor, form inputs, or elements with contenteditable
      const tag = document.activeElement?.tagName;
      const isInputFocused = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement?.hasAttribute('contenteditable');
      if (isInputFocused) return;

      const canvas = fabricRef.current?.getCanvas();
      const activeObj = canvas?.getActiveObject();
      const isEditingText = activeObj && (activeObj as any).isEditing;
      if (isEditingText) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      
      // Ctrl + Z / Ctrl + Shift + Z / Ctrl + Y Undo/Redo
      if (isCtrl) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            fabricRef.current?.redo();
          } else {
            fabricRef.current?.undo();
          }
          return;
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          fabricRef.current?.redo();
          return;
        }
      }

      // Avoid triggering tool keys if modifier keys are pressed
      if (isCtrl || e.shiftKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'v') {
        e.preventDefault();
        setToolMode('select');
      } else if (key === 'h') {
        e.preventDefault();
        setToolMode('hand');
      } else if (key === 'm') {
        e.preventDefault();
        setToolMode('move');
      } else if (key === 't') {
        e.preventDefault();
        setToolMode('text');
      } else if (key === 'r') {
        e.preventDefault();
        setToolMode('shape');
      } else if (key === 'delete' || key === 'backspace') {
        if (canvas && activeObj && !(activeObj as any).__isArtboard) {
          e.preventDefault();
          if (activeObj.type === 'activeSelection') {
            const objects = (activeObj as any).getObjects();
            objects.forEach((obj: any) => {
              canvas.remove(obj);
            });
          } else {
            canvas.remove(activeObj);
          }
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Spacebar temporary Hand tool activation ───────────────────────────────
  const prevToolMode = useRef<ToolMode | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        const tag = document.activeElement?.tagName;
        const isInputFocused = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement?.hasAttribute('contenteditable');
        if (isInputFocused) return;

        const canvas = fabricRef.current?.getCanvas();
        const activeObj = canvas?.getActiveObject();
        const isEditingText = activeObj && (activeObj as any).isEditing;
        if (isEditingText) return;

        // Prevent page scrolling
        e.preventDefault();

        // Save previous tool and set to hand
        if (toolMode !== 'hand' && prevToolMode.current === null) {
          prevToolMode.current = toolMode;
          setToolMode('hand');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        if (prevToolMode.current !== null) {
          setToolMode(prevToolMode.current);
          prevToolMode.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toolMode]);

  const handleSizeChange = (newSize: string) => {
    if (activePlayer) {
      const updatedRoster = project.roster.map(p =>
        p.id === activePlayer.id ? { ...p, size: newSize as any } : p
      );
      onUpdateProject({ roster: updatedRoster });
    }
  };

  // ── Layer change handler ───────────────────────────────────────────────────
  const handleLayersChange = useCallback((newLayers: FabricLayer[]) => {
    setLayers(newLayers);
  }, []);

  // ── Selection change handler ───────────────────────────────────────────────
  const handleSelectionChange = useCallback((layer: FabricLayer | null) => {
    setSelectedLayerId(layer?.id ?? null);
    if (!layer) {
      setActiveTextObj(null);
      setActiveShapeObj(null);
      return;
    }
    const obj = layer.objectRef;
    if (layer.type === 'text') {
      setActiveTextObj(obj as fabric.IText);
      setActiveShapeObj(null);
      setToolMode('text');
    } else if (layer.type === 'shape') {
      setActiveShapeObj(obj as fabric.Rect);
      setActiveTextObj(null);
      setToolMode('shape');
    } else {
      setActiveTextObj(null);
      setActiveShapeObj(null);
    }
  }, []);

  // ── View switching ─────────────────────────────────────────────────────────
  const lastView = useRef<string>(currentView);
  useEffect(() => {
    if (lastView.current !== currentView) {
      // 1. If switching FROM Full Layout view, split and sync back to individual views
      if (lastView.current === 'full') {
        const split = splitMasterCanvasJSON(masterCanvasState.current, layoutOffsets);
        if (split) {
          const pushIfChanged = (key: 'front' | 'back' | 'sleeves' | 'collar', newStateStr: string) => {
            const stack = undoHistory.current[key];
            if (stack.length === 0 || stack[stack.length - 1] !== newStateStr) {
              undoHistory.current[key] = [...stack, newStateStr];
              redoHistory.current[key] = [];
            }
          };
          pushIfChanged('front', split.front);
          pushIfChanged('back', split.back);
          pushIfChanged('sleeves', split.sleeves);
          pushIfChanged('collar', split.collar);
        }
      }

      // 2. If switching TO Full Layout view, construct combined master state from individual views
      if (currentView === 'full') {
        const getLatest = (key: 'front' | 'back' | 'sleeves' | 'collar') => {
          const stack = undoHistory.current[key];
          return stack.length > 0 ? stack[stack.length - 1] : '{"objects":[]}';
        };
        const combined = createMasterCanvasJSON({
          front: getLatest('front'),
          back: getLatest('back'),
          sleeves: getLatest('sleeves'),
          collar: getLatest('collar')
        }, layoutOffsets);
        if (combined) {
          masterCanvasState.current = combined;
        }
      }

      lastView.current = currentView;
      setLayers([]);
      setSelectedLayerId(null);
      setActiveTextObj(null);
      setActiveShapeObj(null);
      setToolMode('select');
      
      // Reset view to fit the new panel size
      if (currentView === 'full') {
        setTimeout(() => fitProductionSheetToViewport(), 50);
      } else {
        setTimeout(() => resetView(), 50);
      }
    }
  }, [currentView, resetView, fitProductionSheetToViewport]);

  // ── Image upload handler ───────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    fabricRef.current?.addImageFromUrl(url, file.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
  };

  const handleAddLogoToCanvas = (url: string, name: string) => {
    fabricRef.current?.addImageFromUrl(url, name.replace(/\.[^.]+$/, ''));
  };

  // ── Inspector right panel determination ───────────────────────────────────
  const getInspectorMode = (): 'text' | 'shape' | 'calibration' => {
    if (toolMode === 'text') return 'text';
    if (toolMode === 'shape') return 'shape';
    return 'calibration';
  };
  const inspectorMode = getInspectorMode();



  // ─────────────────────────────────────────────────────────────────────────
  // TOOLBAR TOOLS
  // ─────────────────────────────────────────────────────────────────────────
  const TOOLS = [
    { id: 'select' as ToolMode, title: 'Selection Tool (V)', icon: <MousePointer2 size={14} /> },
    { id: 'hand' as ToolMode, title: 'Hand Tool (H)', icon: <Hand size={14} /> },
    { id: 'move' as ToolMode, title: 'Move Tool (M)', icon: <Move size={14} /> },
    { id: 'text' as ToolMode, title: 'Text Tool (T)', icon: <Type size={14} /> },
    { id: 'shape' as ToolMode, title: 'Shape Tool (R)', icon: <Square size={14} /> },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/* ── LEFT SIDEBAR: Layers ─────────────────────────────────────────── */}
      <AssetsLayersPanel
        layers={layers}
        selectedLayerId={selectedLayerId}
        onLayerSelect={(id) => { setSelectedLayerId(id); fabricRef.current?.selectObject(id); }}
        onToggleVisibility={(id, cur) => fabricRef.current?.setObjectVisible(id, !cur)}
        onToggleLock={(id, cur) => fabricRef.current?.setObjectLocked(id, !cur)}
        onBringForward={(id) => fabricRef.current?.bringForward(id)}
        onSendBackward={(id) => fabricRef.current?.sendBackward(id)}
        logos={project.logos}
        onAddLogoToCanvas={handleAddLogoToCanvas}
        onNavigateToBrief={() => onUpdateProject({ stage: 'brief' })}
        style={{
          width: `${studioLeftWidth}px`,
          minWidth: `${studioLeftWidth}px`,
          maxWidth: `${studioLeftWidth}px`,
          transition: isDraggingLeft ? 'none' : undefined,
        }}
      />

      {/* Resize handle left */}
      <div onMouseDown={startResizeLeft} className={`resize-handle-vertical ${isDraggingLeft ? 'dragging' : ''}`} />

      {/* ── CENTER WORKSPACE ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* Top Bar: View Tabs + Canvas Controls */}
        <div className="studio-topbar">
          {/* Garment Selector */}
          <div className="studio-ctrl-group">
            <span className="studio-ctrl-label">Garment</span>
            <select
              value={project.apparelType}
              onChange={(e) => onUpdateProject({ apparelType: e.target.value })}
              style={{
                background: '#1c1c28',
                border: '1px solid #2d2d3f',
                color: '#fff',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {loadingTemplates ? (
                <option>Loading...</option>
              ) : (
                templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))
              )}
            </select>
          </div>

          {/* Size Switcher */}
          <div className="studio-ctrl-group">
            <span className="studio-ctrl-label">Size</span>
            <div style={{ display: 'flex', gap: '2px' }}>
              {(activeTemplate.supportedSizes || ["XS", "S", "M", "L", "XL", "2XL", "3XL"]).map(s => (
                <button
                  key={s}
                  className={`studio-ctrl-btn ${activeSize === s ? 'active' : ''}`}
                  onClick={() => handleSizeChange(s)}
                  style={{ padding: '3px 8px', fontSize: '10px' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Panel view tabs */}
          <div style={{ display: 'flex', gap: '4px', borderLeft: '1px solid #1c1c28', paddingLeft: '8px' }}>
            {[
              { id: 'front' as const, label: 'Front Panel' },
              { id: 'back' as const, label: 'Back Panel' },
              ...(activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'] ? [{ id: 'sleeves' as const, label: 'Sleeves' }] : []),
              ...(activeTemplate.files['collar'] ? [{ id: 'collar' as const, label: 'Collar / Neckline' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => onUpdateProject({ activeCanvasView: tab.id })}
                className={`studio-view-tab ${currentView === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Canvas background */}
          <div className="studio-ctrl-group">
            <span className="studio-ctrl-label">Canvas</span>
            {(['white', 'dark', 'transparent', 'checkerboard'] as const).map(bg => (
              <button
                key={bg}
                onClick={() => { setCanvasBg(bg); fabricRef.current?.setBackground(bg); }}
                className={`studio-ctrl-btn ${canvasBg === bg ? 'active' : ''}`}
              >
                {bg === 'checkerboard' ? 'Grid' : bg.charAt(0).toUpperCase() + bg.slice(1)}
              </button>
            ))}
          </div>

          {/* Unit Switcher */}
          <div className="studio-ctrl-group">
            <span className="studio-ctrl-label"><Ruler size={11} /> Unit</span>
            {(['inches', 'cm', 'mm', 'px'] as MeasurementUnit[]).map(u => (
              <button
                key={u}
                className={`studio-ctrl-btn ${unit === u ? 'active' : ''}`}
                onClick={() => onUpdateProject({ measurementUnit: u as any })}
                title={`Switch to ${u}`}
              >
                {u === 'inches' ? 'in' : u}
              </button>
            ))}
          </div>

          {/* Safe Zones Toggle */}
          <div className="studio-ctrl-group">
            <button
              className={`studio-ctrl-btn ${showSafeZones ? 'active' : ''}`}
              onClick={() => setShowSafeZones(v => !v)}
              title="Toggle safe zone overlays (bleed / safe margin / seam)"
            >
              <Shield size={11} /> Safe Zones
            </button>
          </div>

          {/* History (Undo/Redo) controls */}
          <div className="studio-ctrl-group">
            <button className="studio-ctrl-icon-btn" onClick={() => fabricRef.current?.undo()} title="Undo (Ctrl+Z)"><Undo2 size={13} /></button>
            <button className="studio-ctrl-icon-btn" onClick={() => fabricRef.current?.redo()} title="Redo (Ctrl+Shift+Z)"><Redo2 size={13} /></button>
          </div>

        </div>

        {/* Canvas body: Toolbar + Rulers + Viewport */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* ── Vertical Edit Toolbar (Docked) ── */}
          <div style={{
            width: '46px',
            minWidth: '46px',
            background: '#0f0f14',
            borderRight: '1px solid #1c1c28',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            gap: '5px',
            zIndex: 20,
            flexShrink: 0,
          }}>
            {/* ── 5 Main Tools ── */}
            {TOOLS.map(tool => {
              const isActive = toolMode === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => setToolMode(tool.id)}
                  title={tool.title}
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '6px',
                    border: isActive ? '1px solid rgba(0,112,243,0.6)' : '1px solid transparent',
                    background: isActive ? 'rgba(0,112,243,0.18)' : 'transparent',
                    color: isActive ? '#3b9eff' : '#7a7a90',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                    padding: 0,
                  }}
                >
                  {tool.icon}
                </button>
              );
            })}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </div>

          {/* ── Viewport ────────────────────────────────────────────────── */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Canvas viewport area */}
            <div
              ref={viewportRef}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: '#07070a',
                overflow: 'hidden',
                cursor: toolMode === 'hand' ? 'grab' : toolMode === 'text' ? 'text' : toolMode === 'shape' ? 'crosshair' : 'default',
              }}
            >
              {/* ── FABRIC CANVAS ────────────────────────────────────── */}
              <FabricCanvas
                key={`canvas-${currentView}`}
                ref={fabricRef}
                toolMode={toolMode}
                zoom={zoom}
                pan={pan}
                onZoomChange={setZoom}
                onPanChange={setPan}
                onLayersChange={handleLayersChange}
                onSelectionChange={handleSelectionChange}
                onSelectionMeasure={setSelectedBounds}
                canvasBg={canvasBg}
                width={CANVAS_W}
                height={CANVAS_H}
                currentView={currentView}
                unit={unit}
                showSafeZones={showSafeZones}
                safeZones={showSafeZones ? calcSafeZones(
                  CANVAS_W, CANVAS_H,
                  project.rules.bleedInches,
                  project.rules.safeMarginInches,
                  project.rules.seamAllowanceInches,
                ) : undefined}
                initialUndoStack={currentView === 'full' ? [masterCanvasState.current] : (undoHistory.current as any)[currentView]}
                initialRedoStack={currentView === 'full' ? [] : (redoHistory.current as any)[currentView]}
                onHistoryChange={(undoStack, redoStack) => {
                  if (currentView !== 'full') {
                    undoHistory.current[currentView] = undoStack;
                    redoHistory.current[currentView] = redoStack;
                  }
                  const latestState = undoStack[undoStack.length - 1] || '{"objects":[]}';
                  const currentStates = project.canvasStates || {};
                  if (currentView !== 'full' && (currentStates as any)[currentView] !== latestState) {
                    onUpdateProject({
                      canvasStates: {
                        ...currentStates,
                        [currentView]: latestState
                      }
                    });
                  }
                }}
                activeTemplate={activeTemplate}
                activeSize={activeSize}
                offsets={layoutOffsets}
              />

            </div>
          </div>
        </div>


        {/* Horizontal resize handle (bottom panel) */}
        <div onMouseDown={startResizeBottom} className={`resize-handle-horizontal ${isDraggingBottom ? 'dragging' : ''}`} />

        {/* Bottom panel: Roster */}
        <div style={{
          height: `${studioBottomHeight}px`,
          minHeight: `${studioBottomHeight}px`,
          maxHeight: `${studioBottomHeight}px`,
          background: 'var(--bg-primary)',
          overflow: 'hidden',
          zIndex: 10,
          transition: isDraggingBottom ? 'none' : undefined,
        }}>
          <div style={{ padding: '7px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-muted)', fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Team Roster Variations & Output Checks
          </div>
          <div style={{ height: 'calc(100% - 32px)', overflowY: 'auto' }}>
            <RosterHub
              project={project}
              onUpdateRoster={(roster) => onUpdateProject({ roster })}
              onSelectPlayer={(id) => onUpdateProject({ activePlayerId: id })}
            />
          </div>
        </div>
      </div>

      {/* Resize handle right */}
      <div onMouseDown={startResizeRight} className={`resize-handle-vertical ${isDraggingRight ? 'dragging' : ''}`} />

      {/* ── RIGHT SIDEBAR: Dynamic Inspector ─────────────────────────────── */}
      <div className="editor-inspector" style={{
        width: `${studioRightWidth}px`,
        minWidth: `${studioRightWidth}px`,
        maxWidth: `${studioRightWidth}px`,
        transition: isDraggingRight ? 'none' : undefined,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div className="inspector-header">
          <span className="inspector-header-title">
            {inspectorMode === 'text' ? 'Text Inspector' :
              inspectorMode === 'shape' ? 'Shape Inspector' :
                'Calibration Rules'}
          </span>
          {inspectorMode !== 'calibration' && (
            <span className="inspector-header-badge">
              {inspectorMode === 'text' ? 'T' : 'R'}
            </span>
          )}
        </div>

        {/* ── Object Measurement Panel ── */}
        {selectedBounds && (
          <div className="measure-panel">
            <div className="measure-panel-title">📐 Object Measurements</div>
            <div className="measure-grid">
              <div className="measure-row">
                <span className="measure-label">W</span>
                <span className="measure-value">{formatMeasurement(selectedBounds.widthPx, unit)} {unitLabel(unit)}</span>
                <span className="measure-label">H</span>
                <span className="measure-value">{formatMeasurement(selectedBounds.heightPx, unit)} {unitLabel(unit)}</span>
              </div>
              <div className="measure-row">
                <span className="measure-label">X</span>
                <span className="measure-value">{formatMeasurement(selectedBounds.leftPx, unit)} {unitLabel(unit)}</span>
                <span className="measure-label">Y</span>
                <span className="measure-value">{formatMeasurement(selectedBounds.topPx, unit)} {unitLabel(unit)}</span>
              </div>
              {selectedBounds.angleDeg !== 0 && (
                <div className="measure-row">
                  <span className="measure-label">∠</span>
                  <span className="measure-value">{selectedBounds.angleDeg.toFixed(1)}°</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div key={inspectorMode} className="inspector-card-container" style={{ flex: 1, overflowY: 'auto' }}>
          {inspectorMode === 'text' ? (
            <TextInspector
              activeObj={activeTextObj}
              onApply={() => {
                fabricRef.current?.saveHistory();
              }}
            />
          ) : inspectorMode === 'shape' ? (
            <ShapeInspector
              activeObj={activeShapeObj}
              onApply={() => {
                fabricRef.current?.saveHistory();
              }}
            />
          ) : (
            <RuleEngine project={project} onUpdateProject={onUpdateProject} />
          )}
        </div>

        {/* ── Calibration Strip ── */}
        <div className="calibration-strip">
          {(() => {
            const currentDim = dims[currentView] ?? dims.front;
            const dpi = project.dpi ?? 300;
            const cm = project.colorMode ?? 'CMYK';
            return `${currentDim.w} × ${currentDim.h} in  ·  ${dpi} DPI  ·  ${cm}  ·  ${CANVAS_W}×${CANVAS_H} px`;
          })()}
        </div>
      </div>

    </div>
  );
};
