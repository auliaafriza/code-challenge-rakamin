import { useMemo, useState } from "react";
import { SERIES } from "./palette";
import useIsDark from "./useIsDark";
import useMediaQuery from "./useMediaQuery";

export interface TimePoint {
  /** Label sumbu X, mis. "8 Sep". */
  label: string;
  values: number[];
}

interface TimeSeriesChartProps {
  points: TimePoint[];
  seriesNames: string[];
  /** Deskripsi untuk pembaca layar; grafik ini punya padanan tabelnya. */
  caption: string;
}

const WIDE = { W: 640, H: 220, font: 9 };
const NARROW = { W: 360, H: 240, font: 11 };
const PAD = { top: 12, right: 14, bottom: 28, left: 34 };

export default function TimeSeriesChart({ points, seriesNames, caption }: TimeSeriesChartProps) {
  const isDark = useIsDark();
  const narrow = useMediaQuery("(max-width: 640px)");
  const { W, H, font } = narrow ? NARROW : WIDE;
  const colors = isDark ? SERIES.dark : SERIES.light;
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => {
    const m = Math.max(1, ...points.flatMap((p) => p.values));
    const step = Math.max(1, Math.ceil(m / 4));
    return step * 4;
  }, [points]);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data untuk ditampilkan.</p>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // Label sumbu X dijarangkan supaya tidak saling menimpa di layar sempit.
  const tickEvery = Math.max(1, Math.ceil(points.length / (narrow ? 3 : 6)));

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD.left) / plotW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  const active = hover ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={caption}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <title>{caption}</title>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y(max * f) + 3}
              textAnchor="end"
              className="fill-muted-foreground tabular-nums"
              style={{ fontSize: font }}
            >
              {Math.round(max * f)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % tickEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.label + i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="fill-muted-foreground"
              style={{ fontSize: font }}
            >
              {p.label}
            </text>
          ) : null
        )}

        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            className="stroke-muted-foreground"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {seriesNames.map((_, s) => (
          <polyline
            key={s}
            fill="none"
            stroke={colors[s % colors.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(p.values[s] ?? 0)}`).join(" ")}
          />
        ))}

        {active !== null &&
          seriesNames.map((_, s) => (
            <circle
              key={s}
              cx={x(active)}
              cy={y(points[active].values[s] ?? 0)}
              r="4.5"
              fill={colors[s % colors.length]}
              // Cincin sewarna permukaan memisahkan dua titik yang bertumpuk.
              className="stroke-card"
              strokeWidth="2"
            />
          ))}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(x(active) / W) * 100}%`,
            transform: `translateX(${active > points.length / 2 ? "-105%" : "5%"})`,
          }}
        >
          <p className="font-medium">{points[active].label}</p>
          {seriesNames.map((name, s) => (
            <p key={name} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: colors[s % colors.length] }}
              />
              {name}
              <strong className="ml-auto pl-2 font-semibold tabular-nums text-foreground">
                {points[active].values[s] ?? 0}
              </strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
