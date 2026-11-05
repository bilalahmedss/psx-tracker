import { dec, paisa, type Dec } from "./money";
import { DIVIDEND_WHT } from "./tax-rules";
import type { TaxStatus } from "./types";

export function defaultWhtRate(status: TaxStatus): Dec {
  return dec(DIVIDEND_WHT[status]);
}

/**
 * Gross = shares x DPS (or a given gross); WHT = gross x rate (or a given amount);
 * net = gross - WHT - zakat. All rounded half up to the paisa.
 */
export function computeDividend(input: {
  shares?: string | null;
  dps?: string | null;
  gross?: string | null;
  whtRate?: string;
  wht?: string | null;
  zakat: string;
}): { gross: Dec; wht: Dec; zakat: Dec; net: Dec } {
  const gross = paisa(input.gross != null && input.gross !== "" ? dec(input.gross) : dec(input.shares).mul(dec(input.dps)));
  const wht = paisa(input.wht != null && input.wht !== "" ? dec(input.wht) : gross.mul(dec(input.whtRate)));
  const zakat = paisa(dec(input.zakat));
  const net = gross.minus(wht).minus(zakat);
  if (net.isNegative()) throw new Error("WHT and zakat are more than the gross dividend");
  return { gross, wht, zakat, net };
}
