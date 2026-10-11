import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createEcbHistoricalAdmissionModelV1,
  ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1,
  ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1,
  ECB_HISTORICAL_PAYLOAD_ENCODING_V1,
  planEcbHistoricalAdmissionV1,
  planEcbHistoricalByteVerificationV1,
  prepareEcbHistoricalAdmissionCandidateV1,
  selectEcbHistoricalAdmissionAsKnownAtV1,
  type EcbHistoricalAdmissionCandidateV1,
  type EcbHistoricalAdmissionModelV1,
  type EcbHistoricalAdmissionPlanResultV1,
  type EcbHistoricalAdmissionPlanV1,
} from "../../catalog/ecbHistoricalAdmissionPlanning";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";

// Synthetic evidence; no claim about actual ECB history, ownership or storage.
const BASE = Date.parse("2026-09-10T12:20:00.000Z") / 1_000;

function snapshot(offset = 0, digest = "a".repeat(64), date = "2026-09-10") {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: date,
    schedule: { meetingDate: date, fetchedAt: BASE + offset - 1 },
    decision: {
      decisionDate: date,
      documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~abc123.en.html",
      contentDigest: digest,
      fetchedAt: BASE + offset,
      firstObservedAt: BASE + offset - 2,
      actualReleasedAt: null,
      rates: { depositFacility: 2, mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
    },
  }));
}

function candidate(offset = 0, digest = "a".repeat(64), date = "2026-09-10") {
  const result = prepareEcbHistoricalAdmissionCandidateV1(JSON.stringify(snapshot(offset, digest, date)));
  assert.equal(result.status, "candidate");
  if (result.status !== "candidate") throw new Error("Invalid synthetic candidate");
  return result;
}

function proposed(result: EcbHistoricalAdmissionPlanResultV1): EcbHistoricalAdmissionPlanV1 {
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") throw new Error("Expected an offline proposal");
  return result;
}

function admit(current: EcbHistoricalAdmissionModelV1, request: EcbHistoricalAdmissionCandidateV1) {
  const result = proposed(planEcbHistoricalAdmissionV1(current, request));
  assert.equal(result.status, "admitted-pending-object");
  return result.nextModel;
}

function verified(current: EcbHistoricalAdmissionModelV1, request: EcbHistoricalAdmissionCandidateV1) {
  const result = proposed(planEcbHistoricalByteVerificationV1(current,
    request.snapshot.eventSourceVersionId, request.payloadText));
  assert.equal(result.status, "verified-readable");
  return result.nextModel;
}

test("candidate hash and length describe actual, strictly encoded snapshot bytes only", () => {
  const request = candidate();
  const bytes = Buffer.from(request.payloadText, "utf8");
  assert.equal(request.encoding, ECB_HISTORICAL_PAYLOAD_ENCODING_V1);
  assert.equal(request.byteLength, bytes.length);
  assert.equal(request.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(request.snapshot, snapshot());
  assert.equal(request.projection.knownAt, request.snapshot.knownAt);
  assert.equal(request.status, "candidate");
  assert.equal(request.ownershipVerified, false);
  assert.equal(request.objectVerified, false);
  assert.equal(request.projection.ownershipVerified, false);
  assert.equal(request.projection.objectVerified, false);
});

test("projection and forged byte metadata cannot become admission or verification evidence", () => {
  const request = candidate();
  const empty = createEcbHistoricalAdmissionModelV1();
  for (const input of [request.projection, { ...request },
    { ...request, sha256: "0".repeat(64) }, { ...request, byteLength: request.byteLength + 1 },
    { ...request, ownershipVerified: true, objectVerified: true }]) {
    assert.equal(planEcbHistoricalAdmissionV1(empty, input).status, "verification-failed");
  }
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([request], BASE).status, "verification-failed");
  assert.equal(planEcbHistoricalAdmissionV1({ ...empty }, request).status, "verification-failed");
});

