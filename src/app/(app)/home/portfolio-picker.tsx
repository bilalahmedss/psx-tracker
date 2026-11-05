"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

export function PortfolioPicker({ portfolios, selected }: { portfolios: { id: string; name: string }[]; selected: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">Portfolio</span>
      <NativeSelect
        className="w-auto font-medium"
        value={selected}
        onChange={(e) => router.push(e.target.value === "all" ? "/home" : `/home?portfolio=${e.target.value}`)}
      >
        <option value="all">All portfolios</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
