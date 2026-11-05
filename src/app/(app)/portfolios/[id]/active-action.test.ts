import { describe, expect, it } from "vitest";
import { activeAction } from "./active-action";

// Regression: "Add trade" stayed highlighted on the Import CSV and Cash entry pages.

const id = "7c5a8c64-bfe5-4ba0-8cb3-65d5f95cd046";
const p = (rest: string) => `/portfolios/${id}${rest}`;

describe("activeAction", () => {
  it.each([
    ["/trades/new", "trade"],
    ["/trades/abc-123/edit", "trade"],
    ["/dividends/new", "dividend"],
    ["/dividends/abc/edit", "dividend"],
    ["/cash/new", "cash"],
    ["/cash/abc/edit", "cash"],
    ["/import", "import"],
    ["/edit", "settings"],
  ])("%s highlights %s", (rest, expected) => {
    expect(activeAction(p(rest), id)).toBe(expected);
  });

  it.each(["", "/history", "/dividends", "/cash", "/holdings/OGDC"])("tab page %j highlights nothing", (rest) => {
    expect(activeAction(p(rest), id)).toBeNull();
  });

  it("ignores other portfolios' paths", () => {
    expect(activeAction("/portfolios/other-id/import", id)).toBeNull();
  });
});
