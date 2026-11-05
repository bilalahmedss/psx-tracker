import type { Dec } from "@/lib/engine/money";
import { changeTone, formatPct, formatPrice, formatSigned, type Tone } from "@/lib/format";

// Engine Decimal -> display strings (safe to pass to client components).

export const rs = (d: Dec | null | undefined, dp = 2) => (d ? formatPrice(d.toFixed(), dp) : "-");
export const signedRs = (d: Dec | null | undefined) => (d ? formatSigned(d.toFixed()) : "-");
export const pct = (d: Dec | null | undefined) => (d ? formatPct(d.toFixed()) : "-");
export const shares = (d: Dec | null | undefined) => (d ? formatPrice(d.toFixed(), 0) : "-");
export const tone = (d: Dec | null | undefined): Tone => (d ? changeTone(d.toFixed()) : "flat");
/** Rate fraction -> "15%" / "12.5%" */
export const ratePct = (d: Dec) => `${d.mul(100).toFixed()}%`;

export const toneClass: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
};
