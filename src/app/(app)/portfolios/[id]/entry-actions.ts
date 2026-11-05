"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { computeDividend } from "@/lib/engine/dividends";
import { OversellError, runFifo } from "@/lib/engine/fifo";
import type { EngineTxn } from "@/lib/engine/types";
import {
  CASH_FIELDS,
  DIVIDEND_FIELDS,
  TRADE_FIELDS,
  cashEntrySchema,
  dividendSchema,
  parseForm,
  tradeSchema,
  type FieldErrorMap,
} from "@/lib/portfolio/entry-validation";
import { pktParts } from "@/lib/psx/calendar";

// Writes go through supabase-js as the user, so RLS limits them to the user's own portfolios.

export type EntryFormState = { error?: string; fieldErrors?: FieldErrorMap } | undefined;

const today = () => pktParts(new Date()).date;

function done(portfolioId: string, to: string): never {
  revalidatePath("/portfolios", "layout");
  redirect(to.startsWith(`/portfolios/${portfolioId}`) ? to : `/portfolios/${portfolioId}`);
}

function returnTo(fd: FormData, fallback: string): string {
  const v = fd.get("returnTo");
  return typeof v === "string" && v.startsWith("/portfolios/") ? v : fallback;
}

async function ownsPortfolio(supabase: SupabaseClient, portfolioId: string): Promise<boolean> {
  const { data } = await supabase.from("portfolios").select("id").eq("id", portfolioId).maybeSingle();
  return Boolean(data);
}

async function symbolExists(supabase: SupabaseClient, symbol: string): Promise<boolean> {
  const { data } = await supabase.from("securities").select("symbol").eq("symbol", symbol).maybeSingle();
  return Boolean(data);
}

async function loadTxns(supabase: SupabaseClient, portfolioId: string): Promise<EngineTxn[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, symbol, type, qty, price, fee, tax, other_charges, trade_date, created_at, affects_cash")
    .eq("portfolio_id", portfolioId)
    .in("type", ["buy", "sell"]);
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    symbol: string;
    type: "buy" | "sell";
    qty: string;
    price: string;
    fee: string;
    tax: string;
    other_charges: string;
    trade_date: string;
    created_at: string;
    affects_cash: boolean;
  };
  return (data as Row[]).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    type: r.type,
    qty: r.qty,
    price: r.price,
    fee: r.fee,
    tax: r.tax,
    otherCharges: r.other_charges,
    tradeDate: r.trade_date,
    createdAt: r.created_at,
    affectsCash: r.affects_cash,
  }));
}

/** Replays FIFO with the proposed change; returns a message if any sell would exceed holdings. */
function oversellMessage(txns: EngineTxn[]): string | null {
  try {
    runFifo(txns);
    return null;
  } catch (e) {
    if (e instanceof OversellError) {
      return `This leaves a sale of ${e.requested.toFixed()} ${e.symbol} on ${e.tradeDate} with only ${e.held.toFixed()} shares held.`;
    }
    throw e;
  }
}

// ---------- trades ----------