test("duplicate requests are idempotent and never promote pending or failed entries", () => {
  const request = candidate();
  const pending = admit(createEcbHistoricalAdmissionModelV1(), request);
  const retry = proposed(planEcbHistoricalAdmissionV1(pending, candidate()));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.nextModel, pending);
  assert.equal(retry.status, "admitted-pending-object");
  const ready = verified(pending, request);
  const readyRetry = proposed(planEcbHistoricalAdmissionV1(ready, candidate()));
  assert.equal(readyRetry.nextModel, ready);
  assert.equal(readyRetry.duplicate, true);
  assert.equal(readyRetry.status, "verified-readable");
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    request.snapshot.eventSourceVersionId, null)).nextModel;
  const failedRetry = proposed(planEcbHistoricalAdmissionV1(failed, candidate()));
  assert.equal(failedRetry.status, "verification-failed");
  assert.equal(failedRetry.nextModel, failed);
  assert.equal(failedRetry.duplicate, true);
  for (const state of [pending, failed, ready]) {
    const retry = proposed(planEcbHistoricalAdmissionV1(state, candidate()));
    assert.equal(retry.expectedModel, state);
    assert.equal(retry.nextModel.revision, state.revision);
    assert.equal(retry.nextModel.entries[0], state.entries[0]);
  }
});

test("same semantic different-byte proposals reject without invalidating any accepted entry", () => {
  const original = candidate();
  const recaptured = candidate(1);
  assert.equal(original.snapshot.eventSourceVersionId, recaptured.snapshot.eventSourceVersionId);
  assert.notEqual(original.payloadText, recaptured.payloadText);
  assert.notEqual(original.sha256, recaptured.sha256);
  const pending = admit(createEcbHistoricalAdmissionModelV1(), original);
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    original.snapshot.eventSourceVersionId, null)).nextModel;
  const ready = verified(pending, original);
  // Intentional change: a rejected proposal is not evidence of accepted-byte corruption.
  for (const state of [pending, failed, ready]) {
    const before = selectEcbHistoricalAdmissionAsKnownAtV1([state], BASE);
    for (const conflicting of [recaptured, candidate(-1)]) {
      const result = proposed(planEcbHistoricalAdmissionV1(state, conflicting));
      assert.equal(result.status, "integrity-conflict");
      assert.equal(result.duplicate, false);
      assert.equal(result.expectedModel, state);
      assert.equal(result.nextModel, state);
      assert.equal(result.nextModel.revision, state.revision);
      assert.equal(result.nextModel.entries[0], state.entries[0]);
      assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([result.nextModel], BASE), before);
      assert.equal(proposed(planEcbHistoricalAdmissionV1(state, original)).status, state.entries[0]!.status);
    }
  }
});

test("semantic conflicts, stale captures and event mismatch follow authoritative memory admission", () => {
  const original = candidate();
  const current = admit(createEcbHistoricalAdmissionModelV1(), original);
  const conflict = proposed(planEcbHistoricalAdmissionV1(current, candidate(0, "b".repeat(64))));
  assert.equal(conflict.status, "chronology-conflict");
  assert.equal(conflict.nextModel, current);
  assert.equal(proposed(planEcbHistoricalAdmissionV1(current, candidate(-1, "b".repeat(64)))).status, "stale");
  assert.equal(proposed(planEcbHistoricalAdmissionV1(current,
    candidate(1, "b".repeat(64), "2026-09-11"))).status, "event-id-mismatch");
  const newer = candidate(10, "b".repeat(64));
  assert.equal(admit(current, newer).entries[1]!.candidate.snapshot.knownAt, newer.snapshot.knownAt);
});

test("pending and failed latest eligible versions block older verified fallback", () => {
  const original = candidate();
  const newer = candidate(10, "b".repeat(64));
  const oldReady = verified(admit(createEcbHistoricalAdmissionModelV1(), original), original);
  const pending = admit(oldReady, newer);
  const earlier = selectEcbHistoricalAdmissionAsKnownAtV1([pending], BASE + 9);
  assert.equal(earlier.status, "verified-readable");
  if (earlier.status === "verified-readable") assert.deepEqual(earlier.selectedSnapshot, original.snapshot);
  const latest = selectEcbHistoricalAdmissionAsKnownAtV1([pending], BASE + 10);
  assert.equal(latest.status, "admitted-pending-object");
  assert.equal(latest.readable, false);
  assert.equal("selectedSnapshot" in latest, false);
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    newer.snapshot.eventSourceVersionId, undefined)).nextModel;
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([failed], BASE + 10).status, "verification-failed");
  const repairedBytes = verified(failed, newer);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([repairedBytes], BASE + 10).status, "verified-readable");
});

