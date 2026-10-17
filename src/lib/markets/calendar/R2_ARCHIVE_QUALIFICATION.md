# Calendar R2 qualification: inactive Slice 3

This module is a server-only, offline qualification harness. It has no application
caller, command, environment loader, SDK client, credentials, storage administration,
or default transport. Import and preparation cannot make requests. Execution needs
an explicitly injected trusted offline transport; tests use memory stores and forbid
socket connections. Do not supply a network transport to the offline capability.
The caller-provided capability is trusted code, not a sandbox for arbitrary code.

## Live execution is blocked

Every approval with mode `live` returns `blocked / live-replay-unavailable` before
transport construction. There is no bypass option or durable approval implementation.
A live-run implementation and external setup require separate review and approval.
Deploying this harness does not authorize a real request or qualify R2 for production.

Offline approvals are explicit caller-supplied passive data, not signed authorization
or proof of a human decision. They bind the validated account, bucket name, run ID
and exact versioned manifest digest. An approval ID is required, expires within
120 seconds, and is consumed synchronously before factory invocation. Approval IDs
and target/run identities cannot be reused in this module instance, including after
failure or cancellation. At 1,024 consumed approvals this instance fails closed.
The guard is process-local, is not persisted, and does not survive process restart,
module duplication or distributed execution. It never proves cross-process replay
prevention. This is why live execution remains blocked regardless of approval.

## Pure preparation and manifest

`prepareR2CaptureArchiveQualificationV1` accepts only a closed passive plan:

- `schemaVersion: calendar-r2-qualification-plan-v1`.
- An explicit `runId`, 1-64 ASCII alphanumeric/underscore/hyphen characters,
  beginning with an alphanumeric character. Use a new operator-assigned globally
  unique run ID for any future live plan; the module does not certify uniqueness.
- `target`: accountId, jurisdiction `default`, and an explicit bucket object with
  name, purpose `dedicated-calendar-capture-archive`, environment `non-production`.
- `limits`: writableKeys, puts, gets, concurrency, durationMs. Limits can tighten
  but cannot exceed 8 keys, 32 PUT attempts, 64 GET attempts, 2 operations, 120000 ms.
  This fixed suite needs six writable keys; PUT/GET ceilings may be zero.

The existing R2 configuration parser validates the target using internal synthetic
credential placeholders. Preparation requires no actual credentials. It rejects
unknown fields, external records/fixtures, arbitrary endpoints, unsupported
jurisdictions, production declarations and the backup bucket. Target declarations
are not remote attestations or permission checks.

Fixed synthetic ECB-format HTML, fixed HTTP observations and fixed revision context
are generated internally. They are not authenticated publisher evidence. A BOM
fixture preserves the original UTF-8 BOM bytes. Divergent fixtures share capture
identity but differ in validated observations. All records pass the complete deployed
capture validator and archive preparation before execution.

Capture IDs incorporate the explicit run ID. Archive keys retain the deployed
`calendar/captures/v1/<64-lowercase-hex>.json` format and domain separation. No new
qualification prefix is inserted into keys. Isolation depends on the dedicated
bucket, credentials and exact-key execution manifest. Eight fixture descriptors
represent six writable keys; one additional key is GET-only for the missing case.

The frozen manifest contains the plan, fixture version, descriptor digests/lengths,
case sequence, missing key and a domain-separated SHA-256 digest of recursively
key-sorted JSON. It contains no credentials or arbitrary input evidence. Execution
regenerates everything and compares the complete manifest, not just its digest.

## Offline execution and observations

`executeR2CaptureArchiveQualificationV1` accepts a manifest, explicit approval and
trusted offline dependencies. Approval fields are schemaVersion
`calendar-r2-qualification-approval-v1`, mode `offline-simulation`, approvalId,
accountId, bucket (name), runId, manifestSha256, expiresAt (integer epoch ms).
Injected wall/monotonic clocks and deadline timers are trusted test capabilities.

Cases execute in fixed order:

| Case | Expected offline observation |
| --- | --- |
| Fresh capture | Created and full-object verified |
| Identical retry | Precondition failed and full-object verified |
| Divergent record | Precondition failed plus verified content conflict |
| Identical competing writers | One creation, one identical verified retry |
| Divergent competing writers | One creation, one verified divergent conflict |
| BOM fidelity | Complete canonical verification including original BOM bytes |
| Missing object | Confirmed absence at that read only |
| Simulated lost acknowledgement | Suppress observed PUT success; reconcile by full GET |
| Controlled abort | Abort after dispatch; remote outcome remains unknown |

Every observation has `basis: offline-simulation` and outcome pass, fail,
inconclusive or unknown. `completed` means the case sequence completed; it does not
mean all cases passed or that infrastructure is qualified. Controlled abort is
intentionally unknown. The lost-ack case is deterministic reply suppression after
an observed success, not evidence of genuine network loss. No output certifies
historical ownership, clocks, durability, eligibility or canonical admission.

A conflict passes only with an observed precondition failure AND complete divergent
payload verification. An uncertain PUT followed by divergent GET never passes as
an established conditional conflict. Public transport errors intentionally omit raw
SDK codes: throttling, permission failure, missing bucket, redirects and network
failures remain unknown/inconclusive, never fabricated 412 or 404 observations.
There are no raw error strings, causes, headers, credentials or supplied IDs in
reports; only fixed codes, case outcomes, the manifest digest and request counters.

