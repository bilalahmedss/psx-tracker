import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_SELECT_CLASS } from "./native-select";

// Regression: in dark mode the broker dropdown showed white text on the
// browser's white option popup, because selects had a transparent background.

describe("NativeSelect styling", () => {
  it("never uses a transparent background", () => {
    expect(NATIVE_SELECT_CLASS).not.toMatch(/\bbg-transparent\b/);
    expect(NATIVE_SELECT_CLASS).toMatch(/\bbg-background\b/);
    expect(NATIVE_SELECT_CLASS).toMatch(/\btext-foreground\b/);
  });

  it("gives options explicit theme colours", () => {
    expect(NATIVE_SELECT_CLASS).toContain("[&_option]:bg-popover");
    expect(NATIVE_SELECT_CLASS).toContain("[&_option]:text-popover-foreground");
  });

  it("makes native popups follow the theme via color-scheme", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.dark\s*\{\s*color-scheme:\s*dark;?\s*\}/);
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light;?\s*\}/);
  });

  it("is the only way the app renders a <select>", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const offenders = walk(join(process.cwd(), "src"))
      .filter((f) => f.endsWith(".tsx") && !f.endsWith("native-select.tsx"))
      .filter((f) => /<select[\s>]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
