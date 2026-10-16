# Canonical calendar foundation V1 — Phase 2A

This is an inactive calendar foundation with deterministic models and opt-in
bounded acquisition. It has no production route, UI caller, automatic polling,
scheduler, persistence implementation, authentication dependency, environment
read, R2 integration, opportunity model or probability model. Existing
canonical FX bundle and independent €STR result owners are untouched.

`readCalendarEventV1` accepts closed passive data, detaches it, validates its shape
and freezes it. Runtime modules are server-only. Official-host restrictions bind a
declared primary publisher; they do not verify a document, signature, publication,
source version, acquisition, clock accuracy or persistence acknowledgement. All
Phase 2A fixtures are synthetic, including their official-domain URLs and timing claims.

## Time roles

- `eventTime` describes an exact instant, civil date, bounded window (inclusive
  endpoints), or unknown announcement time. Exact schedules retain a source civil
  clock and named zone; that clock must match the offset-bearing instant. Both
  explicitly disambiguated DST fold instants are supported; DST gaps reject.
- Date-only and unknown schedules never acquire midnight or release timestamps.
  A null zone means unqualified timezone. A known date with an unspecified
  announcement clock can remain `unknown` with `expectedDate`.
- `publication` is separate, with its own primary-source provenance. It can retain
  an exact instant, date or window, or remain unavailable. Only exact/window
  publication bounds can be compared to acquisition without additional civil-date
  qualification. A date-only publication does not certify an absolute release
  instant. Publication and economic effective dates are never substituted.
- `acquisition.completedAt`, `evidenceAvailability.availableAt` and
  `persistence.acknowledgedAt` are distinct explicit fields. Recorded timing must
  satisfy completion <= availability <= acknowledgement. Unavailable timing is
  represented explicitly. No implicit clock or seconds-to-milliseconds upgrade.

## Revisions and offline cutoffs

Event IDs stay stable across source versions, rescheduling and cancellation.
`selectCalendarEventAsOfV1` requires a complete chain beginning at revision 1,
matching predecessor version IDs, and strictly increasing acknowledgement times.
Equal-time competing versions, gaps, mismatched identities and unsupported state
transitions fail closed. Input order is irrelevant. Cancellation stays visible;
only an explicit reinstatement can reopen a cancelled schedule. A published event
cannot silently become scheduled or cancelled.

Selection requires acknowledgement <= knowledgeCutoff <= evaluatedAt. All supplied
versions must validate, including later versions; malformed or unacknowledged
history never causes fallback to an older version. A document captured today is
not known at its historical event date. Descriptions always state
`provided-history-only`, `sourceAuthentication: not-performed` and
`historicalOwnership: not-certified`. Neither the chain nor an acknowledgement
field reconstructs historical ECB ownership or authenticates durable storage.

## Product and projection boundaries

The product type reuses the existing five-product ID contract through a type-only
import. No runtime product owner is loaded. Relevance is explicitly supplied, not
economically inferred. The benchmark-publication family is limited to ECB €STR;
its reference period stays separate from publication day. These contracts carry
no numeric rate facts or price-based direction; existing €STR series/status/unit
contracts retain ownership of those semantics.

Free Lite exposes only public identity, title, family/state, schedule, publisher
link, relevant product IDs and freshness. VIP Deep adds revision, source binding,
publication and separate capture clocks. Neither exposes internal persistence
record IDs. Errors use the same sanitized public reason. Both use explicit DTO
allowlists; canonical event objects are never spread into the public projection.

The VIP mapper is NOT authorization. Before future production use, existing VIP
guards must authorize before any protected history loading or projection. No
calendar routes or callers are activated in this phase.

Freshness uses the explicitly declared maximum age from evidence availability.
At exact expiry it is stale. A null cadence remains unavailable. Available DTO
facts may be stale; availability is not current-use or opportunity eligibility.
Delivery time can reassess freshness but cannot select newer event evidence into
an earlier cutoff. No publication, reaction, entry, target or probability is inferred.

## Focused verification

On the repository's Node 24 runtime:

```powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/contracts.test.ts src/lib/markets/tests/calendar/projections.test.ts
```

The test preload uses native TypeScript stripping and an explicit relative-module
allowlist. It avoids tsx's temporary-directory/user lookup and emits no compiled
files. It uses the existing server-only test marker. No application startup or
protected-file import is needed.


## Phase 2B1: ECB and BoJ official schedule row normalization

