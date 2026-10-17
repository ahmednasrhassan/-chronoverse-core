# Inactive immutable calendar archive adapter — Phase 2C2, Slice 1

Status: isolated injected-capability implementation with offline tests. There is
no R2 SDK adapter, credential/environment read, acquisition integration, runtime
caller, scheduler, route, distributed head, canonical admission or durable receipt.
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
