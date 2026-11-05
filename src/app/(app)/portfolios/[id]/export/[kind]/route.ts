import type { NextRequest } from "next/server";
import { toCsv } from "@/lib/csv/csv";
import { IMPORT_COLUMNS } from "@/lib/csv/import";
import { txnCashValue } from "@/lib/engine/fifo";
import { getPortfolioBook } from "@/lib/portfolio/book";
import { pktParts } from "@/lib/psx/calendar";

// CSV exports. Reads through the user's session (RLS). Trades and dividends use
// the import template's columns, so an export can be re-imported elsewhere.

const yesNo = (b: boolean) => (b ? "yes" : "no");

export async function GET(_req: NextRequest, ctx: RouteContext<"/portfolios/[id]/export/[kind]">) {
  const { id, kind } = await ctx.params;
  const book = await getPortfolioBook(id);
  const { txns, dividends, result, names } = book;
  const blankRow = () => Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ""])) as Record<(typeof IMPORT_COLUMNS)[number], string>;

  let csv: string;
  if (kind === "trades") {
    const rows = [...txns]
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAt.localeCompare(b.createdAt))
      .map((t) => {
        const r = blankRow();
        Object.assign(r, {
          date: t.tradeDate,
          type: t.type,
          symbol: t.symbol,
          quantity: t.qty,
          price: t.price,
          commission: t.fee,
          sales_tax: t.tax,
          other_charges: t.otherCharges,
          amount: txnCashValue(t).toFixed(2),
          affects_cash: yesNo(t.affectsCash),
          note: t.note ?? "",
        });
        return IMPORT_COLUMNS.map((c) => r[c]);
      });
    csv = toCsv([...IMPORT_COLUMNS], rows);
  } else if (kind === "dividends") {
    const rows = [...dividends]
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn))
      .map((d) => {
        const r = blankRow();
        Object.assign(r, {
          date: d.paidOn,
          type: "dividend",
          symbol: d.symbol,
          quantity: d.shares ?? "",
          price: d.dps ?? "",
          amount: d.gross,
          tax_withheld: d.wht,
          zakat: d.zakatDeducted,
          affects_cash: yesNo(d.affectsCash),
          note: d.note ?? "",
        });
        return IMPORT_COLUMNS.map((c) => r[c]);
      });
    csv = toCsv([...IMPORT_COLUMNS], rows);
  } else if (kind === "holdings") {
    csv = toCsv(
      ["symbol", "name", "shares", "avg_cost", "cost", "price", "market_value", "unrealized", "unrealized_pct", "realized", "dividends_net"],
      result.holdings.map((h) => [
        h.symbol,
        names[h.symbol] ?? "",
        h.qty.toFixed(),
        h.avgCost.toFixed(4),
        h.cost.toFixed(2),
        h.price?.toFixed(2) ?? "",
        h.marketValue?.toFixed(2) ?? "",
        h.unrealized?.toFixed(2) ?? "",
        h.unrealizedPct?.toFixed(2) ?? "",
        h.realized.toFixed(2),
        h.dividendsNet.toFixed(2),
      ]),
    );
  } else if (kind === "cash") {
    csv = toCsv(
      ["date", "type", "symbol", "description", "amount", "balance"],
      result.ledger.lines.map((l) => [l.date, l.kind, l.symbol ?? "", l.description, l.amount.toFixed(2), l.balance.toFixed(2)]),
    );
  } else {
    return new Response("Unknown export", { status: 404 });
  }

  const safeName = book.portfolio.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "portfolio";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-${kind}-${pktParts(new Date()).date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
