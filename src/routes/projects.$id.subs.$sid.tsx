import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { buttonVariants } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { getSubProject, setSubProjectStatus } from "@/lib/server";
import { jobStatusPct, nextJobStatus } from "@/lib/platform";
import { ProcessBox } from "@/components/process-box";
import { WorkOrderSheet } from "@/components/work-order-sheet";
import { CutlistSheet } from "@/components/cutlist-sheet";
import { MaterialSheet } from "@/components/material-sheet";
import { HardwareSheet } from "@/components/hardware-sheet";
import { useCompanyName } from "@/components/print-docs";
import { cn } from "@/lib/utils";

const BOM_TABS = [
  { id: "workorder", label: "WORK ORDER" },
  { id: "cutlist", label: "CUTLIST" },
  { id: "material", label: "MATERIAL LIST" },
  { id: "hardware", label: "HARDWARE LIST" },
] as const;
type BomTab = (typeof BOM_TABS)[number]["id"];

function parseSaved(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/projects/$id/subs/$sid")({ component: Page });

function Page() {
  const { id, sid } = Route.useParams();
  return (
    <Guard title="Sub project" perm="projects">
      <SubBom projectId={Number(id)} subId={Number(sid)} />
    </Guard>
  );
}

function SubBom({ projectId, subId }: { projectId: number; subId: number }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<BomTab>("workorder");
  const company = useCompanyName();
  const q = useQuery({
    queryKey: ["sub-project", projectId, subId],
    queryFn: () => getSubProject({ data: { projectId, subId } }),
  });
  const statusMut = useMutation({
    mutationFn: (status: string) => setSubProjectStatus({ data: { id: subId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sub-project", projectId, subId] });
      qc.invalidateQueries({ queryKey: ["sub-projects", projectId] });
      qc.invalidateQueries({ queryKey: ["work-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface-container" />;
  if (q.error || !q.data) return <p className="text-sm text-danger">Sub project not found</p>;
  const { project, sub, parts } = q.data;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{sub.sub_order_no}</p>
          <h2 className="text-xl font-semibold">{sub.product_name}</h2>
          <p className="text-sm text-muted">
            {project.client_name ?? "No client"} · {project.name} · Qty {sub.item_qty}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProcessBox
            pct={jobStatusPct(sub.status)}
            disabled={statusMut.isPending}
            onCycle={() => statusMut.mutate(nextJobStatus(sub.status))}
          />
          <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>
          <Link to="/projects/$id" params={{ id: String(projectId) }} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Main project
          </Link>
        </div>
      </div>

      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {BOM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              window.dispatchEvent(new Event("jmg-nav-close"));
            }}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-md border px-4 text-xs font-bold tracking-wide",
              tab === t.id
                ? "border-primary bg-primary text-on-primary"
                : "border-outline bg-paper text-muted hover:bg-surface-low",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SubPanel
        tab={tab}
        project={project}
        sub={sub}
        parts={parts}
        company={company}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sub-project", projectId, subId] });
          qc.invalidateQueries({ queryKey: ["sub-projects", projectId] });
        }}
      />
    </div>
  );
}

type Part = {
  id: number;
  unit: string;
  part_name: string;
  length_mm: string;
  width_mm: string;
  thickness_mm: string;
  material: string;
  qty: number;
  notes: string | null;
  weight_kg: string;
  board_sku: string | null;
};

function SubPanel({
  tab,
  project,
  sub,
  parts,
  company,
  onSaved,
}: {
  tab: BomTab;
  project: {
    id: number;
    name: string;
    client_name: string | null;
    po_number: string | null;
    code: string;
    address: string | null;
    billing_address: string | null;
    delivery_address: string | null;
    client_phone: string | null;
    expected_dispatch_date: string | null;
  };
  sub: {
    id: number;
    project_id: number;
    sub_order_no: string;
    product_name: string;
    item_qty: number;
    status: string;
    notes: string | null;
    work_order: string | null;
  };
  parts: Part[];
  company: string;
  onSaved: () => void;
}) {
  if (tab === "workorder") {
    return (
      <WorkOrderSheet
        projectId={sub.project_id}
        subId={sub.id}
        company={company}
        saved={parseSaved(sub.work_order)}
        onSaved={onSaved}
        seed={{
          order_no: project.po_number || project.code,
          customer_name: project.client_name ?? "",
          billing_address: project.billing_address ?? "",
          delivery_address: project.delivery_address ?? project.address ?? "",
          customer_mob: project.client_phone ?? "",
          expected_delivery: project.expected_dispatch_date ?? "",
          project_name: project.name,
          sub_proj_no: sub.sub_order_no,
          notes: sub.notes ?? "",
        }}
      />
    );
  }

  if (tab === "material") {
    return (
      <MaterialSheet
        projectId={sub.project_id}
        subId={sub.id}
        company={company}
        saved={parseSaved(sub.work_order)}
        onSaved={onSaved}
        seed={{
          order_no: project.po_number || project.code,
          customer_name: project.client_name ?? "",
          billing_address: project.billing_address ?? "",
          delivery_address: project.delivery_address ?? project.address ?? "",
          customer_mob: project.client_phone ?? "",
          expected_delivery: project.expected_dispatch_date ?? "",
          project_name: sub.product_name || project.name,
          sub_proj_no: sub.sub_order_no,
          notes: sub.notes ?? "",
        }}
      />
    );
  }

  if (tab === "hardware") {
    return (
      <HardwareSheet
        projectId={sub.project_id}
        subId={sub.id}
        company={company}
        saved={parseSaved(sub.work_order)}
        onSaved={onSaved}
        parts={parts}
        seed={{
          order_no: project.po_number || project.code,
          customer_name: project.client_name ?? "",
          billing_address: project.billing_address ?? "",
          delivery_address: project.delivery_address ?? project.address ?? "",
          customer_mob: project.client_phone ?? "",
          expected_delivery: project.expected_dispatch_date ?? "",
          project_name: sub.product_name || project.name,
          sub_proj_no: sub.sub_order_no,
          notes: sub.notes ?? "",
        }}
      />
    );
  }

  return (
    <CutlistSheet
      projectId={sub.project_id}
      subId={sub.id}
      company={company}
      saved={parseSaved(sub.work_order)}
      onSaved={onSaved}
      seed={{
        order_no: project.po_number || project.code,
        customer_name: project.client_name ?? "",
        billing_address: project.billing_address ?? "",
        delivery_address: project.delivery_address ?? project.address ?? "",
        customer_mob: project.client_phone ?? "",
        expected_delivery: project.expected_dispatch_date ?? "",
        project_name: sub.product_name || project.name,
        sub_proj_no: sub.sub_order_no,
        notes: sub.notes ?? "",
      }}
    />
  );
}
