import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Project, RosterPlayer, SponsorLogo } from '../types';
import {
  MousePointer2, Type, Square, Hand, Move, Shirt,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Shield, Ruler, Users,
  Upload, Plus, Trash2, AlertTriangle, Cpu, Sparkles, RefreshCw, FileDown, MapPin,
  CheckCircle
} from 'lucide-react';

import { FabricCanvas, type FabricCanvasHandle, type FabricLayer, type ToolMode, setCenterPosition, clampObjectToLimits, clampObjectToSafeZone } from './FabricCanvas';
import { ExportHUD } from './ExportHUD';

import {
  formatMeasurement, unitLabel, calcSafeZones, getAnchorCoords,
  getGarmentDimensions, PX_PER_INCH, type MeasurementUnit, type ObjectBounds,
  type GarmentTemplate, generateProductionCanvasStates
} from '../lib/measurements';
import {
  getArtworkScaleFactor, getTypographyScale, getGarmentScaleFactor,
} from '../lib/garment-size-engine';
import {
  resolvePlayerPanelLayout,
  batchResolveRoster
} from '../lib/production-engine';
import * as fabric from 'fabric';

// ─── Dynamic SVG Jersey Thumbnail Component ──────────────────────────────────
interface MiniJerseyThumbnailProps {
  primaryColor?: string;
  secondaryColor?: string;
  apparelType?: string;
}

const MiniJerseyThumbnail: React.FC<MiniJerseyThumbnailProps> = ({ primaryColor = '#1a1a24', secondaryColor = '#0070f3', apparelType = 'tshirt' }) => {
  const mainColor = primaryColor || '#1a1a24';
  const accentColor = secondaryColor || '#0070f3';

  if (apparelType === 'hoodie') {
    return (
      <svg width="24" height="24" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>
        {/* Sleeves */}
        <path d="M 15 28 L 30 15 L 40 25 L 30 40 L 22 55 L 12 40 Z" fill={accentColor} />
        <path d="M 85 28 L 70 15 L 60 25 L 70 40 L 78 55 L 88 40 Z" fill={accentColor} />
        {/* Main Body */}
        <path d="M 30 20 L 70 20 L 70 85 L 30 85 Z" fill={mainColor} stroke={accentColor} strokeWidth="3" />
        {/* Hood */}
        <path d="M 35 20 Q 50 -2 65 20" fill="none" stroke={accentColor} strokeWidth="5" strokeLinecap="round" />
        <path d="M 42 20 L 50 32 L 58 20" fill="none" stroke={accentColor} strokeWidth="3" />
        {/* Pocket */}
        <path d="M 40 60 L 60 60 L 65 75 L 35 75 Z" fill={accentColor} opacity="0.8" />
      </svg>
    );
  }

  if (apparelType === 'jersey') {
    return (
      <svg width="24" height="24" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>
        {/* Sleeves */}
        <path d="M 15 28 L 32 15 L 42 28 L 22 42 Z" fill={accentColor} />
        <path d="M 85 28 L 68 15 L 58 28 L 78 42 Z" fill={accentColor} />
        {/* Main Body */}
        <path d="M 32 15 L 68 15 L 68 85 C 68 85, 50 88, 32 85 Z" fill={mainColor} stroke={accentColor} strokeWidth="3" />
        {/* Sport stripes */}
        <line x1="40" y1="15" x2="40" y2="85" stroke={accentColor} strokeWidth="3" opacity="0.6" />
        <line x1="60" y1="15" x2="60" y2="85" stroke={accentColor} strokeWidth="3" opacity="0.6" />
        <path d="M 40 15 Q 50 25 60 15" fill="none" stroke={accentColor} strokeWidth="4" />
      </svg>
    );
  }

  // T-shirt (default)
  return (
    <svg width="24" height="24" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>
      {/* Sleeves */}
      <path d="M 18 26 L 33 15 L 43 28 L 26 40 Z" fill={accentColor} />
      <path d="M 82 26 L 67 15 L 57 28 L 74 40 Z" fill={accentColor} />
      {/* Main Body */}
      <path d="M 33 15 L 67 15 L 67 85 L 33 85 Z" fill={mainColor} stroke={accentColor} strokeWidth="3" />
      {/* Crew collar */}
      <path d="M 42 15 A 8 8 0 0 0 58 15" fill="none" stroke={accentColor} strokeWidth="4" />
    </svg>
  );
};

// ─── Excel and CSV Parsers ──────────────────────────────────────────────────
const loadSheetJS = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) {
      resolve((window as any).XLSX);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve((window as any).XLSX);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

const parseCSV = (text: string): any[] => {
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  const results: any[] = [];
  
  const splitCSVLine = (line: string): string[] => {
    const arr: string[] = [];
    let insideQuote = false;
    let entry = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        arr.push(entry.trim().replace(/^["']|["']$/g, ''));
        entry = '';
      } else {
        entry += char;
      }
    }
    arr.push(entry.trim().replace(/^["']|["']$/g, ''));
    return arr;
  };

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = splitCSVLine(line);
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    results.push(obj);
  }
  return results;
};

// ─── Inline Pre-flight Validation ──────────────────────────────────────────
const getPlayerValidationWarning = (player: RosterPlayer, roster: RosterPlayer[]): string | null => {
  if (!player.name || !player.name.trim()) {
    return 'Missing Player Name';
  }
  if (!player.number || !player.number.trim()) {
    return 'Missing Jersey Number';
  }
  if (isNaN(Number(player.number))) {
    return 'Invalid (Numeric Only)';
  }
  if (!player.size) {
    return 'Missing Size Selection';
  }
  if (!player.variant) {
    return 'Missing Variant Design';
  }
  
  // Check for duplicates
  const hasDuplicateNum = roster.some(p => p.id !== player.id && p.number.trim() === player.number.trim());
  if (hasDuplicateNum) {
    return `Duplicate Number (#${player.number})`;
  }

  // Check for safe zone overflow
  if (player.name.length > 12 && (player.size === 'XS' || player.size === 'S')) {
    return 'Exceeds XS/S Safe Width';
  }
  if (player.nameScale < 0.6) {
    return 'Name Squeezed (Zone Overflow)';
  }
  return null;
};

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
  sizeStep: 1, // 1" per step — grading table in garment-size-engine supersedes this
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
  userId?: string;
  onTokenExhausted?: () => void;
  onUpdateTokens?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Inspector
// ─────────────────────────────────────────────────────────────────────────────

interface TextInspectorProps {
  activeObj: fabric.IText | null;
  currentView: string;
  unit: MeasurementUnit;
  canvasW: number;
  canvasH: number;
  project: Project;
  onApply: (props: Partial<fabric.ITextProps>) => void;
}

const TextInspector: React.FC<TextInspectorProps> = ({
  activeObj,
  currentView,
  unit,
  canvasW,
  canvasH,
  project,
  onApply
}) => {
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

      {activeObj && (
        <AnchorPositioner
          activeObj={activeObj}
          currentView={currentView}
          unit={unit}
          width={canvasW}
          height={canvasH}
          project={project}
          onApply={onApply}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shape Inspector
// ─────────────────────────────────────────────────────────────────────────────

interface ShapeInspectorProps {
  activeObj: fabric.Rect | null;
  currentView: string;
  unit: MeasurementUnit;
  canvasW: number;
  canvasH: number;
  project: Project;
  onApply: (props: Record<string, unknown>) => void;
}

const ShapeInspector: React.FC<ShapeInspectorProps> = ({
  activeObj,
  currentView,
  unit,
  canvasW,
  canvasH,
  project,
  onApply
}) => {
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

      {activeObj && (
        <AnchorPositioner
          activeObj={activeObj}
          currentView={currentView}
          unit={unit}
          width={canvasW}
          height={canvasH}
          project={project}
          onApply={onApply}
        />
      )}
    </div>
  );
};

interface LogoInspectorProps {
  activeObj: fabric.Image | null;
  currentView: string;
  unit: MeasurementUnit;
  canvasW: number;
  canvasH: number;
  project: Project;
  onApply: (props: Record<string, unknown>) => void;
}

const LogoInspector: React.FC<LogoInspectorProps> = ({
  activeObj,
  currentView,
  unit,
  canvasW,
  canvasH,
  project,
  onApply
}) => {
  const [scale, setScale] = useState(Math.round((activeObj?.scaleX ?? 1) * 100));
  const [left, setLeft] = useState(Math.round(activeObj?.left ?? 0));
  const [top, setTop] = useState(Math.round(activeObj?.top ?? 0));

  useEffect(() => {
    if (!activeObj) return;
    setScale(Math.round((activeObj.scaleX ?? 1) * 100));
    setLeft(Math.round(activeObj.left ?? 0));
    setTop(Math.round(activeObj.top ?? 0));
  }, [activeObj]);

  const apply = (patch: Record<string, unknown>) => {
    if (!activeObj) return;
    activeObj.set(patch as any);
    activeObj.canvas?.requestRenderAll();
    onApply(patch);
  };

  const centerLogo = () => {
    if (!activeObj) return;
    const w = activeObj.width * (activeObj.scaleX ?? 1);
    const centeredLeft = Math.round((canvasW - w) / 2);
    setLeft(centeredLeft);
    apply({ left: centeredLeft });
  };

  const isHighRes = activeObj?.width && activeObj.width > 200;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto', height: '100%' }}>
      {!activeObj && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-disabled)', fontSize: '12px' }}>
          Select a logo on the canvas to edit its properties.
        </div>
      )}

      {activeObj && (
        <>
          {/* Asset Quality check */}
          <div className="inspector-card" style={{ padding: '12px', borderRadius: '8px' }}>
            <div className="inspector-label" style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Asset Quality Check</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: isHighRes ? 'var(--color-success)' : 'var(--color-warning)',
                boxShadow: `0 0 6px ${isHighRes ? 'var(--color-success)' : 'var(--color-warning)'}`
              }} />
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {isHighRes ? '✓ 300 DPI Production Ready' : '⚠ Low Resolution (72 DPI Warning)'}
              </span>
            </div>
            <p style={{ fontSize: '9px', color: 'var(--text-disabled)', marginTop: '4px', lineHeight: '1.3' }}>
              {isHighRes 
                ? 'Vector or HD raster logo passes pre-flight checks. High fidelity sublimation guaranteed.'
                : 'Sublimation printing requires high density vectors. This asset might print blurred or pixelated.'
              }
            </p>
          </div>

          {/* Position & Scale */}
          <div className="inspector-card" style={{ padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="inspector-label" style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Position & Scaling</div>
            
            <div className="inspector-control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Scale Ratio</span>
                <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{scale}%</span>
              </div>
              <input
                type="range" min="10" max="300" value={scale}
                onChange={e => {
                  const v = Number(e.target.value);
                  setScale(v);
                  apply({ scaleX: v / 100, scaleY: v / 100 });
                }}
                style={{ width: '100%', accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="inspector-control-group">
                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>X Coord (px)</label>
                <input
                  type="number" value={left} className="inspector-input-dark" style={{ width: '100%', borderRadius: '4px', padding: '6px', fontSize: '11px' }}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setLeft(v);
                    apply({ left: v });
                  }}
                />
              </div>
              <div className="inspector-control-group">
                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Y Coord (px)</label>
                <input
                  type="number" value={top} className="inspector-input-dark" style={{ width: '100%', borderRadius: '4px', padding: '6px', fontSize: '11px' }}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setTop(v);
                    apply({ top: v });
                  }}
                />
              </div>
            </div>
          </div>

          {/* Alignment */}
          <div className="inspector-card" style={{ padding: '12px', borderRadius: '8px' }}>
            <div className="inspector-label" style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>Alignment Tools</div>
            <button
              onClick={centerLogo}
              style={{
                width: '100%',
                background: 'var(--accent-blue)',
                border: 'none',
                color: '#fff',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background 0.2s'
              }}
            >
              <Shield size={12} /> Align Chest Center
            </button>
            <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-disabled)', marginTop: '6px', textAlign: 'center', lineHeight: '1.3' }}>
              Centers the selected logo inside the panel's print-safe margins perfectly.
            </span>
          </div>

          <AnchorPositioner
            activeObj={activeObj}
            currentView={currentView}
            unit={unit}
            width={canvasW}
            height={canvasH}
            project={project}
            onApply={onApply}
          />
        </>
      )}
    </div>
  );
};

interface AnchorPositionerProps {
  activeObj: fabric.FabricObject | null;
  currentView: string;
  unit: MeasurementUnit;
  width: number;
  height: number;
  project: Project;
  onApply: (patch: Record<string, any>) => void;
}

