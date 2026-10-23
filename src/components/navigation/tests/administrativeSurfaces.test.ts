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

assert.match(sources.about, /Independent financial research/);
assert.match(sources.about, /Research archive/);
assert.match(sources.about, /Ahmed N\. Hassan — LinkedIn/);
assert.doesNotMatch(
  sources.about,
  /Africo|AfriKDP|strategic partner|strategic partnership|strategic collaboration/i,
);

assert.match(sources.account, /Sign in without a password/);
assert.match(sources.account, /current Chronoverse access state/);
assert.doesNotMatch(sources.account, /LEMON-70|access code|Early Access/i);

assert.doesNotMatch(sources.billing, /\$15\.99 monthly/);
assert.doesNotMatch(sources.billing, /\$150\.99 annually/);
assert.doesNotMatch(sources.billing, /href="\/pricing"/);
assert.doesNotMatch(sources.billing, /ManageSubscriptionButton|portalAvailable/);
assert.match(sources.billing, /Contact page/);
assert.doesNotMatch(sources.billing, /LEMON-70|access code/i);

for (const reason of [
  "account",
  "billing",
  "source question",
  "correction",
  "historical purchase",
]) {
  assert.match(sources.contact, new RegExp(reason, "i"));
}
assert.doesNotMatch(sources.contact, /href="\/sponsors"/);
assert.doesNotMatch(sources.contact, /within \d+|response within|guaranteed response/i);

for (const source of [sources.methodology, sources.dataSources, sources.freshness]) {
  assert.doesNotMatch(source, /Free Lite|VIP|five.market|RANGE_ROWS/);
  assert.match(source, /research|Research/);
}

for (const disclaimerBoundary of [
  /informational and analytical purposes only/,
  /not trade orders/,
  /do not guarantee\s+future performance/,
  /delayed, incomplete, revised, inaccurate, or\s+unavailable/,
]) {
  assert.match(sources.disclaimer, disclaimerBoundary);
}

assert.match(sources.terms, /Passwordless sign-in verifies identity/);
assert.match(sources.terms, /Historical purchases and support/);
assert.match(sources.terms, /one-time books/);
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

assert.match(sources.faq, /Independent financial research/);
assert.match(sources.faq, /Historical purchase obligations/);
assert.doesNotMatch(sources.faq, /LEMON-70|access code/i);

assert.match(sources.manifesto, /Focused coverage/);
assert.match(sources.manifesto, /One canonical truth/);
assert.match(sources.manifesto, /Evidence before claims/);
assert.doesNotMatch(
  sources.manifesto,
  /Document Clearance|Intelligence Network|Established 2026/i,
);


const allCurrentSources = Object.values(sources).join("\n");
assert.doesNotMatch(
  allCurrentSources,
  /Africo|AfriKDP|strategic partner|strategic partnership|strategic collaboration|LEMON-70|access code/i,
);

console.log("PASS: administrative, trust, legal, and contextual surfaces");
