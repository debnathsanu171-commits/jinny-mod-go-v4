import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWorkOrder } from "@/lib/server";
import { buildWorkOrder, type WorkOrderSeed } from "@/components/work-order-sheet";
import {
  emptyHardwareGroup,
  emptyHardwareLine,
  syncHardwareFromJob,
  type HardwareDoc,
  type HardwareGroup,
  type HardwareLine,
  type HardwarePart,
} from "@/lib/hardware-bom";

function In({
  value,
  onChange,
  center,
  bold,
  red,
}: {
  value: string;
  onChange: (v: string) => void;
  center?: boolean;
  bold?: boolean;
  red?: boolean;
}) {
  return (
    <input
      className={`hw-in${center ? " hw-c" : ""}${bold ? " hw-b" : ""}${red ? " hw-red" : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function HardwareSheet({
  projectId,
  subId,
  company,
  seed,
  saved,
  parts,
  onSaved,
}: {
  projectId: number;
  subId: number;
  company: string;
  seed: WorkOrderSeed;
  saved?: unknown;
  parts: HardwarePart[];
  onSaved: () => void;
}) {
  const wo = useMemo(() => buildWorkOrder(seed, saved), [seed, saved]);
  const [doc, setDoc] = useState<HardwareDoc>(() =>
    syncHardwareFromJob(wo.units, parts, wo.hardware, {
      order_no: wo.order_no,
      project_name: wo.project_name,
      location: wo.delivery_address,
      date: wo.date,
      company,
      sub_proj_no: wo.sub_proj_no,
    }),
  );

  function patch(p: Partial<HardwareDoc>) {
    setDoc((d) => ({ ...d, ...p }));
  }
  function patchGroup(id: string, p: Partial<HardwareGroup>) {
    setDoc((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) }));
  }
  function patchLine(gid: string, lid: string, p: Partial<HardwareLine>) {
    setDoc((d) => ({
      ...d,
      groups: d.groups.map((g) =>
        g.id === gid ? { ...g, rows: g.rows.map((r) => (r.id === lid ? { ...r, ...p } : r)) } : g,
      ),
    }));
  }
  function addLine(gid: string) {
    setDoc((d) => ({
      ...d,
      groups: d.groups.map((g) =>
        g.id === gid
          ? { ...g, rows: [...g.rows, emptyHardwareLine(String(g.rows.length + 1))] }
          : g,
      ),
    }));
  }
  function removeLine(gid: string, lid: string) {
    setDoc((d) => ({
      ...d,
      groups: d.groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              rows: g.rows.filter((r) => r.id !== lid).map((r, i) => ({ ...r, sn: String(i + 1) })),
            }
          : g,
      ),
    }));
  }
  function addGroup() {
    setDoc((d) => ({
      ...d,
      groups: [
        ...d.groups,
        emptyHardwareGroup(d.groups.length, d.groups[0]?.date || "", d.groups[0]?.subNo || wo.sub_proj_no),
      ],
    }));
  }
  function removeGroup(id: string) {
    setDoc((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== id) }));
  }
  function rebuild() {
    setDoc(
      syncHardwareFromJob(wo.units, parts, doc, {
        order_no: doc.order_no || wo.order_no,
        project_name: doc.project_name || wo.project_name,
        location: doc.location || wo.delivery_address,
        date: wo.date,
        company,
        sub_proj_no: wo.sub_proj_no,
      }),
    );
    toast.success("Hardware list updated from work order");
  }

  const save = useMutation({
    mutationFn: () =>
      saveWorkOrder({
        data: { projectId, subId, work_order: { ...wo, hardware: doc, notes: wo.notes } },
      }),
    onSuccess: () => {
      toast.success("Hardware list saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="cl-wrap">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      <div className="no-print cl-toolbar">
        <Button size="sm" variant="outline" onClick={rebuild}>
          Update from work order
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup}>
          Add brand group
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Print A4
        </Button>
      </div>

      <div className="cl-stage">
        <div className="cl-paper">
          <div className="cl-frame hw-frame">
            <div className="hw-top">
              <div className="hw-logo">
                <In value={doc.companyLogo || company} onChange={(v) => patch({ companyLogo: v })} bold />
              </div>
              <div className="hw-meta">
                <div className="hw-title">
                  <In value={doc.title} onChange={(v) => patch({ title: v })} bold center />
                </div>
                <div className="hw-kv">
                  <span>ORDER NO</span>
                  <In value={doc.order_no} onChange={(v) => patch({ order_no: v })} bold />
                </div>
                <div className="hw-kv">
                  <span>PROJ. NAME</span>
                  <In value={doc.project_name} onChange={(v) => patch({ project_name: v })} bold />
                </div>
                <div className="hw-kv">
                  <span>LOCATION :-</span>
                  <In value={doc.location} onChange={(v) => patch({ location: v })} />
                </div>
              </div>
            </div>

            {doc.groups.map((g) => (
              <div key={g.id} className="hw-block">
                <div className="hw-bar">
                  <div className="hw-subno">
                    <span>SUB PROJECT NO -</span>
                    <In value={g.subNo} onChange={(v) => patchGroup(g.id, { subNo: v })} bold />
                  </div>
                  <span>QNTY</span>
                  <In value={g.qty} onChange={(v) => patchGroup(g.id, { qty: v })} center bold />
                  <span>DATE</span>
                  <In value={g.date} onChange={(v) => patchGroup(g.id, { date: v })} center bold />
                </div>
                <div className="hw-unit">
                  <In value={g.sl} onChange={(v) => patchGroup(g.id, { sl: v })} center bold />
                  <In value={g.unitName} onChange={(v) => patchGroup(g.id, { unitName: v })} bold />
                  <span>ITEM</span>
                  <In value={g.itemType} onChange={(v) => patchGroup(g.id, { itemType: v })} center bold />
                  <button type="button" className="no-print hw-x" onClick={() => removeGroup(g.id)} title="Remove group">
                    ×
                  </button>
                </div>
                <table className="hw-table">
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "8%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>S.N.</th>
                      <th>DESCRIPTION</th>
                      <th>SUPPLIE/BRAND</th>
                      <th>QNTY</th>
                      <th>UOM</th>
                      <th>REMARK</th>
                      <th>REW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <In value={r.sn} onChange={(v) => patchLine(g.id, r.id, { sn: v })} center />
                        </td>
                        <td>
                          <div className="hw-desc">
                            <In value={r.description} onChange={(v) => patchLine(g.id, r.id, { description: v })} />
                            <button
                              type="button"
                              className="no-print cl-del"
                              onClick={() => removeLine(g.id, r.id)}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                        <td>
                          <In value={r.brand} onChange={(v) => patchLine(g.id, r.id, { brand: v })} center />
                        </td>
                        <td>
                          <In value={r.qty} onChange={(v) => patchLine(g.id, r.id, { qty: v })} center />
                        </td>
                        <td>
                          <In value={r.uom} onChange={(v) => patchLine(g.id, r.id, { uom: v })} center />
                        </td>
                        <td>
                          <In value={r.remark} onChange={(v) => patchLine(g.id, r.id, { remark: v })} />
                        </td>
                        <td>
                          <In value={r.rew} onChange={(v) => patchLine(g.id, r.id, { rew: v })} center />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="no-print hw-rowbar">
                  <button type="button" onClick={() => addLine(g.id)}>
                    + Add item
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
