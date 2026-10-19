# Inactive asynchronous approval authority: Phase 2C2 Slice 5

This is a provider-independent storage contract and offline coordination model.
It implements no real persistence, distributed linearizability, globally safe
replay prevention or production infrastructure qualification. All test stores,
clocks and authenticated decisions are synthetic trusted capabilities.

The server-only driver has no provider client, environment loader, application
caller, route, scheduler, initialization API or default store. Construction does
no I/O. Every successful result states executionAllowed: false and scope
offline-approval-authority-contract-only. Reads and writes return inspection
observations only, never executor sessions or live authorization. The Slice 3
unconditional live-replay-unavailable gate remains unchanged.

## Storage contract and trust boundary

createOfflineR2ApprovalAuthorityV1 takes an explicit, fixed authorityId and
generation, asynchronous journal and witness capabilities, a synchronous modeled
authenticated decision capability, and trusted clock/deadline capabilities.
The driver captures these capabilities at construction.

The journal read returns the full existing Slice 4 snapshot or explicit null for
missing state. Unknown shapes, unsupported versions, invalid manifests, impossible
transitions, damaged hashes, identity/generation mismatch and exceeded bounds
reject through the shared Slice 4 semantic replay. The driver never creates an
empty journal in response to missing/corrupt state. Bootstrap, generation changes
and importing approvals are outside this API and require independent review.

Journal CAS receives exactly the expected checkpoint, next checkpoint and entire
validated next snapshot. Checkpoints bind schemaVersion, authorityId, generation,
sequence and headSha256. The store MUST compare every expected field atomically,
require the exact existing journal prefix and one valid next event, then persist
the entire candidate indivisibly. Approval identity, target/run reservation,
consumption, claim identity, operation counters and audit are all derived from
this single journal. There are no independently mutable projection/index fields.

The store must preserve every accepted event without TTL, eviction, deletion,
refund or reset. No internal write retry may convert duplicate consumption into
a new success. A CAS conflict is a definitive refusal, never permission to retry.
A thrown/unsupported response is ambiguous, including after client cancellation.

The witness is an independently retained checkpoint authority. Its read returns
the retained checkpoint or explicit null. Its CAS atomically compares the entire
expected checkpoint and publishes the exact next checkpoint. A journal export,
a checkpoint supplied by a command, or a checkpoint stored in the journal's same
restore unit is not an independent witness.

Both CAS acknowledgements are closed passive data:

- schemaVersion: calendar-r2-approval-authority-ack-v1.
- store: witness or journal, matching the invoked capability.
- expected: the complete expected checkpoint.
- status applied plus checkpoint: the complete requested next checkpoint; or
  status conflict plus checkpoint: null.

Acknowledgement shape and binding validation do not authenticate a malicious
store or establish that it really persisted anything. Providers and injected
implementations remain trusted until separately qualified. Final journal replay
and checkpoint comparison detect observable partial/missing writes, but cannot
detect a provider lying consistently on both acknowledgement and readback.

## Ordering and asynchronous uncertainty

One mutation performs this bounded sequence, without retries:

1. Read and fully replay the journal, then obtain and compare the independently
   retained witness. Check the modeled authoritative clock against retained events.
2. Detach/validate the command, reuse Slice 4 authorization and transition logic,
   and prepare one complete next journal. Revalidate time before publication.
3. CAS the witness from the old checkpoint to the candidate checkpoint. Validate
   the fresh acknowledgement, reread the witness and verify the exact next head.
4. Recheck time, then CAS the whole journal from the same expected checkpoint.
   Validate the fresh journal acknowledgement.
5. Re-read/replay journal and witness, require the exact candidate checkpoint,
   and recheck the command's temporal conditions before returning an observation.

Witness-first ordering deliberately sacrifices availability. It is NOT a
distributed transaction between stores. A witness ahead of the journal means
quarantine, never a reason to roll the witness back or reset the approval.
Competing drivers may temporarily observe this gap and must refuse to act.
A concurrent later transition can also make exact-head readback unavailable;
the driver never turns that ambiguity into success.

Once any publication was attempted, every failure quarantines that driver,
including a definitive CAS conflict. There is no repair/takeover method. A fresh
driver may inspect consistent retained stores, but does not repair mismatches,
reconstruct a session, or retry the failed command. Committed consumption stays
consumed even after a lost or expired response. Operator reconciliation remains
an authenticated audit transition and cannot erase uncertainty or refund budgets.

## Clocks, deadlines and resource bounds

