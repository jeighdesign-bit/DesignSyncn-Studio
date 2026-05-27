import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Project, RosterPlayer, SponsorLogo } from '../types';
import {
  MousePointer2, Type, Square, Hand, Move,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Shield, Ruler, Users,
  Upload, Plus, Trash2, AlertTriangle, Cpu, Sparkles, RefreshCw, FileDown, MapPin
} from 'lucide-react';

import { FabricCanvas, type FabricCanvasHandle, type FabricLayer, type ToolMode } from './FabricCanvas';
import { RuleEngine } from './RuleEngine';

import {
  formatMeasurement, unitLabel, calcSafeZones,
  getGarmentDimensions, PX_PER_INCH, type MeasurementUnit, type ObjectBounds,
  type GarmentTemplate, generateProductionCanvasStates
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
              <h4 style={{ fontSize: isMinimal ? '11px' : '12px', fontWeight: 'bold', color: '#fff', margin: '0 0 6px 0' }}>No roster entries yet</h4>
              <p style={{ fontSize: '9.5px', color: 'var(--text-disabled)', lineHeight: 1.4, margin: '0 0 16px 0', maxWidth: '180px' }}>
                Import a CSV/Excel roster or manually add players.
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

const getSizeScaleFactor = (size: string): number => {
  switch (size) {
    case 'XS': return 0.8;
    case 'S': return 0.87;
    case 'M': return 0.93;
    case 'L': return 1.0;
    case 'XL': return 1.07;
    case 'XXL': return 1.13;
    case '3XL': return 1.2;
    default: return 1.0;
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
  const [configTab, setConfigTab] = useState<'workspace' | 'rules'>('workspace');



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
    onUpdateProject({ 
      roster: updated,
      activeCanvasView: 'roster_previews'
    });
    alert(`Successfully generated variations for all ${project.roster.length} players! Switch to Roster Previews tab to review.`);
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
              {currentView === 'roster_previews' ? (
                <RosterPreviewsGrid
                  project={project}
                  getSizeScaleFactor={getSizeScaleFactor}
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
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
              {/* Configuration Sub-tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-muted)', padding: '0 8px', background: 'var(--bg-secondary)', gap: '4px', flexShrink: 0 }}>
                <button
                  style={{
                    padding: '10px 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: configTab === 'workspace' ? '#fff' : 'var(--text-disabled)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: configTab === 'workspace' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setConfigTab('workspace')}
                >
                  Workspace
                </button>
                <button
                  style={{
                    padding: '10px 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: configTab === 'rules' ? '#fff' : 'var(--text-disabled)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: configTab === 'rules' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setConfigTab('rules')}
                >
                  Production Rules
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {configTab === 'workspace' ? (
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
                ) : (
                  <RuleEngine project={project} onUpdateProject={onUpdateProject} />
                )}
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

    </div>
  );
};

interface RosterPreviewsGridProps {
  project: Project;
  getSizeScaleFactor: (size: string) => number;
}

const RosterPreviewsGrid: React.FC<RosterPreviewsGridProps> = ({
  project,
  getSizeScaleFactor
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

  const activePlayer = project.roster.find(p => p.id === selectedPlayerId) || project.roster[0];

  // Compile default states or fetch project canvasStates
  const canvasStates = React.useMemo(() => {
    return project.canvasStates || generateProductionCanvasStates(project);
  }, [project]);

  if (project.roster.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-disabled)',
        gap: '8px'
      }}>
        <Users size={32} style={{ opacity: 0.6 }} />
        <span style={{ fontSize: '12px' }}>Roster is empty. Add players to see previews.</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#07070a',
      color: '#fff',
      padding: '16px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      {/* Roster list switcher at top */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Select Player Preview:</span>
        <select
          value={selectedPlayerId || ''}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
          style={{
            background: '#0f0f14',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '4px 8px',
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

      {activePlayer && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#0a0a0f',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '8px',
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          {/* Header Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px', marginBottom: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent-blue)' }}>#{activePlayer.number || '0'}</span>
                <span>{activePlayer.name || 'UNNAMED'}</span>
              </h3>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '11px', color: 'var(--text-disabled)' }}>
                <span>Size: <strong style={{ color: '#fff' }}>{activePlayer.size}</strong></span>
                <span>•</span>
                <span>Variant: <strong style={{ color: '#fff' }}>{activePlayer.variant || 'Variant A'}</strong></span>
                <span>•</span>
                <span>Status: <strong style={{ color: activePlayer.status === 'Ready for Export' ? 'var(--color-success)' : 'var(--accent-blue)' }}>{activePlayer.status || 'Mapped'}</strong></span>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ fontSize: '9px', fontWeight: 'bold', background: 'rgba(59, 158, 255, 0.1)', color: '#3b9eff', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(59, 158, 255, 0.2)' }}>
                Vector Calibrated
              </span>
            </div>
          </div>

          {/* Side-by-side SVG Panel Previews */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            alignItems: 'start'
          }}>
            {/* Front Panel Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>FRONT PANEL</span>
                <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>1120 × 1360 (28" × 34")</span>
              </div>
              <div style={{ background: '#030305', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'center', padding: '8px' }}>
                <PlayerSublimationPreview
                  player={activePlayer}
                  canvasState={canvasStates.front || '{"objects":[]}'}
                  logos={project.logos}
                  getSizeScaleFactor={getSizeScaleFactor}
                  viewBoxW={1120}
                  viewBoxH={1360}
                />
              </div>
            </div>

            {/* Back Panel Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>BACK PANEL</span>
                <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>1120 × 1360 (28" × 34")</span>
              </div>
              <div style={{ background: '#030305', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'center', padding: '8px' }}>
                <PlayerSublimationPreview
                  player={activePlayer}
                  canvasState={canvasStates.back || '{"objects":[]}'}
                  logos={project.logos}
                  getSizeScaleFactor={getSizeScaleFactor}
                  viewBoxW={1120}
                  viewBoxH={1360}
                />
              </div>
            </div>

            {/* Sleeves Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>SLEEVES PANEL</span>
                <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>960 × 640 (24" × 16")</span>
              </div>
              <div style={{ background: '#030305', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'center', padding: '8px' }}>
                <PlayerSublimationPreview
                  player={activePlayer}
                  canvasState={canvasStates.sleeves || '{"objects":[]}'}
                  logos={project.logos}
                  getSizeScaleFactor={getSizeScaleFactor}
                  viewBoxW={960}
                  viewBoxH={640}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PlayerSublimationPreviewProps {
  player: RosterPlayer;
  canvasState: string;
  logos: SponsorLogo[];
  getSizeScaleFactor: (size: string) => number;
  viewBoxW: number;
  viewBoxH: number;
}

const PlayerSublimationPreview: React.FC<PlayerSublimationPreviewProps> = ({
  player,
  canvasState,
  logos,
  getSizeScaleFactor,
  viewBoxW,
  viewBoxH,
}) => {
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

  const sizeScale = getSizeScaleFactor(player.size);

  const getPathD = (obj: any): string => {
    if (typeof obj.path === 'string') return obj.path;
    if (Array.isArray(obj.path)) {
      return obj.path.map((cmd: any) => cmd.join(' ')).join(' ');
    }
    return obj.pathData || '';
  };

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      style={{
        width: '100%',
        maxWidth: '320px',
        height: 'auto',
        aspectRatio: `${viewBoxW} / ${viewBoxH}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        background: '#14141a',
        borderRadius: '4px'
      }}
    >
      {objects.map((obj: any, idx: number) => {
        let scaleX = obj.scaleX || 1;
        let scaleY = obj.scaleY || 1;

        if (obj.visible === false) return null;

        // 1. Text Elements
        if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
          const textVal = (obj.text || '').trim().toUpperCase();
          const isName = obj.__isNameText || textVal === 'SURNAME' || textVal === 'PLAYER NAME' || textVal === 'NAME';
          const isNumber = obj.__isNumberText || textVal === '00' || textVal === '0' || textVal === 'NUMBER';

          let content = textVal;
          let finalScaleX = scaleX;
          let finalScaleY = scaleY;

          if (isName) {
            content = (player.name || 'UNNAMED').toUpperCase();
            finalScaleX = scaleX * sizeScale * player.nameScale;
            finalScaleY = scaleY * sizeScale * player.nameScale;
          } else if (isNumber) {
            content = player.number || '0';
            finalScaleX = scaleX * sizeScale;
            finalScaleY = scaleY * sizeScale;
          }

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
                transform: `translate(${x}px, ${y}px) scale(${finalScaleX}, ${finalScaleY}) translate(${-x}px, ${-y}px)`,
                transformOrigin: `${x}px ${y}px`,
                whiteSpace: 'pre'
              }}
            >
              {content}
            </text>
          );
        }

        // 2. Image Elements (Logos)
        if (obj.type === 'image') {
          const isPrimary = obj.__id === 'logo-primary';
          const isSleeve = obj.__id === 'logo-sleeve';

          let isVisible = true;
          if (isPrimary && logos[0]) {
            const logoId = logos[0].id;
            isVisible = player.sponsorMapping ? player.sponsorMapping.includes(logoId) : true;
          } else if (isSleeve && (logos[1] || logos[0])) {
            const logoId = (logos[1] || logos[0]).id;
            isVisible = player.sponsorMapping ? player.sponsorMapping.includes(logoId) : true;
          }

          if (!isVisible) return null;

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

        // 5. Path shapes (Garment outline or decorative curves)
        if (obj.type === 'path') {
          const pathD = getPathD(obj);
          if (!pathD) return null;

          const isOutline = obj.__id && obj.__id.startsWith('artboard-path-');
          const fill = isOutline ? 'none' : (obj.fill || 'transparent');
          const stroke = isOutline ? 'rgba(235, 87, 87, 0.8)' : (obj.stroke || 'none');
          const strokeWidth = isOutline ? 2 : (obj.strokeWidth || 1);
          const strokeDasharray = isOutline ? '4,4' : undefined;

          const transform = `translate(${obj.left || 0}, ${obj.top || 0}) scale(${scaleX}, ${scaleY})`;

          return (
            <path
              key={obj.__id || `path-${idx}`}
              d={pathD}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              transform={transform}
            />
          );
        }

        return null;
      })}
    </svg>
  );
};
