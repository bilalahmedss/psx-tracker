import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv } from "./csv";
import { TEMPLATE_CSV, parseDate, parseImport, parseNumber, type ImportContext } from "./import";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n1,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", ""],
    ]);
  });
  it("strips a BOM and blank lines", () => {
    expect(parseCsv("﻿date,type\n\n2025-01-01,buy\n")).toEqual([
      ["date", "type"],
      ["2025-01-01", "buy"],
    ]);
  });
});

describe("csvCell / toCsv", () => {
  it("blocks spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-50.25")).toBe("-50.25");
    expect(csvCell("-x")).toBe("'-x");
  });
  it("quotes cells with commas, quotes or newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });
  it("round-trips through the parser", () => {
    const rows = [["x, y", 'q"t', "-5"]];
    expect(parseCsv(toCsv(["a", "b", "c"], rows)).slice(1)).toEqual(rows);
  });
});

describe("parseDate / parseNumber", () => {
  it("accepts ISO and day-first dates", () => {
    expect(parseDate("2025-01-10")).toBe("2025-01-10");
    expect(parseDate("10/03/2025")).toBe("2025-03-10");
    expect(parseDate("1-4-2025")).toBe("2025-04-01");
  });
  it("rejects impossible dates", () => {
    expect(() => parseDate("31/02/2025")).toThrow(/doesn't exist/);
    expect(() => parseDate("2025/01/10")).toThrow();
  });
  it("accepts commas and Rs", () => {
    expect(parseNumber("1,234.50", "x")).toBe("1234.5");
    expect(parseNumber("Rs 100", "x")).toBe("100");
    expect(parseNumber("", "x")).toBeNull();
    expect(() => parseNumber("-5", "x")).toThrow(/isn't a number/);
  });
});

const ctx: ImportContext = {
  today: "2026-11-05",
  feeProfile: { threshold: "20", pctAbove: "0.0015", perShareBelow: "0.03", fedPct: "0.15", minFee: "0" },
  taxHistory: [{ status: "filer", effectiveFrom: "1900-01-01" }],
  knownSymbols: new Set(["OGDC", "HBL"]),
};

describe("parseImport", () => {
  it("imports the template cleanly, filling blank fees and dividend tax", () => {
    const r = parseImport(TEMPLATE_CSV, ctx);
    expect(r.fatal).toBeNull();
    expect(r.errorCount).toBe(0);
    expect(r.cash).toEqual([
      { type: "deposit", amount: "100000", date: "2025-01-01", note: "Opening deposit" },
      { type: "withdrawal", amount: "-10000", date: "2025-05-01", note: "To bank account" },
    ]);
    // Buy 1,000 @ 50: fees from the profile -> 75.00 + 11.25
    expect(r.trades[0]).toMatchObject({ symbol: "OGDC", type: "buy", qty: "1000", fee: "75.00", tax: "11.25", other_charges: "5", trade_date: "2025-01-10", affects_cash: true });
    // Sell row gives its own fees; DD/MM/YYYY date
    expect(r.trades[1]).toMatchObject({ type: "sell", fee: "36", tax: "5.4", trade_date: "2025-03-10" });
    // Dividend 600 x 5.50 = 3,300; filer 15% = 495; net 2,805
    expect(r.dividends[0]).toMatchObject({ shares: "600", dps: "5.5", gross: "3300.00", wht: "495.00", net: "2805.00", affects_cash: false });
  });

  it("uses the non-filer dividend tax rate for the status on that date", () => {
    const r = parseImport("date,type,symbol,quantity,amount\n2025-08-01,dividend,HBL,100,1000\n", {
      ...ctx,
      taxHistory: [
        { status: "filer", effectiveFrom: "1900-01-01" },
        { status: "non_filer", effectiveFrom: "2025-07-01" },
      ],
    });
    expect(r.dividends[0]).toMatchObject({ gross: "1000.00", wht: "300.00", net: "700.00" });
  });

  it("reports each bad row with its line number and keeps going", () => {
    const r = parseImport(
      [
        "date,type,symbol,quantity,price,amount,affects_cash",
        "2025-01-10,buy,NOPE,10,5,,",
        "2025-01-10,buy,OGDC,10.5,5,,",
        "2099-01-01,deposit,,,,100,",
        "2025-01-10,transfer,OGDC,1,1,,",
        "2025-01-10,dividend,OGDC,10,,,",
        "2025-01-10,sell,OGDC,10,5,,maybe",
        "2025-01-11,deposit,,,,500,",
      ].join("\n"),
      ctx,
    );
    expect(r.errorCount).toBe(6);
    expect(r.rows.map((x) => [x.line, x.error])).toEqual([
      [2, 'Unknown symbol "NOPE"'],
      [3, "quantity must be a whole number"],
      [4, "Date is in the future"],
      [5, "Type \"transfer\" should be one of buy, sell, dividend, deposit, withdrawal"],
      [6, "Give either price (dividend per share) or amount (gross)"],
      [7, 'affects_cash "maybe" should be yes or no'],
      [8, null],
    ]);
    expect(r.cash).toHaveLength(1);
  });

  it("rejects files without the required columns or with unknown ones", () => {
    expect(parseImport("symbol,quantity\nOGDC,1\n", ctx).fatal).toMatch(/"date"/);
    expect(parseImport("date,type,colour\n", ctx).fatal).toMatch(/colour/);
    expect(parseImport("", ctx).fatal).toMatch(/empty/);
  });
});
