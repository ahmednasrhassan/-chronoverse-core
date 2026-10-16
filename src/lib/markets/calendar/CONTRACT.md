# Canonical calendar foundation V1 — Phase 2A

This is an inactive, deterministic contract, row normalization and offline model. It has no acquisition provider,
route, UI caller, scheduler, persistence implementation, authentication dependency,
environment read, R2 integration, opportunity model or probability model. Existing
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
and durable persistence are separate later work; Phase 2B2 is not implemented.
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
