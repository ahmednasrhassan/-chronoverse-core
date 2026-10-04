import { assertBoeBankRateServerV1, boeBankRateDocumentUrlV1, BoeBankRateTransportError, BOE_MAY_2025_RELEASE_NOTICE_URL_V1,
  type BoeBankRateDocumentLoaderV1 } from "../providers/boe/transport";
import { parseBoeBankRateDocumentV1, BoeBankRateValidationError } from "../providers/boe/facts";
import { buildBoeBankRateEvidenceV1 } from "../providers/boe/canonical";
import { BoeBankRateVintagePersistenceError, type BoeBankRateVintageAdapterV1 } from "../persistence/boeBankRateVintageRedis";
import type { BoeBankRateAppendResultV1 } from "../persistence/boeBankRateVintageRedis";

export interface BoeBankRateAcquisitionDependenciesV1 {
  readonly loadDocument: BoeBankRateDocumentLoaderV1;
  /** Explicit optional May 2025 timing-notice loader; no discovery or default fetch. */
  readonly loadReleaseDocument?: BoeBankRateDocumentLoaderV1;
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: BoeBankRateVintageAdapterV1["append"];
}

export type BoeBankRateAcquisitionResultV1 =
  | { readonly status: "acquired" | "unchanged" | "stale" | "conflict"; readonly persistence: BoeBankRateAppendResultV1 }
  | { readonly status: "provider-failure"; readonly code: BoeBankRateTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: BoeBankRateValidationError["code"] | "invalid-request" | "invalid-current" }
  | { readonly status: "persistence-failure"; readonly code: BoeBankRateVintagePersistenceError["code"] }
  | { readonly status: "clock-failure" }
  | { readonly status: "cancelled" };

/** INACTIVE. Explicit dated acquisition through injected loader/clock/storage only. */
export async function acquireBoeBankRateV1(
  publicationDate: string, signal: AbortSignal, dependencies: BoeBankRateAcquisitionDependenciesV1,
): Promise<BoeBankRateAcquisitionResultV1> {
  assertBoeBankRateServerV1();
  try {
    if (signal.aborted) return { status: "cancelled" };
    if (dependencies.loadReleaseDocument !== undefined && publicationDate !== "2025-05-08") return { status: "validation-failure", code: "source" };
    const url = boeBankRateDocumentUrlV1(publicationDate);
    const document = await dependencies.loadDocument(url, signal);
    if (signal.aborted) return { status: "cancelled" };
    // Validate the primary decision before requesting any optional timing evidence.
    let fact = parseBoeBankRateDocumentV1(document, publicationDate);
    if (dependencies.loadReleaseDocument !== undefined) {
      const releaseDocument = await dependencies.loadReleaseDocument(BOE_MAY_2025_RELEASE_NOTICE_URL_V1, signal);
      if (signal.aborted) return { status: "cancelled" };
      fact = parseBoeBankRateDocumentV1(document, publicationDate, releaseDocument);
    }
    if (signal.aborted) return { status: "cancelled" };
    // Complete document/fact validation and source normalization precede the trusted clock.
    let fetchedAt: number;
    try { fetchedAt = await dependencies.nowUnixSeconds(); }
    catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError) throw error;
      return { status: "clock-failure" };
    }
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return { status: "clock-failure" };
    if (signal.aborted) return { status: "cancelled" };
    const evidence = buildBoeBankRateEvidenceV1(fact, fetchedAt);
    if (signal.aborted) return { status: "cancelled" };
    const persistence = await dependencies.appendVintage(publicationDate, evidence);
    // Cancellation during a successful immutable append cannot undo that capture.
    return { status: persistence.status === "initialized" || persistence.status === "advanced" ? "acquired" : persistence.status, persistence };
  } catch (error) {
    if (error instanceof BoeBankRateValidationError) return { status: "validation-failure", code: error.code };
    if (error instanceof BoeBankRateTransportError) {
      if (error.code === "aborted") return { status: "cancelled" };
      return error.code === "invalid-request" ? { status: "validation-failure", code: error.code }
        : { status: "provider-failure", code: error.code };
    }
    if (error instanceof BoeBankRateVintagePersistenceError) {
      return error.code === "invalid-current" ? { status: "validation-failure", code: error.code }
        : { status: "persistence-failure", code: error.code };
    }
    throw error;
  }
}