## Accounting, deadlines and cleanup

Every adapter call uses the sole budget wrapper. Each PUT/GET attempt is counted
before dispatch, including hidden adapter verification GETs and attempts cancelled
before dispatch. A denied attempt beyond the configured ceiling is not dispatched.
No retry loop, background poll or unwrapped transport is exposed. PUTs are allowed
only for the six known keys and exact generated payloads; GETs only for those keys
and the missing key. Supplied records cannot reach the wrapper.

The normal memory run counts 10 PUT attempts and 11 GET attempts: the last GET is
cancelled before backend dispatch. The backend sees 10 PUTs and 10 GETs. Counters
are conservative dispatch upper bounds, not billable request receipts. The existing
Slice 2 transport's maxAttempts=1 is part of any future wire-accounting argument;
an arbitrary injected implementation that secretly retries is outside the trusted
offline capability contract. No real-wire accounting has been qualified here.

The semaphore limits locally owned operations to two (or a lower manifest limit),
including GET body consumption. Each operation owns an independent controller,
linked listeners and reader. EOF, error, cancellation and abort release its reader
and slot; late response bodies are cancelled. One operation cannot cancel a sibling.
An ignored abort or an in-flight remote commit cannot be proven stopped by local
cleanup; local concurrency is not a claim about outstanding remote commits.

The elapsed execution deadline is at most 120 seconds and shortened by approval
expiry. Clock regression/failure fails closed. Execution validation and regeneration are included in the elapsed budget;
standalone pure preparation performs no execution. Slice 1 retains its earlier shared
10-second deadline, 2 MiB object bound and 4,096-chunk limit for every archive call.
Stream reads are demand driven and copied, with the same byte/chunk bounds. Run
cancellation prevents new dispatch and propagates to pending operations. Approval
consumption survives a failed run in this module instance.

There is no object deletion, overwrite, list or bucket creation capability. Retain
an exact-key manifest, including keys whose PUT outcome is unresolved. Do not delete
on failure or interpret GET 404 after uncertain PUT as permanent absence. Cleanup
requires a separately approved operator procedure, retention expiry and explicit
reconciliation; no wildcard deletion or automatic failure cleanup is authorized.

## Prerequisites for a separately approved future real run

1. Verify a dedicated private NON-PRODUCTION bucket, exact account/bucket identity,
   default jurisdiction, direct HTTPS account endpoint and region auto. Do not use
   backup credentials or assume the backup bucket grants calendar authorization.
2. Approve bucket-scoped Object Read & Write credentials, separate from administration
   and production secrets. Supply them only through a separately reviewed secure
   runner. Existing transport configuration lacks session-token support; do not
   assume temporary session credentials are compatible. Avoid SDK wire logging,
   shell history, command-line secrets or checked-in credentials.
3. Verify public access is disabled and inspect actual permissions, retention locks,
   lifecycle rules, storage class and cleanup ownership using independent operator
   evidence. A caller's non-production declaration cannot establish remote isolation.
4. Approve durable single-use authorization coordination and complete wire-level
   accounting before enabling any live execution. This slice supplies neither.
5. Approve exact synthetic keys, request/byte/concurrency ceilings, run duration,
   costs, stop rules and retention. Eight maximum objects at 2 MiB bound retained
   payloads to 16 MiB; 32 PUTs and 64 GETs bound payload transfer to 64/128 MiB.
   Standard storage avoids Infrequent Access minimum-duration/retrieval charges.
   Account-wide free-tier availability and zero cost must not be assumed.
6. Run sequential create/retry/conflict/BOM/missing checks first. Separately approved
   two-writer probes may be throttled: 429 is inconclusive, not a demonstrated 412.
   Do not issue broad concurrency bursts. Any explicit reconciliation must reuse
   the same conditional-create key and remain within the exact approved budget.
7. Treat controlled client aborts as uncertain and label injected faults separately
   from genuine network observations. Do not weaken deadlines to force a pass.
8. Keep unresolved objects until reconciled or covered by an explicitly approved
   retention/cleanup decision. Verify lock behavior separately before claiming
   protection from privileged overwrite/deletion. Administrators can remove locks.

Cloudflare references (reviewed 2026-10-17):

- [Conditional S3 operations](https://developers.cloudflare.com/r2/api/s3/extensions/)
- [Consistency and in-flight writes](https://developers.cloudflare.com/r2/reference/consistency/)
- [Same-key concurrency limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Bucket-scoped authentication](https://developers.cloudflare.com/r2/api/tokens/)
- [Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Pricing](https://developers.cloudflare.com/r2/pricing/)

## Offline verification and delivery

Run the focused qualification tests with the calendar offline preload, then the
complete existing calendar regression suite, scoped strict TypeScript and focused
ESLint. Socket connection attempts fail the new tests. Do not run a full local build.
If a verification fails, stop without committing. Stage only the five approved
Slice 3 files after all checks pass; commit, push and confirm the exact Git SHA's
successful GitHub Production deployment before any next slice. Deployment does
not enable the harness or authorize live tests. Historical admission stays inactive.
