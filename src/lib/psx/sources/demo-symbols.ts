// Real PSX tickers with made-up base prices. Demo data only: not real quotes,
// and sector/Shariah flags are illustrative, not authoritative.
export const DEMO_SYMBOLS: { symbol: string; name: string; sector: string; base: number; isEtf?: boolean; isShariah: boolean }[] = [
  { symbol: "OGDC", name: "Oil & Gas Development Company", sector: "Oil & Gas Exploration", base: 230, isShariah: true },
  { symbol: "PPL", name: "Pakistan Petroleum", sector: "Oil & Gas Exploration", base: 180, isShariah: true },
  { symbol: "MARI", name: "Mari Energies", sector: "Oil & Gas Exploration", base: 640, isShariah: true },
  { symbol: "POL", name: "Pakistan Oilfields", sector: "Oil & Gas Exploration", base: 610, isShariah: true },
  { symbol: "PSO", name: "Pakistan State Oil", sector: "Oil & Gas Marketing", base: 410, isShariah: true },
  { symbol: "ATRL", name: "Attock Refinery", sector: "Refinery", base: 690, isShariah: true },
  { symbol: "HBL", name: "Habib Bank", sector: "Commercial Banks", base: 170, isShariah: false },
  { symbol: "MCB", name: "MCB Bank", sector: "Commercial Banks", base: 300, isShariah: false },
  { symbol: "UBL", name: "United Bank", sector: "Commercial Banks", base: 380, isShariah: false },
  { symbol: "MEBL", name: "Meezan Bank", sector: "Commercial Banks", base: 330, isShariah: true },
  { symbol: "BAHL", name: "Bank AL Habib", sector: "Commercial Banks", base: 160, isShariah: false },
  { symbol: "NBP", name: "National Bank of Pakistan", sector: "Commercial Banks", base: 120, isShariah: false },
  { symbol: "LUCK", name: "Lucky Cement", sector: "Cement", base: 1100, isShariah: true },
  { symbol: "DGKC", name: "D.G. Khan Cement", sector: "Cement", base: 140, isShariah: true },
  { symbol: "MLCF", name: "Maple Leaf Cement", sector: "Cement", base: 90, isShariah: true },
  { symbol: "FCCL", name: "Fauji Cement", sector: "Cement", base: 45, isShariah: true },
  { symbol: "FFC", name: "Fauji Fertilizer", sector: "Fertilizer", base: 430, isShariah: true },
  { symbol: "EFERT", name: "Engro Fertilizers", sector: "Fertilizer", base: 220, isShariah: true },
  { symbol: "ENGROH", name: "Engro Holdings", sector: "Inv. Banks / Inv. Cos.", base: 200, isShariah: true },
  { symbol: "HUBC", name: "Hub Power Company", sector: "Power Generation", base: 150, isShariah: true },
  { symbol: "KEL", name: "K-Electric", sector: "Power Generation", base: 5.4, isShariah: false },
  { symbol: "SYS", name: "Systems Limited", sector: "Technology", base: 150, isShariah: true },
  { symbol: "TRG", name: "TRG Pakistan", sector: "Technology", base: 70, isShariah: false },
  { symbol: "PAEL", name: "Pak Elektron", sector: "Cable & Electrical Goods", base: 40, isShariah: true },
  { symbol: "SEARL", name: "The Searle Company", sector: "Pharmaceuticals", base: 100, isShariah: true },
  { symbol: "MZNPETF", name: "Meezan Pakistan ETF", sector: "Exchange Traded Funds", base: 18, isEtf: true, isShariah: true },
];

/** Symbols the price job refreshes by default, in addition to held and watched ones. */
export const DEFAULT_TRACKED_SYMBOLS = DEMO_SYMBOLS.map((s) => s.symbol);