The existing Slice 4 parser, hashes, manifests, authorization, state transitions
and audit format are unchanged. Narrow pure helpers expose replay/checkpoint,
clock validation and preparation of a candidate; they certify no storage result.

Limits remain eight records, 128 audit events, 262144 canonical snapshot bytes,
120000 ms maximum validity, 1000 ms maximum clock-interval width, and all existing
passive-data limits. Exhaustion rejects the next mutation without eviction.
Existing exact-key, PUT/GET/concurrency budgets and claimed-time run bounds apply.
No additional archive operation, payload or historical timestamp is introduced.

The trusted clock returns generation, earliestMs and latestMs. Samples must be
valid, nondecreasing against both this driver and journal history, and have the
configured generation. Claims/reservations/completion require the entire interval
inside their permitted window; expiry is exclusive. Issuance may precede notBefore
but cannot survive expiry. Revocation, settlement and reconciliation retain their
existing Slice 4 temporal semantics.

Time is freshly sampled after asynchronous boundaries and before an observed
mutation result. A whole driver read or mutation shares a 1000 ms elapsed deadline;
it does not receive a fresh deadline per storage call. Monotonic checks reject
late results even if timer dispatch is delayed. Timer expiry aborts the signal and
returns without waiting for a stalled capability. Late promises cannot resume the
driver into another write or produce a result. Synchronous validation is bounded
but cannot be preempted; final elapsed checks still reject late completion.

Aborting a capability cannot prove non-commitment. A journal dispatched before
expiry may commit later; the driver then rejects the expired observation and
retains consumption or a checkpoint gap. The event's preparation-time sample is
NOT a certified commit/acknowledgement timestamp. No real clock accuracy or
provider commit-time validity has been qualified. Local wall time is not a fallback.

## Failure and recovery matrix

| Condition | Driver behavior | Retained-state interpretation |
| --- | --- | --- |
| Missing journal | missing-state; no writes | Never initialize/reset automatically |
| Invalid/corrupt history or wrong identity/generation | corrupt-history; no writes | Restore quarantine; no prefix fallback |
| Missing/unreachable witness | checkpoint-unavailable | No mutation or authorization |
| Witness differs from journal | checkpoint-mismatch | No repair or rollback |
| Failure before witness publication | Unavailable; no permission | May leave both unchanged; never assume this from timeout |
| Witness CAS conflict | stale-writer; writer quarantined | No automatic retry |
| Lost witness acknowledgement | acknowledgement-unknown; quarantine | Witness may be ahead; inspect independently |
| Journal failure after witness publication | Unavailable; quarantine | Witness-ahead gap; no fallback |
| Partial/omitted journal event or false applied reply | Readback/replay refusal; quarantine | No successful observation |
| Journal committed, reply lost | acknowledgement-unknown; quarantine | Consumption remains retained |
| Late commit after deadline | deadline; no resumed driver work | May create a gap or retain consumption |
| Window expires while waiting | Unavailable; no successful mutation observation | Preserve any publication/consumption |
| Concurrent exact-head readback changes | Unavailable; quarantine after attempted publication | No permission from a newer snapshot |
| Restart with consistent retained state | Inspection only; fresh explicit transitions remain validated | No reconstructed session |
| Journal and witness both rolled back | Not detectable by this model | Independent restore protection remains required |

Failures expose fixed reason codes and a fixed message, without provider errors,
causes, raw commands, authorization evidence, identity tokens or credentials.
Unsupported/expired transitions use transition-rejected; invalid clock samples
use clock. Local overlapping calls return busy; this resource guard is not the
mechanism for coordinating independent drivers.

## Independent witness, restore quarantine and future gates

A real witness needs authenticated provenance, independent retention/restore
controls and an approved failure domain. Copying its head into a second table or
database does not by itself establish independence. Losing or rolling back both
stores together is undetectable. Hash chains do not prove a missing suffix never
existed. A new generation must never silently reimport consumed approvals.

No provider has been selected. Before any provider implementation or activation,
obtain explicit owner approval and qualify:

- Actual atomic full-state CAS, acknowledgement durability, read consistency,
  crash/restart, partition/failover, duplicate delivery and ambiguous outcomes.
- One stable authority routing scheme covering approval identity and target/run
  uniqueness; no arbitrary namespace splitting or failover authority reset.
- Independent witness authentication, retention, restore fencing/quarantine and
  an operator recovery process that never restores unused approvals.
