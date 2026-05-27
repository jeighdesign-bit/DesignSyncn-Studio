/**
 * DesignSync Production Measurement System
 * Pure math utility — no React/Fabric.js dependencies.
 *
 * Scene coordinate space: 40px = 1 inch (fixed internal scale).
 * DPI only affects export resolution, not the scene scale.
 */

import type { Project } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Scene pixels per inch — the fixed internal coordinate scale. */
export const PX_PER_INCH = 40;

/** Scene pixels per centimetre. */
export const PX_PER_CM = PX_PER_INCH / 2.54; // ≈ 15.748

/** Scene pixels per millimetre. */
export const PX_PER_MM = PX_PER_INCH / 25.4; // ≈ 1.5748

/** Physical canvas dimensions per view (in inches). */
export const VIEW_DIMENSIONS: Record<string, { w: number; h: number }> = {
  front:   { w: 28, h: 34 },
  back:    { w: 28, h: 34 },
  sleeves: { w: 14, h: 18 },
  collar:  { w: 14, h:  8 },
  full:    { w: 60, h: 60 },
};

// ─── Garment Templates ────────────────────────────────────────────────────────

export interface GarmentTemplate {
  id: string;
  name: string;
  category: string;
  baseSize: string;
  baseMeasurements: {
    frontWidth: number;
    frontHeight: number;
    backWidth: number;
    backHeight: number;
    sleeveWidth: number;
    sleeveHeight: number;
    collarWidth?: number;
    collarHeight?: number;
  };
  sizeStep: number;
  supportedSizes: string[];
  files: Record<string, string>;
}

export function getGarmentDimensions(
  template: GarmentTemplate,
  size: string
): Record<string, { w: number; h: number }> {
  const sizes = template.supportedSizes || ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const baseSizeIndex = sizes.indexOf(template.baseSize || "M");
  const normalizedSize = size === 'XXL' ? '2XL' : size;
  const currentSizeIndex = sizes.indexOf(normalizedSize);
  
  const sizeDiff = currentSizeIndex !== -1 ? currentSizeIndex - baseSizeIndex : 0;
  
  const frontBaseWidth = template.baseMeasurements.frontWidth;
  const frontWidth = frontBaseWidth + sizeDiff * template.sizeStep;
  const scaleFactor = frontWidth / frontBaseWidth;

  const getDim = (baseW: number, baseH: number) => ({
    w: Number((baseW * scaleFactor).toFixed(3)),
    h: Number((baseH * scaleFactor).toFixed(3))
  });

  const bm = template.baseMeasurements;
  return {
    front: getDim(bm.frontWidth, bm.frontHeight),
    back: getDim(bm.backWidth, bm.backHeight),
    sleeves: getDim(bm.sleeveWidth, bm.sleeveHeight),
    'left-sleeve': getDim(bm.sleeveWidth, bm.sleeveHeight),
    'right-sleeve': getDim(bm.sleeveWidth, bm.sleeveHeight),
    collar: getDim(bm.collarWidth ?? 14, bm.collarHeight ?? 8),
  };
}

export function getAnchorCoords(
  panel: string,
  anchorType: string,
  width: number,
  height: number
): { x: number; y: number } {
  const cx = width / 2;
  const normalizedPanel = panel === 'sleeves_right' ? 'sleeves' : panel;

  if (normalizedPanel === 'front') {
    switch (anchorType) {
      case 'collar_base':
        return { x: cx, y: Math.round(height * 0.176) };
      case 'chest_center':
        return { x: cx, y: Math.round(height * 0.35) };
      case 'left_chest':
        return { x: Math.round(width * 0.32), y: Math.round(height * 0.32) };
      case 'right_chest':
        return { x: Math.round(width * 0.68), y: Math.round(height * 0.32) };
      case 'hem_base':
        return { x: cx, y: height - 80 };
      default:
        return { x: cx, y: Math.round(height * 0.35) };
    }
  } else if (normalizedPanel === 'back') {
    switch (anchorType) {
      case 'collar_base':
        return { x: cx, y: Math.round(height * 0.132) };
      case 'mid_back':
        return { x: cx, y: Math.round(height * 0.45) };
      case 'hem_base':
        return { x: cx, y: height - 80 };
      default:
        return { x: cx, y: Math.round(height * 0.45) };
    }
  } else if (normalizedPanel === 'sleeves') {
    switch (anchorType) {
      case 'sleeve_cap':
        return { x: cx, y: 40 };
      case 'sleeve_center':
        return { x: cx, y: Math.round(height / 2) };
      case 'sleeve_cuff':
        return { x: cx, y: height - 40 };
      default:
        return { x: cx, y: Math.round(height / 2) };
    }
  } else if (normalizedPanel === 'collar') {
    return { x: cx, y: Math.round(height / 2) };
  }
  return { x: cx, y: Math.round(height / 2) };
}


