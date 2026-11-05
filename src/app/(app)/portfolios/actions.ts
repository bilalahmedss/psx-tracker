"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { parsePortfolioForm, toRpcArgs, type FieldErrors } from "@/lib/portfolio/validation";

export type PortfolioFormState = { error?: string; fieldErrors?: FieldErrors } | undefined;
export type DeleteState = { error?: string } | undefined;

function rpcErrorMessage(error: { code?: string; message: string }): PortfolioFormState {
  switch (error.code) {
    case "23505":
      return { fieldErrors: { name: "You already have a portfolio with this name." } };
    case "23514":
      return { error: "One of the values is out of the allowed range." };
    case "P0002":
      return { error: "This portfolio no longer exists." };
    case "42501":
      return { error: "Your session has expired. Sign in again." };
    default:
      console.error("portfolio rpc failed", error.code, error.message);
      return { error: "Could not save the portfolio. Try again." };
  }
}

export async function createPortfolio(_prev: PortfolioFormState, fd: FormData): Promise<PortfolioFormState> {
  const { supabase } = await requireUser();
  const parsed = parsePortfolioForm(fd);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { error } = await supabase.rpc("create_portfolio", toRpcArgs(parsed.data));
  if (error) return rpcErrorMessage(error);

  revalidatePath("/portfolios", "layout");
  redirect("/portfolios");
}

export async function updatePortfolio(
  id: string,
  _prev: PortfolioFormState,
  fd: FormData,
): Promise<PortfolioFormState> {
  const { supabase } = await requireUser();
  const parsed = parsePortfolioForm(fd);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { error } = await supabase.rpc("update_portfolio", {
    p_id: id,
    ...toRpcArgs(parsed.data),
    p_status_effective_from: parsed.data.statusEffectiveFrom,
  });
  if (error) return rpcErrorMessage(error);

  revalidatePath("/portfolios", "layout");
  redirect("/portfolios");
}

export async function deletePortfolio(id: string, _prev: DeleteState, fd: FormData): Promise<DeleteState> {
  const { supabase } = await requireUser();

  // RLS limits this to the user's own portfolios.
  const { data: portfolio } = await supabase.from("portfolios").select("name").eq("id", id).maybeSingle();
  if (!portfolio) return { error: "This portfolio no longer exists." };

  const confirm = fd.get("confirm");
  if (typeof confirm !== "string" || confirm.trim() !== portfolio.name) {
    return { error: "Type the portfolio name exactly to confirm." };
  }

  const { error } = await supabase.rpc("delete_portfolio", { p_id: id });
  if (error) {
    console.error("delete_portfolio failed", error.code, error.message);
    return { error: "Could not delete the portfolio. Try again." };
  }

  revalidatePath("/portfolios", "layout");
  redirect("/portfolios");
}

export async function deleteTaxStatusChange(portfolioId: string, changeId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_tax_status_change", { p_change_id: changeId });
  if (error && error.code !== "P0002") console.error("delete_tax_status_change failed", error.code, error.message);
  revalidatePath("/portfolios", "layout");
  redirect(`/portfolios/${portfolioId}/edit`);
}
