"use server";

import { revalidatePath } from "next/cache";
import { negativeCashWarning } from "@/lib/engine/cash";
import { OversellError, runFifo } from "@/lib/engine/fifo";
import type { EngineTxn } from "@/lib/engine/types";
import { parseImport, type ImportResult } from "@/lib/csv/import";
import { feeProfileOf, getPortfolioBook, getSecurityOptions } from "@/lib/portfolio/book";
import { requireUser } from "@/lib/auth";
import { pktParts } from "@/lib/psx/calendar";

const MAX_BYTES = 1_000_000;

export type ImportPreview = Omit<ImportResult, "trades" | "dividends" | "cash"> & {
  counts: { trades: number; dividends: number; cash: number };
  /** Selling more than held once imported trades are merged with existing ones. */
  oversell: string | null;
  /** Non-blocking: the import would take cash below zero. */
  cashWarning: string | null;
};

async function analyse(portfolioId: string, text: string): Promise<{ preview: ImportPreview; parsed: ImportResult }> {
  if (text.length > MAX_BYTES) {
    const preview = {
      fatal: "File is larger than 1 MB. Split it into smaller files.",
      warnings: [],
      rows: [],
      errorCount: 0,
      counts: { trades: 0, dividends: 0, cash: 0 },
      oversell: null,
      cashWarning: null,
    };
    return { preview, parsed: { ...preview, trades: [], dividends: [], cash: [] } };
  }
  const [book, securities] = await Promise.all([getPortfolioBook(portfolioId), getSecurityOptions()]);
  const parsed = parseImport(text, {
    today: pktParts(new Date()).date,
    feeProfile: feeProfileOf(book),
    taxHistory: book.taxHistory,
    knownSymbols: new Set(securities.map((s) => s.symbol)),
  });

  let oversell: string | null = null;
  let cashWarning: string | null = null;
  let incoming: EngineTxn[] = [];
  if (!parsed.fatal && parsed.trades.length) {
    incoming = parsed.trades.map((t, i) => ({
      id: `csv-${i}`,
      symbol: t.symbol,
      type: t.type,
      qty: t.qty,
      price: t.price,
      fee: t.fee,
      tax: t.tax,
      otherCharges: t.other_charges,
      tradeDate: t.trade_date,
      // Keep file order for same-day rows, after existing entries.
      createdAt: `9999-12-31T00:00:00.${String(i).padStart(6, "0")}Z`,
      affectsCash: t.affects_cash,
    }));
    try {
      runFifo([...book.txns, ...incoming]);
    } catch (e) {
      if (!(e instanceof OversellError)) throw e;
      oversell = `After import, the sale of ${e.requested.toFixed()} ${e.symbol} on ${e.tradeDate} would exceed the ${e.held.toFixed()} shares held. Add the missing buys or fix the quantity.`;
    }
  }

  if (!parsed.fatal) {
    const stamp = "9999-12-31T00:00:00Z";
    const warning = negativeCashWarning(
      { txns: book.txns, dividends: book.dividends, entries: book.cashEntries },
      {
        txns: incoming,
        dividends: parsed.dividends.map((d, i) => ({
          id: `csv-d${i}`,
          symbol: d.symbol,
          gross: d.gross,
          wht: d.wht,
          zakatDeducted: d.zakat,
          net: d.net,
          paidOn: d.paid_on,
          affectsCash: d.affects_cash,
          createdAt: stamp,
        })),
        entries: parsed.cash.map((c, i) => ({ id: `csv-c${i}`, type: c.type, amount: c.amount, date: c.date, note: c.note, createdAt: stamp })),
      },
    );
    if (warning) cashWarning = `${warning.message} (it first drops below zero on ${warning.date}, to Rs ${warning.balance.toFixed(2)}).`;
  }

  const { trades, dividends, cash, ...rest } = parsed;
  return { preview: { ...rest, counts: { trades: trades.length, dividends: dividends.length, cash: cash.length }, oversell, cashWarning }, parsed };
}

export async function previewImport(portfolioId: string, text: string): Promise<ImportPreview> {
  await requireUser();
  return (await analyse(portfolioId, text)).preview;
}

export async function commitImport(portfolioId: string, text: string): Promise<{ ok: true; counts: ImportPreview["counts"] } | { ok: false; error: string }> {
  const { supabase } = await requireUser();
  // Re-parse on the server: never trust a preview sent back from the browser.
  const { preview, parsed } = await analyse(portfolioId, text);
  if (preview.fatal) return { ok: false, error: preview.fatal };
  if (preview.errorCount) return { ok: false, error: `Fix the ${preview.errorCount} row(s) with errors first.` };
  if (preview.oversell) return { ok: false, error: preview.oversell };
  const total = preview.counts.trades + preview.counts.dividends + preview.counts.cash;
  if (!total) return { ok: false, error: "There are no rows to import." };

  const { error } = await supabase.rpc("import_portfolio_rows", {
    p_portfolio_id: portfolioId,
    p_trades: parsed.trades,
    p_dividends: parsed.dividends,
    p_cash: parsed.cash,
  });
  if (error) {
    console.error("import_portfolio_rows failed", error.code, error.message);
    return { ok: false, error: error.code === "P0002" ? "This portfolio no longer exists." : "The import failed and nothing was saved. Try again." };
  }
  revalidatePath("/portfolios", "layout");
  revalidatePath("/home");
  return { ok: true, counts: preview.counts };
}
