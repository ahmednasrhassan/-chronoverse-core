# Calendar capture persistence foundation (Phase 2C1)

Status: inactive, offline reference boundary only. No production caller, transport,
environment read, credential lookup, Redis/R2 connection, polling, route or UI.
ECB ownership and the historical resolver remain unchanged and inactive.

## Immutable record and original evidence

calendar-capture-input-v1 accepts the existing Phase 2B3 acquired result, original
delivered response bytes in canonical base64 chunks, and one explicit Phase 2B1
identity/revision binding per Phase 2B2 extracted row. B3 intentionally does not
return raw evidence: a future separately approved acquisition/archive bridge must
retain the bytes inside its bounded transport. Digests or normalized rows cannot
reconstruct the original response. This release does not change that transport.

Before append, passive input is detached and deeply frozen. Proxies (including
revoked ones), accessors, cycles, exotic objects and unknown fields fail closed.
The byte count/digest must match B3. Re-extraction must reproduce the complete B2
document identity, parser version, references, timing precision and row order.
Partial extraction and extra/missing bindings fail. Each row is normalized anew;
no supplied normalized event or exact decision clock is trusted. Canonical event
bindings retain all five ECB product relevances and BoJ EUR/JPY relevance.

calendar-capture-v1 retains the complete original byte chunks, source URL,
publisher, document ID, local digest-based source version, HTTP observations,
extraction parser version, row references, normalized event versions and hashes.
The decoded HTML digest remains separate from delivered-byte digest (UTF-8 BOMs
are preserved in original evidence). recordSha256 hashes recursively key-sorted
JSON of all fields except itself, UTF-8; arrays retain order. This is an internal
v1 serialization, not a signature or a claim of publisher-issued identity.
A different serialization or parser requires a new supported contract/version.

Bindings are caller-declared stable identities, not certified identity
reconciliation. A schedule date change can retain its prior canonical anchor;
no ownership is reconstructed. Omitted rows do not imply cancellation. This
version only captures present scheduled rows, not publication, cancellation,
supporting decision-clock rules or unsupported PDFs.

## Three clocks and historical cutoffs

acquisitionCutoff is observed response completion, not event time or publication.
The original B3 availableAt remains an *observed* processing availability under
evidenceAdmission: not-certified. It is not qualified evidence availability.
The capture explicitly states evidenceAvailability: unavailable,
qualification-not-performed, and durablePersistence: unavailable, offline-only.

Normalized events preserve acquisition but have unavailable evidence availability
and persistence: not-persisted. Offline receipts have a separate
observedAcknowledgedAt and scope: volatile-offline-only. They cannot be converted
into canonical durable acknowledgements. Phase 2A selection therefore continues
to fail closed for these events, at all historical cutoffs, including the receipt
timestamp. Source clocks/HTTP freshness are observations, not authenticated bounds.

Original observations remain immutable across append/retry/recovery. A retry
returns its original receipt, including after a lost reply; it never backdates a
new acknowledgement. Old evidence may be archived after HTTP expiry, but archival
does not make it fresh/current/admissible. No historical selector is activated.
A future qualification/transport release needs independently verifiable immutable
qualification and durable receipts, bound to recordSha256, whose first confirmed
availability/acknowledgement times determine the inclusive as-known cutoff.
It must not rewrite captures or infer acknowledgement from acquisition, an object
timestamp, a later lookup, a pointer, or an unqualified clock.

## Offline atomic append, retries, retention and recovery

createOfflineCalendarJournalV1 is an opt-in synchronous, process-local reference.
A single assignment linearizes record append and head advancement; there is no
await/callback within the commit point. Reentrant test clock/fault callbacks are
rejected while an append is active. This models atomicity, not cross-process
storage, durability, a Redis script or a distributed transaction.

