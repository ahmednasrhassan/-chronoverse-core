import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../../../events/ecbMonetaryPolicy";
import {
  captureKnownEcbDecisionDocumentHtmlV1,
  parseEcbMonetaryPolicyScheduleHtmlV1,
  validateKnownEcbDecisionReferenceV1,
  type EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  type EcbMonetaryPolicyDocumentCaptureV1,
  type EcbMonetaryPolicyScheduleCandidateV1,
} from "./parser";

const DEFAULT_TIMEOUT_MS = 10_000;
const HTML_ACCEPT = "text/html";

export type EcbMonetaryPolicySourceResultV1<T> =
  | {
      readonly status: "available";
      readonly sourceUrl: string;
      readonly fetchedAt: number;
      readonly data: T;
    }
  | {
      readonly status: "source-unavailable";
      readonly sourceUrl: string;
      readonly reason: "request-failed" | "http-error";
    }
  | {
      readonly status: "source-malformed";
      readonly sourceUrl: string;
      readonly reason: string;
    };

export type EcbKnownDecisionDocumentSourceResultV1 =
  | {
      readonly status: "available";
      readonly sourceUrl: string;
      readonly fetchedAt: number;
      readonly data: EcbMonetaryPolicyDocumentCaptureV1;
    }
  | { readonly status: "invalid-reference"; readonly reason: string }
  | {
      readonly status: "decision-document-unavailable";
      readonly sourceUrl: string;
      readonly reason: "request-failed" | "http-error";
    }
  | {
      readonly status: "decision-document-malformed";
      readonly sourceUrl: string;
      readonly reason: string;
    };

export interface EcbMonetaryPolicyClientDependenciesV1 {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly nowSeconds?: () => number;
}

/** Bounded transport; production calls are owned by the server-only cache module. */
export class EcbMonetaryPolicyClientV1 {
  readonly #fetchImpl: typeof fetch;
  readonly #timeoutMs: number;
  readonly #nowSeconds: () => number;

  constructor(dependencies: EcbMonetaryPolicyClientDependenciesV1 = {}) {
    this.#fetchImpl = dependencies.fetchImpl ?? fetch;
    this.#timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#nowSeconds = dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs <= 0) {
      throw new TypeError("ECB monetary-policy timeout must be a positive integer.");
    }
  }

  async getSchedule(): Promise<EcbMonetaryPolicySourceResultV1<
    readonly EcbMonetaryPolicyScheduleCandidateV1[]
  >> {
    const sourceUrl = ECB_GOVERNING_COUNCIL_CALENDAR_URL;
    const response = await this.#getHtml(sourceUrl);
    if (response.status !== "available") return response;
    const parsed = parseEcbMonetaryPolicyScheduleHtmlV1(response.html);
    return parsed.status === "available"
      ? Object.freeze({
          status: "available",
          sourceUrl,
          fetchedAt: response.fetchedAt,
          data: parsed.data,
        })
      : Object.freeze({ status: parsed.status, sourceUrl, reason: parsed.reason });
  }

  /** Captures only a caller-supplied reference; this client performs no decision discovery. */
  async getKnownDecisionDocument(
    input: EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  ): Promise<EcbKnownDecisionDocumentSourceResultV1> {
    const validation = validateKnownEcbDecisionReferenceV1(input);
    if (validation.status === "invalid-reference") return validation;
    const reference = validation.reference;
    const response = await this.#getHtml(reference.documentUrl);
    if (response.status === "source-unavailable") {
      return Object.freeze({
        status: "decision-document-unavailable",
        sourceUrl: reference.documentUrl,
        reason: response.reason,
      });
    }
    if (response.status === "source-malformed") {
      return Object.freeze({
        status: "decision-document-malformed",
        sourceUrl: reference.documentUrl,
        reason: response.reason,
      });
    }
    const parsed = captureKnownEcbDecisionDocumentHtmlV1(
      response.html,
      reference,
      response.fetchedAt,
    );
    return parsed.status === "available"
      ? Object.freeze({
          status: "available",
          sourceUrl: reference.documentUrl,
          fetchedAt: response.fetchedAt,
          data: parsed.data,
        })
      : Object.freeze({
          status: parsed.status,
          sourceUrl: reference.documentUrl,
          reason: parsed.reason,
        });
  }

  async #getHtml(url: string): Promise<
    | { readonly status: "available"; readonly html: string; readonly fetchedAt: number }
    | Extract<EcbMonetaryPolicySourceResultV1<never>, { readonly status: "source-unavailable" }>
    | Extract<EcbMonetaryPolicySourceResultV1<never>, { readonly status: "source-malformed" }>
  > {
    if (typeof window !== "undefined") {
      throw new Error("[Chronoverse ECB] Monetary-policy provider access is server-only.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.#fetchImpl(url, {
          method: "GET",
          headers: { Accept: HTML_ACCEPT },
          redirect: "error",
          signal: controller.signal,
        });
      } catch {
        return Object.freeze({ status: "source-unavailable", sourceUrl: url, reason: "request-failed" });
      }
      if (!response.ok) {
        return Object.freeze({ status: "source-unavailable", sourceUrl: url, reason: "http-error" });
      }
      if (response.redirected) {
        return Object.freeze({ status: "source-unavailable", sourceUrl: url, reason: "request-failed" });
      }
      const mediaType = response.headers.get("content-type")
        ?.split(";", 1)[0]?.trim().toLowerCase();
      if (mediaType !== "text/html") {
        return Object.freeze({
          status: "source-malformed",
          sourceUrl: url,
          reason: "ECB source returned an unsupported media type.",
        });
      }
      let html: string;
      try {
        html = await response.text();
      } catch {
        return Object.freeze({ status: "source-unavailable", sourceUrl: url, reason: "request-failed" });
      }
      const fetchedAt = this.#nowSeconds();
      if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) {
        throw new TypeError("ECB monetary-policy capture time is invalid.");
      }
      return Object.freeze({ status: "available", html, fetchedAt });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const ecbMonetaryPolicyClientV1 = new EcbMonetaryPolicyClientV1();
