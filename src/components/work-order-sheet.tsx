import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Sliders, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveWorkOrder } from "@/lib/server";
import { CabinetConfigModal } from "@/components/cabinet-config-modal";
import { syncCutlistFromUnits, type CutlistDoc } from "@/lib/cutlist-bom";
import type { MaterialDoc } from "@/lib/material-bom";
import type { HardwareDoc } from "@/lib/hardware-bom";

export const WO_DEPTS = [
  "PLANT SUPERVISOR",
  "PANEL SAW",
  "EDGEBANDING",
  "MULTIBORING",
  "PAINTING",
  "ASSEMBLY",
  "PACKING",
  "DISPATCH",
] as const;

export type WoUnit = {
  sl: string;
  description: string;
  width: string;
  depth: string;
  height: string;
  qty: string;
  material: string;
  outer: string;
  inner: string;
  grain: string;
  remark: string;
};

export type WoDept = {
  department: string;
  sign: string;
  date: string;
  start: string;
  end: string;
  remark: string;
};

export type WorkOrderDoc = {
  order_no: string;
  customer_name: string;
  billing_address: string;
  delivery_address: string;
  customer_mob: string;
  plan_prepared: string;
  date: string;
  expected_delivery: string;
  project_name: string;
  sub_proj_no: string;
  designer: string;
  plan_checked: string;
  notes: string;
  units: WoUnit[];
  depts: WoDept[];
  cutlist?: CutlistDoc;
  material?: MaterialDoc;
  hardware?: HardwareDoc;
};

export type WorkOrderSeed = {
  order_no: string;
  customer_name: string;
  billing_address: string;
  delivery_address: string;
  customer_mob: string;
  expected_delivery: string;
  project_name: string;
  sub_proj_no: string;
  notes: string;
};

function emptyUnit(i: number): WoUnit {
  return {
    sl: String.fromCharCode(65 + (i % 26)),
    description: "",
    width: "",
    depth: "",
    height: "",
    qty: "1",
    material: "",
    outer: "",
    inner: "",
    grain: "",
    remark: "",
  };
}

function emptyDepts(): WoDept[] {
  return WO_DEPTS.map((department) => ({
    department,
    sign: "",
    date: "",
    start: "",
    end: "",
    remark: "",
  }));
}

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildWorkOrder(seed: WorkOrderSeed, saved?: unknown): WorkOrderDoc {
  const base: WorkOrderDoc = {
    order_no: seed.order_no,
    customer_name: seed.customer_name,
    billing_address: seed.billing_address,
    delivery_address: seed.delivery_address,
    customer_mob: seed.customer_mob,
    plan_prepared: "",
    date: todayIso(),
    expected_delivery: seed.expected_delivery,
    project_name: seed.project_name,
    sub_proj_no: seed.sub_proj_no,
    designer: "",
    plan_checked: "",
    notes: seed.notes,
    units: [emptyUnit(0)],
    depts: emptyDepts(),
  };
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<WorkOrderDoc>;
  const units = Array.isArray(s.units) && s.units.length
    ? s.units.map((u, i) => ({ ...emptyUnit(i), ...u, sl: u.sl || emptyUnit(i).sl }))
    : base.units;
  const depts = emptyDepts().map((d) => {
    const hit = Array.isArray(s.depts) ? s.depts.find((x) => x.department === d.department) : undefined;
    return hit ? { ...d, ...hit, department: d.department } : d;
  });
  return { ...base, ...s, units, depts };
}

