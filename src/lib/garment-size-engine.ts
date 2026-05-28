/**
 * GarmentSizeEngine
 *
 * Production-aware apparel scaling engine.
 * Separates garment panel grading from artwork (print element) scaling.
 *
 * Grading table: 1-inch chest-width step per size (user spec: S=20, M=21, L=22, XL=23, 2XL=24).
 * Width and height are proportionally linked — same scale factor applies to both.
 *
 * Pure math — no React or Fabric.js dependencies.
 */

import type { GarmentTemplate } from './measurements';
import { PX_PER_INCH } from './measurements';

// ─── Grading Table ────────────────────────────────────────────────────────────

/**
 * Production chest widths in inches per size.
 * Source: user specification (S=20, M=21, L=22, XL=23, 2XL=24) extended with 1" steps.
 *
 * M (21") is the reference base for the default template.
 * Height scales proportionally with width (aspect-ratio preserved).
 */
export const GARMENT_GRADING_WIDTHS: Record<string, number> = {
  XS:    19,
  S:     20,
  M:     21, // reference base
  L:     22,
  XL:    23,
  '2XL': 24,
  XXL:   24, // alias → 2XL
  '3XL': 25,
};

/** The M-size chest width in inches (reference). */
export const GARMENT_BASE_WIDTH_INCHES = 21;

// ─── Normalize ────────────────────────────────────────────────────────────────

/** Normalizes size aliases (XXL → 2XL). */
export function normalizeSize(size: string): string {
  return size === 'XXL' ? '2XL' : size;
}

// ─── Garment Dimensions ───────────────────────────────────────────────────────

/**
 * Get chest width in inches for a given size using the production grading table.
 */
export function getChestWidthInches(size: string): number {
  const normalized = normalizeSize(size);
  return GARMENT_GRADING_WIDTHS[normalized] ?? GARMENT_BASE_WIDTH_INCHES;
}

/**
 * Get garment scale factor for a size relative to M (the reference base).
 *
 * Examples:
 *   XS  → 19/21 ≈ 0.905
 *   S   → 20/21 ≈ 0.952
 *   M   → 21/21 = 1.000
 *   L   → 22/21 ≈ 1.048
 *   XL  → 23/21 ≈ 1.095
 *   2XL → 24/21 ≈ 1.143
 *   3XL → 25/21 ≈ 1.190
 */
export function getGarmentScaleFactor(size: string): number {
  return getChestWidthInches(size) / GARMENT_BASE_WIDTH_INCHES;
}

/**
 * Get all panel dimensions in inches for a given template and size.
 *
 * Width AND height scale by the same factor (proportionally linked, as user confirmed).
 * This replaces the old sizeStep=2 approach which gave incorrect values.
 */
export function getGarmentDimensions(
  template: GarmentTemplate,
  size: string,
): Record<string, { w: number; h: number }> {
  const baseChestWidth = template.baseMeasurements.frontWidth; // e.g. 21 for M

  // Scale factor: target chest width / base chest width
  // If template base matches M (21"), the grading table is directly applicable.
  // If template base differs, we scale proportionally from it.
  const targetChestWidth = getChestWidthInches(size);
  const scaleFactor = targetChestWidth / baseChestWidth;

  const dim = (baseW: number, baseH: number) => ({
    w: Number((baseW * scaleFactor).toFixed(3)),
    h: Number((baseH * scaleFactor).toFixed(3)),
  });

  const bm = template.baseMeasurements;
  return {
    front:          dim(bm.frontWidth,            bm.frontHeight),
    back:           dim(bm.backWidth,             bm.backHeight),
    sleeves:        dim(bm.sleeveWidth,           bm.sleeveHeight),
    'left-sleeve':  dim(bm.sleeveWidth,           bm.sleeveHeight),
    'right-sleeve': dim(bm.sleeveWidth,           bm.sleeveHeight),
    collar:         dim(bm.collarWidth  ?? 14,    bm.collarHeight ?? 8),
  };
}

// ─── Artwork Scaling (Independent from Garment Grading) ──────────────────────