Scope is deterministic normalization of already-extracted source rows into the
existing V1 event contract. There is no HTML/PDF extraction, live fetching,
provider fallback, refresh job, calendar store, route or UI activation. Acquisition
and durable persistence were deferred by Phase 2B1. That release did not
implement extraction; the Phase 2B2 section below adds bounded HTML extraction.
The ECB ledger and historical resolver remain untouched and inactive.

normalizeEcbOfficialScheduleV1 accepts the existing
EcbMonetaryPolicyScheduleCandidateV1 shape through a type-only import, reuses
ecbMonetaryPolicyCanonicalEventIdV1 and ecbScheduledInstantV1, and only accepts
the canonical official English Governing Council calendar URL:
https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html

That calendar provides Day-2 dates rather than a release clock. A null
announcementClock therefore yields a date-only schedule. Exact timing requires
an explicitly supplied Frankfurt civil clock qualified for the particular meeting
date, with separate provenance from the inspected official decision-clock page:
https://www.ecb.europa.eu/press/govcdec/html/index.en.html

There is no default 14:15 clock, fixed CET offset, or promotion of that scheduled
clock to actual publication. Both source bindings are retained in the internal
normalization envelope; future ingestion must preserve the supporting clock
provenance and distinct acquisition/availability clocks alongside the event.
Aggregate capture timing must bound both source captures, or normalization fails. The existing Deep DTO describes the primary
event provenance only; it must not be presented as a complete multi-source audit
until delivery explicitly carries the supporting evidence. DST gaps/folds reject.

normalizeBojOfficialScheduleV1 accepts extracted start/end civil dates from:
https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm
or the inspected annual English schedule PDF path format, such as:
https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf

The dates are retained as civil labels. Decision time remains unknown, with the
final meeting date as the expected date and Asia/Tokyo as the zone. Neither
midnight, a noon estimate, an intraday window, a press-conference clock nor the
08:50 minutes/opinions clock is substituted. Opinions, minutes, reports and press
conferences are outside the supported event class in Phase 2B1.

Both versioned input shapes require an explicit canonical identity date, revision,
source/version labels, state, capture timing and freshness policy. No identity,
version, acknowledgement, cadence or publication is reconstructed from an
ambient clock or a moving schedule date. A caller must reconcile stable identity
before invoking the normalizer; the normalizer cannot authenticate that decision.
Schedule normalization alone is not revision-chain or historical evidence
admission. The existing complete-chain selector continues to perform that check.

ECB policy relevance covers the existing four EUR FX pairs and independent
€STR as direct-policy context. It never creates a benchmark publication, rate,
reference period or rate effective date. BoJ policy relevance is restricted to
EUR/JPY as counterparty-policy context. Unsupported shapes/URLs, missing fields,
invalid dates and passive-data violations return sanitized invalid-schedule.
The result is immutable and explicitly states provided-schedule-only,
sourceAuthentication: not-performed and historicalOwnership: not-certified.

The Phase 2B1 fixture rows reflect dates listed on the official pages inspected
during implementation; capture clocks, document versions, persistence receipts
and revision chains are synthetic. Boundary-date test cases are also synthetic.
They provide no authenticated acquisition or past ownership evidence.

Acceptance gate: date-only precision without clock evidence; qualified ECB clocks
across both DST changes; rejection of ambiguous/nonexistent clocks; BoJ unknown
announcement times and civil-date rollovers; source URL/path restrictions; stable
identity across rescheduling/cancellation; explicit missing timing/acknowledgement;
historical cutoffs; existing Free/VIP redaction and freshness; no network, ambient
clock, live owner or storage client; strict scoped TypeScript and ESLint.

~~~powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/contracts.test.ts src/lib/markets/tests/calendar/projections.test.ts src/lib/markets/tests/calendar/officialPolicySchedules.test.ts
~~~


## Phase 2B2: bounded official schedule HTML extraction

extractEcbOfficialScheduleHtmlV1 and extractBojOfficialScheduleHtmlV1 consume
caller-supplied decoded document text. They perform no acquisition, event
identity reconciliation, assessment, persistence or delivery. Phase 2A contracts
and Phase 2B1 normalizers remain unchanged; extracted candidates feed those
normalizers only when a caller separately supplies the required identity,
revision and capture context. There is no production caller.

The versioned document envelope requires publisher, exact authoritative URL,
document ID, source version, media type and an explicitly qualified timezone.
Only these inspected English structures are supported:

- ECB: the canonical Governing Council calendar's single main element, expected
  heading and balanced dt/dd definition-list entries. Only supported monetary
  policy Day-2 labels produce candidates. Other recognized meeting classes stay
  separate. Dates use the source's explicit DD/MM/YYYY format.
  https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