function Cell({
  value,
  onChange,
  align,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  align?: "c" | "l";
  placeholder?: string;
}) {
  return (
    <input
      className={align === "c" ? "wo-in wo-in-c" : "wo-in"}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function WorkOrderSheet({
  projectId,
  subId,
  company,
  seed,
  saved,
  onSaved,
}: {
  projectId: number;
  subId: number;
  company: string;
  seed: WorkOrderSeed;
  saved?: unknown;
  onSaved: () => void;
}) {
  const initial = useMemo(() => buildWorkOrder(seed, saved), [seed, saved]);
  const [doc, setDoc] = useState<WorkOrderDoc>(initial);
  const [configRowIndex, setConfigRowIndex] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  function patch(p: Partial<WorkOrderDoc>) {
    setDoc((d) => ({ ...d, ...p }));
  }
  function patchUnit(i: number, p: Partial<WoUnit>) {
    setDoc((d) => ({ ...d, units: d.units.map((u, n) => (n === i ? { ...u, ...p } : u)) }));
  }
  function patchDept(i: number, p: Partial<WoDept>) {
    setDoc((d) => ({ ...d, depts: d.depts.map((u, n) => (n === i ? { ...u, ...p } : u)) }));
  }

  const save = useMutation({
    mutationFn: () => {
      const cutlist = syncCutlistFromUnits(doc.units, doc.cutlist, {
        product_name: doc.project_name,
        client_name: doc.customer_name,
        location: doc.delivery_address,
        order_no: doc.order_no,
        date: doc.date,
        delivery_date: doc.expected_delivery,
      });
      const payload = { ...doc, cutlist };
      return saveWorkOrder({ data: { projectId, subId, work_order: payload } });
    },
    onSuccess: () => {
      toast.success("Work order saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="wo-wrap">
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } }`}</style>
      <div className="wo-stage">
        <div className="wo-paper">
      <div className="no-print wo-toolbar">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-ok/40 text-ok hover:bg-ok/10 hover:text-ok"
          onClick={() => setConfigRowIndex(0)}
          title="Open Woodwize Cabinet Configurator Studio"
        >
          <Sliders className="size-3.5" />
          Cabinet Studio
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => patch({ units: [...doc.units, emptyUnit(doc.units.length)] })}
        >
          Add row
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print A4
        </Button>
      </div>

      <div className="wo-frame">
        <div className="wo-main">
          <table className="wo-table">
            <colgroup>
              <col className="wo-c-sl" />
              <col className="wo-c-desc" />
              <col className="wo-c-mm" />
              <col className="wo-c-mm" />
              <col className="wo-c-mm" />
              <col className="wo-c-qty" />
              <col className="wo-c-mat" />
              <col className="wo-c-col" />
              <col className="wo-c-col" />
              <col className="wo-c-gr" />
              <col className="wo-c-rem" />
              <col className="wo-c-cfg" />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={11} className="wo-logo">
                  {company || "COMPANY LOGO"}
                </td>
              </tr>
              <tr>
                <td colSpan={11} className="wo-title">
                  CARCASS PROFORMA INVOICE
                </td>
              </tr>
              <HeadRow
                l1="ORDER NO."
                v1={<Cell value={doc.order_no} onChange={(v) => patch({ order_no: v })} />}
                l2="DATE"
                v2={<Cell value={doc.date} onChange={(v) => patch({ date: v })} />}
              />
              <HeadRow
                l1="CUSTOMER NAME"
                v1={<Cell value={doc.customer_name} onChange={(v) => patch({ customer_name: v })} />}
                l2="EXPECTED DELIVERY DATE"
                v2={<Cell value={doc.expected_delivery} onChange={(v) => patch({ expected_delivery: v })} />}
              />
              <HeadRow
                l1="BILLING ADDRESS"
                v1={<Cell value={doc.billing_address} onChange={(v) => patch({ billing_address: v })} />}
                l2="PROJECT NAME"
                v2={<Cell value={doc.project_name} onChange={(v) => patch({ project_name: v })} />}
              />
              <HeadRow
                l1="DELIVERY ADDRESS"
                v1={<Cell value={doc.delivery_address} onChange={(v) => patch({ delivery_address: v })} />}
                l2="SUB PROJ. NO."
                v2={<Cell value={doc.sub_proj_no} onChange={(v) => patch({ sub_proj_no: v })} />}
              />
              <HeadRow
                l1="CUSTOMER MOB. NO."
                v1={<Cell value={doc.customer_mob} onChange={(v) => patch({ customer_mob: v })} />}
                l2="DESIGNER"
                v2={<Cell value={doc.designer} onChange={(v) => patch({ designer: v })} />}
              />
              <HeadRow
                l1="PLAN PREPARED"
                v1={<Cell value={doc.plan_prepared} onChange={(v) => patch({ plan_prepared: v })} />}
                l2="PLAN CHECKED"
                v2={<Cell value={doc.plan_checked} onChange={(v) => patch({ plan_checked: v })} />}
              />
              <tr className="wo-cols">
                <th>SL. NO.</th>
                <th>DESCRIPTION</th>
                <th>WIDTH (MM)</th>
                <th>DEPTH (MM)</th>
                <th>HEIGHT (MM)</th>
                <th>QTY</th>
                <th>MATERIAL</th>
                <th>OUTER COLOUR</th>
                <th>INNER COLOUR</th>
                <th>GRAIN</th>
                <th>REMARK</th>
                <th className="wo-cfg-out" />
              </tr>
              {doc.units.map((u, i) => (
                <tr key={i} className="wo-unit">
                  <td>
                    <Cell align="c" value={u.sl} onChange={(v) => patchUnit(i, { sl: v })} />
                  </td>
                  <td>
                    <div className="wo-unit-cell">
                      <Cell value={u.description} onChange={(v) => patchUnit(i, { description: v })} placeholder="CARCASS" />
                      {doc.units.length > 1 ? (
                        <button
                          type="button"
                          className="no-print wo-del"
                          onClick={() =>
                            setDoc((d) => ({
                              ...d,
                              units: d.units.filter((_, n) => n !== i).map((row, n) => ({ ...row, sl: row.sl || emptyUnit(n).sl })),
                            }))
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <Cell align="c" value={u.width} onChange={(v) => patchUnit(i, { width: v })} placeholder="400" />
                  </td>
                  <td>
                    <Cell align="c" value={u.depth} onChange={(v) => patchUnit(i, { depth: v })} placeholder="300" />
                  </td>
                  <td>
                    <Cell align="c" value={u.height} onChange={(v) => patchUnit(i, { height: v })} placeholder="600" />
                  </td>
                  <td>
                    <Cell align="c" value={u.qty} onChange={(v) => patchUnit(i, { qty: v })} />
                  </td>
                  <td>
                    <Cell align="c" value={u.material} onChange={(v) => patchUnit(i, { material: v })} placeholder="HDHMR" />
                  </td>
                  <td>
                    <Cell align="c" value={u.outer} onChange={(v) => patchUnit(i, { outer: v })} />
                  </td>
                  <td>
                    <Cell align="c" value={u.inner} onChange={(v) => patchUnit(i, { inner: v })} />
                  </td>
                  <td>
                    <Cell align="c" value={u.grain} onChange={(v) => patchUnit(i, { grain: v })} placeholder="N" />
                  </td>
                  <td>
                    <Cell value={u.remark} onChange={(v) => patchUnit(i, { remark: v })} />
                  </td>
                  <td className="wo-cfg-out">
                    <button
                      type="button"
                      className="no-print wo-row-cfg"
                      onClick={() => setConfigRowIndex(i)}
                      title={`Configure unit ${u.sl || i + 1}`}
                    >
                      <WardrobeExplodeIcon />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="wo-cols">
                <th>S.N.</th>
                <th>DEPARTMENT</th>
                <th colSpan={3}>SIGN</th>
                <th colSpan={2}>DATE</th>
                <th>START TIME</th>
                <th>END TIME</th>
                <th colSpan={2}>REMARK</th>
                <th className="wo-cfg-out" />
              </tr>
              {doc.depts.map((d, i) => (
                <tr key={d.department} className="wo-dept">
                  <td className="wo-sn">{i + 1}</td>
                  <td className="wo-dept-name">{d.department}</td>
                  <td colSpan={3}>
                    <Cell value={d.sign} onChange={(v) => patchDept(i, { sign: v })} />
                  </td>
                  <td colSpan={2}>
                    <Cell align="c" value={d.date} onChange={(v) => patchDept(i, { date: v })} />
                  </td>
                  <td>
                    <Cell align="c" value={d.start} onChange={(v) => patchDept(i, { start: v })} />
                  </td>
                  <td>
                    <Cell align="c" value={d.end} onChange={(v) => patchDept(i, { end: v })} />
                  </td>
                  <td colSpan={2}>
                    <Cell value={d.remark} onChange={(v) => patchDept(i, { remark: v })} />
                  </td>
                  <td className="wo-cfg-out" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wo-print-note">
          <p className="wo-print-note-h">NOTE</p>
          <p>{doc.notes || "—"}</p>
        </div>
      </div>
        </div>
      </div>

      <button
        type="button"
        className="no-print wo-note-bubble"
        onClick={() => setNoteOpen(true)}
        title="Open notes"
      >
        <StickyNote className="size-5" />
        {doc.notes.trim() ? <span className="wo-note-dot" /> : null}
        <span>Note</span>
      </button>

      {noteOpen ? (
        <div className="no-print wo-note-pop" role="dialog" aria-label="Notes">
          <button type="button" className="wo-note-scrim" aria-label="Close notes" onClick={() => setNoteOpen(false)} />
          <div className="wo-note-card">
            <div className="wo-note-card-h">
              <p>NOTE</p>
              <button type="button" onClick={() => setNoteOpen(false)} aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <textarea
              className="wo-note-box"
              value={doc.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Important notes for this work order"
              autoFocus
            />
          </div>
        </div>
      ) : null}

      {configRowIndex !== null && (
        <CabinetConfigModal
          initialWidth={doc.units[configRowIndex]?.width}
          initialDepth={doc.units[configRowIndex]?.depth}
          initialHeight={doc.units[configRowIndex]?.height}
          initialMaterial={doc.units[configRowIndex]?.material}
          onClose={() => setConfigRowIndex(null)}
          onApply={(data) => {
            patchUnit(configRowIndex, {
              description: data.description,
              width: String(data.width),
              depth: String(data.depth),
              height: String(data.height),
              material: data.material || doc.units[configRowIndex]?.material || "HDHMR",
              remark: data.remark,
            });
            toast.success(`Configured: ${data.description} (${data.width}×${data.depth}×${data.height} mm)`);
          }}
        />
      )}
    </div>
  );
}

function HeadRow({
  l1,
  v1,
  l2,
  v2,
}: {
  l1: string;
  v1: ReactNode;
  l2: string;
  v2: ReactNode;
}) {
  return (
    <tr className="wo-head">
      <td className="wo-lab" colSpan={2}>
        {l1}
      </td>
      <td className="wo-val" colSpan={4}>
        {v1}
      </td>
      <td className="wo-lab" colSpan={2}>
        {l2}
      </td>
      <td className="wo-val" colSpan={3}>
        {v2}
      </td>
    </tr>
  );
}

function WardrobeExplodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="wo-row-cfg-ico" aria-hidden>
      <rect x="8.2" y="3.2" width="7.6" height="2" rx="0.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.4" y="6.2" width="3.2" height="12.4" rx="0.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="18.4" y="6.2" width="3.2" height="12.4" rx="0.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7.2" y="6.6" width="9.6" height="10.6" rx="0.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7.2 10.2h9.6M7.2 13.6h9.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.2" y="18.8" width="7.6" height="2" rx="0.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