// ─── Types ────────────────────────────────────────────────────────────────────

export type MeasurementUnit = 'inches' | 'cm' | 'mm' | 'px';

export interface ObjectBounds {
  widthPx:  number;
  heightPx: number;
  leftPx:   number;
  topPx:    number;
  angleDeg: number;
}

export interface SafeZoneRects {
  /** Bleed zone outer rect in scene px from artboard origin */
  bleed:  { x: number; y: number; w: number; h: number } | null;
  /** Print-safe inner rect */
  safe:   { x: number; y: number; w: number; h: number } | null;
  /** Seam allowance rect (innermost) */
  seam:   { x: number; y: number; w: number; h: number } | null;
}

// ─── Unit conversion ──────────────────────────────────────────────────────────

/** Returns the number of scene pixels per unit. */
export function pxPerUnit(unit: MeasurementUnit): number {
  switch (unit) {
    case 'inches': return PX_PER_INCH;
    case 'cm':     return PX_PER_CM;
    case 'mm':     return PX_PER_MM;
    case 'px':     return 1;
  }
}

/** Convert scene pixels → display unit. */
export function fromPx(px: number, unit: MeasurementUnit): number {
  return px / pxPerUnit(unit);
}

/** Convert display unit → scene pixels. */
export function toPx(value: number, unit: MeasurementUnit): number {
  return value * pxPerUnit(unit);
}

/**
 * Format a pixel value as a human-readable measurement string.
 * e.g. formatMeasurement(420, 'inches') → "10.50"
 */
export function formatMeasurement(
  px: number,
  unit: MeasurementUnit,
  decimals = 2,
): string {
  if (unit === 'px') return Math.round(px).toString();
  return fromPx(px, unit).toFixed(decimals);
}

/** Returns the unit abbreviation label. */
export function unitLabel(unit: MeasurementUnit): string {
  switch (unit) {
    case 'inches': return 'in';
    case 'cm':     return 'cm';
    case 'mm':     return 'mm';
    case 'px':     return 'px';
  }
}

// ─── Ruler tick system ────────────────────────────────────────────────────────

/**
 * Returns the major tick interval in scene pixels, adapted to zoom and unit.
 * Ensures ticks are never too dense or too sparse on screen.
 */
export function majorTickIntervalPx(zoom: number, unit: MeasurementUnit): number {
  const ppUnit = pxPerUnit(unit);
  // Target: major ticks 40–120px apart on screen
  const targetScreenPx = 60;
  // How many scene-px per unit
  const screenPxPerUnit = ppUnit * zoom;

  let interval = 1; // 1 unit
  if (screenPxPerUnit < targetScreenPx / 8)  interval = 64;
  else if (screenPxPerUnit < targetScreenPx / 4)  interval = 16;
  else if (screenPxPerUnit < targetScreenPx / 2)  interval = 8;
  else if (screenPxPerUnit < targetScreenPx)      interval = 4;
  else if (screenPxPerUnit < targetScreenPx * 2)  interval = 2;
  else if (screenPxPerUnit < targetScreenPx * 4)  interval = 1;
  else if (screenPxPerUnit < targetScreenPx * 8)  interval = 0.5;
  else                                             interval = 0.25;

  // For px mode, keep intervals as whole numbers
  if (unit === 'px') {
    const candidates = [1, 5, 10, 20, 50, 100, 200, 500, 1000];
    const targetScene = targetScreenPx / zoom;
    return candidates.reduce((best, c) =>
      Math.abs(c - targetScene) < Math.abs(best - targetScene) ? c : best
    );
  }

  return interval * ppUnit; // scene pixels
}

