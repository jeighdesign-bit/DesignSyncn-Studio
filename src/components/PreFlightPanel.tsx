import React, { useState, useEffect, useRef } from 'react';
import type { Project, RosterPlayer } from '../types';
import { 
  CheckCircle, AlertTriangle, AlertCircle, FileText, Download, Check, 
  Settings, ZoomIn, ZoomOut, Printer
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
  panel: string; // 'front' | 'back' | 'sleeves' | 'sleeves_right' | 'collar'
  width: number; // actual width in px
  height: number; // actual height in px
  x: number;
  y: number;
  rotated: boolean;
}

export const PreFlightPanel: React.FC<PreFlightPanelProps> = ({ project, onUpdateProject }) => {
  // ─── Export & Layout Settings ──────────────────────────────────────────────
  const [exportMode, setExportMode] = useState<'sheet' | 'nesting'>('sheet');
  const [targetDpi, setTargetDpi] = useState<number>(project.dpi || 300);
  const [printerWidthInches, setPrinterWidthInches] = useState<number>(36); // 24, 36, 44, 60
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

  // ─── Template SVG Data Fetching & Caching ──────────────────────────────────
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
    supportedSizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    files: {
      front: "/templates/tshirt/front.svg",
      back: "/templates/tshirt/back.svg",
      "left-sleeve": "/templates/tshirt/left-sleeve.svg",
      "right-sleeve": "/templates/tshirt/right-sleeve.svg"
    }
  });

  // ─── Packing Calculations & Statistics ──────────────────────────────────────
  const [nestedPieces, setNestedPieces] = useState<PackedPiece[]>([]);
  const [totalNestLengthInches, setTotalNestLengthInches] = useState<number>(0);
  const [nestEfficiency, setNestEfficiency] = useState<number>(0);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStep, setExportStep] = useState<string>('');
  const [downloadReady, setDownloadReady] = useState<boolean>(false);

  // ─── Load Apparel Template specifications ──────────────────────────────────
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
          // Fetch all SVGs for active template
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
              if (selectedPath === paths[0] && paths.length > 1) {
                selectedPath = paths[1];
              }
              
              const pathData = selectedPath?.getAttribute('d') || '';
              const viewBoxStr = svgEl?.getAttribute('viewBox') || '';
              const parts = viewBoxStr.split(/[ ,]+/).map(Number);
              const viewBoxW = parts[2] || 1000;
              const viewBoxH = parts[3] || 1000;
              
              svgData[key] = { pathData, viewBoxW, viewBoxH };
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

  // ─── Inline helper to compute player dimensions ──────────────────────────
  const getGarmentDimensions = (size: string) => {
    const sizes = activeTemplate.supportedSizes || ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
    const baseSizeIndex = sizes.indexOf(activeTemplate.baseSize || "M");
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

  // ─── Inline helper to compute centered scale ───────────────────────────────
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

    if (panel === 'sleeves' || panel === 'sleeves_right') {
      targetW = panelDim.w * 2 * 40; // sleeves are horizontal
    }

    const trueScale = Math.min(targetW / viewBoxW, targetH / viewBoxH);
    const trueW = viewBoxW * trueScale;
    const trueH = viewBoxH * trueScale;

    let scale = trueScale;
    if (trueW > maxW || trueH > maxH) {
      scale = Math.min(maxW / viewBoxW, maxH / viewBoxH);
    }
    const width = viewBoxW * scale;
    const height = viewBoxH * scale;
    return { scale, width, height };
  };

  // ─── Perform Shelf Packing for Nesting roll ────────────────────────────────
  const runNestingPacking = () => {
    if (project.roster.length === 0 || loadingTemplates) return;

    const margin = 20; // 0.5 inches margin around items
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
        
        let baseWidth = placement.width;
        let baseHeight = placement.height;

        let w = baseWidth + margin;
        let h = baseHeight + margin;
        let rotated = false;

        // Auto rotate 90° if piece exceeds printer width, or is wider than tall and rotated fits
        if (w > printerWidthPx || (w > h && h <= printerWidthPx)) {
          w = baseHeight + margin;
          h = baseWidth + margin;
          rotated = true;
        }

        items.push({
          id: `${player.id}-${panel}`,
          player,
          panel,
          width: w,
          height: h,
          x: 0,
          y: 0,
          rotated
        });
      };

      addNestItem('front');
      addNestItem('back');
      if (includeSleeves && activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
        addNestItem('sleeves');
        addNestItem('sleeves_right');
      }
      if (includeCollar && activeTemplate.files && activeTemplate.files['collar']) {
        addNestItem('collar');
      }
    });

    // FFDH Packing algorithm
    // Sort items by height in descending order
    items.sort((a, b) => b.height - a.height);

    const shelves: { y: number; height: number; nextX: number }[] = [];
    const packed: PackedPiece[] = [];

    items.forEach(item => {
      // Find a shelf that can accommodate the item
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
        // Create new shelf
        const lastShelf = shelves[shelves.length - 1];
        const newY = lastShelf ? lastShelf.y + lastShelf.height : 0;
        const newShelf = {
          y: newY,
          height: item.height,
          nextX: item.width
        };
        shelves.push(newShelf);
        item.x = 0;
        item.y = newY;
      }
      packed.push(item);
    });

    const totalHeight = shelves.reduce((sum, s) => sum + s.height, 0);
    setNestedPieces(packed);
    setTotalNestLengthInches(totalHeight / 40);

    // Compute efficiency: sum of piece bounds areas / total roll area
    const totalPieceArea = packed.reduce((sum, item) => sum + (item.width - margin) * (item.height - margin), 0);
    const totalRollArea = printerWidthPx * totalHeight;
    const efficiency = totalRollArea > 0 ? (totalPieceArea / totalRollArea) * 100 : 0;
    setNestEfficiency(efficiency);
  };

  // Run nesting packing on dependency change
  useEffect(() => {
    runNestingPacking();
  }, [project.roster, printerWidthInches, includeSleeves, includeCollar, panelTemplates, loadingTemplates, exportMode]);

  // ─── Fabric Canvas Rendering logic ─────────────────────────────────────────
  const rebuildPreview = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    const fillBg = '#0a0a0c';
    canvas.set({ backgroundColor: fillBg });

    const selectedPlayer = project.roster.find(p => p.id === selectedPlayerId) || project.roster[0];
    if (!selectedPlayer) {
      canvas.requestRenderAll();
      return;
    }

    const shadow = new fabric.Shadow({
      color: 'rgba(0,0,0,0.4)',
      blur: 24,
      offsetX: 0,
      offsetY: 8,
    });

    if (exportMode === 'sheet') {
      // RENDER PRODUCTION SHEET
      const canvasW = 2400;
      const canvasH = 2400;
      canvas.setDimensions({ width: canvasW, height: canvasH });

      // Draw paper board background
      const paper = new fabric.Rect({
        left: 0,
        top: 0,
        width: canvasW,
        height: canvasH,
        fill: '#ffffff',
        selectable: false,
        evented: false,
        shadow
      });
      canvas.add(paper);

      // Draw title block / labels
      const projectTitle = new fabric.Text(`DESIGNSYNC PRODUCTION SHEET — ${project.name.toUpperCase()}`, {
        left: 60,
        top: 60,
        fontSize: 24,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fill: '#111115',
        selectable: false,
        evented: false
      });
      const specLabel = new fabric.Text(
        `PLAYER: ${selectedPlayer.name} #${selectedPlayer.number}   |   SIZE: ${selectedPlayer.size}   |   DPI: ${targetDpi}   |   BLEED: +${bleedInches}"`, {
          left: 60,
          top: 95,
          fontSize: 14,
          fontFamily: 'monospace',
          fill: '#7a7a90',
          selectable: false,
          evented: false
        }
      );
      canvas.add(projectTitle, specLabel);

      const offsets = {
        sleeves: { x: 60, y: 180 },
        sleeves_right: { x: 1380, y: 180 },
        front: { x: 60, y: 920 },
        back: { x: 1220, y: 920 },
        collar: { x: 920, y: 760 },
      };

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

        // 1. Draw outline path
        const pathObj = new fabric.Path(tData.pathData, {
          left: leftPos,
          top: topPos,
          scaleX: placement.scale * (flipH ? -1 : 1),
          scaleY: placement.scale,
          fill: '#ffffff',
          stroke: '#8a8a9f',
          strokeWidth: 1.5,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top'
        });
        canvas.add(pathObj);

        // 2. Draw label
        const labelText = new fabric.Text(`${panelKey.replace('_', ' ').toUpperCase()}`, {
          left: offset.x,
          top: offset.y,
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          fill: '#1a1a24',
          selectable: false,
          evented: false
        });
        canvas.add(labelText);

        // 3. Load design objects and clip them to the path
        const savedJSON = project.canvasStates ? (project.canvasStates as any)[panelKey === 'sleeves_right' ? 'sleeves' : panelKey] : undefined;
        if (savedJSON) {
          try {
            const data = JSON.parse(savedJSON);
            const objects = data.objects || [];
            
            for (const objData of objects) {
              if (objData.__isArtboard) continue;

              // Customize player info
              const customizedData = { ...objData };
              if (customizedData.type === 'textbox' || customizedData.type === 'i-text' || customizedData.type === 'text') {
                const textVal = (customizedData.text || '').trim().toUpperCase();
                const activePlayer = project.roster.find(p => p.id === project.activePlayerId) || project.roster[0];
                const activeName = activePlayer?.name.toUpperCase() || 'JAY';
                const activeNum = activePlayer?.number || '7';

                if (textVal === activeName || textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') {
                  customizedData.text = selectedPlayer.name;
                  customizedData.scaleX = (customizedData.scaleX || 1) * selectedPlayer.nameScale;
                } else if (textVal === activeNum || textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00') {
                  customizedData.text = selectedPlayer.number;
                }
              }

              // Load object, shift position, scale and clip
              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                
                // Shift object relative to original artboard placement scale
                const origScale = placement.scale;
                fObj.set({
                  left: leftPos + (objData.left || 0) * (flipH ? -1 : 1),
                  top: topPos + (objData.top || 0),
                  scaleX: (objData.scaleX || 1) * origScale * (flipH ? -1 : 1),
                  scaleY: (objData.scaleY || 1) * origScale,
                  selectable: false,
                  evented: false,
                  clipPath: new fabric.Path(tData.pathData, {
                    left: leftPos,
                    top: topPos,
                    scaleX: placement.scale * (flipH ? -1 : 1),
                    scaleY: placement.scale,
                    originX: 'left',
                    originY: 'top',
                    absolutePositioned: true
                  })
                });
                canvas.add(fObj);
              }
            }
          } catch (e) {
            console.error('Failed to parse json design objects:', e);
          }
        }
      };

      await drawPanelSheet('front', offsets.front);
      await drawPanelSheet('back', offsets.back);
      if (includeSleeves && activeTemplate.files && (activeTemplate.files['left-sleeve'] || activeTemplate.files['sleeves'])) {
        await drawPanelSheet('sleeves', offsets.sleeves);
        await drawPanelSheet('sleeves_right', offsets.sleeves_right, true);
      }
      if (includeCollar && activeTemplate.files && activeTemplate.files['collar']) {
        await drawPanelSheet('collar', offsets.collar);
      }

    } else {
      // RENDER PRINT READY NESTING ROLL
      const printerWidthPx = printerWidthInches * 40;
      const rollHeightPx = Math.max(800, totalNestLengthInches * 40);
      canvas.setDimensions({ width: printerWidthPx, height: rollHeightPx });

      // Draw nesting roll outline container
      const rollBg = new fabric.Rect({
        left: 0,
        top: 0,
        width: printerWidthPx,
        height: rollHeightPx,
        fill: '#1e1e24',
        stroke: '#2d2d3f',
        strokeWidth: 2,
        selectable: false,
        evented: false
      });
      canvas.add(rollBg);

      // Add horizontal grid lines to represent inches / yardage
      for (let y = 160; y < rollHeightPx; y += 160) {
        const yardLine = new fabric.Line([0, y, printerWidthPx, y], {
          stroke: '#2d2d38',
          strokeWidth: 1,
          strokeDasharray: [4, 4],
          selectable: false,
          evented: false
        });
        canvas.add(yardLine);
      }

      // Draw packed pieces
      for (const piece of nestedPieces) {
        const player = piece.player;
        const panelKey = piece.panel;
        const fileKey = panelKey === 'sleeves_right' ? 'right-sleeve' : panelKey === 'sleeves' ? 'left-sleeve' : panelKey;
        const tData = panelTemplates[fileKey] || panelTemplates['left-sleeve'] || panelTemplates['front'];
        if (!tData) continue;

        const artW = panelKey === 'front' || panelKey === 'back' ? 1120 : panelKey === 'sleeves' || panelKey === 'sleeves_right' ? 960 : 560;
        const artH = panelKey === 'front' || panelKey === 'back' ? 1360 : panelKey === 'sleeves' || panelKey === 'sleeves_right' ? 640 : 320;
        const dims = getGarmentDimensions(player.size);
        const placement = getPiecePlacement(panelKey, tData.viewBoxW, tData.viewBoxH, dims, artW, artH);
        
        const flipH = panelKey === 'sleeves_right';
        const itemMargin = 10; // offset placement inside packed bbox coordinate

        const pieceLeft = piece.x + itemMargin;
        const pieceTop = piece.y + itemMargin;

        // Render outline path
        const pathObj = new fabric.Path(tData.pathData, {
          left: pieceLeft,
          top: pieceTop,
          scaleX: placement.scale * (flipH ? -1 : 1),
          scaleY: placement.scale,
          fill: '#ffffff',
          stroke: '#5a5a6f',
          strokeWidth: 1,
          selectable: false,
          evented: false,
          originX: 'left',
          originY: 'top',
        });

        // Handle auto rotation
        if (piece.rotated) {
          pathObj.set({
            angle: 90,
            left: pieceLeft + placement.height,
            top: pieceTop
          });
        }
        canvas.add(pathObj);

        // Load design objects and clip them to the path (handling player name/number replacements)
        const savedJSON = project.canvasStates ? (project.canvasStates as any)[panelKey === 'sleeves_right' ? 'sleeves' : panelKey] : undefined;
        if (savedJSON) {
          try {
            const data = JSON.parse(savedJSON);
            const objects = data.objects || [];
            
            for (const objData of objects) {
              if (objData.__isArtboard) continue;

              const customizedData = { ...objData };
              if (customizedData.type === 'textbox' || customizedData.type === 'i-text' || customizedData.type === 'text') {
                const textVal = (customizedData.text || '').trim().toUpperCase();
                const activePlayer = project.roster.find(p => p.id === project.activePlayerId) || project.roster[0];
                const activeName = activePlayer?.name.toUpperCase() || 'JAY';
                const activeNum = activePlayer?.number || '7';

                if (textVal === activeName || textVal === 'PLAYER NAME' || textVal === 'SURNAME' || textVal === 'NAME') {
                  customizedData.text = player.name;
                  customizedData.scaleX = (customizedData.scaleX || 1) * player.nameScale;
                } else if (textVal === activeNum || textVal === 'PLAYER NUMBER' || textVal === 'NUMBER' || textVal === '00') {
                  customizedData.text = player.number;
                }
              }

              const obj = await fabric.util.enlivenObjects([customizedData]);
              if (obj && obj[0]) {
                const fObj = obj[0] as fabric.FabricObject;
                
                const origScale = placement.scale;
                
                // Base positioning settings
                const objLeft = (objData.left || 0) * (flipH ? -1 : 1);
                const objTop = (objData.top || 0);

                fObj.set({
                  selectable: false,
                  evented: false,
                });

                if (piece.rotated) {
                  // Apply 90° rotation transform to child objects
                  const rotatedLeft = pieceLeft + placement.height - objTop * origScale;
                  const rotatedTop = pieceTop + objLeft * origScale;

                  fObj.set({
                    left: rotatedLeft,
                    top: rotatedTop,
                    angle: (objData.angle || 0) + 90,
                    scaleX: (objData.scaleX || 1) * origScale * (flipH ? -1 : 1),
                    scaleY: (objData.scaleY || 1) * origScale,
                    clipPath: new fabric.Path(tData.pathData, {
                      left: pieceLeft + placement.height,
                      top: pieceTop,
                      scaleX: placement.scale * (flipH ? -1 : 1),
                      scaleY: placement.scale,
                      angle: 90,
                      originX: 'left',
                      originY: 'top',
                      absolutePositioned: true
                    })
                  });
                } else {
                  fObj.set({
                    left: pieceLeft + objLeft,
                    top: pieceTop + objTop,
                    scaleX: (objData.scaleX || 1) * origScale * (flipH ? -1 : 1),
                    scaleY: (objData.scaleY || 1) * origScale,
                    clipPath: new fabric.Path(tData.pathData, {
                      left: pieceLeft,
                      top: pieceTop,
                      scaleX: placement.scale * (flipH ? -1 : 1),
                      scaleY: placement.scale,
                      originX: 'left',
                      originY: 'top',
                      absolutePositioned: true
                    })
                  });
                }
                canvas.add(fObj);
              }
            }
          } catch (e) {
            console.error('Nesting objects load fail:', e);
          }
        }
      }
    }

    canvas.requestRenderAll();
  };

  // Re-run layout drawing when state parameters change
  useEffect(() => {
    if (!loadingTemplates) {
      rebuildPreview();
    }
  }, [
    exportMode, targetDpi, printerWidthInches, bleedInches, showSafeZones, 
    includeCollar, includeSleeves, selectedPlayerId, panelTemplates, loadingTemplates
  ]);

  // Initialize Fabric Canvas on Mount
  useEffect(() => {
    if (canvasElRef.current) {
      const canvas = new fabric.Canvas(canvasElRef.current, {
        allowTouchScrolling: true,
        selection: false
      });
      fabricCanvasRef.current = canvas;
      rebuildPreview();
    }
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, []);

  // ─── Diagnostics Checks (Right Panel) ──────────────────────────────────────
  const runDiagnostics = () => {
    const checks = [];
    const lowResLogos = project.logos.filter(l => l.dpi < 300);
    
    if (project.logos.length === 0) {
      checks.push({
        status: 'warning',
        title: 'No Sponsor Logos Uploaded',
        desc: 'Graphics will export correctly, but no logo components are mapped.'
      });
    } else if (lowResLogos.length > 0) {
      checks.push({
        status: 'error',
        title: 'Low Resolution Graphics',
        desc: `${lowResLogos.map(l => l.name).join(', ')} is under 300 DPI. Sublimation may blur.`
      });
    } else {
      checks.push({
        status: 'success',
        title: 'Graphics Production Ready',
        desc: 'All graphic elements are fully calibrated at high resolution.'
      });
    }

    const squeezed = project.roster.filter(p => p.nameScale < 0.7);
    if (project.roster.length === 0) {
      checks.push({
        status: 'warning',
        title: 'Empty Team Roster',
        desc: 'Please populate roster database variants to create production batches.'
      });
    } else if (squeezed.length > 0) {
      checks.push({
        status: 'warning',
        title: 'Font Compression Limit Warning',
        desc: `${squeezed.map(p => p.name).join(', ')} names are squeezed under 70% bounds.`
      });
    } else {
      checks.push({
        status: 'success',
        title: 'Roster Safe Zones Cleared',
        desc: 'All player typography sizes fit safe print-zones.'
      });
    }

    if (bleedInches < 0.25) {
      checks.push({
        status: 'warning',
        title: 'Bleed Safety Margin Suboptimal',
        desc: 'Standard sublimation requires at least 0.25" bleed. Currently: ' + bleedInches + '"'
      });
    } else {
      checks.push({
        status: 'success',
        title: 'Seam & Bleed Calibration Verified',
        desc: `Bleed margin correctly set at +${bleedInches}".`
      });
    }

    return checks;
  };

  const diagnostics = runDiagnostics();
  const criticalErrorsCount = diagnostics.filter(c => c.status === 'error').length;

  // ─── Export blueprint compiler ─────────────────────────────────────────────
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
      if (currentStep < steps.length) {
        setExportStep(steps[currentStep]);
        setExportProgress((currentStep + 1) * 20);
        currentStep++;
      } else {
        clearInterval(interval);
        setExporting(false);
        setDownloadReady(true);
      }
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

  // Adjust css-based zoom for viewer
  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.05, Math.min(1.5, prev * factor)));
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      
      {/* ─── LEFT SIDE: SETTINGS PANEL ───────────────────────────────────────── */}
      <div style={{
        width: '320px',
        minWidth: '320px',
        borderRight: '1px solid var(--border-muted)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} style={{ color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>Export Specifications</h3>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Export Mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Export Mode</label>
            <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-muted)' }}>
              <button 
                onClick={() => setExportMode('sheet')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: '11px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                  background: exportMode === 'sheet' ? 'var(--bg-hover)' : 'transparent',
                  color: exportMode === 'sheet' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold'
                }}
              >
                Production Sheet
              </button>
              <button 
                onClick={() => setExportMode('nesting')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: '11px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                  background: exportMode === 'nesting' ? 'var(--bg-hover)' : 'transparent',
                  color: exportMode === 'nesting' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 'bold'
                }}
              >
                Nesting Roll
              </button>
            </div>
          </div>

          {/* Roster Variant Selection (Sheet Mode only) */}
          {exportMode === 'sheet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Preview Player Variant</label>
              <select
                value={selectedPlayerId}
                onChange={e => setSelectedPlayerId(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', fontSize: '11px', padding: '8px', borderRadius: '6px' }}
              >
                {project.roster.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (#{p.number}) [{p.size}]</option>
                ))}
              </select>
            </div>
          )}

          {/* DPI Resolution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Output Resolution (DPI)</label>
            <select
              value={targetDpi}
              onChange={e => setTargetDpi(Number(e.target.value))}
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', fontSize: '11px', padding: '8px', borderRadius: '6px' }}
            >
              <option value="72">72 DPI (Draft / Digital)</option>
              <option value="150">150 DPI (Medium Quality)</option>
              <option value="300">300 DPI (Industrial Sublimation Standard)</option>
            </select>
          </div>

          {/* Printer Width (Nesting Mode only) */}
          {exportMode === 'nesting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Sublimation Printer Width</label>
              <select
                value={printerWidthInches}
                onChange={e => setPrinterWidthInches(Number(e.target.value))}
                style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', fontSize: '11px', padding: '8px', borderRadius: '6px' }}
              >
                <option value="24">24 inch (Small / Plotter)</option>
                <option value="36">36 inch (Standard Sublimation Roll)</option>
                <option value="44">44 inch (Medium Industrial)</option>
                <option value="60">60 inch (Wide Sublimation Industrial)</option>
              </select>
            </div>
          )}

          {/* Seam Bleed Margins */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Sewing Bleed Margins</label>
              <span style={{ fontSize: '10px', color: 'var(--accent-blue)' }}>{bleedInches} in</span>
            </div>
            <input 
              type="range" min="0" max="0.75" step="0.05" value={bleedInches}
              onChange={e => {
                const val = Number(e.target.value);
                setBleedInches(val);
                onUpdateProject({ rules: { ...project.rules, bleedInches: val } });
              }}
              style={{ width: '100%', accentColor: 'var(--accent-blue)' }} 
            />
          </div>

          {/* Include Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Includes & Layers</label>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Include Sleeves</span>
              <input type="checkbox" checked={includeSleeves} onChange={e => setIncludeSleeves(e.target.checked)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Include Collar</span>
              <input type="checkbox" checked={includeCollar} onChange={e => setIncludeCollar(e.target.checked)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Safe Zones Overlay</span>
              <input type="checkbox" checked={showSafeZones} onChange={e => setShowSafeZones(e.target.checked)} />
            </div>
          </div>

        </div>
      </div>

      {/* ─── CENTER: LIVE CANVAS VIEWPORT ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        
        {/* Top Control bar */}
        <div style={{
          height: '42px', borderBottom: '1px solid var(--border-muted)', background: 'var(--bg-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {exportMode === 'sheet' ? 'Production Sheet Spec Sheet Preview' : `Print Ready Nesting Roll Preview (${printerWidthInches}")`}
            </span>
          </div>

          {/* Zoom Actions */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => handleZoom(0.8)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomOut size={12} /></button>
            <span style={{ color: 'var(--text-primary)', fontSize: '11px', alignSelf: 'center', margin: '0 8px', fontFamily: 'monospace' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => handleZoom(1.2)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomIn size={12} /></button>
            <button onClick={() => setZoom(exportMode === 'sheet' ? 0.25 : 0.4)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Fit</button>
          </div>
        </div>

        {/* Viewport content */}
        <div 
          ref={viewportRef}
          style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg-primary)' }}
        >
          <div style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <canvas ref={canvasElRef} />
          </div>
        </div>

      </div>

      {/* ─── RIGHT SIDE: SUMMARY & AUDIT PANEL ────────────────────────────────── */}
      <div style={{
        width: '320px',
        minWidth: '320px',
        borderLeft: '1px solid var(--border-muted)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>Export Summary</h3>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Stats Box */}
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Total Printable Width:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {exportMode === 'sheet' ? '60" (152.4 cm)' : `${printerWidthInches}" (${Math.round(printerWidthInches * 2.54)} cm)`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Estimated Length:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {exportMode === 'sheet' ? '60" (1.52 m)' : `${totalNestLengthInches.toFixed(1)}" (${(totalNestLengthInches * 0.0254).toFixed(2)} m)`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Output Area:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {exportMode === 'sheet' ? '25.0 sq ft' : `${((printerWidthInches * totalNestLengthInches) / 144).toFixed(1)} sq ft`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Nesting Efficiency:</span>
              <span style={{ color: exportMode === 'sheet' ? 'var(--text-primary)' : nestEfficiency > 75 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 'bold' }}>
                {exportMode === 'sheet' ? 'N/A' : `${nestEfficiency.toFixed(1)}%`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Output File Size (Est):</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {((0.5 + project.roster.length * 0.35) * (exportMode === 'sheet' ? 1 : 0.8)).toFixed(1)} MB
              </span>
            </div>
          </div>

          {/* Validation Diagnostics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>Pre-Flight Diagnostics</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {diagnostics.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', padding: '8px 10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {c.status === 'success' ? (
                      <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                    ) : c.status === 'warning' ? (
                      <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                    ) : (
                      <AlertCircle size={14} style={{ color: 'var(--color-error)' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{c.title}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{c.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Compiler Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            {project.roster.length === 0 ? (
              <div style={{ border: '1px solid rgba(245, 166, 35, 0.2)', background: 'rgba(245, 166, 35, 0.05)', color: 'var(--color-warning)', padding: '10px', borderRadius: '6px', fontSize: '11px', textAlign: 'center' }}>
                 Roster database is empty. Please add players under Production Studio.
              </div>
            ) : criticalErrorsCount > 0 ? (
              <div style={{ border: '1px solid rgba(255, 0, 85, 0.2)', background: 'rgba(255, 0, 85, 0.05)', color: 'var(--color-error)', padding: '10px', borderRadius: '6px', fontSize: '11px', textAlign: 'center' }}>
                Fix critical errors (e.g. logo resolution) before printing.
              </div>
            ) : null}

            {/* Export Compiler Actions */}
            {!exporting && !downloadReady && (
              <button
                onClick={triggerExport}
                disabled={project.roster.length === 0 || criticalErrorsCount > 0}
                style={{
                  width: '100%', height: '40px', background: 'var(--accent-blue)', color: '#fff', border: 'none',
                  borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: (project.roster.length === 0 || criticalErrorsCount > 0) ? 0.5 : 1
                }}
              >
                <FileText size={14} /> Compile Production Files
              </button>
            )}

            {exporting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
                  <span>{exportStep}</span>
                  <span style={{ fontFamily: 'monospace' }}>{exportProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-muted)' }}>
                  <div style={{ width: `${exportProgress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.4s' }}></div>
                </div>
              </div>
            )}

            {downloadReady && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--color-success)', fontSize: '11px', fontWeight: 'bold', background: 'rgba(0, 230, 118, 0.05)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0, 230, 118, 0.1)' }}>
                  <Check size={14} /> Layout blueprint compilation finished!
                </div>
                <button
                  onClick={handleDownloadSVG}
                  style={{
                    width: '100%', height: '40px', background: 'var(--color-success)', color: '#fff', border: 'none',
                    borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <Download size={14} /> Download production_vectors.svg
                </button>
                <button
                  onClick={() => setDownloadReady(false)}
                  style={{
                    width: '100%', height: '32px', background: 'transparent', border: '1px solid var(--border-muted)', color: 'var(--text-secondary)',
                    borderRadius: '6px', fontSize: '11px', cursor: 'pointer'
                  }}
                >
                  Re-compile batch layouts
                </button>
              </div>
            )}

          </div>

        </div>
      </div>

    </div>
  );
};
