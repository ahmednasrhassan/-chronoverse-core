/**
 * Chronoverse Capital
 * Gold Price History
 *
 * Provider: Alpha Vantage
 * Server-side only.
 */

const ALPHA_VANTAGE_BASE_URL =
  "https://www.alphavantage.co/query";

type AlphaVantageGoldRow = {
  date?: string;
  price?: string;
};

type AlphaVantageGoldResponse = {
  name?: string;
  interval?: string;
  unit?: string;
  data?: AlphaVantageGoldRow[];

  Information?: string;
  Note?: string;
  Error_Message?: string;
};

export type GoldPricePoint = {
  date: string;
  close: number;
};

export async function fetchGoldPriceHistory(): Promise<
  GoldPricePoint[]
> {
  const apiKey =
    process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing ALPHA_VANTAGE_API_KEY.",
    );
  }

  const params = new URLSearchParams({
    function: "GOLD_SILVER_HISTORY",
    symbol: "GOLD",
    interval: "daily",
    apikey: apiKey,
  });

  const response = await fetch(
    `${ALPHA_VANTAGE_BASE_URL}?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Alpha Vantage request failed: ${response.status}.`,
    );
  }

  const payload =
    (await response.json()) as AlphaVantageGoldResponse;

  if (payload.Error_Message) {
    throw new Error(
      `Alpha Vantage: ${payload.Error_Message}`,
    );
  }

  if (payload.Note) {
    throw new Error(
      `Alpha Vantage: ${payload.Note}`,
    );
  }

  if (payload.Information) {
    throw new Error(
      `Alpha Vantage: ${payload.Information}`,
    );
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(
      "Alpha Vantage returned no gold price history.",
    );
  }

  const prices = payload.data
    .map((row): GoldPricePoint | null => {
      if (
        !row.date ||
        row.price === undefined
      ) {
        return null;
      }

      const close =
        Number(row.price);

      if (
        !Number.isFinite(close) ||
        close <= 0
      ) {
        return null;
      }

      return {
        date: row.date,
        close,
      };
    })
    .filter(
      (row): row is GoldPricePoint =>
        row !== null,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date),
    );

  if (prices.length === 0) {
    throw new Error(
      "No valid gold prices returned by Alpha Vantage.",
    );
  }

  return prices;
}

export async function fetchGoldCloses(): Promise<
  number[]
> {
  const history =
    await fetchGoldPriceHistory();

  return history.map(
    (point) => point.close,
  );
}