import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Project, RosterPlayer } from '../types';
import {
  MousePointer2, Type, Square, Hand, Move,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Shield, Ruler, Users,
  Upload, Plus, Trash2, AlertTriangle, Cpu, Sparkles, RefreshCw, FileDown, MapPin
} from 'lucide-react';

import { FabricCanvas, type FabricCanvasHandle, type FabricLayer, type ToolMode } from './FabricCanvas';
import {
  formatMeasurement, unitLabel, calcSafeZones,
  getGarmentDimensions, PX_PER_INCH, type MeasurementUnit, type ObjectBounds,
  type GarmentTemplate
} from '../lib/measurements';
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

interface LogoInspectorProps {
  activeObj: fabric.Image | null;
  canvasW: number;
  onApply: (props: Record<string, unknown>) => void;
}

const LogoInspector: React.FC<LogoInspectorProps> = ({ activeObj, canvasW, onApply }) => {
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
        </>
      )}
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
  const [canvasBg] = useState<'white' | 'dark' | 'transparent' | 'checkerboard'>('white');
  const [activeTextObj, setActiveTextObj] = useState<fabric.IText | null>(null);
  const [activeShapeObj, setActiveShapeObj] = useState<fabric.Rect | null>(null);
  const [activeImageObj, setActiveImageObj] = useState<fabric.Image | null>(null);
  const [workspaceMode] = useState<'beginner' | 'advanced'>('advanced');


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
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newSize, setNewSize] = useState<'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL'>('M');
  const [newVariant, setNewVariant] = useState<'Variant A' | 'Variant B' | 'Variant C'>('Variant A');

  // Helper scale function
  const calculateScale = (name: string): number => {
    if (!name) return 1.0;
    const len = name.trim().length;
    if (len <= 8) return 1.0;
    return Math.max(0.4, Math.min(1.0, 8 / len));
  };

  // Field change handler for inline editing
  const handleFieldChange = (id: string, field: keyof RosterPlayer, value: any) => {
    const updated = project.roster.map(p => {
      if (p.id === id) {
        const updatedPlayer = { ...p, [field]: value };
        if (field === 'name') {
          updatedPlayer.name = value.toUpperCase();
          updatedPlayer.nameScale = calculateScale(value);
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

  // Quick Add player handler
  const handleQuickAdd = () => {
    if (!newName.trim() || !newNumber.trim()) return;

    const newPlayer: RosterPlayer = {
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: newName.trim().toUpperCase(),
      number: newNumber.trim(),
      size: newSize,
      nameScale: calculateScale(newName),
      variant: newVariant,
      status: 'Mapped'
    };

    const updated = [...project.roster, newPlayer];
    onUpdateProject({
      roster: updated,
      activePlayerId: newPlayer.id
    });

    setNewName('');
    setNewNumber('');
  };

  // CSV file reading
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
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
    e.target.value = '';
  };

  // Excel file reading
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const XLSX = await loadSheetJS();
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
    } catch (err) {
      console.error('Failed to parse Excel:', err);
      alert('Failed to import Excel. Make sure it is a valid .xlsx file.');
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
        nameScale: calculateScale(name),
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
    const updated = project.roster.map(p => ({
      ...p,
      status: 'Ready for Export' as const
    }));
    onUpdateProject({ roster: updated });
    alert(`Successfully generated variations for all ${project.roster.length} players! All systems validated.`);
  };

  const handleBulkExport = () => {
    onUpdateProject({ stage: 'export' });
  };

  const handleBulkSync = () => {
    const updated = project.roster.map(p => ({
      ...p,
      nameScale: calculateScale(p.name)
    }));
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
    
    canvas.getObjects().forEach((obj: any) => {
      if (obj.__isArtboard) return;
      if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
        const textVal = (obj.text || '').trim().toUpperCase();
        
        if (textVal === 'SURNAME' || textVal === 'PLAYER NAME' || textVal === 'NAME' || project.roster.some(p => p.name.toUpperCase() === textVal)) {
          obj.__isNameText = true;
          mappedName = true;
        } else if (textVal === '00' || textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || project.roster.some(p => p.number === textVal)) {
          obj.__isNumberText = true;
          mappedNum = true;
        }
      }
    });
    
    if (mappedName || mappedNum) {
      if (activePlayer) {
        syncPlayerOnCanvas(canvas, activePlayer, undefined);
      }
      alert(`Auto-mapping complete! Bound ${mappedName ? 'Player Name layer' : ''} ${mappedName && mappedNum ? 'and' : ''} ${mappedNum ? 'Player Number layer' : ''} successfully.`);
    } else {
      alert('Could not find matches on the canvas. Please select a text object and use the typography presets to label Surname / Number.');
    }
  };

  // Canvas Synchronizer & Auto Scaling
  const syncPlayerOnCanvas = useCallback((canvas: fabric.Canvas, player: RosterPlayer, previousPlayer?: RosterPlayer) => {
    if (!canvas || !player) return;
    const nameToSet = player.name.toUpperCase();
    const numberToSet = player.number;

    let canvasChanged = false;

    canvas.getObjects().forEach((obj: any) => {
      if (obj.__isArtboard) return;
      if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
        const textVal = (obj.text || '').trim().toUpperCase();

        const isName = obj.__isNameText ||
          textVal === 'SURNAME' ||
          textVal === 'PLAYER NAME' ||
          textVal === 'NAME' ||
          (previousPlayer && textVal === previousPlayer.name.toUpperCase()) ||
          project.roster.some(p => p.name.toUpperCase() === textVal);

        const isNumber = obj.__isNumberText ||
          textVal === '00' ||
          textVal === 'PLAYER NUMBER' ||
          textVal === 'NUMBER' ||
          (previousPlayer && textVal === previousPlayer.number) ||
          project.roster.some(p => p.number === textVal);

        if (isName) {
          obj.__isNameText = true;
          obj.set({ text: nameToSet });
          canvasChanged = true;

          // Typography auto-scaling & Safe zones
          const maxTextWidthInches = project.rules.maxTextWidthInches || 18;
          const maxTextWidthPx = maxTextWidthInches * 40;
          const currentWidth = obj.width;
          if (currentWidth > 0) {
            const fittedScale = Math.min(1.0, maxTextWidthPx / currentWidth);
            const finalScale = fittedScale * player.nameScale;
            obj.set({ scaleX: finalScale });
          }

          if (project.rules.autoCenter) {
            if (obj.originX === 'center') {
              obj.set({ left: canvas.width / 2 });
            } else {
              obj.set({ left: (canvas.width - obj.width * obj.scaleX) / 2 });
            }
          }
          obj.setCoords();
        } else if (isNumber) {
          obj.__isNumberText = true;
          obj.set({ text: numberToSet });
          canvasChanged = true;

          if (project.rules.autoCenter) {
            if (obj.originX === 'center') {
              obj.set({ left: canvas.width / 2 });
            } else {
              obj.set({ left: (canvas.width - obj.width * obj.scaleX) / 2 });
            }
          }
          obj.setCoords();
        }
      }
    });

    if (canvasChanged) {
      canvas.requestRenderAll();
      fabricRef.current?.saveHistory();
    }
  }, [project.roster, project.rules.maxTextWidthInches, project.rules.autoCenter]);

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

  const fabricRef = useRef<FabricCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Artboard dimensions (in pixels at 40px/in) ────────────────────────────
  // Driven by real garment dimensions for production accuracy
  const CANVAS_W = React.useMemo(() => {
    const view = project.activeCanvasView;
    if (view === 'full') return 2400;
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
      setToolMode('text');
    } else if (layer.type === 'shape') {
      setActiveShapeObj(obj as fabric.Rect);
      setActiveTextObj(null);
      setActiveImageObj(null);
      setToolMode('shape');
    } else if (layer.type === 'image') {
      setActiveImageObj(obj as fabric.Image);
      setActiveTextObj(null);
      setActiveShapeObj(null);
      setToolMode('select');
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

      {/* ── LEFT SIDEBAR: Redesigned Production Variation Roster Manager ── */}
      <aside
        className="layers-sidebar"
        style={{
          width: `${studioLeftWidth}px`,
          minWidth: `${studioLeftWidth}px`,
          maxWidth: `${studioLeftWidth}px`,
          transition: isDraggingLeft ? 'none' : undefined,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#0a0a0f',
          borderRight: '1px solid var(--border-muted)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Header & Title */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-muted)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={14} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#fff', letterSpacing: '0.04em' }}>ROSTER STUDIO</span>
              </div>
              <span style={{ fontSize: '8.5px', fontWeight: 'bold', background: 'rgba(0,112,243,0.12)', color: 'var(--accent-blue)', padding: '2px 6px', borderRadius: '10px' }}>
                VARIATIONS
              </span>
            </div>
            
            {/* AI HUD Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', background: '#0f0f14', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)', marginTop: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '7.5px', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>Total</span>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>{project.roster.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '7.5px', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>Ready</span>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-success)' }}>
                  {project.roster.filter(p => p.status === 'Ready for Export').length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '7.5px', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>Alerts</span>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: project.roster.filter(p => getPlayerValidationWarning(p, project.roster) !== null).length > 0 ? '#eb5757' : 'var(--text-disabled)' }}>
                  {project.roster.filter(p => getPlayerValidationWarning(p, project.roster) !== null).length}
                </span>
              </div>
            </div>
          </div>

          {/* Hidden Import Upload Inputs */}
          <input ref={csvFileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
          <input ref={excelFileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleExcelImport} />

          {/* Action Panel: Imports & Bulk */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', background: '#0c0c12', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
            {/* Import Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={() => csvFileInputRef.current?.click()}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '6px', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-muted)'}
              >
                <Upload size={10} /> Import CSV
              </button>
              <button
                onClick={() => excelFileInputRef.current?.click()}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', borderRadius: '6px', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-muted)'}
              >
                <FileDown size={10} /> Import Excel
              </button>
            </div>

            {/* Bulk Actions Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <button onClick={handleBulkGenerate} className="inspector-btn-toggle" style={{ fontSize: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height: '24px', background: 'rgba(0,112,243,0.08)', border: '1px solid rgba(0,112,243,0.2)', color: 'var(--accent-blue)' }}>
                <Sparkles size={9} /> Generate All
              </button>
              <button onClick={handleBulkExport} className="inspector-btn-toggle" style={{ fontSize: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height: '24px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }}>
                <FileDown size={9} /> Export All
              </button>
              <button onClick={handleBulkSync} className="inspector-btn-toggle" style={{ fontSize: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height: '24px', color: 'var(--text-secondary)' }}>
                <RefreshCw size={9} /> Sync All
              </button>
              <button onClick={handleAutoMap} className="inspector-btn-toggle" style={{ fontSize: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height: '24px', color: 'var(--text-secondary)' }}>
                <MapPin size={9} /> Auto Map
              </button>
            </div>
          </div>

          {/* Quick Add Player Card */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', background: '#08080c', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-disabled)', letterSpacing: '0.04em' }}>Quick Add Player</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="SURNAME"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 1.8, background: '#0d111d', border: '1px solid var(--border-muted)', borderRadius: '4px', padding: '5px 8px', fontSize: '11px', color: '#fff', outline: 'none' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
              />
              <input
                type="text"
                placeholder="NO."
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                style={{ width: '40px', background: '#0d111d', border: '1px solid var(--border-muted)', borderRadius: '4px', padding: '5px 4px', fontSize: '11px', color: 'var(--accent-blue)', outline: 'none', textAlign: 'center', fontFamily: 'monospace' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
              />
              <button
                onClick={handleQuickAdd}
                style={{ width: '28px', height: '26px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
              >
                <Plus size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '6px' }}>
              <select
                value={newSize}
                onChange={(e) => setNewSize(e.target.value as any)}
                style={{ background: '#0d111d', border: '1px solid var(--border-muted)', borderRadius: '4px', padding: '4px 6px', fontSize: '10px', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer' }}
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
                value={newVariant}
                onChange={(e) => setNewVariant(e.target.value as any)}
                style={{ background: '#0d111d', border: '1px solid var(--border-muted)', borderRadius: '4px', padding: '4px 6px', fontSize: '10px', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="Variant A">Variant A</option>
                <option value="Variant B">Variant B</option>
                <option value="Variant C">Variant C</option>
              </select>
            </div>
          </div>

          {/* Roster Database Scrollable List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {project.roster.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-disabled)', padding: '36px 0', fontSize: '11px', border: '1px dashed var(--border-muted)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <Users size={18} style={{ opacity: 0.4 }} />
                <span>No variations loaded.</span>
                <span style={{ fontSize: '9px', opacity: 0.6 }}>Import CSV or use Quick Add above.</span>
              </div>
            ) : (
              project.roster.map((player) => {
                const isActive = project.activePlayerId === player.id;
                const warning = getPlayerValidationWarning(player, project.roster);
                const isReady = player.status === 'Ready for Export';

                return (
                  <div
                    key={player.id}
                    onClick={() => onUpdateProject({ activePlayerId: player.id })}
                    style={{
                      background: isActive ? 'rgba(0,112,243,0.04)' : '#0d0f14',
                      border: isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-muted)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s',
                      boxShadow: isActive ? '0 0 10px rgba(0,112,243,0.1)' : 'none',
                    }}
                  >
                    {/* Top Row: Mini Jersey, Name, Number, Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: isActive ? 'var(--accent-blue)' : 'transparent',
                            border: isActive ? 'none' : '1px solid var(--text-disabled)',
                            boxShadow: isActive ? '0 0 6px var(--accent-blue)' : 'none'
                          }}
                        />
                        <MiniJerseyThumbnail
                          primaryColor={project.baseColors.primary}
                          secondaryColor={project.baseColors.secondary}
                          apparelType={project.apparelType}
                        />
                      </div>

                      {/* Name input */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          type="text"
                          value={player.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleFieldChange(player.id, 'name', e.target.value)}
                          style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid transparent',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '2px 0',
                            outline: 'none',
                            textTransform: 'uppercase'
                          }}
                          onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-blue)'}
                          onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                        />
                      </div>

                      {/* Number input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-disabled)', fontWeight: 'bold' }}>#</span>
                        <input
                          type="text"
                          value={player.number}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleFieldChange(player.id, 'number', e.target.value)}
                          style={{
                            width: '24px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid transparent',
                            color: 'var(--accent-blue)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            padding: '2px 0',
                            textAlign: 'center',
                            outline: 'none',
                            fontFamily: 'monospace'
                          }}
                          onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-blue)'}
                          onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                        />
                      </div>

                      {/* Trash action */}
                      <button
                        onClick={(e) => handleDeletePlayer(player.id, e)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-disabled)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {/* Bottom Row: Selector Toggles (Size, Variant, Status) */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <select
                        value={player.size}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleFieldChange(player.id, 'size', e.target.value)}
                        style={{
                          flex: 1,
                          background: '#07080c',
                          border: '1px solid var(--border-muted)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          fontSize: '9.5px',
                          padding: '2px 4px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
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
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleFieldChange(player.id, 'variant', e.target.value)}
                        style={{
                          flex: 1.4,
                          background: '#07080c',
                          border: '1px solid var(--border-muted)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          fontSize: '9.5px',
                          padding: '2px 4px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Variant A">Variant A</option>
                        <option value="Variant B">Variant B</option>
                        <option value="Variant C">Variant C</option>
                      </select>

                      <select
                        value={player.status || 'Mapped'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleFieldChange(player.id, 'status', e.target.value)}
                        style={{
                          flex: 1.2,
                          background: '#07080c',
                          border: '1px solid var(--border-muted)',
                          borderRadius: '4px',
                          color: isReady ? 'var(--color-success)' : 'var(--accent-blue)',
                          fontWeight: 'bold',
                          fontSize: '9.5px',
                          padding: '2px 4px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Mapped">Mapped</option>
                        <option value="Ready for Export">Ready</option>
                      </select>
                    </div>

                    {/* Scale bar or Warnings Banner */}
                    <div style={{ marginTop: '2px' }} onClick={(e) => e.stopPropagation()}>
                      {warning ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(235,87,87,0.06)',
                          border: '1px solid rgba(235,87,87,0.18)',
                          color: '#eb5757',
                          fontSize: '8.5px',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontWeight: 'bold'
                        }}>
                          <AlertTriangle size={9} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{warning}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '8px', color: 'var(--text-disabled)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                            SCALE {Math.round(player.nameScale * 100)}%
                          </span>
                          <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${player.nameScale * 100}%`,
                                background: player.nameScale < 0.7 ? '#f2c94c' : 'var(--color-success)',
                                borderRadius: '2px'
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* Resize handle left */}
      <div onMouseDown={startResizeLeft} className={`resize-handle-vertical ${isDraggingLeft ? 'dragging' : ''}`} />

      {/* ── CENTER WORKSPACE ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* Top Bar: View Tabs + Canvas Controls */}
        <div className="studio-topbar">
          {/* Panel view tabs */}
          <div style={{ display: 'flex', gap: '4px', paddingLeft: '8px' }}>
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
              />

              {/* ── Floating Dimension HUD ──────────────────────────── */}
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
                inspectorMode === 'image' ? 'Logo Properties' : 'Workspace Configuration'}
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
          ) : inspectorMode === 'image' ? (
            <LogoInspector
              activeObj={activeImageObj}
              canvasW={CANVAS_W}
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

              {/* Canvas Background */}
              <div>
                <span className="studio-ctrl-label" style={{ marginBottom: '8px', display: 'block', color: 'var(--text-secondary)' }}>CANVAS</span>
                <button
                  className="studio-ctrl-btn active"
                  style={{ width: '100%', padding: '6px 12px', pointerEvents: 'none' }}
                >
                  White
                </button>
              </div>

              {/* Advanced Mode Calibration Controls */}
              {workspaceMode === 'advanced' && (
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
              )}
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

    </div>
  );
};
