import React, { useState, useRef } from 'react';
import type { Project, RosterPlayer } from '../types';
import { ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';

interface CanvasProps {
  project: Project;
  activePlayer: RosterPlayer | undefined;
  onUpdateProject: (updates: Partial<Project>) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export const Canvas: React.FC<CanvasProps> = ({
  project,
  activePlayer,
  onUpdateProject,
  zoom,
  setZoom,
  pan,
  setPan,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const viewportRef = useRef<HTMLDivElement>(null);
  
  const unitFactor = project.measurementUnit === 'inches' ? 1 : project.measurementUnit === 'cm' ? 2.54 : 25.4;
  const unitLabel = project.measurementUnit === 'inches' ? 'in' : project.measurementUnit === 'cm' ? 'cm' : 'mm';

  // Convert real-world inches to canvas pixels (1 inch = 40 pixels at 100% zoom)
  const inchToPx = (inches: number) => {
    return inches * 40;
  };

  const isLayerVisible = (layerId: string) => !project.hiddenLayers.includes(layerId);
  const isLayerLocked = (layerId: string) => project.lockedLayers.includes(layerId);

  // Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    // Left-click dragging in blank space triggers pan
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom on wheel scroll
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    newZoom = Math.max(0.2, Math.min(newZoom, 4.0));
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
  };

  // Ruler ticks builder: converts canvas coordinate space back to real-world units
  const renderRulerTicks = (orientation: 'horizontal' | 'vertical') => {
    const ticks = [];
    const ticksCount = orientation === 'horizontal' ? 1800 : 1200;
    const stepPx = 40 / (project.measurementUnit === 'inches' ? 1 : project.measurementUnit === 'cm' ? 2.54 : 25.4); // 40px per inch
    
    const startOffset = orientation === 'horizontal' ? pan.x : pan.y;
    
    // Choose step scale (e.g. every 1 in, or every 5 cm, or every 50 mm)
    const tickInterval = project.measurementUnit === 'inches' 
      ? (zoom > 1.5 ? 0.5 : zoom > 0.6 ? 1 : 2)
      : project.measurementUnit === 'cm'
      ? (zoom > 1.5 ? 1 : zoom > 0.6 ? 5 : 10)
      : (zoom > 1.5 ? 10 : zoom > 0.6 ? 50 : 100);

    const stepSizePx = stepPx * tickInterval;
    const startVal = Math.floor(-startOffset / (stepSizePx * zoom)) * tickInterval;
    const endVal = startVal + Math.ceil(ticksCount / (stepSizePx * zoom)) * tickInterval;

    for (let val = Math.max(0, startVal - tickInterval); val <= endVal; val += tickInterval) {
      const pos = startOffset + (val / tickInterval) * stepSizePx * zoom;
      ticks.push(
        <div
          key={val}
          style={{
            position: 'absolute',
            left: orientation === 'horizontal' ? `${pos}px` : '0',
            top: orientation === 'vertical' ? `${pos}px` : '0',
            width: orientation === 'horizontal' ? '1px' : '100%',
            height: orientation === 'vertical' ? '1px' : '100%',
            backgroundColor: 'var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: orientation === 'vertical' ? '4px' : '0',
            paddingBottom: orientation === 'horizontal' ? '4px' : '0',
            flexDirection: orientation === 'horizontal' ? 'column' : 'row',
          }}
        >
          <span style={{ 
            fontSize: '8px', 
            fontFamily: 'monospace', 
            color: 'var(--text-disabled)',
            transform: orientation === 'horizontal' ? 'translate(-50%, -10px)' : 'none',
            display: val % (tickInterval * 2) === 0 ? 'block' : 'none'
          }}>
            {val}
          </span>
        </div>
      );
    }
    return ticks;
  };

  const handleSelectView = (view: 'front' | 'back' | 'sleeves') => {
    onUpdateProject({ activeCanvasView: view });
    addLog(`Switched workspace camera: ${view.toUpperCase()} VIEW`);
  };

  const addLog = (msg: string) => {
    console.log(msg);
  };

  // Validation Warnings Check inline
  const getCanvasWarnings = () => {
    const warnings = [];
    if (project.activeCanvasView === 'back' && activePlayer) {
      if (activePlayer.nameScale < 0.75) {
        warnings.push({
          type: 'text-squeeze',
          title: 'Surname Compression',
          desc: `"${activePlayer.name}" is squeezed to ${Math.round(activePlayer.nameScale * 100)}% to fit safe print-zone.`
        });
      }
    }
    if (project.activeCanvasView === 'front') {
      if (project.rules.frontLogoSpacingCollarInches < 2.5) {
        warnings.push({
          type: 'logo-overlap',
          title: 'Collar Boundary Alert',
          desc: `Collar spacing (${project.rules.frontLogoSpacingCollarInches}") overlaps sewing allowance safety margin.`
        });
      }
    }
    if (project.rules.bleedInches < 0.25) {
      warnings.push({
        type: 'bleed-check',
        title: 'Insufficient Bleed',
        desc: `Sewing bleed (${project.rules.bleedInches}") is below sublimation standard limits (0.25").`
      });
    }
    return warnings;
  };

  const activeWarnings = getCanvasWarnings();

  return (
    <div className="workspace-left-panel">
      
      {/* Centered Canvas Toggles (Front / Back / Sleeves) */}
      <div className="canvas-tab-bar">
        <button 
          className={`canvas-tab ${project.activeCanvasView === 'front' ? 'active' : ''}`}
          onClick={() => handleSelectView('front')}
        >
          Front Panel
        </button>
        <button 
          className={`canvas-tab ${project.activeCanvasView === 'back' ? 'active' : ''}`}
          onClick={() => handleSelectView('back')}
        >
          Back Panel
        </button>
        <button 
          className={`canvas-tab ${project.activeCanvasView === 'sleeves' ? 'active' : ''}`}
          onClick={() => handleSelectView('sleeves')}
        >
          Sleeves & Collar
        </button>
      </div>

      {/* Floating Canvas Controls */}
      <div className="canvas-controls">
        <button title="Pan Workspace"><Move size={14} /></button>
        <button onClick={() => setZoom(z => Math.min(z + 0.1, 4))} title="Zoom In"><ZoomIn size={14} /></button>
        <span style={{ width: '48px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))} title="Zoom Out"><ZoomOut size={14} /></button>
        <button onClick={resetView} title="Center Layout (Fit to Screen)"><Maximize2 size={14} /></button>
      </div>

      {/* Live Validation Badge overlay (rendered directly in corner of canvas) */}
      {activeWarnings.length > 0 && (
        <div className="validation-badge-canvas">
          <div className="validation-badge-title">⚠ Studio Warning</div>
          {activeWarnings.map((w, idx) => (
            <div key={idx} className="validation-badge-desc" style={{ marginBottom: idx < activeWarnings.length - 1 ? '4px' : '0' }}>
              <strong>{w.title}</strong>: {w.desc}
            </div>
          ))}
        </div>
      )}

      {/* Rulers */}
      <div className="canvas-ruler-corner"></div>
      <div className="canvas-ruler horizontal">
        {renderRulerTicks('horizontal')}
      </div>
      <div className="canvas-ruler vertical">
        {renderRulerTicks('vertical')}
      </div>

      {/* Viewport Viewport */}
      <div
        ref={viewportRef}
        className="canvas-viewport blueprint-grid animate-grid"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--grid-line-color) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid-line-color) 1px, transparent 1px)
          `,
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="canvas-artboard"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
            display: 'flex',
            gap: '40px',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 'auto',
            minHeight: 'auto',
            width: 'max-content',
            height: 'max-content',
            padding: 0,
          }}
        >

          {/* ==========================================
              1. FRONT VIEWPORT
              ========================================== */}
          {project.activeCanvasView === 'front' && isLayerVisible('template-front') && (
            <div
              className={`canvas-panel-container ${project.selectedLayerId === 'template-front' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onUpdateProject({ selectedLayerId: 'template-front' }); }}
              style={{
                position: 'relative',
                width: `${inchToPx(28)}px`,
                height: `${inchToPx(34)}px`,
                border: project.selectedLayerId === 'template-front' ? '2px solid var(--accent-blue)' : '1px dashed var(--border-active)',
                background: 'rgba(var(--bg-secondary-rgb), 0.94)',
                borderRadius: '8px',
                padding: '20px',
                transition: 'border-color var(--transition-fast)',
                cursor: isLayerLocked('template-front') ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              {/* Figma Corner Anchor points */}
              <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />

              <div style={{ position: 'absolute', top: '12px', left: '16px', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                FRONT PANEL SPEC (28" x 34") — raglan_jersey_s_m.sew
              </div>

              {/* Technical SVG Overlays */}
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 280 340"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
              >
                {/* 1. Print Bleed line (Subtle Purple) */}
                {isLayerVisible('guide-bleeds') && (
                  <path
                    d="M 50,40 C 90,30 190,30 230,40 L 250,90 L 230,105 L 235,320 C 180,335 100,335 45,320 L 50,105 L 30,90 Z"
                    fill="none"
                    stroke="var(--accent-purple)"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                )}

                {/* 2. Sewing Seam line (Solid white/gray) */}
                {isLayerVisible('guide-seams') && (
                  <path
                    d="M 52.5,43.5 C 90.5,34 189.5,34 227.5,43.5 L 245.5,88.5 L 227,102.5 L 232,315 C 179,329 100,329 48,315 L 53,102.5 L 34.5,88.5 Z"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                )}

                {/* 3. Safety boundaries (Neon blue) */}
                {isLayerVisible('guide-safe') && (
                  <path
                    d="M 55,47 C 92,38 188,38 225,47 L 241,87 L 224,100 L 229,310 C 178,323 102,323 51,310 L 56,100 L 39,87 Z"
                    fill="none"
                    stroke="var(--accent-blue)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Collar offset guideline spacing */}
                {isLayerVisible('guide-safe') && (
                  <g>
                    {/* Anchor line */}
                    {(() => {
                      const yPos = 40 + project.rules.frontLogoSpacingCollarInches * 10;
                      return (
                        <g>
                          <line x1="20" y1={yPos} x2="260" y2={yPos} stroke="var(--accent-blue)" strokeWidth="1" strokeDasharray="3 3" />
                          <text x="25" y={yPos - 4} fill="var(--accent-blue)" fontSize="8" fontFamily="monospace">
                            COLLAR OFFSET: {(project.rules.frontLogoSpacingCollarInches * unitFactor).toFixed(2)} {unitLabel}
                          </text>
                          {/* Stepper guides */}
                          <line x1="140" y1="40" x2="140" y2={yPos} stroke="var(--accent-purple)" strokeWidth="1" />
                          <circle cx="140" cy="40" r="2" fill="var(--accent-purple)" />
                          <circle cx="140" cy={yPos} r="2" fill="var(--accent-purple)" />
                        </g>
                      );
                    })()}
                  </g>
                )}

                {isLayerVisible('guide-seams') && (
                  <text x="25" y="315" fill="#ffffff" fillOpacity="0.4" fontSize="7" fontFamily="monospace">
                    STITCHING OFFSET: {(project.rules.seamAllowanceInches * unitFactor).toFixed(2)} {unitLabel}
                  </text>
                )}

                {/* Label badges */}
                <text x="245" y="325" fill="var(--accent-purple)" fontSize="7" textAnchor="end">Bleed Boundary (+{project.rules.bleedInches} in)</text>
                <text x="220" y="303" fill="var(--accent-blue)" fontSize="7" textAnchor="end">Sponsor Safety Bounds</text>
              </svg>

              {/* Sublimation Design Pattern Overlay */}
              {isLayerVisible('layer-bg-texture') && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0.18,
                    pointerEvents: 'none',
                    background: project.prompt || project.selectedPresetId ? `repeating-linear-gradient(45deg, ${project.baseColors.primary} 0px, ${project.baseColors.primary} 20px, ${project.baseColors.secondary} 20px, ${project.baseColors.secondary} 40px, ${project.baseColors.accent} 40px, ${project.baseColors.accent} 45px)` : 'transparent',
                    clipPath: 'polygon(18% 12%, 82% 12%, 89% 26%, 82% 31%, 84% 94%, 16% 94%, 18% 31%, 11% 26%)'
                  }}
                />
              )}

              {/* Vector Logo bounding box */}
              {project.logos.map((logo) => {
                if (!isLayerVisible(`logo-${logo.id}`)) return null;
                const logoTop = 12 + project.rules.frontLogoSpacingCollarInches * 2.94;
                const isSelected = project.selectedLayerId === `logo-${logo.id}`;

                // Calculate alignment left properties based on rule alignment
                const alignLeft = project.rules.chestAlignment === 'left' ? '25%' 
                  : project.rules.chestAlignment === 'right' ? '75%' : '50%';
                const transformAlign = project.rules.chestAlignment === 'left' ? 'none'
                  : project.rules.chestAlignment === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';

                return (
                  <div
                    key={logo.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLayerLocked(`logo-${logo.id}`)) {
                        onUpdateProject({ selectedLayerId: `logo-${logo.id}` });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: `${logoTop}%`,
                      left: alignLeft,
                      transform: transformAlign,
                      width: `${logo.sizeInches * 18}px`,
                      border: isSelected ? '1px solid var(--accent-blue)' : '1px dashed transparent',
                      background: 'rgba(0,0,0,0.65)',
                      padding: '4px',
                      borderRadius: '4px',
                      textAlign: 'center',
                      zIndex: 4,
                      boxShadow: isSelected ? '0 0 8px rgba(0, 112, 243, 0.4)' : 'none',
                    }}
                  >
                    {/* Bounding handles in figma design */}
                    {isSelected && (
                      <>
                        <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '6px', height: '6px', background: 'var(--accent-blue)' }} />
                        <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '6px', height: '6px', background: 'var(--accent-blue)' }} />
                        <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '6px', height: '6px', background: 'var(--accent-blue)' }} />
                        <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '6px', height: '6px', background: 'var(--accent-blue)' }} />
                      </>
                    )}

                    <div style={{ fontSize: '7px', color: 'var(--text-disabled)', marginBottom: '2px', fontFamily: 'monospace' }}>
                      LOGO: {(logo.sizeInches * unitFactor).toFixed(1)} {unitLabel}
                    </div>
                    {logo.url ? (
                      <img src={logo.url} alt={logo.name} style={{ width: '100%', height: 'auto', objectFit: 'contain', maxHeight: '50px' }} />
                    ) : (
                      <div style={{ fontWeight: 'bold', fontSize: '9px', padding: '6px 0', textTransform: 'uppercase', color: project.baseColors.highlight }}>
                        {logo.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ==========================================
              2. BACK VIEWPORT
              ========================================== */}
          {project.activeCanvasView === 'back' && isLayerVisible('template-back') && (
            <div
              className={`canvas-panel-container ${project.selectedLayerId === 'template-back' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onUpdateProject({ selectedLayerId: 'template-back' }); }}
              style={{
                position: 'relative',
                width: `${inchToPx(28)}px`,
                height: `${inchToPx(34)}px`,
                border: project.selectedLayerId === 'template-back' ? '2px solid var(--accent-blue)' : '1px dashed var(--border-active)',
                background: 'rgba(var(--bg-secondary-rgb), 0.94)',
                borderRadius: '8px',
                padding: '20px',
                transition: 'border-color var(--transition-fast)',
                cursor: isLayerLocked('template-back') ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              {/* Corner Handles */}
              <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />
              <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', border: '1px solid #fff' }} />

              <div style={{ position: 'absolute', top: '12px', left: '16px', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                BACK PANEL SPEC (28" x 34") — raglan_jersey_s_m.sew
              </div>

              {/* Technical SVG Overlays */}
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 280 340"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
              >
                {/* 1. Print Bleed line */}
                {isLayerVisible('guide-bleeds') && (
                  <path
                    d="M 50,25 C 90,20 190,20 230,25 L 250,90 L 230,105 L 235,320 C 180,335 100,335 45,320 L 50,105 L 30,90 Z"
                    fill="none"
                    stroke="var(--accent-purple)"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                )}

                {/* 2. Sewing Seam line */}
                {isLayerVisible('guide-seams') && (
                  <path
                    d="M 52.5,28.5 C 90.5,23.5 189.5,23.5 227.5,28.5 L 245.5,88.5 L 227,102.5 L 232,315 C 179,329 100,329 48,315 L 53,102.5 L 34.5,88.5 Z"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                )}

                {/* 3. Safety boundaries */}
                {isLayerVisible('guide-safe') && (
                  <path
                    d="M 55,32 C 92,27 188,27 225,32 L 241,87 L 224,100 L 229,310 C 178,323 102,323 51,310 L 56,100 L 39,87 Z"
                    fill="none"
                    stroke="var(--accent-blue)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Center Snap Guide */}
                <line x1="140" y1="20" x2="140" y2="330" stroke="rgba(0, 136, 255, 0.25)" strokeWidth="0.5" strokeDasharray="3 3" />
              </svg>

              {/* Sublimation Design Pattern Overlay */}
              {isLayerVisible('layer-bg-texture') && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0.18,
                    pointerEvents: 'none',
                    background: project.prompt || project.selectedPresetId ? `repeating-linear-gradient(45deg, ${project.baseColors.primary} 0px, ${project.baseColors.primary} 20px, ${project.baseColors.secondary} 20px, ${project.baseColors.secondary} 40px, ${project.baseColors.accent} 40px, ${project.baseColors.accent} 45px)` : 'transparent',
                    clipPath: 'polygon(18% 7.5%, 82% 7.5%, 89% 26%, 82% 31%, 84% 94%, 16% 94%, 18% 31%, 11% 26%)'
                  }}
                />
              )}

              {/* Back Elements: Player Roster Placement */}
              <div
                style={{
                  position: 'absolute',
                  top: `${20 + project.rules.surnameSpacingCollarInches * 2.2}%`,
                  left: project.rules.autoCenter ? '50%' : (project.rules.chestAlignment === 'left' ? '10%' : '90%'),
                  transform: project.rules.autoCenter ? 'translateX(-50%)' : (project.rules.chestAlignment === 'left' ? 'none' : 'translateX(-100%)'),
                  width: '80%',
                  textAlign: project.rules.autoCenter ? 'center' : (project.rules.chestAlignment === 'left' ? 'left' : 'right'),
                  zIndex: 3,
                }}
              >
                {/* SURNAME Text Box Layer */}
                {isLayerVisible('layer-surname') && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLayerLocked('layer-surname')) {
                        onUpdateProject({ selectedLayerId: 'layer-surname' });
                      }
                    }}
                    style={{
                      border: project.selectedLayerId === 'layer-surname' ? '1px solid var(--accent-blue)' : '1px dashed transparent',
                      padding: '4px',
                      display: 'inline-block',
                      maxWidth: `${project.rules.maxTextWidthInches * 10}px`,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: `${project.rules.playerNameHeightInches * 6}px`,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: project.baseColors.highlight,
                        lineHeight: 1,
                        transform: activePlayer ? `scaleX(${activePlayer.nameScale})` : 'none',
                        transformOrigin: 'center',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                      }}
                    >
                      {activePlayer ? activePlayer.name : 'SURNAME'}
                    </div>
                  </div>
                )}

                {/* NUMBER Text Box Layer */}
                {isLayerVisible('layer-number') && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLayerLocked('layer-number')) {
                        onUpdateProject({ selectedLayerId: 'layer-number' });
                      }
                    }}
                    style={{
                      border: project.selectedLayerId === 'layer-number' ? '1px solid var(--accent-blue)' : '1px dashed transparent',
                      padding: '4px',
                      marginTop: '10px',
                      display: 'inline-block',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontSize: `${project.rules.playerNumberHeightInches * 10}px`,
                        fontWeight: 900,
                        color: project.baseColors.highlight,
                        fontFamily: 'Outfit, sans-serif',
                        lineHeight: 0.9,
                        textShadow: '0 4px 8px rgba(0,0,0,0.9)',
                      }}
                    >
                      {activePlayer ? activePlayer.number : '00'}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '8px', color: 'var(--text-disabled)', marginTop: '12px', fontFamily: 'monospace' }}>
                  GUIDE: Num Height {(project.rules.playerNumberHeightInches * unitFactor).toFixed(1)} {unitLabel} | Name Spacing {(project.rules.surnameSpacingCollarInches * unitFactor).toFixed(1)} {unitLabel}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              3. SLEEVES VIEWPORT
              ========================================== */}
          {project.activeCanvasView === 'sleeves' && (isLayerVisible('template-sleeve-l') || isLayerVisible('template-sleeve-r') || isLayerVisible('template-collar')) && (
            <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
              
              {/* Sleeve Left */}
              {isLayerVisible('template-sleeve-l') && (
                <div
                  className={`canvas-panel-container ${project.selectedLayerId === 'template-sleeve-l' ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpdateProject({ selectedLayerId: 'template-sleeve-l' }); }}
                  style={{
                    position: 'relative',
                    width: `${inchToPx(14)}px`,
                    height: `${inchToPx(18)}px`,
                    border: project.selectedLayerId === 'template-sleeve-l' ? '2px solid var(--accent-blue)' : '1px dashed var(--border-active)',
                    background: 'rgba(var(--bg-secondary-rgb), 0.94)',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: isLayerLocked('template-sleeve-l') ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-lg)'
                  }}
                >
                  <div style={{ position: 'absolute', top: '10px', left: '12px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                    LEFT SLEEVE SPEC (14" x 18")
                  </div>
                  <svg width="100%" height="100%" viewBox="0 0 140 180" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                    <path d="M 20,20 C 50,5 90,5 120,20 L 130,160 C 100,165 40,165 10,160 Z" fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="4 2" />
                    <path d="M 25,25 C 52,12 88,12 115,25 L 123,152 C 95,157 45,157 17,152 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1" strokeDasharray="2 2" />
                  </svg>
                </div>
              )}

              {/* Sleeve Right */}
              {isLayerVisible('template-sleeve-r') && (
                <div
                  className={`canvas-panel-container ${project.selectedLayerId === 'template-sleeve-r' ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpdateProject({ selectedLayerId: 'template-sleeve-r' }); }}
                  style={{
                    position: 'relative',
                    width: `${inchToPx(14)}px`,
                    height: `${inchToPx(18)}px`,
                    border: project.selectedLayerId === 'template-sleeve-r' ? '2px solid var(--accent-blue)' : '1px dashed var(--border-active)',
                    background: 'rgba(var(--bg-secondary-rgb), 0.94)',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: isLayerLocked('template-sleeve-r') ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-lg)'
                  }}
                >
                  <div style={{ position: 'absolute', top: '10px', left: '12px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                    RIGHT SLEEVE SPEC (14" x 18")
                  </div>
                  <svg width="100%" height="100%" viewBox="0 0 140 180" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                    <path d="M 20,20 C 50,5 90,5 120,20 L 130,160 C 100,165 40,165 10,160 Z" fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="4 2" />
                    <path d="M 25,25 C 52,12 88,12 115,25 L 123,152 C 95,157 45,157 17,152 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1" strokeDasharray="2 2" />
                  </svg>
                </div>
              )}

              {/* Collar Pattern */}
              {isLayerVisible('template-collar') && (
                <div
                  className={`canvas-panel-container ${project.selectedLayerId === 'template-collar' ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpdateProject({ selectedLayerId: 'template-collar' }); }}
                  style={{
                    position: 'relative',
                    width: `${inchToPx(20)}px`,
                    height: `${inchToPx(4)}px`,
                    border: project.selectedLayerId === 'template-collar' ? '2px solid var(--accent-blue)' : '1px dashed var(--border-active)',
                    background: 'rgba(var(--bg-secondary-rgb), 0.94)',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: isLayerLocked('template-collar') ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-lg)'
                  }}
                >
                  <div style={{ position: 'absolute', top: '5px', left: '12px', fontSize: '8px', fontWeight: 'bold', color: 'var(--text-disabled)', fontFamily: 'monospace' }}>
                    COLLAR SPEC (20" x 4")
                  </div>
                  <svg width="100%" height="100%" viewBox="0 0 200 40" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                    <path d="M 10,10 C 60,30 140,30 190,10 L 185,30 C 135,15 65,15 15,30 Z" fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="4 2" />
                  </svg>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