- Authenticated operator decisions, policy enforcement and clock accuracy/bounds.
- Hosting/access controls, credentials, operational monitoring, measured deadlines,
  quotas and total costs for journal AND witness. Free tier is not unlimited;
  no paid plan, dependency or service is authorized.

## Offline verification and delivery

Tests use volatile shared CAS models with independently injected witness state,
faults and deterministic clocks/timers. They demonstrate contract conformance
only, not provider atomicity, durability, recovery safety, distributed
linearizability, globally safe replay prevention or infrastructure qualification.
Socket/fetch guards forbid accidental network activity. Existing temporal,
historical-refusal and unconditional live-rejection tests remain authoritative.

Run the new test file using scripts/tests/calendar-offline-preload.mjs, then all
focused calendar tests, scoped strict TypeScript and focused ESLint. Do not run a
full local build. Verify the exact six-file scope, whitespace, secrets and lack
of activation. If ANY verification fails, stop without staging, committing or
pushing and report the failure.

Only after all checks pass, stage the six explicitly approved paths, commit,
push and verify successful GitHub Production deployment of that exact SHA.
If deployment verification is unavailable, report it without claiming success.
Deployment does not activate a provider, R2, live qualification, historical
admission, durable capture receipts or distributed calendar heads. Stop after
Slice 5; no Slice 6 work is authorized.

## Slice 6: pure store-side CAS validation

`r2QualificationApprovalAuthorityStoreValidation.ts` adds two server-only pure
functions: `validateR2ApprovalAuthorityJournalCASV1` and
`validateR2ApprovalAuthorityWitnessCASV1`. Both receive an explicit pinned trusted
identity, supplied retained state, and a proposed CAS request as unknown passive
data. They perform no I/O, initialization, clock sampling, authentication or
storage mutation. Neither function retains ledger state or supplies a default
store. No provider is selected, dependency installed or infrastructure activated;
this slice incurs zero incremental infrastructure charges.

Journal validation reuses the existing semantic replay and checkpoint parsers for
both retained and proposed journals. Every expected-checkpoint field must match
retained state: schema version, authorityId, generation, sequence and headSha256.
The candidate must preserve the complete replayed prefix, append exactly one valid
event, and replay to the exact proposed next checkpoint. Missing/corrupt retained
state, stale writers, forks, prefix rewrites, truncation, skipped/multiple events,
no-op replacement, duplicate approval/run identities, reopened consumption and
semantically impossible rehashed histories refuse. Existing record/event/byte,
validity, clock and reservation constraints apply through the same replay; there
is no alternate state machine or independently mutable consumption index.

Witness validation checks its supplied retained checkpoint, the entire expected
checkpoint and exactly one sequence advance under the same identity/generation
and existing bounds. It receives no event or journal: a valid digest shape cannot
prove that an unseen event exists or was authenticated. It does not establish
checkpoint provenance, freshness or independent retention. Supplying journal and
witness from a shared restore unit remains unsafe.

Results are deeply immutable detached descriptions with status `validated` and
store-specific expected/candidate data, or closed `refused` results containing
only a fixed reason and scope. Every result states executionAllowed: false and
scope offline-approval-authority-store-validation-only. There is no persistence
acknowledgement, authorization/session capability, raw provider error or cause.
Recorded decision hashes are still not independently verified signatures. Only
trusted authenticated ingress may propose transitions to a future real store;
these validators do not turn untrusted stored decision JSON into authentication.

### Atomic integration is still mandatory

A successful validation describes only the supplied values. Two competing
candidates can both validate against the same old journal. Neither result locks
state, proves a commit or grants permission for an unconditional storage write.
A future separately approved adapter MUST either:

- Execute validation against current retained state AND mutation within a suitable
  atomic transaction; or
- Validate the candidate and encode ALL expected-checkpoint fields in the actual
  atomic conditional write, relying on a qualified invariant that this complete
  checkpoint identifies the exact retained journal validated. Any out-of-band
  writer/restoration that violates this invariant invalidates that assumption.

A zero-row conditional update is a refusal, never an applied acknowledgement.
Reusing an earlier validated description after another commit cannot bypass the
conditional predicate. Provider transaction retries must not manufacture a second
fresh success. This slice implements no adapter, transaction, persistence or retry.

### Temporal, recovery and deployment boundaries

