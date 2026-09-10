import type {
  CutPartInput,
  StockSheetInput,
  OptimizationResult,
  OptimizerSettings,
  SheetLayout,
  PlacedPart,
} from "./types";
import {
  GuillotineSheetPacker,
  assignPartColors,
  type FitRule,
  type SplitRule,
} from "./guillotine";

type SortStrategy =
  | "AREA_DESC"
  | "MAX_DIM_DESC"
  | "LENGTH_DESC"
  | "PERIMETER_DESC"
  | "LONGER_SIDE_FIRST"
  | "ASPECT_RATIO_DESC"
  | "STRIP_CLUSTER_H"
  | "STRIP_CLUSTER_V";

interface StrategyCombo {
  name: string;
  sort: SortStrategy;
  fit: FitRule;
  split: SplitRule;
}

const TOURNAMENT_STRATEGIES: StrategyCombo[] = [
  { name: "Jinny Cluster-H (Strip by width + BSSF + StripRip)", sort: "STRIP_CLUSTER_H", fit: "BSSF", split: "STRIP_RIP" },
  { name: "Jinny Cluster-V (Strip by length + BSSF + StripCross)", sort: "STRIP_CLUSTER_V", fit: "BSSF", split: "STRIP_CROSS" },
  { name: "Jinny Classic (Area + BSSF + MaxAS)", sort: "AREA_DESC", fit: "BSSF", split: "MAXAS" },
  { name: "b_Opti MaxDim (MaxDim + BAF + StripRip)", sort: "MAX_DIM_DESC", fit: "BAF", split: "STRIP_RIP" },
  { name: "Woodwize LongerSide (LongerSide + BSSF + MaxAS)", sort: "LONGER_SIDE_FIRST", fit: "BSSF", split: "MAXAS" },
  { name: "SketchCut Perimeter (Perimeter + BLSF + MaxAS)", sort: "PERIMETER_DESC", fit: "BLSF", split: "MAXAS" },
  { name: "Compact (Area + BAF + MinAS)", sort: "AREA_DESC", fit: "BAF", split: "MINAS" },
  { name: "Length-First (Length + BSSF + LLAS)", sort: "LENGTH_DESC", fit: "BSSF", split: "LLAS" },
];

const GA_POP = 48;
const GA_ELITE = 6;
const GA_TOURNAMENT_K = 3;
const GA_CX_RATE = 0.72;
const GA_TIME_MS = 8000;

function expandParts(inputs: CutPartInput[]): CutPartInput[] {
  const expanded: CutPartInput[] = [];
  for (const part of inputs) {
    const qty = Math.max(1, Math.floor(part.qty || 1));
    for (let i = 0; i < qty; i++) {
      expanded.push({ ...part, id: `${part.id}_${i}`, qty: 1 });
    }
  }
  return expanded;
}

function sortParts(parts: CutPartInput[], strategy: SortStrategy): CutPartInput[] {
  const list = [...parts];
  switch (strategy) {
    case "AREA_DESC":
      return list.sort((a, b) => b.length * b.width - a.length * a.width);
    case "MAX_DIM_DESC":
      return list.sort((a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width));
    case "LENGTH_DESC":
      return list.sort((a, b) => b.length - a.length || b.width - a.width);
    case "PERIMETER_DESC":
      return list.sort((a, b) => 2 * (b.length + b.width) - 2 * (a.length + a.width));
    case "LONGER_SIDE_FIRST":
      return list.sort(
        (a, b) =>
          Math.max(b.length, b.width) * 10000 +
          Math.min(b.length, b.width) -
          (Math.max(a.length, a.width) * 10000 + Math.min(a.length, a.width)),
      );
    case "ASPECT_RATIO_DESC":
      return list.sort((a, b) => {
        const rB = Math.max(b.length, b.width) / Math.max(1, Math.min(b.length, b.width));
        const rA = Math.max(a.length, a.width) / Math.max(1, Math.min(a.length, a.width));
        return rB - rA;
      });
    case "STRIP_CLUSTER_H":
      return stripCluster(list, "width");
    case "STRIP_CLUSTER_V":
      return stripCluster(list, "length");
  }
}

