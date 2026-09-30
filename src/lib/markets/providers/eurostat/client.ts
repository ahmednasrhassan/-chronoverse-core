export const EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1 =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data" as const;

const DEFAULT_TIMEOUT_MS = 10_000;
const JSON_ACCEPT = "application/json";
export const EUROSTAT_MAX_RESPONSE_BYTES_V1 = 5 * 1024 * 1024;

export class EurostatResponseTooLargeError extends Error {
  constructor() {
    super("[Chronoverse Eurostat] Response exceeds the 5 MiB limit.");
    this.name = "EurostatResponseTooLargeError";
  }
}

export type EurostatTransportErrorCodeV1 =
  | "invalid-url"
  | "network"
  | "timeout"
  | "http"
  | "redirect"
  | "content-type"
  | "content-length"
  | "missing-body"
  | "body-read"
  | "invalid-json";

/** Expected failures at the official Eurostat transport boundary. */
export class EurostatTransportError extends Error {
  readonly code: EurostatTransportErrorCodeV1;
  readonly originalError?: unknown;

  constructor(
    code: EurostatTransportErrorCodeV1,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "EurostatTransportError";
    this.code = code;
    this.originalError = originalError;
  }
}

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
  readonly #usesDefaultFetch: boolean;
  readonly #timeoutMs: number;

  constructor(dependencies: EurostatClientDependenciesV1 = {}) {
    this.#usesDefaultFetch = dependencies.fetchImpl === undefined;
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
    let response: Response | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let bodyConsumed = false;

    try {
      try {
        response = await this.#fetchImpl(sourceUrl, {
          method: "GET",
          headers: { Accept: JSON_ACCEPT },
          redirect: "error",
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof EurostatTransportError ||
            error instanceof EurostatResponseTooLargeError) {
          throw error;
        }
        if (controller.signal.aborted) {
          throw new EurostatTransportError(
            "timeout", "[Chronoverse Eurostat] Request timed out.", error,
          );
        }
        if (this.#usesDefaultFetch &&
            (error instanceof TypeError || error instanceof DOMException)) {
          throw new EurostatTransportError(
            "network", "[Chronoverse Eurostat] Network request failed.", error,
          );
        }
        throw error;
      }

      if (!response.ok) {
        throw new EurostatTransportError(
          "http",
          `[Chronoverse Eurostat] Request failed with HTTP ${response.status}.`,
        );
      }

      if (response.redirected) {
        throw new EurostatTransportError(
          "redirect",
          "[Chronoverse Eurostat] Redirected responses are not accepted.",
        );
      }

      const mediaType = response.headers.get("content-type")
        ?.split(";", 1)[0]?.trim().toLowerCase();

      if (
        mediaType === undefined ||
        (mediaType !== "application/json" && !mediaType.endsWith("+json"))
      ) {
        throw new EurostatTransportError(
          "content-type",
          "[Chronoverse Eurostat] Response content type is invalid.",
        );
      }

      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null) {
        if (!/^(?:0|[1-9]\d*)$/.test(declaredLength)) {
          throw new EurostatTransportError(
            "content-length",
            "[Chronoverse Eurostat] Response content length is invalid.",
          );
        }
        if (Number(declaredLength) > EUROSTAT_MAX_RESPONSE_BYTES_V1) {
          throw new EurostatResponseTooLargeError();
        }
      }

      if (response.body === null) {
        throw new EurostatTransportError(
          "missing-body", "[Chronoverse Eurostat] Response JSON is invalid.",
        );
      }
      reader = response.body.getReader();
      const bytes = new Uint8Array(EUROSTAT_MAX_RESPONSE_BYTES_V1);
      let totalBytes = 0;
      while (true) {
        let cell: ReadableStreamReadResult<Uint8Array>;
        try {
          cell = await reader.read();
        } catch (error) {
          if (controller.signal.aborted) {
            throw new EurostatTransportError(
              "timeout", "[Chronoverse Eurostat] Response read timed out.", error,
            );
          }
          if (error instanceof ReferenceError ||
              (error instanceof TypeError && !this.#usesDefaultFetch)) {
            throw error;
          }
          throw new EurostatTransportError(
            "body-read", "[Chronoverse Eurostat] Response read failed.", error,
          );
        }
        const { done, value } = cell;
        if (done) break;
        if (value.byteLength > EUROSTAT_MAX_RESPONSE_BYTES_V1 - totalBytes) {
          throw new EurostatResponseTooLargeError();
        }
        bytes.set(value, totalBytes);
        totalBytes += value.byteLength;
      }
      bodyConsumed = true;

      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, totalBytes),
        ));
      } catch (error) {
        if (!(error instanceof SyntaxError || error instanceof TypeError)) {
          throw error;
        }
        throw new EurostatTransportError(
          "invalid-json", "[Chronoverse Eurostat] Response JSON is invalid.",
          error,
        );
      }

      return Object.freeze({ sourceUrl, payload });
    } finally {
      clearTimeout(timeout);
      if (response !== null && !bodyConsumed) {
        controller.abort();
        try {
          if (reader !== null) {
            await reader.cancel();
          } else {
            await response.body?.cancel();
          }
        } catch {
          // Preserve the original transport or validation error.
        }
      }
      if (reader !== null) {
        try {
          reader.releaseLock();
        } catch {
          // Reader cleanup must not replace the original error.
        }
      }
    }
  }
}

function assertOfficialEurostatSourceUrl(sourceUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new EurostatTransportError("invalid-url", "Eurostat source URL is invalid.");
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
    throw new EurostatTransportError("invalid-url", "Eurostat source URL is invalid.");
  }
}

export const eurostatClientV1 = new EurostatClientV1();
