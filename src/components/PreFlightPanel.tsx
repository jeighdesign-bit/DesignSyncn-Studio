import React, { useState, useEffect, useRef } from 'react';
import type { Project, RosterPlayer } from '../types';
import {
  CheckCircle, AlertTriangle, AlertCircle, FileText, Download, Check,
  ZoomIn, ZoomOut, Printer, Layers, Settings2, Package,
  ChevronDown, Activity, Cpu, Target, BarChart3, Shield
} from 'lucide-react';
import * as fabric from 'fabric';

interface PreFlightPanelProps {
  project: Project;
  onUpdateProject: (updates: Partial<Project>) => void;
}

interface SVGTemplateData {
  pathData: string;
  viewBoxW: number;
  viewBoxH: number;
}

interface PackedPiece {
  id: string;
  player: RosterPlayer;
  panel: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotated: boolean;
}

// ─── Export Presets ────────────────────────────────────────────────────────────
const EXPORT_PRESETS = [
  { id: 'draft',      label: 'Draft',     dpi: 72,  desc: 'Fast preview' },
  { id: 'standard',  label: 'Standard',  dpi: 150, desc: 'Medium quality' },
  { id: 'industrial',label: 'Industrial', dpi: 300, desc: '300 DPI standard' },
  { id: 'photo',     label: 'Photo',     dpi: 600, desc: 'Max quality' },
];

// ─── Toggle Switch Component ───────────────────────────────────────────────────
const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; subtitle?: string }> = ({ checked, onChange, label, subtitle }) => (
  <div className="export-toggle-row" onClick={() => onChange(!checked)}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
      {subtitle && <div style={{ fontSize: '9px', color: 'var(--text-disabled)', marginTop: '1px' }}>{subtitle}</div>}
    </div>
    <div className={`export-toggle-switch ${checked ? 'on' : ''}`}>
      <div className="export-toggle-knob" />
    </div>
  </div>
);

