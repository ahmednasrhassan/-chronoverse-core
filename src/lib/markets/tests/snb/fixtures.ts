import { snbPolicyDocumentUrlV1, SNB_MONTHS_V1 } from "../../providers/snb/transport";
import { parseSnbPolicyDocumentV1 } from "../../providers/snb/facts";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import { createSnbPolicyVintageAdapterV1 } from "../../persistence/snbPolicyVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";

export const date = "2025-06-19";
export const captureTime = Date.parse("2026-10-04T12:00:00Z") / 1000;
export const english = (date: string) => `${Number(date.slice(8))} ${SNB_MONTHS_V1[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** Reduced synthetic verified HTML. Increase grammar is verified in the 2023 PDF,
 * combined here with the current HTML layout; NOT a claim of historical HTML availability. */
export function document(options: { action?: "unchanged" | "reduce" | "increase"; rate?: string; change?: string; date?: string;
  extra?: string; effective?: string | null; headline?: string; lead?: string; body?: string } = {}) {
  const action = options.action ?? "reduce";
  const decisionDate = options.date ?? (action === "reduce" ? date : "2026-09-24");
  const rate = options.rate ?? (action === "increase" ? "1.75" : "0");
  const change = options.change ?? "0.25";
  const title = 'Monetary policy assessment of ' + english(decisionDate);
  const headline = options.headline ?? 'Swiss National Bank ' + ({ unchanged: 'leaves SNB policy rate unchanged at ', reduce: 'lowers SNB policy rate to ', increase: 'tightens monetary policy further and raises SNB policy rate to ' })[action] + rate + '%';
  const lead = options.lead ?? (action === "unchanged" ? 'The Swiss National Bank is leaving the SNB policy rate unchanged at ' + rate + '%.' : action === "reduce" ? 'The Swiss National Bank is lowering the SNB policy rate by ' + change + ' percentage points to ' + rate + '%.' : 'The SNB is tightening its monetary policy further and is raising the SNB policy rate by ' + change + ' percentage points to ' + rate + '%.');
  const effective = options.effective === undefined ? (action === "reduce" && decisionDate === date ? '20 June 2025' : null) : options.effective;
  const url = snbPolicyDocumentUrlV1(decisionDate);
  const id = url.slice(url.lastIndexOf('/') + 1);
  const body = options.body ?? '<p>' + lead + (effective === null ? '' : ' The new policy rate applies from tomorrow, ' + effective + '.') + " Banks' sight deposits are remunerated at the SNB policy rate up to a threshold; the discount is 0.25 percentage points.</p>" +
    '<p>Inflation 0.2%, 0.5%, 0.7%; GDP growth 1% to 1.5%. The forecast is based on the assumption that the SNB policy rate is ' + rate + '% over the entire forecast horizon.</p>' +
    '<p>SARON 9%; sight-deposit remuneration 8%; thresholds 10%; discounts 7%; repo 6%; three-month CHF Libor target range -1.25% to -0.25%; EUR/CHF 0.99. The SNB remains willing to be active in the foreign exchange market.</p>' + (options.extra ?? '') +
    '<p>More detailed information: <a href="/en/publications/communication/speeches-restricted/ref_' + decisionDate.replaceAll('-','') + '_mslanmargpe">introductory remarks by the Governing Board</a> (available from 10 am on ' + english(decisionDate) + ').</p>';
  return { url, html: '<html><head><title>' + title + '</title><link rel="canonical" itemprop="url" href="' + url + '"></head><body><nav>SNB policy rate 99%</nav><main id="a11y-main"><h1 class="h-typo-t1">' + title + '</h1><div class="cms-stage__date"><span class="h-typo-tiny">' + english(decisionDate) + '</span></div>' +
    '<div class="cms-richtext h-bg-white" data-g-name="Richtext"><div class="container"><div class="m-subject"><h3 class="h-typo-t3">' + headline + '</h3></div><div class="a-text"><html><head></head><body>' + body + '</body></html></div></div></div>' +
    '<div class="cms-box"><h3>Download file now</h3><a href="/public/asset/en/www-snb-ch/publications/communication/press-releases-restricted/' + id + '/publications' + (decisionDate === date ? '1' : '0') + '_en/' + id + '.en.pdf">' + title + '</a></div></main><footer>Publication convention 09:30; fetched 2026-10-04.</footer></body></html>' };
}

export function canonical(time = captureTime, rate = "0") {
  return buildSnbPolicyEvidenceV1(parseSnbPolicyDocumentV1(document({ rate }), date), time);
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
  return { entries, dependencies, adapter: createSnbPolicyVintageAdapterV1(dependencies), counts: () => ({ reads, writes }), race: () => { racing = true; } };
}
