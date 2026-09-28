export const EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1 =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data" as const;

const DEFAULT_TIMEOUT_MS = 10_000;
const JSON_ACCEPT = "application/json";

export interface EurostatClientDependenciesV1 {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface EurostatDatasetLoadResultV1 {
  readonly sourceUrl: string;
  readonly payload: unknown;
}

export type EurostatDatasetLoaderV1 = (
  sourceUrl: string,
) => Promise<EurostatDatasetLoadResultV1>;

/** Strict bounded transport for the official Eurostat Statistics API. */
export class EurostatClientV1 {
  readonly #fetchImpl: typeof fetch;
  readonly #timeoutMs: number;

  constructor(dependencies: EurostatClientDependenciesV1 = {}) {
    this.#fetchImpl = dependencies.fetchImpl ?? fetch;
    this.#timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0) {
      throw new TypeError(
        "Eurostat request timeout must be a positive integer.",
      );
    }
  }

  async getDataset(sourceUrl: string): Promise<EurostatDatasetLoadResultV1> {
    assertOfficialEurostatSourceUrl(sourceUrl);

    if (typeof window !== "undefined") {
      throw new Error(
        "[Chronoverse Eurostat] Provider access is server-only.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(sourceUrl, {
        method: "GET",
        headers: { Accept: JSON_ACCEPT },
        redirect: "error",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `[Chronoverse Eurostat] Request failed with HTTP ${response.status}.`,
        );
      }

      if (response.redirected) {
        throw new Error(
          "[Chronoverse Eurostat] Redirected responses are not accepted.",
        );
      }

      const mediaType = response.headers.get("content-type")
        ?.split(";", 1)[0]?.trim().toLowerCase();

      if (
        mediaType === undefined ||
        (mediaType !== "application/json" && !mediaType.endsWith("+json"))
      ) {
        throw new TypeError(
          "[Chronoverse Eurostat] Response content type is invalid.",
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new TypeError(
          "[Chronoverse Eurostat] Response JSON is invalid.",
        );
      }

      return Object.freeze({ sourceUrl, payload });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function assertOfficialEurostatSourceUrl(sourceUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new TypeError("Eurostat source URL is invalid.");
  }

  const datasetPathPrefix = new URL(
    `${EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1}/`,
  ).pathname;
  const datasetCode = parsed.pathname.startsWith(datasetPathPrefix)
    ? parsed.pathname.slice(datasetPathPrefix.length)
    : "";

  if (
    parsed.protocol !== "https:" ||
    parsed.host !== "ec.europa.eu" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hash.length > 0 ||
    !/^[a-z0-9_]+$/.test(datasetCode)
  ) {
    throw new TypeError("Eurostat source URL is invalid.");
  }
}

export const eurostatClientV1 = new EurostatClientV1();
