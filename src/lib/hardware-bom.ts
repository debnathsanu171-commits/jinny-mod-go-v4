import { HARDWARE_RE } from "@/lib/platform";
import type { WoUnit } from "@/components/work-order-sheet";

export type HardwareLine = {
  id: string;
  sn: string;
  description: string;
  brand: string;
  qty: string;
  uom: string;
  remark: string;
  rew: string;
};

export type HardwareGroup = {
  id: string;
  subNo: string;
  qty: string;
  date: string;
  sl: string;
  unitName: string;
  itemType: string;
  rows: HardwareLine[];
};

export type HardwareDoc = {
  companyLogo: string;
  title: string;
  order_no: string;
  project_name: string;
  location: string;
  groups: HardwareGroup[];
};

export type HardwarePart = {
  unit: string;
  part_name: string;
  material: string;
  qty: number;
  notes: string | null;
};

function uid(prefix = "hw") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function letter(i: number) {
  return String.fromCharCode(65 + (i % 26));
}

export function emptyHardwareLine(sn = "1"): HardwareLine {
  return {
    id: uid("ln"),
    sn,
    description: "",
    brand: "",
    qty: "",
    uom: "NOS",
    remark: "",
    rew: "",
  };
}

export function emptyHardwareGroup(i = 0, date = "", subNo = ""): HardwareGroup {
  return {
    id: uid("g"),
    subNo: subNo || "XXXXX",
    qty: i === 0 ? "0" : "1",
    date,
    sl: i === 0 ? "0" : letter(i),
    unitName: "",
    itemType: "KITCHEN",
    rows: [emptyHardwareLine("1"), emptyHardwareLine("2")],
  };
}

export function emptyHardwareDoc(meta?: Partial<HardwareDoc>): HardwareDoc {
  return {
    companyLogo: meta?.companyLogo || "COMPANY LOGO",
    title: "HARDWARE LIST",
    order_no: meta?.order_no ?? "",
    project_name: meta?.project_name ?? "",
    location: meta?.location ?? "",
    groups: [emptyHardwareGroup(0, meta?.groups?.[0]?.date ?? "", meta?.groups?.[0]?.subNo)],
    ...meta,
  };
}

function uomFor(name: string) {
  if (/minifix|confirmat|cam/i.test(name)) return "SET";
  if (/dowel/i.test(name)) return "NOS";
  if (/hinge/i.test(name) && /165|crank/i.test(name)) return "NOS";
  if (/hinge/i.test(name)) return "SET";
  return "NOS";
}

function fmtDate(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return iso || "";
}

function keepLine(old: HardwareLine | undefined, generated: HardwareLine): HardwareLine {
  if (!old) return generated;
  return {
    ...generated,
    id: old.id || generated.id,
    brand: old.brand || generated.brand,
    uom: old.uom || generated.uom,
    remark: old.remark || generated.remark,
    rew: old.rew || generated.rew,
    qty: old.qty || generated.qty,
  };
}

export function syncHardwareFromJob(
  units: WoUnit[],
  parts: HardwarePart[],
  saved: HardwareDoc | undefined,
  meta: {
    order_no: string;
    project_name: string;
    location: string;
    date: string;
    company: string;
    sub_proj_no: string;
  },
): HardwareDoc {
  const date = fmtDate(meta.date);
  const oldSaved = saved as (HardwareDoc & { client_name?: string }) | undefined;
  const base = emptyHardwareDoc({
    companyLogo: oldSaved?.companyLogo || meta.company || "COMPANY LOGO",
    title: oldSaved?.title || "HARDWARE LIST",
    order_no: oldSaved?.order_no || meta.order_no,
    project_name: oldSaved?.project_name || meta.project_name,
    location: oldSaved?.location || meta.location,
  });

  const hwParts = parts.filter((p) => HARDWARE_RE.test(p.part_name) || HARDWARE_RE.test(p.material));
  const namedUnits = units.filter((u) => (u.description || "").trim());

  const migrateGroup = (g: HardwareGroup & { brand?: string; subNo?: string }): HardwareGroup => ({
    ...emptyHardwareGroup(0, g.date, g.subNo),
    ...g,
    subNo: g.subNo || meta.sub_proj_no || "XXXXX",
  });

  if (!namedUnits.length && !hwParts.length) {
    if (oldSaved?.groups?.length) {
      return { ...base, ...oldSaved, order_no: base.order_no, groups: oldSaved.groups.map(migrateGroup) };
    }
    return {
      ...base,
      groups: [{ ...emptyHardwareGroup(0, date, meta.sub_proj_no), unitName: "" }],
    };
  }

  const byUnit = new Map<string, HardwarePart[]>();
  for (const p of hwParts) {
    const key = (p.unit || "GENERAL").trim() || "GENERAL";
    const list = byUnit.get(key) ?? [];
    list.push(p);
    byUnit.set(key, list);
  }

  const oldGroups = [...(oldSaved?.groups || [])];
  const takeGroup = (pred: (g: HardwareGroup) => boolean) => {
    const i = oldGroups.findIndex(pred);
    if (i < 0) return undefined;
    return oldGroups.splice(i, 1)[0];
  };

  const groups: HardwareGroup[] = [];
  const unitList = namedUnits.length
    ? namedUnits
    : [{ sl: "0", description: meta.project_name || "UNIT", qty: "1", material: "", width: "", depth: "", height: "", outer: "", inner: "", grain: "", remark: "" }];

  unitList.forEach((u, i) => {
    const name = u.description || `UNIT ${i === 0 ? "0" : letter(i)}`;
    const prev = takeGroup((g) => g.unitName.toUpperCase() === name.toUpperCase() || g.sl === (u.sl || (i === 0 ? "0" : letter(i))));
    const related = byUnit.get(name) || byUnit.get(u.sl) || [];
    const brandGuess = related.find((p) => p.material)?.material || u.material || "";

    const oldLines = [...(prev?.rows || [])];
    const takeLine = (pred: (r: HardwareLine) => boolean) => {
      const idx = oldLines.findIndex(pred);
      if (idx < 0) return undefined;
      return oldLines.splice(idx, 1)[0];
    };

    const rows: HardwareLine[] = related.length
      ? related.map((p, n) => {
          const gen: HardwareLine = {
            ...emptyHardwareLine(String(n + 1)),
            description: p.part_name,
            brand: p.material || brandGuess,
            qty: String(p.qty || ""),
            uom: uomFor(p.part_name),
            remark: p.notes || "",
          };
          return keepLine(takeLine((r) => r.description.toUpperCase() === p.part_name.toUpperCase()), gen);
        })
      : prev?.rows?.length
        ? prev.rows
        : [emptyHardwareLine("1"), emptyHardwareLine("2")];

    for (const leftover of oldLines) rows.push(leftover);

    groups.push({
      id: prev?.id || uid("g"),
      subNo: prev?.subNo || meta.sub_proj_no || "XXXXX",
      qty: prev?.qty || u.qty || (i === 0 ? "0" : "1"),
      date: prev?.date || date,
      sl: prev?.sl || u.sl || (i === 0 ? "0" : letter(i)),
      unitName: name,
      itemType: prev?.itemType || "KITCHEN",
      rows,
    });
  });

  for (const leftover of oldGroups) groups.push(migrateGroup(leftover));

  return { ...base, groups };
}
