import { assertUsPolicyServerV1, fomcDocumentUrlV1, effrRequestUrlV1, UsPolicyTransportError, type EffrRequestV1 } from "../providers/federalReserve/transport";
import { parseFomcStatementV1, attachFomcImplementationV1, UsPolicyValidationError, type FomcHtmlLoaderV1 } from "../providers/federalReserve/fomc";
import { parseEffrFactsV1, type EffrLoaderV1 } from "../providers/newYorkFed/effr";
import { buildUsPolicyCanonicalSeriesV1, normalizeUsPolicySourceFactsV1, type UsPolicyFamilyV1 } from "../providers/federalReserve/canonical";
import { UsPolicyVintagePersistenceError } from "../persistence/usPolicyVintageRedis";
import type { CanonicalStatisticalSeriesV1 } from "./canonicalObservationSeries";
import type { AppendCanonicalStatisticalSeriesVintageRedisResultV1 } from "../persistence/canonicalStatisticalSeriesVintageRedis";
interface CaptureDependencies {
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: (family: UsPolicyFamilyV1, series: CanonicalStatisticalSeriesV1) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
}
export type UsPolicyAcquisitionResultV1 =
  | { readonly status: "acquired" | "unchanged" | "stale" | "conflict"; readonly persistence: AppendCanonicalStatisticalSeriesVintageRedisResultV1 }
  | { readonly status: "provider-failure"; readonly code: UsPolicyTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: UsPolicyValidationError["code"] | "invalid-request" | "invalid-current" }
  | { readonly status: "persistence-failure"; readonly code: UsPolicyVintagePersistenceError["code"] }
  | { readonly status: "clock-failure" }
  | { readonly status: "cancelled" };

/** Explicitly invoked only. A linked note must complete and agree before capture or persistence. */
export async function acquireFomcPolicyV1(decisionDate: string, signal: AbortSignal,
  dependencies: CaptureDependencies & { readonly loadDocument: FomcHtmlLoaderV1 },
): Promise<UsPolicyAcquisitionResultV1> {
  assertUsPolicyServerV1();
  try {
    if (signal.aborted) return { status: "cancelled" };
    const url = fomcDocumentUrlV1(decisionDate);
    const statement = await dependencies.loadDocument(url, signal);
    if (signal.aborted) return { status: "cancelled" };
    let fact = parseFomcStatementV1(statement, decisionDate);
    if (signal.aborted) return { status: "cancelled" };
    if (fact.implementationNoteUrl !== null) {
      const note = await dependencies.loadDocument(fact.implementationNoteUrl, signal);
      if (signal.aborted) return { status: "cancelled" };
      fact = attachFomcImplementationV1(fact, note);
    }
    const family: UsPolicyFamilyV1 = `fomc:${decisionDate}`;
    // Normalize the complete source unit before sampling the trusted completion clock.
    normalizeUsPolicySourceFactsV1(family, [fact]);
    return await capture(family, [fact], signal, dependencies);
  } catch (error) { return failure(error); }
}
export async function acquireEffrV1(request: EffrRequestV1, signal: AbortSignal,
  dependencies: CaptureDependencies & { readonly loadResponse: EffrLoaderV1 },
): Promise<UsPolicyAcquisitionResultV1> {
  assertUsPolicyServerV1();
  try {
    if (signal.aborted) return { status: "cancelled" };
    effrRequestUrlV1(request);
    const response = await dependencies.loadResponse(request, signal);
    if (signal.aborted) return { status: "cancelled" };
    const facts = parseEffrFactsV1(response, request);
    normalizeUsPolicySourceFactsV1("effr", facts);
    return await capture("effr", facts, signal, dependencies);
  } catch (error) { return failure(error); }
}
async function capture(family: UsPolicyFamilyV1, facts: Parameters<typeof buildUsPolicyCanonicalSeriesV1>[1], signal: AbortSignal,
  dependencies: CaptureDependencies,
): Promise<UsPolicyAcquisitionResultV1> {
  if (signal.aborted) return { status: "cancelled" };
  let fetchedAt: number;
  try { fetchedAt = await dependencies.nowUnixSeconds(); } catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error; return { status: "clock-failure" };
  }
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return { status: "clock-failure" };
  if (signal.aborted) return { status: "cancelled" };
  const series = buildUsPolicyCanonicalSeriesV1(family, facts, fetchedAt);
  if (signal.aborted) return { status: "cancelled" };
  const persistence = await dependencies.appendVintage(family, series);
  // A completed append remains successful even if the caller cancelled during storage.
  return { status: persistence.status === "initialized" || persistence.status === "advanced" ? "acquired" : persistence.status, persistence };
}
function failure(error: unknown): UsPolicyAcquisitionResultV1 {
  if (error instanceof UsPolicyValidationError) return { status: "validation-failure", code: error.code };
  if (error instanceof UsPolicyTransportError) {
    if (error.code === "aborted") return { status: "cancelled" };
    if (error.code === "invalid-request") return { status: "validation-failure", code: error.code };
    return { status: "provider-failure", code: error.code };
  }
  if (error instanceof UsPolicyVintagePersistenceError) {
    if (error.code === "invalid-current") return { status: "validation-failure", code: error.code };
    return { status: "persistence-failure", code: error.code };
  }
  throw error;
}