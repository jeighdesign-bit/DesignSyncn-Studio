/**
 * ProductionEngine
 * 
 * Master-template production engine.
 * Single source of truth for design layer resolution, typography auto-fitting,
 * anchored placement, and validation of custom roster variations.
 */

import type { RosterPlayer, ProductionRule, SponsorLogo } from '../types';
import { getAnchorCoords } from './measurements';
import {
  getArtworkScaleFactor,
  getTypographyScale,
  getGarmentScaleFactor
} from './garment-size-engine';

export interface PlayerResolvedLayout {
  playerId: string;
  name: string;
  size: string;
  nameScale: number; // typography auto-fit squeeze scale
  panels: Record<string, any[]>; // resolved fabric objects per panel
  warnings: ProductionWarning[];
}

export interface ProductionWarning {
  type: 'warning' | 'error';
  message: string;
  code: 'squeeze_critical' | 'squeeze_moderate' | 'logo_low_res' | 'overflow_warning';
  panel?: string;
}

/**
 * Resolves a single panel layout for a specific player.
 * Applies size grading, typography auto-fit, centering, anchors, and collision prevention.
 */
export function resolvePlayerPanelLayout(
  player: RosterPlayer,
  rules: ProductionRule,
  panelObjects: any[],
  panel: string,
  logos: SponsorLogo[] = [],
  teamName = 'TEAM'
): any[] {
  const activeRules = rules || {
    frontLogoSpacingCollarInches: 3.5,
    chestAlignment: 'center',
    sponsorSpacingInches: 1.5,
    playerNameHeightInches: 2.0,
    playerNumberHeightInches: 6.0,
    surnameSpacingCollarInches: 4.5,
    maxTextWidthInches: 12.0,
    autoFitSizing: true,
    safeMarginInches: 0.5,
    bleedInches: 1.8,
    seamAllowanceInches: 0.3,
    autoCenter: true,
    dynamicScaling: true
  };

  const size = player.size;
  const isSleevesRight = panel === 'sleeves_right';
  const normPanel = isSleevesRight ? 'sleeves' : panel;

  // Reference canvas boundaries
  const panelW = normPanel === 'front' || normPanel === 'back' ? 1120 : normPanel === 'sleeves' ? 960 : 560;
  const panelH = normPanel === 'front' || normPanel === 'back' ? 1360 : normPanel === 'sleeves' ? 640 : 320;

  const artworkScaleFactor = activeRules.dynamicScaling ? getArtworkScaleFactor(size) : 1.0;
  const sizeScale = getGarmentScaleFactor(size);

  // 1. Parse and clone objects, apply variables & scaling rules
  const resolvedObjects = panelObjects.map((obj: any) => {
    if (!obj) return null;
    const o = JSON.parse(JSON.stringify(obj));
    if (!o) return null;
    if (o.visible === false) return o;

    // Cache original template text
    if (o.__originalText === undefined) {
      o.__originalText = o.text || '';
    }

    const templateText = o.__originalText || '';
    const textVal = templateText.trim().toUpperCase();

    // Identify standard design roles
    const isName = !!(
      o.__isNameText ||
      textVal === 'SURNAME' ||
      textVal === 'PLAYER NAME' ||
      textVal === 'NAME' ||
      textVal.includes('{{PLAYER_NAME}}')
    );

    const isNumber = !!(
      o.__isNumberText ||
      textVal === '00' ||
      textVal === 'PLAYER NUMBER' ||
      textVal === 'NUMBER' ||
      textVal.includes('{{PLAYER_NUMBER}}')
    );

    const isPrimaryLogo = o.__id === 'logo-primary' || (o.type === 'image' && o.__layerName?.includes('Primary Crest'));
    const isSleeveLogo = o.__id === 'logo-sleeve' || (o.type === 'image' && o.__layerName?.includes('Sleeve Sponsor'));

    o.__isNameText = isName;
    o.__isNumberText = isNumber;
    o.__isPrimaryLogo = isPrimaryLogo;
    o.__isSleeveLogo = isSleeveLogo;

    // ── Text Elements Sizing & Replacements ──
    if (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text') {
      let content = templateText;
      if (isName) {
        const rawName = (player.name || 'UNNAMED').toUpperCase();
        content = content.includes('{{PLAYER_NAME}}') ? content.replace(/\{\{PLAYER_NAME\}\}/gi, rawName) : rawName;
      } else if (isNumber) {
        const rawNum = player.number || '0';
        content = content.includes('{{PLAYER_NUMBER}}') ? content.replace(/\{\{PLAYER_NUMBER\}\}/gi, rawNum) : rawNum;
      }

      content = content.replace(/\{\{TEAM_NAME\}\}/gi, teamName.toUpperCase());
      content = content.replace(/\{\{PLAYER_SIZE\}\}/gi, player.size || 'M');

      o.text = content;

      // Base font size determination
      if (!o.__baseFontSize) {
        o.__baseFontSize = isName
          ? (activeRules.playerNameHeightInches * 40)
          : isNumber
            ? (activeRules.playerNumberHeightInches * 40)
            : (o.fontSize || 32);
      }

      // Auto-fit calculation
      let textScale = artworkScaleFactor;
      if (isName) {
        const safeWidthInches = activeRules.maxTextWidthInches > 0
          ? activeRules.maxTextWidthInches
          : (panelW / 40) * 0.78;
        const typoScale = getTypographyScale(content, safeWidthInches, activeRules.playerNameHeightInches);
        textScale = artworkScaleFactor * typoScale;
        o.__nameScale = typoScale; // save auto-fit specific squeeze
      }

      o.fontSize = Math.round(o.__baseFontSize * textScale);
    }

    // ── Sponsor Logo fixed size matching ──
    if (o.type === 'image') {
      let isVisible = true;
      if (isPrimaryLogo && logos[0]) {
        const logoId = logos[0].id;
        isVisible = player.sponsorMapping ? player.sponsorMapping.includes(logoId) : true;
        if (logos[0].url) o.src = logos[0].url;
      } else if (isSleeveLogo && (logos[1] || logos[0])) {
        const logoId = (logos[1] || logos[0]).id;
        isVisible = player.sponsorMapping ? player.sponsorMapping.includes(logoId) : true;
        if ((logos[1] || logos[0]).url) o.src = (logos[1] || logos[0]).url;
      }
      o.visible = isVisible;

      // Preserve brand integrity - keep logo at constant physical size
      if (!o.__baseScaleX) o.__baseScaleX = o.scaleX || 1.0;
      if (!o.__baseScaleY) o.__baseScaleY = o.scaleY || 1.0;
      o.scaleX = o.__baseScaleX;
      o.scaleY = o.__baseScaleY;
    }

    // ── Garment Outline Path Sizing ──
    if (o.type === 'path' && o.__id && o.__id.startsWith('artboard-path-')) {
      o.scaleX = sizeScale;
      o.scaleY = sizeScale;
    }

    return o;
  }).filter(Boolean);

  // 2. Alignment, anchoring, and offsets in inches
  resolvedObjects.forEach((o: any) => {
    if (o.visible === false || o.__isArtboard) return;

    let anchor = o.__anchor;
    let ox = o.__offsetXInches;
    let oy = o.__offsetYInches;

    // Default production anchoring fallback rules
    if (!anchor) {
      if (normPanel === 'back' && o.__isNameText) {
        anchor = 'collar_base';
        ox = 0;
        oy = activeRules.surnameSpacingCollarInches;
      } else if (normPanel === 'back' && o.__isNumberText) {
        anchor = 'collar_base';
        ox = 0;
        oy = activeRules.surnameSpacingCollarInches + activeRules.playerNameHeightInches + 1.0;
      } else if (normPanel === 'front' && o.__isPrimaryLogo) {
        anchor = 'collar_base';
        ox = activeRules.chestAlignment === 'left' ? -5.0 : activeRules.chestAlignment === 'right' ? 5.0 : 0;
        oy = activeRules.frontLogoSpacingCollarInches;
      } else if (normPanel === 'front' && o.__isNumberText) {
        anchor = 'chest_center';
        ox = 0;
        oy = 3.0; // 3 inches below chest logo by default
      } else if (normPanel === 'back' && o.__isPrimaryLogo) {
        anchor = 'collar_base';
        ox = 0;
        oy = 3.0; // 3 inches below back neck curve
      } else if (normPanel === 'sleeves' && o.__isSleeveLogo) {
        anchor = 'sleeve_cuff'; // 3 inches up from bottom cuff
        ox = 0;
        oy = -3.0;
      } else {
        // Fallback to visual landmarks
        anchor = normPanel === 'front' ? 'chest_center' : normPanel === 'back' ? 'mid_back' : 'sleeve_center';
        ox = 0;
        oy = 0;
      }
      o.__anchor = anchor;
      o.__offsetXInches = ox;
      o.__offsetYInches = oy;
    }

    const anchorCoords = getAnchorCoords(panel, anchor, panelW, panelH);
    let targetCx = anchorCoords.x + ox * 40;
    let targetCy = anchorCoords.y + oy * 40;

    // Apply strict centering rule for names & numbers
    if (activeRules.autoCenter && (o.__isNameText || o.__isNumberText)) {
      targetCx = panelW / 2;
    }

    // Set coordinates based on origin
    const w = (o.width || 100) * (o.scaleX || 1.0);
    const h = (o.height || 100) * (o.scaleY || 1.0);

    if (o.originX === 'center') {
      o.left = targetCx;
    } else {
      o.left = targetCx - w / 2;
    }

    if (o.originY === 'center') {
      o.top = targetCy;
    } else {
      o.top = targetCy - h / 2;
    }
  });

  // 3. Collision Prevention: shifting number if overlapping surname
  if (rules.collisionPrevention && normPanel === 'back') {
    const nameObj = resolvedObjects.find(o => o.__isNameText && o.visible !== false);
    const numObj = resolvedObjects.find(o => o.__isNumberText && o.visible !== false);

    if (nameObj && numObj) {
      const nameH = (nameObj.height || nameObj.fontSize || 40) * (nameObj.scaleY || 1);
      const numH = (numObj.height || numObj.fontSize || 80) * (numObj.scaleY || 1);

      const nameCenterY = nameObj.originY === 'center' ? nameObj.top : nameObj.top + nameH / 2;
      const numCenterY = numObj.originY === 'center' ? numObj.top : numObj.top + numH / 2;

      const nameBottom = nameCenterY + nameH / 2;
      const numTop = numCenterY - numH / 2;

      const minGap = 15; // gap in px
      if (numTop < nameBottom + minGap) {
        const overlap = (nameBottom + minGap) - numTop;
        numObj.top += overlap;

        const numAnchor = numObj.__anchor || 'collar_base';
        const anchorCoords = getAnchorCoords(panel, numAnchor, panelW, panelH);
        numObj.__offsetYInches = Number(((numObj.top - anchorCoords.y) / 40).toFixed(3));
      }
    }
  }

  return resolvedObjects;
}