const AnchorPositioner: React.FC<AnchorPositionerProps> = ({
  activeObj,
  currentView,
  unit,
  width,
  height,
  project,
  onApply
}) => {
  const [anchor, setAnchor] = useState<string>((activeObj as any)?.__anchor as string ?? '');
  const [offsetX, setOffsetX] = useState<number>((activeObj as any)?.__offsetXInches ?? 0);
  const [offsetY, setOffsetY] = useState<number>((activeObj as any)?.__offsetYInches ?? 0);
  const [restrictToSafe, setRestrictToSafe] = useState<boolean>((activeObj as any)?.__restrictToSafe ?? false);
  const [productionLocked, setProductionLocked] = useState<boolean>((activeObj as any)?.__productionLocked ?? false);

  useEffect(() => {
    if (!activeObj) return;
    const objAny = activeObj as any;
    setAnchor(objAny.__anchor as string ?? '');
    setOffsetX(objAny.__offsetXInches ?? 0);
    setOffsetY(objAny.__offsetYInches ?? 0);
    setRestrictToSafe(objAny.__restrictToSafe ?? false);
    setProductionLocked(objAny.__productionLocked ?? false);
  }, [activeObj]);

  if (!activeObj) return null;

  // Convert internal inches to current unit for displays
  const getUnitMultiplier = () => {
    if (unit === 'cm') return 2.54;
    if (unit === 'mm') return 25.4;
    return 1.0;
  };

  const toDisplayValue = (inches: number) => {
    return parseFloat((inches * getUnitMultiplier()).toFixed(2));
  };

  const fromDisplayValue = (displayVal: number) => {
    return displayVal / getUnitMultiplier();
  };

  const updatePosition = (patch: {
    anchor?: string;
    offsetX?: number;
    offsetY?: number;
    restrict?: boolean;
    locked?: boolean;
  }) => {
    const nextAnchor = patch.anchor !== undefined ? patch.anchor : anchor;
    const nextOffsetX = patch.offsetX !== undefined ? patch.offsetX : offsetX;
    const nextOffsetY = patch.offsetY !== undefined ? patch.offsetY : offsetY;
    const nextRestrict = patch.restrict !== undefined ? patch.restrict : restrictToSafe;
    const nextLocked = patch.locked !== undefined ? patch.locked : productionLocked;

    setAnchor(nextAnchor);
    setOffsetX(nextOffsetX);
    setOffsetY(nextOffsetY);
    setRestrictToSafe(nextRestrict);
    setProductionLocked(nextLocked);

    if (!nextAnchor) {
      activeObj.set({
        __anchor: undefined,
        __restrictToSafe: nextRestrict,
        __productionLocked: nextLocked
      });
      activeObj.canvas?.requestRenderAll();
      onApply({});
      return;
    }

    const anchorCoords = getAnchorCoords(currentView === 'sleeves_right' ? 'sleeves' : currentView, nextAnchor, width, height);
    const targetCx = anchorCoords.x + nextOffsetX * 40;
    const targetCy = anchorCoords.y + nextOffsetY * 40;

    activeObj.set({
      __anchor: nextAnchor,
      __offsetXInches: nextOffsetX,
      __offsetYInches: nextOffsetY,
      __restrictToSafe: nextRestrict,
      __productionLocked: nextLocked
    });

    setCenterPosition(activeObj, targetCx, targetCy);

    const rules = project.rules;
    const bInches = rules?.bleedInches ?? 0.25;
    const sInches = rules?.safeMarginInches ?? 0.5;
    const seamInches = rules?.seamAllowanceInches ?? 0.5;
    const sz = calcSafeZones(width, height, bInches, sInches, seamInches);

    if (nextRestrict && sz.safe) {
      clampObjectToSafeZone(activeObj, width, height, sz);
    } else {
      clampObjectToLimits(activeObj, width, height, sz);
    }

    const finalCenter = activeObj.getCenterPoint();
    const finalOffsetX = Number(((finalCenter.x - anchorCoords.x) / 40).toFixed(3));
    const finalOffsetY = Number(((finalCenter.y - anchorCoords.y) / 40).toFixed(3));

    activeObj.set({
      __offsetXInches: finalOffsetX,
      __offsetYInches: finalOffsetY
    });

    setOffsetX(finalOffsetX);
    setOffsetY(finalOffsetY);

    activeObj.setCoords();
    activeObj.canvas?.requestRenderAll();
    onApply({
      __anchor: nextAnchor,
      __offsetXInches: finalOffsetX,
      __offsetYInches: finalOffsetY,
      __restrictToSafe: nextRestrict,
      __productionLocked: nextLocked
    });
  };

  const handleStepper = (field: 'x' | 'y', direction: number) => {
    const stepInInches = 0.25; // 1/4 inch step
    if (field === 'x') {
      const val = Number((offsetX + direction * stepInInches).toFixed(3));
      updatePosition({ offsetX: val });
    } else {
      const val = Number((offsetY + direction * stepInInches).toFixed(3));
      updatePosition({ offsetY: val });
    }
  };

  const getAnchorOptions = () => {
    let view = currentView === 'sleeves_right' ? 'sleeves' : currentView;
    if (view === 'full' && activeObj) {
      view = (activeObj as any).__panel || 'front';
    }
    if (view === 'sleeves_right') view = 'sleeves';
    if (view === 'front') {
      return [
        { id: 'collar_base', label: 'Collar Base' },
        { id: 'chest_center', label: 'Chest Center' },
        { id: 'left_chest', label: 'Left Chest' },
        { id: 'right_chest', label: 'Right Chest' },
        { id: 'hem_base', label: 'Hem Base' }
      ];
    } else if (view === 'back') {
      return [
        { id: 'collar_base', label: 'Collar Base' },
        { id: 'mid_back', label: 'Mid Back (Number)' },
        { id: 'hem_base', label: 'Hem Base' }
      ];
    } else if (view === 'sleeves') {
      return [
        { id: 'sleeve_cap', label: 'Sleeve Cap' },
        { id: 'sleeve_center', label: 'Sleeve Center' },
        { id: 'sleeve_cuff', label: 'Sleeve Cuff' }
      ];
    } else if (view === 'collar') {
      return [{ id: 'collar_center', label: 'Collar Center' }];
    }
    return [];
  };

  const anchorsList = getAnchorOptions();
  const uLabel = unitLabel(unit);
  
  let mapTitleView = currentView;
  if (mapTitleView === 'full' && activeObj) {
    mapTitleView = (activeObj as any).__panel || 'front';
  }

  return (
    <div style={{ padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-muted)', paddingBottom: '6px' }}>
        <MapPin size={13} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.04em' }}>Production Anchoring</span>
      </div>

      {/* Anchor selection dropdown */}
      <div className="inspector-control-group">
        <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Target Tailoring Anchor</label>
        <select
          value={anchor}
          onChange={e => updatePosition({ anchor: e.target.value, offsetX: 0, offsetY: 0 })}
          className="inspector-input-dark"
          style={{ width: '100%', borderRadius: '4px', padding: '6px', fontSize: '11px' }}
        >
          <option value="">-- Dynamic Freeform --</option>
          {anchorsList.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      {anchor && (
        <>
          {/* Visual Anchor Grid Map */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', background: 'var(--bg-primary)' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', background: '#0a0b10', border: '1px dashed #1d2130', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '8px', color: '#4a4d66', position: 'absolute', top: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{mapTitleView.toUpperCase()} MAP</span>
              
              {/* Anchor dot triggers */}
              {anchorsList.map(opt => {
                let topPos = '50%';
                let leftPos = '50%';
                if (opt.id === 'collar_base') { topPos = '15%'; leftPos = '50%'; }
                else if (opt.id === 'chest_center' || opt.id === 'mid_back' || opt.id === 'sleeve_center') { topPos = '45%'; leftPos = '50%'; }
                else if (opt.id === 'left_chest') { topPos = '35%'; leftPos = '25%'; }
                else if (opt.id === 'right_chest') { topPos = '35%'; leftPos = '75%'; }
                else if (opt.id === 'hem_base' || opt.id === 'sleeve_cuff') { topPos = '80%'; leftPos = '50%'; }
                else if (opt.id === 'sleeve_cap') { topPos = '15%'; leftPos = '50%'; }

                const isCurrent = anchor === opt.id;

                return (
                  <button
                    key={opt.id}
                    title={opt.label}
                    onClick={() => updatePosition({ anchor: opt.id, offsetX: 0, offsetY: 0 })}
                    style={{
                      position: 'absolute',
                      top: topPos,
                      left: leftPos,
                      transform: 'translate(-50%, -50%)',
                      width: isCurrent ? '12px' : '8px',
                      height: isCurrent ? '12px' : '8px',
                      borderRadius: '50%',
                      background: isCurrent ? 'var(--accent-blue)' : '#25293d',
                      border: isCurrent ? '2px solid #ffffff' : '1px solid #3e4461',
                      boxShadow: isCurrent ? '0 0 6px var(--accent-blue)' : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.15s'
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Stepper Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="inspector-control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Offset X</span>
                <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{uLabel}</span>
              </div>
              <div className="rule-stepper" style={{ height: '26px' }}>
                <button className="stepper-btn" onClick={() => handleStepper('x', -1)} style={{ width: '22px', fontSize: '10px' }}>-</button>
                <input
                  type="text"
                  className="stepper-value"
                  value={toDisplayValue(offsetX)}
                  onChange={e => {
                    const parsed = parseFloat(e.target.value);
                    if (!isNaN(parsed)) updatePosition({ offsetX: fromDisplayValue(parsed) });
                  }}
                  style={{ fontSize: '10px' }}
                />
                <button className="stepper-btn" onClick={() => handleStepper('x', 1)} style={{ width: '22px', fontSize: '10px' }}>+</button>
              </div>
            </div>

            <div className="inspector-control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Offset Y</span>
                <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{uLabel}</span>
              </div>
              <div className="rule-stepper" style={{ height: '26px' }}>
                <button className="stepper-btn" onClick={() => handleStepper('y', -1)} style={{ width: '22px', fontSize: '10px' }}>-</button>
                <input
                  type="text"
                  className="stepper-value"
                  value={toDisplayValue(offsetY)}
                  onChange={e => {
                    const parsed = parseFloat(e.target.value);
                    if (!isNaN(parsed)) updatePosition({ offsetY: fromDisplayValue(parsed) });
                  }}
                  style={{ fontSize: '10px' }}
                />
                <button className="stepper-btn" onClick={() => handleStepper('y', 1)} style={{ width: '22px', fontSize: '10px' }}>+</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Constraints switches */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#fff', fontWeight: '500' }}>Restrict to Safe Margins</span>
            <span style={{ fontSize: '8px', color: 'var(--text-disabled)' }}>Clamps bounds inside sewing seam line</span>
          </div>
          <input
            type="checkbox"
            checked={restrictToSafe}
            onChange={e => updatePosition({ restrict: e.target.checked })}
            style={{ cursor: 'pointer', width: '13px', height: '13px' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#fff', fontWeight: '500' }}>Production Align Lock</span>
            <span style={{ fontSize: '8px', color: 'var(--text-disabled)' }}>Locks position and blocks mouse dragging</span>
          </div>
          <input
            type="checkbox"
            checked={productionLocked}
            onChange={e => updatePosition({ locked: e.target.checked })}
            style={{ cursor: 'pointer', width: '13px', height: '13px' }}
          />
        </label>
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

// ─── Modular Roster Studio Subcomponents ──────────────────────────────────────

interface StatusBadgeProps {
  status?: 'Pending' | 'Mapped' | 'Ready for Export' | string;
  isMinimal?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, isMinimal }) => {
  let bg = 'rgba(255,255,255,0.05)';
  let color = 'rgba(255,255,255,0.4)';
  let label = status || 'Mapped';

  if (status === 'Ready for Export') {
    bg = 'rgba(74, 222, 128, 0.1)';
    color = '#4ade80';
    label = isMinimal ? '✓' : '✓ Ready';
  } else if (status === 'Mapped') {
    bg = 'rgba(59, 130, 246, 0.1)';
    color = '#60a5fa';
    label = isMinimal ? 'M' : 'Mapped';
  } else if (status === 'Pending') {
    bg = 'rgba(245, 158, 11, 0.1)';
    color = '#fbbf24';
    label = isMinimal ? 'P' : 'Pending';
  }

  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: '700',
        color,
        background: bg,
        padding: isMinimal ? '1px 3px' : '2px 6px',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
      title={isMinimal ? status : undefined}
    >
      {label}
    </span>
  );
};

interface ProductionProgressBarProps {
  scale: number;
}

const ProductionProgressBar: React.FC<ProductionProgressBarProps> = ({ scale }) => {
  const percentage = Math.round(scale * 100);
  const barColor = scale < 0.7 ? '#f2c94c' : 'var(--color-success)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
      <span style={{ fontSize: '8px', color: 'var(--text-disabled)', fontFamily: 'monospace', letterSpacing: '0.04em', flexShrink: 0 }}>
        SCALE {percentage}%
      </span>
      <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, percentage))}%`,
            background: barColor,
            borderRadius: '2px',
            transition: 'width 0.2s ease-in-out',
          }}
        />
      </div>
    </div>
  );
};

interface RosterToolbarProps {
  sidebarWidth: number;
  rosterEmpty: boolean;
  onGenerateAll: () => void;
  onImportCsv: () => void;
  onImportExcel: () => void;
  onAutoMap: () => void;
  onSync: () => void;
}

const RosterToolbar: React.FC<RosterToolbarProps> = ({
  sidebarWidth,
  rosterEmpty,
  onGenerateAll,
  onImportCsv,
  onImportExcel,
  onAutoMap,
  onSync,
}) => {
  const isMinimal = sidebarWidth < 240;
  const isCompact = sidebarWidth >= 240 && sidebarWidth < 320;

  return (
    <div style={{ padding: isMinimal ? '8px 10px' : '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: '#09090d', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
      {/* Primary CTA */}
      <button
        onClick={onGenerateAll}
        disabled={rosterEmpty}
        title={isMinimal ? "Generate All Variations" : undefined}
        style={{
          width: '100%',
          background: rosterEmpty ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 112, 243, 0.1)',
          border: rosterEmpty ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 112, 243, 0.35)',
          borderRadius: '6px',
          color: rosterEmpty ? 'var(--text-disabled)' : '#3b9eff',
          fontSize: isMinimal ? '10px' : '11px',
          fontWeight: 'bold',
          padding: isMinimal ? '6px 0' : '8px 0',
          cursor: rosterEmpty ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          transition: 'all 0.15s'
        }}
        onMouseEnter={(e) => { if (!rosterEmpty) e.currentTarget.style.background = 'rgba(0, 112, 243, 0.18)'; }}
        onMouseLeave={(e) => { if (!rosterEmpty) e.currentTarget.style.background = 'rgba(0, 112, 243, 0.1)'; }}
      >
        <Sparkles size={11} /> {isMinimal ? "Gen All" : "Generate All Variations"}
      </button>

      {/* Symmetric Grid based on mode */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: isMinimal ? 'repeat(4, 1fr)' : isCompact ? '1fr' : '1fr 1fr', 
          gap: '4px' 
        }}
      >
        <button
          onClick={onImportCsv}
          title="Import CSV"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '9.5px',
            fontWeight: 'bold',
            height: isMinimal ? '22px' : '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: isMinimal ? '0' : '0 4px',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
        >
          <Upload size={9} /> {!isMinimal && "CSV"}
        </button>
        <button
          onClick={onImportExcel}
          title="Import Excel"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '9.5px',
            fontWeight: 'bold',
            height: isMinimal ? '22px' : '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: isMinimal ? '0' : '0 4px',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
        >
          <FileDown size={9} /> {!isMinimal && "Excel"}
        </button>
        <button
          onClick={onAutoMap}
          disabled={rosterEmpty}
          title="Auto Map Layers"
          style={{
            background: 'transparent',
            border: rosterEmpty ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            color: rosterEmpty ? 'var(--text-disabled)' : 'var(--text-secondary)',
            fontSize: '9.5px',
            fontWeight: 'bold',
            height: isMinimal ? '22px' : '24px',
            cursor: rosterEmpty ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: isMinimal ? '0' : '0 4px',
            opacity: rosterEmpty ? 0.4 : 1
          }}
          onMouseEnter={(e) => { if (!rosterEmpty) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
          onMouseLeave={(e) => { if (!rosterEmpty) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
        >
          <MapPin size={9} /> {!isMinimal && "Auto Map"}
        </button>
        <button
          onClick={onSync}
          disabled={rosterEmpty}
          title="Sync Design"
          style={{
            background: 'transparent',
            border: rosterEmpty ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            color: rosterEmpty ? 'var(--text-disabled)' : 'var(--text-secondary)',
            fontSize: '9.5px',
            fontWeight: 'bold',
            height: isMinimal ? '22px' : '24px',
            cursor: rosterEmpty ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: isMinimal ? '0' : '0 4px',
            opacity: rosterEmpty ? 0.4 : 1
          }}
          onMouseEnter={(e) => { if (!rosterEmpty) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
          onMouseLeave={(e) => { if (!rosterEmpty) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
        >
          <RefreshCw size={9} /> {!isMinimal && "Sync"}
        </button>
      </div>
    </div>
  );
};

interface AddPlayerCardProps {
  onAdd: () => void;
  isMinimal: boolean;
}

const AddPlayerCard: React.FC<AddPlayerCardProps> = ({ onAdd, isMinimal }) => {
  return (
    <button
      onClick={onAdd}
      style={{
        width: '100%',
        background: 'transparent',
        border: '1px dashed rgba(255,255,255,0.08)',
        borderRadius: '6px',
        color: 'var(--text-secondary)',
        fontSize: '10px',
        fontWeight: '600',
        padding: isMinimal ? '5px 0' : '8px 0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        transition: 'all 0.15s',
        marginBottom: '4px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0, 112, 243, 0.35)';
        e.currentTarget.style.color = '#3b9eff';
        e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 112, 243, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.color = 'var(--text-secondary)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Plus size={11} /> {isMinimal ? "Add" : "Add Player Row"}
    </button>
  );
};

interface PlayerRosterCardProps {
  sidebarWidth: number;
  player: RosterPlayer;
  isActive: boolean;
  warning: string | null;
  roster: RosterPlayer[];
  primaryColor: string;
  secondaryColor: string;
  apparelType: string;
  logos: SponsorLogo[];
  onActivate: () => void;
  onFieldChange: (id: string, field: keyof RosterPlayer, value: any) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

const PlayerRosterCard: React.FC<PlayerRosterCardProps> = ({
  sidebarWidth,
  player,
  isActive,
  warning,
  primaryColor,
  secondaryColor,
  apparelType,
  logos,
  onActivate,
  onFieldChange,
  onDelete,
}) => {
  const isReady = player.status === 'Ready for Export';
  const isMinimal = sidebarWidth < 240;

  return (
    <div
      onClick={onActivate}
      style={{
        background: isActive ? 'rgba(0, 112, 243, 0.03)' : 'transparent',
        border: isActive ? '1px solid rgba(0, 112, 243, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
        borderRadius: '6px',
        padding: isMinimal ? '4px 6px' : '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: isActive ? '6px' : '0px',
        transition: 'all 0.15s',
        boxShadow: isActive ? '0 0 10px rgba(0,112,243,0.05)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
      }}
    >
      {/* ROW 1: TOP ROW (Saves real estate by auto-collapsing decorative elements) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMinimal ? '3px' : '6px', minWidth: 0, flex: 1 }}>
          {/* Active selection dot */}
          <div
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: isActive ? 'var(--accent-blue)' : 'transparent',
              border: isActive ? 'none' : '1px solid rgba(255,255,255,0.2)',
              boxShadow: isActive ? '0 0 4px var(--accent-blue)' : 'none',
              flexShrink: 0
            }}
          />
          
          {!isMinimal && (
            <MiniJerseyThumbnail
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              apparelType={apparelType}
            />
          )}
          
          {/* Responsive Typo & scanning priority */}
          <span 
            style={{ 
              fontSize: isMinimal ? '9.5px' : '11px', 
              fontWeight: '800', 
              color: isActive ? '#fff' : 'rgba(255,255,255,0.85)', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap', 
              textTransform: 'uppercase' 
            }}
          >
            {player.name || 'UNNAMED'}
          </span>
          
          <span style={{ fontSize: isMinimal ? '9px' : '10px', fontWeight: '700', color: 'var(--accent-blue)', fontFamily: 'monospace', flexShrink: 0 }}>
            #{player.number || '0'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMinimal ? '3px' : '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '9px', fontWeight: '600', color: 'var(--text-disabled)', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: '3px' }}>
            {player.size === 'XXL' ? '2XL' : player.size}
          </span>
          
          <StatusBadge status={player.status} isMinimal={isMinimal} />
        </div>
      </div>

      {/* Expanded view controls (Adapts vertical rhythm dynamically) */}
      {isActive && (
        <div 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '6px', 
            borderTop: '1px solid rgba(255,255,255,0.06)', 
            paddingTop: '6px', 
            marginTop: '2px' 
          }} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* ROW 2: Compact input grid (Name, Number, Delete) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 24px', gap: '4px', alignItems: 'center' }}>
            <input
              type="text"
              value={player.name}
              onChange={(e) => onFieldChange(player.id, 'name', e.target.value)}
              placeholder="NAME"
              style={{
                background: '#0d111d',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '10px',
                color: '#fff',
                outline: 'none',
                textTransform: 'uppercase',
                width: '100%',
                boxSizing: 'border-box'
              }}
            />
            
            <input
              type="text"
              value={player.number}
              onChange={(e) => onFieldChange(player.id, 'number', e.target.value)}
              placeholder="00"
              style={{
                background: '#0d111d',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                padding: '4px 2px',
                fontSize: '10px',
                color: 'var(--accent-blue)',
                outline: 'none',
                textAlign: 'center',
                fontFamily: 'monospace',
                width: '100%',
                boxSizing: 'border-box'
              }}
            />
            
            <button
              onClick={(e) => onDelete(player.id, e)}
              style={{
                width: '24px',
                height: '24px',
                background: 'transparent',
                border: '1px solid rgba(235, 87, 87, 0.2)',
                borderRadius: '4px',
                color: '#eb5757',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(235, 87, 87, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              title="Delete Player"
            >
              <Trash2 size={11} />
            </button>
          </div>

          {/* ROW 3: Controls dropdown grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            <select
              value={player.size}
              onChange={(e) => onFieldChange(player.id, 'size', e.target.value)}
              style={{ background: '#0d111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '3px 4px', fontSize: '9.5px', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer', width: '100%' }}
            >
              <option value="XS">XS</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
              <option value="XXL">2XL</option>
              <option value="3XL">3XL</option>
            </select>

            <select
              value={player.variant || 'Variant A'}
              onChange={(e) => onFieldChange(player.id, 'variant', e.target.value)}
              style={{ background: '#0d111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '3px 4px', fontSize: '9.5px', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer', width: '100%' }}
            >
              <option value="Variant A">Variant A</option>
              <option value="Variant B">Variant B</option>
              <option value="Variant C">Variant C</option>
            </select>

            <select
              value={player.status || 'Mapped'}
              onChange={(e) => onFieldChange(player.id, 'status', e.target.value)}
              style={{ 
                background: '#0d111d', 
                border: '1px solid rgba(255,255,255,0.08)', 
                borderRadius: '4px', 
                padding: '3px 4px', 
                fontSize: '9.5px', 
                color: isReady ? 'var(--color-success)' : 'var(--accent-blue)', 
                outline: 'none', 
                cursor: 'pointer', 
                fontWeight: 'bold',
                width: '100%' 
              }}
            >
              <option value="Pending">Pending</option>
              <option value="Mapped">Mapped</option>
              <option value="Ready for Export">Ready</option>
            </select>
          </div>

          {/* Optional Sponsor Logo Mapping Checkboxes */}
          {logos.length > 0 && (
            <div style={{
              marginTop: '2px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: '6px'
            }}>
              <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: 'var(--text-disabled)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Logo Mapping</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {logos.map(logo => {
                  const isMapped = player.sponsorMapping ? player.sponsorMapping.includes(logo.id) : true;
                  return (
                    <label key={logo.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8.5px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', padding: '2px 4px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.05)', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={isMapped}
                        onChange={(e) => {
                          const currentMapping = player.sponsorMapping || logos.map(l => l.id);
                          let newMapping: string[];
                          if (e.target.checked) {
                            newMapping = [...currentMapping, logo.id];
                          } else {
                            newMapping = currentMapping.filter(id => id !== logo.id);
                          }
                          onFieldChange(player.id, 'sponsorMapping', newMapping);
                        }}
                        style={{ margin: 0, width: '10px', height: '10px', cursor: 'pointer' }}
                      />
                      {logo.name.replace(/_Primary|_Sponsor|_Web/g, '').substring(0, 12)}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Validation Warnings / Progress */}
          <div>
            {warning ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(235,87,87,0.05)',
                border: '1px solid rgba(235,87,87,0.15)',
                color: '#eb5757',
                fontSize: '8.5px',
                padding: '4px 6px',
                borderRadius: '4px',
                fontWeight: 'bold'
              }}>
                <AlertTriangle size={8.5} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{warning}</span>
              </div>
            ) : (
              <ProductionProgressBar scale={player.nameScale} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface RosterSidebarProps {
  sidebarWidth: number;
  project: Project;
  warningChecker: (player: RosterPlayer, roster: RosterPlayer[]) => string | null;
  onUpdateProject: (updates: Partial<Project>) => void;
  onAddDefaultPlayer: () => void;
  onRosterImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBulkGenerate: () => void;
  onAutoMap: () => void;
  onBulkSync: () => void;
  onDeletePlayer: (id: string, e: React.MouseEvent) => void;
  onFieldChange: (id: string, field: keyof RosterPlayer, value: any) => void;
  rosterInputRef: React.RefObject<HTMLInputElement | null>;
}

const RosterSidebar: React.FC<RosterSidebarProps> = ({
  sidebarWidth,
  project,
  warningChecker,
  onUpdateProject,
  onAddDefaultPlayer,
  onRosterImport,
  onBulkGenerate,
  onAutoMap,
  onBulkSync,
  onDeletePlayer,
  onFieldChange,
  rosterInputRef,
}) => {
  const isMinimal = sidebarWidth < 240;
  const hasPlayers = project.roster.length > 0;

  return (
    <aside
      className="layers-sidebar"
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
        maxWidth: `${sidebarWidth}px`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#07070a',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header & Stats horizontal status row */}
        <div style={{ padding: isMinimal ? '10px 10px 8px 10px' : '16px 16px 12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Cpu size={12} style={{ color: 'var(--accent-blue)', opacity: 0.8 }} />
            <span style={{ fontSize: '10.5px', fontWeight: '800', color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {isMinimal ? "Roster" : "Roster Studio"}
            </span>
          </div>
          
          <div style={{ fontSize: '9.5px', color: 'var(--text-disabled)', fontWeight: '500', letterSpacing: '0.02em', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '2px 4px' }}>
            <span>{project.roster.length} P</span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span style={{ color: 'var(--color-success)' }}>
              {project.roster.filter(p => p.status === 'Ready for Export').length} {isMinimal ? "R" : "Ready"}
            </span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span style={{ color: project.roster.filter(p => warningChecker(p, project.roster) !== null).length > 0 ? '#eb5757' : 'var(--text-disabled)' }}>
              {project.roster.filter(p => warningChecker(p, project.roster) !== null).length} {isMinimal ? "A" : "Alerts"}
            </span>
          </div>
        </div>

        {/* Hidden File Input for CSV / Excel uploads */}
        <input ref={rosterInputRef} type="file" accept=".csv, .xlsx" style={{ display: 'none' }} onChange={onRosterImport} />

        {/* Action Button Toolbar */}
        <RosterToolbar
          sidebarWidth={sidebarWidth}
          rosterEmpty={!hasPlayers}
          onGenerateAll={onBulkGenerate}
          onImportCsv={() => {
            if (rosterInputRef.current) {
              rosterInputRef.current.setAttribute('accept', '.csv');
              rosterInputRef.current.click();
            }
          }}
          onImportExcel={() => {
            if (rosterInputRef.current) {
              rosterInputRef.current.setAttribute('accept', '.xlsx');
              rosterInputRef.current.click();
            }
          }}
          onAutoMap={onAutoMap}
          onSync={onBulkSync}
        />

        {/* Roster database list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMinimal ? '6px' : '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          
          {hasPlayers && <AddPlayerCard onAdd={onAddDefaultPlayer} isMinimal={isMinimal} />}

          {!hasPlayers ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMinimal ? '16px 8px' : '24px 16px',
              textAlign: 'center',
              border: '1px dashed rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.01)',
              margin: '4px'
            }}>
              <Users size={isMinimal ? 24 : 32} style={{ color: 'var(--accent-blue)', opacity: 0.6, marginBottom: '12px' }} />
              <h4 style={{ fontSize: isMinimal ? '11px' : '12px', fontWeight: 'bold', color: '#fff', margin: '0 0 6px 0' }}>Previewing Master Production Template</h4>
              <p style={{ fontSize: '9.5px', color: 'var(--text-disabled)', lineHeight: 1.4, margin: '0 0 16px 0', maxWidth: '180px' }}>
                Import roster entries to generate player variations.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '160px' }}>
                <button
                  onClick={() => {
                    if (rosterInputRef.current) {
                      rosterInputRef.current.setAttribute('accept', '.csv');
                      rosterInputRef.current.click();
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '6px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    width: '100%'
                  }}
                >
                  <Upload size={10} /> Import CSV
                </button>
                <button
                  onClick={() => {
                    if (rosterInputRef.current) {
                      rosterInputRef.current.setAttribute('accept', '.xlsx');
                      rosterInputRef.current.click();
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '6px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    width: '100%'
                  }}
                >
                  <FileDown size={10} /> Import Excel
                </button>
                <button
                  onClick={onAddDefaultPlayer}
                  style={{
                    background: 'rgba(0, 112, 243, 0.1)',
                    border: '1px solid rgba(0, 112, 243, 0.35)',
                    borderRadius: '4px',
                    color: '#3b9eff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '6px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    width: '100%'
                  }}
                >
                  <Plus size={10} /> + Add First Player
                </button>
              </div>
            </div>
          ) : (
            project.roster.map((player) => {
              const isActive = project.activePlayerId === player.id;
              const warning = warningChecker(player, project.roster);

              return (
                <PlayerRosterCard
                  key={player.id}
                  sidebarWidth={sidebarWidth}
                  player={player}
                  isActive={isActive}
                  warning={warning}
                  roster={project.roster}
                  primaryColor={project.baseColors.primary}
                  secondaryColor={project.baseColors.secondary}
                  apparelType={project.apparelType}
                  logos={project.logos}
                  onActivate={() => onUpdateProject({ activePlayerId: player.id })}
                  onFieldChange={onFieldChange}
                  onDelete={onDeletePlayer}
                />
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};

/**
 * Artwork scale factor per size — delegates to GarmentSizeEngine.
 * Uses 1" chest-width grading table with 50% dampening for artwork elements.
 */
const getSizeScaleFactor = (size: string): number =>
  getArtworkScaleFactor(size);

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
  userId,
  onTokenExhausted,
  onUpdateTokens,
}) => {
  const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [panelSelectorOpen, setPanelSelectorOpen] = useState(false);
  const [canvasBg] = useState<'white' | 'dark' | 'transparent' | 'checkerboard'>('white');
  const [activeTextObj, setActiveTextObj] = useState<fabric.IText | null>(null);
  const [activeShapeObj, setActiveShapeObj] = useState<fabric.Rect | null>(null);
  const [activeImageObj, setActiveImageObj] = useState<fabric.Image | null>(null);
  const [workspaceMode] = useState<'beginner' | 'advanced'>('advanced');
  const [configTab] = useState<'workspace' | 'rules' | 'ai'>('workspace');

  // AI Sublimation Generator Cockpit States
  const [aiPrompt, setAiPrompt] = useState('');
  const aiMode = 'vector';
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiCheckpoint, setAiCheckpoint] = useState('');
  if (aiCheckpoint) { /* satisfy compiler unused check */ }

  // Canvas ref — declared here so handleGenerateAiAsset can access it
  const fabricRef = useRef<FabricCanvasHandle | null>(null);

  const handleGenerateAiAsset = async () => {
    if (!aiPrompt.trim()) {
      alert('Please enter a prompt first!');
      return;
    }

    // ── DIAGNOSTIC ─────────────────────────────────────────────────────────────
    console.log('[DesignSync AI] 🔍 Generate clicked');
    console.log('[DesignSync AI] fabricRef.current:', fabricRef.current);
    console.log('[DesignSync AI] SERVER_URL:', SERVER_URL);
    console.log('[DesignSync AI] userId:', userId);
    console.log('[DesignSync AI] prompt:', aiPrompt);
    // ───────────────────────────────────────────────────────────────────────────
    
    setIsGeneratingAi(true);
    setAiCheckpoint('Connecting to DesignSync Secure Gateway...');

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setAiCheckpoint('Synthesizing sublimation elements...');
      
      await new Promise(resolve => setTimeout(resolve, 600));
      setAiCheckpoint('Applying active color palette hex values...');

      const colors = [
        project.baseColors.primary,
        project.baseColors.secondary,
        project.baseColors.accent || '#ffcc00'
      ];

      console.log('[DesignSync AI] 📡 Fetching from:', `${SERVER_URL}/api/ai/generate`);

      const res = await fetch(`${SERVER_URL}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          providerMode: aiMode,
          baseColors: colors,
          userId: userId || 'anonymous-session'
        })
      });

      console.log('[DesignSync AI] 📥 Response status:', res.status, res.ok);

      if (res.status === 403) {
        const errData = await res.json();
        console.log('[DesignSync AI] ❌ 403 error:', errData);
        if (errData.error === 'OUT_OF_TOKENS') {
          if (onTokenExhausted) onTokenExhausted();
          throw new Error('OUT_OF_TOKENS');
        }
      }

      if (!res.ok) throw new Error(`Gateway returned: ${res.statusText}`);
      const data = await res.json();

      console.log('[DesignSync AI] ✅ Data received:', { hasUrl: !!data.url, urlType: data.url?.substring(0, 40), isSandbox: data.isSandbox, remaining: data.remainingTokens });

      if (data.remainingTokens !== undefined && onUpdateTokens) {
        onUpdateTokens();
      }

      setAiCheckpoint('Baking sublimation dimensions...');
      await new Promise(resolve => setTimeout(resolve, 400));

      if (data.url) {
        console.log('[DesignSync AI] 🎨 Stamping on canvas. fabricRef.current:', fabricRef.current);
        if (!fabricRef.current) {
          console.error('[DesignSync AI] ❌ fabricRef.current is NULL - canvas not mounted!');
          alert('Canvas not ready. Please wait for the canvas to fully load, then try again.');
          return;
        }
        fabricRef.current.addImageFromUrl(data.url, `AI_${aiMode.toUpperCase()}`);
        console.log('[DesignSync AI] ✅ addImageFromUrl called successfully');
        setAiCheckpoint('Layer auto-stamped successfully!');
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        throw new Error('No URL returned from generation gateway.');
      }
    } catch (e: any) {
      console.error('[DesignSync AI] ❌ Generation failed:', e);
      if (e.message === 'OUT_OF_TOKENS') {
        alert('You have exhausted your free generation credits. Please subscribe to a premium plan to continue generating.');
      } else {
        alert(`AI Generation failed: ${e.message}`);
      }
    } finally {
      setIsGeneratingAi(false);
      setAiCheckpoint('');
    }
  };

  const [showExportHUD, setShowExportHUD] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState(0);



  // ── Measurement system state ──────────────────────────────────────────────
  const [selectedBounds, setSelectedBounds] = useState<ObjectBounds | null>(null);
  const [showSafeZones] = useState(true);

  // Load templates manifest dynamically
  const [templates, setTemplates] = useState<GarmentTemplate[]>([]);
  const [, setLoadingTemplates] = useState(true);

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

  const activeSizeRaw = activePlayer?.size ?? 'M';
  const activeSize = activeSizeRaw === 'XXL' ? '2XL' : activeSizeRaw;

  const dims = React.useMemo(() => {
    return getGarmentDimensions(activeTemplate, activeSize);
  }, [activeTemplate, activeSize]);

  const layoutOffsets = React.useMemo(() => {
    return getLayoutOffsets(activeTemplate, activeSize);
  }, [activeTemplate, activeSize]);

  // Current unit from project settings
  const unit: MeasurementUnit = (project.measurementUnit as MeasurementUnit) ?? 'inches';

  // ── Roster Studio States & File Refs ─────────────────────────────────────────
  const rosterInputRef = useRef<HTMLInputElement>(null);

  // Typography auto-fit: shrinks names that would overflow the safe zone
  const calculateScale = (name: string, size?: string): number => {
    if (!name) return 1.0;
    const safeWidthInches = project.rules.maxTextWidthInches > 0
      ? project.rules.maxTextWidthInches
      : 14.0; // fallback: 14" (conservative safe zone for M)
    const fontHeightInches = project.rules.playerNameHeightInches || 2.0;
    // Apply artwork scale for the player's size (smaller sizes get slightly smaller text)
    const artScale = getSizeScaleFactor(size || 'M');
    const typoScale = getTypographyScale(name, safeWidthInches, fontHeightInches);
    return artScale * typoScale;
  };

  // Field change handler for inline editing
  const handleFieldChange = (id: string, field: keyof RosterPlayer, value: any) => {
    const updated = project.roster.map(p => {
      if (p.id === id) {
        const updatedPlayer = { ...p, [field]: value };
        if (field === 'name') {
          updatedPlayer.name = value.toUpperCase();
          updatedPlayer.nameScale = calculateScale(value, p.size);
        }
        return updatedPlayer;
      }
      return p;
    });
    onUpdateProject({ roster: updated });
  };

  // Delete player handler
  const handleDeletePlayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = project.roster.filter(p => p.id !== id);
    const updates: Partial<Project> = { roster: updated };

    if (project.activePlayerId === id && updated.length > 0) {
      updates.activePlayerId = updated[0].id;
    }
    onUpdateProject(updates);
  };

  // Add Default Player directly inside roster
  const handleAddDefaultPlayer = () => {
    const nextNumber = (project.roster.length > 0)
      ? String(Math.max(...project.roster.map(p => isNaN(Number(p.number)) ? 0 : Number(p.number))) + 1)
      : '1';
    
    const newPlayer: RosterPlayer = {
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: 'NEW PLAYER',
      number: nextNumber,
      size: 'M',
      nameScale: 1.0,
      variant: 'Variant A',
      status: 'Mapped'
    };

    const updated = [...project.roster, newPlayer];
    onUpdateProject({
      roster: updated,
      activePlayerId: newPlayer.id
    });
  };

  // Unified Roster Upload (handles both .csv and .xlsx)
  const handleRosterImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        try {
          const rows = parseCSV(text);
          importRosterRows(rows);
        } catch (err) {
          console.error('Failed to parse CSV:', err);
          alert('Failed to import CSV. Please check file format.');
        }
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx') {
      loadSheetJS().then(XLSX => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet);
          importRosterRows(rows);
        };
        reader.readAsArrayBuffer(file);
      }).catch(err => {
        console.error('Failed to parse Excel:', err);
        alert('Failed to import Excel. Make sure it is a valid .xlsx file.');
      });
    } else {
      alert('Unsupported file format. Please upload a .csv or .xlsx file.');
    }
    e.target.value = '';
  };


  // Common importer mapper
  const importRosterRows = (rows: any[]) => {
    if (rows.length === 0) return;
    
    const newPlayers: RosterPlayer[] = [];
    rows.forEach((row, index) => {
      const nameKey = Object.keys(row).find(k => /name|surname|player\s*name/i.test(k));
      const numKey = Object.keys(row).find(k => /number|num|jersey\s*number/i.test(k));
      const sizeKey = Object.keys(row).find(k => /size|sz/i.test(k));
      const variantKey = Object.keys(row).find(k => /variant/i.test(k));
      
      let name = nameKey ? String(row[nameKey]).trim().toUpperCase() : '';
      let number = numKey ? String(row[numKey]).trim() : '';
      let sizeRaw = sizeKey ? String(row[sizeKey]).trim().toUpperCase() : 'M';
      let variant = variantKey ? String(row[variantKey]).trim() : 'Variant A';
      
      if (!name) name = `PLAYER ${project.roster.length + newPlayers.length + 1}`;
      if (!number) number = String(project.roster.length + newPlayers.length + 1);
      
      let size: any = 'M';
      const sizeMatch = sizeRaw.replace(/[^A-Z0-9]/g, '');
      if (['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '2XL'].includes(sizeMatch)) {
        size = sizeMatch === '2XL' ? 'XXL' : sizeMatch;
      }
      
      let varValue: any = 'Variant A';
      if (/B/i.test(variant)) varValue = 'Variant B';
      else if (/C/i.test(variant)) varValue = 'Variant C';
      
      const newPlayer: RosterPlayer = {
        id: `import-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`,
        name,
        number,
        size,
        nameScale: calculateScale(name, size),
        variant: varValue,
        status: 'Mapped'
      };
      newPlayers.push(newPlayer);
    });
    
    if (newPlayers.length > 0) {
      const updatedRoster = [...project.roster, ...newPlayers];
      onUpdateProject({ 
        roster: updatedRoster,
        activePlayerId: newPlayers[0].id
      });
    }
  };

  // Bulk actions triggers
  const handleBulkGenerate = () => {
    if (project.roster.length === 0) {
      alert('Roster is empty. Please add players first.');
      return;
    }
    setIsGeneratingBulk(true);
    setBulkGenerateProgress(0);

    let progress = 0;
    const total = project.roster.length;
    const interval = Math.max(80, Math.min(300, 1200 / total));

    const step = () => {
      progress += 1;
      const pct = Math.round((progress / total) * 100);
      setBulkGenerateProgress(pct);

      if (progress < total) {
        setTimeout(step, interval);
      } else {
        // Complete generation!
        const canvasStates = project.canvasStates || generateProductionCanvasStates(project);
        const resolvedRosterMap = batchResolveRoster(
          project.roster,
          project.rules,
          canvasStates,
          project.logos,
          project.name || 'TEAM'
        );

        // Update nameScale and status for all players from the engine results
        const updatedRoster = project.roster.map(p => {
          const resolved = resolvedRosterMap.get(p.id);
          return {
            ...p,
            nameScale: resolved ? resolved.nameScale : p.nameScale,
            status: 'Ready for Export' as const
          };
        });

        onUpdateProject({
          roster: updatedRoster,
          activeCanvasView: 'roster_previews'
        });

        setIsGeneratingBulk(false);
      }
    };

    setTimeout(step, interval);
  };


  const handleBulkSync = () => {
    const canvasStates = project.canvasStates || generateProductionCanvasStates(project);
    const resolvedRosterMap = batchResolveRoster(
      project.roster,
      project.rules,
      canvasStates,
      project.logos,
      project.name || 'TEAM'
    );

    const updated = project.roster.map(p => {
      const resolved = resolvedRosterMap.get(p.id);
      return {
        ...p,
        nameScale: resolved ? resolved.nameScale : p.nameScale
      };
    });
    onUpdateProject({ roster: updated });
    
    const canvas = fabricRef.current?.getCanvas();
    if (canvas && activePlayer) {
      syncPlayerOnCanvas(canvas, activePlayer, undefined);
    }
    alert('All player typographic scaling factors synchronized and active design updated!');
  };

  const handleAutoMap = () => {
    const canvas = fabricRef.current?.getCanvas();
    if (!canvas) return;
    
    let mappedName = false;
    let mappedNum = false;
    let logoRealigned = false;
    
    const rules = project.rules;
    const view = project.activeCanvasView;
    const roster = project.roster;
    
    canvas.getObjects().forEach((obj: any) => {
      if (obj.__isArtboard) return;
      
      // 1. Text layers mapping & re-alignment
      if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
        const textVal = (obj.text || '').trim().toUpperCase();
        
        const isName = obj.__isNameText ||
          textVal === 'SURNAME' ||
          textVal === 'PLAYER NAME' ||
          textVal === 'NAME' ||
          roster.some(p => p.name.toUpperCase() === textVal);
          
        const isNumber = obj.__isNumberText ||
          textVal === '00' ||
          textVal === 'PLAYER NUMBER' ||
          textVal === 'NUMBER' ||
          roster.some(p => p.number === textVal);
          
        if (isName) {
          obj.__isNameText = true;
          mappedName = true;
          
          // Re-apply typography rules
          obj.set({
            fontSize: rules.playerNameHeightInches * PX_PER_INCH,
            originX: 'center'
          });
          
          if (view === 'back') {
            obj.set({
              top: 180 + rules.surnameSpacingCollarInches * PX_PER_INCH
            });
          }
          
          if (rules.autoCenter) {
            obj.set({ left: canvas.width / 2 });
          }
          
          obj.setCoords();
        } else if (isNumber) {
          obj.__isNumberText = true;
          mappedNum = true;
          
          // Re-apply typography rules
          obj.set({
            fontSize: rules.playerNumberHeightInches * PX_PER_INCH,
            originX: 'center'
          });
          
          if (view === 'back') {
            const nameY = 180 + rules.surnameSpacingCollarInches * PX_PER_INCH;
            const nameHeightPx = rules.playerNameHeightInches * PX_PER_INCH;
            obj.set({
              top: nameY + nameHeightPx + 40
            });
          }
          
          if (rules.autoCenter) {
            obj.set({ left: canvas.width / 2 });
          }
          
          obj.setCoords();
        }
      }
      
      // 2. Logo layers mapping & re-alignment
      if (obj.type === 'image') {
        if (view === 'front') {
          // Re-align primary chest logo
          const chestAlign = rules.chestAlignment || 'center';
          const logoSpacingCollar = rules.frontLogoSpacingCollarInches ?? 3.5;
          
          // Get logo dimension specs (size in inches)
          const logoSpec = project.logos[0];
          const logoSizeInches = logoSpec?.sizeInches || 2.5;
          const targetW = logoSizeInches * PX_PER_INCH;
          const ratio = obj.height && obj.width ? obj.height / obj.width : 1.0;
          const targetH = targetW * ratio;
          
          let leftPos = canvas.width / 2;
          if (chestAlign === 'left') leftPos = canvas.width / 2 - 200;
          if (chestAlign === 'right') leftPos = canvas.width / 2 + 200;
          
          const topPos = 240 + logoSpacingCollar * PX_PER_INCH;
          
          obj.set({
            left: leftPos,
            top: topPos,
            originX: 'center',
            originY: 'center',
            scaleX: targetW / (obj.width || 1),
            scaleY: targetH / (obj.height || 1)
          });
          
          obj.setCoords();
          logoRealigned = true;
        } else if (view === 'sleeves') {
          // Center logo on sleeve
          const targetW = 3.0 * PX_PER_INCH;
          const ratio = obj.height && obj.width ? obj.height / obj.width : 1.0;
          const targetH = targetW * ratio;
          
          obj.set({
            left: canvas.width / 2,
            top: canvas.height / 2,
            originX: 'center',
            originY: 'center',
            scaleX: targetW / (obj.width || 1),
            scaleY: targetH / (obj.height || 1)
          });
          
          obj.setCoords();
          logoRealigned = true;
        }
      }
    });
    
    // Sync current active player's name & number value
    if (activePlayer && (mappedName || mappedNum)) {
      syncPlayerOnCanvas(canvas, activePlayer, undefined);
    }
    
    canvas.requestRenderAll();
    fabricRef.current?.saveHistory();
    
    // Construct message
    const msgs: string[] = [];
    if (mappedName) msgs.push('Player Name');
    if (mappedNum) msgs.push('Player Number');
    if (logoRealigned) msgs.push('Logo Layout');
    
    if (msgs.length > 0) {
      alert(`Auto-mapping complete! Re-aligned and formatted: ${msgs.join(', ')} to conform to current rules.`);
    } else {
      alert('Could not find matches on the canvas. Please select a text object and use the typography presets to label Surname / Number.');
    }
  };

  // Canvas Synchronizer & Auto Scaling
  const syncPlayerOnCanvas = useCallback((canvas: fabric.Canvas, player: RosterPlayer, _previousPlayer?: RosterPlayer) => {
    if (!canvas || !player) return;

    const activeView = project.activeCanvasView === 'full' ? 'front' : project.activeCanvasView;
    const canvasObjects = canvas.getObjects().filter(o => !(o as any).__isArtboard);

    // Run the production engine to resolve panel objects!
    const resolvedObjects = resolvePlayerPanelLayout(
      player,
      project.rules,
      canvasObjects,
      activeView,
      project.logos,
      project.name || 'TEAM'
    );

    let canvasChanged = false;
    canvas.getObjects().forEach((obj: any) => {
      if (obj.__isArtboard) return;

      const resolved = resolvedObjects.find(r => r.__id === obj.__id || (r.type === obj.type && r.__layerName === obj.__layerName));
      if (resolved) {
        if (resolved.text !== undefined && obj.text !== resolved.text) {
          obj.set({ text: resolved.text });
          canvasChanged = true;
        }
        if (resolved.fontSize !== undefined && obj.fontSize !== resolved.fontSize) {
          obj.set({ fontSize: resolved.fontSize });
          canvasChanged = true;
        }
        if (resolved.scaleX !== undefined && obj.scaleX !== resolved.scaleX) {
          obj.set({ scaleX: resolved.scaleX });
          canvasChanged = true;
        }
        if (resolved.scaleY !== undefined && obj.scaleY !== resolved.scaleY) {
          obj.set({ scaleY: resolved.scaleY });
          canvasChanged = true;
        }
        if (resolved.left !== undefined && obj.left !== resolved.left) {
          obj.set({ left: resolved.left });
          canvasChanged = true;
        }
        if (resolved.top !== undefined && obj.top !== resolved.top) {
          obj.set({ top: resolved.top });
          canvasChanged = true;
        }
        if (resolved.visible !== undefined && obj.visible !== resolved.visible) {
          obj.set({ visible: resolved.visible });
          canvasChanged = true;
        }

        // Keep internal references
        obj.__anchor = resolved.__anchor;
        obj.__offsetXInches = resolved.__offsetXInches;
        obj.__offsetYInches = resolved.__offsetYInches;
        obj.__isNameText = resolved.__isNameText;
        obj.__isNumberText = resolved.__isNumberText;

        obj.setCoords();
      }
    });

    if (canvasChanged) {
      canvas.requestRenderAll();
      fabricRef.current?.saveHistory();
    }
  }, [project.activeCanvasView, project.rules, project.logos, project.name]);

  const prevPlayerRef = useRef<RosterPlayer | undefined>(undefined);

  // Hook to keep canvas in sync
  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = fabricRef.current?.getCanvas();
      if (canvas && activePlayer) {
        syncPlayerOnCanvas(canvas, activePlayer, prevPlayerRef.current);
        prevPlayerRef.current = activePlayer;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [project.activePlayerId, project.activeCanvasView, project.roster, syncPlayerOnCanvas, activePlayer]);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Artboard dimensions (in pixels at 40px/in) ────────────────────────────
  // Driven by real garment dimensions for production accuracy
  const CANVAS_W = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'full') return 2400;
    if (view === 'sleeves') {
      return 960 * 2 + 40;
    }
    const panelDims = dims[view as keyof typeof dims] ?? dims.front;
    return Math.round(panelDims.w * PX_PER_INCH);
  }, [project.activeCanvasView, dims]);

  const CANVAS_H = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'full') return 2400;
    const panelDims = dims[view as keyof typeof dims] ?? dims.front;
    return Math.round(panelDims.h * PX_PER_INCH);
  }, [project.activeCanvasView, dims]);

  // ── Real-world canvas dimensions for display ──────────────────────────────
  const currentPanelDimsInches = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'full') return { w: 60, h: 60 };
    return dims[view as keyof typeof dims] ?? dims.front;
  }, [project.activeCanvasView, dims]);

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
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  useEffect(() => { localStorage.setItem('ds-studio-left-width', studioLeftWidth.toString()); }, [studioLeftWidth]);
  useEffect(() => { localStorage.setItem('ds-studio-right-width', studioRightWidth.toString()); }, [studioRightWidth]);

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

  // ── Escape Key tool cancellation & UI reset ────────────────────────────────
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const canvas = fabricRef.current?.getCanvas();
        if (canvas) {
          const activeObj = canvas.getActiveObject();
          if (activeObj && (activeObj as any).isEditing) {
            (activeObj as any).exitEditing();
          }
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
        setToolMode('select');
        setPanelSelectorOpen(false);
        
        // Escape FOCUS EDITOR to return to previews grid!
        if (project.activeCanvasView !== 'roster_previews') {
          onUpdateProject({ activeCanvasView: 'roster_previews' });
        }
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [project.activeCanvasView]);

  const handleSizeChange = (newSize: string) => {
    if (activePlayer) {
      const sizeToSet = newSize === '2XL' ? 'XXL' : newSize;
      const updatedRoster = project.roster.map(p =>
        p.id === activePlayer.id ? { ...p, size: sizeToSet as any } : p
      );
      onUpdateProject({ roster: updatedRoster });
    }
  };

  // ── Selection change handler ───────────────────────────────────────────────
  const handleSelectionChange = useCallback((layer: FabricLayer | null) => {
    if (!layer) {
      setActiveTextObj(null);
      setActiveShapeObj(null);
      setActiveImageObj(null);
      return;
    }
    const obj = layer.objectRef;
    if (layer.type === 'text') {
      setActiveTextObj(obj as fabric.IText);
      setActiveShapeObj(null);
      setActiveImageObj(null);
    } else if (layer.type === 'shape') {
      setActiveShapeObj(obj as fabric.Rect);
      setActiveTextObj(null);
      setActiveImageObj(null);
    } else if (layer.type === 'image') {
      setActiveImageObj(obj as fabric.Image);
      setActiveTextObj(null);
      setActiveShapeObj(null);
    } else {
      setActiveTextObj(null);
      setActiveShapeObj(null);
      setActiveImageObj(null);
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
    setToolMode('select');
  };



  // ── Inspector right panel determination ───────────────────────────────────
  const getInspectorMode = (): 'text' | 'shape' | 'image' | 'calibration' => {
    if (activeTextObj) return 'text';
    if (activeShapeObj) return 'shape';
    if (activeImageObj) return 'image';
    return 'calibration';
  };
  const inspectorMode = getInspectorMode();



  // ─────────────────────────────────────────────────────────────────────────
  // TOOLBAR TOOLS
  // ─────────────────────────────────────────────────────────────────────────
  const getGarmentPanels = () => {
    const type = project.apparelType || 'tshirt';
    let panels = [];
    if (type === 'hoodie') {
      panels = [
        { id: 'front', label: 'Front Panel' },
        { id: 'back', label: 'Back Panel' },
        { id: 'sleeves', label: 'Sleeves' },
        { id: 'hood', label: 'Hood' },
        { id: 'pocket', label: 'Pocket' }
      ];
    } else if (type === 'jersey') {
      panels = [
        { id: 'front', label: 'Front Panel' },
        { id: 'back', label: 'Back Panel' },
        { id: 'collar', label: 'Collar' },
        { id: 'side-panels', label: 'Side Panels' }
      ];
    } else if (type === 'compression') {
      panels = [
        { id: 'front', label: 'Front Panel' },
        { id: 'back', label: 'Back Panel' },
        { id: 'arm-panels', label: 'Arm Panels' },
        { id: 'side-panels', label: 'Side Panels' }
      ];
    } else {
      // Default / T-shirt
      panels = [
        { id: 'front', label: 'Front Panel' },
        { id: 'back', label: 'Back Panel' },
        { id: 'sleeves', label: 'Sleeves' },
        ...(activeTemplate.files['collar'] ? [{ id: 'collar', label: 'Collar / Neckline' }] : [])
      ];
    }
    return [
      { id: 'roster_previews', label: 'All Previews Grid 🌟' },
      ...panels
    ];
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>

      <RosterSidebar
        sidebarWidth={studioLeftWidth}
        project={project}
        warningChecker={getPlayerValidationWarning}
        onUpdateProject={onUpdateProject}
        onAddDefaultPlayer={handleAddDefaultPlayer}
        onRosterImport={handleRosterImport}
        onBulkGenerate={handleBulkGenerate}
        onAutoMap={handleAutoMap}
        onBulkSync={handleBulkSync}
        onDeletePlayer={handleDeletePlayer}
        onFieldChange={handleFieldChange}
        rosterInputRef={rosterInputRef}
      />

      {/* Resize handle left */}
      <div onMouseDown={startResizeLeft} className={`resize-handle-vertical ${isDraggingLeft ? 'dragging' : ''}`} />

      {/* ── CENTER WORKSPACE ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* Top Bar: View Tabs + Canvas Controls */}
        <div className="studio-topbar">

          {/* View mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '2px', marginLeft: '12px' }}>
            <button
              onClick={() => onUpdateProject({ activeCanvasView: 'roster_previews' })}
              style={{
                background: currentView === 'roster_previews' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                border: 'none',
                color: currentView === 'roster_previews' ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <Users size={11} />
              <span>Overview</span>
            </button>
            <button
              onClick={() => {
                onUpdateProject({ activeCanvasView: 'front' });
              }}
              style={{
                background: currentView !== 'roster_previews' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                border: 'none',
                color: currentView !== 'roster_previews' ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <Shirt size={11} />
              <span>Focus Editor</span>
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Zoom Level Display */}
          <div className="studio-ctrl-group" style={{ background: 'transparent', border: 'none', gap: '0' }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              padding: '0 6px',
              minWidth: '42px',
              textAlign: 'center'
            }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Dimension HUD in Topbar */}
          <div className="studio-ctrl-group" style={{ background: 'transparent', border: '1px solid rgba(0,112,243,0.18)', gap: '0', padding: '2px 8px' }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '9px',
              color: 'var(--accent-blue)',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap'
            }}>
              {currentPanelDimsInches.w.toFixed(2)}" × {currentPanelDimsInches.h.toFixed(2)}"
            </span>
          </div>



          {/* Export Queue trigger */}
          <div className="studio-ctrl-group" style={{ paddingLeft: '4px' }}>
            <button
              onClick={() => setShowExportHUD(true)}
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.05)',
              }}
            >
              <FileDown size={13} />
              <span>Export Queue</span>
            </button>
          </div>

        </div>

        {/* Canvas body: Toolbar + Rulers + Viewport */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* ── Vertical Edit Toolbar (Floating Pill) ── */}
          <div 
            className="ap-left-floating-toolbar"
            style={{
              position: 'absolute',
              left: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 35,
              background: 'rgba(10, 10, 15, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '30px',
              padding: '12px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              width: '46px',
            }}
          >
            {/* 1. Select Tool */}
            <button
              onClick={() => { setToolMode('select'); setPanelSelectorOpen(false); }}
              title="Selection Tool (V)"
              className={`ap-toolbar-btn ${toolMode === 'select' ? 'active' : ''}`}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: toolMode === 'select' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                color: toolMode === 'select' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: toolMode === 'select' ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <MousePointer2 size={18} />
            </button>

            {/* 2. Hand/Pan Tool */}
            <button
              onClick={() => { setToolMode('hand'); setPanelSelectorOpen(false); }}
              title="Hand Tool (H)"
              className={`ap-toolbar-btn ${toolMode === 'hand' ? 'active' : ''}`}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: toolMode === 'hand' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                color: toolMode === 'hand' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: toolMode === 'hand' ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Hand size={18} />
            </button>

            {/* 3. Move Tool */}
            <button
              onClick={() => { setToolMode('move'); setPanelSelectorOpen(false); }}
              title="Move Tool (M)"
              className={`ap-toolbar-btn ${toolMode === 'move' ? 'active' : ''}`}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: toolMode === 'move' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                color: toolMode === 'move' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: toolMode === 'move' ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Move size={18} />
            </button>

            {/* 4. Garment Panel Tool */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPanelSelectorOpen(!panelSelectorOpen)}
                title="Garment Panel Selector"
                className={`ap-toolbar-btn ${panelSelectorOpen ? 'active' : ''}`}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  border: 'none',
                  background: panelSelectorOpen ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                  color: panelSelectorOpen ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  outline: 'none',
                  boxShadow: panelSelectorOpen ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                  padding: 0,
                  minWidth: 'auto',
                }}
              >
                <Shirt size={18} />
              </button>

              {/* Dynamic Panel Selector Popup */}
              {panelSelectorOpen && (
                <div 
                  className="ap-floating-panel-selector"
                  style={{
                    position: 'absolute',
                    left: '52px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(12, 12, 18, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '8px',
                    boxShadow: '0 15px 30px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: '150px',
                    zIndex: 40,
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-disabled)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Garment Areas
                  </div>
                  {getGarmentPanels().map(panel => {
                    const isActive = currentView === panel.id;
                    return (
                      <button
                        key={panel.id}
                        onClick={() => {
                          onUpdateProject({ activeCanvasView: panel.id as any });
                          setPanelSelectorOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          background: isActive ? 'rgba(0,112,243,0.15)' : 'transparent',
                          border: 'none',
                          borderRadius: '8px',
                          color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.65)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ 
                          width: '6px', 
                          height: '6px', 
                          borderRadius: '50%', 
                          background: isActive ? '#0070f3' : 'rgba(255, 255, 255, 0.2)' 
                        }} />
                        <span>{panel.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. Shape Tool */}
            <button
              onClick={() => { setToolMode('shape'); setPanelSelectorOpen(false); }}
              title="Shape Tool (R)"
              className={`ap-toolbar-btn ${toolMode === 'shape' ? 'active' : ''}`}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: toolMode === 'shape' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                color: toolMode === 'shape' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: toolMode === 'shape' ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Square size={18} />
            </button>

            {/* 6. Text Tool */}
            <button
              onClick={() => { setToolMode('text'); setPanelSelectorOpen(false); }}
              title="Text Tool (T)"
              className={`ap-toolbar-btn ${toolMode === 'text' ? 'active' : ''}`}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: toolMode === 'text' ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                color: toolMode === 'text' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: toolMode === 'text' ? 'inset 0 0 8px rgba(0, 112, 243, 0.25)' : 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Type size={18} />
            </button>

            {/* 7. Upload Tool */}
            <button
              onClick={() => {
                setPanelSelectorOpen(false);
                fileInputRef.current?.click();
              }}
              title="Upload Image"
              className="ap-toolbar-btn"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Upload size={18} />
            </button>

            {/* Divider */}
            <div style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

            {/* 8. Undo */}
            <button
              onClick={() => {
                setPanelSelectorOpen(false);
                fabricRef.current?.undo();
              }}
              title="Undo (Ctrl+Z)"
              className="ap-toolbar-btn"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Undo2 size={18} />
            </button>

            {/* 9. Redo */}
            <button
              onClick={() => {
                setPanelSelectorOpen(false);
                fabricRef.current?.redo();
              }}
              title="Redo (Ctrl+Shift+Z)"
              className="ap-toolbar-btn"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                padding: 0,
                minWidth: 'auto',
              }}
            >
              <Redo2 size={18} />
            </button>

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
              {currentView === 'roster_previews' ? (
                <RosterPreviewsGrid
                  project={project}
                  onUpdateProject={onUpdateProject}
                  activeTemplate={activeTemplate}
                />
              ) : (
                <FabricCanvas
                  key={`canvas-${currentView}`}
                  ref={fabricRef}
                  toolMode={toolMode}
                  zoom={zoom}
                  pan={pan}
                  onZoomChange={setZoom}
                  onPanChange={setPan}
                  onLayersChange={() => {}}
                  onSelectionChange={handleSelectionChange}
                  onSelectionMeasure={setSelectedBounds}
                  canvasBg={canvasBg}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  currentView={currentView}
                  unit={unit}
                  showRulersAndGrid={workspaceMode === 'advanced'}
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
                  onCreationComplete={() => setToolMode('select')}
                />
              )}

              {/* ── Floating Dimension HUD ──────────────────────────── */}
              {currentView !== 'roster_previews' && (
                <div className="dim-hud">
                  <div className="dim-hud-row">
                    <span className="dim-hud-icon">⬛</span>
                    <span className="dim-hud-label">W</span>
                    <span className="dim-hud-value">{currentPanelDimsInches.w.toFixed(2)}<span className="dim-hud-unit">"</span></span>
                    <span className="dim-hud-sep">×</span>
                    <span className="dim-hud-label">H</span>
                    <span className="dim-hud-value">{currentPanelDimsInches.h.toFixed(2)}<span className="dim-hud-unit">"</span></span>
                  </div>
                  <div className="dim-hud-badges">
                    <span className="dim-hud-badge dim-hud-badge--blue">300 DPI</span>
                    <span className="dim-hud-badge dim-hud-badge--green">CMYK</span>
                    <span className="dim-hud-badge dim-hud-badge--muted">{Math.round(zoom * 100)}% zoom</span>
                  </div>
                </div>
              )}

              {/* ── Bottom-Center Floating AI Prompt Bar ── */}
              {currentView !== 'roster_previews' && (
                <div className="ap-bottom-prompt-bar">
                  <input
                    type="text"
                    className="ap-prompt-textarea"
                    placeholder="Describe your design idea..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiPrompt.trim() && !isGeneratingAi) {
                        handleGenerateAiAsset();
                      }
                    }}
                  />

                  <button
                    className={`ap-prompt-generate-btn ${isGeneratingAi ? 'loading' : ''}`}
                    onClick={handleGenerateAiAsset}
                    disabled={isGeneratingAi || !aiPrompt.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, var(--accent-blue, #0070f3), #0056cc)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '12px',
                      padding: '8px 16px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: (isGeneratingAi || !aiPrompt.trim()) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: (isGeneratingAi || !aiPrompt.trim()) ? 0.6 : 1,
                    }}
                  >
                    {isGeneratingAi ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Generate</span>
                      </>
                    )}
                  </button>
                </div>
              )}

            </div>
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
                inspectorMode === 'image' ? 'Logo Properties' :
                  configTab === 'workspace' ? 'Workspace Configuration' : 'Production Rule Settings'}
          </span>
          {inspectorMode !== 'calibration' && (
            <span className="inspector-header-badge">
              {inspectorMode === 'text' ? 'T' : inspectorMode === 'image' ? 'L' : inspectorMode === 'shape' ? 'S' : 'W'}
            </span>
          )}
        </div>

        {/* ── Object Measurement Panel ── */}
        {workspaceMode === 'advanced' && selectedBounds && (
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

        <div key={`${inspectorMode}-${workspaceMode}`} className="inspector-card-container" style={{ flex: 1, overflowY: 'auto' }}>
          {inspectorMode === 'text' ? (
            <TextInspector
              activeObj={activeTextObj}
              currentView={currentView}
              unit={unit}
              canvasW={CANVAS_W}
              canvasH={CANVAS_H}
              project={project}
              onApply={() => {
                fabricRef.current?.saveHistory();
              }}
            />
          ) : inspectorMode === 'shape' ? (
            <ShapeInspector
              activeObj={activeShapeObj}
              currentView={currentView}
              unit={unit}
              canvasW={CANVAS_W}
              canvasH={CANVAS_H}
              project={project}
              onApply={() => {
                fabricRef.current?.saveHistory();
              }}
            />
          ) : inspectorMode === 'image' ? (
            <LogoInspector
              activeObj={activeImageObj}
              currentView={currentView}
              unit={unit}
              canvasW={CANVAS_W}
              canvasH={CANVAS_H}
              project={project}
              onApply={() => {
                fabricRef.current?.saveHistory();
              }}
            />
          ) : (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Garment Selector */}
              <div>
                <span className="studio-ctrl-label" style={{ marginBottom: '8px', display: 'block', color: 'var(--text-secondary)' }}>GARMENT</span>
                <div
                  style={{
                    background: 'rgba(0, 112, 243, 0.08)',
                    border: '1px solid rgba(0, 112, 243, 0.25)',
                    color: 'var(--accent-blue)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '0',
                    borderRadius: '6px',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    boxShadow: '0 0 10px rgba(0, 112, 243, 0.1)',
                    position: 'relative'
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)', display: 'inline-block', boxShadow: '0 0 5px var(--accent-blue)', position: 'absolute', left: '12px', pointerEvents: 'none' }}></span>
                  <select
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      padding: '8px 12px 8px 26px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      outline: 'none',
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none'
                    }}
                    value={project.apparelType}
                    onChange={(e) => onUpdateProject({ apparelType: e.target.value as any })}
                  >
                    <option value="tshirt" style={{ background: '#0a0a0f', color: '#fff' }}>T-Shirt (Sport)</option>
                    <option value="jersey" style={{ background: '#0a0a0f', color: '#fff' }}>Jersey (Pro)</option>
                    <option value="hoodie" style={{ background: '#0a0a0f', color: '#fff' }}>Hoodie</option>
                  </select>
                </div>
              </div>

              {/* Size Switcher */}
              <div>
                <span className="studio-ctrl-label" style={{ marginBottom: '8px', display: 'block', color: 'var(--text-secondary)' }}>SIZE</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(activeTemplate.supportedSizes || ["XS", "S", "M", "L", "XL", "2XL", "3XL"]).map(s => (
                    <button
                      key={s}
                      className={`studio-ctrl-btn ${activeSize === s ? 'active' : ''}`}
                      onClick={() => handleSizeChange(s)}
                      style={{ padding: '6px 12px', flex: '1 0 20%', minWidth: '40px', fontSize: '11px' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calibration Controls - UNIT */}
              <div>
                <span className="studio-ctrl-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                  <Ruler size={11} /> UNIT
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['inches', 'cm', 'mm', 'px'] as MeasurementUnit[]).map(u => (
                    <button
                      key={u}
                      className={`studio-ctrl-btn ${unit === u ? 'active' : ''}`}
                      style={{ flex: 1, padding: '6px 0', fontSize: '11px' }}
                      onClick={() => onUpdateProject({ measurementUnit: u as any })}
                      title={`Switch to ${u}`}
                    >
                      {u === 'inches' ? 'in' : u}
                    </button>
                  ))}
                </div>
              </div>

            </div>
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

      {/* Floating Export Queue HUD Modal */}
      {showExportHUD && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 10, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <ExportHUD
            projectId={project.id || ''}
            roster={project.roster}
            getCanvasElements={() => {
              const canvas = fabricRef.current?.getCanvas();
              return canvas ? canvas.toJSON().objects : [];
            }}
            onClose={() => setShowExportHUD(false)}
          />
        </div>
      )}

      {/* ── Batch Generation progress bar overlay ── */}
      {isGeneratingBulk && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 10, 0.85)',
          backdropFilter: 'blur(12px)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{
            background: '#0d0d15',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: '3px solid rgba(59, 158, 255, 0.1)',
                borderTopColor: '#3b9eff',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
            
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
                Master-Template Production Engine
              </h3>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Resolving player layouts, aligning typography constraints, and baking logo mappings...
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace' }}>
                <span style={{ color: '#3b9eff', fontWeight: 'bold' }}>{bulkGenerateProgress}% COMPLETE</span>
                <span style={{ color: 'var(--text-disabled)' }}>
                  {Math.round((bulkGenerateProgress / 100) * project.roster.length)} / {project.roster.length} PLAYERS
                </span>
              </div>
              <div style={{
                height: '8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.02)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${bulkGenerateProgress}%`,
                  background: 'linear-gradient(90deg, #0070f3, #3b9eff)',
                  boxShadow: '0 0 12px rgba(59, 158, 255, 0.5)',
                  borderRadius: '4px',
                  transition: 'width 0.1s ease-out'
                }} />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

interface RosterPreviewsGridProps {
  project: Project;
  onUpdateProject: (patch: Partial<Project>) => void;
  activeTemplate: GarmentTemplate;
}

const RosterPreviewsGrid: React.FC<RosterPreviewsGridProps> = ({
  project,
  onUpdateProject,
  activeTemplate
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(project.activePlayerId || (project.roster[0]?.id || null));

  // Sync selected player state if roster updates
  useEffect(() => {
    if (project.activePlayerId && project.roster.some(p => p.id === project.activePlayerId)) {
      setSelectedPlayerId(project.activePlayerId);
    } else if (project.roster.length > 0 && (!selectedPlayerId || !project.roster.some(p => p.id === selectedPlayerId))) {
      setSelectedPlayerId(project.roster[0].id);
    }
  }, [project.activePlayerId, project.roster, selectedPlayerId]);

  const activePlayer = project.roster.find(p => p.id === selectedPlayerId) || project.roster[0] || {
    id: 'placeholder',
    name: 'SURNAME',
    number: '00',
    size: 'M',
    nameScale: 1.0,
    variant: 'Variant A',
    status: 'Mapped'
  };

  const canvasStates = React.useMemo(() => {
    return project.canvasStates || generateProductionCanvasStates(project);
  }, [project]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#050508',
      color: '#fff',
      padding: '24px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      gap: '24px'
    }}>
      {/* Selector dropdown (only if roster has players) */}
      {project.roster.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Select Player Preview:</span>
          <select
            value={selectedPlayerId || ''}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            style={{
              background: '#0f0f14',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '11px',
              color: '#fff',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            {project.roster.map(p => (
              <option key={p.id} value={p.id}>
                {p.name || 'UNNAMED'} (#{p.number || '0'}) - {p.size} ({p.variant || 'Variant A'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Title / Summary block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>#{activePlayer.number || '0'}</span>
            <span>{activePlayer.name || 'UNNAMED'}</span>
          </h2>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: 'var(--text-disabled)' }}>
            <span>Garment Sizing: <strong style={{ color: '#fff' }}>{activePlayer.size}</strong></span>
            <span>•</span>
            <span>Production Block: <strong style={{ color: '#fff' }}>{activePlayer.variant || 'Variant A'}</strong></span>
            <span>•</span>
            <span>Text Fit: <strong style={{ color: activePlayer.nameScale < 0.7 ? '#ef4444' : '#10b981' }}>{Math.round(activePlayer.nameScale * 100)}% scale</strong></span>
          </div>
        </div>

        <div>
          {project.roster.length > 0 ? (
            <span style={{
              fontSize: '11px',
              fontWeight: 'bold',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle size={12} /> Stamped Pattern Ready
            </span>
          ) : (
            <span style={{
              fontSize: '11px',
              fontWeight: 'bold',
              background: 'rgba(0, 112, 243, 0.1)',
              color: '#3b9eff',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(0, 112, 243, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              Template Pattern Preview
            </span>
          )}
        </div>
      </div>

      {/* Overview Grid Layout */}
      {(() => {
        const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);

        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
            width: '100%',
            maxWidth: '1280px',
            margin: '0 auto',
          }}>
            {/* TOP: Primary Panels (Front + Back) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
              gap: '32px',
              width: '100%'
            }}>
              {/* Front Panel */}
              <div 
                onDoubleClick={() => onUpdateProject({ activeCanvasView: 'front' })}
                onMouseEnter={() => setHoveredPanel('front')}
                onMouseLeave={() => setHoveredPanel(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'zoom-in',
                  background: '#08080c',
                  border: hoveredPanel === 'front' ? '1px solid rgba(59, 158, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: hoveredPanel === 'front' ? '0 16px 48px rgba(0, 0, 0, 0.6)' : '0 8px 32px rgba(0, 0, 0, 0.4)',
                  transform: hoveredPanel === 'front' ? 'translateY(-4px)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '8.5px', fontWeight: '900', background: 'rgba(59, 158, 255, 0.12)', color: '#3b9eff', border: '1px solid rgba(59, 158, 255, 0.2)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em' }}>PRIMARY</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>Front Panel Pattern</span>
                  </div>
                  {(() => {
                    const gradedDims = getGarmentDimensions(activeTemplate, activePlayer.size);
                    const d = gradedDims.front || { w: 21, h: 30 };
                    return (
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(59, 158, 255, 0.08)', border: '1px solid rgba(59, 158, 255, 0.15)', padding: '3px 8px', borderRadius: '4px', color: '#3b9eff', fontWeight: 'bold' }}>
                        {d.w}" × {d.h}" ({activePlayer.size})
                      </span>
                    );
                  })()}
                </div>
                <div style={{
                  position: 'relative',
                  background: '#030305',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
                  overflow: 'hidden'
                }}>
                  <PlayerSublimationPreview
                    player={activePlayer}
                    canvasState={canvasStates.front || '{"objects":[]}'}
                    logos={project.logos}
                    viewBoxW={1120}
                    viewBoxH={1360}
                    teamName={project.name}
                    projectRules={project.rules}
                    activeTemplate={activeTemplate}
                  />
                  {hoveredPanel === 'front' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(4, 4, 6, 0.75)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      border: '1px dashed rgba(59, 158, 255, 0.3)',
                      borderRadius: '12px',
                      pointerEvents: 'none',
                    }}>
                      Double-click to expand in Focus Mode 🔍
                    </div>
                  )}
                </div>
              </div>

              {/* Back Panel */}
              <div 
                onDoubleClick={() => onUpdateProject({ activeCanvasView: 'back' })}
                onMouseEnter={() => setHoveredPanel('back')}
                onMouseLeave={() => setHoveredPanel(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'zoom-in',
                  background: '#08080c',
                  border: hoveredPanel === 'back' ? '1px solid rgba(59, 158, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: hoveredPanel === 'back' ? '0 16px 48px rgba(0, 0, 0, 0.6)' : '0 8px 32px rgba(0, 0, 0, 0.4)',
                  transform: hoveredPanel === 'back' ? 'translateY(-4px)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '8.5px', fontWeight: '900', background: 'rgba(59, 158, 255, 0.12)', color: '#3b9eff', border: '1px solid rgba(59, 158, 255, 0.2)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em' }}>PRIMARY</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', color: '#fff', letterSpacing: '0.05em' }}>Back Panel Template</span>
                  </div>
                  {(() => {
                    const gradedDims = getGarmentDimensions(activeTemplate, activePlayer.size);
                    const d = gradedDims.back || { w: 21, h: 30 };
                    return (
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(59, 158, 255, 0.08)', border: '1px solid rgba(59, 158, 255, 0.15)', padding: '3px 8px', borderRadius: '4px', color: '#3b9eff', fontWeight: 'bold' }}>
                        {d.w}" × {d.h}" ({activePlayer.size})
                      </span>
                    );
                  })()}
                </div>
                <div style={{
                  position: 'relative',
                  background: '#030305',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
                  overflow: 'hidden'
                }}>
                  <PlayerSublimationPreview
                    player={activePlayer}
                    canvasState={canvasStates.back || '{"objects":[]}'}
                    logos={project.logos}
                    viewBoxW={1120}
                    viewBoxH={1360}
                    teamName={project.name}
                    projectRules={project.rules}
                    activeTemplate={activeTemplate}
                  />
                  {hoveredPanel === 'back' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(4, 4, 6, 0.75)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      border: '1px dashed rgba(59, 158, 255, 0.3)',
                      borderRadius: '12px',
                      pointerEvents: 'none',
                    }}>
                      Double-click to expand in Focus Mode 🔍
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* BOTTOM: Secondary Panels (Sleeves, Collar) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
              width: '100%',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              paddingTop: '24px'
            }}>
              {/* Sleeves Panel */}
              <div 
                onDoubleClick={() => onUpdateProject({ activeCanvasView: 'sleeves' })}
                onMouseEnter={() => setHoveredPanel('sleeves')}
                onMouseLeave={() => setHoveredPanel(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  cursor: 'zoom-in',
                  background: '#08080c',
                  border: hoveredPanel === 'sleeves' ? '1px solid rgba(59, 158, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: hoveredPanel === 'sleeves' ? '0 12px 36px rgba(0, 0, 0, 0.5)' : '0 6px 24px rgba(0, 0, 0, 0.35)',
                  transform: hoveredPanel === 'sleeves' ? 'translateY(-2px)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '8px', fontWeight: '900', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.5px 5px', borderRadius: '3px', letterSpacing: '0.05em' }}>SECONDARY</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Sleeves Panel Pattern</span>
                  </div>
                  {(() => {
                    const gradedDims = getGarmentDimensions(activeTemplate, activePlayer.size);
                    const d = gradedDims.sleeves || { w: 24, h: 16 };
                    return (
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        {d.w}" × {d.h}" ({activePlayer.size})
                      </span>
                    );
                  })()}
                </div>
                <div style={{
                  position: 'relative',
                  background: '#030305',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8)',
                  overflow: 'hidden'
                }}>
                  <PlayerSublimationPreview
                    player={activePlayer}
                    canvasState={canvasStates.sleeves || '{"objects":[]}'}
                    logos={project.logos}
                    viewBoxW={960}
                    viewBoxH={640}
                    teamName={project.name}
                    projectRules={project.rules}
                    activeTemplate={activeTemplate}
                  />
                  {hoveredPanel === 'sleeves' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(4, 4, 6, 0.75)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      border: '1px dashed rgba(59, 158, 255, 0.3)',
                      borderRadius: '10px',
                      pointerEvents: 'none',
                    }}>
                      Double-click to expand in Focus Mode 🔍
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Collar Panel */}
              {activeTemplate.files['collar'] && (
                <div 
                  onDoubleClick={() => onUpdateProject({ activeCanvasView: 'collar' })}
                  onMouseEnter={() => setHoveredPanel('collar')}
                  onMouseLeave={() => setHoveredPanel(null)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    cursor: 'zoom-in',
                    background: '#08080c',
                    border: hoveredPanel === 'collar' ? '1px solid rgba(59, 158, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '16px',
                    padding: '16px',
                    boxShadow: hoveredPanel === 'collar' ? '0 12px 36px rgba(0, 0, 0, 0.5)' : '0 6px 24px rgba(0, 0, 0, 0.35)',
                    transform: hoveredPanel === 'collar' ? 'translateY(-2px)' : 'none',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '8px', fontWeight: '900', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.5px 5px', borderRadius: '3px', letterSpacing: '0.05em' }}>SECONDARY</span>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Collar Panel Pattern</span>
                    </div>
                    {(() => {
                      const gradedDims = getGarmentDimensions(activeTemplate, activePlayer.size);
                      const d = gradedDims.collar || { w: 14, h: 8 };
                      return (
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          {d.w}" × {d.h}" ({activePlayer.size})
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{
                    position: 'relative',
                    background: '#030305',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8)',
                    overflow: 'hidden'
                  }}>
                    <PlayerSublimationPreview
                      player={activePlayer}
                      canvasState={canvasStates.collar || '{"objects":[]}'}
                      logos={project.logos}
                      viewBoxW={560}
                      viewBoxH={320}
                      teamName={project.name}
                      projectRules={project.rules}
                      activeTemplate={activeTemplate}
                    />
                    {hoveredPanel === 'collar' && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(4, 4, 6, 0.75)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        border: '1px dashed rgba(59, 158, 255, 0.3)',
                        borderRadius: '10px',
                        pointerEvents: 'none',
                      }}>
                        Double-click to expand in Focus Mode 🔍
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

interface PlayerSublimationPreviewProps {
  player: RosterPlayer;
  canvasState: string;
  logos: SponsorLogo[];
  viewBoxW: number;
  viewBoxH: number;
  teamName?: string;
  projectRules: any;
  activeTemplate: GarmentTemplate;
}

const PlayerSublimationPreview: React.FC<PlayerSublimationPreviewProps> = ({
  player,
  canvasState,
  logos,
  viewBoxW,
  viewBoxH,
  teamName = 'TEAM',
  projectRules,
  activeTemplate
}) => {
  const [fallbackPathData, setFallbackPathData] = useState<string | null>(null);

  const objects = React.useMemo(() => {
    try {
      if (!canvasState) return [];
      const parsed = JSON.parse(canvasState);
      return parsed.objects || [];
    } catch (e) {
      console.error('Failed to parse canvas state for preview:', e);
      return [];
    }
  }, [canvasState]);

  const panelKey = viewBoxW === 1120 ? (objects.some((o: any) => o.__id && o.__id.startsWith('bg-back')) ? 'back' : 'front') : viewBoxW === 960 ? 'sleeves' : 'collar';

  useEffect(() => {
    // Check if outline is in objects
    const outlineExists = objects.some((obj: any) => obj.__id && obj.__id.startsWith('artboard-path-'));
    if (outlineExists) return;

    // Load dynamic path data fallback
    const fileKey = panelKey === 'sleeves' ? (activeTemplate.files['left-sleeve'] ? 'left-sleeve' : 'sleeves') : panelKey;
    const url = activeTemplate.files[fileKey as keyof typeof activeTemplate.files];
    if (!url) return;

    fetch(url)
      .then(res => res.text())
      .then(text => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const paths = doc.querySelectorAll('path');
        let selectedPath = paths[0];
        for (let i = 0; i < paths.length; i++) {
          const cls = paths[i].getAttribute('class');
          if (cls === 'cls-1' || paths[i].getAttribute('fill') === '#fff' || paths[i].getAttribute('fill') === '#ffffff') {
            selectedPath = paths[i];
            break;
          }
        }
        if (selectedPath === paths[0] && paths.length > 1) {
          selectedPath = paths[1];
        }
        const pathData = selectedPath?.getAttribute('d') || '';
        setFallbackPathData(pathData);
      })
      .catch(err => console.error('Failed to load fallback outline path:', err));
  }, [activeTemplate, panelKey, objects]);

  const resolvedObjects = React.useMemo(() => {
    return resolvePlayerPanelLayout(
      player,
      projectRules,
      objects,
      panelKey,
      logos,
      teamName
    );
  }, [player, projectRules, objects, panelKey, logos, teamName]);

  const outlineObj = React.useMemo(() => {
    const found = resolvedObjects.find((obj: any) => obj.__id && obj.__id.startsWith('artboard-path-'));
    if (found) return found;

    if (fallbackPathData) {
      const sizeScale = getGarmentScaleFactor(player.size);
      return {
        path: fallbackPathData,
        left: 0,
        top: 0,
        scaleX: sizeScale,
        scaleY: sizeScale
      };
    }
    return undefined;
  }, [resolvedObjects, fallbackPathData, player.size]);

  const getPathD = (obj: any): string => {
    if (typeof obj.path === 'string') return obj.path;
    if (Array.isArray(obj.path)) {
      return obj.path.map((cmd: any) => cmd.join(' ')).join(' ');
    }
    return obj.pathData || '';
  };

  const clipId = `garment-clip-${player.id}-${panelKey}-${viewBoxW}-${viewBoxH}`;
  const hasClip = outlineObj && getPathD(outlineObj);

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      style={{
        width: '100%',
        maxWidth: '320px',
        height: 'auto',
        aspectRatio: `${viewBoxW} / ${viewBoxH}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        background: '#040406',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      {hasClip && (
        <defs>
          <clipPath id={clipId}>
            <path
              d={getPathD(outlineObj)}
              transform={`translate(${outlineObj.left || 0}, ${outlineObj.top || 0}) scale(${outlineObj.scaleX || 1}, ${outlineObj.scaleY || 1})`}
            />
          </clipPath>
        </defs>
      )}

      <g clipPath={hasClip ? `url(#${clipId})` : undefined}>
        {/* Pattern white backplate */}
        {hasClip && (
          <path
            d={getPathD(outlineObj)}
            fill="#ffffff"
            transform={`translate(${outlineObj.left || 0}, ${outlineObj.top || 0}) scale(${outlineObj.scaleX || 1}, ${outlineObj.scaleY || 1})`}
          />
        )}

        {resolvedObjects.map((obj: any, idx: number) => {
          let scaleX = obj.scaleX || 1;
          let scaleY = obj.scaleY || 1;

          if (obj.visible === false) return null;
          if (obj.__isArtboard && obj.__id && obj.__id.startsWith('artboard-rect-')) return null;
          if (obj.__id && obj.__id.startsWith('artboard-path-')) return null;

          // 1. Text Elements
          if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
            let x = obj.left;
            let y = obj.top;
            const fontSize = obj.fontSize || 40;
            const fill = obj.fill || '#ffffff';
            const fontFamily = obj.fontFamily || 'Inter';
            const fontWeight = obj.fontWeight || 'bold';
            const textAnchor = obj.originX === 'center' ? 'middle' : obj.originX === 'right' ? 'end' : 'start';

            let dy = '0.35em';
            if (obj.originY === 'top') {
              dy = '0.8em';
            } else if (obj.originY === 'bottom') {
              dy = '-0.2em';
            }

            const transform = obj.angle ? `rotate(${obj.angle}, ${x}, ${y})` : undefined;

            return (
              <text
                key={obj.__id || `text-${idx}`}
                x={x}
                y={y}
                fill={fill}
                fontFamily={fontFamily}
                fontWeight={fontWeight}
                fontSize={fontSize}
                textAnchor={textAnchor}
                dy={dy}
                transform={transform}
                style={{
                  whiteSpace: 'pre'
                }}
              >
                {obj.text}
              </text>
            );
          }

          // 2. Image Elements (Logos)
          if (obj.type === 'image') {
            const w = (obj.width || 200) * scaleX;
            const h = (obj.height || 200) * scaleY;
            let x = obj.left;
            let y = obj.top;

            if (obj.originX === 'center') x -= w / 2;
            if (obj.originY === 'center') y -= h / 2;

            const transform = obj.angle ? `rotate(${obj.angle}, ${obj.left}, ${obj.top})` : undefined;

            return (
              <g key={obj.__id || `img-${idx}`} transform={transform}>
                {obj.src ? (
                  <image
                    href={obj.src}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                  />
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="rgba(59, 158, 255, 0.15)"
                    stroke="#3b9eff"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          }

          // 3. Rect shapes
          if (obj.type === 'rect') {
            const w = (obj.width || 100) * scaleX;
            const h = (obj.height || 100) * scaleY;
            let x = obj.left;
            let y = obj.top;

            if (obj.originX === 'center') x -= w / 2;
            if (obj.originY === 'center') y -= h / 2;

            const transform = obj.angle ? `rotate(${obj.angle}, ${obj.left}, ${obj.top})` : undefined;

            const isBg = obj.__id && obj.__id.startsWith('bg-');

            return (
              <rect
                key={obj.__id || `rect-${idx}`}
                x={isBg ? 0 : x}
                y={isBg ? 0 : y}
                width={isBg ? viewBoxW : w}
                height={isBg ? viewBoxH : h}
                fill={obj.fill || 'transparent'}
                transform={transform}
              />
            );
          }

          // 4. Polygon shapes
          if (obj.type === 'polygon' && obj.points) {
            const pointsStr = obj.points.map((p: any) => `${p.x * scaleX + obj.left},${p.y * scaleY + obj.top}`).join(' ');
            const transform = obj.angle ? `rotate(${obj.angle}, ${obj.left}, ${obj.top})` : undefined;
            return (
              <polygon
                key={obj.__id || `poly-${idx}`}
                points={pointsStr}
                fill={obj.fill || 'transparent'}
                transform={transform}
              />
            );
          }

          // 5. Path shapes
          if (obj.type === 'path') {
            const pathD = getPathD(obj);
            if (!pathD) return null;

            const fill = obj.fill || 'transparent';
            const stroke = obj.stroke || 'none';
            const strokeWidth = obj.strokeWidth || 1;

            const transform = `translate(${obj.left || 0}, ${obj.top || 0}) scale(${scaleX}, ${scaleY})`;

            return (
              <path
                key={obj.__id || `path-${idx}`}
                d={pathD}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                transform={transform}
              />
            );
          }

          return null;
        })}
      </g>

      {/* Draw the Garment Outline ON TOP of the clipped group as a border stroke */}
      {outlineObj && (
        <path
          d={getPathD(outlineObj)}
          fill="none"
          stroke="#4a4a5a"
          strokeWidth={1.5}
          transform={`translate(${outlineObj.left || 0}, ${outlineObj.top || 0}) scale(${outlineObj.scaleX || 1}, ${outlineObj.scaleY || 1})`}
        />
      )}

      {/* Safe print zone boundaries dashes */}
      {projectRules?.safeMarginInches > 0 && (
        <rect
          x={(projectRules.safeMarginInches) * 40}
          y={(projectRules.safeMarginInches) * 40}
          width={viewBoxW - (projectRules.safeMarginInches) * 80}
          height={viewBoxH - (projectRules.safeMarginInches) * 80}
          fill="none"
          stroke="rgba(239, 68, 68, 0.25)"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      )}
    </svg>
  );
};
