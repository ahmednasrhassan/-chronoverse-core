# Inactive immutable calendar archive — Phase 2C2, Slices 1 and 2

Status: isolated injected-capability implementation and optional inactive R2 SDK
transport with offline tests. There is no application environment/credential loader,
acquisition integration, runtime caller, scheduler, route, distributed head,
canonical admission or durable receipt.
Deploying this module does not activate archive operations. The existing
[Phase 2C1 contract](./CAPTURE_PERSISTENCE.md) remains unchanged.

## Record, serialization and identity

`prepareCalendarArchiveObjectV1` and the adapter both accept complete records as
unknown data. The exported Phase 2C1 `readCalendarCaptureRecordV1` retains the same
validator used by offline journal append/recovery: passive bounded snapshot,
original response-byte verification, complete extraction/normalization rebuild,
all event hashes and exact complete-record comparison. No supplied record digest
or normalized event is independently trusted. Validation completes before storage
capabilities are invoked. Original evidence, including a delivered UTF-8 BOM,
stays in the record's canonical base64 chunks. The captured clocks, uncertainty
and offline-only persistence descriptions are never rewritten.

`calendar-immutable-archive-v1` envelopes contain exactly `schemaVersion`,
`namespace`, `objectKey` and the complete `record`. Serialization is UTF-8 JSON
with recursively sorted object keys and preserved array order, without whitespace
or a JSON BOM. `payloadSha256` hashes the whole envelope's bytes; `recordSha256`
continues to hash the existing Phase 2C1 record excluding its own digest. Neither
digest is a signature. No digest is inserted into its own hash input.

The fixed namespace is `chronoverse:calendar:capture:v1`. Keys are
`calendar/captures/v1/<identity-sha256>.json`, where identity-sha256 hashes the
canonical JSON tuple `[namespace, "capture-identity", captureId]`. These capture
IDs are archive-wide, including across publishers: reusing an ID for a different
document/content conflicts. Different IDs can retain the same source evidence.
Identity excludes record hashes, attempt clocks, delivery clocks and dates.
This is a calendar-specific namespace; no existing backup key convention changes.
A future storage adapter must isolate its configured environment/destination.

## Conditional create and full verification

Construction performs no I/O. Each validated `archive` call with a working
deadline issues one conditional PUT (`If-None-Match: *`) and at most one
authenticated direct GET.
The transport is a trusted injected capability: it must implement atomic
create-only semantics, full authenticated reads and native stream behavior.
There is no default transport or self-asserted response authentication flag.

PUT 200 observes committed creation. PUT 412 observes only failed precondition.
Any thrown or unsupported PUT response observes an unknown write outcome. Every
case requires GET and complete payload verification before returning `verified`.
Read metadata, ETag, content length and storage timestamps are never evidence.
Verification uses fatal UTF-8 decoding, closed envelope parsing, full record
revalidation, canonical byte equality and both record/payload digest comparison.
Canonical-only equality rejects duplicate JSON keys, alternate encodings, extra
fields, whitespace and a JSON BOM. Malformed storage fails closed; a different
valid stored record returns conflict. There is no overwrite, delete or repair.

GET 404 following an uncertain PUT returns `outcome-unknown`. After an observed
200/412 it returns `verification-unavailable`, never successful verification or
permanent absence. A subsequent explicit call safely repeats the same conditional
create and verification. An earlier request may still commit after client abort
or a negative read; cancellation cannot prove server-side non-commitment. The
adapter never retries automatically, switches keys, or returns a prior result
from process-local state. Independent adapters can reconcile through the store.

## Bounds and observations

Serialized envelopes are capped at 2 MiB; Phase 2C1's 512 KiB evidence limit and
passive-data limits also apply. GET reads accept at most 4096 chunks and 2 MiB
total, count actual streamed bytes, copy chunks, and never call an unbounded body
collector. A 10000 ms shared deadline covers PUT, GET, streaming, stored validation
and final delivery after bounded local preparation. Elapsed-time checks reject
late results even when timer dispatch is delayed. Deadline races return without
waiting for stalled transports; signals abort, pending/late read bodies are
cancelled best effort, and late PUT completion cannot trigger another GET.
Deadline/elapsed clocks are trusted resource-control capabilities only. They
neither timestamp evidence nor certify wall-clock accuracy. Synchronous parsing
cannot be preempted; its input is bounded and late completion is rejected.

