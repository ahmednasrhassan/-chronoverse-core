import { fomcDocumentUrlV1, EFFR_API_URL_V1, effrRequestUrlV1, type EffrRequestV1 } from "../../providers/federalReserve/transport";
import { parseFomcStatementV1, attachFomcImplementationV1 } from "../../providers/federalReserve/fomc";
import { parseEffrFactsV1 } from "../../providers/newYorkFed/effr";
import { buildUsPolicyCanonicalSeriesV1, type UsPolicyFamilyV1 } from "../../providers/federalReserve/canonical";
import { createUsPolicyVintageAdapterV1 } from "../../persistence/usPolicyVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";

export const date = "2025-01-29";
export const captureTime = 1738270000;
export const family: UsPolicyFamilyV1 = `fomc:${date}`;
export const effrRequest: EffrRequestV1 = { startDate: "2025-01-29", endDate: "2025-01-30" };
export const maintain = "In support of its goals, the Committee decided to maintain the target range for the federal funds rate at 4-1/4 to 4-1/2 percent.";
const english = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
// Minimal synthetic HTML shaped like the inspected official publications, not live fixtures.
export function statement(sentence = maintain, actualDate = date, clock: string | null = "For release at 2:00 p.m. EST", note = true) {
  return { url: fomcDocumentUrlV1(actualDate), html: `<html><body><nav><ul><li>Inflation 99 percent</li></nav>
    <div id="content" role="main"><div id="article"><div class="heading col-xs-12 col-sm-8 col-md-8">
    <p class="article__time">${english(actualDate)}</p><h3 class="title">Federal Reserve issues FOMC statement</h3>
    ${clock === null ? "" : `<p class="releaseTime">${clock}<ul><li><a href="#">Share</a></li></ul>`}</div>
    <div class="col-xs-12 col-sm-8 col-md-8"><p>The Committee seeks inflation at the rate of 2 percent.</p><p>${sentence}</p>
    ${note ? `<p><a href="${fomcDocumentUrlV1(actualDate, true)}">Implementation Note issued ${english(actualDate)}</a></p>` : ""}</div>
    </div><div id="lastUpdate">Last Update: April 1, 2026</div></div></body></html>` };
}
export function implementation(range = "4-1/4 to 4-1/2", effective = "January 30, 2025") {
  return { url: fomcDocumentUrlV1(date, true), html: `<html><body><div id="content" role="main"><div class="heading">
    <p class="article__time">January 29, 2025</p><h3>Implementation Note issued January 29, 2025</h3></div>
    <p>The Federal Reserve has made the following decisions in its <a href="${fomcDocumentUrlV1(date)}">statement</a>.</p>
    <ul><li>IORB at 4.4 percent, effective January 30, 2025.</li>
    <li>As part of its policy decision, the Federal Open Market Committee voted to direct the Open Market Desk at the Federal Reserve Bank of New York, until instructed otherwise, to execute transactions in accordance with the following domestic policy directive:
    <blockquote><p>"Effective ${effective}, the Federal Open Market Committee directs the Desk to:</p><ul>
    <li>Undertake open market operations as necessary to maintain the federal funds rate in a target range of ${range} percent.</li>
    <li>Conduct repo operations at 4.5 percent.</li></ul></blockquote></li></ul></div></body></html>` };
}
export function effrRow(observationDate = "2025-01-29", percentRate = 4.33): Record<string, unknown> {
  return { effectiveDate: observationDate, type: "EFFR", percentRate, percentPercentile1: 4.31, percentPercentile25: 4.33,
    percentPercentile75: 4.34, percentPercentile99: 4.40, targetRateFrom: 4.25, targetRateTo: 4.50,
    volumeInBillions: 92, revisionIndicator: "" };
}
export function effrResponse() { return { sourceUrl: EFFR_API_URL_V1, requestUrl: effrRequestUrlV1(effrRequest), payload: { refRates: [effrRow()] } }; }
export function canonical(actualFamily: UsPolicyFamilyV1 = family, time = captureTime, value = 4.25) {
  if (actualFamily === "effr") {
    const response = effrResponse(); response.payload.refRates[0]!.percentRate = value;
    return buildUsPolicyCanonicalSeriesV1(actualFamily, parseEffrFactsV1(response, effrRequest), time);
  }
  const fact = attachFomcImplementationV1(parseFomcStatementV1(statement(), date), implementation());
  return buildUsPolicyCanonicalSeriesV1(actualFamily, [{ ...fact, targetLower: value, targetUpper: value + 0.25 }], time);
}
type Entry = { score: number; member: string };
export function storage() {
  const entries = new Map<string, Entry[]>(); let reads = 0, writes = 0, race = false;
  const window = (items: Entry[]) => [...items].sort((a, b) => b.score - a.score).slice(0, 2).flatMap((item) => [item.member, String(item.score)]);
  const dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: async (key) => { reads++; return window(entries.get(key) ?? []); },
    readAsKnownAt: async (key, asOf) => window((entries.get(key) ?? []).filter((entry) => entry.score <= asOf)),
    compareAndAppend: async (key, expected, score, member) => {
      writes++; if (race) return "race"; const items = entries.get(key) ?? []; const head = [...items].sort((a, b) => b.score - a.score)[0];
      if (expected === null ? head !== undefined : head === undefined || head.score !== expected.score || head.member !== expected.member) return "race";
      if (items.some((item) => item.score === score)) return "score-conflict";
      entries.set(key, [...items, { score, member }]); return "written";
    },
  };
  return { entries, dependencies, adapter: createUsPolicyVintageAdapterV1(dependencies), counts: () => ({ reads, writes }), race: () => { race = true; } };
}
