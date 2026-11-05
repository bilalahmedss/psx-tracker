"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { DEFAULT_LAYOUT, sanitizeLayout } from "@/lib/dashboard/cards";

/** Save the user's card order and visibility (owner-only via RLS). */
export async function saveDashboardLayout(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireUser();
  const layout = input === "reset" ? DEFAULT_LAYOUT : sanitizeLayout(input);
  if (!layout) return { ok: false, error: "Invalid layout" };

  const { error } = await supabase
    .from("dashboard_layouts")
    .upsert({ name: "Default", widgets: layout, is_active: true }, { onConflict: "user_id,name" });
  if (error) {
    console.error("saveDashboardLayout failed", error.code, error.message);
    return { ok: false, error: "Could not save your layout. Try again." };
  }
  revalidatePath("/home");
  return { ok: true };
}