/**
 * Validates a single resolved layout, checking for overlaps, squeezed texts, and logo quality.
 */
export function validatePlayerLayout(
  player: RosterPlayer,
  rules: ProductionRule,
  resolvedPanels: Record<string, any[]>,
  logos: SponsorLogo[]
): ProductionWarning[] {
  const activeRules = rules || {
    safeMarginInches: 0.5
  };

  const warnings: ProductionWarning[] = [];

  // 1. Typography squeeze warnings
  const nameScale = player.nameScale;
  if (nameScale < 0.6) {
    warnings.push({
      type: 'error',
      message: `"${player.name}" is critically squeezed to ${Math.round(nameScale * 100)}% to fit maximum width constraint.`,
      code: 'squeeze_critical',
      panel: 'back'
    });
  } else if (nameScale < 0.8) {
    warnings.push({
      type: 'warning',
      message: `"${player.name}" is squeezed to ${Math.round(nameScale * 100)}% for safe print-zone fitting.`,
      code: 'squeeze_moderate',
      panel: 'back'
    });
  }

  // 2. Logo quality check
  const mappedSponsors = player.sponsorMapping || [];
  mappedSponsors.forEach(sponsorId => {
    const logo = logos.find(l => l.id === sponsorId);
    if (logo && logo.resolutionStatus === 'low') {
      warnings.push({
        type: 'warning',
        message: `Sponsor logo "${logo.name}" has low resolution (${logo.dpi} DPI). Print may be blurry.`,
        code: 'logo_low_res'
      });
    }
  });

  // 3. Simple bounds warning check (safety zone overflow)
  Object.entries(resolvedPanels).forEach(([panelName, objects]) => {
    const isSleevesRight = panelName === 'sleeves_right';
    const normPanel = isSleevesRight ? 'sleeves' : panelName;
    const panelW = normPanel === 'front' || normPanel === 'back' ? 1120 : normPanel === 'sleeves' ? 960 : 560;
    const panelH = normPanel === 'front' || normPanel === 'back' ? 1360 : normPanel === 'sleeves' ? 640 : 320;

    const safeMarginPx = (activeRules.safeMarginInches || 0.5) * 40;
    const leftLimit = safeMarginPx;
    const rightLimit = panelW - safeMarginPx;
    const topLimit = safeMarginPx;
    const bottomLimit = panelH - safeMarginPx;

    objects.forEach(o => {
      if (o.visible === false || o.__isArtboard || o.__id?.startsWith('bg-')) return;
      const w = (o.width || 100) * (o.scaleX || 1.0);
      const h = (o.height || 100) * (o.scaleY || 1.0);

      const cx = o.left;
      const cy = o.top;

      const itemLeft = cx - w / 2;
      const itemRight = cx + w / 2;
      const itemTop = cy - h / 2;
      const itemBottom = cy + h / 2;

      if (o.__isNameText || o.__isNumberText || o.__isPrimaryLogo) {
        if (itemLeft < leftLimit || itemRight > rightLimit || itemTop < topLimit || itemBottom > bottomLimit) {
          warnings.push({
            type: 'warning',
            message: `Design element "${o.__layerName || o.type}" extends outside size-graded safe print zone.`,
            code: 'overflow_warning',
            panel: panelName
          });
        }
      }
    });
  });

  return warnings;
}