/** Number of minor subdivisions per major tick. */
export function minorDivisions(unit: MeasurementUnit): number {
  switch (unit) {
    case 'inches': return 4;  // quarter-inch marks
    case 'cm':     return 5;  // 2mm marks
    case 'mm':     return 5;  // 0.2mm marks
    case 'px':     return 5;
  }
}

// ─── Safe zone geometry ───────────────────────────────────────────────────────

/**
 * Calculate safe zone rect coordinates in scene pixels.
 * Rects are inset from the artboard edges.
 */
export function calcSafeZones(
  canvasWPx: number,
  canvasHPx: number,
  bleedInches: number,
  safeMarginInches: number,
  seamAllowanceInches: number,
): SafeZoneRects {
  const bleedPx = bleedInches * PX_PER_INCH;
  const safePx  = safeMarginInches * PX_PER_INCH;
  const seamPx  = seamAllowanceInches * PX_PER_INCH;

  return {
    bleed: bleedPx > 0 ? {
      x: -bleedPx, y: -bleedPx,
      w: canvasWPx + bleedPx * 2,
      h: canvasHPx + bleedPx * 2,
    } : null,
    safe: safePx > 0 ? {
      x: safePx, y: safePx,
      w: canvasWPx - safePx * 2,
      h: canvasHPx - safePx * 2,
    } : null,
    seam: seamPx > 0 ? {
      x: seamPx, y: seamPx,
      w: canvasWPx - seamPx * 2,
      h: canvasHPx - seamPx * 2,
    } : null,
  };
}

// ─── DPI export calibration ───────────────────────────────────────────────────

/**
 * Scale factor to multiply scene pixels to get export raster pixels at target DPI.
 * scene scale = 40px/in. At 300 DPI export: 300/40 = 7.5×
 */
export function exportScaleFactor(targetDpi: number): number {
  return targetDpi / PX_PER_INCH;
}

/**
 * Returns the export raster size in pixels for a given canvas view and DPI.
 */
export function exportDimensions(
  view: string,
  dpi: number,
): { w: number; h: number } {
  const dims = VIEW_DIMENSIONS[view] ?? VIEW_DIMENSIONS.front;
  return {
    w: Math.round(dims.w * dpi),
    h: Math.round(dims.h * dpi),
  };
}

/**
 * Generate default production canvas states in Fabric.js JSON format based on
 * project colors, Style presets (Style DNA), brand logos, and customizable production rules.
 */
