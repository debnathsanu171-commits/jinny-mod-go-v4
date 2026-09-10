import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWorkOrder } from "@/lib/server";
import { buildWorkOrder, type WorkOrderSeed } from "@/components/work-order-sheet";
import {
  emptyMaterialRow,
  syncMaterialFromJob,
  type MaterialDoc,
  type MaterialRow,
} from "@/lib/material-bom";

function In({
  value,
  onChange,
  center,
  bold,
}: {
  value: string;
  onChange: (v: string) => void;
  center?: boolean;
  bold?: boolean;
}) {
  return (
    <input
      className={`bm-in${center ? " bm-c" : ""}${bold ? " bm-b" : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function MaterialSheet({
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
  const wo = useMemo(() => buildWorkOrder(seed, saved), [seed, saved]);
  const [doc, setDoc] = useState<MaterialDoc>(() =>
    syncMaterialFromJob(wo.units, wo.cutlist, wo.material, {
      customer_name: wo.customer_name,
      date: wo.date,
      company,
    }),
  );

  function patch(p: Partial<MaterialDoc>) {
    setDoc((d) => ({ ...d, ...p }));
  }
  function patchRow(id: string, p: Partial<MaterialRow>) {
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  }
  function addRow(after?: string) {
    setDoc((d) => {
      const row = emptyMaterialRow("item");
      if (!after) return { ...d, rows: [...d.rows, row] };
      const i = d.rows.findIndex((r) => r.id === after);
      const next = [...d.rows];
      next.splice(i + 1, 0, row);
      return { ...d, rows: next };
    });
  }
  function addGroup() {
    const letter = String.fromCharCode(65 + doc.rows.filter((r) => r.kind === "group").length);
    setDoc((d) => ({
      ...d,
      rows: [...d.rows, { ...emptyMaterialRow("group", letter), material: "NEW" }, emptyMaterialRow("item")],
    }));
  }
  function removeRow(id: string) {
    setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  }
  function rebuild() {
    setDoc(
      syncMaterialFromJob(wo.units, wo.cutlist, doc, {
        customer_name: doc.customer_name || wo.customer_name,
        date: doc.date || wo.date,
        company,
      }),
    );
    toast.success("Material list updated from work order / cutlist");
  }

  const save = useMutation({
    mutationFn: () =>
      saveWorkOrder({
        data: { projectId, subId, work_order: { ...wo, material: doc, notes: wo.notes } },
      }),
    onSuccess: () => {
      toast.success("Material list saved");
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
        <Button size="sm" variant="outline" onClick={() => addRow()}>
          Add row
        </Button>
        <Button size="sm" variant="outline" onClick={addGroup}>
          Add group
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
          <div className="cl-frame bm-frame">
            <div className="bm-logos">
              <div className="bm-logo bm-logo-l">
                <In value={doc.appLogo} onChange={(v) => patch({ appLogo: v })} bold center />
              </div>
              <div className="bm-logo bm-logo-r">
                <In
                  value={doc.factoryLogo || company}
                  onChange={(v) => patch({ factoryLogo: v })}
                  bold
                  center
                />
              </div>
            </div>
            <div className="bm-title">
              <In value={doc.title} onChange={(v) => patch({ title: v })} bold center />
            </div>
            <div className="bm-meta">
              <span>CUSTOMER NAME</span>
              <In value={doc.customer_name} onChange={(v) => patch({ customer_name: v })} center bold />
            </div>
            <div className="bm-meta">
              <span>DATE</span>
              <In value={doc.date} onChange={(v) => patch({ date: v })} center />
            </div>
            <div className="bm-prep">
              <span>PREPARED BY</span>
              <In value={doc.prepared_by} onChange={(v) => patch({ prepared_by: v })} center bold />
              <span>CHECKED BY</span>
              <In value={doc.checked_by} onChange={(v) => patch({ checked_by: v })} center bold />
            </div>

            <table className="bm-table">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>SL NO.</th>
                  <th>MATERIAL</th>
                  <th>BRAND</th>
                  <th>THK(MM)</th>
                  <th>SIZE</th>
                  <th>QTY</th>
                  <th>STOCK</th>
                  <th>REVISE STOCK</th>
                  <th>AVAIBILITY</th>
                  <th>REMARK</th>
                </tr>
              </thead>
              <tbody>
                {doc.rows.map((r) => (
                  <tr key={r.id} className={r.kind === "group" ? `bm-group bm-g-${(r.sl || "x").slice(0, 1).toLowerCase()}` : "bm-item"}>
                    <td>
                      <In
                        value={r.sl}
                        onChange={(v) => patchRow(r.id, { sl: v })}
                        center
                        bold={r.kind === "group"}
                      />
                    </td>
                    <td>
                      <div className="bm-mat">
                        <In
                          value={r.material}
                          onChange={(v) => patchRow(r.id, { material: v })}
                          center
                          bold={r.kind === "group"}
                        />
                        <button type="button" className="no-print cl-del" onClick={() => removeRow(r.id)} title="Remove">
                          ×
                        </button>
                        <button type="button" className="no-print bm-add" onClick={() => addRow(r.id)} title="Add row">
                          +
                        </button>
                      </div>
                    </td>
                    <td>
                      <In value={r.brand} onChange={(v) => patchRow(r.id, { brand: v })} center bold={r.kind === "group"} />
                    </td>
                    <td>
                      <In value={r.thk} onChange={(v) => patchRow(r.id, { thk: v })} center bold={r.kind === "group"} />
                    </td>
                    <td>
                      <In value={r.size} onChange={(v) => patchRow(r.id, { size: v })} center bold={r.kind === "group"} />
                    </td>
                    <td>
                      <In value={r.qty} onChange={(v) => patchRow(r.id, { qty: v })} center />
                    </td>
                    <td>
                      <In value={r.stock} onChange={(v) => patchRow(r.id, { stock: v })} center />
                    </td>
                    <td>
                      <In value={r.revise} onChange={(v) => patchRow(r.id, { revise: v })} center />
                    </td>
                    <td>
                      <In value={r.avail} onChange={(v) => patchRow(r.id, { avail: v })} center />
                    </td>
                    <td>
                      <In value={r.remark} onChange={(v) => patchRow(r.id, { remark: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="bm-sign">
              <thead>
                <tr>
                  <th>TEAM</th>
                  <th>PLANNER</th>
                  <th>PRODUCTION</th>
                  <th>ACCOUNTING</th>
                  <th>GENERAL MANAGER</th>
                  <th>DIRECTOR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bm-sign-lab">SIGN</td>
                  <td>
                    <In value={doc.planner} onChange={(v) => patch({ planner: v })} center />
                  </td>
                  <td>
                    <In value={doc.production} onChange={(v) => patch({ production: v })} center />
                  </td>
                  <td>
                    <In value={doc.accounting} onChange={(v) => patch({ accounting: v })} center />
                  </td>
                  <td>
                    <In value={doc.gm} onChange={(v) => patch({ gm: v })} center />
                  </td>
                  <td>
                    <In value={doc.director} onChange={(v) => patch({ director: v })} center />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