/**
 * Centralized layout resolver for a single roster player.
 */
export function resolvePlayerLayout(
  player: RosterPlayer,
  rules: ProductionRule,
  canvasStates: Record<string, string>,
  logos: SponsorLogo[],
  teamName = 'TEAM'
): PlayerResolvedLayout {
  const resolvedPanels: Record<string, any[]> = {};

  Object.entries(canvasStates).forEach(([panelKey, stateJson]) => {
    let objects: any[] = [];
    try {
      if (stateJson) {
        const parsed = JSON.parse(stateJson);
        objects = parsed.objects || [];
      }
    } catch (e) {
      console.error(`Failed to parse template state for panel ${panelKey}:`, e);
    }
    resolvedPanels[panelKey] = resolvePlayerPanelLayout(player, rules, objects, panelKey, logos, teamName);
  });

  // Calculate dynamic typography scale based on Surname element in back panel
  let resolvedNameScale = player.nameScale || 1.0;
  const backPanelObjects = resolvedPanels.back || [];
  const surnameObject = backPanelObjects.find(o => o.__isNameText);
  if (surnameObject && surnameObject.__nameScale) {
    resolvedNameScale = surnameObject.__nameScale;
  }

  const warnings = validatePlayerLayout(player, rules, resolvedPanels, logos);

  return {
    playerId: player.id,
    name: player.name,
    size: player.size,
    nameScale: resolvedNameScale,
    panels: resolvedPanels,
    warnings
  };
}