function stripCluster(parts: CutPartInput[], dim: "width" | "length"): CutPartInput[] {
  const TOLERANCE = 15;
  const other = dim === "width" ? "length" : "width";
  const sorted = [...parts].sort((a, b) => b[dim] - a[dim]);
  const clusters: { stripHeight: number; parts: CutPartInput[] }[] = [];
  for (const part of sorted) {
    const h = part[dim];
    let found = clusters.find((c) => Math.abs(c.stripHeight - h) <= TOLERANCE);
    if (!found) {
      found = { stripHeight: h, parts: [] };
      clusters.push(found);
    }
    found.parts.push(part);
  }
  for (const c of clusters) c.parts.sort((a, b) => b[other] - a[other]);
  clusters.sort((a, b) => b.stripHeight - a.stripHeight);
  return clusters.flatMap((c) => c.parts);
}

function typeKey(p: { name: string; length: number; width: number }) {
  return `${p.name}|${p.length}|${p.width}`;
}
function typeKeyPlaced(p: { name: string; originalLength: number; originalWidth: number }) {
  return `${p.name}|${p.originalLength}|${p.originalWidth}`;
}
function sizeKey(p: { length: number; width: number; grain?: string }) {
  return `${p.length}|${p.width}|${p.grain || "none"}`;
}

