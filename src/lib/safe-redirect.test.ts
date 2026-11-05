import { describe, expect, it } from "vitest";
import { HOME_PATH, isPublicPath, safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/portfolios/new")).toBe("/portfolios/new");
    expect(safeNext("/reset-password")).toBe("/reset-password");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "evil", "/ok\nSet-Cookie:x", ""])(
    "falls back for %j",
    (v) => {
      expect(safeNext(v)).toBe(HOME_PATH);
    },
  );
  it("falls back for null", () => {
    expect(safeNext(null)).toBe(HOME_PATH);
  });
});

describe("isPublicPath", () => {
  it("marks auth pages public", () => {
    for (const p of ["/", "/login", "/forgot-password", "/auth/callback"]) expect(isPublicPath(p)).toBe(true);
  });
  it("protects app pages", () => {
    for (const p of ["/portfolios", "/portfolios/new", "/reset-password", "/loginx", "/market", "/api/other"]) expect(isPublicPath(p)).toBe(false);
  });
  it("lets job endpoints through (they check CRON_SECRET)", () => {
    expect(isPublicPath("/api/jobs/prices")).toBe(true);
  });
});
