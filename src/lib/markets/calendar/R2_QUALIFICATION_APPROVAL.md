# Offline qualification approval protocol: Slice 4

This server-only module implements an offline model, not a production approval
service. It selects no provider, loads no environment, creates no infrastructure,
and has no Redis, R2, D1, Durable Objects or other network client. It introduces no
paid dependency, subscription or recurring infrastructure cost. No new dependency
is installed. Every coordinator advertises `executionAllowed: false`.

The existing harness and its unconditional live-rejection gate are unchanged.
A model claim/session cannot be supplied as live authorization to that harness.
No canonical evidence qualification, receipt, historical ownership or distributed
head is created. Model audit clocks are control observations only.

## Immutable approval binding

`prepareR2QualificationApprovalV1` accepts only a closed passive draft containing:

- schemaVersion `calendar-r2-approval-draft-v1`, explicit approvalId, full validated
  qualification manifest, notBefore/expiresAt integer epoch milliseconds, and
  explicit targetPolicyVersion.
- The regenerated manifest binds exact account, dedicated non-production bucket,
  default jurisdiction, run ID, all synthetic keys/digests and all execution limits.
- Validity is a nonempty interval at most 120000 ms. Expiry is exclusive. Approval
  issuance may precede notBefore; claims and reservations may not.

The request digest covers recursively key-sorted JSON using domain-separated
SHA-256. Approval identity hashes the approval ID under a separate identity domain;
changing the target does not evade duplicate approval-ID detection. The final
approval digest includes the complete draft and authenticated issuance decision.
The namespace is `chronoverse:calendar:r2-qualification-approval:v1`. Canonical
archive object keys retain their existing format without any modification.

The manifest is regenerated through the deployed pure preparation function.
The small exact-canonical-manifest cache avoids repeated parsing only; it stores
neither ledger state nor permission and eviction merely forces revalidation.
Unknown fields, supplied operator claims, booleans, tokens, credentials, proxies,
accessors, digest substitutions and unsupported versions are rejected.

## Injected authenticated decision boundary

The model authority requires a trusted synchronous `authorize` capability. It is
called inside the modeled transaction for issuance, revocation and reconciliation.
Its request contains the purpose and exact command digest. The trusted implementation
must decide whether that precise command was authorized by an authenticated operator;
it must not derive authentication from caller-supplied names or flags. In these tests
it is a synthetic decision model, not a real authentication integration.

A supported decision must bind the purpose and request digest and provide only
operatorSubjectSha256 and authorizationEvidenceSha256. Only these non-secret digests
are retained, not identity-provider tokens, signatures, sessions, emails, credentials
or raw authorization evidence. Unsupported, denied, asynchronous or malformed
responses fail closed. The issuer must know the approved digest/context through its
own trusted authorization workflow; accepting every digest is only a test fixture.

Recorded decision hashes are not independently verified signatures. Their model
provenance follows from the injected authenticated capability plus the independently
retained audit checkpoint. Copying decision JSON into an input cannot issue approval.
A production issuer, authentication scheme, policy registry and key management are
out of scope and require separate approval. Target declarations still do not prove
that a remote bucket is isolated or has appropriate permissions and retention.

## Simulated authority and atomic transitions

`createOfflineR2ApprovalLedgerV1` receives an authorityId/generation, authoritative
clock model, authenticated decision capability and a separately retained witness.
It exposes only injected `read` and `transact` capabilities. All state is volatile.
Independent coordinators can share this authority; the synchronous non-reentrant
transaction validates the full candidate before changing state.

Issuance reserves both approval identity and exact target/run identity permanently.
A claim atomically verifies that reservation, consumes approval and records its
claim ID in the same copy-on-write audit update. No parallel coordinator can receive
a second fresh successful claim from that modeled authority. There is no TTL,
delete, refund, release, takeover, lease renewal or reset-to-unused operation.

| State | Model meaning and permitted progression |
| --- | --- |
| issued | Unused; may be claimed, revoked or expired |
| claimed | Permanently consumed, with one claim ID |
| running | At least one bounded operation reservation exists |
| revoked | No new reservations; existing uncertainty is retained |
| expired | Validity ended; consumption, if any, is retained |
| stopped-unknown | Execution stopped; pending/unknown observations remain |
| completed | Terminal observed completion; approval remains consumed |
| reconciled | Terminal operator resolution; approval remains consumed |

The consumed flag never transitions from true to false. Reconciliation records a
resolution digest and authenticated operator decision; it does not erase pending
reservations, prove a remote outcome, grant new execution or reset counters.

Reservation commands bind the claim ID, unique per-approval reservation ID, method
and exact synthetic key. PUT is limited to manifest writable keys; GET also permits
the manifest missing-object key. Counters derive from all reservations and never
refund cancelled or unknown attempts. PUT/GET ceilings, pending-operation concurrency
and the earlier of approval expiry or claimed-time-plus-run-duration are enforced.
A missing key cannot become a PUT target. There is no actual operation dispatch.