Each source document has an independent complete chain. Capture IDs are unique;
previousCaptureId is a compare-and-swap expectation. Same ID/same record is an
idempotent retry, even after the head advances or capacity is reached. Same ID
with different valid content, stale head, cross-document appends, acquisition
regression, missing/skipped event revisions and reused event-version identities
conflict. Explicit event revision predecessors are required; unseen identities
must start at revision one. Captures never overwrite one another.

Retention is preserve-until-explicit-future-policy: no TTL, eviction, deletion,
or pruning operation. Capacity is at most 16 captures plus passive-data export
bounds (25000 nodes, depth 24, arrays 512, primitive strings 2048). Each evidence
body is at most 524288 bytes. Hitting either bound rejects the next append without
evicting history. These conservative offline limits are not production sizing.

Fault injection distinguishes failure before commit (no state change) and reply
loss after commit (outcome-unknown). Retry reconciles the latter by identity.
Checkpoints are detached immutable simulation exports, not durable backups or
authoritative history. Recovery revalidates every record against original bytes,
every event binding, digest, receipt, sequence and predecessor. Corruption,
incomplete/reordered chains and unsupported checkpoint versions quarantine the
whole journal. There is no automatic reset, repair, fallback to earlier records,
or partial serving. Caller-owned recovery data cannot mutate recovered state.
A standalone valid prefix cannot prove completeness: detecting a missing suffix
requires an independently trusted durable head/checkpoint in a later release.

## Redis and Cloudflare R2 assessment and activation gate

Redis is a candidate for bounded head/CAS coordination, not the authoritative
archive. Server-side Lua can atomically check/append/update a bounded journal on
one Redis authority; cluster keys must share a slot. Atomic execution alone does
not establish durable capture. Redis RDB/AOF policies have distinct loss windows;
replication/failover acknowledgement and provider REST scripting/timeout behavior
must be measured for the actual non-production transport before activation.
See [Redis Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/)
and [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

R2 is a candidate immutable original-evidence archive via its authenticated direct
API. Its documented strong read-after-write/list consistency and atomic
If-None-Match: * creation can support create-once objects; unconditional writes
allow overwrites. A lost write response remains ambiguous: a later 404 does not
exclude that in-flight write committing afterward. Resolve by conditional retry
and full digest verification, never by assuming absence. Custom-domain caching
must not be used for storage verification. See
[R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).

Redis and R2 do not supply a shared transaction. The proposed later protocol is
immutable archive creation and confirmed verification, then atomic coordination
registration; failed registration leaves an orphan archive, never a published
pointer to missing evidence. An orphan proves neither canonical admission nor a
past durable acknowledgement. Recovery must reconcile object identity, bytes,
record hash, confirmed receipts and head explicitly, retaining uncertain outcomes.
Digest validation cannot authenticate a caller-forged capture/checkpoint.

Before activation, separately verify scoped credentials without disclosure, TLS
and exact endpoints, conditional-write support, integrity round trips, concurrent
writers, lost replies, timeouts, corruption, missing objects, failover/recovery,
head rebuild/completeness, clock qualification, resource bounds and operational
observability. Establish approved retention horizons and deletion permissions;
test archive protection and lifecycle conflicts. R2 has
[bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), but
their configuration and effective protection have not been verified here.
No credential, transport, provider consistency or durability claim is made by
these offline tests. No production storage adapter exists in this release.

## Verification

Versioned synthetic capture fixtures reuse identifiable Phase 2B2 HTML structures
and the mocked B3 acquirer. Test clocks, HTTP metadata, bindings, receipts and
checkpoint histories are synthetic, not historic evidence. Tests exercise both
publishers, byte/text digests, BOMs, source/parser mismatch, complete extraction,
mutable/adversarial input, retained uncertainty, historical admission refusal,
64 competing writers, 64 identical retries, immutable revisions, recovery,
before/after-commit faults, reentrancy, retention, corruption and temporal bounds.

~~~powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/capturePersistence.test.ts
~~~

Next: separately reviewed non-production transport qualification and durable
archive/receipt design. No Phase 2C2, live storage or ownership activation is
authorized by this foundation.