test("pending verification distinguishes invalid input from mismatched canonical bytes", () => {
  const request = candidate();
  const pending = admit(createEcbHistoricalAdmissionModelV1(), request);
  for (const text of [candidate(1).payloadText, candidate(0, "b".repeat(64)).payloadText]) {
    const result = proposed(planEcbHistoricalByteVerificationV1(pending,
      request.snapshot.eventSourceVersionId, text));
    assert.equal(result.status, "integrity-conflict");
    assert.notEqual(result.nextModel, pending);
    assert.equal(result.nextModel.entries[0]!.status, "verification-failed");
    assert.equal(result.nextModel.entries[0]!.candidate, request);
    assert.equal(result.duplicate, false);
    assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([result.nextModel], BASE).readable, false);
  }
  // Invalid canonical encoding remains fail-closed, but is not a byte-corruption claim.
  for (const input of [null, {}, [], new Uint8Array(1), "{", request.payloadText + " ",
    request.payloadText.replace("2.15", "2.25"), "x".repeat(ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 + 1)]) {
    const result = proposed(planEcbHistoricalByteVerificationV1(pending,
      request.snapshot.eventSourceVersionId, input));
    assert.equal(result.status, "verification-failed");
    assert.equal(result.nextModel.entries[0]!.status, "verification-failed");
    assert.equal(result.nextModel.entries[0]!.candidate, request);
    assert.equal(result.duplicate, false);
  }
});

test("bad verification attempts cannot downgrade verified evidence or its readable snapshot", () => {
  const request = candidate();
  const ready = verified(admit(createEcbHistoricalAdmissionModelV1(), request), request);
  const before = selectEcbHistoricalAdmissionAsKnownAtV1([ready], BASE);
  let calls = 0;
  const trap = () => { calls += 1; throw "synthetic-verification-secret"; };
  const hostile = Object.defineProperty({}, "toString", { get: trap });
  const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const invalid = [null, undefined, {}, [], new String(request.payloadText), new Uint8Array(1),
    "{", request.payloadText + " ", request.payloadText.replace("2.15", "2.25"),
    request.payloadText + "\ud800", "x".repeat(ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 + 1),
    JSON.stringify("é".repeat(40_000)), hostile, proxy, revoked.proxy];
  const mismatch = [candidate(1).payloadText, candidate(0, "b".repeat(64)).payloadText];
  for (const [inputs, status] of [[invalid, "verification-failed"], [mismatch, "integrity-conflict"]] as const) {
    for (const input of inputs) {
      const result = proposed(planEcbHistoricalByteVerificationV1(ready,
        request.snapshot.eventSourceVersionId, input));
      assert.equal(result.status, status);
      assert.equal(result.duplicate, false);
      assert.equal(result.expectedModel, ready);
      assert.equal(result.nextModel, ready);
      assert.equal(result.nextModel.revision, ready.revision);
      assert.equal(result.nextModel.entries[0], ready.entries[0]);
      assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([result.nextModel], BASE), before);
      assert.equal(result.ownershipVerified, false);
      assert.equal(result.objectVerified, false);
    }
  }
  for (const selector of [null, proxy, "unknown-version"]) {
    const result = proposed(planEcbHistoricalByteVerificationV1(ready, selector, request.payloadText));
    assert.equal(result.status, "verification-failed");
    assert.equal(result.nextModel, ready);
  }
  const exactRetry = proposed(planEcbHistoricalByteVerificationV1(ready,
    request.snapshot.eventSourceVersionId, request.payloadText));
  assert.equal(exactRetry.status, "verified-readable");
  assert.equal(exactRetry.duplicate, true);
  assert.equal(exactRetry.nextModel, ready);
  assert.equal(calls, 0);
});

test("failed-state recovery requires exact bytes; repeated failed attempts are model no-ops", () => {
  const request = candidate();
  const pending = admit(createEcbHistoricalAdmissionModelV1(), request);
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    request.snapshot.eventSourceVersionId, null)).nextModel;
  const mismatchingBytes = candidate(1).payloadText;
  for (const input of [null, {}, "{", request.payloadText + " ", mismatchingBytes]) {
    const result = proposed(planEcbHistoricalByteVerificationV1(failed,
      request.snapshot.eventSourceVersionId, input));
    assert.equal(result.status, input === mismatchingBytes ? "integrity-conflict" : "verification-failed");
    assert.equal(result.duplicate, false);
    assert.equal(result.expectedModel, failed);
    assert.equal(result.nextModel, failed);
    assert.equal(result.nextModel.revision, failed.revision);
    assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([result.nextModel], BASE).readable, false);
  }
  const recovered = proposed(planEcbHistoricalByteVerificationV1(failed,
    request.snapshot.eventSourceVersionId, request.payloadText));
  assert.equal(recovered.status, "verified-readable");
  assert.equal(recovered.duplicate, false);
  assert.equal(recovered.nextModel.revision, failed.revision + 1);
  assert.equal(recovered.nextModel.entries[0]!.candidate, request);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([recovered.nextModel], BASE).status, "verified-readable");
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([failed], BASE).status, "verification-failed");
});

