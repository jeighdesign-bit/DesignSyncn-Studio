import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import {
  majorTickIntervalPx, minorDivisions, fromPx,
  getGarmentDimensions, type MeasurementUnit, type ObjectBounds,
  type SafeZoneRects, type GarmentTemplate, getAnchorCoords,
  calcSafeZones, unitLabel
} from '../lib/measurements';
import type { Project } from '../types';
import * as fabric from 'fabric';

// Register custom properties for serialization in Fabric.js v7
(fabric.FabricObject as any).customProperties = [
  '__id',
  '__layerName',
  '__isArtboard',
  '__locked',
  '__panel',
  '__anchor',
  '__offsetXInches',
  '__offsetYInches',
  '__isNameText',
  '__isNumberText',
  '__baseFontSize',
  '__baseScaleX',
  '__baseScaleY',
  '__restrictToSafe',
  '__productionLocked',
  'selectable',
  'evented'
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolMode = 'select' | 'hand' | 'move' | 'text' | 'shape';

export interface FabricLayer {
  id: string;
  name: string;
  type: 'text' | 'shape' | 'image' | 'unknown';
  visible: boolean;
  locked: boolean;
  objectRef: fabric.FabricObject;
}

export interface FabricCanvasHandle {
  addText: (options?: Partial<fabric.ITextProps>) => void;
  addShape: (options?: { fill?: string; stroke?: string; strokeWidth?: number }) => void;
  addImageFromUrl: (url: string, name: string) => void;
  getCanvas: () => fabric.Canvas | null;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  setObjectVisible: (id: string, visible: boolean) => void;
  setObjectLocked: (id: string, locked: boolean) => void;
  setBackground: (bg: 'white' | 'dark' | 'transparent' | 'checkerboard') => void;
  selectObject: (id: string) => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
}

interface FabricCanvasProps {
  toolMode: ToolMode;
  zoom: number;
  pan: { x: number; y: number };
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onLayersChange: (layers: FabricLayer[]) => void;
  onSelectionChange: (layer: FabricLayer | null) => void;
  onSelectionMeasure?: (bounds: ObjectBounds | null) => void;
  canvasBg: 'white' | 'dark' | 'transparent' | 'checkerboard';
  width?: number;
  height?: number;
  label?: string;
  currentView?: 'front' | 'back' | 'sleeves' | 'collar' | 'full';
  initialUndoStack?: string[];
  initialRedoStack?: string[];
  onHistoryChange?: (undoStack: string[], redoStack: string[]) => void;
  /** Display unit for rulers and grid */
  unit?: MeasurementUnit;
  /** Whether to render safe zone overlays */
  showSafeZones?: boolean;
  showRulersAndGrid?: boolean;
  /** Safe zone rectangles in scene pixels (from measurements.calcSafeZones) */
  safeZones?: SafeZoneRects;
  activeTemplate?: GarmentTemplate;
  activeSize?: string;
  offsets?: any;
  project?: Project;
}

// ─── Helper: unique layer names ───────────────────────────────────────────────

let textCounter = 1;
let shapeCounter = 1;
let imageCounter = 1;

const getLayerType = (obj: fabric.FabricObject): FabricLayer['type'] => {
  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') return 'text';
  if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'polygon' || obj.type === 'path') return 'shape';
  if (obj.type === 'image') return 'image';
  return 'unknown';
};

const getLayerName = (obj: fabric.FabricObject, fallback: string): string => {
  return (obj as any).__layerName ?? fallback;
};

const buildLayers = (canvas: fabric.Canvas): FabricLayer[] => {
  const objects = canvas.getObjects().filter(o => !(o as any).__isArtboard && (o as any).__panel !== 'sleeves_right');
  return [...objects].reverse().map((obj, revIdx) => {
    const type = getLayerType(obj);
    const id = (obj as any).__id ?? `obj-${revIdx}`;
    const name = getLayerName(obj, `${type === 'text' ? 'Text' : type === 'image' ? 'Image' : 'Shape'} Layer`);
    return {
      id,
      name,
      type,
      visible: obj.visible !== false,
      locked: !(obj.selectable ?? true),
      objectRef: obj,
    };
  });
};

// Global cache for template SVG paths and viewBoxes
const svgCache: Record<string, Record<string, { pathData: string; viewBoxW: number; viewBoxH: number; svgContent: string }>> = {};

