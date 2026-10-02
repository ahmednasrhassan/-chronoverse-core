import assert from "node:assert/strict";
import { deriveEventClockV1, eventPhaseWithoutVerifiedReleaseV1,
  eventPhaseWithVerifiedReleaseV1, type EventPhaseV1 } from "../../events/eventClock";

const ANCHOR = "2026-09-10T12:15:00.000Z";
const anchorMs = Date.parse(ANCHOR);
const boundaries: readonly [number, EventPhaseV1, EventPhaseV1][] = [
  [-24 * 60 * 60_000, "pre-event", "t-24h"],
  [-60 * 60_000, "t-24h", "t-1h"],
  [-15 * 60_000, "t-1h", "t-15m"],
  [0, "t-15m", "release"],
  [5 * 60_000, "release", "post-5m"],
  [15 * 60_000, "post-5m", "post-15m"],
  [30 * 60_000, "post-15m", "post-30m"],
  [60 * 60_000, "post-30m", "post-1h"],
];
function at(ms: number) {
  return deriveEventClockV1({
    scheduledAt: ANCHOR, actualReleasedAt: ms < anchorMs ? null : ANCHOR,
    evaluatedAt: new Date(ms).toISOString(),
  });
}
for (const [offset, before, reached] of boundaries) {
  const boundary = anchorMs + offset;
  assert.equal(at(boundary - 1).phase, before, `${reached}: immediately before`);
  assert.equal(at(boundary).phase, reached, `${reached}: exact boundary`);
  assert.equal(at(boundary + 1).phase, reached, `${reached}: immediately after`);
}
assert.deepEqual(at(anchorMs).schedule, {
  t24hAt: "2026-09-09T12:15:00.000Z", t1hAt: "2026-09-10T11:15:00.000Z",
  t15mAt: "2026-09-10T12:00:00.000Z", scheduledAt: ANCHOR,
});
assert.deepEqual(at(anchorMs).release, {
  releaseAt: ANCHOR, post5mAt: "2026-09-10T12:20:00.000Z",
  post15mAt: "2026-09-10T12:30:00.000Z", post30mAt: "2026-09-10T12:45:00.000Z",
  post1hAt: "2026-09-10T13:15:00.000Z",
});
const unverified = deriveEventClockV1({ scheduledAt: ANCHOR, actualReleasedAt: null,
  evaluatedAt: "2026-09-11T12:15:00Z" });
assert.equal(unverified.phase, "release-time-unverified");
assert.equal(unverified.release, null);
assert.equal(deriveEventClockV1({ scheduledAt: ANCHOR,
  actualReleasedAt: "2026-09-10T12:25:00Z", evaluatedAt: "2026-09-10T12:30:00Z" }).phase, "post-5m");
assert.deepEqual(deriveEventClockV1({ scheduledAt: "2026-09-10T14:15:00+02:00",
  actualReleasedAt: "2026-09-10T08:15:00-04:00", evaluatedAt: "2026-09-10T15:15:00+03:00" }), at(anchorMs));
for (const invalid of ["garbage", "2026-09-10", "2026-09-10T12:15:00",
  "2026-02-30T12:15:00Z", "2026-09-10T24:00:00Z", "2026-09-10T12:15:00+25:00"]) {
  for (const field of ["scheduledAt", "actualReleasedAt", "evaluatedAt"] as const) {
    assert.throws(() => deriveEventClockV1({ scheduledAt: ANCHOR, actualReleasedAt: ANCHOR,
      evaluatedAt: ANCHOR, [field]: invalid }), TypeError);
  }
}
assert.throws(() => deriveEventClockV1({ scheduledAt: ANCHOR, actualReleasedAt: ANCHOR,
  evaluatedAt: "2026-09-10T12:14:59.999Z" }), RangeError);
assert.throws(() => eventPhaseWithoutVerifiedReleaseV1(NaN, anchorMs), TypeError);
assert.throws(() => eventPhaseWithVerifiedReleaseV1(anchorMs, Infinity), TypeError);
const originalNow = Date.now;
try {
  Date.now = () => { throw new Error("Hidden clock dependency"); };
  assert.deepEqual(at(anchorMs), at(anchorMs));
} finally { Date.now = originalNow; }
console.log("Event clock: all eight boundaries, offsets, invalid timestamps and determinism passed.");
