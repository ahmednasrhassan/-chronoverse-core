# SNB Policy Rate Decision Evidence Foundation V1

Inactive, injected source evidence for EUR/CHF. No production acquisition/storage instance, environment reads, credentials, registration, scheduler, polling, discovery, route, room delivery or bilateral policy composition. BoJ, BoE, Fed, ECB and the shared vintage engine are unchanged.

## Primary source inspection and exact paths

Verified directly against the official website on 4 October 2026, before defining the parser. The [official decision index](https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions) supplies the dated press-release paths. Only HTTPS `www.snb.ch`, exact English dated publication paths, no credentials/ports/query/fragment/trailing slash, and no redirects are allowed:

- Before 14 December 2023: `/en/publications/communication/press-releases/YYYY/pre_YYYYMMDD`, with matching civil date/year.
- From 14 December 2023: `/en/publications/communication/press-releases-restricted/pre_YYYYMMDD`.
- The verified exception for 19 June 2025 is exactly `press-releases-restricted/pre_20250619_2`. The unsuffixed path returned 404; arbitrary suffixes are not supported.

This bounded dated path builder is not a publication calendar. A syntactically eligible date does not establish that a supported decision exists. Index discovery is not part of the implementation.

Live pages inspected:

- [24 September 2026](https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260924): current full HTML, unchanged 0%, SVG chart and encoded inflation-table iframe.
- [19 March 2026](https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260319): full HTML, unchanged 0%, related sight-deposit discount and forecast percentages.
- [19 June 2025](https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20250619_2): full HTML, cut by 0.25 percentage points to 0%, explicitly effective 20 June 2025. Its PDF link uses `publications1_en`.
- [20 March 2025](https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20250320), [21 March 2024](https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20240321), [22 June 2023](https://www.snb.ch/en/publications/communication/press-releases/2023/pre_20230622), [19 September 2019](https://www.snb.ch/en/publications/communication/press-releases/2019/pre_20190919), [13 June 2019](https://www.snb.ch/en/publications/communication/press-releases/2019/pre_20190613): inspected HTML is a titled, dated PDF-download landing page, without operative HTML decision text. These fail `unsupported-structure`; V1 does not acquire or extract PDFs.

The linked official [June 2023 PDF](https://www.snb.ch/public/asset/en/www-snb-ch/publications/communication/press-releases/2023/pre_20230622/publications0_en/pre_20230622.en.pdf) was inspected to verify the increase grammar. The linked official [June 2019 PDF](https://www.snb.ch/public/asset/en/www-snb-ch/publications/communication/press-releases/2019/pre_20190613/publications0_en/pre_20190613.en.pdf) verifies the instrument's introduction and replacement of the three-month CHF Libor target range. PDFs corroborate the contract only; they are not a production fallback or synthetic historical HTML evidence.

## Verified layout and supported wording

One exact canonical link and document title, one visible `main#a11y-main`, one matching h1, one `div.cms-stage__date`, one visible `div.cms-richtext` with its h3, and `div.a-text` containing the observed nested html/head/body with direct paragraphs. An exact same-document PDF download link and same-date introductory-remarks link explicitly naming the Governing Board bind document/body identity. Current links use `speeches-restricted/ref_YYYYMMDD_mslanmargpe`; the PDF asset uses `press-releases-restricted/pre_ID/publications0_en/pre_ID.en.pdf`, except the June 2025 suffix and `publications1_en`.

Supported paired grammar (X is the resulting signed scalar percentage; Y is a positive explicit percentage-point change):

- Headline `Swiss National Bank leaves SNB policy rate unchanged at X%`; lead `The Swiss National Bank is leaving the SNB policy rate unchanged at X%.`
- Headline `Swiss National Bank lowers SNB policy rate to X%`; lead `The Swiss National Bank is lowering the SNB policy rate by Y percentage points to X%.`
- Headline `Swiss National Bank tightens monetary policy further and raises SNB policy rate to X%`; lead `The SNB is tightening its monetary policy further and is raising the SNB policy rate by Y percentage points to X%.`

The first two pairs were verified in actual HTML. The third pair was verified in the official 2023 PDF and deliberately implemented against the independently verified current HTML layout. Its test is a synthetic combination, not a claim that the historical 2023 landing page contains that HTML or can be acquired in V1. Unknown wording/layout fails closed. This is not universal historical/future source support.

Comment and script/style/noscript/template/navigation/footer copies are excluded before locating source evidence. The markup ancestor stack leading into main is bounded and checked for explicit hidden state. XML validation covers the scoped main before extraction. SVG charts and iframe inflation-table payloads are then excluded from extraction and entity expansion; they cannot supply source facts. Body/title fragments use the existing bounded fast-xml-parser, existing dependencies only. Depth, entity expansion and 2 MiB document limits remain bounded. Recognized hidden attributes, inline display/visibility rules and hidden classes cannot supply evidence; this is not a CSS renderer.

Headline/lead action and resulting rate must agree. Exactly one operative candidate and its headline are allowed; duplicate, contradictory and unknown decision candidates fail. Contradictory scalar declarations or conditional forecast assumptions fail. Effective-date statements are separately scoped to the policy instrument. Rate syntax is a signed decimal, at most six decimal places, finite and within -100..100 percent; explicit change is positive and at most 100 percentage points. Negative modern policy rates remain negative. No range, midpoint, previous-rate calculation or representative boundary.

SARON, Libor ranges, repo/money-market rates, inflation, exchange rates, sight-deposit remuneration, thresholds and discounts cannot match the operative instrument grammar and never supply the result. Their unrelated percentages are ignored, not selected by order. Intervention language is not modeled or interpreted.

## Regime, fact and time semantics

Requests, facts and canonical specs before `2019-06-13` fail with a typed `unsupported-regime`; acquisition returns that explicit unavailable state before fetching or sampling a clock. Date eligibility alone never establishes source support. The transition date is eligible in principle but its inspected PDF-only landing page is unavailable to this HTML V1. No Libor-to-policy-rate equivalence or backfill.

The closed fact names Swiss National Bank, Governing Board, eurchf, SNB policy rate, document ID/title, assessment decisionDate, independently checked page publicationDate, action/resulting rate/explicit change, percent unit, exact sourceUrl and nullable release/effective timing. The inspected page publicationDate must match the dated assessment identity; these remain distinct fields. No vote, derived previous rate or intervention facts.

`releaseTimestamp` is always null in V1. No exact timezone-aware release instant was safely verified. References to 10 am concern introductory remarks and do not prove this press release's release instant. Website publication conventions, geography, month, fetch time and PDF metadata do not establish one. No release timestamp metadata or release-time subsystem.

`effectiveDate` is null absent explicit policy wording. The supported sentences name a date after `The new policy rate applies from tomorrow,` or `The SNB policy rate change applies from tomorrow,`. The named date is parsed directly and must be the next civil day; no date is derived merely from an announcement. Duplicate/mismatched/unsupported policy effective wording fails. Deposit timing does not substitute.

## Public evidence, identity and private CAS binding

Public `snb-policy-evidence-v1` is only `{schemaVersion, fact, metadata}`. The reader rejects extra generic observations/numeric fields, forged provenance, changed content identity or non-closed facts. All acquisition, append outcomes and as-known snapshots expose structured evidence only.

Content identity `snb-policy-evidence-v1:sha256:` binds locked publisher/source/instrument/product/document semantics and every normalized material fact. Capture time and unrelated prose are excluded; rate/action/change/effective-date revisions change identity. This is Chronoverse selected-content identity, not an official publisher version or cryptographic signature. Normalizing a caller-provided fact does not attest its publication.

The shared immutable statistical CAS engine is reused unchanged through a private SNB codec. Its single numeric observation is always `value: 1`, unit `source-evidence-record`, ID `switzerland-snb-policy-evidence-record:DATE`, source ID `SNB:policy-evidence-record:DATE` and annotation `snb-policy-evidence-record-v1` carrying the complete fact. One means one evidence record, never 1% or a rate change. Decode revalidates the fact, provenance, count, unit, IDs, content hash, knowledge time and exact re-encoding before returning a public structured snapshot. Forged/legacy percent carriers fail. The namespace is `chronoverse:markets:snb:evidence-vintages-v1:switzerland-snb-policy-decision:DATE`.

## Vintage and inactive acquisition

Injected storage only, no production instance. Append-only CAS preserves initial captures, material revisions, same-content deduplication, stale and same-second conflict outcomes. Corrupt snapshots, scores or metadata fail explicitly; races remain bounded. No expiry, overwrite or reconstructed history.

`knownAt = fetchedAt`, with both from the trusted completion clock after fetch, complete validation and normalization. As-known reads select only captures at or before asOf. A separate coverage probe distinguishes `no-captured-evidence` from `not-known-as-of` without returning later evidence. This is captured coverage, not an assertion of complete publication history.

Acquisition requires a dated caller request, AbortSignal, injected loader/clock/append. Validation failures prevent clock/storage; clock failure prevents capture. Cancellation before append stops work; cancellation during a successful immutable append cannot undo the capture. Expected transport, validation, clock and persistence failures are typed. Arbitrary dependency TypeError/ReferenceError defects propagate unchanged.

Transport requires injected fetch and AbortSignal, server-only GET, exact status 200, HTML/UTF-8, fatal decoding, bounded declared/streamed bytes, exact final URL and no redirects, retries, timers or global fetch defaults. Unrecognized native failures propagate rather than being disguised. Tests forbid live fetch and use reduced synthetic verified layouts, with separate source-inspection replays against saved full official HTML.
