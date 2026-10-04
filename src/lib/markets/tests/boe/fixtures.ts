import { boeBankRateDocumentUrlV1, BOE_MONTHS_V1, BOE_MAY_2025_RELEASE_NOTICE_URL_V1 } from "../../providers/boe/transport";
import { parseBoeBankRateDocumentV1, BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1 } from "../../providers/boe/facts";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import { createBoeBankRateVintageAdapterV1 } from "../../persistence/boeBankRateVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";

export const date = "2025-05-08";
export const captureTime = Date.parse("2026-10-04T12:00:00Z") / 1000;
const english = (date: string) => `${Number(date.slice(8))} ${BOE_MONTHS_V1[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
export const oldMandate = "The Bank of England&rsquo;s Monetary Policy Committee (MPC) sets monetary policy to meet the 2% inflation target, and in a way that helps to sustain growth and employment.";
export const newMandate = "The Monetary Policy Committee (MPC) sets monetary policy to meet the 2% inflation target, and in a way that helps to sustain growth and employment. The MPC adopts a medium-term and forward-looking approach to determine the monetary stance required to achieve the inflation target sustainably.";

/** Synthetic reduced HTML matching inspected layouts; never relies on a live source. */
export function document(options: { action?: "maintain" | "reduce" | "increase"; rate?: string; change?: string; date?: string; meeting?: string;
  layout?: "combined" | "split" | "direct"; minority?: string; extra?: string; proposition?: string } = {}) {
  const action = options.action ?? "reduce";
  const publication = options.date ?? ({ maintain: "2026-09-17", reduce: date, increase: "2023-08-03" })[action];
  const meeting = options.meeting ?? ({ maintain: "2026-09-16", reduce: "2025-05-07", increase: "2023-08-02" })[action];
  const rate = options.rate ?? ({ maintain: "3.75", reduce: "4.25", increase: "5.25" })[action];
  const change = options.change ?? "0.25";
  const layout = options.layout ?? ({ maintain: "direct", reduce: "split", increase: "combined" })[action];
  const monthYear = `${BOE_MONTHS_V1[Number(publication.slice(5, 7)) - 1]} ${publication.slice(0, 4)}`;
  const verb = ({ maintain: "maintained at", reduce: "reduced to", increase: "increased to" })[action];
  const title = `Bank ${layout === "direct" ? "rate" : "Rate"} ${verb} ${rate}% - ${monthYear}${layout === "direct" ? " Monetary Policy Summary and Minutes" : ""}`;
  const majority = action === "reduce" ? "5&ndash;4" : "6&ndash;3";
  const minority = options.minority ?? ({ maintain: "Three members voted to increase Bank Rate by 0.25 percentage points, to 4%.",
    reduce: "Two members preferred to reduce Bank Rate by 0.5 percentage points, to 4%. Two members preferred to maintain Bank Rate at 4.5%.",
    increase: "Two members preferred to increase Bank Rate by 0.5 percentage points, to 5.5%, and one member preferred to maintain Bank Rate at 5%." })[action];
  const result = action === "maintain" ? `maintain Bank Rate at ${rate}` : `${action} Bank Rate by ${change} percentage points, to ${rate}`;
  const decision = `At its meeting ending on ${english(meeting)}, the ${layout === "direct" ? "Monetary Policy Committee (MPC)" : "MPC"} voted by a majority of ${majority} to ${result}%. ${minority}`;
  const summary = layout === "combined" ? `<p>${oldMandate} ${decision}</p>` : layout === "split" ? `<p>${newMandate}</p><p>${decision}</p>` : `<p>${decision}</p>`;
  const proposition = options.proposition ?? (action === "maintain" ? `Bank Rate should be maintained at ${rate}%; and` : `Bank Rate should be ${action === "reduce" ? "reduced" : "increased"} by ${change} percentage points, to ${rate}%.`);
  const url = boeBankRateDocumentUrlV1(publication);
  return { url, html: `<html><head><title>${title} | Bank of England – the UK's central bank</title><link rel="canonical" href="${url}" /></head><body>
    <nav>SONIA 9%; Bank Rate 99%; inflation 2%.</nav><main class="main" id="main-content" role="main">
    <h1 itemprop="name">${title}</h1><a href="/-/media/boe/files/monetary-policy-summary-and-minutes/${publication.slice(0, 4)}/monetary-policy-summary-and-minutes-${monthYear.toLowerCase().replace(" ", "-")}.pdf">Monetary Policy Summary and minutes PDF</a>
    <div class="published-date">Published on ${english(publication)}</div><div class="content-block"><div class="page-content" id="content"><div id="output">
    <section class="page-section"><h2>Monetary Policy Summary, ${monthYear}</h2>${summary}<p>Inflation 2%; SONIA 4.1%; old Bank Rate 9%; market-implied rate 3.5%; gilt yields 4.7%.</p>${options.extra ?? ""}</section>
    <section class="page-section"><h2>Minutes of the Monetary Policy Committee meeting ending on ${english(meeting)}</h2>
    <p>1: CPI inflation 2% and market rates 3%.</p><h3>The immediate policy decision${action === "maintain" ? "s" : ""}</h3>
    <p>25: The Chair invited the Committee to vote on the proposition${action === "maintain" ? "s" : ""} that:</p><ul><li>${proposition}</li>${action === "maintain" ? "<li>The Bank of England should reduce the stock of bonds to zero.</li>" : ""}</ul>
    <p>26: Members voted in favour of the proposition. Other members preferred a Bank Rate of 99%.</p>
    <h3>Operational considerations</h3><p>Mortgage rate 8%; earlier Bank Rate 7%; other facility effective from 9 May 2025.</p></section>
    </div></div></div></main><footer>Normally published at noon; updated 2026-10-04T12:00:00Z.</footer></body></html>` };
}

export function releaseNotice(options: { time?: string; zone?: string; date?: string } = {}) {
  return { url: BOE_MAY_2025_RELEASE_NOTICE_URL_V1, html: `<html><head><title>${BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1} | Bank of England – the UK's central bank</title><link rel="canonical" href="${BOE_MAY_2025_RELEASE_NOTICE_URL_V1}" /></head><body>
    <main id="main-content" role="main"><h1>${BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1}</h1><div class="published-date">Published on ${english(options.date ?? "2025-05-06")}</div>
    <div class="content-block"><div class="page-content" data-id="notice">In light of the national two minutes of silence to commemorate the 80th anniversary of VE day, the Monetary Policy Report and minutes of the Monetary Policy Committee meeting will be published at ${options.time ?? "12.02pm"} (${options.zone ?? "BST"}) on Thursday 8 May 2025, instead of the regular time of 12pm (BST).</div></div></main></body></html>` };
}

export function canonical(time = captureTime, rate = "4.25", release = false) {
  return buildBoeBankRateEvidenceV1(parseBoeBankRateDocumentV1(document({ rate }), date, release ? releaseNotice() : undefined), time);
}

type Entry = { score: number; member: string };
export function storage() {
  const entries = new Map<string, Entry[]>();
  let reads = 0, writes = 0, racing = false;
  const window = (items: Entry[]) => [...items].sort((a, b) => b.score - a.score).slice(0, 2).flatMap((item) => [item.member, String(item.score)]);
  const dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: async (key) => { reads++; return window(entries.get(key) ?? []); },
    readAsKnownAt: async (key, asOf) => window((entries.get(key) ?? []).filter((entry) => entry.score <= asOf)),
    compareAndAppend: async (key, expected, score, member) => {
      writes++;
      if (racing) return "race";
      const items = entries.get(key) ?? [];
      const head = [...items].sort((a, b) => b.score - a.score)[0];
      if (expected === null ? head !== undefined : head === undefined || head.score !== expected.score || head.member !== expected.member) return "race";
      if (items.some((item) => item.score === score)) return "score-conflict";
      entries.set(key, [...items, { score, member }]);
      return "written";
    },
  };
  return { entries, dependencies, adapter: createBoeBankRateVintageAdapterV1(dependencies), counts: () => ({ reads, writes }), race: () => { racing = true; } };
}