Semantic replay checks recorded event-time intervals, not the present time or a
provider commit timestamp. Existing trusted clock sampling, freshness checks,
asynchronous expiry revalidation and the whole 1000 ms authority deadline remain
in the unchanged Slice 5 driver. A validator result is never a replacement for
those checks. Bounds remain eight approval records, 128 audit events, 262144
canonical snapshot bytes, 120000 ms validity and 1000 ms clock uncertainty, with
all earlier operation/concurrency/key/archive budgets unchanged. There is no
creation, generation rotation, takeover, refund, deletion, eviction or repair.

Lost/ambiguous acknowledgements retain the Slice 5 quarantine behavior. Witness-
ahead and journal-ahead gaps fail closed; restart returns inspection only.
Joint rollback of both supplied stores can still present a valid old prefix with
apparently unused approvals. Detecting that requires an independently protected
external anchor, not another hash comparison. No automatic recovery is provided.

Offline tests exercise direct hostile CAS requests and injected volatile stores
composed with the unchanged driver. Socket/fetch guards demonstrate zero network
activity, not real provider atomicity, durability, distributed linearizability,
global replay prevention, clock accuracy or safe production restoration. All
those infrastructure guarantees remain unqualified.

Only the validator module, its new test file, the offline preload allowlist and
this document belong to Slice 6. No runtime caller, route, scheduler, provider
configuration, cloud resource or paid service is added. Live qualification,
historical admission, receipts and distributed heads remain inactive. Reverting
this unused code requires no state restore; a future live code rollback must
never roll back journal/witness data or recreate unused approvals.

Verify the new focused tests, all calendar tests including the existing 417,
scoped strict TypeScript, focused ESLint with zero warnings, the exact four-file
scope, whitespace and secrets. Do not run a full build. If any verification fails,
stop without staging, committing or pushing. After all pass, stage only the four
explicit paths, create one Slice 6 commit, push origin/master and independently
verify successful GitHub Production deployment for that exact SHA. Stop after
Slice 6; deployment activates no storage and authorizes no Slice 7 work.

## Slice 7: inactive D1-compatible journal CAS adapter

`r2QualificationApprovalAuthorityD1Journal.ts` implements only the existing journal
read/CAS capability. `createInactiveR2ApprovalAuthorityD1JournalV1` captures one
explicit authorityId/generation and a structural D1-shaped database capability.
Construction performs no I/O. There is no Cloudflare import, provider client,
connection, environment loader, application caller, route, scheduler or default
store. The adapter advertises executionAllowed: false and scope
inactive-d1-compatible-approval-journal-only. This is not a production authority.

The companion `.sql` file is an inactive schema artifact, applied only to local
SQLite by tests. One fixed slot admits one retained authority row. The adapter
never applies DDL, inserts a row, seeds genesis, upserts, switches generation,
repairs, restores or deletes data. Missing state reads as null and CAS refuses;
corrupt or unsupported state never initializes or falls back to a volatile ledger.
Schema constraints support bounds but do not replace semantic validation.

### Actual conditional mutation boundary

A read obtains the complete serialized snapshot and every checkpoint column.
The adapter bounds the stored UTF-8 representation, fully replays the snapshot
through the existing parser and verifies that all checkpoint columns match the
replayed checkpoint and pinned identity. It detaches proposed input before any
await, then reuses the unchanged Slice 6 journal CAS validator.

Validation is followed by exactly one parameter-bound SQL UPDATE. Its predicate
compares the fixed slot, authorityId, generation, checkpoint schema version,
expected sequence, expected head hash AND the exact previously read snapshot JSON
using binary comparison. The update replaces the entire snapshot and all five
checkpoint columns atomically. No approval projection or consumption index is
independently writable through this adapter. Comparing the exact JSON also refuses
a concurrent representation change or snapshot alteration that left checkpoint
columns untouched. Earlier validation never permits an unconditional write.

An applied acknowledgement requires success: true, meta.changes exactly 1 and
meta.changed_db: true. A confirmed zero-row result with changed_db: false is a
closed conflict acknowledgement. Contradictory/missing metadata is uncertain.
If supplied, total_attempts must be 1 and served_by_primary must be true; metadata
is not provider authentication. No adapter retry occurs. Provider-side retry and
read-consistency behavior still require live qualification.

Provider exceptions during mutation, malformed responses and cancellation after
dispatch return acknowledgement-unknown, without raw provider details or causes.
An exception does not prove non-commitment, even when a local test can inspect
unchanged state. Failures reading retained state are storage-unavailable;
malformed retained data is corrupt-history. Invalid proposals are refused before
UPDATE; stale valid predecessors produce conflict. The unchanged driver's wait
boundary may conservatively map a thrown adapter refusal to acknowledgement-
unknown, and every failed attempted publication still quarantines that driver.
No driver semantics or error contract is changed.