export async function saveTrade(portfolioId: string, txnId: string | null, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  if (!(await ownsPortfolio(supabase, portfolioId))) return { error: "This portfolio no longer exists." };

  const parsed = parseForm(tradeSchema(today()), fd, TRADE_FIELDS);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const t = parsed.data;
  if (!(await symbolExists(supabase, t.symbol))) return { fieldErrors: { symbol: "Choose a stock from the list" } };

  const existing = await loadTxns(supabase, portfolioId);
  if (txnId && !existing.some((x) => x.id === txnId)) return { error: "This trade no longer exists." };
  const proposed: EngineTxn = {
    id: txnId ?? "new",
    symbol: t.symbol,
    type: t.type,
    qty: t.qty,
    price: t.price,
    fee: t.fee,
    tax: t.tax,
    otherCharges: t.otherCharges,
    tradeDate: t.tradeDate,
    createdAt: existing.find((x) => x.id === txnId)?.createdAt ?? new Date().toISOString(),
    affectsCash: t.affectsCash,
  };
  const problem = oversellMessage([...existing.filter((x) => x.id !== txnId), proposed]);
  if (problem) return { fieldErrors: { qty: problem } };

  const row = {
    portfolio_id: portfolioId,
    symbol: t.symbol,
    type: t.type,
    qty: t.qty,
    price: t.price,
    fee: t.fee,
    tax: t.tax,
    other_charges: t.otherCharges,
    trade_date: t.tradeDate,
    affects_cash: t.affectsCash,
    note: t.note,
  };
  const { error } = txnId
    ? await supabase.from("transactions").update(row).eq("id", txnId).eq("portfolio_id", portfolioId)
    : await supabase.from("transactions").insert({ ...row, source: "manual" });
  if (error) {
    console.error("saveTrade failed", error.code, error.message);
    return { error: "Could not save the trade. Try again." };
  }
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/holdings/${encodeURIComponent(t.symbol)}`));
}

export async function deleteTrade(portfolioId: string, txnId: string, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  const existing = await loadTxns(supabase, portfolioId);
  if (!existing.some((x) => x.id === txnId)) return { error: "This trade no longer exists." };
  const problem = oversellMessage(existing.filter((x) => x.id !== txnId));
  if (problem) return { error: `Can't delete this buy: ${problem} Delete or edit the later sale first.` };

  const { error } = await supabase.from("transactions").delete().eq("id", txnId).eq("portfolio_id", portfolioId);
  if (error) return { error: "Could not delete the trade. Try again." };
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/history`));
}

// ---------- dividends ----------

export async function saveDividend(portfolioId: string, dividendId: string | null, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  if (!(await ownsPortfolio(supabase, portfolioId))) return { error: "This portfolio no longer exists." };

  const parsed = parseForm(dividendSchema(today()), fd, DIVIDEND_FIELDS);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  if (!(await symbolExists(supabase, d.symbol))) return { fieldErrors: { symbol: "Choose a stock from the list" } };

  // Net is always gross - WHT - zakat, computed here rather than trusted from the browser.
  const amounts = computeDividend({ gross: d.gross, wht: d.wht, zakat: d.zakat });

  const row = {
    portfolio_id: portfolioId,
    symbol: d.symbol,
    shares: d.shares,
    dps: d.dps,
    gross: amounts.gross.toFixed(2),
    wht: amounts.wht.toFixed(2),
    zakat_deducted: amounts.zakat.toFixed(2),
    net: amounts.net.toFixed(2),
    paid_on: d.paidOn,
    affects_cash: d.affectsCash,
    note: d.note,
  };
  const { error } = dividendId
    ? await supabase.from("dividend_receipts").update(row).eq("id", dividendId).eq("portfolio_id", portfolioId)
    : await supabase.from("dividend_receipts").insert({ ...row, source: "manual" });
  if (error) {
    console.error("saveDividend failed", error.code, error.message);
    return { error: "Could not save the dividend. Try again." };
  }
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/dividends`));
}

export async function deleteDividend(portfolioId: string, dividendId: string, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  const { error, count } = await supabase
    .from("dividend_receipts")
    .delete({ count: "exact" })
    .eq("id", dividendId)
    .eq("portfolio_id", portfolioId);
  if (error || !count) return { error: "Could not delete the dividend. Try again." };
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/dividends`));
}

// ---------- cash entries ----------

export async function saveCashEntry(portfolioId: string, entryId: string | null, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  if (!(await ownsPortfolio(supabase, portfolioId))) return { error: "This portfolio no longer exists." };

  const parsed = parseForm(cashEntrySchema(today()), fd, CASH_FIELDS);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const c = parsed.data;

  const row = { portfolio_id: portfolioId, type: c.type, amount: c.signedAmount, date: c.date, note: c.note };
  const { error } = entryId
    ? await supabase.from("cash_entries").update(row).eq("id", entryId).eq("portfolio_id", portfolioId)
    : await supabase.from("cash_entries").insert(row);
  if (error) {
    console.error("saveCashEntry failed", error.code, error.message);
    return { error: "Could not save the cash entry. Try again." };
  }
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/cash`));
}

export async function deleteCashEntry(portfolioId: string, entryId: string, _prev: EntryFormState, fd: FormData): Promise<EntryFormState> {
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("cash_entries").delete({ count: "exact" }).eq("id", entryId).eq("portfolio_id", portfolioId);
  if (error || !count) return { error: "Could not delete the entry. Try again." };
  done(portfolioId, returnTo(fd, `/portfolios/${portfolioId}/cash`));
}
