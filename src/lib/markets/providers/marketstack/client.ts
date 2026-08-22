import type {
  MarketstackApiError,
  MarketstackEodResponse,
} from "./types";

const MARKETSTACK_BASE_URL = "https://api.marketstack.com/v1";

export interface MarketstackClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class MarketstackClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: MarketstackClientOptions = {}) {
    this.apiKey =
      options.apiKey ??
      process.env.CHRONOVERSE_PREMIUM_MARKET_API_KEY ??
      process.env.MARKETSTACK_API_KEY ??
      "";

    this.baseUrl =
      options.baseUrl ??
      MARKETSTACK_BASE_URL;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async getEod(
    symbol: string,
    options: {
      limit?: number;
      offset?: number;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<MarketstackEodResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        "[Chronoverse Markets] Market data provider is not configured.",
      );
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      throw new Error(
        "[Chronoverse Markets] A market symbol is required.",
      );
    }

    const url = new URL(`${this.baseUrl}/eod`);

    url.searchParams.set("access_key", this.apiKey);
    url.searchParams.set("symbols", normalizedSymbol);

    if (options.limit !== undefined) {
      url.searchParams.set(
        "limit",
        String(Math.max(1, Math.min(options.limit, 1000))),
      );
    }

    if (options.offset !== undefined) {
      url.searchParams.set(
        "offset",
        String(Math.max(0, options.offset)),
      );
    }

    if (options.dateFrom) {
      url.searchParams.set("date_from", options.dateFrom);
    }

    if (options.dateTo) {
      url.searchParams.set("date_to", options.dateTo);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload: unknown = await response.json();

    if (!response.ok || isMarketstackApiError(payload)) {
      const message = isMarketstackApiError(payload)
        ? payload.error.message
        : `HTTP ${response.status}`;

      throw new Error(
        `[Chronoverse Markets] Market data request failed: ${message}`,
      );
    }

    return payload as MarketstackEodResponse;
  }
}

function isMarketstackApiError(
  value: unknown,
): value is MarketstackApiError {
  if (
    typeof value !== "object" ||
    value === null ||
    !("error" in value)
  ) {
    return false;
  }

  const error = (value as { error?: unknown }).error;

  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

export const marketstackClient = new MarketstackClient();