test("as-of boundaries are inclusive, explicitly scoped, and never use release/effective time", () => {
  const request = candidate();
  const ready = verified(admit(createEcbHistoricalAdmissionModelV1(), request), request);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([ready], BASE - 1).status, "unavailable");
  const result = selectEcbHistoricalAdmissionAsKnownAtV1([ready], BASE);
  assert.equal(result.status, "verified-readable");
  assert.equal(result.coverage, "provided-history-only");
  assert.equal(result.mode, "offline-model-only");
  assert.equal(result.ownershipVerified, false);
  assert.equal(result.objectVerified, false);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([], BASE).status, "unavailable");
  for (const asOf of [-1, NaN, Infinity, BASE + 0.5, "2026-09-10T12:20:00Z", null]) {
    assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([ready], asOf).status, "verification-failed");
  }
});

test("identity is retained across schedule revisions; knownAt is supplied only by the parser", () => {
  const revised = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: "2026-09-10", schedule: { meetingDate: "2026-09-11", fetchedAt: BASE },
  });
  const captured = buildEcbMonetaryPolicyEventSnapshotV1(revised);
  const request = prepareEcbHistoricalAdmissionCandidateV1(JSON.stringify(captured));
  assert.equal(request.status, "candidate");
  if (request.status === "candidate") {
    assert.equal(request.snapshot.canonicalEventId, revised.canonicalEventId);
    assert.equal(request.snapshot.knownAt, BASE);
  }
  for (const knownAt of [BASE - 2, BASE + 1, Date.parse(revised.schedule.scheduledAt) / 1_000]) {
    assert.equal(prepareEcbHistoricalAdmissionCandidateV1(JSON.stringify({ ...captured, knownAt })).status,
      "verification-failed");
  }
});

test("conflicting provided branches fail closed independently of their order", () => {
  const empty = createEcbHistoricalAdmissionModelV1();
  const leftRequest = candidate();
  const rightRequest = candidate(0, "b".repeat(64));
  const left = verified(admit(empty, leftRequest), leftRequest);
  const right = verified(admit(empty, rightRequest), rightRequest);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([left, left], BASE).status, "verified-readable");
  const conflict = selectEcbHistoricalAdmissionAsKnownAtV1([left, right], BASE);
  assert.equal(conflict.status, "integrity-conflict");
  assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([right, left], BASE), conflict);
  const recaptured = candidate(1);
  const alternate = verified(admit(empty, recaptured), recaptured);
  // Intentional change: different capture knowledge is ambiguity, not corruption.
  const ambiguous = selectEcbHistoricalAdmissionAsKnownAtV1([left, alternate], BASE + 1);
  assert.equal(ambiguous.status, "ambiguous-history");
  if (ambiguous.status === "ambiguous-history") assert.equal(ambiguous.reason, "AMBIGUOUS_HISTORY");
  assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([alternate, left], BASE + 1), ambiguous);
  const differentEvent = admit(empty, candidate(0, "b".repeat(64), "2026-09-11"));
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([left, differentEvent], BASE).status, "verification-failed");
});

test("identical selected bytes retain conservative readiness across branches", () => {
  const request = candidate();
  const pending = admit(createEcbHistoricalAdmissionModelV1(), request);
  const ready = verified(pending, request);
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    request.snapshot.eventSourceVersionId, null)).nextModel;
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([ready, pending], BASE).status, "admitted-pending-object");
  const blocked = selectEcbHistoricalAdmissionAsKnownAtV1([ready, failed, pending], BASE);
  assert.equal(blocked.status, "verification-failed");
  for (const order of [[ready, failed, pending], [ready, pending, failed], [failed, ready, pending],
    [failed, pending, ready], [pending, ready, failed], [pending, failed, ready]]) {
    assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1(order, BASE), blocked);
  }
});

