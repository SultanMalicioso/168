import { useMemo, useState } from "react";
import type { Activity } from "@/lib/time-store";
import { weeklyHours } from "@/lib/time-store";

export interface SubSegment {
  id: string;
  name: string;
  hours: number;
  color: string;
}

interface Props {
  activities: Activity[];
  size?: number;
  total?: number;
  unitLabel?: string;
  freeLabel?: string;
  /**
   * Optional inner ring (combined mode). Map from activity id → sub segments.
   * If a special activity id `__free__` is provided it is ignored.
   */
  subSegments?: Record<string, SubSegment[]>;
  /** Activity currently being tracked — highlighted with a glowing outline. */
  activeId?: string | null;
}

export function DonutChart({
  activities,
  size = 460,
  total: TOTAL = 168,
  unitLabel,
  freeLabel = "de la semana",
  subSegments,
  activeId,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const inner = size * 0.28;

  // Combined mode uses two rings: outer (activities) + inner (tasks per activity).
  const combined = !!subSegments;
  const outerR = combined ? size * 0.44 : r;
  const outerInner = combined ? size * 0.34 : inner;
  const innerR = combined ? size * 0.32 : 0;
  const innerInner = combined ? size * 0.22 : 0;

  const total = activities.reduce((s, a) => s + weeklyHours(a), 0);
  const free = Math.max(0, TOTAL - total);

  const segments = useMemo(() => {
    const items = [
      ...activities.map((a) => ({
        id: a.id,
        name: a.name,
        hours: Math.min(weeklyHours(a), TOTAL),
        color: a.color,
      })),
    ];
    if (free > 0) {
      items.push({ id: "__free__", name: "Libre", hours: free, color: "var(--muted)" });
    }
    let angle = -Math.PI / 2;
    return items.map((it) => {
      const frac = it.hours / TOTAL;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      return { ...it, a0, a1, frac };
    });
  }, [activities, free]);

  const arc = (a0: number, a1: number, R: number, IR: number, gap = 0.008) => {
    const s = a0 + gap;
    const e = Math.max(a1 - gap, s + 0.0001);
    const large = e - s > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(s);
    const y0 = cy + R * Math.sin(s);
    const x1 = cx + R * Math.cos(e);
    const y1 = cy + R * Math.sin(e);
    const ix0 = cx + IR * Math.cos(e);
    const iy0 = cy + IR * Math.sin(e);
    const ix1 = cx + IR * Math.cos(s);
    const iy1 = cy + IR * Math.sin(s);
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${ix0} ${iy0} A ${IR} ${IR} 0 ${large} 0 ${ix1} ${iy1} Z`;
  };

  const hovered = segments.find((s) => s.id === hover);
  const pct = (h: number) => ((h / TOTAL) * 100).toFixed(1);
  const overflow = total > TOTAL;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[520px] h-auto drop-shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
      >
        {/* Hour tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          const r1 = outerR + 6;
          const r2 = outerR + (i % 6 === 0 ? 14 : 10);
          return (
            <line
              key={i}
              x1={cx + r1 * Math.cos(a)}
              y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)}
              y2={cy + r2 * Math.sin(a)}
              stroke="var(--border)"
              strokeWidth={i % 6 === 0 ? 1.5 : 1}
            />
          );
        })}

        {segments.map((s) => {
          const isFree = s.id === "__free__";
          const active = hover === s.id;
          const tracking = !!activeId && s.id === activeId;
          return (
            <path
              key={s.id}
              d={arc(s.a0, s.a1, outerR, outerInner)}
              fill={s.color}
              stroke={tracking ? "var(--foreground)" : undefined}
              strokeWidth={tracking ? 2.5 : 0}
              className={tracking ? "animate-pulse" : undefined}
              opacity={hover && !active ? 0.35 : 1}
              style={{
                transition: "opacity 200ms ease, transform 200ms ease",
                transformOrigin: `${cx}px ${cy}px`,
                transform: active ? "scale(1.02)" : "scale(1)",
                cursor: isFree ? "default" : "pointer",
              }}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {/* Inner ring: subdivided by tasks (combined mode only) */}
        {combined &&
          segments.flatMap((s) => {
            if (s.id === "__free__") return [];
            const subs = subSegments?.[s.id] ?? [];
            const totalSub = subs.reduce((sum, x) => sum + x.hours, 0);
            const width = s.a1 - s.a0;
            if (totalSub <= 0 || width <= 0) {
              return [
                <path
                  key={`in-${s.id}`}
                  d={arc(s.a0, s.a1, innerR, innerInner)}
                  fill={s.color}
                  opacity={0.25}
                />,
              ];
            }
            let angle = s.a0;
            return subs.map((sub) => {
              const frac = sub.hours / totalSub;
              const a0 = angle;
              const a1 = angle + frac * width;
              angle = a1;
              const active = hover === `sub-${sub.id}`;
              return (
                <path
                  key={`sub-${sub.id}`}
                  d={arc(a0, a1, innerR, innerInner, 0.004)}
                  fill={sub.color}
                  opacity={hover && !active && hover !== s.id ? 0.4 : 0.95}
                  style={{ cursor: "pointer", transition: "opacity 200ms ease" }}
                  onMouseEnter={() => setHover(`sub-${sub.id}`)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${sub.name} · ${sub.hours.toFixed(2)}h`}</title>
                </path>
              );
            });
          })}

        {/* Center label */}
        <g pointerEvents="none">
          {hovered && hovered.id !== "__free__" ? (
            <>
              <text
                x={cx}
                y={cy - 14}
                textAnchor="middle"
                className="font-display"
                style={{ fontSize: size * 0.09, fill: "var(--foreground)" }}
              >
                {hovered.hours.toFixed(1)}h
              </text>
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                style={{ fontSize: size * 0.032, fill: "var(--foreground)", fontWeight: 500 }}
              >
                {hovered.name}
              </text>
              <text
                x={cx}
                y={cy + 32}
                textAnchor="middle"
                style={{ fontSize: size * 0.028, fill: "var(--muted-foreground)" }}
              >
                {pct(hovered.hours)}% {freeLabel}
              </text>
            </>
          ) : (
            <>
              <text
                x={cx}
                y={cy - 8}
                textAnchor="middle"
                className="font-display"
                style={{
                  fontSize: size * 0.13,
                  fill: overflow ? "var(--destructive)" : "var(--foreground)",
                }}
              >
                {total.toFixed(1)}
              </text>
              <text
                x={cx}
                y={cy + 20}
                textAnchor="middle"
                style={{ fontSize: size * 0.03, fill: "var(--muted-foreground)", letterSpacing: 2 }}
              >
                {unitLabel ?? `DE ${TOTAL} HORAS`}
              </text>
              <text
                x={cx}
                y={cy + 42}
                textAnchor="middle"
                style={{ fontSize: size * 0.028, fill: "var(--muted-foreground)" }}
              >
                {overflow
                  ? `Excedido por ${(total - TOTAL).toFixed(1)}h`
                  : `${free.toFixed(1)}h libres`}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
