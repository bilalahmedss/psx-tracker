import { describe, expect, it } from "vitest";
import { DEFAULT_BROKER_NAME, preferredBroker } from "./broker-default";
import { PSX_DEFAULT_FEES } from "./defaults";

const b = (name: string) => ({ id: name.toLowerCase(), name, fees: PSX_DEFAULT_FEES });
const brokers = [b("AKD Securities"), b(DEFAULT_BROKER_NAME), b("JS Global Capital"), b("Other")];

describe("preferredBroker", () => {
  it("starts a first portfolio with Chase Securities (Nafa)", () => {
    expect(preferredBroker(brokers, [])?.name).toBe(DEFAULT_BROKER_NAME);
  });
  it("reuses the broker of the newest portfolio that has one", () => {
    expect(preferredBroker(brokers, [null, "JS Global Capital", "AKD Securities"])?.name).toBe("JS Global Capital");
  });
  it("falls back when a saved broker no longer exists", () => {
    expect(preferredBroker(brokers, ["Gone Ltd"])?.name).toBe(DEFAULT_BROKER_NAME);
    expect(preferredBroker([b("AKD Securities")], [])).toBeNull();
  });
});