test("equal knowledge with divergent bytes is distinct from differing-knowledge ambiguity", () => {
  const original = candidate();
  const raw = structuredClone(snapshot());
  Object.assign(raw.event.schedule, { fetchedAt: BASE - 5 });
  const alteredCapture = prepareEcbHistoricalAdmissionCandidateV1(JSON.stringify(raw));
  assert.equal(alteredCapture.status, "candidate");
  if (alteredCapture.status !== "candidate") throw new Error("Invalid synthetic capture");
  assert.equal(alteredCapture.snapshot.knownAt, original.snapshot.knownAt);
  assert.equal(alteredCapture.snapshot.eventSourceVersionId, original.snapshot.eventSourceVersionId);
  assert.notEqual(alteredCapture.payloadText, original.payloadText);
  const empty = createEcbHistoricalAdmissionModelV1();
  const ready = verified(admit(empty, original), original);
  const pendingAlternative = admit(empty, alteredCapture);
  const failedAlternative = proposed(planEcbHistoricalByteVerificationV1(pendingAlternative,
    alteredCapture.snapshot.eventSourceVersionId, null)).nextModel;
  for (const alternative of [pendingAlternative, failedAlternative]) {
    const result = selectEcbHistoricalAdmissionAsKnownAtV1([ready, alternative], BASE);
    assert.equal(result.status, "integrity-conflict");
    assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([alternative, ready], BASE), result);
  }
  const newer = candidate(10, "b".repeat(64));
  const newerPending = admit(empty, newer);
  const newerFailed = proposed(planEcbHistoricalByteVerificationV1(newerPending,
    newer.snapshot.eventSourceVersionId, null)).nextModel;
  for (const alternative of [newerPending, newerFailed, verified(newerPending, newer)]) {
    const result = selectEcbHistoricalAdmissionAsKnownAtV1([ready, alternative], BASE + 10);
    assert.equal(result.status, "ambiguous-history");
    if (result.status === "ambiguous-history") assert.equal(result.reason, "AMBIGUOUS_HISTORY");
    assert.equal(result.readable, false);
    assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([alternative, ready], BASE + 10), result);
  }
});

test("absence in one supplied branch cannot prove compatibility with selected evidence", () => {
  const empty = createEcbHistoricalAdmissionModelV1();
  const request = candidate();
  const ready = verified(admit(empty, request), request);
  const newer = admit(empty, candidate(10, "b".repeat(64)));
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([empty, ready], BASE - 1).status, "unavailable");
  for (const absentBranch of [empty, newer]) {
    const result = selectEcbHistoricalAdmissionAsKnownAtV1([ready, absentBranch], BASE);
    assert.equal(result.status, "ambiguous-history");
    assert.deepEqual(selectEcbHistoricalAdmissionAsKnownAtV1([absentBranch, ready], BASE), result);
  }
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([empty, empty], BASE).status, "unavailable");
});

test("malformed and noncanonical payloads fail closed without repair or caller execution", () => {
  const payload = candidate().payloadText;
  const forged = structuredClone(snapshot());
  Object.assign(forged.event, { sourceVersionId: "forged" });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  let calls = 0;
  const executable = { toString() { calls += 1; throw "synthetic-secret"; } };
  for (const input of [null, undefined, false, 1, [], cyclic, executable,
    new String(payload), "", "{", "[]", "null", payload + " ",
    payload.replace('{"schemaVersion":', '{"knownAt":0,"schemaVersion":'),
    JSON.stringify({ ...snapshot(), extra: "unrecognized" }), JSON.stringify(forged),
    payload + "\ud800", "x".repeat(ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 + 1),
    JSON.stringify("é".repeat(40_000))]) {
    assert.equal(prepareEcbHistoricalAdmissionCandidateV1(input).status, "verification-failed");
  }
  assert.equal(calls, 0);
});

test("hostile model arrays and handles cannot execute getters or Proxy traps", () => {
  const empty = createEcbHistoricalAdmissionModelV1();
  const request = candidate();
  let calls = 0;
  const trap = () => { calls += 1; throw "synthetic-secret"; };
  const proxy = new Proxy(empty, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  assert.equal(planEcbHistoricalAdmissionV1(proxy, request).status, "verification-failed");
  assert.equal(planEcbHistoricalAdmissionV1(empty, new Proxy(request, { get: trap })).status, "verification-failed");
  const array = [empty];
  Object.defineProperty(array, "0", { get: trap });
  for (const supplied of [null, {}, [proxy], array, new Array(1), new Array(4_294_967_295),
    new Proxy([empty], { get: trap, ownKeys: trap, getPrototypeOf: trap })]) {
    assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1(supplied, BASE).status, "verification-failed");
  }
  assert.equal(calls, 0);
});