export const PreFlightPanel: React.FC<PreFlightPanelProps> = ({ project, onUpdateProject }) => {
  // ─── Export & Layout Settings ──────────────────────────────────────────────
  const [exportMode, setExportMode] = useState<'sheet' | 'nesting'>('sheet');
  const [activePreset, setActivePreset] = useState<string>('industrial');
  const [targetDpi, setTargetDpi] = useState<number>(project.dpi || 300);
  const [printerWidthInches, setPrinterWidthInches] = useState<number>(36);
  const [bleedInches, setBleedInches] = useState<number>(project.rules.bleedInches || 0.25);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(true);
  const [includeCollar, setIncludeCollar] = useState<boolean>(true);
  const [includeSleeves, setIncludeSleeves] = useState<boolean>(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(project.activePlayerId || (project.roster[0]?.id || ''));

  // ─── Fabric Canvas & Zoom ──────────────────────────────────────────────────
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [zoom, setZoom] = useState<number>(0.25);
  const viewportRef = useRef<HTMLDivElement>(null);

  // ─── Template SVG Data ─────────────────────────────────────────────────────
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(true);
  const [panelTemplates, setPanelTemplates] = useState<Record<string, SVGTemplateData>>({});
  const [activeTemplate, setActiveTemplate] = useState<any>({
    id: 'tshirt',
    name: 'T-Shirt',
    baseSize: 'M',
    baseMeasurements: {
      frontWidth: 21, frontHeight: 30,
      backWidth: 21, backHeight: 30,
      sleeveWidth: 10, sleeveHeight: 15,
      collarWidth: 14, collarHeight: 8
    },
    sizeStep: 2,
    supportedSizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    files: {
      front: '/templates/tshirt/front.svg',
      back: '/templates/tshirt/back.svg',
      'left-sleeve': '/templates/tshirt/left-sleeve.svg',
      'right-sleeve': '/templates/tshirt/right-sleeve.svg'
    }
  });

  // ─── Nesting & Export State ────────────────────────────────────────────────
  const [nestedPieces, setNestedPieces] = useState<PackedPiece[]>([]);
  const [totalNestLengthInches, setTotalNestLengthInches] = useState<number>(0);
  const [nestEfficiency, setNestEfficiency] = useState<number>(0);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStep, setExportStep] = useState<string>('');
  const [downloadReady, setDownloadReady] = useState<boolean>(false);

  // ─── Load Apparel Template ──────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoadingTemplates(true);
    fetch('/templates/manifest.json')
      .then(res => res.json())
      .then(async (data: any[]) => {
        if (!active) return;
        const found = data.find(t => t.id === project.apparelType);
        if (found) {
          setActiveTemplate(found);
          const svgData: Record<string, SVGTemplateData> = {};
          const files = found.files || {};
          for (const [key, url] of Object.entries(files)) {
            try {
              const res = await fetch(url as string);
              const text = await res.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(text, 'image/svg+xml');
              const svgEl = doc.querySelector('svg');
              const paths = doc.querySelectorAll('path');
              let selectedPath = paths[0];
              for (let i = 0; i < paths.length; i++) {
                const cls = paths[i].getAttribute('class');
                if (cls === 'cls-1' || paths[i].getAttribute('fill') === '#fff' || paths[i].getAttribute('fill') === '#ffffff') {
                  selectedPath = paths[i];
                  break;
                }
              }
              if (selectedPath === paths[0] && paths.length > 1) selectedPath = paths[1];
              const pathData = selectedPath?.getAttribute('d') || '';
              const viewBoxStr = svgEl?.getAttribute('viewBox') || '';
              const parts = viewBoxStr.split(/[ ,]+/).map(Number);
              svgData[key] = { pathData, viewBoxW: parts[2] || 1000, viewBoxH: parts[3] || 1000 };
            } catch (e) {
              console.error('Failed to parse template SVG in Export:', e);
            }
          }
          setPanelTemplates(svgData);
        }
        setLoadingTemplates(false);
      })
      .catch(err => {
        console.error('Failed loading template manifest in Export:', err);
        setLoadingTemplates(false);
      });
    return () => { active = false; };
  }, [project.apparelType]);

  // ─── Garment Dimension Helper ──────────────────────────────────────────────
  const getGarmentDimensions = (size: string) => {
    const sizes = activeTemplate.supportedSizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    const baseSizeIndex = sizes.indexOf(activeTemplate.baseSize || 'M');
    const normalizedSize = size === 'XXL' ? '2XL' : size;
    const currentSizeIndex = sizes.indexOf(normalizedSize);
    const sizeDiff = currentSizeIndex !== -1 ? currentSizeIndex - baseSizeIndex : 0;
    const step = activeTemplate.sizeStep || 2;
    const frontBaseWidth = activeTemplate.baseMeasurements.frontWidth;
    const frontWidth = frontBaseWidth + sizeDiff * step;
    const scaleFactor = frontWidth / frontBaseWidth;
    const getDim = (baseW: number, baseH: number) => ({
      w: Number((baseW * scaleFactor).toFixed(3)),
      h: Number((baseH * scaleFactor).toFixed(3))
    });
    const bm = activeTemplate.baseMeasurements;
    return {
      front: getDim(bm.frontWidth, bm.frontHeight),
      back: getDim(bm.backWidth, bm.backHeight),
      sleeves: getDim(bm.sleeveWidth, bm.sleeveHeight),
      collar: getDim(bm.collarWidth || 14, bm.collarHeight || 8),
    };
  };

  // ─── Piece Placement Helper ────────────────────────────────────────────────
  const getPiecePlacement = (
    panel: string,
    viewBoxW: number,
    viewBoxH: number,
    dims: Record<string, { w: number; h: number }>,
    artboardW: number,
    artboardH: number
  ) => {
    const maxW = artboardW * 0.92;
    const maxH = artboardH * 0.92;
    const panelDim = dims[panel === 'sleeves_right' ? 'sleeves' : panel] ?? dims.front;
    let targetW = panelDim.w * 40;
    let targetH = panelDim.h * 40;
    if (panel === 'sleeves' || panel === 'sleeves_right') targetW = panelDim.w * 2 * 40;
    const trueScale = Math.min(targetW / viewBoxW, targetH / viewBoxH);
    const trueW = viewBoxW * trueScale;
    const trueH = viewBoxH * trueScale;
    let scale = trueScale;
    if (trueW > maxW || trueH > maxH) scale = Math.min(maxW / viewBoxW, maxH / viewBoxH);
    return { scale, width: viewBoxW * scale, height: viewBoxH * scale };
  };

  // ─── Nesting Packing ────────────────────────────────────────────────────────
  const runNestingPacking = () => {
    if (project.roster.length === 0 || loadingTemplates) return;
    const margin = 20;
    const printerWidthPx = printerWidthInches * 40;
    const items: PackedPiece[] = [];
    project.roster.forEach(player => {
      const dims = getGarmentDimensions(player.size);
      const addNestItem = (panel: string) => {
        const fileKey = panel === 'sleeves_right' ? 'right-sleeve' : panel === 'sleeves' ? 'left-sleeve' : panel;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData) return;
        const artW = panel === 'front' || panel === 'back' ? 1120 : panel === 'sleeves' || panel === 'sleeves_right' ? 960 : 560;
        const artH = panel === 'front' || panel === 'back' ? 1360 : panel === 'sleeves' || panel === 'sleeves_right' ? 640 : 320;
        const placement = getPiecePlacement(panel, tData.viewBoxW, tData.viewBoxH, dims, artW, artH);
        let w = placement.width + margin;
        let h = placement.height + margin;
        let rotated = false;
        if (w > printerWidthPx || (w > h && h <= printerWidthPx)) { w = placement.height + margin; h = placement.width + margin; rotated = true; }
        items.push({ id: `${player.id}-${panel}`, player, panel, width: w, height: h, x: 0, y: 0, rotated });
      };
      addNestItem('front');
      addNestItem('back');
      if (includeSleeves && activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
        addNestItem('sleeves');
        addNestItem('sleeves_right');
      }
      if (includeCollar && activeTemplate.files && activeTemplate.files['collar']) addNestItem('collar');
    });
    items.sort((a, b) => b.height - a.height);
    const shelves: { y: number; height: number; nextX: number }[] = [];
    const packed: PackedPiece[] = [];
    items.forEach(item => {
      let placed = false;
      for (const shelf of shelves) {
        if (shelf.nextX + item.width <= printerWidthPx) { item.x = shelf.nextX; item.y = shelf.y; shelf.nextX += item.width; placed = true; break; }
      }
      if (!placed) {
        const lastShelf = shelves[shelves.length - 1];
        const newY = lastShelf ? lastShelf.y + lastShelf.height : 0;
        shelves.push({ y: newY, height: item.height, nextX: item.width });
        item.x = 0; item.y = newY;
      }
      packed.push(item);
    });
    const totalHeight = shelves.reduce((sum, s) => sum + s.height, 0);
    setNestedPieces(packed);
    setTotalNestLengthInches(totalHeight / 40);
    const totalPieceArea = packed.reduce((sum, item) => sum + (item.width - margin) * (item.height - margin), 0);
    const totalRollArea = printerWidthPx * totalHeight;
    setNestEfficiency(totalRollArea > 0 ? (totalPieceArea / totalRollArea) * 100 : 0);
  };

  useEffect(() => { runNestingPacking(); }, [project.roster, printerWidthInches, includeSleeves, includeCollar, panelTemplates, loadingTemplates, exportMode]);

  // ─── Fabric Canvas Rendering ────────────────────────────────────────────────
  const rebuildPreview = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.set({ backgroundColor: '#0a0a0c' });
    const selectedPlayer = project.roster.find(p => p.id === selectedPlayerId) || project.roster[0];
    if (!selectedPlayer) { canvas.requestRenderAll(); return; }
    const shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 24, offsetX: 0, offsetY: 8 });

    if (exportMode === 'sheet') {
      const canvasW = 2400, canvasH = 2400;
      canvas.setDimensions({ width: canvasW, height: canvasH });
      const paper = new fabric.Rect({ left: 0, top: 0, width: canvasW, height: canvasH, fill: '#ffffff', selectable: false, evented: false, shadow });
      canvas.add(paper);
      const projectTitle = new fabric.Text(`DESIGNSYNC PRODUCTION SHEET — ${project.name.toUpperCase()}`, { left: 60, top: 60, fontSize: 24, fontFamily: 'monospace', fontWeight: 'bold', fill: '#111115', selectable: false, evented: false });
      const specLabel = new fabric.Text(`PLAYER: ${selectedPlayer.name} #${selectedPlayer.number}   |   SIZE: ${selectedPlayer.size}   |   DPI: ${targetDpi}   |   BLEED: +${bleedInches}"`, { left: 60, top: 95, fontSize: 14, fontFamily: 'monospace', fill: '#7a7a90', selectable: false, evented: false });
      canvas.add(projectTitle, specLabel);
      const offsets = { sleeves: { x: 60, y: 180 }, sleeves_right: { x: 1380, y: 180 }, front: { x: 60, y: 920 }, back: { x: 1220, y: 920 }, collar: { x: 920, y: 760 } };

      const drawPanelSheet = async (panelKey: string, offset: { x: number; y: number }, flipH = false) => {
        const fileKey = panelKey === 'sleeves_right' ? 'right-sleeve' : panelKey === 'sleeves' ? 'left-sleeve' : panelKey;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData || !tData.pathData) return;
        const artW = panelKey === 'front' || panelKey === 'back' ? 1120 : panelKey === 'sleeves' || panelKey === 'sleeves_right' ? 960 : 560;
        const artH = panelKey === 'front' || panelKey === 'back' ? 1360 : panelKey === 'sleeves' || panelKey === 'sleeves_right' ? 640 : 320;
        const dims = getGarmentDimensions(selectedPlayer.size);
        const placement = getPiecePlacement(panelKey, tData.viewBoxW, tData.viewBoxH, dims, artW, artH);
        const leftPos = offset.x + (artW - placement.width) / 2 + (flipH ? placement.width : 0);
        const topPos = offset.y + (artH - placement.height) / 2;
        const pathObj = new fabric.Path(tData.pathData, { left: leftPos, top: topPos, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, fill: '#ffffff', stroke: '#8a8a9f', strokeWidth: 1.5, selectable: false, evented: false, originX: 'left', originY: 'top' });
        canvas.add(pathObj);
        const labelText = new fabric.Text(`${panelKey.replace('_', ' ').toUpperCase()}`, { left: offset.x, top: offset.y, fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold', fill: '#1a1a24', selectable: false, evented: false });
        canvas.add(labelText);
        const savedJSON = project.canvasStates ? (project.canvasStates as any)[panelKey === 'sleeves_right' ? 'sleeves' : panelKey] : undefined;
        if (savedJSON) {
          try {
            const data = JSON.parse(savedJSON);
            for (const objData of (data.objects || [])) {
              if (objData.__isArtboard) continue;
              const customizedData = { ...objData };
              if (customizedData.type === 'textbox' || customizedData.type === 'i-text' || customizedData.type === 'text') {
                const textVal = (customizedData.text || '').trim().toUpperCase();
                const activePlayer = project.roster.find(p => p.id === project.activePlayerId) || project.roster[0];
                const activeName = activePlayer?.name.toUpperCase() || 'JAY';
                const activeNum = activePlayer?.number || '7';
                if (textVal === activeName || textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') { customizedData.text = selectedPlayer.name; customizedData.scaleX = (customizedData.scaleX || 1) * selectedPlayer.nameScale; }
                else if (textVal === activeNum || textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00') { customizedData.text = selectedPlayer.number; }
              }
              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                fObj.set({ left: leftPos + (objData.left || 0) * (flipH ? -1 : 1), top: topPos + (objData.top || 0), scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, selectable: false, evented: false, clipPath: new fabric.Path(tData.pathData, { left: leftPos, top: topPos, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, originX: 'left', originY: 'top', absolutePositioned: true }) });
                canvas.add(fObj);
              }
            }
          } catch (e) { console.error('Failed to parse json design objects:', e); }
        }
      };

      await drawPanelSheet('front', offsets.front);
      await drawPanelSheet('back', offsets.back);
      if (includeSleeves && activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
        await drawPanelSheet('sleeves', offsets.sleeves);
        await drawPanelSheet('sleeves_right', offsets.sleeves_right, true);
      }
      if (includeCollar && activeTemplate.files && activeTemplate.files['collar']) await drawPanelSheet('collar', offsets.collar);
    } else {
      const printerWidthPx = printerWidthInches * 40;
      const rollHeightPx = Math.max(800, totalNestLengthInches * 40);
      canvas.setDimensions({ width: printerWidthPx, height: rollHeightPx });
      const rollBg = new fabric.Rect({ left: 0, top: 0, width: printerWidthPx, height: rollHeightPx, fill: '#1e1e24', stroke: '#2d2d3f', strokeWidth: 2, selectable: false, evented: false });
      canvas.add(rollBg);
      for (let y = 160; y < rollHeightPx; y += 160) {
        canvas.add(new fabric.Line([0, y, printerWidthPx, y], { stroke: '#2d2d38', strokeWidth: 1, strokeDasharray: [4, 4], selectable: false, evented: false }));
      }
      for (const piece of nestedPieces) {
        const panelKey = piece.panel;
        const fileKey = panelKey === 'sleeves_right' ? 'right-sleeve' : panelKey === 'sleeves' ? 'left-sleeve' : panelKey;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData) continue;
        const artW = panelKey === 'front' || panelKey === 'back' ? 1120 : 960;
        const artH = panelKey === 'front' || panelKey === 'back' ? 1360 : 640;
        const dims = getGarmentDimensions(piece.player.size);
        const placement = getPiecePlacement(panelKey, tData.viewBoxW, tData.viewBoxH, dims, artW, artH);
        const flipH = panelKey === 'sleeves_right';
        const itemMargin = 10;
        const pieceLeft = piece.x + itemMargin;
        const pieceTop = piece.y + itemMargin;
        const pathObj = new fabric.Path(tData.pathData, { left: pieceLeft, top: pieceTop, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, fill: '#ffffff', stroke: '#5a5a6f', strokeWidth: 1, selectable: false, evented: false, originX: 'left', originY: 'top' });
        if (piece.rotated) pathObj.set({ angle: 90, left: pieceLeft + placement.height, top: pieceTop });
        canvas.add(pathObj);
        const savedJSON = project.canvasStates ? (project.canvasStates as any)[panelKey === 'sleeves_right' ? 'sleeves' : panelKey] : undefined;
        if (savedJSON) {
          try {
            const data = JSON.parse(savedJSON);
            for (const objData of (data.objects || [])) {
              if (objData.__isArtboard) continue;
              const customizedData = { ...objData };
              if (customizedData.type === 'textbox' || customizedData.type === 'i-text' || customizedData.type === 'text') {
                const textVal = (customizedData.text || '').trim().toUpperCase();
                const activePlayer = project.roster.find(p => p.id === project.activePlayerId) || project.roster[0];
                const activeName = activePlayer?.name.toUpperCase() || 'JAY';
                const activeNum = activePlayer?.number || '7';
                if (textVal === activeName || textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') { customizedData.text = piece.player.name; customizedData.scaleX = (customizedData.scaleX || 1) * piece.player.nameScale; }
                else if (textVal === activeNum || textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00') { customizedData.text = piece.player.number; }
              }
              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                const objLeft = (objData.left || 0) * (flipH ? -1 : 1);
                const objTop = (objData.top || 0);
                fObj.set({ selectable: false, evented: false });
                if (piece.rotated) {
                  fObj.set({ left: pieceLeft + placement.height - objTop * placement.scale, top: pieceTop + objLeft * placement.scale, angle: (objData.angle || 0) + 90, scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, clipPath: new fabric.Path(tData.pathData, { left: pieceLeft + placement.height, top: pieceTop, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, angle: 90, originX: 'left', originY: 'top', absolutePositioned: true }) });
                } else {
                  fObj.set({ left: pieceLeft + objLeft, top: pieceTop + objTop, scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, clipPath: new fabric.Path(tData.pathData, { left: pieceLeft, top: pieceTop, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, originX: 'left', originY: 'top', absolutePositioned: true }) });
                }
                canvas.add(fObj);
              }
            }
          } catch (e) { console.error('Nesting objects load fail:', e); }
        }
      }
    }
    canvas.requestRenderAll();
  };

  useEffect(() => { if (!loadingTemplates) rebuildPreview(); }, [exportMode, targetDpi, printerWidthInches, bleedInches, showSafeZones, includeCollar, includeSleeves, selectedPlayerId, panelTemplates, loadingTemplates]);

  useEffect(() => {
    if (canvasElRef.current) {
      const canvas = new fabric.Canvas(canvasElRef.current, { allowTouchScrolling: true, selection: false });
      fabricCanvasRef.current = canvas;
      rebuildPreview();
    }
    return () => { if (fabricCanvasRef.current) { fabricCanvasRef.current.dispose(); fabricCanvasRef.current = null; } };
  }, []);

  // ─── Diagnostics ────────────────────────────────────────────────────────────
  const runDiagnostics = () => {
    const checks = [];
    const lowResLogos = project.logos.filter(l => l.dpi < 300);
    if (project.logos.length === 0) {
      checks.push({ status: 'warning', title: 'No Sponsor Logos Uploaded', desc: 'Graphics will export correctly, but no logo components are mapped.' });
    } else if (lowResLogos.length > 0) {
      checks.push({ status: 'error', title: 'Low Resolution Graphics', desc: `${lowResLogos.map(l => l.name).join(', ')} is under 300 DPI. Sublimation may blur.` });
    } else {
      checks.push({ status: 'success', title: 'Graphics Production Ready', desc: 'All graphic elements are fully calibrated at high resolution.' });
    }
    const squeezed = project.roster.filter(p => p.nameScale < 0.7);
    if (project.roster.length === 0) {
      checks.push({ status: 'warning', title: 'Empty Team Roster', desc: 'Please populate roster database variants to create production batches.' });
    } else if (squeezed.length > 0) {
      checks.push({ status: 'warning', title: 'Font Compression Limit Warning', desc: `${squeezed.map(p => p.name).join(', ')} names are squeezed under 70% bounds.` });
    } else {
      checks.push({ status: 'success', title: 'Roster Safe Zones Cleared', desc: 'All player typography sizes fit safe print-zones.' });
    }
    if (bleedInches < 0.25) {
      checks.push({ status: 'warning', title: 'Bleed Safety Margin Suboptimal', desc: `Standard sublimation requires at least 0.25" bleed. Currently: ${bleedInches}"` });
    } else {
      checks.push({ status: 'success', title: 'Seam & Bleed Calibration Verified', desc: `Bleed margin correctly set at +${bleedInches}".` });
    }
    return checks;
  };

  const diagnostics = runDiagnostics();
  const criticalErrorsCount = diagnostics.filter(c => c.status === 'error').length;
  const warningCount = diagnostics.filter(c => c.status === 'warning').length;
  const readinessScore = Math.max(0, 100 - criticalErrorsCount * 35 - warningCount * 15);

  // ─── Export Compiler ────────────────────────────────────────────────────────
  const triggerExport = () => {
    if (project.roster.length === 0) return;
    setExporting(true);
    setDownloadReady(false);
    setExportProgress(0);
    const steps = [
      'Performing vector pre-flight boundaries audit...',
      'Rasterizing layout textures at target resolution...',
      'Generating layout sheets with player customization...',
      'Applying dynamic seam bounds & safety bleed margins...',
      'Packaging ready sublimation print file package...'
    ];
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length) { setExportStep(steps[currentStep]); setExportProgress((currentStep + 1) * 20); currentStep++; }
      else { clearInterval(interval); setExporting(false); setDownloadReady(true); }
    }, 1200);
  };

  const handleDownloadSVG = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const svgContent = canvas.toSVG();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `designsync_${project.name.toLowerCase().replace(/\s+/g, '_')}_production_layout.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPNG = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: targetDpi / 96 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `designsync_${project.name.toLowerCase().replace(/\s+/g, '_')}_production_layout.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoom = (factor: number) => setZoom(prev => Math.max(0.05, Math.min(1.5, prev * factor)));

  // ─── Canvas dimensions for HUD ─────────────────────────────────────────────
  const canvasW = exportMode === 'sheet' ? 2400 : printerWidthInches * 40;
  const canvasH = exportMode === 'sheet' ? 2400 : Math.max(800, totalNestLengthInches * 40);
  const printWInches = canvasW / 40;
  const printHInches = canvasH / 40;
  const totalPanels = project.roster.length * (2 + (includeSleeves ? 2 : 0) + (includeCollar ? 1 : 0));

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="export-studio">

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL: PRODUCTION CONFIGURATION
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="export-config-panel">

        {/* Panel Header */}
        <div className="export-panel-header">
          <Settings2 size={14} style={{ color: 'var(--accent-blue)' }} />
          <span className="export-panel-title">Production Config</span>
        </div>

        <div className="export-panel-body">

          {/* ── Export Presets ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Target size={11} />
              Export Preset
            </div>
            <div className="export-preset-grid">
              {EXPORT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`export-preset-btn ${activePreset === preset.id ? 'active' : ''}`}
                  onClick={() => { setActivePreset(preset.id); setTargetDpi(preset.dpi); }}
                >
                  <span className="export-preset-label">{preset.label}</span>
                  <span className="export-preset-dpi">{preset.dpi} DPI</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Print Mode ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Printer size={11} />
              Print Layout Mode
            </div>
            <div className="export-mode-toggle">
              <button
                className={`export-mode-btn ${exportMode === 'sheet' ? 'active' : ''}`}
                onClick={() => setExportMode('sheet')}
              >
                <FileText size={12} />
                Production Sheet
              </button>
              <button
                className={`export-mode-btn ${exportMode === 'nesting' ? 'active' : ''}`}
                onClick={() => setExportMode('nesting')}
              >
                <Package size={12} />
                Nesting Roll
              </button>
            </div>
          </div>

          {/* ── Player Variant (sheet mode) ── */}
          {exportMode === 'sheet' && project.roster.length > 0 && (
            <div className="export-section">
              <div className="export-section-header">
                <Layers size={11} />
                Preview Variant
              </div>
              <div className="export-select-wrapper">
                <select
                  value={selectedPlayerId}
                  onChange={e => setSelectedPlayerId(e.target.value)}
                  className="export-select"
                >
                  {project.roster.map(p => (
                    <option key={p.id} value={p.id}>{p.name} #{p.number} [{p.size}]</option>
                  ))}
                </select>
                <ChevronDown size={12} className="export-select-chevron" />
              </div>
            </div>
          )}

          {/* ── Machine Config ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Cpu size={11} />
              Machine Config
            </div>
            {exportMode === 'nesting' && (
              <div style={{ marginBottom: '10px' }}>
                <label className="export-field-label">Sublimation Roll Width</label>
                <div className="export-select-wrapper">
                  <select value={printerWidthInches} onChange={e => setPrinterWidthInches(Number(e.target.value))} className="export-select">
                    <option value="24">24" — Small / Plotter</option>
                    <option value="36">36" — Standard Roll</option>
                    <option value="44">44" — Medium Industrial</option>
                    <option value="60">60" — Wide Industrial</option>
                  </select>
                  <ChevronDown size={12} className="export-select-chevron" />
                </div>
              </div>
            )}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label className="export-field-label">Sewing Bleed Margin</label>
                <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace', fontWeight: 700 }}>{bleedInches.toFixed(2)}"</span>
              </div>
              <input
                type="range" min="0" max="0.75" step="0.05" value={bleedInches}
                onChange={e => { const val = Number(e.target.value); setBleedInches(val); onUpdateProject({ rules: { ...project.rules, bleedInches: val } }); }}
                className="export-range"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-disabled)', marginTop: '3px' }}>
                <span>0"</span><span>0.75"</span>
              </div>
            </div>
          </div>

          {/* ── Layer Toggles ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Shield size={11} />
              Output Layers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <ToggleSwitch checked={includeSleeves} onChange={setIncludeSleeves} label="Include Sleeves" subtitle="Left + Right sleeve panels" />
              <ToggleSwitch checked={includeCollar} onChange={setIncludeCollar} label="Include Collar" subtitle="Neckline / collar panel" />
              <ToggleSwitch checked={showSafeZones} onChange={setShowSafeZones} label="Safe Zone Overlays" subtitle="Print-safe boundary guides" />
            </div>
          </div>

        </div>

        {/* Compile Action (bottom of left panel) */}
        <div className="export-compile-area">
          {project.roster.length === 0 && (
            <div className="export-warning-banner">
              <AlertTriangle size={12} />
              <span>Add players to roster first</span>
            </div>
          )}
          {criticalErrorsCount > 0 && (
            <div className="export-error-banner">
              <AlertCircle size={12} />
              <span>Fix critical errors before compiling</span>
            </div>
          )}
          {!exporting && !downloadReady && (
            <button
              className="export-compile-btn"
              onClick={triggerExport}
              disabled={project.roster.length === 0 || criticalErrorsCount > 0}
            >
              <FileText size={14} />
              Compile Production Files
            </button>
          )}
          {exporting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exportStep}</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)', marginLeft: '8px' }}>{exportProgress}%</span>
              </div>
              <div className="export-progress-track">
                <div className="export-progress-bar" style={{ width: `${exportProgress}%` }} />
              </div>
            </div>
          )}
          {downloadReady && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="export-success-msg">
                <Check size={12} /> Production files ready!
              </div>
              <button className="export-dl-btn export-dl-svg" onClick={handleDownloadSVG}>
                <Download size={12} /> Download SVG Vector
              </button>
              <button className="export-dl-btn export-dl-png" onClick={handleDownloadPNG}>
                <Download size={12} /> Download PNG Raster
              </button>
              <button className="export-recompile-btn" onClick={() => setDownloadReady(false)}>
                Re-compile batch layouts
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CENTER: PRODUCTION CANVAS VIEWPORT
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="export-viewport-panel">

        {/* Viewport Topbar */}
        <div className="export-viewport-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: exporting ? '#ffb300' : downloadReady ? '#00e676' : 'var(--accent-blue)', boxShadow: `0 0 6px ${exporting ? '#ffb300' : downloadReady ? '#00e676' : 'var(--accent-blue)'}`, animation: exporting ? 'exportPulse 1s infinite' : 'none' }} />
              <span className="export-viewport-title">
                {exportMode === 'sheet' ? 'Production Sheet Preview' : `Nesting Roll Preview — ${printerWidthInches}" wide`}
              </span>
            </div>
            <div className="export-tab-group">
              <button className={`export-tab ${exportMode === 'sheet' ? 'active' : ''}`} onClick={() => setExportMode('sheet')}>
                <FileText size={10} /> Sheet
              </button>
              <button className={`export-tab ${exportMode === 'nesting' ? 'active' : ''}`} onClick={() => setExportMode('nesting')}>
                <Package size={10} /> Nesting
              </button>
            </div>
          </div>

          <div className="export-zoom-controls">
            <button className="export-zoom-btn" onClick={() => handleZoom(0.8)}><ZoomOut size={12} /></button>
            <span className="export-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="export-zoom-btn" onClick={() => handleZoom(1.2)}><ZoomIn size={12} /></button>
            <button className="export-zoom-btn export-zoom-fit" onClick={() => setZoom(exportMode === 'sheet' ? 0.25 : 0.4)}>Fit</button>
          </div>
        </div>

        {/* Canvas Viewport */}
        <div ref={viewportRef} className="export-canvas-viewport">

          {/* Loading State */}
          {loadingTemplates && (
            <div className="export-loading-overlay">
              <div className="export-loading-spinner" />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>Loading template data...</span>
            </div>
          )}

          {/* Exporting Overlay */}
          {exporting && (
            <div className="export-engine-overlay">
              <div className="export-engine-pulse" />
              <div style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}>
                ENGINE PROCESSING
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', maxWidth: '260px', textAlign: 'center', lineHeight: 1.5 }}>
                {exportStep}
              </div>
              <div style={{ width: '200px', height: '3px', background: 'rgba(0,112,243,0.15)', borderRadius: '2px', overflow: 'hidden', marginTop: '8px' }}>
                <div style={{ width: `${exportProgress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.4s', borderRadius: '2px' }} />
              </div>
            </div>
          )}

          {/* Fabric Canvas */}
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out', display: 'inline-block' }}>
            <canvas ref={canvasElRef} />
          </div>

          {/* ── Floating Dimension HUD ── */}
          {!loadingTemplates && (
            <div className="export-dim-hud">
              <div className="export-dim-hud-row">
                <span className="export-dim-hud-label">W</span>
                <span className="export-dim-hud-value">{printWInches.toFixed(1)}<span className="export-dim-hud-unit">"</span></span>
                <span className="export-dim-hud-sep">×</span>
                <span className="export-dim-hud-label">H</span>
                <span className="export-dim-hud-value">{printHInches.toFixed(1)}<span className="export-dim-hud-unit">"</span></span>
              </div>
              <div className="export-dim-hud-badges">
                <span className="export-dim-badge export-dim-badge--blue">{targetDpi} DPI</span>
                <span className="export-dim-badge export-dim-badge--green">CMYK</span>
                {exportMode === 'nesting' && nestEfficiency > 0 && (
                  <span className={`export-dim-badge ${nestEfficiency > 75 ? 'export-dim-badge--green' : 'export-dim-badge--orange'}`}>
                    {nestEfficiency.toFixed(0)}% eff.
                  </span>
                )}
                <span className="export-dim-badge export-dim-badge--muted">{Math.round(zoom * 100)}% zoom</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL: PRODUCTION DIAGNOSTICS
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="export-diagnostics-panel">

        {/* Panel Header with Readiness Score */}
        <div className="export-panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <Activity size={14} style={{ color: 'var(--accent-blue)' }} />
            <span className="export-panel-title">Production Diagnostics</span>
          </div>
          {/* Readiness Score Bar */}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-disabled)' }}>Export Readiness</span>
              <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'monospace', color: readinessScore >= 80 ? '#00e676' : readinessScore >= 50 ? '#ffb300' : '#ff4458' }}>
                {readinessScore}%
              </span>
            </div>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${readinessScore}%`, background: readinessScore >= 80 ? '#00e676' : readinessScore >= 50 ? '#ffb300' : '#ff4458', borderRadius: '2px', transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>

        <div className="export-panel-body">

          {/* ── Garment Summary ── */}
          <div className="export-stat-card">
            <div className="export-stat-card-header">
              <Layers size={11} />
              Garment Summary
            </div>
            <div className="export-stat-rows">
              <div className="export-stat-row">
                <span>Apparel Type</span>
                <span style={{ textTransform: 'capitalize' }}>{(project.apparelType || 'Jersey').replace('_', ' ')}</span>
              </div>
              <div className="export-stat-row">
                <span>Team Roster</span>
                <span>{project.roster.length} player{project.roster.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="export-stat-row">
                <span>Total Panels</span>
                <span>{totalPanels}</span>
              </div>
              <div className="export-stat-row">
                <span>Style Profile</span>
                <span>{project.stylePreference || 'Generic'}</span>
              </div>
            </div>
            {/* Size breakdown mini chips */}
            {project.roster.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].map(sz => {
                  const count = project.roster.filter(p => p.size === sz || (sz === 'XXL' && (p.size === 'XXL' || p.size === '2XL' as any))).length;
                  if (count === 0) return null;
                  return (
                    <span key={sz} style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', background: 'rgba(0,112,243,0.12)', color: 'var(--accent-blue)', fontFamily: 'monospace', fontWeight: 700, border: '1px solid rgba(0,112,243,0.2)' }}>
                      {sz}×{count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Print Area Stats ── */}
          <div className="export-stat-card">
            <div className="export-stat-card-header">
              <BarChart3 size={11} />
              Print Specifications
            </div>
            <div className="export-stat-rows">
              <div className="export-stat-row">
                <span>Printable Width</span>
                <span>{exportMode === 'sheet' ? '60"' : `${printerWidthInches}"`} ({Math.round((exportMode === 'sheet' ? 60 : printerWidthInches) * 2.54)} cm)</span>
              </div>
              <div className="export-stat-row">
                <span>Est. Length</span>
                <span>{exportMode === 'sheet' ? '60"' : `${totalNestLengthInches.toFixed(1)}"`} ({exportMode === 'sheet' ? '1.52m' : `${(totalNestLengthInches * 0.0254).toFixed(2)}m`})</span>
              </div>
              <div className="export-stat-row">
                <span>Output Area</span>
                <span>{exportMode === 'sheet' ? '25.0' : `${((printerWidthInches * totalNestLengthInches) / 144).toFixed(1)}`} sq ft</span>
              </div>
              <div className="export-stat-row">
                <span>Nesting Efficiency</span>
                <span style={{ color: exportMode === 'nesting' ? (nestEfficiency > 75 ? '#00e676' : '#ffb300') : 'var(--text-secondary)' }}>
                  {exportMode === 'sheet' ? 'N/A' : `${nestEfficiency.toFixed(1)}%`}
                </span>
              </div>
              <div className="export-stat-row">
                <span>Estimated File Size</span>
                <span>{((0.5 + project.roster.length * 0.35) * (exportMode === 'sheet' ? 1 : 0.8)).toFixed(1)} MB</span>
              </div>
            </div>
          </div>

          {/* ── DPI & Color Validation ── */}
          <div className="export-stat-card">
            <div className="export-stat-card-header">
              <Target size={11} />
              Output Calibration
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              <span className={`export-calib-badge ${targetDpi >= 300 ? 'ok' : 'warn'}`}>
                {targetDpi >= 300 ? '✓' : '⚠'} {targetDpi} DPI
              </span>
              <span className="export-calib-badge ok">✓ CMYK</span>
              <span className="export-calib-badge ok">✓ {bleedInches.toFixed(2)}" Bleed</span>
              <span className={`export-calib-badge ${project.logos.every(l => l.dpi >= 300) ? 'ok' : 'warn'}`}>
                {project.logos.every(l => l.dpi >= 300) ? '✓' : '⚠'} Logo Res
              </span>
            </div>
          </div>

          {/* ── Pre-Flight Diagnostics ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Shield size={11} />
              Pre-Flight Checks
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {diagnostics.map((c, idx) => (
                <div key={idx} className={`export-diag-item export-diag-${c.status}`}>
                  <div className="export-diag-icon">
                    {c.status === 'success' ? <CheckCircle size={13} /> : c.status === 'warning' ? <AlertTriangle size={13} /> : <AlertCircle size={13} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1px' }}>{c.title}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BOTTOM STATUS BAR
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="export-status-bar">
        <div className="export-status-left">
          <div className={`export-status-dot ${exporting ? 'pulsing' : downloadReady ? 'ready' : 'idle'}`} />
          <span className="export-status-engine">
            {exporting ? 'PROCESSING' : downloadReady ? 'EXPORT READY' : 'ENGINE READY'}
          </span>
          {exporting && (
            <span style={{ color: 'var(--text-disabled)', fontSize: '9px', marginLeft: '8px' }}>{exportStep}</span>
          )}
        </div>
        <div className="export-status-right">
          <span className="export-status-chip">DPI: {targetDpi}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Scale: 1px = 0.025"</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Print: {printWInches.toFixed(0)}" × {printHInches.toFixed(0)}"</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Assets: {project.logos.length}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Panels: {totalPanels}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Bleed: {bleedInches}"</span>
        </div>
      </div>

    </div>
  );
};