Revocation serializes against claims/reservations. Once revocation commits, no new
reservation can succeed. Already reserved work must conservatively be treated as
possibly in flight; revocation is not proof that a remote request was cancelled.
Unknown/pending reservations prevent normal completion. Settlement may record an
observation after revocation; it never changes authorization back to active.

## Clock and capacity bounds

The injected authoritative-clock model returns generation, earliestMs and latestMs.
Both bounds must be valid and nondecreasing relative to audited samples. An interval
wider than 1000 ms, inverted interval, generation mismatch or regression fails closed.
Claims/reservations require the entire interval inside the validity window; interval
overlap with notBefore or expiry grants nothing. Expiration requires earliestMs at
or beyond expiry. Local Date.now is never a model authorization fallback.

These are assumptions/tests of a clock model, not verification of any real clock.
The retained generation is an operator-controlled model identifier, not a detected
provider failover epoch. An unqualified authority cannot create a new generation
and silently reimport old approvals as unused.

Bounds are eight approval records, 128 audit events, 256 KiB canonical snapshot,
and the existing passive-data validation limits. Capacity exhaustion rejects writes
without eviction. It can stop a run before its maximum request allowance is exhausted.
Each coordinator read/write is bounded by a 1000 ms injected deadline timer; no
operation is automatically retried. Injected timers must actually enforce elapsed
time. Limits are intentionally conservative offline bounds, not production sizing.

## Audit integrity, checkpoint and recovery

The event log is the complete stored approval state. Replay derives all approval,
claim, reservation and terminal projections; there is no separately mutable index
that can silently disagree. Events contain exact commands, non-secret authorization
hashes, modeled clock interval, sequence, predecessor hash and domain-separated hash.
Recovery revalidates every manifest, decision shape, command, transition, binding,
clock ordering and hash. Rehashed but semantically impossible histories also reject.

`createOfflineR2ApprovalWitnessV1` creates a separate volatile checkpoint closure.
The checkpoint binds authority, generation, exact sequence and current head hash.
Recovery MUST obtain it from the injected witness, never from the supplied snapshot.
A valid prefix, empty/missing record, rollback, reordered history, missing checkpoint
or generation mismatch cannot validate against the retained current witness.

The authority validates the complete next snapshot and retains its next checkpoint
before exposing the new state. Consumption, unique run reservation and audit share
one modeled state write. A gap/failure between witness advancement and state exposure
quarantines the authority and grants no session. It cannot fall back to an older
snapshot. Faults before commit leave both unchanged; lost responses after commit
leave consumption recorded. No automatic repair or checkpoint rollback is provided.

The witness is ONLY a trusted offline abstraction. Its closure is not independent
durable storage or a separate failure domain. Losing/rolling back both snapshot and
witness together cannot be detected by this model. An attacker controlling the
trusted witness or issuer is outside its guarantees. A real authority must qualify
persistence, single-use atomicity, partition/failover behavior, checkpoint authenticity,
restore rollback detection, retention, access controls and clock bounds separately.
Hash chains alone cannot prove the absence of deleted final events.

## Coordinator uncertainty and restart

`createOfflineR2ApprovalCoordinatorV1` validates fresh write acknowledgements, then
validates the recorded history against the witness. Only that fresh claim path can
create an instance-local opaque offline session. Duplicate claims never return a
session, even for the same claim identity. Reads and recovery return inspection
records only. Copied handles and handles from another coordinator/restart reject.

Lost/late acknowledgements, malformed responses, timeout, storage failure or an
unconfirmed checkpoint create no session. Late promise completion cannot resurrect
one. Unknown session mutations invalidate the local handle; stop/completion also
retire it. The authority retains consumption and reservations. There is no automated
retry or takeover. A failed attempt before the atomic claim has no committed
consumption, but its read result still grants no session; a fresh atomic claim is
required and no coordinator automatically attempts one after uncertainty.

A previously valid checkpoint becoming stale during concurrent activity may also
cause a conservative unknown result. Availability is sacrificed rather than granting
from an ambiguous acknowledgement. Errors expose only fixed codes and a fixed
message, with no raw provider errors, commands, tokens or causes.

## Infrastructure and delivery boundaries

Chronoverse follows free-tier-first infrastructure planning. This slice neither
selects nor implements a production ledger provider. Redis is not a prerequisite
for calendar operation or qualification. No paid Redis, Upstash subscription or
other recurring coordination cost is authorized. Future D1 or Durable Objects
assessment requires explicit approval and verification of actual free-tier limits,
consistency, durability and operating costs. No free tier is assumed unlimited.
Required guarantees must not be weakened to fit cost limits; report a blocker instead.

Focused tests use synthetic issuer/clock/transport decisions, retained model state,
faults, concurrent coordinators, corrupted recovery input and zero-network guards.
Run the new tests, the entire focused calendar suite, scoped strict TypeScript and
focused ESLint. Stop on any failure without committing or pushing. After all checks
pass, stage only the five approved Slice 4 files, commit, push and verify successful
GitHub Production deployment for the exact SHA. That delivery does not activate
live execution. No live infrastructure qualification or next slice is authorized.
