import type { OptimizationResult, PlacedPart, SheetLayout } from "./types";

export type PatternGroup = {
  id: string;
  copies: number;
  layout: SheetLayout;
  sheetIndexes: number[];
  efficiencyPct: number;
  wastePct: number;
  partCount: number;
};

export type MaterialBoardGroup = {
  key: string;
  label: string;
  material: string;
  thickness: number;
  sheetCount: number;
  uniquePatterns: number;
  partsPlaced: number;
  usedM2: number;
  sheetM2: number;
  yieldPct: number;
  wastePct: number;
  patterns: PatternGroup[];
};

function q(n: number, step = 8) {
  return Math.round(n / step) * step;
}

function partToken(p: PlacedPart) {
  return `${p.name}|${p.originalLength}x${p.originalWidth}|${p.rotated ? "R" : "N"}|${q(p.x)}|${q(p.y)}`;
}

export function sheetFingerprint(sheet: SheetLayout) {
  const tokens = sheet.placedParts.map(partToken).sort();
  const mat = (sheet.stockSheet.material || "").toUpperCase();
  const thk = sheet.stockSheet.thickness || 0;
  return `${mat}|${thk}|${tokens.join(";")}`;
}

export function groupSheetsByPattern(sheets: SheetLayout[]): PatternGroup[] {
  const map = new Map<string, PatternGroup>();
  for (const sheet of sheets) {
    const id = sheetFingerprint(sheet);
    const existing = map.get(id);
    if (existing) {
      existing.copies += 1;
      existing.sheetIndexes.push(sheet.sheetIndex);
    } else {
      map.set(id, {
        id,
        copies: 1,
        layout: sheet,
        sheetIndexes: [sheet.sheetIndex],
        efficiencyPct: sheet.efficiencyPct,
        wastePct: sheet.wastePct,
        partCount: sheet.placedParts.length,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.copies - a.copies || b.efficiencyPct - a.efficiencyPct);
}

export function groupBoardsByMaterial(result: OptimizationResult): MaterialBoardGroup[] {
  const byKey = new Map<string, SheetLayout[]>();
  for (const sheet of result.sheets) {
    const mat =
      sheet.placedParts[0]?.material ||
      sheet.stockSheet.material ||
      "BOARD";
    const thk = sheet.stockSheet.thickness || 0;
    const key = `${mat.toUpperCase()}_${thk}`;
    const list = byKey.get(key) ?? [];
    list.push(sheet);
    byKey.set(key, list);
  }

  const groups: MaterialBoardGroup[] = [];
  for (const [key, sheets] of byKey) {
    const patterns = groupSheetsByPattern(sheets);
    const used = sheets.reduce((s, x) => s + x.usedAreaMm2, 0);
    const total = sheets.reduce((s, x) => s + x.totalAreaMm2, 0);
    const partsPlaced = sheets.reduce((s, x) => s + x.placedParts.length, 0);
    const thk = sheets[0]?.stockSheet.thickness || 0;
    const material =
      sheets[0]?.placedParts[0]?.material || sheets[0]?.stockSheet.material || "BOARD";
    const yieldPct = total > 0 ? (used / total) * 100 : 0;
    groups.push({
      key,
      label: `${material}_${thk}`,
      material,
      thickness: thk,
      sheetCount: sheets.length,
      uniquePatterns: patterns.length,
      partsPlaced,
      usedM2: Number((used / 1_000_000).toFixed(2)),
      sheetM2: Number((total / 1_000_000).toFixed(2)),
      yieldPct: Number(yieldPct.toFixed(1)),
      wastePct: Number((100 - yieldPct).toFixed(1)),
      patterns,
    });
  }

  return groups.sort((a, b) => b.thickness - a.thickness || a.material.localeCompare(b.material));
}
