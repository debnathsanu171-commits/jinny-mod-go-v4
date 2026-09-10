import type { SheetLayout } from "@/lib/optimizer/types";

export function SheetThumb({
  layout,
  copies,
  index,
  selected,
  onClick,
}: {
  layout: SheetLayout;
  copies: number;
  index: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const s = layout.stockSheet;
  const yieldPct = layout.efficiencyPct;
  const wastePct = layout.wastePct;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-md border text-left transition ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-outline hover:border-primary/50"
      }`}
    >
      <div className="relative bg-surface-low px-2 pt-2">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-muted">
          <span>{index}</span>
          {copies > 1 ? (
            <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              ×{copies}
            </span>
          ) : null}
        </div>
        <svg
          viewBox={`0 0 ${s.length} ${s.width}`}
          className="h-36 w-full bg-paper"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width={s.length} height={s.width} fill="#f8fafc" stroke="#0f172a" strokeWidth="8" />
          {layout.offcuts.map((o) => (
            <rect
              key={o.id}
              x={o.x}
              y={o.y}
              width={o.length}
              height={o.width}
              fill={o.isReusable ? "#dcfce7" : "#e2e8f0"}
              stroke={o.isReusable ? "#10b981" : "#94a3b8"}
              strokeWidth="4"
              strokeDasharray={o.isReusable ? undefined : "12 10"}
            />
          ))}
          {layout.placedParts.map((p) => (
            <g key={p.id}>
              <rect
                x={p.x}
                y={p.y}
                width={p.length}
                height={p.width}
                fill={p.color || "#3b82f6"}
                stroke="#0f172a"
                strokeWidth="5"
                opacity="0.92"
              />
              {Math.min(p.length, p.width) > 180 ? (
                <text
                  x={p.x + p.length / 2}
                  y={p.y + p.width / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={Math.min(56, Math.min(p.length, p.width) / 4)}
                  fontWeight="700"
                >
                  {p.name.slice(0, 10)}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex items-center gap-2 border-t border-outline bg-paper px-2 py-1.5">
        <span className="font-mono text-[10px] font-bold text-muted">×{copies}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container">
          <div className="h-full bg-ok" style={{ width: `${Math.max(0, Math.min(100, yieldPct))}%` }} />
        </div>
        <span className="font-mono text-[10px] font-semibold text-foreground">{yieldPct.toFixed(1)}%</span>
        <span className="font-mono text-[10px] text-muted">{wastePct.toFixed(1)}%</span>
      </div>
    </button>
  );
}