export function generateProductionCanvasStates(project: Project): Record<string, string> {
  const { baseColors, rules, logos } = project;
  const prim = baseColors?.primary || '#09090b';
  const sec = baseColors?.secondary || '#111115';
  const acc = baseColors?.accent || '#0070f3';
  const hig = baseColors?.highlight || '#ffffff';

  // Identify logos
  const primaryLogo = logos && logos.length > 0 ? logos[0] : null;
  const sponsorLogo = logos && logos.length > 1 ? logos[1] : null;

  // ─── 1. FRONT PANEL STATE ───
  const frontObjects: any[] = [
    // Background Rect
    {
      type: 'rect',
      version: '6.0.0-beta.7',
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: 1120,
      height: 1360,
      fill: prim,
      selectable: true,
      evented: true,
      __id: 'bg-front',
      __layerName: 'Front Background'
    }
  ];

  // Add decorative AI-generated elements based on Style DNA
  const dna = project.selectedPresetId || 'cyber-hex';
  if (dna === 'cyber-hex' || dna === 'esports-pro') {
    frontObjects.push(
      {
        type: 'polygon',
        version: '6.0.0-beta.7',
        points: [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }],
        left: 200,
        top: 400,
        fill: sec,
        opacity: 0.35,
        __id: 'design-cyber-poly1',
        __layerName: 'Cyber Overlay Left'
      },
      {
        type: 'polygon',
        version: '6.0.0-beta.7',
        points: [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 150 }, { x: 150, y: 150 }],
        left: 770,
        top: 400,
        fill: sec,
        opacity: 0.35,
        __id: 'design-cyber-poly2',
        __layerName: 'Cyber Overlay Right'
      },
      {
        type: 'rect',
        version: '6.0.0-beta.7',
        left: 220,
        top: 550,
        width: 10,
        height: 400,
        angle: 15,
        fill: acc,
        __id: 'design-cyber-line1',
        __layerName: 'Cyber Stripe Accent L'
      },
      {
        type: 'rect',
        version: '6.0.0-beta.7',
        left: 890,
        top: 550,
        width: 10,
        height: 400,
        angle: -15,
        fill: acc,
        __id: 'design-cyber-line2',
        __layerName: 'Cyber Stripe Accent R'
      }
    );
  } else if (dna === 'retro-grid' || dna === 'retro') {
    // Add grid lines
    for (let x = 120; x < 1000; x += 160) {
      frontObjects.push({
        type: 'rect',
        version: '6.0.0-beta.7',
        left: x,
        top: 200,
        width: 2,
        height: 1000,
        fill: acc,
        opacity: 0.15,
        __id: `design-grid-v-${x}`,
        __layerName: 'Retro Grid Line'
      });
    }
    for (let y = 300; y < 1200; y += 160) {
      frontObjects.push({
        type: 'rect',
        version: '6.0.0-beta.7',
        left: 100,
        top: y,
        width: 920,
        height: 2,
        fill: acc,
        opacity: 0.15,
        __id: `design-grid-h-${y}`,
        __layerName: 'Retro Grid Line'
      });
    }
  } else if (dna === 'street-league' || dna === 'street') {
    frontObjects.push(
      {
        type: 'rect',
        version: '6.0.0-beta.7',
        left: 0,
        top: 900,
        width: 1120,
        height: 460,
        fill: sec,
        __id: 'design-street-block',
        __layerName: 'Street Color Block'
      },
      {
        type: 'rect',
        version: '6.0.0-beta.7',
        left: 100,
        top: 890,
        width: 920,
        height: 10,
        fill: acc,
        __id: 'design-street-stripe',
        __layerName: 'Street Accent Bar'
      }
    );
  }

  // Add primary logo
  if (primaryLogo) {
    const chestAlign = rules?.chestAlignment || 'center';
    const logoSpacingCollar = rules?.frontLogoSpacingCollarInches ?? 3.5;
    const logoInches = primaryLogo.sizeInches || 2.5;

    const targetW = logoInches * PX_PER_INCH;
    const ratio = primaryLogo.heightPx && primaryLogo.widthPx ? primaryLogo.heightPx / primaryLogo.widthPx : 1.0;
    const targetH = targetW * ratio;

    let leftPos = 560; // center
    if (chestAlign === 'left') leftPos = 360;
    if (chestAlign === 'right') leftPos = 760;

    const topPos = 240 + (logoSpacingCollar * PX_PER_INCH);

    frontObjects.push({
      type: 'image',
      version: '6.0.0-beta.7',
      src: primaryLogo.url,
      left: leftPos,
      top: topPos,
      originX: 'center',
      originY: 'center',
      width: primaryLogo.widthPx || 200,
      height: primaryLogo.heightPx || 200,
      scaleX: targetW / (primaryLogo.widthPx || 200),
      scaleY: targetH / (primaryLogo.heightPx || 200),
      selectable: true,
      evented: true,
      __id: 'logo-primary',
      __layerName: `Primary Crest Logo (${primaryLogo.name})`,
      __anchor: 'collar_base',
      __offsetXInches: chestAlign === 'left' ? -5.0 : chestAlign === 'right' ? 5.0 : 0.0,
      __offsetYInches: logoSpacingCollar
    });
  }

  // ─── 2. BACK PANEL STATE ───
  const backObjects: any[] = [
    // Background Rect
    {
      type: 'rect',
      version: '6.0.0-beta.7',
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: 1120,
      height: 1360,
      fill: prim,
      selectable: true,
      evented: true,
      __id: 'bg-back',
      __layerName: 'Back Background'
    }
  ];

  if (dna === 'cyber-hex' || dna === 'esports-pro') {
    backObjects.push(
      {
        type: 'polygon',
        version: '6.0.0-beta.7',
        points: [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }],
        left: 200,
        top: 400,
        fill: sec,
        opacity: 0.35,
        __id: 'design-cyber-poly1-back',
        __layerName: 'Cyber Overlay Left'
      },
      {
        type: 'polygon',
        version: '6.0.0-beta.7',
        points: [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 150 }, { x: 150, y: 150 }],
        left: 770,
        top: 400,
        fill: sec,
        opacity: 0.35,
        __id: 'design-cyber-poly2-back',
        __layerName: 'Cyber Overlay Right'
      }
    );
  }

  // Surname Text (Player Name)
  const nameHeight = rules?.playerNameHeightInches ?? 2.0;
  const nameCollarSpacing = rules?.surnameSpacingCollarInches ?? 4.5;
  backObjects.push({
    type: 'i-text',
    version: '6.0.0-beta.7',
    left: 560,
    top: 180 + nameCollarSpacing * PX_PER_INCH,
    text: 'SURNAME',
    fontFamily: 'Outfit',
    fontSize: nameHeight * PX_PER_INCH,
    fontWeight: '800',
    fill: hig,
    textAlign: 'center',
    originX: 'center',
    originY: 'top',
    selectable: true,
    evented: true,
    __id: 'text-name',
    __layerName: 'Player Name',
    __isNameText: true,
    __anchor: 'collar_base',
    __offsetXInches: 0.0,
    __offsetYInches: nameCollarSpacing
  });

  // Player Number Text
  const numberHeight = rules?.playerNumberHeightInches ?? 8.0;
  backObjects.push({
    type: 'i-text',
    version: '6.0.0-beta.7',
    left: 560,
    top: 180 + nameCollarSpacing * PX_PER_INCH + nameHeight * PX_PER_INCH + 40,
    text: '00',
    fontFamily: 'monospace',
    fontSize: numberHeight * PX_PER_INCH,
    fontWeight: '900',
    fill: acc,
    textAlign: 'center',
    originX: 'center',
    originY: 'top',
    selectable: true,
    evented: true,
    __id: 'text-number',
    __layerName: 'Player Number',
    __isNumberText: true,
    __anchor: 'collar_base',
    __offsetXInches: 0.0,
    __offsetYInches: nameCollarSpacing + nameHeight + 1.0
  });

  // ─── 3. SLEEVES PANEL STATE ───
  const sleevesObjects: any[] = [
    // Background Rect
    {
      type: 'rect',
      version: '6.0.0-beta.7',
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: 960,
      height: 640,
      fill: sec,
      selectable: true,
      evented: true,
      __id: 'bg-sleeves',
      __layerName: 'Sleeves Background'
    }
  ];

  // Add Sleeve Sponsor Logo if present
  const sleeveLogo = sponsorLogo || primaryLogo;
  if (sleeveLogo) {
    const targetW = 3.0 * PX_PER_INCH; // 3 inches
    const ratio = sleeveLogo.heightPx && sleeveLogo.widthPx ? sleeveLogo.heightPx / sleeveLogo.widthPx : 1.0;
    const targetH = targetW * ratio;

    sleevesObjects.push({
      type: 'image',
      version: '6.0.0-beta.7',
      src: sleeveLogo.url,
      left: 480,
      top: 320,
      originX: 'center',
      originY: 'center',
      width: sleeveLogo.widthPx || 200,
      height: sleeveLogo.heightPx || 200,
      scaleX: targetW / (sleeveLogo.widthPx || 200),
      scaleY: targetH / (sleeveLogo.heightPx || 200),
      selectable: true,
      evented: true,
      __id: 'logo-sleeve',
      __layerName: `Sleeve Sponsor Logo (${sleeveLogo.name})`,
      __anchor: 'sleeve_center',
      __offsetXInches: 0.0,
      __offsetYInches: 0.0
    });
  }

  // ─── 4. COLLAR PANEL STATE ───
  const collarObjects: any[] = [
    // Background Rect
    {
      type: 'rect',
      version: '6.0.0-beta.7',
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: 560,
      height: 320,
      fill: acc,
      selectable: true,
      evented: true,
      __id: 'bg-collar',
      __layerName: 'Collar Background'
    }
  ];

  return {
    front: JSON.stringify({ version: '6.0.0-beta.7', objects: frontObjects }),
    back: JSON.stringify({ version: '6.0.0-beta.7', objects: backObjects }),
    sleeves: JSON.stringify({ version: '6.0.0-beta.7', objects: sleevesObjects }),
    collar: JSON.stringify({ version: '6.0.0-beta.7', objects: collarObjects }),
  };
}