### Local SQL evidence and its limits

The new `.test.mjs` uses Node 24's built-in node:sqlite, with no new dependency.
A minimal D1-shaped harness executes the adapter's actual SELECT and UPDATE,
including bound values and SQLite's affected-row count. It does not implement CAS
by JavaScript assignment. Tests cover competing instances and a paused stale
writer, all expected-checkpoint fields, exact snapshot representation, hostile
histories, stored-column/replay mismatches, absent/corrupt state, zero-row refusal,
malformed acknowledgements, actual file locking/capacity errors, injected quota
errors and failures before/after mutation. File-backed close/reopen checks retain
consumption. Temporary test databases are confined to uniquely owned directories
and removed after their connections close.

Composition with the unchanged driver and a deliberately volatile modeled witness
covers lost replies, driver quarantine, restored journal mismatch, joint rollback,
clock/expiry/deadline refusal and late commits. These SQL tests are stronger than
volatile fixtures for checking the actual conditional statement, schema and local
restart persistence. They do NOT qualify Cloudflare D1 durability, replication,
crash/power-loss behavior, authentication, effective permissions, production
routing, billing, quotas, distributed linearizability or global replay prevention.
The local SQLite version and D1 response harness are not the Cloudflare service.
Socket/fetch guards prevent test network activity; only synthetic approvals exist.

### Witness, recovery and activation remain blocked

This slice implements no live witness or authenticated ingress. Recorded decision
hashes remain non-secret descriptions, not verified signatures. A trusted caller
must authorize proposals; the adapter must never expose raw journal CAS publicly.
A future witness needs pinned provenance, authority/resource routing, restricted
advancement permissions and separately controlled deployment/recovery access.
Two resources in one Cloudflare account are not independent of its privileged
administrators or coordinated restoration. Joint journal/witness rollback still
passes inspection as an old valid prefix; tests explicitly preserve that finding.

An operator restore requires quarantine, writer fencing and independently retained
recovery evidence. A driver-local quarantine flag is not a durable global fence.
Missing evidence requires continued refusal, never implicit witness replacement,
rollback, generation rotation, capacity eviction or approval refund. Code rollback
must not roll back retained approval data. No recovery API is added here.

The existing eight-record, 128-event, 262144-byte, 120000 ms validity and 1000 ms
clock-uncertainty limits remain authoritative. The driver still owns fresh temporal
checks and its whole-operation 1000 ms deadline. The adapter samples no clock;
recorded event time is not a provider commit timestamp. Real clock accuracy,
end-to-end latency, authenticated ingress, stable global routing, witness
protection and operator recovery remain prerequisites for future qualification.
Existing Node/server-only modules are not yet a qualified Workers deployment bundle.

No resource, token, plan, subscription or paid service is created. All checks are
local, with zero incremental infrastructure charges. R2 Public Access is unchanged
and must remain Disabled. Live qualification, historical admission, receipts and
distributed heads remain inactive. This adapter must not be activated until separate
owner approval and provider/witness qualification; no Slice 8 work is authorized.

Verify the new focused SQL tests, all existing 466 calendar tests, strict scoped
TypeScript, focused ESLint with zero warnings, exact five-file scope, whitespace,
secrets and absence of activation/dependency changes. Stop on any failure without
staging, committing, pushing or deploying. Only after all pass, stage the five
explicitly approved files, create one Slice 7 commit, push origin/master and verify
successful GitHub Production deployment of the exact SHA. Deployment of this
unused code creates no authority, cloud resource or permission to execute.

## Slice 8: inactive SQLite-backed Durable Object-compatible witness CAS adapter