function neededFromSheet(layout: SheetLayout) {
  const m = new Map<string, number>();
  for (const p of layout.placedParts) {
    const k = typeKeyPlaced(p);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function extraCopies(needed: Map<string, number>, remaining: CutPartInput[]) {
  if (needed.size === 0) return 0;
  const have = new Map<string, number>();
  for (const p of remaining) {
    const k = typeKey(p);
    have.set(k, (have.get(k) || 0) + 1);
  }
  let n = Infinity;
  for (const [k, v] of needed) n = Math.min(n, Math.floor((have.get(k) || 0) / v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function consumeTypes(remaining: CutPartInput[], needed: Map<string, number>, copies: number) {
  const want = new Map<string, number>();
  for (const [k, v] of needed) want.set(k, v * copies);
  for (let i = remaining.length - 1; i >= 0; i--) {
    const k = typeKey(remaining[i]);
    const left = want.get(k) || 0;
    if (left > 0) {
      remaining.splice(i, 1);
      want.set(k, left - 1);
    }
  }
}

function cloneLayout(layout: SheetLayout, sheetIndex: number): SheetLayout {
  return {
    ...layout,
    sheetIndex,
    placedParts: layout.placedParts.map((p, i) => ({ ...p, id: `${p.id}_x${sheetIndex}_${i}`, sheetIndex })),
    offcuts: layout.offcuts.map((o, i) => ({ ...o, id: `${o.id}_x${sheetIndex}_${i}` })),
    cutLines: layout.cutLines.map((c) => ({ ...c })),
  };
}

function packSequence(
  sequence: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
): { sheets: SheetLayout[]; unplaced: CutPartInput[] } {
  const remaining = [...sequence];
  const sheets: SheetLayout[] = [];
  const maxAllowedSheets = stockSheet.qty ?? 1000;
  let sheetIdx = 0;

  while (remaining.length > 0 && sheetIdx < maxAllowedSheets) {
    const packer = new GuillotineSheetPacker(stockSheet, settings, fit, split, sheetIdx);
    let placedAnyInPass = false;
    for (let i = 0; i < remaining.length; i++) {
      const part = remaining[i];
      const color = colorMap.get(part.id.split("_")[0]) || "#3b82f6";
      if (packer.tryPlace(part, color)) {
        remaining.splice(i, 1);
        i--;
        placedAnyInPass = true;
      }
    }
    if (!placedAnyInPass) break;
    const layout = packer.getLayout();
    sheets.push(layout);
    sheetIdx++;
    const needed = neededFromSheet(layout);
    const extra = extraCopies(needed, remaining);
    for (let c = 0; c < extra && sheetIdx < maxAllowedSheets; c++) {
      sheets.push(cloneLayout(layout, sheetIdx));
      sheetIdx++;
    }
    if (extra > 0) consumeTypes(remaining, needed, extra);
  }
  return { sheets, unplaced: remaining };
}

function packOneSheet(
  items: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
  sheetIdx: number,
) {
  const packer = new GuillotineSheetPacker(stockSheet, settings, fit, split, sheetIdx);
  const placed: CutPartInput[] = [];
  for (const part of items) {
    const color = colorMap.get(part.id.split("_")[0]) || "#3b82f6";
    if (packer.tryPlace(part, color)) placed.push(part);
  }
  return { layout: packer.getLayout(), placed };
}

function packDenseWithPatterns(
  parts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
): { sheets: SheetLayout[]; unplaced: CutPartInput[] } {
  const remaining = [...parts];
  const sheets: SheetLayout[] = [];
  const maxAllowedSheets = stockSheet.qty ?? 1000;
  let sheetIdx = 0;
  const bySize = new Map<string, CutPartInput[]>();
  for (const p of remaining) {
    const k = sizeKey(p);
    const list = bySize.get(k) ?? [];
    list.push(p);
    bySize.set(k, list);
  }
  const sizeGroups = [...bySize.entries()].sort((a, b) => {
    const aa = a[1][0].length * a[1][0].width;
    const ba = b[1][0].length * b[1][0].width;
    return ba - aa || b[1].length - a[1].length;
  });
  const used = new Set<string>();

  for (const [, group] of sizeGroups) {
    if (sheetIdx >= maxAllowedSheets) break;
    const pool = group.filter((p) => !used.has(p.id));
    if (!pool.length) continue;
    const probe = packOneSheet(pool, stockSheet, settings, fit, split, colorMap, sheetIdx);
    const nFit = probe.placed.length;
    if (nFit < 1) continue;
    if (nFit === 1 && (probe.layout.efficiencyPct || 0) < 72) continue;
    let copies = Math.floor(pool.length / nFit);
    if (copies > 1 && pool.length - copies * nFit === 1) copies -= 1;
    if (copies < 1) continue;
    for (let c = 0; c < copies && sheetIdx < maxAllowedSheets; c++) {
      sheets.push(cloneLayout(probe.layout, sheetIdx));
      sheetIdx++;
    }
    let take = nFit * copies;
    for (const p of pool) {
      if (take <= 0) break;
      if (used.has(p.id)) continue;
      used.add(p.id);
      take--;
    }
  }

  const leftover = remaining.filter((p) => !used.has(p.id));
  if (leftover.length && sheetIdx < maxAllowedSheets) {
    const rest = packSequence(leftover, stockSheet, settings, fit, split, colorMap);
    for (const s of rest.sheets) {
      if (sheetIdx >= maxAllowedSheets) break;
      sheets.push(cloneLayout(s, sheetIdx));
      sheetIdx++;
    }
    return { sheets, unplaced: rest.unplaced };
  }
  return { sheets, unplaced: leftover };
}

function placedToInput(p: PlacedPart, idx: number): CutPartInput {
  return {
    id: `${p.partId || p.id}_r${idx}`,
    name: p.name,
    length: p.originalLength,
    width: p.originalWidth,
    qty: 1,
    material: p.material,
    grain: p.grain,
    canRotate: p.grain === "none",
    unit: p.unit,
  };
}

function replaySheet(
  layout: SheetLayout,
  extras: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
) {
  const packer = new GuillotineSheetPacker(stockSheet, settings, fit, split, layout.sheetIndex);
  for (let i = 0; i < layout.placedParts.length; i++) {
    const part = placedToInput(layout.placedParts[i], i);
    const color = layout.placedParts[i].color || "#3b82f6";
    if (!packer.tryPlace(part, color)) return { layout, leftover: extras };
  }
  const leftover: CutPartInput[] = [];
  for (const part of extras) {
    const color = colorMap.get(part.id.split("_")[0]) || "#3b82f6";
    if (!packer.tryPlace(part, color)) leftover.push(part);
  }
  return { layout: packer.getLayout(), leftover };
}

function polishLayouts(
  sheetsIn: SheetLayout[],
  unplacedIn: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
): { sheets: SheetLayout[]; unplaced: CutPartInput[] } {
  let sheets = sheetsIn.map((s, i) => cloneLayout(s, i));
  let unplaced = [...unplacedIn];

  const weak = sheets.map((s, i) => ({ s, i })).filter((x) => x.s.efficiencyPct < 42);
  if (weak.length) {
    const extras: CutPartInput[] = [];
    const drop = new Set(weak.map((w) => w.i));
    for (const w of weak) w.s.placedParts.forEach((p, idx) => extras.push(placedToInput(p, idx)));
    extras.push(...unplaced);
    unplaced = extras;
    const filled: SheetLayout[] = [];
    for (const sheet of sheets.filter((_, i) => !drop.has(i))) {
      const r = replaySheet(sheet, unplaced, stockSheet, settings, fit, split, colorMap);
      filled.push(r.layout);
      unplaced = r.leftover;
    }
    sheets = filled;
    if (unplaced.length) {
      const rest = packSequence(unplaced, stockSheet, settings, fit, split, colorMap);
      sheets.push(...rest.sheets);
      unplaced = rest.unplaced;
    }
  }

  if (sheets.length >= 2 && sheets[sheets.length - 1].efficiencyPct < 72) {
    const take = Math.min(3, sheets.length);
    const head = sheets.slice(0, -take);
    const tail = sheets.slice(-take);
    const parts = tail.flatMap((t, ti) => t.placedParts.map((p, pi) => placedToInput(p, ti * 1000 + pi)));
    const oldWaste = tail.reduce((a, x) => a + x.wasteAreaMm2, 0);
    const repack = packSequence(parts, stockSheet, settings, fit, split, colorMap);
    const newWaste = repack.sheets.reduce((a, x) => a + x.wasteAreaMm2, 0);
    if (repack.unplaced.length === 0 && (repack.sheets.length < take || newWaste + 500 < oldWaste)) {
      sheets = [...head, ...repack.sheets];
    }
  }

  return { sheets: sheets.map((s, i) => cloneLayout(s, i)), unplaced };
}

function scoreLayout(sheets: SheetLayout[], unplaced: CutPartInput[]): number {
  const unplacedPenalty = unplaced.length * 1_000_000_000;
  const sheetCountPenalty = sheets.length * 100_000_000;
  const totalWasteArea = sheets.reduce((acc, s) => acc + s.wasteAreaMm2, 0);
  const last = sheets[sheets.length - 1];
  const lastEmptyPenalty = sheets.length > 1 && last ? last.wasteAreaMm2 * 3 : 0;
  const patternIds = new Set(
    sheets.map((s) =>
      s.placedParts
        .map((p) => `${p.name}|${p.originalLength}x${p.originalWidth}|${p.rotated ? "R" : "N"}|${Math.round(p.x / 8)}|${Math.round(p.y / 8)}`)
        .sort()
        .join(";"),
    ),
  );
  return unplacedPenalty + sheetCountPenalty + totalWasteArea + lastEmptyPenalty + patternIds.size * 50_000;
}

function packSingleStrategy(
  parts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  combo: StrategyCombo,
  colorMap: Map<string, string>,
) {
  const sorted = sortParts(parts, combo.sort);
  const denseRaw = packDenseWithPatterns(sorted, stockSheet, settings, combo.fit, combo.split, colorMap);
  const mixedRaw = packSequence(sorted, stockSheet, settings, combo.fit, combo.split, colorMap);
  const dense = polishLayouts(denseRaw.sheets, denseRaw.unplaced, stockSheet, settings, combo.fit, combo.split, colorMap);
  const mixed = polishLayouts(mixedRaw.sheets, mixedRaw.unplaced, stockSheet, settings, combo.fit, combo.split, colorMap);
  return scoreLayout(dense.sheets, dense.unplaced) <= scoreLayout(mixed.sheets, mixed.unplaced) ? dense : mixed;
}

function orderCrossover(p1: CutPartInput[], p2: CutPartInput[]): CutPartInput[] {
  const n = p1.length;
  if (n < 4) return [...p1];
  let a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * n);
  if (a > b) [a, b] = [b, a];
  if (b === a) b = Math.min(n, a + Math.max(2, Math.floor(n / 8)));
  const slice = p1.slice(a, b);
  const taken = new Set(slice.map((p) => p.id));
  const rest = p2.filter((p) => !taken.has(p.id));
  return [...rest.slice(0, a), ...slice, ...rest.slice(a)];
}

function mutateSequence(seq: CutPartInput[], intensity: number): CutPartInput[] {
  const child = [...seq];
  const n = child.length;
  if (n < 2) return child;
  const r = Math.random();
  if (r < 0.35 * intensity) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    [child[i], child[j]] = [child[j], child[i]];
  } else if (r < 0.6) {
    const i = Math.floor(Math.random() * (n - 1));
    const len = Math.max(2, Math.floor(Math.random() * Math.min(16, n - i)));
    const chunk = child.splice(i, len);
    chunk.reverse();
    child.splice(i, 0, ...chunk);
  } else if (r < 0.8) {
    const i = Math.floor(Math.random() * n);
    const part = child.splice(i, 1)[0];
    child.splice(Math.floor(Math.random() * (child.length + 1)), 0, part);
  } else {
    const key = sizeKey(child[Math.floor(Math.random() * n)]);
    const idxs = child.map((p, i) => (sizeKey(p) === key ? i : -1)).filter((i) => i >= 0);
    for (let k = idxs.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [child[idxs[k]], child[idxs[j]]] = [child[idxs[j]], child[idxs[k]]];
    }
  }
  if (intensity > 1.15 && Math.random() < 0.4) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    [child[i], child[j]] = [child[j], child[i]];
  }
  return child;
}

function tournamentPick(pop: CutPartInput[][], fit: number[], k: number) {
  let best = Math.floor(Math.random() * pop.length);
  for (let t = 1; t < k; t++) {
    const i = Math.floor(Math.random() * pop.length);
    if (fit[i] < fit[best]) best = i;
  }
  return pop[best];
}

function seedGaPopulation(parts: CutPartInput[], elite: CutPartInput[], size: number) {
  const sorts: SortStrategy[] = [
    "AREA_DESC", "MAX_DIM_DESC", "LENGTH_DESC", "PERIMETER_DESC",
    "LONGER_SIDE_FIRST", "ASPECT_RATIO_DESC", "STRIP_CLUSTER_H", "STRIP_CLUSTER_V",
  ];
  const pop: CutPartInput[][] = [elite, ...sorts.map((s) => sortParts(parts, s))];
  while (pop.length < size) pop.push(mutateSequence(elite, 1.35));
  return pop.slice(0, size);
}

export function runOptimizationTournament(
  inputParts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
): OptimizationResult {
  const startTime = performance.now();
  const allParts = expandParts(inputParts);
  const colorMap = assignPartColors(inputParts);

  const empty = (): OptimizationResult => ({
    sheets: [],
    unplacedParts: [],
    totalSheets: 0,
    totalPartsCount: 0,
    placedPartsCount: 0,
    totalSheetAreaM2: 0,
    totalUsedAreaM2: 0,
    totalWasteAreaM2: 0,
    reusableOffcutAreaM2: 0,
    overallEfficiencyPct: 0,
    overallWastePct: 0,
    totalCutLengthM: 0,
    executionTimeMs: 0,
    championHeuristic: "None",
  });

  if (allParts.length === 0) return empty();

  let championCombo: StrategyCombo = TOURNAMENT_STRATEGIES[0];
  let championSheets: SheetLayout[] = [];
  let championUnplaced: CutPartInput[] = [];
  let bestScore = Infinity;
  let gens = 0;
  let evals = 0;
  let stagnant = 0;

  const consider = (sheets: SheetLayout[], unplaced: CutPartInput[], combo: StrategyCombo) => {
    evals++;
    const score = scoreLayout(sheets, unplaced);
    if (score < bestScore) {
      bestScore = score;
      championCombo = combo;
      championSheets = sheets;
      championUnplaced = unplaced;
      stagnant = 0;
      return true;
    }
    stagnant++;
    return false;
  };

  let strategies = TOURNAMENT_STRATEGIES;
  if (allParts.length > 5000) strategies = [TOURNAMENT_STRATEGIES[0]];
  else if (allParts.length > 1500) strategies = [TOURNAMENT_STRATEGIES[0], TOURNAMENT_STRATEGIES[1], TOURNAMENT_STRATEGIES[7]];

  for (const combo of strategies) {
    const packed = packSingleStrategy(allParts, stockSheet, settings, combo, colorMap);
    consider(packed.sheets, packed.unplaced, combo);
  }

  if (allParts.length <= 1200) {
    const gaStart = performance.now();
    let eliteSeq = sortParts(allParts, championCombo.sort);
    const population = seedGaPopulation(allParts, eliteSeq, GA_POP);
    const fitness = population.map(() => Infinity);
    for (let i = 0; i < population.length; i++) {
      const raw = packSequence(population[i], stockSheet, settings, championCombo.fit, championCombo.split, colorMap);
      const sc = scoreLayout(raw.sheets, raw.unplaced);
      fitness[i] = sc;
      consider(raw.sheets, raw.unplaced, { ...championCombo, name: `GA seed ${i}` });
    }

    while (performance.now() - gaStart < GA_TIME_MS) {
      gens++;
      const intensity = stagnant > 80 ? 1.45 : stagnant > 40 ? 1.2 : 1;
      const next: CutPartInput[][] = [];
      const nextFit: number[] = [];

      const ranked = population
        .map((seq, i) => ({ seq, fit: fitness[i], i }))
        .sort((a, b) => a.fit - b.fit);
      for (let e = 0; e < GA_ELITE; e++) {
        next.push(ranked[e].seq);
        nextFit.push(ranked[e].fit);
      }

      while (next.length < GA_POP) {
        const p1 = tournamentPick(population, fitness, GA_TOURNAMENT_K);
        const p2 = tournamentPick(population, fitness, GA_TOURNAMENT_K);
        let child = Math.random() < GA_CX_RATE ? orderCrossover(p1, p2) : [...p1];
        child = mutateSequence(child, intensity);

        const raw = packSequence(child, stockSheet, settings, championCombo.fit, championCombo.split, colorMap);
        const close = raw.sheets.length <= championSheets.length + 1;
        const packed = close
          ? polishLayouts(raw.sheets, raw.unplaced, stockSheet, settings, championCombo.fit, championCombo.split, colorMap)
          : raw;
        const improved = consider(packed.sheets, packed.unplaced, {
          ...championCombo,
          name: `GA gen ${gens}`,
        });
        if (improved) eliteSeq = child;
        next.push(child);
        nextFit.push(scoreLayout(packed.sheets, packed.unplaced));
      }

      population.splice(0, population.length, ...next);
      fitness.splice(0, fitness.length, ...nextFit);
    }

    const polished = polishLayouts(
      championSheets,
      championUnplaced,
      stockSheet,
      settings,
      championCombo.fit,
      championCombo.split,
      colorMap,
    );
    if (scoreLayout(polished.sheets, polished.unplaced) <= bestScore) {
      championSheets = polished.sheets;
      championUnplaced = polished.unplaced;
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);
  const totalSheetAreaMm2 = championSheets.reduce((acc, s) => acc + s.totalAreaMm2, 0);
  const totalUsedAreaMm2 = championSheets.reduce((acc, s) => acc + s.usedAreaMm2, 0);
  const totalWasteAreaMm2 = Math.max(0, totalSheetAreaMm2 - totalUsedAreaMm2);
  const reusableOffcutAreaMm2 = championSheets.reduce(
    (acc, s) => acc + s.offcuts.filter((o) => o.isReusable).reduce((sum, o) => sum + o.areaMm2, 0),
    0,
  );
  const totalCutLengthMm = championSheets.reduce(
    (acc, s) => acc + s.cutLines.reduce((sum, c) => sum + Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1), 0),
    0,
  );
  const placedPartsCount = championSheets.reduce((acc, s) => acc + s.placedParts.length, 0);
  const overallEfficiencyPct = totalSheetAreaMm2 > 0 ? (totalUsedAreaMm2 / totalSheetAreaMm2) * 100 : 0;

  return {
    sheets: championSheets,
    unplacedParts: championUnplaced,
    totalSheets: championSheets.length,
    totalPartsCount: allParts.length,
    placedPartsCount,
    totalSheetAreaM2: Number((totalSheetAreaMm2 / 1_000_000).toFixed(2)),
    totalUsedAreaM2: Number((totalUsedAreaMm2 / 1_000_000).toFixed(2)),
    totalWasteAreaM2: Number((totalWasteAreaMm2 / 1_000_000).toFixed(2)),
    reusableOffcutAreaM2: Number((reusableOffcutAreaMm2 / 1_000_000).toFixed(2)),
    overallEfficiencyPct: Number(overallEfficiencyPct.toFixed(1)),
    overallWastePct: Number((100 - overallEfficiencyPct).toFixed(1)),
    totalCutLengthM: Number((totalCutLengthMm / 1000).toFixed(1)),
    executionTimeMs,
    championHeuristic: `${championCombo.name} · GA ${gens} gens / ${evals} evals`,
  };
}

export function runThicknessWiseOptimization(
  inputParts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
): OptimizationResult {
  const buckets = new Map<string, CutPartInput[]>();
  for (const p of inputParts) {
    const t = Number(p.thickness);
    const thk = Number.isFinite(t) && t > 0 ? t : stockSheet.thickness || 0;
    const mat = (p.material || stockSheet.material || "BOARD").trim().toUpperCase();
    const key = `${mat}|${thk}`;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }

  if (buckets.size <= 1) {
    const onlyKey = [...buckets.keys()][0];
    const thk = onlyKey ? Number(onlyKey.split("|")[1]) : stockSheet.thickness;
    const mat = onlyKey ? onlyKey.split("|")[0] : stockSheet.material;
    const sheet = {
      ...stockSheet,
      thickness: thk || stockSheet.thickness,
      material: mat || stockSheet.material,
      id: `${stockSheet.id}-${String(mat).slice(0, 12)}-t${thk}`,
    };
    return runOptimizationTournament(inputParts, sheet, settings);
  }

  const start = performance.now();
  const keys = [...buckets.keys()].sort((a, b) => {
    const ta = Number(a.split("|")[1]);
    const tb = Number(b.split("|")[1]);
    return tb - ta || a.localeCompare(b);
  });
  const mergedSheets: SheetLayout[] = [];
  const unplaced: CutPartInput[] = [];
  const heuristics: string[] = [];
  let sheetOffset = 0;

  for (const key of keys) {
    const group = buckets.get(key)!;
    const [mat, thkStr] = key.split("|");
    const t = Number(thkStr) || stockSheet.thickness;
    const sheet: StockSheetInput = {
      ...stockSheet,
      thickness: t,
      material: mat,
      id: `${stockSheet.id}-${mat.slice(0, 12)}-t${t}`,
      name: `${mat} ${t} mm · ${stockSheet.length}×${stockSheet.width}`,
    };
    const r = runOptimizationTournament(group, sheet, settings);
    for (const s of r.sheets) {
      const idx = sheetOffset;
      mergedSheets.push({
        ...s,
        sheetIndex: idx,
        placedParts: s.placedParts.map((p) => ({ ...p, sheetIndex: idx })),
      });
      sheetOffset++;
    }
    unplaced.push(...r.unplacedParts);
    if (r.championHeuristic) heuristics.push(`${mat} ${t}mm: ${r.championHeuristic}`);
  }

  const totalSheetAreaMm2 = mergedSheets.reduce((acc, s) => acc + s.totalAreaMm2, 0);
  const totalUsedAreaMm2 = mergedSheets.reduce((acc, s) => acc + s.usedAreaMm2, 0);
  const totalWasteAreaMm2 = Math.max(0, totalSheetAreaMm2 - totalUsedAreaMm2);
  const reusableOffcutAreaMm2 = mergedSheets.reduce(
    (acc, s) => acc + s.offcuts.filter((o) => o.isReusable).reduce((sum, o) => sum + o.areaMm2, 0),
    0,
  );
  const totalCutLengthMm = mergedSheets.reduce(
    (acc, s) => acc + s.cutLines.reduce((sum, c) => sum + Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1), 0),
    0,
  );
  const placedPartsCount = mergedSheets.reduce((acc, s) => acc + s.placedParts.length, 0);
  const totalPartsCount = inputParts.reduce((s, p) => s + Math.max(1, Math.floor(p.qty || 1)), 0);
  const overallEfficiencyPct = totalSheetAreaMm2 > 0 ? (totalUsedAreaMm2 / totalSheetAreaMm2) * 100 : 0;

  return {
    sheets: mergedSheets,
    unplacedParts: unplaced,
    totalSheets: mergedSheets.length,
    totalPartsCount,
    placedPartsCount,
    totalSheetAreaM2: Number((totalSheetAreaMm2 / 1_000_000).toFixed(2)),
    totalUsedAreaM2: Number((totalUsedAreaMm2 / 1_000_000).toFixed(2)),
    totalWasteAreaM2: Number((totalWasteAreaMm2 / 1_000_000).toFixed(2)),
    reusableOffcutAreaM2: Number((reusableOffcutAreaMm2 / 1_000_000).toFixed(2)),
    overallEfficiencyPct: Number(overallEfficiencyPct.toFixed(1)),
    overallWastePct: Number((100 - overallEfficiencyPct).toFixed(1)),
    totalCutLengthM: Number((totalCutLengthMm / 1000).toFixed(1)),
    executionTimeMs: Math.round(performance.now() - start),
    championHeuristic: heuristics.join(" · ") || "Thickness-wise",
  };
}
