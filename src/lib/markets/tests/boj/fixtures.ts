import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { parseBojPolicyDocumentV1, BOJ_POLICY_DOCUMENT_TITLES_V1, type BojPolicyDocumentKindV1 } from "../../providers/boj/facts";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { createBojPolicyVintageAdapterV1 } from "../../persistence/bojPolicyVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";

export const date = "2025-01-24";
export const captureTime = Date.parse("2026-10-04T12:00:00Z") / 1000;
export const guideline = (target = "0.5") => `The Bank will encourage the uncollateralized overnight call rate to remain at around ${target} percent.`;
const english = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));

// Synthetic reduced HTML shaped like the inspected official pages; no live test dependencies.
export function document(options: { date?: string; kind?: BojPolicyDocumentKindV1; target?: string; effective?: string | null; release?: string | null; listed?: boolean } = {}) {
  const actualDate = options.date ?? date;
  const kind = options.kind ?? "guideline-change";
  const title = BOJ_POLICY_DOCUMENT_TITLES_V1[kind];
  const target = options.target ?? (kind === "framework-transition" ? "0 to 0.1" : "0.5");
  const effective = options.effective === undefined ? (kind === "framework-transition" ? "March 21, 2024" : "January 27, 2025") : options.effective;
  const targetParagraph = `<p>${guideline(target)}${effective === null ? "" : '<sup><a href="#fn01" id="p01" class="red">1</a></sup>'}</p>`;
  const intro = "At the Monetary Policy Meeting (MPM) held today, the Policy Board of the Bank of Japan decided, by an 8-1 majority vote, to set the following guideline for money market operations for the intermeeting period:";
  const transition = `<ol><li>At the Monetary Policy Meeting held today, the Policy Board of the Bank of Japan assessed the virtuous cycle. The Bank considers that the policy framework of Quantitative and Qualitative Monetary Easing (QQE) with Yield Curve Control and the negative interest rate policy to date have fulfilled their roles. It will conduct monetary policy, guiding the short-term interest rate as a primary policy tool.
    <p>On this basis, the Bank made the following decisions.</p><ol class="number-en"><li>(1) Guideline for market operations (a 7-2 majority vote)<sup>Note 1</sup><div class="indent0"><p>The Bank decided to set the following guideline for market operations for the intermeeting period.</p>${targetParagraph}</div></li>
    <li>(2) Purchase of JGBs, yields 9 percent</li></ol></li></ol>`;
  const ordinary = kind === "statement" && options.listed !== true
    ? `<p>${intro.replace("(MPM) ", "").replace("an 8-1 majority vote", "a unanimous vote")}</p><div class="ml2em">${targetParagraph}</div>`
    : `<ol><li>${intro}<sup><a href="#note01">[Note]</a></sup><div class="ml1em">${targetParagraph}</div></li><li>Basic loan rate 0.75 percent; complementary deposit facility 0.5 percent; inflation 2.5-3.0 percent.</li></ol>`;
  const effectiveText = kind === "framework-transition"
    ? "The new guideline for market operations and the new interest rate on the current account balances"
    : "The new guideline for money market operations";
  const footnote = effective === null ? "" : `<hr><ol class="red-number"><li id="fn01">Interest on current accounts is 99 percent. ${effectiveText} will be effective from ${effective}.<a href="#p01" title="Return p01">Return to text</a></li></ol>`;
  const release = options.release === undefined ? `${title} -- Friday, January 24 at 12:23` : options.release;
  return { url: bojPolicyDocumentUrlV1(actualDate), html: `<html><body><nav>Fake guideline 99 percent</nav><main id="contents"><h1>${title}</h1><div class="outline mod_outer">
    <!-- [START] CONTENT_1 --><p>${english(actualDate)}<br>Bank of Japan</p><ul class="link-list01"><li><a href="/en/mopo/mpmdeci/mpr_${actualDate.slice(0, 4)}/k${actualDate.slice(2).replaceAll("-", "")}a.pdf">PDF Version [PDF 255KB]</a></li></ul><!-- [END] CONTENT_1 -->
    <!-- [START] CONTENT_2 -->${kind === "framework-transition" ? transition : ordinary}${footnote}
    <hr><p>Inflation 2 percent, observed call rate 0.48 percent, old guideline 9 percent.</p>
    ${release === null ? "" : `<dl class="mt2em ml1em"><dt>Release dates and times:</dt><dd>${release}</dd><dd>Summary of Opinions -- Monday, February 3 at 8:50 JST</dd></dl>`}
    <!-- [END] CONTENT_2 --></div></main><footer>Last Updated: 2026-10-04T12:00:00Z</footer></body></html>` };
}

export function canonical(time = captureTime, target = "0.5") {
  return buildBojPolicyEvidenceV1(parseBojPolicyDocumentV1(document({ target }), date), time);
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
  return { entries, dependencies, adapter: createBojPolicyVintageAdapterV1(dependencies), counts: () => ({ reads, writes }), race: () => { racing = true; } };
}
