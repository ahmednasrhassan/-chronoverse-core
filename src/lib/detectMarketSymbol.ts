/**
 * Dynamic Market Symbol / Chart Detection.
 *
 * Scans an article's title + plain-text body for common market terms,
 * tickers, or explicit chart references, and resolves them to a matching
 * Yahoo Finance-compatible symbol — so the article page can automatically
 * embed an interactive proprietary chart (powered by `lightweight-charts`
 * + `/api/market-data`) when the article context references a specific
 * instrument, without requiring the editor to manually configure anything
 * in Sanity.
 *
 * Also supports an explicit override syntax authors can drop directly into
 * the article body: `[[chart:SYMBOL]]` — if present, this always takes
 * priority over the automated keyword detection below.
 */

interface SymbolRule {
  pattern: RegExp;
  symbol: string;
  label: string;
}

const SYMBOL_RULES: SymbolRule[] = [
  { pattern: /\bbitcoin\b|\bbtc\b/i, symbol: "BTC-USD", label: "Bitcoin" },
  { pattern: /\bethereum\b|\beth\b/i, symbol: "ETH-USD", label: "Ethereum" },
  { pattern: /\bgold\b|\bxau\b/i, symbol: "GC=F", label: "Gold" },
  { pattern: /\bsilver\b|\bxag\b/i, symbol: "SI=F", label: "Silver" },
  { pattern: /\bcrude\b|\boil\b|\bwti\b/i, symbol: "CL=F", label: "Crude Oil (WTI)" },
  { pattern: /\bbrent\b/i, symbol: "BZ=F", label: "Brent Crude" },
  { pattern: /\bdollar index\b|\bdxy\b/i, symbol: "DX-Y.NYB", label: "US Dollar Index" },
  { pattern: /\bs&p ?500\b|\bs&p\b|\bspx\b/i, symbol: "^GSPC", label: "S&P 500" },
  { pattern: /\bnasdaq\b|\bndx\b/i, symbol: "^NDX", label: "Nasdaq 100" },
  { pattern: /\bdow jones\b|\bdjia\b/i, symbol: "^DJI", label: "Dow Jones" },
  { pattern: /\b10[\s-]?year (treasury|yield)\b|\bus10y\b/i, symbol: "^TNX", label: "US 10-Year Treasury Yield" },
  { pattern: /\beur ?\/? ?usd\b|\beurusd\b/i, symbol: "EURUSD=X", label: "EUR/USD" },
  { pattern: /\bgbp ?\/? ?usd\b|\bgbpusd\b/i, symbol: "GBPUSD=X", label: "GBP/USD" },
  { pattern: /\busd ?\/? ?jpy\b|\busdjpy\b/i, symbol: "USDJPY=X", label: "USD/JPY" },
  { pattern: /\bvix\b|\bvolatility index\b/i, symbol: "^VIX", label: "CBOE Volatility Index" },
];

export interface DetectedMarketSymbol {
  symbol: string;
  label: string;
}

/**
 * Returns the first matching Yahoo Finance-compatible symbol found in the
 * supplied text, or `null` if no explicit chart tag or known market term
 * is present.
 */
export function detectMarketSymbol(...textParts: (string | undefined | null)[]) {
  const combined = textParts.filter(Boolean).join(" ");

  // 1. Explicit editor override: [[chart:SYMBOL]]
  if (combined) {
    const explicitMatch = combined.match(/\[\[chart:([A-Z0-9.=\^_-]+)\]\]/i);
    if (explicitMatch) {
      const symbol = explicitMatch[1].toUpperCase();
      return { symbol, label: symbol };
    }

    // 2. Automated keyword detection
    for (const rule of SYMBOL_RULES) {
      if (rule.pattern.test(combined)) {
        return { symbol: rule.symbol, label: rule.label };
      }
    }
  }

  // 3. Fallback: if no explicit chart tag or known market term is present, return null.
  return null;
}
