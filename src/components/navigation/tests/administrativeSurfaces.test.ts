import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const sources = {
  about: readSource("src/app/(site)/about/page.tsx"),
  account: readSource("src/app/(site)/account/page.tsx"),
  billing: readSource("src/app/(site)/billing/page.tsx"),
  contact: readSource("src/app/(site)/contact/page.tsx"),
  methodology: readSource("src/app/(site)/methodology/page.tsx"),
  dataSources: readSource("src/app/(site)/data-sources/page.tsx"),
  freshness: readSource("src/app/(site)/freshness/page.tsx"),
  disclaimer: readSource("src/app/(site)/disclaimer/page.tsx"),
  terms: readSource("src/app/(site)/terms-of-service/page.tsx"),
  privacy: readSource("src/app/(site)/privacy-policy/page.tsx"),
  editorial: readSource("src/app/(site)/editorial-policy/page.tsx"),
  dmca: readSource("src/app/(site)/dmca/page.tsx"),
  faq: readSource("src/app/(site)/faq/page.tsx"),
  manifesto: readSource("src/app/(site)/manifesto/page.tsx"),
  sponsors: readSource("src/app/(site)/sponsors/page.tsx"),
};

assert.equal(
  existsSync(path.join(repositoryRoot, "src/app/sponsors/page.tsx")),
  false,
  "Sponsors must inherit the shared site layout from its route group",
);
assert.equal(
  existsSync(path.join(repositoryRoot, "src/app/(site)/_sponsors/page.tsx")),
  false,
  "the obsolete non-routable sponsor copy must not survive",
);

assert.match(sources.about, /protected VIP Market\s+Rooms/);
assert.match(sources.about, /Editorial Research/);
assert.match(sources.about, /Ahmed N\. Hassan — LinkedIn/);
assert.doesNotMatch(
  sources.about,
  /Africo|AfriKDP|strategic partner|strategic partnership|strategic collaboration/i,
);

assert.match(sources.account, /Sign in without a password/);
assert.match(sources.account, /current Chronoverse access state/);
assert.doesNotMatch(sources.account, /LEMON-70|access code|Early Access/i);

assert.match(sources.billing, /\$15\.99 monthly/);
assert.match(sources.billing, /\$150\.99 annually/);
assert.match(sources.billing, /<Link href="\/pricing">Pricing page<\/Link>/);
assert.match(sources.billing, /billing-portal[\s\S]{0,50}controls/i);
assert.match(sources.billing, /Contact page/);
assert.doesNotMatch(sources.billing, /LEMON-70|access code/i);

for (const reason of [
  "account",
  "billing",
  "source question",
  "correction",
  "sponsorship",
]) {
  assert.match(sources.contact, new RegExp(reason, "i"));
}
assert.match(sources.contact, /href="\/sponsors"/);
assert.doesNotMatch(sources.contact, /within \d+|response within|guaranteed response/i);

for (const methodBoundary of [
  "European Central Bank",
  "canonical normalization",
  "Free Lite",
  "VIP Deep",
  "Historical charts",
  "technical evidence",
  "degraded",
  "not predictive certainty",
]) {
  assert.match(
    sources.methodology,
    new RegExp(methodBoundary, "i"),
    "methodology must retain " + methodBoundary,
  );
}
assert.match(
  sources.methodology,
  /not predictive certainty,[\s\S]*guaranteed signals,[\s\S]*backtested-performance claims/,
);

assert.match(sources.dataSources, /daily\s+reference-rate observations/);
assert.match(sources.dataSources, /official €STR series/);
assert.match(sources.dataSources, /normalizes those observations/);
assert.doesNotMatch(sources.dataSources, /Yahoo|Marketstack/i);