Results contain only scope `injected-archive-only`, PUT observations, sanitized
failure reasons, or verified object identity/digests. A verified retry says only
that equal bytes were read during that operation. It supplies no timestamp,
qualification, persistence receipt, complete-history proof, freshness, ownership
or historical admission. Even a successful archive leaves canonical selection
unavailable. Full-chain CAS/revision checks remain the offline journal's concern;
individual archive validation cannot prove predecessor presence or completeness.

Real R2 atomicity/authentication, SDK behavior, credential scopes, retention,
locks, lifecycle interactions and protection against privileged overwrite/delete
are unqualified. A malicious transport can lie; this module cannot authenticate
its injected capabilities or the original publisher. Hash consistency cannot
authenticate caller-forged observations. Live transport qualification and durable
receipts require separately approved later slices.

## Focused verification

Synthetic tests cover deterministic identity/serialization, both publishers,
original-byte/BOM fidelity, invalid records before transport, independent
concurrent writers, identical retries/conflicts, uncertain writes, negative reads
and late commits, corrupt and noncanonical JSON, bounded/stalled/error streams,
deadline cleanup, metadata forgery, detached mutations and historical refusal.

```powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/captureArchive.test.ts
```

There is no activation step in this slice.

## Slice 2: inactive default-jurisdiction R2 transport

`createR2CalendarCaptureArchiveTransportV1` returns the existing injected interface.
It is never constructed by a production caller. Import and factory construction
perform no SDK sends, storage operations or credential-provider lookup. Each
explicit transport operation constructs its own SDK client lazily. Configuration
must be supplied explicitly; there is no default bucket or environment loader.
The installed S3 SDK and existing fast-xml-parser are reused without dependencies
being added. The Slice 1 implementation and its result contract remain unchanged.

`parseR2CalendarArchiveConfigV1` accepts only closed passive data with schema
`calendar-r2-archive-config-v1`, a 32-hex-character account ID, nonempty printable
ASCII credentials (access ID at most 256 characters, secret at most 512),
jurisdiction `default`, and an explicit bucket object containing `name`,
`purpose: dedicated-calendar-capture-archive`, and `environment: non-production`.
Bucket names use 3–63 lowercase alphanumeric/hyphen characters, starting and ending
alphanumeric. The existing backup bucket is rejected. Supplied endpoints/regions,
missing fields, accessors, proxies and unsupported jurisdictions fail closed.
The parser detaches and freezes configuration, derives the account's direct HTTPS
R2 endpoint and selects region `auto`. Declarations do not verify that the bucket
exists, is dedicated/non-production, or has suitable permissions and retention.
No bucket name or credential is invented as a runtime default.

PUT enforces the exact `calendar/captures/v1/<64-lowercase-hex>.json` key pattern,
copies bounded nonempty bytes, and sends exact ContentLength, JSON content type
and `IfNoneMatch: *`. GET uses a signed full-object command for the same configured
bucket/key. Only observed PUT 200 or an SDK service exception with status 412 and
code PreconditionFailed map to 200/412. Only status 404 plus SDK NoSuchKey maps to
absence. Other service codes, permission failures, missing buckets, redirects,
unexpected statuses, network errors and malformed responses are sanitized errors.
Aborts/timeouts never assert that a write failed to commit. Slice 1 still requires
complete GET verification after PUT and preserves uncertain negative reads.

Clients use maxAttempts 1, standard retry/default modes, required-only request and
response checksum settings, no region redirects, no Expect: 100-continue, and
explicit credentials/endpoint/region. Node HTTP options set 2000 ms connection,
5000 ms inactivity and 10000 ms request timeouts with throwOnRequestTimeout true.
An operation abort deadline also bounds header/body stalls. Parent cancellation
is propagated to SDK sends; Slice 1's earlier shared 10000 ms deadline remains
authoritative across PUT and GET, rather than restarting at GET.

