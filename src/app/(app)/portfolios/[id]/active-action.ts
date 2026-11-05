export type PortfolioAction = "trade" | "dividend" | "cash" | "import" | "settings";

/**
 * Which header action the current page belongs to, so only that button is
 * highlighted. Tab pages (holdings, history, dividends list, cash ledger) have none.
 */
export function activeAction(pathname: string, portfolioId: string): PortfolioAction | null {
  const base = `/portfolios/${portfolioId}`;
  if (!pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length);
  if (/^\/trades\/(new|[^/]+\/edit)\/?$/.test(rest)) return "trade";
  if (/^\/dividends\/(new|[^/]+\/edit)\/?$/.test(rest)) return "dividend";
  if (/^\/cash\/(new|[^/]+\/edit)\/?$/.test(rest)) return "cash";
  if (/^\/import\/?$/.test(rest)) return "import";
  if (/^\/edit\/?$/.test(rest)) return "settings";
  return null;
}
