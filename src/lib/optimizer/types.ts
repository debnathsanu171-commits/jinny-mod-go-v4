export type GrainDirection = "none" | "length" | "width";
export type SheetGrain = "none" | "length" | "width";

export type CutPreference = "guillotine-rip" | "guillotine-cross" | "nested";

export interface CutPartInput {
  id: string;
  name: string;
  length: number; // mm
  width: number; // mm
  qty: number;
  material: string;
  grain: GrainDirection;
  canRotate: boolean;
  priority?: "Normal" | "High";
  color?: string;
  unit?: string;
  notes?: string;
  thickness?: number;
  srNo?: string;
  edge1?: string;
  edge2?: string;
  edge3?: string;
  edge4?: string;
  projectName?: string;
  clientName?: string;
}

export interface StockSheetInput {
  id: string;
  name: string;
  length: number; // mm (e.g. 2440)
  width: number; // mm (e.g. 1220)
  thickness: number; // mm (e.g. 18)
  material: string;
  grain: SheetGrain;
  trimTop: number; // mm
  trimBottom: number;
  trimLeft: number;
  trimRight: number;
  qty?: number; // undefined = unlimited
}

export interface PlacedPart {
  id: string;
  partId: string;
  name: string;
  material: string;
  unit?: string;
  x: number; // mm from top-left of sheet
  y: number;
  width: number; // mm as placed on sheet
  length: number; // mm as placed on sheet
  originalLength: number;
  originalWidth: number;
  rotated: boolean;
  grain: GrainDirection;
  sheetIndex: number;
  color: string;
}

export interface Offcut {
  id: string;
  x: number;
  y: number;
  width: number;
  length: number;
  areaMm2: number;
  isReusable: boolean; // e.g. >= 300x300mm
}

export interface CutLine {
  id: number;
  orientation: "horizontal" | "vertical";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kerf: number;
  stage: number; // 1 = Primary rip/cross, 2 = Secondary, etc.
}

export interface SheetLayout {
  sheetIndex: number;
  stockSheet: StockSheetInput;
  placedParts: PlacedPart[];
  offcuts: Offcut[];
  cutLines: CutLine[];
  usedAreaMm2: number;
  totalAreaMm2: number;
  wasteAreaMm2: number;
  efficiencyPct: number;
  wastePct: number;
}

export interface OptimizerSettings {
  kerfMm: number; // Saw blade kerf, e.g. 3.2 or 4.0
  trimMm: number; // Uniform perimeter trim, e.g. 10
  cutPreference: CutPreference; // Guillotine rip-first or cross-first
  minReusableWidthMm: number; // Minimum dimension for reusable offcuts, e.g. 200
  minReusableLengthMm: number; // e.g. 300
  allowPartRotation: boolean; // Global toggle for rotational optimization
}

export interface OptimizationResult {
  sheets: SheetLayout[];
  unplacedParts: CutPartInput[];
  totalSheets: number;
  totalPartsCount: number;
  placedPartsCount: number;
  totalSheetAreaM2: number;
  totalUsedAreaM2: number;
  totalWasteAreaM2: number;
  reusableOffcutAreaM2: number;
  overallEfficiencyPct: number;
  overallWastePct: number;
  totalCutLengthM: number;
  executionTimeMs: number;
  championHeuristic: string;
}

export const STANDARD_SHEET_PRESETS: StockSheetInput[] = [
  {
    id: "sheet-8x4-18",
    name: "Standard 8x4 ft (2440 × 1220 × 18 mm)",
    length: 2440,
    width: 1220,
    thickness: 18,
    material: "HDHMR",
    grain: "length",
    trimTop: 10,
    trimBottom: 10,
    trimLeft: 10,
    trimRight: 10,
  },
  {
    id: "sheet-8x4-12",
    name: "Standard 8x4 ft (2440 × 1220 × 12 mm)",
    length: 2440,
    width: 1220,
    thickness: 12,
    material: "MDF",
    grain: "length",
    trimTop: 10,
    trimBottom: 10,
    trimLeft: 10,
    trimRight: 10,
  },
  {
    id: "sheet-9x6-18",
    name: "Jumbo 9x6 ft (2745 × 1830 × 18 mm)",
    length: 2745,
    width: 1830,
    thickness: 18,
    material: "PARTICLE",
    grain: "length",
    trimTop: 10,
    trimBottom: 10,
    trimLeft: 10,
    trimRight: 10,
  },
  {
    id: "sheet-7x4-18",
    name: "Compact 7x4 ft (2135 × 1220 × 18 mm)",
    length: 2135,
    width: 1220,
    thickness: 18,
    material: "PLYWOOD",
    grain: "length",
    trimTop: 10,
    trimBottom: 10,
    trimLeft: 10,
    trimRight: 10,
  },
];

export const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  kerfMm: 3.2,
  trimMm: 10,
  cutPreference: "guillotine-rip",
  minReusableWidthMm: 200,
  minReusableLengthMm: 300,
  allowPartRotation: true,
};
