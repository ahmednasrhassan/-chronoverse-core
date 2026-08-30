import type {
  EiaApiResponse,
  EiaSeriesPoint,
  EiaSeriesRequest,
  EiaSeriesResult,
} from "./types";

const EIA_API_BASE_URL =
  "https://api.eia.gov/v2";

class EiaClient {
  isConfigured(): boolean {
    return Boolean(
      process.env.EIA_API_KEY,
    );
  }

  async getSeries(
    request: EiaSeriesRequest,
  ): Promise<EiaSeriesResult> {
    const apiKey =
      process.env.EIA_API_KEY;

    if (!apiKey) {
      throw new Error(
        "[Chronoverse EIA] EIA_API_KEY is not configured.",
      );
    }

    const route =
      normalizeRoute(
        request.route,
      );

    const url =
      new URL(
        `${EIA_API_BASE_URL}/${route}/data/`,
      );

    url.searchParams.set(
      "api_key",
      apiKey,
    );

    url.searchParams.set(
      "frequency",
      request.frequency,
    );

    url.searchParams.append(
      "data[]",
      request.valueField,
    );

    /*
     * Most recent observations first.
     */
    url.searchParams.set(
      "sort[0][column]",
      "period",
    );

    url.searchParams.set(
      "sort[0][direction]",
      "desc",
    );

    url.searchParams.set(
      "length",
      String(
        request.length ?? 2,
      ),
    );

    if (request.start) {
      url.searchParams.set(
        "start",
        request.start,
      );
    }

    if (request.end) {
      url.searchParams.set(
        "end",
        request.end,
      );
    }

    if (request.facets) {
      for (
        const [
          facet,
          values,
        ] of Object.entries(
          request.facets,
        )
      ) {
        for (
          const value of values
        ) {
          url.searchParams.append(
            `facets[${facet}][]`,
            value,
          );
        }
      }
    }

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          cache: "no-store",
        },
      );

    if (!response.ok) {
  throw new Error(
    `[Chronoverse EIA] Request failed with HTTP ${response.status}.`,
  );
}

    const payload =
      (await response.json()) as
        EiaApiResponse;

    const rows =
      payload.response?.data ??
      [];

    const points:
      EiaSeriesPoint[] =
      [];

    for (
      const row of rows
    ) {
      const rawValue =
        row[
          request.valueField
        ];

      const value =
        toFiniteNumber(
          rawValue,
        );

      if (
        value === null ||
        !row.period
      ) {
        continue;
      }

      points.push({
        period:
          row.period,

        value,
      });
    }

    return {
      seriesId:
        `${route}:${request.valueField}`,

      frequency:
        request.frequency,

      unit:
        request.unit ??
        null,

      points,

      provider:
        "eia",
    };
  }
}

function normalizeRoute(
  route: string,
): string {
  return route
    .trim()
    .replace(
      /^\/+/,
      "",
    )
    .replace(
      /\/+$/,
      "",
    )
    .replace(
      /^v2\//,
      "",
    )
    .replace(
      /\/data$/,
      "",
    );
}

function toFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number(
        value.trim(),
      );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  return null;
}

export const eiaClient =
  new EiaClient();