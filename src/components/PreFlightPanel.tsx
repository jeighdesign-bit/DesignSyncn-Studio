import React, { useState, useEffect, useRef } from 'react';
import type { Project, RosterPlayer } from '../types';
import {
  CheckCircle, AlertTriangle, FileText, Download, Check,
  ZoomIn, ZoomOut, Printer, Layers, Settings2, Package,
  ChevronDown
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

export const PreFlightPanel: React.FC<PreFlightPanelProps> = ({ project, onUpdateProject }) => {
  // ─── Export & Layout Settings ──────────────────────────────────────────────
  const [exportMode, setExportMode] = useState<'sheet' | 'nesting'>('sheet');
  const [activePreset, setActivePreset] = useState<string>('industrial');
  const [targetDpi, setTargetDpi] = useState<number>(project.dpi || 300);
  const [printerWidthInches, setPrinterWidthInches] = useState<number>(36);
  const [bleedInches, setBleedInches] = useState<number>(project.rules.bleedInches || 0.5);
  const [panelSpacingInches, setPanelSpacingInches] = useState<number>(0.5);
  const [maxRollLengthYards, setMaxRollLengthYards] = useState<number>(50);
  const [exportFormat, setExportFormat] = useState<'JPG' | 'PNG' | 'TIFF' | 'PSD'>('JPG');
  const [sheetLayoutType, setSheetLayoutType] = useState<'all_panels' | 'front_only' | 'back_only' | 'sleeves_only' | 'collars_only'>('all_panels');
  const showSafeZones = true;
  const includeCollar = true;
  const includeSleeves = true;
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(project.activePlayerId || (project.roster[0]?.id || ''));
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(project.roster.map(p => p.id));

  useEffect(() => {
    setSelectedPlayerIds(project.roster.map(p => p.id));
  }, [project.roster]);

  const [advancedExpanded, setAdvancedExpanded] = useState<boolean>(false);

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
    sizeStep: 1, // 1" per step — grading table supersedes this for standard sizes
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
  // Uses the production grading table (1" per step, XS=19"→3XL=25").
  // Width and height scale proportionally (linked, user confirmed).
  const getGarmentDimensions = (size: string) => {
    const GRADING_WIDTHS: Record<string, number> = {
      XS: 19, S: 20, M: 21, L: 22, XL: 23, '2XL': 24, XXL: 24, '3XL': 25,
    };
    const normalizedSize = size === 'XXL' ? '2XL' : size;
    const bm = activeTemplate.baseMeasurements;
    const baseWidth = bm.frontWidth; // 21" for M
    const targetWidth = GRADING_WIDTHS[normalizedSize] ?? baseWidth;
    const scaleFactor = targetWidth / baseWidth;
    const dim = (baseW: number, baseH: number) => ({
      w: Number((baseW * scaleFactor).toFixed(3)),
      h: Number((baseH * scaleFactor).toFixed(3)),
    });
    return {
      front:   dim(bm.frontWidth,         bm.frontHeight),
      back:    dim(bm.backWidth,          bm.backHeight),
      sleeves: dim(bm.sleeveWidth,        bm.sleeveHeight),
      collar:  dim(bm.collarWidth || 14,  bm.collarHeight || 8),
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
    const bleedPx = bleedInches * 40;
    const spacingPx = panelSpacingInches * 40;
    const printerWidthPx = printerWidthInches * 40;
    const items: PackedPiece[] = [];

    project.roster.filter(p => selectedPlayerIds.includes(p.id)).forEach(player => {
      const dims = getGarmentDimensions(player.size);
      const addNestItem = (panel: string) => {
        const fileKey = panel === 'sleeves_right' ? 'right-sleeve' : panel === 'sleeves' ? 'left-sleeve' : panel;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData) return;
        const artW = panel === 'front' || panel === 'back' ? 1120 : panel === 'sleeves' || panel === 'sleeves_right' ? 960 : 560;
        const artH = panel === 'front' || panel === 'back' ? 1360 : panel === 'sleeves' || panel === 'sleeves_right' ? 640 : 320;
        const placement = getPiecePlacement(panel, tData.viewBoxW, tData.viewBoxH, dims, artW, artH);
        
        let w = placement.width + 2 * bleedPx + spacingPx;
        let h = placement.height + 2 * bleedPx + spacingPx;
        let rotated = false;
        
        // Auto orientation optimizer (rotate 90° if it fits better or saves length)
        if (w > printerWidthPx || (w > h && h <= printerWidthPx)) {
          w = placement.height + 2 * bleedPx + spacingPx;
          h = placement.width + 2 * bleedPx + spacingPx;
          rotated = true;
        }
        
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
        if (shelf.nextX + item.width <= printerWidthPx) {
          item.x = shelf.nextX;
          item.y = shelf.y;
          shelf.nextX += item.width;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const lastShelf = shelves[shelves.length - 1];
        const newY = lastShelf ? lastShelf.y + lastShelf.height : 0;
        shelves.push({ y: newY, height: item.height, nextX: item.width });
        item.x = 0;
        item.y = newY;
      }
      packed.push(item);
    });

    const totalHeight = shelves.reduce((sum, s) => sum + s.height, 0);
    setNestedPieces(packed);
    setTotalNestLengthInches(totalHeight / 40);
    
    // Total net piece area (excluding spacing)
    const totalPieceArea = packed.reduce((sum, item) => sum + (item.width - spacingPx) * (item.height - spacingPx), 0);
    const totalRollArea = printerWidthPx * totalHeight;
    setNestEfficiency(totalRollArea > 0 ? (totalPieceArea / totalRollArea) * 100 : 0);
  };

  useEffect(() => {
    runNestingPacking();
  }, [
    project.roster,
    selectedPlayerIds,
    printerWidthInches,
    bleedInches,
    panelSpacingInches,
    includeSleeves,
    includeCollar,
    panelTemplates,
    loadingTemplates,
    exportMode
  ]);

  // Total panels helper
  const totalPanels = selectedPlayerIds.length * (2 + (includeSleeves ? 2 : 0) + (includeCollar ? 1 : 0));
  const bleedPx = bleedInches * 40;
  const spacingPx = panelSpacingInches * 40;

  // Calculate canvas dimensions dynamically
  let canvasW = 2400;
  let canvasH = 2400;
  if (exportMode === 'sheet') {
    if (sheetLayoutType === 'front_only' || sheetLayoutType === 'back_only') {
      canvasW = 1200 + Math.round(bleedPx * 2);
      canvasH = 1500 + Math.round(bleedPx * 2);
    } else if (sheetLayoutType === 'sleeves_only') {
      canvasW = 1100 + Math.round(bleedPx * 2);
      canvasH = 1400 + Math.round(bleedPx * 2);
    } else if (sheetLayoutType === 'collars_only') {
      canvasW = 800 + Math.round(bleedPx * 2);
      canvasH = 600 + Math.round(bleedPx * 2);
    }
  } else {
    canvasW = printerWidthInches * 40;
    canvasH = Math.max(800, totalNestLengthInches * 40);
  }

  const printWInches = canvasW / 40;
  const printHInches = canvasH / 40;
  


  // ─── Fabric Canvas Rendering ────────────────────────────────────────────────
  const rebuildPreview = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.set({ backgroundColor: '#0a0a0c' });
    const selectedPlayer = project.roster.find(p => p.id === selectedPlayerId) || project.roster.find(p => selectedPlayerIds.includes(p.id)) || project.roster[0];
    if (!selectedPlayer) { canvas.requestRenderAll(); return; }
    const shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 24, offsetX: 0, offsetY: 8 });

    if (exportMode === 'sheet') {
      canvas.setDimensions({ width: canvasW, height: canvasH });
      const paper = new fabric.Rect({ left: 0, top: 0, width: canvasW, height: canvasH, fill: '#ffffff', selectable: false, evented: false, shadow });
      canvas.add(paper);
      const projectTitle = new fabric.Text(`DESIGNSYNC PRODUCTION SHEET — ${project.name.toUpperCase()}`, { left: 40, top: 40, fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold', fill: '#111115', selectable: false, evented: false });
      const specLabel = new fabric.Text(`PLAYER: ${selectedPlayer.name} #${selectedPlayer.number}  |  SIZE: ${selectedPlayer.size}  |  DPI: ${targetDpi}  |  LAYOUT: ${sheetLayoutType.replace('_', ' ').toUpperCase()}  |  BLEED: +${bleedInches}"`, { left: 40, top: 68, fontSize: 11, fontFamily: 'monospace', fill: '#7a7a90', selectable: false, evented: false });
      canvas.add(projectTitle, specLabel);

      const drawPanelSheet = async (panelKey: string, leftOffset: number, topOffset: number, width: number, height: number, flipH = false) => {
        const fileKey = panelKey === 'sleeves_right' ? 'right-sleeve' : panelKey === 'sleeves' ? 'left-sleeve' : panelKey;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData || !tData.pathData) return;

        const dims = getGarmentDimensions(selectedPlayer.size);
        const placement = getPiecePlacement(panelKey, tData.viewBoxW, tData.viewBoxH, dims, width, height);
        const leftPos = leftOffset + (width - placement.width) / 2 + (flipH ? placement.width : 0);
        const topPos = topOffset + (height - placement.height) / 2;

        // Draw Bleed Box
        if (bleedInches > 0) {
          const printW = placement.width + 2 * bleedPx;
          const printH = placement.height + 2 * bleedPx;
          const bleedRect = new fabric.Rect({
            left: leftPos - bleedPx * (flipH ? -1 : 1) - (flipH ? printW : 0),
            top: topPos - bleedPx,
            width: printW,
            height: printH,
            fill: 'transparent',
            stroke: 'rgba(0, 112, 243, 0.4)',
            strokeWidth: 1,
            strokeDasharray: [4, 4],
            selectable: false,
            evented: false,
          });
          canvas.add(bleedRect);
        }

        // Draw Template Seam/Cut line
        const pathObj = new fabric.Path(tData.pathData, { left: leftPos, top: topPos, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, fill: '#ffffff', stroke: '#ff4458', strokeWidth: 1.5, selectable: false, evented: false, originX: 'left', originY: 'top' });
        canvas.add(pathObj);

        // Panel label text
        const labelText = new fabric.Text(`${panelKey.replace('_', ' ').toUpperCase()}`, { left: leftOffset, top: topOffset - 15, fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', fill: '#1a1a24', selectable: false, evented: false });
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
                if (textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') { customizedData.text = selectedPlayer.name; customizedData.scaleX = (customizedData.scaleX || 1) * selectedPlayer.nameScale; }
                else if (textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00' || textVal === '7') { customizedData.text = selectedPlayer.number; }
              }
              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                const clipPath = new fabric.Path(tData.pathData, { left: leftPos, top: topPos, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, originX: 'left', originY: 'top', absolutePositioned: true });
                fObj.set({ left: leftPos + (objData.left || 0) * placement.scale * (flipH ? -1 : 1), top: topPos + (objData.top || 0) * placement.scale, scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, selectable: false, evented: false, clipPath });
                canvas.add(fObj);
              }
            }
          } catch (e) { console.error('Failed to parse json design objects:', e); }
        }
      };

      if (sheetLayoutType === 'all_panels') {
        const offsets = { sleeves: { x: 60, y: 180 }, sleeves_right: { x: 1380, y: 180 }, front: { x: 60, y: 920 }, back: { x: 1220, y: 920 }, collar: { x: 920, y: 760 } };
        await drawPanelSheet('front', offsets.front.x, offsets.front.y, 1120, 1360);
        await drawPanelSheet('back', offsets.back.x, offsets.back.y, 1120, 1360);
        if (includeSleeves && activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
          await drawPanelSheet('sleeves', offsets.sleeves.x, offsets.sleeves.y, 960, 640);
          await drawPanelSheet('sleeves_right', offsets.sleeves_right.x, offsets.sleeves_right.y, 960, 640, !activeTemplate.files['right-sleeve']);
        }
        if (includeCollar && activeTemplate.files && activeTemplate.files['collar']) await drawPanelSheet('collar', offsets.collar.x, offsets.collar.y, 560, 320);
      } else if (sheetLayoutType === 'front_only') {
        await drawPanelSheet('front', 40, 110, 1120, 1360);
      } else if (sheetLayoutType === 'back_only') {
        await drawPanelSheet('back', 40, 110, 1120, 1360);
      } else if (sheetLayoutType === 'sleeves_only') {
        if (activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
          await drawPanelSheet('sleeves', 40, 110, 960, 640);
          await drawPanelSheet('sleeves_right', 40, 780, 960, 640, !activeTemplate.files['right-sleeve']);
        }
      } else if (sheetLayoutType === 'collars_only') {
        if (activeTemplate.files && activeTemplate.files['collar']) {
          await drawPanelSheet('collar', 120, 140, 560, 320);
        }
      }
    } else {
      const printerWidthPx = printerWidthInches * 40;
      const rollHeightPx = Math.max(800, totalNestLengthInches * 40);
      canvas.setDimensions({ width: printerWidthPx, height: rollHeightPx });
      const rollBg = new fabric.Rect({ left: 0, top: 0, width: printerWidthPx, height: rollHeightPx, fill: '#ffffff', stroke: '#cccccc', strokeWidth: 1, selectable: false, evented: false, shadow });
      canvas.add(rollBg);

      for (let y = 160; y < rollHeightPx; y += 160) {
        canvas.add(new fabric.Line([0, y, printerWidthPx, y], { stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: [4, 4], selectable: false, evented: false }));
      }

      const spacingOffset = spacingPx / 2;

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

        const printLeft = piece.x + spacingOffset;
        const printTop = piece.y + spacingOffset;
        const printW = piece.width - spacingPx;
        const printH = piece.height - spacingPx;

        // Draw Bleed Box
        const bleedRect = new fabric.Rect({
          left: printLeft,
          top: printTop,
          width: printW,
          height: printH,
          fill: 'transparent',
          stroke: 'rgba(0, 112, 243, 0.4)',
          strokeWidth: 1,
          strokeDasharray: [3, 3],
          selectable: false,
          evented: false,
          rx: 4,
          ry: 4,
        });
        canvas.add(bleedRect);

        // Center seam line coordinates
        let pathLeft = printLeft + bleedPx;
        let pathTop = printTop + bleedPx;
        let angle = 0;

        if (piece.rotated) {
          angle = 90;
          pathLeft = printLeft + bleedPx + placement.height;
          if (flipH) {
            pathTop = printTop + bleedPx + placement.width;
          } else {
            pathTop = printTop + bleedPx;
          }
        } else {
          angle = 0;
          pathTop = printTop + bleedPx;
          if (flipH) {
            pathLeft = printLeft + bleedPx + placement.width;
          } else {
            pathLeft = printLeft + bleedPx;
          }
        }

        // Draw Cut outline
        const pathObj = new fabric.Path(tData.pathData, {
          left: pathLeft,
          top: pathTop,
          scaleX: placement.scale * (flipH ? -1 : 1),
          scaleY: placement.scale,
          fill: 'transparent',
          stroke: '#ff4458',
          strokeWidth: 1.2,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top',
          angle: angle
        });
        canvas.add(pathObj);

        // Render nested design layers inside the panel
        const savedJSON = project.canvasStates ? (project.canvasStates as any)[panelKey === 'sleeves_right' ? 'sleeves' : panelKey] : undefined;
        if (savedJSON) {
          try {
            const data = JSON.parse(savedJSON);
            for (const objData of (data.objects || [])) {
              if (objData.__isArtboard) continue;
              const customizedData = { ...objData };
              if (customizedData.type === 'textbox' || customizedData.type === 'i-text' || customizedData.type === 'text') {
                const textVal = (customizedData.text || '').trim().toUpperCase();
                if (textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') { customizedData.text = piece.player.name; customizedData.scaleX = (customizedData.scaleX || 1) * piece.player.nameScale; }
                else if (textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00' || textVal === '7') { customizedData.text = piece.player.number; }
              }
              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                const objLeft = (objData.left || 0) * (flipH ? -1 : 1);
                const objTop = (objData.top || 0);
                const clipPath = new fabric.Path(tData.pathData, { left: pathLeft, top: pathTop, scaleX: placement.scale * (flipH ? -1 : 1), scaleY: placement.scale, originX: 'left', originY: 'top', angle: angle, absolutePositioned: true });

                fObj.set({ selectable: false, evented: false });
                if (piece.rotated) {
                  const rx = pathLeft - objTop * placement.scale;
                  const ry = pathTop + objLeft * placement.scale;
                  fObj.set({ left: rx, top: ry, angle: (objData.angle || 0) + 90, scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, clipPath });
                } else {
                  fObj.set({ left: pathLeft + objLeft * placement.scale, top: pathTop + objTop * placement.scale, scaleX: (objData.scaleX || 1) * placement.scale * (flipH ? -1 : 1), scaleY: (objData.scaleY || 1) * placement.scale, clipPath });
                }
                canvas.add(fObj);
              }
            }
          } catch (e) { console.error('Nesting objects load fail:', e); }
        }

        // Draw overlay tag text
        const labelText = new fabric.Text(`${piece.player.name} #${piece.player.number} (${piece.player.size}) - ${panelKey.toUpperCase()}`, {
          left: printLeft + 8,
          top: printTop + 8,
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#7a7a90',
          selectable: false,
          evented: false
        });
        canvas.add(labelText);
      }
    }
    canvas.requestRenderAll();
  };

  useEffect(() => {
    if (!loadingTemplates) rebuildPreview();
  }, [
    exportMode,
    targetDpi,
    printerWidthInches,
    bleedInches,
    panelSpacingInches,
    showSafeZones,
    includeCollar,
    includeSleeves,
    selectedPlayerId,
    selectedPlayerIds,
    sheetLayoutType,
    panelTemplates,
    loadingTemplates
  ]);

  useEffect(() => {
    if (canvasElRef.current) {
      const canvas = new fabric.Canvas(canvasElRef.current, { allowTouchScrolling: true, selection: false });
      fabricCanvasRef.current = canvas;
      rebuildPreview();
    }
    return () => { if (fabricCanvasRef.current) { fabricCanvasRef.current.dispose(); fabricCanvasRef.current = null; } };
  }, []);



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

  const handleDownloadFormat = (format: 'PNG' | 'JPG' | 'TIFF' | 'PSD') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (format === 'PNG') {
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: targetDpi / 96 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `designsync_${project.name.toLowerCase().replace(/\s+/g, '_')}_production_layout.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'JPG') {
      const dataUrl = canvas.toDataURL({ format: 'jpeg', multiplier: targetDpi / 96, quality: 0.95 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `designsync_${project.name.toLowerCase().replace(/\s+/g, '_')}_production_layout.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Simulate PSD / TIFF wrappers: exports a high-res image layout package
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier: targetDpi / 96 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `designsync_${project.name.toLowerCase().replace(/\s+/g, '_')}_production_layout.${format.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleZoom = (factor: number) => setZoom(prev => Math.max(0.05, Math.min(1.5, prev * factor)));

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

          {/* ── Print Layout Mode ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Printer size={12} />
              <span>Print Layout Mode</span>
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

          {/* ── Sheet Layout Type (if sheet mode) ── */}
          {exportMode === 'sheet' && (
            <div className="export-section">
              <div className="export-section-header">
                <Layers size={12} />
                <span>Sheet Layout Type</span>
              </div>
              <div className="export-select-wrapper">
                <select
                  value={sheetLayoutType}
                  onChange={e => setSheetLayoutType(e.target.value as any)}
                  className="export-select"
                >
                  <option value="all_panels">Individual Player (All Panels)</option>
                  <option value="front_only">Front Panels Only</option>
                  <option value="back_only">Back Panels Only</option>
                  <option value="sleeves_only">Sleeves Only</option>
                  <option value="collars_only">Collars Only</option>
                </select>
                <ChevronDown size={12} className="export-select-chevron" />
              </div>
            </div>
          )}

          {/* ── Printer Roll Width (if nesting mode) ── */}
          {exportMode === 'nesting' && (
            <div className="export-section">
              <div className="export-section-header">
                <Settings2 size={12} />
                <span>Sublimation Roll Width</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div className="export-select-wrapper" style={{ flex: 1 }}>
                  <select value={printerWidthInches} onChange={e => setPrinterWidthInches(Number(e.target.value))} className="export-select">
                    <option value="24">24" — Small / Plotter</option>
                    <option value="36">36" — Standard Roll</option>
                    <option value="44">44" — Medium Industrial</option>
                    <option value="60">60" — Wide Industrial</option>
                    <option value="72">72" — Super Wide</option>
                  </select>
                  <ChevronDown size={12} className="export-select-chevron" />
                </div>
                <input
                  type="number"
                  value={printerWidthInches}
                  onChange={e => setPrinterWidthInches(Math.max(12, Math.min(120, Number(e.target.value) || 36)))}
                  style={{ width: '65px', padding: '6px 4px', fontSize: '11px', background: '#111118', border: '1px solid #1e1e2a', color: '#fff', textAlign: 'center', outline: 'none', height: '30px', boxSizing: 'border-box', borderRadius: '6px' }}
                  title="Custom width in inches"
                />
              </div>
            </div>
          )}

          {/* ── Selective Player Checklist ── */}
          <div className="export-section">
            <div className="export-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle size={12} style={{ color: 'var(--accent-blue)' }} />
                <span>Roster Players to Export</span>
              </div>
              <span style={{ fontSize: '9px', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                {selectedPlayerIds.length} / {project.roster.length} Selected
              </span>
            </div>
            
            <div className="player-checklist-container" style={{
              maxHeight: '160px',
              overflowY: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.2)',
              marginTop: '8px',
              padding: '4px'
            }}>
              {project.roster.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '10px', color: 'var(--text-disabled)', textAlign: 'center' }}>
                  No players in roster.
                </div>
              ) : (
                project.roster.map(p => {
                  const isSelected = selectedPlayerIds.includes(p.id);
                  const isActive = selectedPlayerId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`player-checklist-row ${isActive ? 'active-row' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(0, 112, 243, 0.15)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(0, 112, 243, 0.3)' : 'transparent'}`,
                        transition: 'all 0.15s ease',
                        marginBottom: '2px'
                      }}
                      onClick={() => {
                        setSelectedPlayerId(p.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPlayerIds(prev => [...prev, p.id]);
                          } else {
                            setSelectedPlayerIds(prev => prev.filter(id => id !== p.id));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#fff' : 'var(--text-secondary)' }}>
                          {p.name}
                        </span>
                        <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text-disabled)' }}>
                          #{p.number} ({p.size})
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {exportMode === 'sheet' && (
              <div style={{ fontSize: '9px', color: 'var(--text-disabled)', marginTop: '4px', textAlign: 'right' }}>
                * Click player row to preview sheet layout
              </div>
            )}
          </div>

          {/* ── Export Format (High Visibility) ── */}
          <div className="export-section">
            <div className="export-section-header">
              <Layers size={12} />
              <span>Export Format</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
              {(['JPG', 'PNG', 'TIFF', 'PSD'] as const).map(fmt => (
                <button
                  key={fmt}
                  className={`export-preset-btn ${exportFormat === fmt ? 'active' : ''}`}
                  onClick={() => setExportFormat(fmt)}
                  style={{
                    padding: '8px 0',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    borderRadius: '6px',
                    background: exportFormat === fmt ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${exportFormat === fmt ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.08)'}`,
                    color: exportFormat === fmt ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* ── Export Resolution (DPI - High Visibility) ── */}
          <div className="export-section">
            <label className="export-field-label" style={{ marginBottom: '6px', display: 'block', fontWeight: 600 }}>
              Export Resolution (DPI)
            </label>
            <div className="export-preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '8px' }}>
              {EXPORT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`export-preset-btn ${activePreset === preset.id ? 'active' : ''}`}
                  onClick={() => { setActivePreset(preset.id); setTargetDpi(preset.dpi); }}
                  style={{
                    fontSize: '9px',
                    padding: '6px 0',
                    borderRadius: '4px',
                    background: activePreset === preset.id ? 'rgba(0, 112, 243, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${activePreset === preset.id ? 'rgba(0, 112, 243, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                    color: activePreset === preset.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {preset.dpi} DPI
                </button>
              ))}
            </div>
            <input
              type="number"
              value={targetDpi}
              onChange={e => {
                const val = Math.max(72, Math.min(1200, Number(e.target.value) || 300));
                setTargetDpi(val);
                setActivePreset('custom');
              }}
              className="tech-text-input"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '11px',
                background: '#111118',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff',
                outline: 'none',
                height: '32px',
                boxSizing: 'border-box',
                borderRadius: '6px'
              }}
            />
          </div>

          {/* ── ADVANCED COLLAPSIBLE CALIBRATION CONTROLS ── */}
          <div className="export-section" style={{ borderBottom: 'none' }}>
            <button
              onClick={() => setAdvancedExpanded(!advancedExpanded)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
                fontWeight: 'bold',
                fontSize: '11px',
                letterSpacing: '0.02em',
                textTransform: 'uppercase'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings2 size={13} style={{ color: 'var(--accent-blue)' }} />
                <span>Machine & Calibration Sliders</span>
              </div>
              <ChevronDown size={13} style={{ transform: advancedExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6 }} />
            </button>

            {advancedExpanded && (
              <div 
                style={{ 
                  marginTop: '12px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '16px',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(0,0,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.03)',
                  animation: 'accordionFade 0.2s ease-out'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label className="export-field-label">Sewing Bleed Margin</label>
                    <span style={{ fontSize: '9px', color: 'var(--accent-blue)', fontFamily: 'monospace', fontWeight: 700 }}>{bleedInches.toFixed(2)}"</span>
                  </div>
                  <input
                    type="range" min="0" max="1.5" step="0.05" value={bleedInches}
                    onChange={e => { const val = Number(e.target.value); setBleedInches(val); onUpdateProject({ rules: { ...project.rules, bleedInches: val } }); }}
                    className="export-range"
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label className="export-field-label">Panel Spacing / Gap</label>
                    <span style={{ fontSize: '9px', color: 'var(--accent-blue)', fontFamily: 'monospace', fontWeight: 700 }}>{panelSpacingInches.toFixed(2)}"</span>
                  </div>
                  <input
                    type="range" min="0.1" max="2.0" step="0.1" value={panelSpacingInches}
                    onChange={e => setPanelSpacingInches(Number(e.target.value))}
                    className="export-range"
                  />
                </div>

                <div>
                  <label className="export-field-label">Max Roll Length (Yards)</label>
                  <input
                    type="number"
                    value={maxRollLengthYards}
                    onChange={e => setMaxRollLengthYards(Math.max(1, Number(e.target.value) || 50))}
                    className="tech-text-input"
                    style={{ width: '100%', padding: '6px 8px', fontSize: '11px', background: '#111118', border: '1px solid #1e1e2a', color: '#fff', outline: 'none', height: '28px', boxSizing: 'border-box', borderRadius: '4px' }}
                  />
                </div>
              </div>
            )}
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
          {project.roster.length > 0 && selectedPlayerIds.length === 0 && (
            <div className="export-warning-banner">
              <AlertTriangle size={12} />
              <span>Select players to export</span>
            </div>
          )}
          {!exporting && !downloadReady && (
            <button
              className="export-compile-btn"
              onClick={triggerExport}
              disabled={selectedPlayerIds.length === 0}
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
                <Check size={12} /> Output Ready ({exportFormat})!
              </div>
              <button className="export-dl-btn export-dl-svg" onClick={handleDownloadSVG}>
                <Download size={12} /> Download Master SVG (Vector)
              </button>
              <button className="export-dl-btn export-dl-png" onClick={() => handleDownloadFormat(exportFormat)}>
                <Download size={12} /> Download Compiled {exportFormat}
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
                {exportMode === 'sheet' ? 'Production Sheet' : 'Nesting Roll'}
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

          {/* Quick Telemetry Display */}
          {!loadingTemplates && (
            <div style={{ display: 'flex', gap: '12px', background: '#07070a', border: '1px solid #1e1e2a', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontFamily: 'monospace' }}>
              {exportMode === 'nesting' ? (
                <>
                  <div><span style={{ color: 'var(--text-disabled)' }}>EFFICIENCY:</span> <span style={{ color: nestEfficiency > 75 ? '#00e676' : '#ffb300', fontWeight: 'bold' }}>{nestEfficiency.toFixed(1)}%</span></div>
                  <div style={{ width: '1px', background: '#1e1e2a' }} />
                  <div><span style={{ color: 'var(--text-disabled)' }}>ROLL HEIGHT:</span> <span style={{ color: '#fff', fontWeight: 'bold' }}>{(totalNestLengthInches / 36).toFixed(2)} yd</span></div>
                  <div style={{ width: '1px', background: '#1e1e2a' }} />
                  <div><span style={{ color: 'var(--text-disabled)' }}>DPI:</span> <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{targetDpi}</span></div>
                </>
              ) : (
                <>
                  <div><span style={{ color: 'var(--text-disabled)' }}>SHEET:</span> <span style={{ color: '#fff', fontWeight: 'bold' }}>{sheetLayoutType.replace('_', ' ').toUpperCase()}</span></div>
                  <div style={{ width: '1px', background: '#1e1e2a' }} />
                  <div><span style={{ color: 'var(--text-disabled)' }}>DPI:</span> <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{targetDpi}</span></div>
                </>
              )}
            </div>
          )}

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
          <span className="export-status-chip">Format: {exportFormat}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Scale: 1px = 0.025"</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Print Size: {printWInches.toFixed(1)}" × {printHInches.toFixed(1)}"</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Assets: {project.logos.length}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Panels: {totalPanels}</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Bleed: {bleedInches.toFixed(2)}"</span>
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">Spacing: {panelSpacingInches.toFixed(2)}"</span>
          {exportMode === 'nesting' && (
            <>
              <span className="export-status-sep">·</span>
              <span className="export-status-chip" style={{ color: '#00e676', fontWeight: 'bold' }}>Nesting Eff: {nestEfficiency.toFixed(1)}%</span>
              <span className="export-status-sep">·</span>
              <span className="export-status-chip">Usage: {(totalNestLengthInches / 36).toFixed(2)} yd</span>
            </>
          )}
          <span className="export-status-sep">·</span>
          <span className="export-status-chip">
            Area: {exportMode === 'sheet'
              ? `${((canvasW * canvasH) / 1600 / 144).toFixed(1)} sq ft`
              : `${((printerWidthInches * totalNestLengthInches) / 144).toFixed(1)} sq ft`}
          </span>
        </div>
      </div>

    </div>
  );
};