for (const rangeRow of [
  /range: "1D", fx: "Unsupported", estr: "Unsupported"/,
  /range: "5D", fx: "Conditional", estr: "Conditional"/,
  /range: "1M", fx: "Supported", estr: "Supported"/,
  /range: "3M", fx: "Supported", estr: "Supported"/,
  /range: "6M", fx: "Supported", estr: "Supported"/,
  /range: "1Y", fx: "Supported", estr: "Supported"/,
  /range: "2Y", fx: "Supported", estr: "Supported"/,
  /range: "5Y", fx: "Unsupported", estr: "Supported"/,
  /range: "MAX",[\s\S]*fx: "Unsupported",[\s\S]*estr: "Official history since inception"/,
]) {
  assert.match(sources.freshness, rangeRow);
}
assert.match(sources.freshness, /not-assessed/);
assert.match(sources.freshness, /Weekends, holidays/);
assert.match(sources.freshness, /Requested coverage/);
assert.match(sources.freshness, /at least two official\s+observations/);

for (const disclaimerBoundary of [
  /informational and analytical purposes only/,
  /not trade orders/,
  /do not guarantee\s+future performance/,
  /delayed, incomplete, revised, inaccurate, or\s+unavailable/,
]) {
  assert.match(sources.disclaimer, disclaimerBoundary);
}

assert.match(sources.terms, /Free provides the Lite projection/);
assert.match(sources.terms, /Passwordless sign-in verifies identity/);
assert.match(sources.terms, /\$15\.99 monthly or \$150\.99 annually/);
assert.match(sources.terms, /Standalone research/);
assert.doesNotMatch(
  sources.terms,
  /LEMON-70|access code|governed by the laws|licensed financial advisors/i,
);

for (const privacyBoundary of [
  "Supabase",
  "passwordless",
  "Sanity",
  "Amazon SES",
  "Google Analytics",
  "analytics consent",
  "server-side",
]) {
  assert.match(
    sources.privacy,
    new RegExp(privacyBoundary),
    "privacy policy must describe " + privacyBoundary,
  );
}
assert.doesNotMatch(
  sources.privacy,
  /retained for \d+|stored in [A-Z][a-z]+ jurisdiction|cookie duration/i,
);

for (const editorialBoundary of [
  "Source attribution",
  "Assisted tools and responsibility",
  "Editorial and commercial separation",
  "Visual integrity",
  "Corrections",
  "Publication boundary",
]) {
  assert.match(sources.editorial, new RegExp(editorialBoundary, "i"));
}
assert.doesNotMatch(
  sources.editorial,
  /guaranteed unbiased|mandatory multi-stage/i,
);
assert.match(sources.editorial, /does not claim that every item receives a named\s+reviewer/);

assert.match(sources.dmca, /physical or electronic signature/);
assert.match(sources.dmca, /Counter-notice/);
assert.match(sources.dmca, /Copyright contact/);
assert.doesNotMatch(
  sources.dmca,
  /our designated agent|Designated Agent Contact|respond expeditiously/i,
);

assert.match(sources.faq, /exactly EUR\/USD, EUR\/JPY, EUR\/GBP, EUR\/CHF, and\s+€STR/);
assert.match(sources.faq, /standalone research are separate offerings/);
assert.doesNotMatch(sources.faq, /LEMON-70|access code/i);

assert.match(sources.manifesto, /Focused coverage/);
assert.match(sources.manifesto, /One canonical truth/);
assert.match(sources.manifesto, /Evidence before claims/);
assert.doesNotMatch(
  sources.manifesto,
  /Document Clearance|Intelligence Network|Established 2026/i,
);

assert.match(
  sources.sponsors,
  /Sponsorship does not influence Free Lite intelligence, VIP Deep\s+intelligence, analytical outputs, or editorial conclusions/,
);
assert.match(sources.sponsors, /does not guarantee reach, visibility/);
assert.doesNotMatch(
  sources.sponsors,
  /institutional-grade audience|maximum visibility|AfriKDP|XM Global/i,
);

const allCurrentSources = Object.values(sources).join("\n");
assert.doesNotMatch(
  allCurrentSources,
  /Africo|AfriKDP|strategic partner|strategic partnership|strategic collaboration|LEMON-70|access code/i,
);

console.log("PASS: administrative, trust, legal, and contextual surfaces");
