/**
 * Dynamic Market Symbol / Chart Detection.
 *
 * Scans an article's title + plain-text body for common market terms,
 * tickers, or explicit chart references, and resolves them to a matching
 * TradingView symbol — so the article page can automatically embed an
 * interactive TradingView widget (Advanced Chart / Symbol Overview) when
 * the article context references a specific instrument, without requiring
 * the editor to manually configure anything in Sanity.
 *
 * Also supports an explicit override syntax authors can drop directly into
 * the article body: `[[chart:BINANCE:BTCUSDT]]` — if present, this always
 * takes priority over the automated keyword detection below.
 */

interface SymbolRule {
  pattern: RegExp;
  symbol: string;
  label: string;
}

const SYMBOL_RULES: SymbolRule[] = [
  { pattern: /\bbitcoin\b|\bbtc\b/i, symbol: "BINANCE:BTCUSDT", label: "Bitcoin" },
  { pattern: /\bethereum\b|\beth\b/i, symbol: "BINANCE:ETHUSDT", label: "Ethereum" },
  { pattern: /\bgold\b|\bxau\b/i, symbol: "OANDA:XAUUSD", label: "Gold" },
  { pattern: /\bsilver\b|\bxag\b/i, symbol: "OANDA:XAGUSD", label: "Silver" },
  { pattern: /\bcrude\b|\boil\b|\bwti\b/i, symbol: "TVC:USOIL", label: "Crude Oil (WTI)" },
  { pattern: /\bbrent\b/i, symbol: "TVC:UKOIL", label: "Brent Crude" },
  { pattern: /\bdollar index\b|\bdxy\b/i, symbol: "TVC:DXY", label: "US Dollar Index" },
  { pattern: /\bs&p ?500\b|\bs&p\b|\bspx\b/i, symbol: "SP:SPX", label: "S&P 500" },
  { pattern: /\bnasdaq\b|\bndx\b/i, symbol: "NASDAQ:NDX", label: "Nasdaq 100" },
  { pattern: /\bdow jones\b|\bdjia\b/i, symbol: "DJ:DJI", label: "Dow Jones" },
  { pattern: /\b10[\s-]?year (treasury|yield)\b|\bus10y\b/i, symbol: "TVC:US10Y", label: "US 10-Year Treasury Yield" },
  { pattern: /\bfederal funds rate\b|\bfed rate\b/i, symbol: "FRED:DFF", label: "Fed Funds Rate" },
  { pattern: /\beur ?\/? ?usd\b|\beurusd\b/i, symbol: "FX:EURUSD", label: "EUR/USD" },
  { pattern: /\bgbp ?\/? ?usd\b|\bgbpusd\b/i, symbol: "FX:GBPUSD", label: "GBP/USD" },
  { pattern: /\busd ?\/? ?jpy\b|\busdjpy\b/i, symbol: "FX:USDJPY", label: "USD/JPY" },
  { pattern: /\bvix\b|\bvolatility index\b/i, symbol: "TVC:VIX", label: "CBOE Volatility Index" },
];

export interface DetectedMarketSymbol {
  symbol: string;
  label: string;
}

/**
 * Returns the first matching TradingView symbol found in the supplied
 * text, or `null` if no explicit chart tag or known market term is present.
 */
export function detectMarketSymbol(...textParts: (string | undefined | null)[]): DetectedMarketSymbol | null {
  const combined = textParts.filter(Boolean).join(" ");
  if (!combined) return null;

  // 1. Explicit editor override: [[chart:EXCHANGE:SYMBOL]]
  const explicitMatch = combined.match(/\[\[chart:([A-Z0-9:._-]+)\]\]/i);
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

  return null;
}