/**
 * Artwork scale factor for print elements (player name, number, graphics).
 *
 * Applies a REDUCED scale relative to garment grading to prevent absurd scaling.
 * Uses 50% of the garment deviation from M — artwork doesn't stretch like fabric.
 *
 * Examples:
 *   XS  → 1 + (0.905-1)*0.5 ≈ 0.952  (−4.8% instead of −9.5%)
 *   S   → 1 + (0.952-1)*0.5 ≈ 0.976  (−2.4% instead of −4.8%)
 *   M   → 1.000
 *   XL  → 1 + (1.095-1)*0.5 ≈ 1.048  (+4.8% instead of +9.5%)
 *   2XL → 1 + (1.143-1)*0.5 ≈ 1.071  (+7.1% instead of +14.3%)
 */
export function getArtworkScaleFactor(size: string): number {
  const garmentScale = getGarmentScaleFactor(size);
  const deviation = garmentScale - 1.0;
  // 50% dampening: artwork scales half as much as the garment
  return Number((1.0 + deviation * 0.5).toFixed(4));
}

// ─── Typography Auto-Fit ──────────────────────────────────────────────────────

/**
 * Calculate the font scale needed to fit a player name within a safe-zone width.
 *
 * Uses capital letter approximation: ~0.62× font height per character.
 * Returns a value between minScale (max squeeze) and 1.0 (fits fine).
 *
 * @param name            Player name string
 * @param safeWidthInches Print-safe width in inches
 * @param fontHeightInches Font height in inches (e.g. rules.playerNameHeightInches)
 * @param minScale        Minimum allowed squeeze (default: 0.45)
 */
export function getTypographyScale(
  name: string,
  safeWidthInches: number,
  fontHeightInches: number,
  minScale = 0.45,
): number {
  if (!name || name.length === 0 || safeWidthInches <= 0) return 1.0;

  // Approximate rendered width for all-caps condensed athletic font (~0.62em)
  const estimatedWidthInches = name.length * fontHeightInches * 0.62;

  if (estimatedWidthInches <= safeWidthInches) return 1.0;

  const ratio = safeWidthInches / estimatedWidthInches;
  return Math.max(minScale, Number(ratio.toFixed(3)));
}

// ─── Print Area ────────────────────────────────────────────────────────────────

/**
 * Get the printable area in inches for a given panel and size.
 * Subtracts seam allowance on all sides from the physical panel dimensions.
 */
export function getPrintAreaInches(
  template: GarmentTemplate,
  panel: string,
  size: string,
  seamAllowanceInches: number,
): { w: number; h: number } {
  const dims = getGarmentDimensions(template, size);
  const panelKey = panel === 'sleeves_right' ? 'sleeves' : panel;
  const d = dims[panelKey] ?? dims.front;
  return {
    w: Math.max(0, d.w - seamAllowanceInches * 2),
    h: Math.max(0, d.h - seamAllowanceInches * 2),
  };
}

// ─── Safe Zone (Size-Aware) ────────────────────────────────────────────────────

/**
 * Get bleed / safe / seam zone rects in scene pixels for a panel of given pixel size.
 *
 * Note: seam allowance, safe margin, and bleed remain FIXED in inches regardless of
 * garment size — only the panel size itself changes between sizes.
 */
export function getSafeZonePx(
  panelWidthPx: number,
  panelHeightPx: number,
  bleedInches: number,
  safeMarginInches: number,
  seamAllowanceInches: number,
): {
  bleed: { x: number; y: number; w: number; h: number } | null;
  safe:  { x: number; y: number; w: number; h: number } | null;
  seam:  { x: number; y: number; w: number; h: number } | null;
} {
  const bleedPx = bleedInches * PX_PER_INCH;
  const safePx  = safeMarginInches * PX_PER_INCH;
  const seamPx  = seamAllowanceInches * PX_PER_INCH;

  return {
    bleed: bleedPx > 0
      ? { x: -bleedPx, y: -bleedPx, w: panelWidthPx + bleedPx * 2, h: panelHeightPx + bleedPx * 2 }
      : null,
    safe: safePx > 0
      ? { x: safePx, y: safePx, w: panelWidthPx - safePx * 2, h: panelHeightPx - safePx * 2 }
      : null,
    seam: seamPx > 0
      ? { x: seamPx, y: seamPx, w: panelWidthPx - seamPx * 2, h: panelHeightPx - seamPx * 2 }
      : null,
  };
}