`r2QualificationApprovalAuthorityDurableObjectWitness.ts` implements the existing
`R2ApprovalAuthorityWitnessStoreV1` read/CAS contract. Its factory,
`createInactiveR2ApprovalAuthorityDurableObjectWitnessV1`, takes explicit pinned
authorityId, generation and witnessId plus an injected `sql.exec(...).toArray()` /
`transactionSync(callback)` capability. This matches the synchronous interface
described in the [Cloudflare SQLite storage API documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
without importing Cloudflare code or constructing a Durable Object. Construction
does no I/O. The adapter states executionAllowed: false and scope
inactive-durable-object-compatible-approval-witness-only. It has no application
caller, default storage, Worker endpoint, binding, environment loader or scheduler.

The companion `.sql` is an inactive artifact applied and seeded only by offline
tests. One fixed slot holds the current checkpoint; history contains every
checkpoint from explicitly provisioned sequence zero through the current sequence.
The adapter never applies schema, initializes missing state, repairs persisted
data, changes generation, replaces a witness, deletes records or retries writes.
Both empty tables read as null and CAS returns missing-state. Orphaned current or
history records, malformed checkpoints, unsupported schemas, identity mismatches,
gaps, extra history or a different historical latest head fail closed. Inspection
validates bounded history in the same transaction as its current-state read.

### CAS, transactions and history

Proposals are detached passive data. Inside one synchronous transaction, the
adapter loads persisted state and reuses the unchanged Slice 6 witness CAS
validator. Every expected checkpoint field must match: schemaVersion, authorityId,
generation, sequence and headSha256. Advancement is exactly one sequence step,
within the existing 128-event bound. Authority, generation and witness identity
remain pinned. The witnessId is storage metadata, not a new checkpoint or ACK field;
the existing driver and wire formats remain unchanged.

A parameter-bound UPDATE also compares all expected checkpoint fields and the
pinned witnessId using binary text comparison. It changes only sequence and hash.
An INSERT appends the exact candidate to history. Both statements use RETURNING;
each must return exactly the requested checkpoint. The adapter revalidates current
state and history before the callback returns. Cursors are consumed synchronously;
there are no awaits or external calls inside the transaction. A normal applied
ACK is returned only after transactionSync returns the exact callback result.
Stale valid predecessors return the existing witness conflict ACK without writes.

History uses a sequence primary key and triggers rejecting UPDATE, DELETE and
duplicate INSERT, including INSERT OR REPLACE. Previously accepted rows are never
rewritten by the adapter. These constraints protect normal SQL operations, not a
privileged administrator able to drop tables/triggers or restore the database.
History and current checkpoint share one local transaction and restore unit; they
do not constitute two independently retained witnesses.

The injected transaction capability must invoke its callback once, synchronously,
and roll back every callback exception. Failed UPDATE/INSERT, invalid returned
rows, failed consistency checks and cancellation observed inside the callback
throw, rolling back both tables. Unexpected zero-row mutation is uncertainty,
not an applied ACK. Read/storage failures are sanitized; no provider detail or
cause escapes. After mutation dispatch, any exception, unsupported transaction
result or cancellation yields acknowledgement-unknown. A failure after commit may
leave both records advanced. The adapter never assumes non-commitment or retries;
the existing driver's quarantine and witness-first gap behavior remain unchanged.

### Offline evidence and future activation prerequisites

The `.test.mjs` harness follows Slice 7: Node 24 built-in node:sqlite executes the
actual adapter SQL and explicit local transactions. Tests exercise advancement,
complete expected-state comparison, competing instances, identities, sequence
gaps/replay/capacity, missing/corrupt state, immutable history, rollback after
checkpoint/history writes, malformed cursor/transaction outcomes, locks, injected
quota failures, cancellation, lost replies and file close/reopen retention.
Composition with the unchanged authority driver checks inspection-only results,
quarantine and witness-ahead refusal. Socket/fetch guards prohibit test network use.
No package or lockfile changes are needed.

This proves local SQLite behavior only. It does not qualify Cloudflare durability,
output gates, crash/power-loss recovery, replication, permissions, authentication,
production routing, quotas, billing, clock accuracy or a Workers deployment bundle.
A digest-shaped head is not evidence of an authenticated journal event. The witness
still cannot detect coordinated restoration of itself and the journal to an old
valid prefix, and witnessId pinning is not independent provenance authentication.

Before any future activation, obtain separate explicit owner approval and qualify
the actual provider transaction/acknowledgement semantics, stable authority and
witness routing, authenticated advancement access, independent retention/restore
controls, writer fencing/quarantine, recovery evidence, clocks/deadlines, deployment
compatibility, monitoring, quotas and costs. Bootstrap and generation changes need
separate reviewed procedures and cannot restore unused consumed approvals.

Slice 8 provisions and activates nothing: no live Durable Object, D1, R2, Worker,
endpoint, paid resource, credential change or production runtime wiring. Live
qualification, historical admission, receipts and distributed heads stay inactive.
Earlier slice-specific delivery instructions above are historical. For Slice 8,
stop after local implementation and verification; do not stage, commit, push or
deploy. Await explicit owner approval for any later commit or deployment.
