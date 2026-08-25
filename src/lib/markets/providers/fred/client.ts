import type {
  FredObservationsResponse,
  FredSeriesRequest,
} from "./types";

const FRED_BASE_URL =
  "https://api.stlouisfed.org/fred";

class FredClient {
  isConfigured(): boolean {
    return Boolean(
      process.env.FRED_API_KEY?.trim(),
    );
  }

  async getSeriesObservations(
    request: FredSeriesRequest,
  ): Promise<FredObservationsResponse> {
    const apiKey =
      process.env.FRED_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "[Chronoverse Macro] FRED_API_KEY is not configured.",
      );
    }

    const params =
      new URLSearchParams({
        series_id: request.seriesId,
        api_key: apiKey,
        file_type: "json",
        sort_order: "asc",
      });

    if (request.observationStart) {
      params.set(
        "observation_start",
        request.observationStart,
      );
    }

    if (request.observationEnd) {
      params.set(
        "observation_end",
        request.observationEnd,
      );
    }

    const url =
      `${FRED_BASE_URL}/series/observations?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `[Chronoverse Macro] FRED request failed (${response.status}): ${body}`,
      );
    }

    const data =
      (await response.json()) as FredObservationsResponse;

    if (!Array.isArray(data.observations)) {
      throw new Error(
        "[Chronoverse Macro] Invalid FRED observations response.",
      );
    }

    return data;
  }
}

export const fredClient =
  new FredClient();