export interface GarmentPlacement {
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

export function getGarmentPlacement(
  panel: string,
  viewBoxW: number,
  viewBoxH: number,
  dims: Record<string, { w: number; h: number }>,
  artboardW: number,
  artboardH: number,
  offset: { x: number; y: number },
  flipH = false
): GarmentPlacement {
  const fitRatio = 0.92;
  const maxW = artboardW * fitRatio;
  const maxH = artboardH * fitRatio;

  // Physical target dimensions in pixels (40px = 1 inch)
  const panelDim = dims[panel === 'sleeves_right' ? 'sleeves' : panel] ?? dims.front;
  let targetW = panelDim.w * 40;
  let targetH = panelDim.h * 40;

  if (panel === 'sleeves' || panel === 'sleeves_right') {
    targetW = panelDim.w * 2 * 40; // Sleeve flat horizontal layout is double the half-width measurement
  }

  // True physical scale
  const trueScale = Math.min(targetW / viewBoxW, targetH / viewBoxH);
  const trueW = viewBoxW * trueScale;
  const trueH = viewBoxH * trueScale;

  // If true physical size exceeds safe area, scale down. Otherwise keep true size.
  let scale = trueScale;
  if (trueW > maxW || trueH > maxH) {
    scale = Math.min(maxW / viewBoxW, maxH / viewBoxH);
  }

  const width = viewBoxW * scale;
  const height = viewBoxH * scale;

  // Center inside the artboard
  const centerX = (artboardW - width) / 2;
  const centerY = (artboardH - height) / 2;

  const left = offset.x + centerX + (flipH ? width : 0);
  const top = offset.y + centerY;

  return { scale, width, height, left, top };
}

const applyBg = (canvas: fabric.Canvas, bg: string) => {
  const artboards = canvas.getObjects().filter(o => (o as any).__isArtboard);
  if (artboards.length === 0) return;

  artboards.forEach(artboard => {
    if (bg === 'white') {
      artboard.set({ fill: '#ffffff' });
    } else if (bg === 'dark') {
      artboard.set({ fill: '#0a0a0e' });
    } else if (bg === 'transparent') {
      artboard.set({ fill: 'rgba(0,0,0,0)' });
    } else if (bg === 'checkerboard') {
      const patternCanvas = document.createElement('canvas');
      patternCanvas.width = 16;
      patternCanvas.height = 16;
      const ctx = patternCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#f0f0f3';
      ctx.fillRect(0, 0, 8, 8);
      ctx.fillRect(8, 8, 8, 8);
      const pat = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
      artboard.set({ fill: pat as any });
    }
  });
  canvas.requestRenderAll();
};


export const getSizeScaleFactor = (size: string): number => {
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

export function alignObjectsToProductionAnchors(
  canvas: fabric.Canvas,
  panel: string,
  width: number,
  height: number,
  project: Project,
  offsets?: any
) {
  const rules = project.rules;
  const roster = project.roster;
  const activePlayer = roster.find(p => p.id === project.activePlayerId);
  const activeSize = activePlayer?.size ?? 'M';

  // Get scale compensation factor
  const sizeScaleFactor = rules.dynamicScaling ? getSizeScaleFactor(activeSize) : 1.0;

  const isFull = panel === 'full';
  const offs = offsets || {
    sleeves: { x: 60, y: 100 },
    sleeves_right: { x: 1380, y: 100 },
    front: { x: 60, y: 920 },
    back: { x: 1220, y: 920 },
    collar: { x: 920, y: 760 },
    totalW: 2400,
    totalH: 2400
  };

  canvas.getObjects().forEach((obj: any) => {
    if (obj.__isArtboard) return;

    // Determine the active object's panel
    const objPanel = isFull ? (obj.__panel || 'front') : panel;
    const normalizedObjPanel = objPanel === 'sleeves_right' ? 'sleeves' : objPanel;

    // Get the size of that active panel in pixels
    let panelW = width;
    let panelH = height;
    if (isFull) {
      panelW = objPanel === 'front' || objPanel === 'back' ? 1120 : objPanel === 'sleeves' || objPanel === 'sleeves_right' ? 960 : 560;
      panelH = objPanel === 'front' || objPanel === 'back' ? 1360 : objPanel === 'sleeves' || objPanel === 'sleeves_right' ? 640 : 320;
    }

    // Get the offset of that active panel on the master canvas
    let panelOffsetX = 0;
    let panelOffsetY = 0;
    if (isFull) {
      const offset = offs[objPanel] ?? offs.front;
      panelOffsetX = offset.x;
      panelOffsetY = offset.y;
    }

    let anchor = obj.__anchor;
    let ox = obj.__offsetXInches;
    let oy = obj.__offsetYInches;

    // If it doesn't have an explicit anchor, assign default sublimation anchor rules
    if (!anchor) {
      const textVal = (obj.text || '').trim().toUpperCase();

      const isName = obj.__isNameText ||
        textVal === 'SURNAME' ||
        textVal === 'PLAYER NAME' ||
        textVal === 'NAME' ||
        project.roster.some(p => p.name.toUpperCase() === textVal);

      const isNumber = obj.__isNumberText ||
        textVal === '00' ||
        textVal === 'PLAYER NUMBER' ||
        textVal === 'NUMBER' ||
        project.roster.some(p => p.number === textVal);

      const isPrimaryLogo = obj.__id === 'logo-primary' || (obj.type === 'image' && obj.__layerName?.includes('Primary Crest'));
      const isSleeveLogo = obj.__id === 'logo-sleeve' || (obj.type === 'image' && obj.__layerName?.includes('Sleeve Sponsor'));

      if (normalizedObjPanel === 'back' && isName) {
        anchor = 'collar_base';
        ox = 0;
        oy = rules.surnameSpacingCollarInches;
        obj.__isNameText = true;
      } else if (normalizedObjPanel === 'back' && isNumber) {
        anchor = 'collar_base';
        ox = 0;
        oy = rules.surnameSpacingCollarInches + rules.playerNameHeightInches + 1.0;
        obj.__isNumberText = true;
      } else if (normalizedObjPanel === 'front' && isPrimaryLogo) {
        anchor = 'collar_base';
        ox = rules.chestAlignment === 'left' ? -5.0 : rules.chestAlignment === 'right' ? 5.0 : 0;
        oy = rules.frontLogoSpacingCollarInches;
      } else if (normalizedObjPanel === 'sleeves' && isSleeveLogo) {
        anchor = 'sleeve_center';
        ox = 0;
        oy = 0;
      } else {
        // Fallback to closest anchor point in physics space
        const relativeCenter = obj.getCenterPoint();
        const center = {
          x: relativeCenter.x - panelOffsetX,
          y: relativeCenter.y - panelOffsetY
        };
        const possibleAnchors = normalizedObjPanel === 'front' 
          ? ['collar_base', 'chest_center', 'left_chest', 'right_chest', 'hem_base']
          : normalizedObjPanel === 'back'
            ? ['collar_base', 'mid_back', 'hem_base']
            : normalizedObjPanel === 'sleeves'
              ? ['sleeve_cap', 'sleeve_center', 'sleeve_cuff']
              : ['collar_center'];

        let bestAnchor = possibleAnchors[0];
        let minDist = Infinity;
        possibleAnchors.forEach(a => {
          const ac = getAnchorCoords(objPanel, a, panelW, panelH);
          const dist = Math.hypot(center.x - ac.x, center.y - ac.y);
          if (dist < minDist) {
            minDist = dist;
            bestAnchor = a;
          }
        });

        anchor = bestAnchor;
        const ac = getAnchorCoords(objPanel, anchor, panelW, panelH);
        ox = (center.x - ac.x) / 40;
        oy = (center.y - ac.y) / 40;
      }

      obj.__anchor = anchor;
      obj.__offsetXInches = Number(ox.toFixed(3));
      obj.__offsetYInches = Number(oy.toFixed(3));
    }

    // Dynamic Sizing (Scale Compensation)
    if (rules.dynamicScaling) {
      if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
        const baseFontSize = obj.__isNameText 
          ? rules.playerNameHeightInches * 40 
          : obj.__isNumberText 
            ? rules.playerNumberHeightInches * 40
            : (obj.__baseFontSize || obj.fontSize || 32);

        if (!obj.__baseFontSize) obj.__baseFontSize = baseFontSize;
        obj.set({ fontSize: obj.__baseFontSize * sizeScaleFactor });
      } else if (obj.type === 'image') {
        if (!obj.__baseScaleX) obj.__baseScaleX = obj.scaleX || 1.0;
        if (!obj.__baseScaleY) obj.__baseScaleY = obj.scaleY || 1.0;
        obj.set({
          scaleX: obj.__baseScaleX * sizeScaleFactor,
          scaleY: obj.__baseScaleY * sizeScaleFactor
        });
      }
    }

    // Apply exact positioning coords
    const anchorCoords = getAnchorCoords(objPanel, anchor, panelW, panelH);
    const targetCx = panelOffsetX + anchorCoords.x + ox * 40;
    const targetCy = panelOffsetY + anchorCoords.y + oy * 40;

    setCenterPosition(obj, targetCx, targetCy);
  });
}

export function setCenterPosition(obj: fabric.FabricObject, cx: number, cy: number) {
  const center = obj.getCenterPoint();
  const dx = cx - center.x;
  const dy = cy - center.y;
  obj.set({
    left: (obj.left ?? 0) + dx,
    top: (obj.top ?? 0) + dy
  });
  obj.setCoords();
}

export function clampObjectToLimits(obj: fabric.FabricObject, width: number, height: number, safeZones: SafeZoneRects) {
  const bleed = safeZones.bleed || { x: -10, y: -10, w: width + 20, h: height + 20 };
  const minX = bleed.x;
  const maxX = bleed.x + bleed.w;
  const minY = bleed.y;
  const maxY = bleed.y + bleed.h;

  const rect = obj.getBoundingRect();
  let nextLeft = obj.left ?? 0;
  let nextTop = obj.top ?? 0;

  if (rect.left < minX) {
    nextLeft += (minX - rect.left);
  } else if (rect.left + rect.width > maxX) {
    nextLeft -= (rect.left + rect.width - maxX);
  }

  if (rect.top < minY) {
    nextTop += (minY - rect.top);
  } else if (rect.top + rect.height > maxY) {
    nextTop -= (rect.top + rect.height - maxY);
  }

  obj.set({ left: nextLeft, top: nextTop });
  obj.setCoords();
}

export function clampObjectToSafeZone(obj: fabric.FabricObject, width: number, height: number, safeZones: SafeZoneRects) {
  const safe = safeZones.safe || { x: 20, y: 20, w: width - 40, h: height - 40 };
  const minX = safe.x;
  const maxX = safe.x + safe.w;
  const minY = safe.y;
  const maxY = safe.y + safe.h;

  const rect = obj.getBoundingRect();
  let nextLeft = obj.left ?? 0;
  let nextTop = obj.top ?? 0;

  if (rect.left < minX) {
    nextLeft += (minX - rect.left);
  } else if (rect.left + rect.width > maxX) {
    nextLeft -= (rect.left + rect.width - maxX);
  }

  if (rect.top < minY) {
    nextTop += (minY - rect.top);
  } else if (rect.top + rect.height > maxY) {
    nextTop -= (rect.top + rect.height - maxY);
  }

  obj.set({ left: nextLeft, top: nextTop });
  obj.setCoords();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(({
  toolMode,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  onLayersChange,
  onSelectionChange,
  onSelectionMeasure,
  canvasBg,
  width = 1120,
  height = 1360,
  label = '',
  currentView = 'front',
  initialUndoStack,
  initialRedoStack,
  onHistoryChange,
  unit = 'inches',
  showSafeZones = false,
  showRulersAndGrid = true,
  safeZones,
  activeTemplate,
  activeSize,
  offsets,
  project,
}, ref) => {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const toolModeRef = useRef<ToolMode>(toolMode);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // ── Template Loading & Caching ─────────────────────────────────────────────
  const [panelTemplates, setPanelTemplates] = useState<Record<string, { pathData: string; viewBoxW: number; viewBoxH: number; svgContent: string }>>({});
  const [loadingPanelTemplates, setLoadingPanelTemplates] = useState(true);

  const defaultTemplateVal: GarmentTemplate = {
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

  const actualTemplate = activeTemplate || defaultTemplateVal;
  const actualSize = activeSize || 'M';
  const dims = getGarmentDimensions(actualTemplate, actualSize);

  const defaultOffsets = {
    sleeves: { x: 60, y: 100 },
    sleeves_right: { x: 1380, y: 100 },
    front: { x: 60, y: 920 },
    back: { x: 1220, y: 920 },
    collar: { x: 920, y: 760 },
    totalW: 2400,
    totalH: 2400
  };
  const actualOffsets = offsets || defaultOffsets;

  useEffect(() => {
    let active = true;
    const templateId = actualTemplate.id;

    if (svgCache[templateId]) {
      setPanelTemplates(svgCache[templateId]);
      setLoadingPanelTemplates(false);
      return;
    }

    setLoadingPanelTemplates(true);

    const loadAll = async () => {
      const data: Record<string, { pathData: string; viewBoxW: number; viewBoxH: number; svgContent: string }> = {};
      const files = actualTemplate.files;

      for (const [key, url] of Object.entries(files)) {
        try {
          const res = await fetch(url);
          const text = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');
          const svgEl = doc.querySelector('svg');
          const paths = doc.querySelectorAll('path');
          
          // Select the solid filled garment path (usually paths[1] or path with cls-1)
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
          const viewBoxStr = svgEl?.getAttribute('viewBox') || '';
          const parts = viewBoxStr.split(/[ ,]+/).map(Number);
          const viewBoxW = parts[2] || 1000;
          const viewBoxH = parts[3] || 1000;

          data[key] = {
            pathData,
            viewBoxW,
            viewBoxH,
            svgContent: text
          };
        } catch (e) {
          console.error(`Failed to load SVG for panel ${key} from ${url}:`, e);
        }
      }

      if (active) {
        svgCache[templateId] = data;
        setPanelTemplates(data);
        setLoadingPanelTemplates(false);
      }
    };

    loadAll();
    return () => {
      active = false;
    };
  }, [actualTemplate.id]);

  const undoStackRef = useRef<string[]>(initialUndoStack ?? []);
  const redoStackRef = useRef<string[]>(initialRedoStack ?? []);
  const isProcessingHistoryRef = useRef(false);
  const activeGuideLinesRef = useRef<{ x?: number; y?: number; label?: string }[]>([]);

  // Sync callbacks and values to refs to prevent stale closures in Fabric events
  const onLayersChangeRef = useRef(onLayersChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSelectionMeasureRef = useRef(onSelectionMeasure);
  const onZoomChangeRef = useRef(onZoomChange);
  const onPanChangeRef = useRef(onPanChange);
  const onHistoryChangeRef = useRef(onHistoryChange);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const currentViewRef = useRef(currentView);
  const unitRef = useRef(unit);
  const showSafeZonesRef = useRef(showSafeZones);
  const showRulersAndGridRef = useRef(showRulersAndGrid);
  const safeZonesRef = useRef(safeZones);
  const offsetsRef = useRef(actualOffsets);
  const dimsRef = useRef(dims);
  const panelTemplatesRef = useRef(panelTemplates);
  const templateRef = useRef(actualTemplate);
  const projectRef = useRef(project);

  useEffect(() => {
    onLayersChangeRef.current = onLayersChange;
    onSelectionChangeRef.current = onSelectionChange;
    onSelectionMeasureRef.current = onSelectionMeasure;
    onZoomChangeRef.current = onZoomChange;
    onPanChangeRef.current = onPanChange;
    onHistoryChangeRef.current = onHistoryChange;
    zoomRef.current = zoom;
    panRef.current = pan;
    currentViewRef.current = currentView;
    unitRef.current = unit;
    showSafeZonesRef.current = showSafeZones;
    showRulersAndGridRef.current = showRulersAndGrid;
    safeZonesRef.current = safeZones;
    offsetsRef.current = actualOffsets;
    dimsRef.current = dims;
    panelTemplatesRef.current = panelTemplates;
    templateRef.current = actualTemplate;
    projectRef.current = project;
  });

  // Sync internal stack refs when props change (e.g. on view switch)
  useEffect(() => {
    undoStackRef.current = initialUndoStack ?? [];
    redoStackRef.current = initialRedoStack ?? [];
  }, [initialUndoStack, initialRedoStack]);

  // Keep toolModeRef in sync without re-initializing
  useEffect(() => {
    toolModeRef.current = toolMode;
  }, [toolMode]);

  // ── Notify layers ──────────────────────────────────────────────────────────
  const notifyLayers = useCallback(() => {
    if (!fabricRef.current) return;
    onLayersChangeRef.current(buildLayers(fabricRef.current));
  }, []);

  // ── Configure design object properties (Controls & Clipping Mask) ──────────
  const configureDesignObject = useCallback((obj: fabric.FabricObject) => {
    if ((obj as any).__isArtboard) return;

    let panel = (obj as any).__panel;
    if (currentView === 'full' && !panel) {
      const center = obj.getCenterPoint();
      const cx = center.x;
      const cy = center.y;

      const panels = [
        { name: 'front', x: actualOffsets.front.x, y: actualOffsets.front.y, w: 1120, h: 1360 },
        { name: 'back', x: actualOffsets.back.x, y: actualOffsets.back.y, w: 1120, h: 1360 },
        { name: 'sleeves', x: actualOffsets.sleeves.x, y: actualOffsets.sleeves.y, w: 960, h: 640 },
        { name: 'sleeves_right', x: actualOffsets.sleeves_right.x, y: actualOffsets.sleeves_right.y, w: 960, h: 640 },
        { name: 'collar', x: actualOffsets.collar.x, y: actualOffsets.collar.y, w: 560, h: 320 }
      ].filter(p => actualTemplate.files[p.name === 'sleeves_right' ? 'right-sleeve' : p.name === 'sleeves' ? 'left-sleeve' : p.name]);

      let closest = 'front';
      let minDist = Infinity;
      panels.forEach(p => {
        const pcx = p.x + p.w / 2;
        const pcy = p.y + p.h / 2;
        const dist = Math.hypot(cx - pcx, cy - pcy);
        if (dist < minDist) {
          minDist = dist;
          closest = p.name;
        }
      });
      panel = closest;
      (obj as any).__panel = panel;
    } else if (!panel) {
      panel = currentView;
    }

    const templateFileKey = panel === 'sleeves_right' ? 'right-sleeve' : panel === 'sleeves' ? 'left-sleeve' : panel;
    const tData = panelTemplates[templateFileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];

    const artboardW = panel === 'front' || panel === 'back' ? 1120 : panel === 'sleeves' || panel === 'sleeves_right' ? 960 : 560;
    const artboardH = panel === 'front' || panel === 'back' ? 1360 : panel === 'sleeves' || panel === 'sleeves_right' ? 640 : 320;

    let offset = { x: 0, y: 0 };
    if (currentView === 'full') {
      offset = actualOffsets[panel] ?? actualOffsets.front;
    }

    const flipH = panel === 'sleeves_right';

    if (tData && tData.pathData) {
      const placement = getGarmentPlacement(panel, tData.viewBoxW, tData.viewBoxH, dims, artboardW, artboardH, offset, flipH);

      obj.set({
        borderColor: '#0070f3',
        cornerColor: '#ffffff',
        cornerStrokeColor: '#0070f3',
        cornerSize: 8,
        cornerStyle: 'circle',
        transparentCorners: false,
        borderScaleFactor: 1.5,
        padding: 6,
        clipPath: new fabric.Path(tData.pathData, {
          left: placement.left,
          top: placement.top,
          scaleX: placement.scale * (flipH ? -1 : 1),
          scaleY: placement.scale,
          originX: 'left',
          originY: 'top',
          absolutePositioned: true
        })
      });
    } else {
      obj.set({
        borderColor: '#0070f3',
        cornerColor: '#ffffff',
        cornerStrokeColor: '#0070f3',
        cornerSize: 8,
        cornerStyle: 'circle',
        transparentCorners: false,
        borderScaleFactor: 1.5,
        padding: 6,
        clipPath: new fabric.Rect({
          left: offset.x,
          top: offset.y,
          width: artboardW,
          height: artboardH,
          originX: 'left',
          originY: 'top',
          rx: 6,
          ry: 6,
          absolutePositioned: true
        })
      });
    }
  }, [width, height, currentView, panelTemplates, dims, actualOffsets, actualTemplate]);

  const configureDesignObjectRef = useRef(configureDesignObject);
  useEffect(() => {
    configureDesignObjectRef.current = configureDesignObject;
  });

  const addTemplateOutlines = useCallback((canvas: fabric.Canvas) => {
    const existing = canvas.getObjects().filter(o => (o as any).__isArtboard);
    existing.forEach(o => canvas.remove(o));

    const fillBg = canvasBg === 'white' ? '#ffffff' : canvasBg === 'dark' ? '#0a0a0e' : 'rgba(0,0,0,0)';
    const shadow = new fabric.Shadow({
      color: 'rgba(0,0,0,0.22)',
      blur: 24,
      offsetX: 0,
      offsetY: 8,
    });

    const artboardObjects: fabric.FabricObject[] = [];

    if (currentView === 'full') {
      // 1. Draw one large artboard for the entire sublimation layout
      const artboardRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: width,
        height: height,
        originX: 'left',
        originY: 'top',
        fill: fillBg,
        stroke: canvasBg === 'dark' ? '#2d2d3d' : '#e1e1e6',
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        shadow
      });
      (artboardRect as any).__isArtboard = true;
      (artboardRect as any).__id = `artboard-rect-full`;
      (artboardRect as any).__panel = 'full';
      artboardObjects.push(artboardRect);

      // 2. Draw each panel template shape
      const drawFullPanel = (panelKey: string, offset: { x: number; y: number }, artboardW: number, artboardH: number, flipH = false) => {
        const templateFileKey = panelKey === 'sleeves_right' ? 'right-sleeve' : panelKey === 'sleeves' ? 'left-sleeve' : panelKey;
        const tData = panelTemplates[templateFileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];

        if (!tData || !tData.pathData) return;

        const placement = getGarmentPlacement(panelKey, tData.viewBoxW, tData.viewBoxH, dims, artboardW, artboardH, offset, flipH);

        const p = new fabric.Path(tData.pathData, {
          left: placement.left,
          top: placement.top,
          scaleX: placement.scale * (flipH ? -1 : 1),
          scaleY: placement.scale,
          fill: '#ffffff', // white fill for production pattern look
          stroke: '#b0b0b0', // subtle gray border
          strokeWidth: 1,
          selectable: false,
          evented: false,
          hoverCursor: 'default',
          originX: 'left',
          originY: 'top'
        });
        (p as any).__isArtboard = true;
        (p as any).__id = `artboard-path-${panelKey}`;
        (p as any).__panel = panelKey;
        artboardObjects.push(p);
      };

      drawFullPanel('front', actualOffsets.front, 1120, 1360);
      drawFullPanel('back', actualOffsets.back, 1120, 1360);
      if (actualTemplate.files['left-sleeve'] || actualTemplate.files['sleeves']) {
        drawFullPanel('sleeves', actualOffsets.sleeves, 960, 640);
        drawFullPanel('sleeves_right', actualOffsets.sleeves_right, 960, 640, true);
      }
      if (actualTemplate.files['collar']) {
        drawFullPanel('collar', actualOffsets.collar, 560, 320);
      }
    } else {
      const artboardW = currentView === 'front' || currentView === 'back' ? 1120 : currentView === 'sleeves' ? 960 : 560;
      const artboardH = currentView === 'front' || currentView === 'back' ? 1360 : currentView === 'sleeves' ? 640 : 320;

      // 1. Draw the rectangular artboard (workspace)
      const artboardRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: artboardW,
        height: artboardH,
        originX: 'left',
        originY: 'top',
        fill: fillBg,
        stroke: canvasBg === 'dark' ? '#2d2d3d' : '#e1e1e6',
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        shadow
      });
      (artboardRect as any).__isArtboard = true;
      (artboardRect as any).__id = `artboard-rect-${currentView}`;
      (artboardRect as any).__panel = currentView;
      artboardObjects.push(artboardRect);

      // 2. Draw the garment outline shape
      const templateFileKey = currentView === 'sleeves' ? 'left-sleeve' : currentView;
      const tData = panelTemplates[templateFileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];

      if (tData && tData.pathData) {
        const offset = { x: 0, y: 0 };
        const placement = getGarmentPlacement(currentView, tData.viewBoxW, tData.viewBoxH, dims, artboardW, artboardH, offset, false);

        const p = new fabric.Path(tData.pathData, {
          left: placement.left,
          top: placement.top,
          scaleX: placement.scale,
          scaleY: placement.scale,
          fill: '#ffffff', // white fill for production pattern look
          stroke: '#b0b0b0', // subtle gray border
          strokeWidth: 1,
          selectable: false,
          evented: false,
          hoverCursor: 'default',
          originX: 'left',
          originY: 'top'
        });
        (p as any).__isArtboard = true;
        (p as any).__id = `artboard-path-${currentView}`;
        (p as any).__panel = currentView;
        artboardObjects.push(p);
      }
    }

    // Add objects to canvas
    artboardObjects.forEach(obj => canvas.add(obj));

    // Send artboard layers to the back in reverse order (so rectangular artboard is at the very bottom)
    for (let i = artboardObjects.length - 1; i >= 0; i--) {
      canvas.sendObjectToBack(artboardObjects[i]);
    }
  }, [canvasBg, currentView, panelTemplates, actualTemplate, actualSize, actualOffsets, dims, width, height]);

  // ── Redraw template outlines on dynamic change ───────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || loadingPanelTemplates) return;

    addTemplateOutlines(canvas);
    applyBg(canvas, canvasBg);

    // Update clipping path of all existing design elements when dimensions change!
    canvas.getObjects().forEach(obj => {
      if (!(obj as any).__isArtboard) {
        configureDesignObject(obj);
      }
    });

    canvas.requestRenderAll();
  }, [canvasBg, currentView, panelTemplates, loadingPanelTemplates, actualTemplate, actualSize, actualOffsets, configureDesignObject, addTemplateOutlines]);

  // ── Draw Grid ──────────────────────────────────────────────────────────────
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (!vpt) return;

    const currentZoom = canvas.getZoom();
    const panX = vpt[4];
    const panY = vpt[5];
    const currentUnit = unitRef.current;

    const w = canvas.width;
    const h = canvas.height;

    // Major tick interval in scene pixels for current unit/zoom
    const majorSpacingPx = majorTickIntervalPx(currentZoom, currentUnit);
    const divs = minorDivisions(currentUnit);
    const minorSpacingPx = majorSpacingPx / divs;

    // Visible bounds in scene coordinates
    const minX = (22 - panX) / currentZoom;
    const maxX = (w - panX) / currentZoom;
    const minY = (22 - panY) / currentZoom;
    const maxY = (h - panY) / currentZoom;

    ctx.save();
    ctx.lineWidth = 1;

    const minorColor = 'rgba(255,255,255,0.03)';
    const majorColor = 'rgba(255,255,255,0.08)';

    // Vertical lines
    const startX = Math.floor(minX / minorSpacingPx) * minorSpacingPx;
    for (let x = startX; x <= maxX; x += minorSpacingPx) {
      const vx = x * currentZoom + panX;
      if (vx < 22) continue;
      const isMajor = Math.abs(x % majorSpacingPx) < 0.5;
      if (!isMajor && currentZoom < 0.4) continue;
      ctx.beginPath();
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.moveTo(vx, 22);
      ctx.lineTo(vx, h);
      ctx.stroke();
    }

    // Horizontal lines
    const startY = Math.floor(minY / minorSpacingPx) * minorSpacingPx;
    for (let y = startY; y <= maxY; y += minorSpacingPx) {
      const vy = y * currentZoom + panY;
      if (vy < 22) continue;
      const isMajor = Math.abs(y % majorSpacingPx) < 0.5;
      if (!isMajor && currentZoom < 0.4) continue;
      ctx.beginPath();
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.moveTo(22, vy);
      ctx.lineTo(w, vy);
      ctx.stroke();
    }

    // ── Safe Zones overlay ──────────────────────────────────────────────────
    if (showSafeZonesRef.current && safeZonesRef.current) {
      const sz = safeZonesRef.current;
      const drawZoneRect = (
        rect: { x: number; y: number; w: number; h: number },
        color: string,
        dash: number[]
      ) => {
        const sx = rect.x * currentZoom + panX;
        const sy = rect.y * currentZoom + panY;
        const sw = rect.w * currentZoom;
        const sh = rect.h * currentZoom;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(dash);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      };

      if (sz.bleed) drawZoneRect(sz.bleed, 'rgba(255,60,60,0.6)',  [4, 4]);
      if (sz.safe)  drawZoneRect(sz.safe,  'rgba(255,200,0,0.5)',  [6, 3]);
      if (sz.seam)  drawZoneRect(sz.seam,  'rgba(0,200,150,0.45)', [3, 3]);
    }

    ctx.restore();
  }, []);

  // ── Draw Rulers ────────────────────────────────────────────────────────────
  const drawRulers = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (!vpt) return;

    const currentZoom = canvas.getZoom();
    const panX = vpt[4];
    const panY = vpt[5];
    const currentUnit = unitRef.current;

    const w = canvas.width;
    const h = canvas.height;

    ctx.save();

    // Ruler backgrounds
    ctx.fillStyle = '#0f0f14';
    ctx.fillRect(0, 0, w, 22);
    ctx.fillRect(0, 0, 22, h);

    // Border lines
    ctx.strokeStyle = '#1c1c28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 22); ctx.lineTo(w, 22);
    ctx.moveTo(22, 0); ctx.lineTo(22, h);
    ctx.stroke();

    // Corner block
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, 22, 22);
    ctx.strokeRect(0, 0, 22, 22);

    // Text / tick style
    ctx.fillStyle = '#7a7a90';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'middle';

    // Compute major tick interval in scene pixels
    const majorPx = majorTickIntervalPx(currentZoom, currentUnit);
    const divs = minorDivisions(currentUnit);
    const minorPx = majorPx / divs;

    const minX = (22 - panX) / currentZoom;
    const maxX = (w - panX) / currentZoom;
    const minY = (22 - panY) / currentZoom;
    const maxY = (h - panY) / currentZoom;

    // ── Horizontal ruler ─────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    const startX = Math.floor(minX / minorPx) * minorPx;
    for (let x = startX; x <= maxX; x += minorPx) {
      const vx = x * currentZoom + panX;
      if (vx < 22) continue;
      // isMajor: within 0.5 scene-px of a major tick
      const mod = Math.abs(x % majorPx);
      const isMajor = mod < 0.5 || Math.abs(mod - majorPx) < 0.5;
      ctx.beginPath();
      if (isMajor) {
        ctx.strokeStyle = '#5a5a70';
        ctx.moveTo(vx, 12); ctx.lineTo(vx, 22);
        ctx.stroke();
        // Label: convert scene px → display unit
        const displayVal = fromPx(x, currentUnit);
        const label = currentUnit === 'px'
          ? Math.round(displayVal).toString()
          : Number.isInteger(displayVal) ? displayVal.toString() : displayVal.toFixed(1);
        ctx.fillStyle = '#7a7a90';
        ctx.fillText(label, vx, 7);
      } else {
        ctx.strokeStyle = '#2d2d3d';
        ctx.moveTo(vx, 17); ctx.lineTo(vx, 22);
        ctx.stroke();
      }
    }

    // ── Vertical ruler ────────────────────────────────────────────────────────
    ctx.textAlign = 'right';
    const startY = Math.floor(minY / minorPx) * minorPx;
    for (let y = startY; y <= maxY; y += minorPx) {
      const vy = y * currentZoom + panY;
      if (vy < 22) continue;
      const mod = Math.abs(y % majorPx);
      const isMajor = mod < 0.5 || Math.abs(mod - majorPx) < 0.5;
      ctx.beginPath();
      if (isMajor) {
        ctx.strokeStyle = '#5a5a70';
        ctx.moveTo(12, vy); ctx.lineTo(22, vy);
        ctx.stroke();
        const displayVal = fromPx(y, currentUnit);
        const label = currentUnit === 'px'
          ? Math.round(displayVal).toString()
          : Number.isInteger(displayVal) ? displayVal.toString() : displayVal.toFixed(1);
        ctx.fillStyle = '#7a7a90';
        ctx.fillText(label, 19, vy);
      } else {
        ctx.strokeStyle = '#2d2d3d';
        ctx.moveTo(17, vy); ctx.lineTo(22, vy);
        ctx.stroke();
      }
    }

    // Unit label in corner block
    ctx.fillStyle = '#5a5a70';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    const unitAbbr = currentUnit === 'inches' ? 'in' : currentUnit === 'cm' ? 'cm' : currentUnit === 'mm' ? 'mm' : 'px';
    ctx.fillText(unitAbbr, 11, 11);

    ctx.restore();
  }, []);

  const drawGridRef = useRef(drawGrid);
  const drawRulersRef = useRef(drawRulers);
  useEffect(() => {
    drawGridRef.current = drawGrid;
    drawRulersRef.current = drawRulers;
  });

  // ── History actions ────────────────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || isProcessingHistoryRef.current) return;

    // Serialize keeping custom parameters
    const state = JSON.stringify(canvas.toJSON());
    const lastState = undoStackRef.current[undoStackRef.current.length - 1];
    if (lastState === state) return;

    undoStackRef.current = [...undoStackRef.current, state];
    redoStackRef.current = [];

    if (onHistoryChangeRef.current) {
      onHistoryChangeRef.current(undoStackRef.current, redoStackRef.current);
    }
  }, []);

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStackRef.current.length <= 1) return;

    isProcessingHistoryRef.current = true;
    const currentState = undoStackRef.current.pop();
    if (currentState) {
      redoStackRef.current.push(currentState);
    }
    const previousState = undoStackRef.current[undoStackRef.current.length - 1];
    if (previousState) {
      try {
        canvas.discardActiveObject();
        await canvas.loadFromJSON(JSON.parse(previousState));
        addTemplateOutlines(canvas);
        canvas.getObjects().forEach(obj => {
          if (!(obj as any).__isArtboard) {
            configureDesignObjectRef.current(obj);
          }
        });
        applyBg(canvas, canvasBg);
        // Keep viewport transform intact
        canvas.setViewportTransform([zoomRef.current, 0, 0, zoomRef.current, panRef.current.x, panRef.current.y]);
        canvas.requestRenderAll();
        notifyLayers();
        if (onHistoryChangeRef.current) {
          onHistoryChangeRef.current([...undoStackRef.current], [...redoStackRef.current]);
        }
      } catch (err) {
        console.error('Failed to undo:', err);
      }
    }
    isProcessingHistoryRef.current = false;
  }, [notifyLayers]);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;

    isProcessingHistoryRef.current = true;
    const nextState = redoStackRef.current.pop();
    if (nextState) {
      undoStackRef.current.push(nextState);
      try {
        canvas.discardActiveObject();
        await canvas.loadFromJSON(JSON.parse(nextState));
        addTemplateOutlines(canvas);
        canvas.getObjects().forEach(obj => {
          if (!(obj as any).__isArtboard) {
            configureDesignObjectRef.current(obj);
          }
        });
        applyBg(canvas, canvasBg);
        // Keep viewport transform intact
        canvas.setViewportTransform([zoomRef.current, 0, 0, zoomRef.current, panRef.current.x, panRef.current.y]);
        canvas.requestRenderAll();
        notifyLayers();
        if (onHistoryChangeRef.current) {
          onHistoryChangeRef.current([...undoStackRef.current], [...redoStackRef.current]);
        }
      } catch (err) {
        console.error('Failed to redo:', err);
      }
    }
    isProcessingHistoryRef.current = false;
  }, [notifyLayers]);

  // Create references for callbacks used inside the Fabric initialization useEffect
  const saveHistoryRef = useRef(saveHistory);
  useEffect(() => {
    saveHistoryRef.current = saveHistory;
  });

  // Watch initialUndoStack changes (e.g. if views switch but canvas doesn't re-initialize)
  const lastLoadedStateRef = useRef<string | null>(null);
  useEffect(() => {
    // Skip if already processing history (change came from within this canvas)
    if (isProcessingHistoryRef.current) return;
    if (!initialUndoStack || initialUndoStack.length === 0) return;

    const lastState = initialUndoStack[initialUndoStack.length - 1];

    // Compare by content, not by array reference, to prevent infinite reload loops
    if (lastState === lastLoadedStateRef.current) return;
    lastLoadedStateRef.current = lastState;

    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.discardActiveObject();
    isProcessingHistoryRef.current = true;
    canvas.loadFromJSON(JSON.parse(lastState)).then(() => {
      // Enforce artboard properties and ensure they are drawn
      addTemplateOutlines(canvas);
      canvas.getObjects().forEach(obj => {
        if (!(obj as any).__isArtboard) {
          configureDesignObjectRef.current(obj);
        }
      });
      if (projectRef.current) {
        alignObjectsToProductionAnchors(canvas, currentViewRef.current, width, height, projectRef.current, offsetsRef.current);
      }
      applyBg(canvas, canvasBg);
      canvas.setViewportTransform([zoomRef.current, 0, 0, zoomRef.current, panRef.current.x, panRef.current.y]);
      canvas.requestRenderAll();
      notifyLayers();
      isProcessingHistoryRef.current = false;
    }).catch((err) => {
      console.error('Failed to load stack state:', err);
      isProcessingHistoryRef.current = false;
    });
  }, [initialUndoStack, notifyLayers, canvasBg]);

  // ── Sync Zoom/Pan Props → Fabric Viewport ────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    if (vpt) {
      const currentZoom = canvas.getZoom();
      const diffZoom = Math.abs(currentZoom - zoom);
      const diffPanX = Math.abs(vpt[4] - pan.x);
      const diffPanY = Math.abs(vpt[5] - pan.y);
      if (diffZoom > 0.001 || diffPanX > 0.1 || diffPanY > 0.1) {
        canvas.setViewportTransform([zoom, 0, 0, zoom, pan.x, pan.y]);
        canvas.requestRenderAll();
      }
    }
  }, [zoom, pan]);

  // ── Initialize Fabric.js ───────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current) return;

    const parent = canvasElRef.current.parentElement;
    const w = parent?.clientWidth ?? 800;
    const h = parent?.clientHeight ?? 600;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: w,
      height: h,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: 'transparent',
      stopContextMenu: true,
      fireRightClick: false,
    });

    fabricRef.current = canvas;

    // Check if we have an initial state to restore
    const hasInitialState = initialUndoStack && initialUndoStack.length > 0;

    if (hasInitialState) {
      isProcessingHistoryRef.current = true;
      const lastState = initialUndoStack[initialUndoStack.length - 1];
      canvas.loadFromJSON(JSON.parse(lastState)).then(() => {
        // Enforce artboard properties and ensure they are drawn
        addTemplateOutlines(canvas);
        canvas.getObjects().forEach(obj => {
          if (!(obj as any).__isArtboard) {
            configureDesignObjectRef.current(obj);
          }
        });
        if (projectRef.current) {
          alignObjectsToProductionAnchors(canvas, currentViewRef.current, width, height, projectRef.current, offsetsRef.current);
        }
        applyBg(canvas, canvasBg);
        canvas.setViewportTransform([zoomRef.current, 0, 0, zoomRef.current, panRef.current.x, panRef.current.y]);
        canvas.requestRenderAll();
        notifyLayers();
        isProcessingHistoryRef.current = false;
      }).catch((err) => {
        console.error('Failed to load initial state:', err);
        isProcessingHistoryRef.current = false;
      });
    } else {
      // Add visual artboard outline path templates at z-index 0
      addTemplateOutlines(canvas);
      applyBg(canvas, canvasBg);
      canvas.setViewportTransform([zoom, 0, 0, zoom, pan.x, pan.y]);

      // Save initial state to history stack
      const initialState = JSON.stringify(canvas.toJSON());
      undoStackRef.current = [initialState];
      redoStackRef.current = [];
      if (onHistoryChangeRef.current) {
        onHistoryChangeRef.current(undoStackRef.current, redoStackRef.current);
      }
    }

    // Dynamic resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        canvas.setDimensions({ width: rw, height: rh });
        canvas.requestRenderAll();
      }
    });
    if (parent) resizeObserver.observe(parent);

    // Helper: update object panel and clip dynamically based on center coordinate
    const updateObjectPanelAndClip = (obj: fabric.FabricObject) => {
      if (currentViewRef.current !== 'full') return;

      const center = obj.getCenterPoint();
      const cx = center.x;
      const cy = center.y;
      const offs = offsetsRef.current;
      const dm = dimsRef.current;
      const templ = templateRef.current;

      const panels = [
        { name: 'front', x: offs.front.x, y: offs.front.y, w: 1120, h: 1360 },
        { name: 'back', x: offs.back.x, y: offs.back.y, w: 1120, h: 1360 },
        { name: 'sleeves', x: offs.sleeves.x, y: offs.sleeves.y, w: 960, h: 640 },
        { name: 'sleeves_right', x: offs.sleeves_right.x, y: offs.sleeves_right.y, w: 960, h: 640 },
        { name: 'collar', x: offs.collar.x, y: offs.collar.y, w: 560, h: 320 }
      ].filter(p => templ.files[p.name === 'sleeves_right' ? 'right-sleeve' : p.name === 'sleeves' ? 'left-sleeve' : p.name]);

      let closest = 'front';
      let minDist = Infinity;
      panels.forEach(p => {
        const pcx = p.x + p.w / 2;
        const pcy = p.y + p.h / 2;
        const dist = Math.hypot(cx - pcx, cy - pcy);
        if (dist < minDist) {
          minDist = dist;
          closest = p.name;
        }
      });
      const panel = closest;

      const oldPanel = (obj as any).__panel;
      if (oldPanel !== panel) {
        (obj as any).__panel = panel;

        // 1. If leaving sleeves, delete peer
        if ((oldPanel === 'sleeves' || oldPanel === 'sleeves_right') && (panel !== 'sleeves' && panel !== 'sleeves_right')) {
          const peerPanel = oldPanel === 'sleeves' ? 'sleeves_right' : 'sleeves';
          const peer = canvas.getObjects().find(o => (o as any).__id === (obj as any).__id && (o as any).__panel === peerPanel);
          if (peer) {
            canvas.remove(peer);
          }
        }

        // 2. If entering sleeves, create peer
        if ((oldPanel !== 'sleeves' && oldPanel !== 'sleeves_right') && (panel === 'sleeves' || panel === 'sleeves_right')) {
          const targetPanel = panel === 'sleeves' ? 'sleeves_right' : 'sleeves';
          const offsetDiffX = panel === 'sleeves' ? (offs.sleeves_right.x - offs.sleeves.x) : (offs.sleeves.x - offs.sleeves_right.x);
          const id = (obj as any).__id;
          if (id) {
            const peerExists = canvas.getObjects().some(o => (o as any).__id === id && (o as any).__panel === targetPanel);
            if (!peerExists) {
              obj.clone().then((cloned: fabric.FabricObject) => {
                (cloned as any).__id = id;
                (cloned as any).__panel = targetPanel;
                (cloned as any).__layerName = (obj as any).__layerName;
                cloned.set({
                  left: (obj.left ?? 0) + offsetDiffX,
                  top: obj.top,
                });
                const tKey = targetPanel === 'sleeves' ? 'left-sleeve' : 'right-sleeve';
                const tData = panelTemplatesRef.current[tKey] || panelTemplatesRef.current['left-sleeve'];
                const flipH = targetPanel === 'sleeves_right';
                
                if (tData && tData.pathData) {
                  const placement = getGarmentPlacement(targetPanel, tData.viewBoxW, tData.viewBoxH, dm, 960, 640, offs[targetPanel], flipH);
                  cloned.set({
                    clipPath: new fabric.Path(tData.pathData, {
                      left: placement.left,
                      top: placement.top,
                      scaleX: placement.scale * (flipH ? -1 : 1),
                      scaleY: placement.scale,
                      originX: 'left',
                      originY: 'top',
                      absolutePositioned: true
                    })
                  });
                } else {
                  cloned.set({
                    clipPath: undefined
                  });
                }
                canvas.add(cloned);
                canvas.requestRenderAll();
              });
            }
          }
        }

        // 3. Update clipping path
        const templateFileKey = panel === 'sleeves_right' ? 'right-sleeve' : panel === 'sleeves' ? 'left-sleeve' : panel;
        const tData = panelTemplatesRef.current[templateFileKey] || panelTemplatesRef.current['left-sleeve'] || panelTemplatesRef.current['front'];
        const artboardW = panel === 'front' || panel === 'back' ? 1120 : panel === 'sleeves' || panel === 'sleeves_right' ? 960 : 560;
        const artboardH = panel === 'front' || panel === 'back' ? 1360 : panel === 'sleeves' || panel === 'sleeves_right' ? 640 : 320;
        const offset = offs[panel] ?? offs.front;
        const flipH = panel === 'sleeves_right';

        if (tData && tData.pathData) {
          const placement = getGarmentPlacement(panel, tData.viewBoxW, tData.viewBoxH, dm, artboardW, artboardH, offset, flipH);
          obj.set({
            clipPath: new fabric.Path(tData.pathData, {
              left: placement.left,
              top: placement.top,
              scaleX: placement.scale * (flipH ? -1 : 1),
              scaleY: placement.scale,
              originX: 'left',
              originY: 'top',
              absolutePositioned: true
            })
          });
        } else {
          obj.set({
            clipPath: new fabric.Rect({
              left: offset.x,
              top: offset.y,
              width: artboardW,
              height: artboardH,
              originX: 'left',
              originY: 'top',
              rx: 6, ry: 6,
              absolutePositioned: true
            })
          });
        }
      }
    };


    // Helper: sync sleeve transformations in real-time
    const syncSleeveObject = (obj: fabric.FabricObject) => {
      const panel = (obj as any).__panel;
      if (panel !== 'sleeves' && panel !== 'sleeves_right') return;

      const targetPanel = panel === 'sleeves' ? 'sleeves_right' : 'sleeves';
      const offs = offsetsRef.current;
      const offsetDiffX = panel === 'sleeves' ? (offs.sleeves_right.x - offs.sleeves.x) : (offs.sleeves.x - offs.sleeves_right.x);

      const id = (obj as any).__id;
      if (!id) return;

      const peer = canvas.getObjects().find(o => (o as any).__id === id && (o as any).__panel === targetPanel);
      if (peer) {
        isProcessingHistoryRef.current = true;
        peer.set({
          left: (obj.left ?? 0) + offsetDiffX,
          top: obj.top,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle: obj.angle,
          flipX: obj.flipX,
          flipY: obj.flipY,
          skewX: obj.skewX,
          skewY: obj.skewY,
          __anchor: (obj as any).__anchor,
          __offsetXInches: (obj as any).__offsetXInches,
          __offsetYInches: (obj as any).__offsetYInches,
          __restrictToSafe: (obj as any).__restrictToSafe,
          __productionLocked: (obj as any).__productionLocked,
          __baseFontSize: (obj as any).__baseFontSize,
          __baseScaleX: (obj as any).__baseScaleX,
          __baseScaleY: (obj as any).__baseScaleY,
        });

        if (obj.type === 'textbox' && peer.type === 'textbox') {
          (peer as fabric.Textbox).set({
            text: (obj as fabric.Textbox).text,
            fontSize: (obj as fabric.Textbox).fontSize,
            fontFamily: (obj as fabric.Textbox).fontFamily,
            fontWeight: (obj as fabric.Textbox).fontWeight,
            fill: (obj as fabric.Textbox).fill,
            textAlign: (obj as fabric.Textbox).textAlign,
          });
        }

        peer.setCoords();
        canvas.requestRenderAll();
        isProcessingHistoryRef.current = false;
      }
    };

    // Helper: add peer sleeve object
    const syncSleeveObjectAdded = (obj: fabric.FabricObject) => {
      const panel = (obj as any).__panel;
      if (panel !== 'sleeves' && panel !== 'sleeves_right') return;

      const targetPanel = panel === 'sleeves' ? 'sleeves_right' : 'sleeves';
      const offs = offsetsRef.current;
      const offsetDiffX = panel === 'sleeves' ? (offs.sleeves_right.x - offs.sleeves.x) : (offs.sleeves.x - offs.sleeves_right.x);

      const id = (obj as any).__id;
      if (!id) return;

      const peerExists = canvas.getObjects().some(o => (o as any).__id === id && (o as any).__panel === targetPanel);
      if (peerExists) return;

      isProcessingHistoryRef.current = true;
      obj.clone().then((cloned: fabric.FabricObject) => {
        (cloned as any).__id = id;
        (cloned as any).__panel = targetPanel;
        (cloned as any).__layerName = (obj as any).__layerName;
        cloned.set({
          left: (obj.left ?? 0) + offsetDiffX,
          top: obj.top,
        });
        configureDesignObjectRef.current(cloned);
        canvas.add(cloned);
        canvas.requestRenderAll();
        isProcessingHistoryRef.current = false;
      });
    };

    // Helper: remove peer sleeve object
    const syncSleeveObjectRemoved = (obj: fabric.FabricObject) => {
      const panel = (obj as any).__panel;
      if (panel !== 'sleeves' && panel !== 'sleeves_right') return;

      const targetPanel = panel === 'sleeves' ? 'sleeves_right' : 'sleeves';
      const id = (obj as any).__id;
      if (!id) return;

      const peer = canvas.getObjects().find(o => (o as any).__id === id && (o as any).__panel === targetPanel);
      if (peer) {
        isProcessingHistoryRef.current = true;
        canvas.remove(peer);
        canvas.requestRenderAll();
        isProcessingHistoryRef.current = false;
      }
    };

    // ── Object events ────────────────────────────────────────────────────────
    const onModified = (opt: any) => {
      if (isProcessingHistoryRef.current) return;
      const obj = opt.target;
      if (obj && !(obj as any).__isArtboard) {
        if (currentViewRef.current === 'full') {
          updateObjectPanelAndClip(obj);
          syncSleeveObject(obj);
        }
      }
      saveHistoryRef.current();
      notifyLayers();
    };
    const onAdded = (opt: any) => {
      const obj = opt.target;
      if (obj && !(obj as any).__isArtboard) {
        configureDesignObjectRef.current(obj);
      }
      if (isProcessingHistoryRef.current) return;
      if (obj && !(obj as any).__isArtboard) {
        if (currentViewRef.current === 'full') {
          syncSleeveObjectAdded(obj);
        }
      }
      saveHistoryRef.current();
      notifyLayers();
    };
    const onRemoved = (opt: any) => {
      if (isProcessingHistoryRef.current) return;
      const obj = opt.target;
      if (obj && !(obj as any).__isArtboard) {
        if (currentViewRef.current === 'full') {
          syncSleeveObjectRemoved(obj);
        }
      }
      saveHistoryRef.current();
      notifyLayers();
    };
    const getActivePanelCoords = (obj: any) => {
      const isFull = currentViewRef.current === 'full';
      const panel = isFull ? (obj.__panel || 'front') : currentViewRef.current;
      const offs = offsetsRef.current;
      
      // 1. Get panel offset on the master canvas
      let panelOffsetX = 0;
      let panelOffsetY = 0;
      if (isFull) {
        const offset = offs[panel] ?? offs.front;
        panelOffsetX = offset.x;
        panelOffsetY = offset.y;
      }
      
      // 2. Get panel size (pixels)
      let panelW = width;
      let panelH = height;
      if (isFull) {
        panelW = panel === 'front' || panel === 'back' ? 1120 : panel === 'sleeves' || panel === 'sleeves_right' ? 960 : 560;
        panelH = panel === 'front' || panel === 'back' ? 1360 : panel === 'sleeves' || panel === 'sleeves_right' ? 640 : 320;
      } else {
        panelW = width;
        panelH = height;
      }
      
      return {
        panel,
        panelOffsetX,
        panelOffsetY,
        panelW,
        panelH
      };
    };

    const onMoving = (opt: any) => {
      if (isProcessingHistoryRef.current) return;
      const obj = opt.target;
      if (!obj || (obj as any).__isArtboard) return;

      const proj = projectRef.current;
      const rules = proj?.rules;
      const { panel, panelOffsetX, panelOffsetY, panelW, panelH } = getActivePanelCoords(obj);

      // 1. Check Production Drag Lock
      if (obj.__productionLocked) {
        if (obj.__anchor) {
          const anchorCoords = getAnchorCoords(panel, obj.__anchor, panelW, panelH);
          const targetCx = panelOffsetX + anchorCoords.x + (obj.__offsetXInches ?? 0) * 40;
          const targetCy = panelOffsetY + anchorCoords.y + (obj.__offsetYInches ?? 0) * 40;
          setCenterPosition(obj, targetCx, targetCy);
          canvas.requestRenderAll();
        }
        return;
      }

      // Clear previous snaps
      activeGuideLinesRef.current = [];

      let cx = obj.getCenterPoint().x;
      let cy = obj.getCenterPoint().y;

      let snappedX = cx;
      let snappedY = cy;

      // Smart Snapping
      if (rules?.smartSnapping) {
        const snapThreshold = 12; // pixels

        // Vertical Center Snap (relative to panel)
        const centerX = panelOffsetX + panelW / 2;
        if (Math.abs(cx - centerX) < snapThreshold) {
          snappedX = centerX;
          activeGuideLinesRef.current.push({ x: centerX, label: `${panel.toUpperCase()} Center` });
        }

        // Horizontal Panel Snaps (relative to panel)
        const normalizedPanel = panel === 'sleeves_right' ? 'sleeves' : panel;
        if (normalizedPanel === 'front' || normalizedPanel === 'back') {
          const cby = panelOffsetY + (normalizedPanel === 'front' ? Math.round(panelH * 0.176) : Math.round(panelH * 0.132));
          if (Math.abs(cy - cby) < snapThreshold) {
            snappedY = cby;
            activeGuideLinesRef.current.push({ y: cby, label: 'Collar Reference' });
          }

          if (normalizedPanel === 'front') {
            const chestY = panelOffsetY + Math.round(panelH * 0.35);
            if (Math.abs(cy - chestY) < snapThreshold) {
              snappedY = chestY;
              activeGuideLinesRef.current.push({ y: chestY, label: 'Chest Alignment' });
            }
          } else if (normalizedPanel === 'back') {
            const midY = panelOffsetY + Math.round(panelH * 0.45);
            if (Math.abs(cy - midY) < snapThreshold) {
              snappedY = midY;
              activeGuideLinesRef.current.push({ y: midY, label: 'Player Number Zone' });
            }
          }
        } else if (normalizedPanel === 'sleeves') {
          const capY = panelOffsetY + 40;
          const centY = panelOffsetY + panelH / 2;
          const cuffY = panelOffsetY + panelH - 40;

          if (Math.abs(cy - capY) < snapThreshold) {
            snappedY = capY;
            activeGuideLinesRef.current.push({ y: capY, label: 'Sleeve Cap Seam' });
          } else if (Math.abs(cy - centY) < snapThreshold) {
            snappedY = centY;
            activeGuideLinesRef.current.push({ y: centY, label: 'Sleeve Center' });
          } else if (Math.abs(cy - cuffY) < snapThreshold) {
            snappedY = cuffY;
            activeGuideLinesRef.current.push({ y: cuffY, label: 'Sleeve Cuff Seam' });
          }
        }
      } else {
        // Fallback to standard grid snapping (10px) if smart snap is off
        const gridSnap = 10;
        snappedX = Math.round(cx / gridSnap) * gridSnap;
        snappedY = Math.round(cy / gridSnap) * gridSnap;
      }

      // Apply snap coordinate change to center
      setCenterPosition(obj, snappedX, snappedY);

      // 2. Safe and Bleed Boundaries Clamp
      const bInches = rules?.bleedInches ?? 0.25;
      const sInches = rules?.safeMarginInches ?? 0.5;
      const seamInches = rules?.seamAllowanceInches ?? 0.5;

      const sz = calcSafeZones(panelW, panelH, bInches, sInches, seamInches);

      // Shift object temporarily to local panel space for clamping
      const originalLeft = obj.left ?? 0;
      const originalTop = obj.top ?? 0;
      obj.set({
        left: originalLeft - panelOffsetX,
        top: originalTop - panelOffsetY
      });
      obj.setCoords();

      if (obj.__restrictToSafe && sz.safe) {
        clampObjectToSafeZone(obj, panelW, panelH, sz);
      } else {
        clampObjectToLimits(obj, panelW, panelH, sz);
      }

      // Shift back to master canvas coordinates
      obj.set({
        left: (obj.left ?? 0) + panelOffsetX,
        top: (obj.top ?? 0) + panelOffsetY
      });
      obj.setCoords();

      // 3. Dynamic Offset Recalculation
      if (obj.__anchor) {
        const finalCenter = obj.getCenterPoint();
        const relativeCx = finalCenter.x - panelOffsetX;
        const relativeCy = finalCenter.y - panelOffsetY;
        const anchorCoords = getAnchorCoords(panel, obj.__anchor, panelW, panelH);
        obj.__offsetXInches = Number(((relativeCx - anchorCoords.x) / 40).toFixed(3));
        obj.__offsetYInches = Number(((relativeCy - anchorCoords.y) / 40).toFixed(3));
      }

      if (currentViewRef.current === 'full') {
        updateObjectPanelAndClip(obj);
        syncSleeveObject(obj);
      }
    };

    const onTransform = (opt: any) => {
      if (isProcessingHistoryRef.current) return;
      const obj = opt.target;
      if (obj && !(obj as any).__isArtboard) {
        const proj = projectRef.current;
        const rules = proj?.rules;
        const bInches = rules?.bleedInches ?? 0.25;
        const sInches = rules?.safeMarginInches ?? 0.5;
        const seamInches = rules?.seamAllowanceInches ?? 0.5;

        const { panelOffsetX, panelOffsetY, panelW, panelH } = getActivePanelCoords(obj);
        const sz = calcSafeZones(panelW, panelH, bInches, sInches, seamInches);

        const originalLeft = obj.left ?? 0;
        const originalTop = obj.top ?? 0;
        obj.set({
          left: originalLeft - panelOffsetX,
          top: originalTop - panelOffsetY
        });
        obj.setCoords();

        if (obj.__restrictToSafe && sz.safe) {
          clampObjectToSafeZone(obj, panelW, panelH, sz);
        } else {
          clampObjectToLimits(obj, panelW, panelH, sz);
        }

        obj.set({
          left: (obj.left ?? 0) + panelOffsetX,
          top: (obj.top ?? 0) + panelOffsetY
        });
        obj.setCoords();

        if (currentViewRef.current === 'full') {
          syncSleeveObject(obj);
        }
      }
    };

    canvas.on('object:modified', onModified);
    canvas.on('object:added', onAdded);
    canvas.on('object:removed', onRemoved);
    canvas.on('object:moving', onMoving);
    canvas.on('object:scaling', onTransform);
    canvas.on('object:rotating', onTransform);
    canvas.on('object:skewing', onTransform);

    // ── Grid & Ruler Rendering events ────────────────────────────────────────
    canvas.on('before:render', () => {
      if (showRulersAndGridRef.current) {
        const ctx = canvas.getContext();
        drawGridRef.current(ctx);
      }
    });

    canvas.on('after:render', () => {
      // 1. Draw standard rulers
      if (showRulersAndGridRef.current) {
        const ctx = canvas.getContext();
        drawRulersRef.current(ctx);
      }

      const ctx = canvas.getContext();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const currentZoom = canvas.getZoom();
      const panX = vpt[4];
      const panY = vpt[5];
      const w = canvas.width;
      const h = canvas.height;

      // 2. Draw Snapping Guidelines (screen coordinates)
      if (showRulersAndGridRef.current && activeGuideLinesRef.current.length > 0) {
        activeGuideLinesRef.current.forEach(guide => {
          ctx.save();
          ctx.strokeStyle = '#ff007f'; // neon pink guide line
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);

          if (guide.x !== undefined) {
            const gx = guide.x * currentZoom + panX;
            if (gx >= 22) {
              ctx.beginPath();
              ctx.moveTo(gx, 22);
              ctx.lineTo(gx, h);
              ctx.stroke();

              ctx.fillStyle = '#ff007f';
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(`  ${guide.label || 'Snap'}`, gx, 35);
            }
          }

          if (guide.y !== undefined) {
            const gy = guide.y * currentZoom + panY;
            if (gy >= 22) {
              ctx.beginPath();
              ctx.moveTo(22, gy);
              ctx.lineTo(w, gy);
              ctx.stroke();

              ctx.fillStyle = '#ff007f';
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(`  ${guide.label || 'Snap'}`, 30, gy - 6);
            }
          }
          ctx.restore();
        });
      }

      // 3. Draw Laser Anchor Guidelines for Selected Object
      const activeObj = canvas.getActiveObject();
      if (activeObj && !(activeObj as any).__isArtboard && (activeObj as any).__anchor) {
        const anchorType = (activeObj as any).__anchor;
        const { panel, panelOffsetX, panelOffsetY, panelW, panelH } = getActivePanelCoords(activeObj);
        
        const anchorCoords = getAnchorCoords(panel, anchorType, panelW, panelH);
        const ax = panelOffsetX + anchorCoords.x;
        const ay = panelOffsetY + anchorCoords.y;
        
        const center = activeObj.getCenterPoint();
        const cx = center.x;
        const cy = center.y;

        // Convert to screen coordinates
        const sax = ax * currentZoom + panX;
        const say = ay * currentZoom + panY;
        const scx = cx * currentZoom + panX;
        const scy = cy * currentZoom + panY;

        ctx.save();
        
        // Draw Anchor Point Indicator (Neon target circle)
        ctx.beginPath();
        ctx.arc(sax, say, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#0070f3';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sax, say, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 112, 243, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Capsule text drawing helper
        const drawCapsuleText = (x: number, y: number, text: string, strokeStyle: string) => {
          ctx.font = 'bold 9px monospace';
          const textWidth = ctx.measureText(text).width;
          const padX = 5;
          const padY = 3;
          
          ctx.fillStyle = '#070a13';
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = 1.2;
          
          const rx = textWidth / 2 + padX;
          const ry = 6 + padY;
          
          ctx.beginPath();
          ctx.roundRect(x - rx, y - ry, rx * 2, ry * 2, 4);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#3b9eff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y);
        };

        // Standardized unit labels
        const currentUnit = unitRef.current;
        const uLabel = unitLabel(currentUnit);

        // A. Draw Vertical Laser Line (collar base reference/Y offset)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 112, 243, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.moveTo(sax, say);
        ctx.lineTo(sax, scy);
        ctx.stroke();

        // Vertical label
        const offsetYPx = cy - ay;
        const offsetYDisplay = fromPx(offsetYPx, currentUnit);
        
        // Label position: middle of vertical line
        const midY = (say + scy) / 2;
        if (Math.abs(offsetYPx) > 5) {
          drawCapsuleText(sax, midY, `Y: ${offsetYDisplay.toFixed(2)} ${uLabel}`, '#0070f3');
        }

        // B. Draw Horizontal Laser Line (X offset)
        ctx.beginPath();
        ctx.moveTo(sax, scy);
        ctx.lineTo(scx, scy);
        ctx.stroke();

        // Horizontal label
        const offsetXPx = cx - ax;
        const offsetXDisplay = fromPx(offsetXPx, currentUnit);
        
        // Label position: middle of horizontal line
        const midX = (sax + scx) / 2;
        if (Math.abs(offsetXPx) > 5) {
          drawCapsuleText(midX, scy, `X: ${offsetXDisplay.toFixed(2)} ${uLabel}`, '#0070f3');
        }

        ctx.restore();
      }
    });

    // ── Selection events ─────────────────────────────────────────────────────
    const notifyMeasure = (obj: fabric.FabricObject | null) => {
      if (!onSelectionMeasureRef.current) return;
      if (!obj || (obj as any).__isArtboard) {
        onSelectionMeasureRef.current(null);
        return;
      }
      const bounds = obj.getBoundingRect();
      onSelectionMeasureRef.current({
        widthPx:  bounds.width  / (obj.scaleX ?? 1) * (obj.scaleX ?? 1),
        heightPx: bounds.height / (obj.scaleY ?? 1) * (obj.scaleY ?? 1),
        leftPx:   obj.left   ?? 0,
        topPx:    obj.top    ?? 0,
        angleDeg: obj.angle  ?? 0,
      });
    };

    const handleSelectionEvent = (e: any) => {
      let obj = e.selected?.[0];
      if (!obj) return;
      const matchObj = (obj as any).__panel === 'sleeves_right'
        ? (canvas.getObjects().find(o => (o as any).__id === (obj as any).__id && (o as any).__panel === 'sleeves') || obj)
        : obj;
      const layers = buildLayers(canvas);
      const found = layers.find(l => l.objectRef === matchObj) ?? null;
      onSelectionChangeRef.current(found);
      notifyMeasure(obj);
    };

    canvas.on('selection:created', handleSelectionEvent);
    canvas.on('selection:updated', handleSelectionEvent);
    canvas.on('selection:cleared', () => {
      onSelectionChangeRef.current(null);
      if (onSelectionMeasureRef.current) onSelectionMeasureRef.current(null);
    });

    // Notify measurement during live transform
    canvas.on('object:moving',  (e: any) => { if (e.target) notifyMeasure(e.target); });
    canvas.on('object:scaling', (e: any) => { if (e.target) notifyMeasure(e.target); });
    canvas.on('object:rotating',(e: any) => { if (e.target) notifyMeasure(e.target); });

    // ── Mouse events for tool modes ──────────────────────────────────────────
    canvas.on('mouse:down', (opt) => {
      const mode = toolModeRef.current;
      const pointer = canvas.getScenePoint(opt.e as any);
      const nativeEvt = opt.e as MouseEvent;

      if (mode === 'hand') {
        isPanningRef.current = true;
        lastPosRef.current = { x: nativeEvt.clientX, y: nativeEvt.clientY };
        canvas.setCursor('grabbing');
        canvas.selection = false;
        return;
      }

      const isTargetArtboard = opt.target && (opt.target as any).__isArtboard;
      const canPlace = !opt.target || isTargetArtboard;

      if (mode === 'text' && canPlace) {
        const text = new fabric.Textbox('Click to edit', {
          left: pointer.x,
          top: pointer.y,
          width: 250,
          fontFamily: 'Outfit, sans-serif',
          fontSize: 48,
          fontWeight: '800',
          fill: '#ffffff',
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          splitByGrapheme: true,
        } as any);
        (text as any).__id = `text-${Date.now()}`;
        (text as any).__layerName = `Text ${textCounter++}`;
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.requestRenderAll();
      }

      if (mode === 'shape' && canPlace) {
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 120,
          height: 80,
          fill: '#0070f3',
          stroke: '#ffffff',
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          originX: 'center',
          originY: 'center',
        });
        (rect as any).__id = `shape-${Date.now()}`;
        (rect as any).__layerName = `Shape ${shapeCounter++}`;
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:move', (opt) => {
      if (isPanningRef.current && toolModeRef.current === 'hand') {
        const nativeEvt = opt.e as MouseEvent;
        const deltaX = nativeEvt.clientX - lastPosRef.current.x;
        const deltaY = nativeEvt.clientY - lastPosRef.current.y;
        lastPosRef.current = { x: nativeEvt.clientX, y: nativeEvt.clientY };
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += deltaX;
          vpt[5] += deltaY;
          canvas.requestRenderAll();
          onPanChange({ x: vpt[4], y: vpt[5] });
        }
      }
    });

    canvas.on('mouse:up', () => {
      isPanningRef.current = false;
      if (toolModeRef.current === 'hand') {
        canvas.setCursor('grab');
      }
    });

    // ── Wheel zoom ───────────────────────────────────────────────────────────
    const handleWheel = (opt: fabric.TEvent<WheelEvent>) => {
      const delta = (opt.e as WheelEvent).deltaY;
      let z = canvas.getZoom();
      z *= 0.999 ** delta;
      z = Math.max(0.2, Math.min(4.0, z));
      canvas.zoomToPoint(
        new fabric.Point((opt.e as WheelEvent).offsetX, (opt.e as WheelEvent).offsetY),
        z
      );
      const vpt = canvas.viewportTransform;
      onZoomChange(z);
      if (vpt) {
        onPanChange({ x: vpt[4], y: vpt[5] });
      }
      (opt.e as WheelEvent).preventDefault();
      (opt.e as WheelEvent).stopPropagation();
    };
    canvas.on('mouse:wheel', handleWheel as any);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, label]);

  // ── Sync tool mode → canvas behavior ─────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (toolMode === 'hand') {
      canvas.selection = false;
      canvas.getObjects().forEach(o => { o.selectable = false; });
      canvas.setCursor('grab');
    } else if (toolMode === 'select') {
      canvas.selection = true;
      canvas.getObjects().forEach(o => {
        if (!(o as any).__isArtboard) {
          o.selectable = !((o as any).__locked);
        }
      });
      canvas.setCursor('default');
    } else if (toolMode === 'move') {
      canvas.selection = true;
      canvas.getObjects().forEach(o => {
        if (!(o as any).__isArtboard) {
          o.selectable = !((o as any).__locked);
        }
      });
      canvas.setCursor('move');
    } else if (toolMode === 'text') {
      // Keep selection enabled so existing text/objects can still be scaled/rotated
      canvas.selection = true;
      canvas.getObjects().forEach(o => {
        if (!(o as any).__isArtboard) {
          o.selectable = !((o as any).__locked);
        }
      });
      canvas.setCursor('text');
    } else if (toolMode === 'shape') {
      // Keep selection enabled so existing shapes can still be scaled/rotated
      canvas.selection = true;
      canvas.getObjects().forEach(o => {
        if (!(o as any).__isArtboard) {
          o.selectable = !((o as any).__locked);
        }
      });
      canvas.setCursor('crosshair');
    }
    canvas.requestRenderAll();
  }, [toolMode]);

  // ── Sync background ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    applyBg(canvas, canvasBg);
  }, [canvasBg]);

  // ── Expose imperative API ─────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    addText(options) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const center = canvas.getVpCenter();
      const sceneCenter = canvas.getScenePoint({ clientX: center.x, clientY: center.y } as any);
      const text = new fabric.Textbox('New Text', {
        left: sceneCenter.x,
        top: sceneCenter.y,
        width: 250,
        fontFamily: 'Outfit, sans-serif',
        fontSize: 48,
        fontWeight: '800',
        fill: '#ffffff',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        splitByGrapheme: true,
        ...options,
      } as any);
      (text as any).__id = `text-${Date.now()}`;
      (text as any).__layerName = `Text ${textCounter++}`;
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
    },
    addShape(options) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const center = canvas.getVpCenter();
      const sceneCenter = canvas.getScenePoint({ clientX: center.x, clientY: center.y } as any);
      const rect = new fabric.Rect({
        left: sceneCenter.x,
        top: sceneCenter.y,
        width: 120,
        height: 80,
        fill: options?.fill ?? '#0070f3',
        stroke: options?.stroke ?? '#ffffff',
        strokeWidth: options?.strokeWidth ?? 2,
        rx: 8, ry: 8,
        originX: 'center',
        originY: 'center',
      });
      (rect as any).__id = `shape-${Date.now()}`;
      (rect as any).__layerName = `Shape ${shapeCounter++}`;
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.requestRenderAll();
    },
    addImageFromUrl(url, name) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const center = canvas.getVpCenter();
      const sceneCenter = canvas.getScenePoint({ clientX: center.x, clientY: center.y } as any);
      fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((img) => {
        img.scaleToWidth(Math.min(img.width ?? 200, 300));
        img.set({ left: sceneCenter.x, top: sceneCenter.y, originX: 'center', originY: 'center' });
        (img as any).__id = `image-${Date.now()}`;
        (img as any).__layerName = name || `Image ${imageCounter++}`;
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      });
    },
    getCanvas() {
      return fabricRef.current;
    },
    bringForward(id) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).__id === id);
      if (obj) { canvas.bringObjectForward(obj); notifyLayers(); }
    },
    sendBackward(id) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).__id === id);
      if (obj) { canvas.sendObjectBackwards(obj); notifyLayers(); }
    },
    setObjectVisible(id, visible) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).__id === id);
      if (obj) { obj.visible = visible; canvas.requestRenderAll(); notifyLayers(); }
    },
    setObjectLocked(id, locked) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).__id === id);
      if (obj) {
        (obj as any).__locked = locked;
        obj.selectable = !locked;
        obj.evented = !locked;
        canvas.requestRenderAll();
        notifyLayers();
      }
    },
    setBackground(bg) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      applyBg(canvas, bg);
    },
    selectObject(id) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).__id === id);
      if (obj) { canvas.setActiveObject(obj); canvas.requestRenderAll(); }
    },
    undo() {
      undo();
    },
    redo() {
      redo();
    },
    saveHistory() {
      saveHistory();
    },
  }), [notifyLayers, undo, redo, saveHistory]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasElRef} />
    </div>
  );
});

FabricCanvas.displayName = 'FabricCanvas';
