"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useHideAmounts } from "@/components/providers";
import type { ChartPoint } from "@/lib/dashboard/data";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "1W", days: 7 },
  { id: "1M", days: 31 },
  { id: "3M", days: 92 },
  { id: "6M", days: 183 },
  { id: "YTD", days: null },
  { id: "1Y", days: 366 },
  { id: "ALL", days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

function sliceRange(points: ChartPoint[], range: RangeId): ChartPoint[] {
  if (!points.length) return points;
  const last = points.at(-1)!.date;
  const r = RANGES.find((x) => x.id === range)!;
  let from: string;
  if (r.days === null) from = `${last.slice(0, 4)}-01-01`;
  else if (r.days === Infinity) return points;
  else from = new Date(asDate(last).getTime() - r.days * 86_400_000).toISOString().slice(0, 10);
  const inRange = points.filter((p) => p.date >= from);
  // Start from the last point before the range so the line doesn't begin mid-air.
  const before = points.filter((p) => p.date < from).at(-1);
  return before ? [before, ...inRange] : inRange;
}

export function ValueChart({ points, estimated }: { points: ChartPoint[]; estimated: boolean }) {
  const [range, setRange] = useState<RangeId>("3M");
  const { hidden } = useHideAmounts();
  const data = useMemo(() => sliceRange(points, range), [points, range]);

  const first = data[0]?.value ?? 0;
  const last = data.at(-1)?.value ?? 0;
  const change = last - first;
  const changePct = first ? (change / first) * 100 : null;
  const up = change >= 0;
  const color = up ? "var(--color-emerald-500, #10b981)" : "var(--color-red-500, #ef4444)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.length > 1 ? (
            <>
              <span className={cn("font-medium money", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {up ? "+" : "−"}
                {full.format(Math.abs(change))}
                {changePct !== null ? ` (${up ? "+" : "−"}${Math.abs(changePct).toFixed(2)}%)` : ""}
              </span>{" "}
              over {range === "ALL" ? "all time" : range === "YTD" ? "this year" : `the last ${range}`}
            </>
          ) : (
            "Not enough history for this range yet."
          )}
        </p>
        <div role="radiogroup" aria-label="Chart range" className="flex rounded-lg bg-muted p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={range === r.id}
              onClick={() => setRange(r.id)}
              className="rounded-md px-2 py-1 font-medium text-muted-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full" aria-label="Portfolio value chart">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => dayFmt.format(asDate(d))}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                width={hidden ? 8 : 52}
                tickFormatter={(v: number) => (hidden ? "" : compact.format(v))}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                labelFormatter={(d) => longFmt.format(asDate(String(d)))}
                formatter={(v, name) => [hidden ? "••••" : `Rs ${full.format(Number(v))}`, name === "value" ? "Value" : "Cost"]}
              />
              <Area type="monotone" dataKey="cost" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#valueFill)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
            The chart fills in as daily snapshots are recorded.
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Solid line: holdings value at each day&apos;s close. Dashed: cost of holdings. Today uses the latest prices.
        {estimated ? " Some days value a stock at cost because no closing price was stored for it yet." : ""}
      </p>
    </div>
  );
}
