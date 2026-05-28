import type * as fabric from 'fabric';
import { calcSafeZones, type SafeZoneRects } from '../../lib/measurements';

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

export interface SnapGuideLine {
  x?: number;
  y?: number;
  label?: string;
  targetX?: number;
  targetY?: number;
}

export function performSnappingAndClamping(
  obj: fabric.FabricObject,
  canvas: fabric.Canvas,
  currentView: string,
  rules: any,
  offsets: any,
  width: number,
  height: number,
  activeGuideLines: SnapGuideLine[]
) {
  // Clear previous snaps
  activeGuideLines.length = 0;

  const isFull = currentView === 'full';
  const panel = isFull ? ((obj as any).__panel || 'front') : currentView;
  
  // 1. Get panel offset on the master canvas
  let panelOffsetX = 0;
  let panelOffsetY = 0;
  if (isFull) {
    const offset = offsets[panel] ?? offsets.front;
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

  let cx = obj.getCenterPoint().x;
  let cy = obj.getCenterPoint().y;

  let snappedX = cx;
  let snappedY = cy;

  const snapThreshold = 8; // standard snap threshold in pixels

  if (rules?.smartSnapping) {
    const activeBounds = obj.getBoundingRect();
    const activeLeft = activeBounds.left;
    const activeRight = activeBounds.left + activeBounds.width;
    const activeTop = activeBounds.top;
    const activeBottom = activeBounds.top + activeBounds.height;
    const activeCenterX = activeLeft + activeBounds.width / 2;
    const activeCenterY = activeTop + activeBounds.height / 2;

    // A. Object-to-Object Snapping
    const otherObjects = canvas.getObjects().filter(o => 
      o !== obj && 
      !(o as any).__isArtboard && 
      o.visible !== false &&
      (isFull ? (o as any).__panel === panel : true)
    );

    let foundObjectSnapX = false;
    let foundObjectSnapY = false;

    for (const other of otherObjects) {
      const otherBounds = other.getBoundingRect();
      const otherLeft = otherBounds.left;
      const otherRight = otherBounds.left + otherBounds.width;
      const otherTop = otherBounds.top;
      const otherBottom = otherBounds.top + otherBounds.height;
      const otherCenterX = otherLeft + otherBounds.width / 2;
      const otherCenterY = otherTop + otherBounds.height / 2;

      // X Snapping (Vertical guide lines)
      if (!foundObjectSnapX) {
        if (Math.abs(activeCenterX - otherCenterX) < snapThreshold) {
          snappedX = otherCenterX;
          activeGuideLines.push({ x: otherCenterX, label: 'Align Center', targetY: otherCenterY });
          foundObjectSnapX = true;
        } else if (Math.abs(activeLeft - otherLeft) < snapThreshold) {
          snappedX = cx + (otherLeft - activeLeft);
          activeGuideLines.push({ x: otherLeft, label: 'Align Left', targetY: otherTop });
          foundObjectSnapX = true;
        } else if (Math.abs(activeRight - otherRight) < snapThreshold) {
          snappedX = cx + (otherRight - activeRight);
          activeGuideLines.push({ x: otherRight, label: 'Align Right', targetY: otherTop });
          foundObjectSnapX = true;
        } else if (Math.abs(activeLeft - otherRight) < snapThreshold) {
          snappedX = cx + (otherRight - activeLeft);
          activeGuideLines.push({ x: otherRight, label: 'Align Edge', targetY: otherTop });
          foundObjectSnapX = true;
        } else if (Math.abs(activeRight - otherLeft) < snapThreshold) {
          snappedX = cx + (otherLeft - activeRight);
          activeGuideLines.push({ x: otherLeft, label: 'Align Edge', targetY: otherTop });
          foundObjectSnapX = true;
        }
      }

      // Y Snapping (Horizontal guide lines)
      if (!foundObjectSnapY) {
        if (Math.abs(activeCenterY - otherCenterY) < snapThreshold) {
          snappedY = otherCenterY;
          activeGuideLines.push({ y: otherCenterY, label: 'Align Center', targetX: otherCenterX });
          foundObjectSnapY = true;
        } else if (Math.abs(activeTop - otherTop) < snapThreshold) {
          snappedY = cy + (otherTop - activeTop);
          activeGuideLines.push({ y: otherTop, label: 'Align Top', targetX: otherLeft });
          foundObjectSnapY = true;
        } else if (Math.abs(activeBottom - otherBottom) < snapThreshold) {
          snappedY = cy + (otherBottom - activeBottom);
          activeGuideLines.push({ y: otherBottom, label: 'Align Bottom', targetX: otherLeft });
          foundObjectSnapY = true;
        } else if (Math.abs(activeTop - otherBottom) < snapThreshold) {
          snappedY = cy + (otherBottom - activeTop);
          activeGuideLines.push({ y: otherBottom, label: 'Align Edge', targetX: otherLeft });
          foundObjectSnapY = true;
        } else if (Math.abs(activeBottom - otherTop) < snapThreshold) {
          snappedY = cy + (otherTop - activeBottom);
          activeGuideLines.push({ y: otherTop, label: 'Align Edge', targetX: otherLeft });
          foundObjectSnapY = true;
        }
      }

      if (foundObjectSnapX && foundObjectSnapY) break;
    }

    // B. Artboard Landmark Snapping (if not already snapped to another object)
    if (!foundObjectSnapX) {
      const centerX = panelOffsetX + panelW / 2;
      if (Math.abs(cx - centerX) < snapThreshold) {
        snappedX = centerX;
        activeGuideLines.push({ x: centerX, label: `${panel.toUpperCase()} Center` });
      }
    }

    if (!foundObjectSnapY) {
      const normalizedPanel = panel === 'sleeves_right' ? 'sleeves' : panel;
      if (normalizedPanel === 'front' || normalizedPanel === 'back') {
        const collarY = panelOffsetY + (normalizedPanel === 'front' ? Math.round(panelH * 0.176) : Math.round(panelH * 0.132));
        if (Math.abs(cy - collarY) < snapThreshold) {
          snappedY = collarY;
          activeGuideLines.push({ y: collarY, label: 'Collar Reference' });
        }

        if (normalizedPanel === 'front') {
          const chestY = panelOffsetY + Math.round(panelH * 0.35);
          if (Math.abs(cy - chestY) < snapThreshold) {
            snappedY = chestY;
            activeGuideLines.push({ y: chestY, label: 'Chest Alignment' });
          }
        } else if (normalizedPanel === 'back') {
          const midY = panelOffsetY + Math.round(panelH * 0.45);
          if (Math.abs(cy - midY) < snapThreshold) {
            snappedY = midY;
            activeGuideLines.push({ y: midY, label: 'Player Number Zone' });
          }
        }
      } else if (normalizedPanel === 'sleeves') {
        const capY = panelOffsetY + 40;
        const centY = panelOffsetY + panelH / 2;
        const cuffY = panelOffsetY + panelH - 40;

        if (Math.abs(cy - capY) < snapThreshold) {
          snappedY = capY;
          activeGuideLines.push({ y: capY, label: 'Sleeve Cap Seam' });
        } else if (Math.abs(cy - centY) < snapThreshold) {
          snappedY = centY;
          activeGuideLines.push({ y: centY, label: 'Sleeve Center' });
        } else if (Math.abs(cy - cuffY) < snapThreshold) {
          snappedY = cuffY;
          activeGuideLines.push({ y: cuffY, label: 'Sleeve Cuff Seam' });
        }
      }
    }
  } else {
    // Standard grid snap
    const gridSnap = 10;
    snappedX = Math.round(cx / gridSnap) * gridSnap;
    snappedY = Math.round(cy / gridSnap) * gridSnap;
  }

  // Apply snapping position
  setCenterPosition(obj, snappedX, snappedY);

  // 3. Safe & Bleed Boundaries Clamp
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

  if ((obj as any).__restrictToSafe && sz.safe) {
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
}
