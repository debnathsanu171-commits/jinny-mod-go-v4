import type { CutPartInput, GrainDirection } from "./types";

export const JINNY_CSV_HEADERS = [
  "SR. NO.",
  "Part Name",
  "Length",
  "Width",
  "Qty",
  "Thick",
  "Material",
  "Grain",
  "Edge-1",
  "Edge-2",
  "Edge-3",
  "Edge-4",
  "Pro. Name",
  "UNIT CODE",
  "Clint name",
] as const;

export const JINNY_CSV_TEMPLATE = `${JINNY_CSV_HEADERS.join(",")}
1,TOP,564,558,1,17,BSL 56163SF,0,0.8MM,0.8MM,0.8MM,0.8MM,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
2,BOTTOM,564,558,1,17,BSL 56163SF,0,0.8MM,0.8MM,0.8MM,0.8MM,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
3,LH SIDE,2288,558,1,17,BSL 56163SF,0,0.8MM,0.8MM,0.8MM,0.8MM,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
4,RH SIDE,2288,558,1,17,BSL 56163SF,0,0.8MM,0.8MM,0.8MM,0.8MM,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
5,ADJ. SHELF,564,521,4,17,BSL 56163SF,0,0.8MM,0.8MM,0.8MM,0.8MM,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
6,BACK PANEL,2274,584,1,9,BSL 56163SF,0,NO EB,NO EB,NO EB,NO EB,ELE-A TALL UNIT-1,A,SAMPLE CLIENT
`;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if ((c === "," || c === "\t" || c === ";") && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function norm(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const ALIAS: Record<string, string> = {
  sr: "sr",
  "sr no": "sr",
  sn: "sr",
  "s n": "sr",
  "part name": "name",
  partname: "name",
  name: "name",
  description: "name",
  length: "length",
  l: "length",
  len: "length",
  width: "width",
  w: "width",
  wid: "width",
  qty: "qty",
  qnty: "qty",
  quantity: "qty",
  thick: "thickness",
  thickness: "thickness",
  thk: "thickness",
  "thk mm": "thickness",
  material: "material",
  mat: "material",
  grain: "grain",
  "edge 1": "edge1",
  edge1: "edge1",
  eb1: "edge1",
  "edge 2": "edge2",
  edge2: "edge2",
  "edge 3": "edge3",
  edge3: "edge3",
  "edge 4": "edge4",
  edge4: "edge4",
  "pro name": "projectName",
  "project name": "projectName",
  project: "projectName",
  "unit code": "unitCode",
  unitcode: "unitCode",
  unit: "unitCode",
  "clint name": "clientName",
  "client name": "clientName",
  client: "clientName",
};

function parseGrain(v: string): GrainDirection {
  const s = (v || "").trim().toLowerCase();
  if (s === "1" || s === "length" || s === "yes" || s === "y" || s === "true") return "length";
  if (s === "width") return "width";
  return "none";
}

function num(v: string) {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isHeaderRow(cols: string[]) {
  const joined = cols.map(norm).join(" ");
  return /part name|length|thick|sr no|unit code|clint|client/.test(joined);
}

export function parseCutlistCsv(text: string): CutPartInput[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];

  const first = splitCsvLine(lines[0]);
  let start = 0;
  let map: Record<string, number> | null = null;

  if (isHeaderRow(first)) {
    map = {};
    first.forEach((h, i) => {
      const key = ALIAS[norm(h)];
      if (key && map![key] === undefined) map![key] = i;
    });
    start = 1;
  }

  const parsed: CutPartInput[] = [];
  const now = Date.now();

  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    let name: string;
    let length: number;
    let width: number;
    let qty: number;
    let thickness: number;
    let material: string;
    let grain: GrainDirection;
    let unit: string | undefined;
    let projectName: string | undefined;
    let clientName: string | undefined;
    let sr: string | undefined;
    let edge1: string | undefined;
    let edge2: string | undefined;
    let edge3: string | undefined;
    let edge4: string | undefined;

    if (map) {
      const get = (k: string) => (map![k] !== undefined ? cols[map![k]] ?? "" : "");
      name = get("name") || `Part ${parsed.length + 1}`;
      length = num(get("length"));
      width = num(get("width"));
      qty = Math.max(1, num(get("qty")) || 1);
      thickness = num(get("thickness"));
      material = get("material") || "";
      grain = parseGrain(get("grain"));
      unit = get("unitCode") || undefined;
      projectName = get("projectName") || undefined;
      clientName = get("clientName") || undefined;
      sr = get("sr") || undefined;
      edge1 = get("edge1") || undefined;
      edge2 = get("edge2") || undefined;
      edge3 = get("edge3") || undefined;
      edge4 = get("edge4") || undefined;
    } else if (cols.length >= 6 && !Number.isFinite(Number(cols[1])) && Number.isFinite(Number(cols[2]))) {
      // SR, Part Name, Length, Width, Qty, Thick, Material, Grain, E1-4, Pro, Unit, Client
      sr = cols[0];
      name = cols[1] || `Part ${parsed.length + 1}`;
      length = num(cols[2]);
      width = num(cols[3]);
      qty = Math.max(1, num(cols[4]) || 1);
      thickness = num(cols[5]);
      material = cols[6] || "";
      grain = parseGrain(cols[7] || "");
      edge1 = cols[8];
      edge2 = cols[9];
      edge3 = cols[10];
      edge4 = cols[11];
      projectName = cols[12];
      unit = cols[13];
      clientName = cols[14];
    } else {
      // Legacy: Length, Width, Qty, Name, Grain
      length = num(cols[0]);
      width = num(cols[1]);
      qty = cols.length >= 3 ? Math.max(1, num(cols[2]) || 1) : 1;
      name = cols.length >= 4 ? cols[3] : `Part ${parsed.length + 1}`;
      grain = parseGrain(cols[4] || "");
      thickness = 0;
      material = "";
    }

    if (length <= 0 || width <= 0) continue;

    parsed.push({
      id: `csv_${now}_${i}`,
      name,
      length,
      width,
      qty,
      material: material || "HDHMR",
      grain,
      canRotate: grain === "none",
      unit,
      thickness: thickness || undefined,
      projectName,
      clientName,
      srNo: sr,
      edge1,
      edge2,
      edge3,
      edge4,
    });
  }

  return parsed;
}