test("all returned evidence and proposed state are frozen without mutable byte aliases", () => {
  const request = candidate();
  const result = proposed(planEcbHistoricalAdmissionV1(createEcbHistoricalAdmissionModelV1(), request));
  for (const object of [request, request.projection, request.snapshot, request.snapshot.event,
    request.snapshot.event.schedule, request.snapshot.event.decision!, request.snapshot.event.decision!.rates!,
    result, result.nextModel, result.nextModel.entries, result.nextModel.entries[0]!]) {
    assert.equal(Object.isFrozen(object), true);
  }
  assert.equal(Reflect.set(request, "sha256", "0".repeat(64)), false);
  assert.equal(Reflect.set(request.snapshot.event.schedule, "fetchedAt", 0), false);
  assert.equal(Reflect.set(result.nextModel.entries[0]!, "status", "verified-readable"), false);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([result.nextModel], BASE).status, "admitted-pending-object");
});

test("simulated concurrent planning needs a base precondition; this proves no database atomicity", () => {
  let head = createEcbHistoricalAdmissionModelV1();
  const left = proposed(planEcbHistoricalAdmissionV1(head, candidate()));
  const right = proposed(planEcbHistoricalAdmissionV1(head, candidate(0, "b".repeat(64))));
  assert.equal(left.expectedModel, right.expectedModel);
  assert.equal(left.nextModel.revision, right.nextModel.revision);
  // Test-local serial simulation only. There is no coordinator or production CAS.
  const applyInSimulation = (proposal: EcbHistoricalAdmissionPlanV1) => {
    if (head !== proposal.expectedModel) return false;
    head = proposal.nextModel;
    return true;
  };
  assert.equal(applyInSimulation(left), true);
  assert.equal(applyInSimulation(right), false);
  assert.equal(proposed(planEcbHistoricalAdmissionV1(head, candidate(0, "b".repeat(64)))).status,
    "chronology-conflict");
  const duplicate = proposed(planEcbHistoricalAdmissionV1(head, candidate()));
  assert.equal(duplicate.duplicate, true);
  assert.equal(applyInSimulation(duplicate), true);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1([left.nextModel, right.nextModel], BASE).status,
    "integrity-conflict");
});

test("payload, entry and branch bounds fail closed", () => {
  let history = createEcbHistoricalAdmissionModelV1();
  for (let index = 0; index < ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1; index += 1) {
    history = admit(history, candidate(index, index.toString(16).padStart(64, "0")));
  }
  const overflow = planEcbHistoricalAdmissionV1(history,
    candidate(ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1, "f".repeat(64)));
  assert.equal(overflow.status, "verification-failed");
  assert.equal(history.entries.length, ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1);
  assert.equal(selectEcbHistoricalAdmissionAsKnownAtV1(
    new Array(ECB_HISTORICAL_MAX_MODEL_ENTRIES_V1 + 1).fill(history), BASE).status, "verification-failed");
  const deepJson = "[".repeat(4_096) + "0" + "]".repeat(4_096);
  assert.equal(prepareEcbHistoricalAdmissionCandidateV1(deepJson).status, "verification-failed");
});

test("result discriminants separate invalid requests, entry failures and valid read boundaries", () => {
  const invalidRequest = planEcbHistoricalAdmissionV1({}, candidate());
  assert.equal(invalidRequest.kind, "invalid-request");
  if (invalidRequest.kind === "invalid-request") assert.equal(invalidRequest.reason, "INVALID_INPUT");
  const request = candidate();
  const pending = admit(createEcbHistoricalAdmissionModelV1(), request);
  const failed = proposed(planEcbHistoricalByteVerificationV1(pending,
    request.snapshot.eventSourceVersionId, null));
  assert.equal(failed.kind, "plan");
  const invalidBoundary = selectEcbHistoricalAdmissionAsKnownAtV1([pending], null);
  assert.equal(invalidBoundary.asOf, null);
  if (invalidBoundary.status === "verification-failed") assert.equal(invalidBoundary.reason, "INVALID_AS_OF");
  const unreadable = selectEcbHistoricalAdmissionAsKnownAtV1([failed.nextModel], BASE);
  assert.equal(unreadable.asOf, BASE);
  if (unreadable.status === "verification-failed") assert.equal(unreadable.reason, "ENTRY_VERIFICATION_FAILED");
  const readable = selectEcbHistoricalAdmissionAsKnownAtV1([verified(pending, request)], BASE);
  if (readable.status !== "verified-readable") throw new Error("Expected byte-verified synthetic state");
  const validBoundary: number = readable.asOf;
  assert.equal(validBoundary, BASE);
});