/**
 * Batch resolve layout mapping for all players in the roster.
 */
export function batchResolveRoster(
  roster: RosterPlayer[],
  rules: ProductionRule,
  canvasStates: Record<string, string>,
  logos: SponsorLogo[],
  teamName = 'TEAM'
): Map<string, PlayerResolvedLayout> {
  const result = new Map<string, PlayerResolvedLayout>();
  roster.forEach(player => {
    result.set(player.id, resolvePlayerLayout(player, rules, canvasStates, logos, teamName));
  });
  return result;
}

/**
 * Produces a stamped Fabric.js JSON string for a specific player and panel.
 * Perfect drop-in for the SVG exporter or background canvas renderer.
 */
export function generateVariation(
  player: RosterPlayer,
  rules: ProductionRule,
  canvasStateJSON: string,
  panelName: string,
  logos: SponsorLogo[],
  teamName = 'TEAM'
): string {
  try {
    const parsed = JSON.parse(canvasStateJSON);
    const objects = parsed.objects || [];
    const resolvedObjects = resolvePlayerPanelLayout(player, rules, objects, panelName, logos, teamName);
    return JSON.stringify({
      ...parsed,
      objects: resolvedObjects
    });
  } catch (e) {
    console.error('Failed to generate variation JSON:', e);
    return canvasStateJSON;
  }
}
