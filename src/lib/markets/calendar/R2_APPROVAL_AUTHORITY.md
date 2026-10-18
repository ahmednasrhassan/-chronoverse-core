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
