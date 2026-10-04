# Bank of England Bank Rate Decision Evidence Foundation V1

Inactive, dependency-only primary-source evidence for EUR/GBP. No production instance, registration, route, room caller, scheduler, polling, discovery, credentials or fallback source.

## Verified official sources

Live official HTML pages were inspected and downloaded read-only during implementation on 4 October 2026:

- [August 2023 increase](https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2023/august-2023): combined mandate/decision paragraph; resulting Bank Rate 5.25%, published change 0.25 percentage points; meeting ended 2 August, publication 3 August.
- [May 2025 reduction](https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2025/may-2025): separate mandate and decision paragraphs; resulting rate 4.25%, change 0.25 percentage points; meeting ended 7 May, publication 8 May.
- [September 2026 maintenance](https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/september-2026): direct committee-decision paragraph; resulting rate 3.75%; meeting ended 16 September, publication 17 September. Its PDF label uses the publication day, so PDF text is not used to override the HTML meeting-end date.
- [May 2025 event-specific timing notice](https://www.bankofengland.co.uk/news/2025/may/statement-on-the-timing-of-the-mpr-and-mpc-minutes): announcement-specific publication contract for 8 May at 12:02 BST, replacing normal noon; notice published 6 May.

The parser was run successfully against all three downloaded full decision pages, both with and without the separate May notice where applicable. No acquisition, completion clock or storage was invoked during this read-only source verification. Unit tests use reduced synthetic HTML matching the inspected structures and injected dependencies; they never fetch these pages.

## Exact transport contract

Only HTTPS on `www.bankofengland.co.uk` is accepted. Decision URLs have exactly:

`/monetary-policy-summary-and-minutes/YYYY/<lowercase-English-month>-YYYY`

Both year components must agree, the month must be recognised, and years start at 2000. No credentials, port, query, fragment, trailing slash, PDF or alternate publication family. The caller supplies a full publication date; the monthly URL alone does not establish the day. Parsing separately checks the official Published-on date against that request.

The only supplementary URL is the exact May 2025 timing notice above, optionally requested explicitly for the 8 May 2025 decision. No generic news loader or automatic timing discovery is implemented.

Transport requires injected fetch and AbortSignal: GET, Accept text/html, redirect:error, cache:no-store, status exactly 200, HTML with absent or UTF-8 charset, optional strict bounded content-length, streamed 2 MiB limit and fatal UTF-8 decoding. Redirected responses and nonempty final URLs differing from the request fail. An empty response URL is accepted for injected Response objects used offline. No retry, timeout timer, browser use, environment read or default fetch. Recognised native network/abort failures are typed; unrelated programming TypeError/ReferenceError propagate.

## Supported HTML and Bank Rate wording

The canonical link must match the requested URL and the document title must identify Bank of England. One visible `main#main-content[role=main]` contains one supported h1 and one `div.published-date`. The h1 binds action, resulting rate, month/year and either the inspected older or current title suffix.

Within `div#content > ... div#output`, exactly two page-section sections contain the Monetary Policy Summary and minutes. The summary starts with one of the three verified paragraph arrangements described above. Scoped XML validation uses existing fast-xml-parser, HTML entities, explicit void tags, depth/entity bounds and ordered nodes. Hidden/script/navigation content is excluded from evidence. Material structural changes fail closed.

The accepted committee sentence begins with `At its meeting ending on <D Month YYYY>, the MPC` or the expanded Monetary Policy Committee (MPC), followed by an explicit majority vote. The majority must exceed the minority and total nine. The exact decision clause is:

- `maintain Bank Rate at X%.`
- `reduce Bank Rate by Y percentage points, to X%.`
- `increase Bank Rate by Y percentage points, to X%.`

Only the resulting scalar X is Bank Rate. Y is the published change, not a rate level. No previous-rate state is invented and no rate is calculated from previous rate plus/minus change. Rates are finite 0..100 percent; published changes are strictly positive and at most 100 percentage points. Unsupported wording, ranges, negative values or malformed numbers fail.

Minority sentences follow the committee sentence, beginning with an explicit member preference/vote. They never supply its resulting rate. The selected decision is also cross-checked against the minutes' immediate-policy section, Chair invitation and unique Bank Rate proposition: maintained at X, or reduced/increased by Y to X. All matching propositions in that section must identify the same selected list item. Action, change and rate must agree. Contradictory summary restatements or multiple meeting-decision candidates fail closed. The expected official monthly PDF link corroborates document identity; PDFs are not downloaded or parsed.

Vote counts are checked only as committee-decision context. No structured vote grouping, member identity or preferred-rate fact is exposed. Changes solely to omitted minority text do not create policy-fact revisions.

## Source fact and time semantics

The closed fact contains institution Bank of England, committee Monetary Policy Committee, product eurgbp, instrument Bank Rate, monthly publication document identity, meetingEndDate, publicationDate, decision action/rate/changePercentagePoints, percent unit, source URL, nullable release timestamp/proof, and effectiveDate null.

Meeting-end and publication dates come from separate publisher text and must agree with their respective contexts. They are not collapsed or used as knowledge time. No weekday or announcement-calendar convention creates an exact timestamp.

Decision pages alone yield releaseTimestamp null. The optional May timing-notice parser requires the exact official source and title, scoped publication date and the verified event-specific sentence with explicit GMT/BST. It ignores the normal noon alternative and retains the notice identity/local time/zone as material releaseEvidence. Other notices and unzoned/approximate wording are unsupported.

An explicit GMT/BST offset is validated against platform Intl Europe/London civil-time rules, including DST transitions, rather than selected from the month. Incorrect zones and nonexistent local times fail. No winter event-specific timing publication was verified in this slice; winter decision timestamps remain null. GMT conversion is covered independently as a deterministic helper, not a claim of a verified winter publication contract.

No inspected decision structure establishes an explicit Bank Rate effective date. V1 supports effectiveDate null only; it does not substitute meeting/publication dates or facility-operation dates. Extending this requires verified instrument-specific source wording.

## Evidence boundary, identity and persistence

`boe-bank-rate-evidence-v1` exposes the structured fact and locked provenance. It has no numeric observations. `readBoeBankRateFactV1` rejects extra carriers, forged provenance, mismatched event identity and inconsistent content IDs. Normalization verifies structure and consistency; it does not attest invented facts supplied by callers.

`boe-bank-rate-evidence-v1:sha256:` binds the locked provider/publisher/source specification and every normalized material fact, including the committee, instrument, resulting rate, action/change, meeting/publication dates and any explicit release proof. Capture time and unrelated prose are excluded. This is a selected-content identity, not an official revision ID or signature.

A private codec reuses the existing immutable canonical-statistical CAS engine unchanged. Its value is always 1, counting one source-evidence record. Unit `source-evidence-record` and distinct `uk-boe-bank-rate-evidence-record` / `BOE:policy-evidence-record` identities prevent it from claiming Bank Rate semantics. Full facts reside in the versioned annotation. Public append/as-known/acquisition results decode this record into a BoE evidence snapshot and never expose the internal series. Percent-valued rate carriers fail validation.

Storage namespace: `chronoverse:markets:boe:evidence-vintages-v1:` plus the decision-specific public canonical ID. Injected storage is mandatory. Candidate and stored content/provenance are revalidated. Captures are append-only: no overwrite, expiry, migration or history reconstruction. Same content deduplicates; material changes create immutable revisions; stale, conflict, corruption and bounded CAS contention are explicit.

knownAt equals fetchedAt and the storage score. As-known selection requires knownAt <= asOf. Empty-history coverage probes distinguish no-captured-evidence from not-known-as-of without exposing a later snapshot. This is captured coverage, not exhaustive historical BoE coverage.

## Inactive acquisition and limitations

`acquireBoeBankRateV1` requires an explicit publication date, caller signal, loader, trusted clock and append dependency. Optional timing notice loading is explicit and restricted to its verified event. Primary validation precedes any supplemental request; complete source validation precedes clock sampling and append. Provider/validation failure samples no clock and writes nothing; clock failure writes nothing. Cancellation is explicit, and successful completed append remains acquired even if cancellation arrives during storage. Unrelated programming defects propagate.

No production factory invocation or default dependency is added. No bilateral state, policy differential, interpretation, confidence, recommendation, reaction, macro composition, product profile/projection changes or runtime acquisition is implemented. This bounded contract covers the inspected layouts and exact supported wording, not all historical decisions or future redesigns. Unanimous or differently phrased decisions currently fail closed.
