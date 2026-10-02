/** Reassessment timing only; a reached checkpoint is not evidence of a reaction. */
export type EventPhaseV1 =
  | "pre-event" | "t-24h" | "t-1h" | "t-15m"
  | "release-time-unverified" | "release"
  | "post-5m" | "post-15m" | "post-30m" | "post-1h";

export interface EventScheduleMilestonesV1 {
  readonly t24hAt: string;
  readonly t1hAt: string;
  readonly t15mAt: string;
  readonly scheduledAt: string;
}

export interface EventReleaseMilestonesV1 {
  readonly releaseAt: string;
  readonly post5mAt: string;
  readonly post15mAt: string;
  readonly post30mAt: string;
  readonly post1hAt: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function deriveEventClockV1(input: {
  readonly scheduledAt: string;
  /** Verified publication instant only, never schedule or fetch time. */
  readonly actualReleasedAt: string | null;
  readonly evaluatedAt: string;
}): {
  readonly evaluatedAt: string;
  readonly phase: EventPhaseV1;
  readonly schedule: EventScheduleMilestonesV1;
  readonly release: EventReleaseMilestonesV1 | null;
} {
  const scheduled = parseEventInstantV1(input.scheduledAt, "scheduledAt");
  const evaluated = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  const released = input.actualReleasedAt === null ? null
    : parseEventInstantV1(input.actualReleasedAt, "actualReleasedAt");
  return Object.freeze({
    evaluatedAt: iso(evaluated),
    phase: released === null
      ? eventPhaseWithoutVerifiedReleaseV1(evaluated, scheduled)
      : eventPhaseWithVerifiedReleaseV1(evaluated, released),
    schedule: Object.freeze({
      t24hAt: iso(scheduled - 24 * HOUR_MS),
      t1hAt: iso(scheduled - HOUR_MS),
      t15mAt: iso(scheduled - 15 * MINUTE_MS),
      scheduledAt: iso(scheduled),
    }),
    release: released === null ? null : Object.freeze({
      releaseAt: iso(released),
      post5mAt: iso(released + 5 * MINUTE_MS),
      post15mAt: iso(released + 15 * MINUTE_MS),
      post30mAt: iso(released + 30 * MINUTE_MS),
      post1hAt: iso(released + HOUR_MS),
    }),
  });
}

export function eventPhaseWithoutVerifiedReleaseV1(
  evaluatedAtMs: number, scheduledAtMs: number,
): EventPhaseV1 {
  assertMilliseconds(evaluatedAtMs);
  assertMilliseconds(scheduledAtMs);
  if (evaluatedAtMs >= scheduledAtMs) return "release-time-unverified";
  if (evaluatedAtMs >= scheduledAtMs - 15 * MINUTE_MS) return "t-15m";
  if (evaluatedAtMs >= scheduledAtMs - HOUR_MS) return "t-1h";
  if (evaluatedAtMs >= scheduledAtMs - 24 * HOUR_MS) return "t-24h";
  return "pre-event";
}

export function eventPhaseWithVerifiedReleaseV1(
  evaluatedAtMs: number, releaseAtMs: number,
): EventPhaseV1 {
  assertMilliseconds(evaluatedAtMs);
  assertMilliseconds(releaseAtMs);
  if (evaluatedAtMs >= releaseAtMs + HOUR_MS) return "post-1h";
  if (evaluatedAtMs >= releaseAtMs + 30 * MINUTE_MS) return "post-30m";
  if (evaluatedAtMs >= releaseAtMs + 15 * MINUTE_MS) return "post-15m";
  if (evaluatedAtMs >= releaseAtMs + 5 * MINUTE_MS) return "post-5m";
  if (evaluatedAtMs >= releaseAtMs) return "release";
  throw new RangeError("evaluatedAt cannot precede the verified release in a release-aware snapshot.");
}

/** Strict offset-bearing ISO instant; rejects civil-date rollover and local parsing. */
export function parseEventInstantV1(value: string, label: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (match === null) throw new TypeError(`Invalid ${label}.`);
  const [year, month, day] = match[1].split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.toISOString().slice(0, 10) !== match[1]) throw new TypeError(`Invalid ${label}.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`Invalid ${label}.`);
  return parsed;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function assertMilliseconds(value: number): void {
  if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new TypeError("Invalid event clock instant.");
  }
}
