import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// Placeholder so the test runner is wired up. Money-maths tests arrive in Milestone 1.
describe("test setup", () => {
  it("runs", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
