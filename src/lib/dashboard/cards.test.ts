import { describe, expect, it } from "vitest";
import { CARD_DEFS, DEFAULT_LAYOUT, mergeLayout, sanitizeLayout } from "./cards";

describe("mergeLayout", () => {
  it("returns the default layout when nothing is saved", () => {
    expect(mergeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(mergeLayout("junk")).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps the saved order and hidden cards", () => {
    const merged = mergeLayout([
      { id: "cash", visible: true },
      { id: "value", visible: false },
    ]);
    expect(merged.slice(0, 2)).toEqual([
      { id: "cash", visible: true },
      { id: "value", visible: false },
    ]);
  });

  it("appends cards added after the layout was saved", () => {
    const merged = mergeLayout([{ id: "cash", visible: false }]);
    expect(merged).toHaveLength(CARD_DEFS.length);
    expect(merged.at(-1)).toEqual({ id: CARD_DEFS.at(-1)!.id, visible: true });
  });

  it("drops unknown and duplicate ids", () => {
    const merged = mergeLayout([{ id: "nope" }, { id: "cash" }, { id: "cash", visible: false }, 42, null]);
    expect(merged.filter((m) => m.id === "cash")).toEqual([{ id: "cash", visible: true }]);
    expect(merged.map((m) => m.id)).not.toContain("nope");
  });
});

describe("sanitizeLayout", () => {
  it("rejects non-arrays and oversized input", () => {
    expect(sanitizeLayout({})).toBeNull();
    expect(sanitizeLayout(Array.from({ length: 51 }, () => ({ id: "cash" })))).toBeNull();
  });
  it("normalises a valid layout", () => {
    expect(sanitizeLayout([{ id: "today", visible: false }])?.[0]).toEqual({ id: "today", visible: false });
  });
});
