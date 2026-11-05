"use client";

import { useRouter } from "next/navigation";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function PortfolioPicker({ portfolios, selected }: { portfolios: { id: string; name: string }[]; selected: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">Portfolio</span>
      <select
        className={selectClass}
        value={selected}
        onChange={(e) => router.push(e.target.value === "all" ? "/home" : `/home?portfolio=${e.target.value}`)}
      >
        <option value="all">All portfolios</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
