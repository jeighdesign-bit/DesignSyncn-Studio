export type Stage = 'brief' | 'design' | 'studio' | 'export';

export type ApparelType = string; // e.g. 'tshirt', 'hoodie', 'jersey', etc.

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
  baseColor: string;
}

export interface SponsorLogo {
  id: string;
  name: string;
  url: string;
  dpi: number;
  widthPx: number;
  heightPx: number;
  resolutionStatus: 'high' | 'low';
  sizeInches: number;
  offsetCollarInches: number;
}

export interface DesignPreset {
  id: string;
  name: string;
  prompt: string;
  style: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface RosterPlayer {
  id: string;
  name: string;
  number: string;
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL';
  nameScale: number; // calculated scale factor to fit safe margin
  variant?: 'Variant A' | 'Variant B' | 'Variant C';
  status?: 'Mapped' | 'Ready for Export' | 'Pending';
  sponsorMapping?: string[]; // IDs of mapped sponsor logos
}

export interface ProductionRule {
  // Logo rules
  frontLogoSpacingCollarInches: number;
  chestAlignment: 'left' | 'center' | 'right';
  sponsorSpacingInches: number;
  
  // Typography rules
  playerNameHeightInches: number;
  playerNumberHeightInches: number;
  surnameSpacingCollarInches: number;
  maxTextWidthInches: number;
  autoFitSizing: boolean;
  
  // Safety & Bleeds rules
  safeMarginInches: number;
  bleedInches: number;
  seamAllowanceInches: number;

  // Smart Automation
  autoCenter: boolean;
  smartSnapping: boolean;
  collisionPrevention: boolean;
  dynamicScaling: boolean;
}

export interface Project {
  id?: string;
  name: string;
  teamName?: string;
  designVision?: string;
  stylePreference?: string;
  stage: Stage;
  apparelType: ApparelType;
  baseColors: ColorPalette;
  logos: SponsorLogo[];
  prompt: string;
  selectedPresetId: string;
  rules: ProductionRule;
  roster: RosterPlayer[];
  measurementUnit: 'inches' | 'cm' | 'mm' | 'px';
  activePlayerId: string;
  
  // Canvas layout controls
  activeCanvasView: 'front' | 'back' | 'sleeves' | 'collar' | 'full' | 'roster_previews';
  hiddenLayers: string[];
  lockedLayers: string[];
  selectedLayerId: string;

  // Project setup & management metadata
  templateChoice?: string;
  canvasSize?: string;
  dpi?: number;
  colorMode?: 'RGB' | 'CMYK';
  createdAt?: string;
  isArchived?: boolean;
  canvasStates?: {
    front?: string;
    back?: string;
    sleeves?: string;
    collar?: string;
  };
  maxUnlockedStage?: Stage;
}
