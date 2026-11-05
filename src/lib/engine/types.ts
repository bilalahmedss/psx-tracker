// Engine inputs. Amounts are decimal strings as stored in the database.

export type TaxStatus = "filer" | "non_filer";

export type EngineTxn = {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  qty: string;
  price: string;
  fee: string;
  tax: string;
  otherCharges: string;
  tradeDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp, tie-breaker within a day
  affectsCash: boolean;
};

export type EngineDividend = {
  id: string;
  symbol: string;
  gross: string;
  wht: string;
  zakatDeducted: string;
  net: string;
  paidOn: string;
  affectsCash: boolean;
  createdAt: string;
};

export type EngineCashEntry = {
  id: string;
  type: "deposit" | "withdrawal" | "adjustment" | "deduction";
  /** Signed: positive adds cash. */
  amount: string;
  date: string;
  note: string | null;
  createdAt: string;
};

export type TaxStatusPeriod = { status: TaxStatus; effectiveFrom: string };

export type EnginePrice = { price: string; prevClose: string | null };