SDK-collected XML/error/discarded response bodies are capped at 64 KiB and 4096
collected chunks. Nonempty collected bodies must be valid UTF-8 XML; DTD/entity
declarations are rejected before SDK parsing. PUT 200 requires an empty response
body. A response middleware retains raw Node bodies for cleanup even if SDK
deserialization fails or a response arrives after abort. No raw SDK exception,
service message, headers, response URL or credential is attached to public errors.

Successful GET bodies must be unencoded JSON, full-object status 200, with no
Content-Range. They stay streamed. Node-to-Web conversion specifies a byte-size
strategy and 64 KiB queue threshold; an outer demand-driven stream copies bytes
and enforces the existing 2 MiB/4096-chunk limits. Advertised ContentLength is
checked when present, including against actual EOF, but never replaces counting
and canonical digest verification. Incomplete HTTP bodies reject. Backpressure
thresholds allow an upstream chunk/buffer in addition to the Web queue; they are
not a process-wide memory or concurrency limit. No body-to-string/array collector
is used for successful GETs.

Clients and bodies are owned per operation. GET ownership transfers to the Web
stream until EOF, cancellation, failure or abort. Cleanup destroys bodies/client,
cancels timers and removes the parent abort listener. A caller must consume or
cancel the body; the operation deadline bounds abandonment. Concurrent operations
cannot destroy a sibling's handler. Injected test handlers must be independently
owned; reuse within a transport is rejected. Cleanup does not prove remote abort.

New tests use synthetic credentials, real SDK signing/serialization and mocked
HTTP handlers; a socket-connect guard rejects accidental network access. They
cover configuration isolation, status/error mappings, retry count, bounded SDK
collection, stream backpressure/truncation/stalls/abort, concurrent ownership,
late writes, BOM fidelity, Slice 1 reconciliation and continued historical refusal.
No real R2 request or remote qualification is part of these tests. Actual SDK/R2
interoperability, remote atomicity, credentials, bucket isolation, retention,
locks and lifecycle protection still require separately approved non-production
integration tests. No production wiring, admission, receipt or head update exists.

```powershell
node --import ./scripts/tests/calendar-offline-preload.mjs --test src/lib/markets/tests/calendar/r2CaptureArchiveConfig.test.ts src/lib/markets/tests/calendar/r2CaptureArchiveTransport.test.ts
```

## Slice 3: inactive offline qualification harness

`r2CaptureArchiveQualification.ts` adds pure deterministic synthetic preparation,
a versioned execution manifest and an explicitly approved offline simulation runner.
No SDK client, credentials, environment loader, default transport or application
caller is introduced. The existing adapter, transport and configuration stay unchanged.

Live approvals always fail closed before transport construction because durable,
cross-process approval/replay coordination is unavailable. Offline approvals bind
account, dedicated non-production bucket, run ID and the complete manifest digest;
expiry and bounded process-local single use are enforced without claiming durable
replay protection. Failed or cancelled runs consume their offline approval.

All adapter PUTs and GETs pass through a manifest-bound budget wrapper, including
verification GETs and cancelled attempts. Limits are at most 8 writable keys,
32 PUT attempts, 64 GET attempts, concurrency 2 and 120 seconds elapsed execution.
The fixed suite writes six keys, observes one additional GET-only key, and accepts
no externally supplied capture records. Original synthetic bytes include a BOM case.
Slice 1's shared 10-second deadline, 2 MiB and 4,096-chunk limits remain authoritative.

The nine cases cover creation, retry, divergence, identical/divergent competing
writers, BOM fidelity, missing object, simulated lost acknowledgement and controlled
abort. Reports contain only sanitized offline observations; generic errors cannot
qualify a conditional conflict. Controlled abort remains unknown. No automatic
object deletion, retention configuration, durable receipt, admission or head update
is added. No real R2 request is part of implementation or offline verification.

See [R2_ARCHIVE_QUALIFICATION.md](./R2_ARCHIVE_QUALIFICATION.md) for the exact manifest,
approval limitations, accounting boundary, live prerequisites and separately approved
retention/reconciliation/cleanup procedure. Actual R2 interoperability, permissions,
retention and remote behavior remain unqualified. Calendar archive admission and
historical admission remain inactive.