- BoJ: the canonical MPM index's single main element, expected heading,
  year-labelled headings/captions and four-column annual tables. Header spans,
  date order, calendar dates and written weekdays must agree. Only the meeting
  cell is extracted; adjacent report, opinions and minutes dates/clocks are
  not decision timestamps.
  https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm

The BoJ V1 grammar supports the inspected two-day, same-month English date
labels, including linked PDF-size suffixes. Single-day, cross-month, alternate
language and alternative date-layout extraction require a separately verified
format version. They are rejected here, even when a human might guess a date.
An unknown minutes date is harmless to meeting extraction; an unknown meeting
date fails the whole document.

ECB output stays date-only in Europe/Berlin. BoJ announcement time stays unknown
with the expected last meeting date and Asia/Tokyo. No official clock rule is
silently added. Schedule dates, acquisition and actual publication remain
separate; the extractor creates no capture or publication timestamps.

Available output retains the publisher, URL, supplied document/version IDs,
parser version, format ID, source date label, table year and one-based row
reference. Future ingestion must retain this extraction envelope alongside the
normalizer output: the event's existing parserVersion labels the Phase 2B1
normalizer, while the envelope labels the HTML extraction version. The SHA-256
digest identifies the supplied decoded text encoded as
UTF-8; it is not a digest of original response bytes. Row references are scoped
to a document version and are not stable event identities. Labels and digests
do not authenticate publisher identity, acquisition or historical knowledge.
Results explicitly state provided-document-only, sourceAuthentication:
not-performed and historicalOwnership: not-certified.

Bounds are 512 KiB of UTF-8 input, 131072 main-content characters, 20000 lexical
tokens, 4096 parsed nodes, depth 32, and 128 extracted rows. BoJ additionally
limits the document to four annual tables and 64 rows per table. The main
content uses the existing fast-xml-parser with explicit balance validation;
browser HTML repair, DTD/entity declarations, active/hidden attributes and
unsupported main-content elements are not accepted. Comments and raw script
bodies outside main cannot contribute schedule facts. Raw-text/foreign wrapper
contexts cannot masquerade as a real main schedule. CSS is not executed,
and this parser is not a source authentication or rendered-visibility service.
A malformed/unsupported row invalidates the entire extraction, with no partial
result, fallback to old data or repair. Input proxies, accessors, hidden/symbol
fields and custom serializers are rejected without invoking caller code.

PDF extraction is explicitly unsupported. No pdf-parse, pdfjs-dist, pdfreader
or pdf2json runtime dependency is installed. A PDF link in an HTML cell does
not constitute PDF coverage; application/pdf returns unsupported-format.
No dependency installation or manifest change is part of this release.

Versioned offline fixtures are in tests/calendar/documents:
ecb-governing-council-v1.html and boj-mpm-index-v1.html. They are reduced
structural examples based on the official formats inspected on 2026-10-16,
with selected listed rows. The BoJ adjacent-clock note is synthetic.
Document IDs, source versions, captures, acknowledgements and revision test
mutations are synthetic and supply no historical ownership evidence.

~~~powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/contracts.test.ts src/lib/markets/tests/calendar/projections.test.ts src/lib/markets/tests/calendar/officialPolicySchedules.test.ts src/lib/markets/tests/calendar/officialScheduleExtraction.test.ts
~~~

Acceptance includes metadata/precision preservation, compatibility with both
normalizers and existing projections, revision digests and historical cutoffs,
unknown decision timing, exact source/zone restrictions, malformed/unsupported
layouts, invalid/duplicate dates and weekdays, hidden/active markup, resource
bounds, passive snapshots and deterministic execution without network or an
ambient clock. Ledger/resolver activation, live scheduling, opportunities and
probabilities remain outside this release. Phase 2B3 acquisition is described below.


## Phase 2B3: bounded opt-in acquisition foundation

createOfficialScheduleAcquirerV1 constructs a server-only client with no I/O at
construction and no singleton or production caller. A versioned acquire request
accepts only publisher ecb or boj; callers cannot supply URLs, headers, redirects
or relaxed bounds. The frozen source registry contains exactly the two official
HTTPS HTML index URLs already admitted by Phase 2B2. There is no fallback source,
automatic retry, cache, background task or polling.

