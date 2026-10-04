# Bank of Japan Policy Decision Evidence Foundation V1

Inactive, dependency-only evidence for EUR/JPY. No runtime registration, production storage instance, scheduler, route, room caller, credentials or fallback source.

## Official contract verified

Only the exact English HTML publication path is supported:
`https://www.boj.or.jp/en/mopo/mpmdeci/state_YYYY/kYYMMDDa.htm`.
The allowlist is `www.boj.or.jp`, HTTPS, no credentials, query, fragment or alternate path. Redirects are rejected, including same-host redirects. The dated HTML is canonical BoJ publisher evidence; its linked PDF confirms publication identity but is not acquired or parsed.

Official pages inspected for actual HTML structure:
- [March 19, 2024 framework transition](https://www.boj.or.jp/en/mopo/mpmdeci/state_2024/k240319a.htm): modern instrument wording and bounded target; guideline-linked footnote establishes a distinct effective date.
- [January 24, 2025 guideline change](https://www.boj.or.jp/en/mopo/mpmdeci/state_2025/k250124a.htm): scalar instrument paragraph; loan/deposit rates are separate; linked guideline footnote establishes effective timing.
- [July 31, 2025 statement](https://www.boj.or.jp/en/mopo/mpmdeci/state_2025/k250731a.htm): direct introductory paragraph plus scalar guideline; no effective-date inference.

Verified structure: `main#contents`, one supported h1, CONTENT_1 publisher/date and same-date PDF link, CONTENT_2 decision body. XML validation and bounded existing fast-xml-parser operate only on this scoped HTML, with br/hr as unpaired tags. The first decision context binds the target paragraph; transition documents additionally require modern-framework wording and the explicit nested Guideline for market operations section. Unrecognized structures fail closed. Arbitrary first-percentage selection, PDF extraction and general scraping are excluded.

## Source model and regime

Institution Bank of Japan; product eurjpy; instrument `uncollateralized-overnight-call-rate-guideline`; percent unit. Target is a closed scalar/range union retaining the published `around` qualification. Scalars and ordered ranges are supported; no midpoint or analytical action is generated. Numeric targets are bounded to 0..100 percent; negative historical framework structures are unsupported. No vote parsing.

Before March 19, 2024, return `unsupported-historical-regime`. The transition date also requires the framework-transition title, the source's completed QQE/YCC/negative-rate framework wording and modern guideline context. Date alone never proves instrument semantics. This is a bounded English-document contract, not universal historical/future BoJ compatibility.

## Time semantics

Decision date comes from the publisher/date paragraph and must agree with the URL. Effective date comes only from an explicitly linked guideline footnote and must not precede the decision date. Loan/deposit footnotes do not substitute.

Inspected release blocks give a titled publication date/time but omit timezone. Absolute releaseTimestamp is therefore null: Tokyo location, meeting hours, fetch time and other BoJ statistics' timezone conventions do not establish this document's publication instant. The parser has a narrow explicit-JST / `(Japan Standard Time)` release-entry branch, tested with synthetic evidence, not claimed to have been present in the inspected decisions. Unzoned, approximate or unsupported labels remain null; conflicting exact dates/weekdays fail. The matching titled entry must belong to the release block, not another release. No release timestamp metadata is emitted when null.

knownAt equals the trusted successful acquisition completion fetchedAt and Redis score. The source fact is completely parsed/normalized before clock sampling. Historical documents captured now are known now, never at decision/release/effective date.

## Canonical representation and identity

The BoJ-specific `boj-policy-evidence-v1` envelope exposes the full fact and provenance metadata. Scalar targets retain their exact value; range targets expose only lower/upper bounds under the range discriminant. No generic observations or representative numeric rate are exposed by builders, acquisition, append results or as-known reads. `readBojPolicyFactV1` rejects extra numeric fields, forged provenance and inconsistent identities.

The immutable generic CAS engine is reused unchanged through a private storage codec. Its numeric observation counts one source-evidence record (always 1), with unit `source-evidence-record` and distinct `japan-boj-policy-evidence-record` / `BOJ:policy-evidence-record` identities. It carries no policy-rate number; the versioned annotation stores the full fact. This transport is decoded into structured evidence before any public result. Percent-valued legacy policy carriers fail validation; the storage namespace is `evidence-vintages-v2`, with no migration or activation. No shared schema extension.

`boj-policy-evidence-v2:sha256:` binds the locked publisher/source specification plus every normalized source-fact field: institution, product, instrument, decision/document identity, target shape/bounds/qualification, unit, nullable effective/release timing and source URL. Capture time and unrelated document text are excluded. This is Chronoverse selected-content identity, not an official revision ID or publisher signature.

## Persistence and acquisition

`createBojPolicyVintageAdapterV1` requires injected storage dependencies and reuses the existing immutable CAS engine unchanged. It strictly revalidates candidates and stored source facts/content identities. No expiry, overwrite, history reconstruction or production instance.

`readAsKnownAt` selects only knownAt <= asOf. An empty read probes captured coverage to distinguish `no-captured-evidence` from `not-known-as-of`; no later snapshot is exposed. This classification is captured coverage, not exhaustive BoJ publication history. Storage faults/corruption remain explicit; dependency TypeError/ReferenceError defects propagate unchanged.

`acquireBojPolicyV1` requires injected loader, clock, append and caller cancellation. Transport is separately injectable; no default fetch, timer or retry. Validation failure prevents clock and persistence; clock failure prevents persistence. Successful appends survive cancellation during storage. Same-content dedupe, stale and conflict outcomes are explicit.

Tests are offline synthetic HTML shaped like inspected source structures, including negative and adversarial cases. No entitlement or deployment claim; no bilateral state, market analytics or room wiring.
