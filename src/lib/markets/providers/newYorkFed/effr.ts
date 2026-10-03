import { EFFR_API_URL_V1, assertUsPolicyServerV1, effrRequestUrlV1, isCivilDateV1, loadUsPolicyTextV1,
  type EffrRequestV1, type UsPolicyTransportDependenciesV1,
} from "../federalReserve/transport";
import { UsPolicyValidationError } from "../federalReserve/fomc";
export interface EffrFactV1 {
  readonly observationDate: string;
  readonly rate: number;
  readonly unit: "percent";
  readonly volumeInBillions: number | null;
  readonly volumeUnit: "billions of U.S. dollars";
  readonly targetLower: number | null;
  readonly targetUpper: number | null;
  readonly footnoteId: number | null;
  readonly revisionIndicator: string | null;
}
export interface EffrResponseV1 { readonly sourceUrl: typeof EFFR_API_URL_V1; readonly requestUrl: string; readonly payload: unknown }
export type EffrLoaderV1 = (request: EffrRequestV1, signal: AbortSignal) => Promise<EffrResponseV1>;
export async function loadEffrResponseV1(request: EffrRequestV1, dependencies: UsPolicyTransportDependenciesV1): Promise<EffrResponseV1> {
  const requestUrl = effrRequestUrlV1(request); const text = await loadUsPolicyTextV1(requestUrl, "application/json", dependencies);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new UsPolicyValidationError("schema"); }
  return Object.freeze({ sourceUrl: EFFR_API_URL_V1, requestUrl, payload });
}
const fields = new Set(["effectiveDate", "type", "percentRate", "percentPercentile1", "percentPercentile25", "percentPercentile75", "percentPercentile99",
  "targetRateFrom", "targetRateTo", "volumeInBillions", "footnoteId", "revisionIndicator"]);
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new UsPolicyValidationError("value"); return value;
}
export function parseEffrFactsV1(response: EffrResponseV1, request: EffrRequestV1): readonly EffrFactV1[] {
  assertUsPolicyServerV1();
  if (response.sourceUrl !== EFFR_API_URL_V1 || response.requestUrl !== effrRequestUrlV1(request)) throw new UsPolicyValidationError("source");
  if (!record(response.payload) || Object.keys(response.payload).some((key) => key !== "refRates") || !Array.isArray(response.payload.refRates)) {
    throw new UsPolicyValidationError("schema");
  }
  const facts: EffrFactV1[] = [];
  for (const row of response.payload.refRates) {
    if (!record(row) || row.type !== "EFFR" || Object.keys(row).some((key) => !fields.has(key))) throw new UsPolicyValidationError("schema");
    if (!isCivilDateV1(row.effectiveDate) || row.effectiveDate < request.startDate || row.effectiveDate > request.endDate) throw new UsPolicyValidationError("date");
    const rate = number(row.percentRate);
    const volumeInBillions = row.volumeInBillions === undefined ? null : number(row.volumeInBillions);
    if (volumeInBillions !== null && volumeInBillions < 0) throw new UsPolicyValidationError("value");
    if ((row.targetRateFrom === undefined) !== (row.targetRateTo === undefined)) throw new UsPolicyValidationError("range");
    const targetLower = row.targetRateFrom === undefined ? null : number(row.targetRateFrom);
    const targetUpper = row.targetRateTo === undefined ? null : number(row.targetRateTo);
    if (targetLower !== null && targetUpper !== null && targetLower > targetUpper) throw new UsPolicyValidationError("range");
    const footnoteId = row.footnoteId === undefined ? null : number(row.footnoteId);
    if (footnoteId !== null && (!Number.isSafeInteger(footnoteId) || footnoteId < 0)) throw new UsPolicyValidationError("annotation");
    let revisionIndicator: string | null = null;
    if (row.revisionIndicator !== undefined) {
      const marker = row.revisionIndicator;
      if (typeof marker !== "string" || marker.length > 256) throw new UsPolicyValidationError("annotation");
      revisionIndicator = marker;
    }
    facts.push(Object.freeze({ observationDate: row.effectiveDate, rate, unit: "percent", volumeInBillions,
      volumeUnit: "billions of U.S. dollars", targetLower, targetUpper, footnoteId, revisionIndicator }));
  }
  facts.sort((a, b) => a.observationDate.localeCompare(b.observationDate)); const unique: EffrFactV1[] = [];
  for (const fact of facts) {
    const previous = unique.at(-1);
    if (previous?.observationDate === fact.observationDate) {
      if (JSON.stringify(previous) !== JSON.stringify(fact)) throw new UsPolicyValidationError("duplicate-date"); continue;
    }
    unique.push(fact);
  }
  if (unique.length === 0) throw new UsPolicyValidationError("empty"); return Object.freeze(unique);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