One explicit call makes one GET with manual redirects, credentials omitted,
no referrer, no-store caching, HTML Accept and identity content encoding.
Every redirect is rejected, including same-origin HTTPS redirects. The response
must report the exact requested URL, no followed redirect, status 200 and an
HTML content type with UTF-8 or no charset parameter. PDF, alternative encodings,
compressed representations, partial status 206, empty status 204 and conditional
status 304 are unsupported. No cached body is substituted for those results.

The deadline is 10000 elapsed milliseconds across headers, body, UTF-8 decoding,
bounded extraction and final delivery checks. An owned abort signal, promise
deadline race and monotonic checks reject late results, even when an injected
transport ignores abort. Active bodies/readers are cancelled on failure;
late-arriving responses are cancelled instead of extracted. The trusted fetch
capability must implement standard native Response/stream and manual-redirect
semantics. A trusted deadline capability must measure elapsed real time.

At most 512 KiB and 4096 body chunks are consumed. Content-Length, when supplied,
must be a single valid nonnegative integer within the limit and must match the
complete identity body. Conflicting transfer/length metadata, stream errors,
empty bodies and invalid UTF-8 fail closed. No unbounded response.text() or
arrayBuffer() read is used. Extraction is delegated to the existing Phase 2B2
functions and must succeed completely; malformed structures yield no partial
rows. The existing extractor retains parser version, document provenance and
source date precision. No decision publication timestamp is created.

Document IDs identify the allowlisted publisher/index. Source version IDs use
sha256 of delivered response-body bytes, explicitly a locally computed identity,
not a publisher-issued version or a storage receipt. The existing extraction
envelope separately retains its digest of decoded HTML text. Raw HTML, cookies,
authentication headers and raw exceptions are not exposed in the result.

Request start, complete body acquisition and evidence availability are separate
local UTC millisecond observations. Completion must not precede start;
availability must not precede completion; final delivery must not regress.
Values stay within the canonical epoch-through-year-9999 domain. A future HTTP
Date relative to completion fails closed. Default wall/monotonic clocks are
Date.now and performance.now. These observations do not establish clock accuracy.

Freshness is explicitly limited to unverified HTTP response-age observations.
A valid IMF-fixdate Date header is required. The client uses the larger of
apparent local age and the conservative whole-second Age bucket endpoint plus
rounded-up elapsed request time. The limit is 60000 ms, shortened by any valid
max-age/s-maxage directive. At exact expiry the response is stale; duplicate or
malformed age directives fail, and Warning-bearing responses are rejected.
Last-Modified is retained as HTTP metadata, never as publication or freshness.
This is deliberately narrower than a general HTTP cache implementation.

The remaining nominal lifetime becomes the existing calendar freshnessPolicy,
with an explicit expiresAt. Downstream consumers must reassess expiry at use;
a returned object is not permanently current. Documents with all meeting dates
before the observed publisher-local date are rejected, including a date rollover
at delivery. Unknown announcements on today's expected date stay unknown.
These checks neither verify publisher update cadence nor certify source currency.

Successful status acquired means HTTP 200 plus complete supported extraction,
not verified authoritative evidence or canonical assessment. Every result states
sourceAuthentication: not-performed, evidenceAdmission: not-certified,
clockAccuracy: unknown, sourceCurrency: not-certified and historicalOwnership:
not-certified. The Phase 2A timing shape records separate completion/availability
and persistence: not-persisted. Phase 2A historical selection still refuses those
unacknowledged events. Normalization remains a separate caller step with explicit
stable identity/revision context; Phase 2B1 normalizers are unchanged.

Dependencies are captured at factory construction for deterministic testing.
There is no production environment/secret read, credential change, R2/Redis
persistence, route, UI, cron, ledger/resolver activation, opportunity or probability
model. Later runtime activation and evidence admission require separate work.

Focused tests reuse the versioned Phase 2B2 HTML fixtures with synthetic HTTP
headers, clocks, deadlines and streams. They cover both publishers, successful
capture, exact allowlisting, redirects, status/media/encoding failures, bounds,
truncation, stale/ambiguous HTTP metadata, local date rollover, clock regression,
stalled headers/bodies, late replies, concurrent requests, and unacknowledged
normalizer/selector compatibility. Any optional official-source smoke check
is read-only and opt-in; it creates no scheduled or persistent acquisition.

~~~powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/contracts.test.ts src/lib/markets/tests/calendar/projections.test.ts src/lib/markets/tests/calendar/officialPolicySchedules.test.ts src/lib/markets/tests/calendar/officialScheduleExtraction.test.ts src/lib/markets/tests/calendar/officialScheduleAcquisition.test.ts
~~~
