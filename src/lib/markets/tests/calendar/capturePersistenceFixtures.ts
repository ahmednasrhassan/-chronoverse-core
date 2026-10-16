import { readFileSync } from "node:fs";
import {
  createOfficialScheduleAcquirerV1, OFFICIAL_SCHEDULE_REQUEST_V1, OFFICIAL_SCHEDULE_SOURCES_V1,
} from "../../calendar/officialScheduleAcquisition";
import { CALENDAR_CAPTURE_INPUT_V1, type CalendarCaptureInputV1 } from "../../calendar/capturePersistence";

/** v1 synthetic HTTP/clock/revision fixture around the identifiable B2 HTML.
 * Neither an authenticated capture nor a durability/ownership assertion. */
export const CAPTURE_FIXTURE_VERSION_V1 = "synthetic-calendar-capture-fixture-v1";
export const CAPTURE_NOW_V1 = Date.parse("2026-10-16T08:00:00Z");
export const captureHtmlFixtureV1 = (publisher: "ecb" | "boj") =>
  readFileSync(new URL("./documents/" + (publisher === "ecb" ? "ecb-governing-council-v1.html" : "boj-mpm-index-v1.html"), import.meta.url), "utf8");
export async function captureFixtureV1(options: {
  publisher?: "ecb" | "boj"; content?: string; captureId?: string; previousCaptureId?: string | null; offset?: number;
} = {}): Promise<CalendarCaptureInputV1> {
  const publisher = options.publisher ?? "ecb";
  const bytes = Buffer.from(options.content ?? captureHtmlFixtureV1(publisher), "utf8");
  const wall = CAPTURE_NOW_V1 + (options.offset ?? 0);
  let reads = 0;
  const client = createOfficialScheduleAcquirerV1({
    fetch: async () => {
      const response = new Response(bytes, { headers: { "Content-Type": "text/html; charset=utf-8", Date: new Date(wall).toUTCString() } });
      Object.defineProperty(response, "url", { value: OFFICIAL_SCHEDULE_SOURCES_V1[publisher].sourceUrl });
      return response;
    },
    now: () => wall + reads++ * 100, monotonicNow: () => 0, armDeadline: () => () => {},
  });
  const acquisition = await client.acquire({ schemaVersion: OFFICIAL_SCHEDULE_REQUEST_V1, publisher });
  if (acquisition.status !== "acquired") throw new Error("Synthetic acquisition fixture failed.");
  return {
    schemaVersion: CALENDAR_CAPTURE_INPUT_V1, captureId: options.captureId ?? "synthetic-capture-1",
    previousCaptureId: options.previousCaptureId ?? null,
    bodyBase64Chunks: bytes.toString("base64").match(/.{1,2048}/g)!, acquisition,
    bindings: acquisition.extraction.rows.map((row, index) => ({
      canonicalMeetingDate: row.eventTime.kind === "date-only" ? row.eventTime.date : row.eventTime.expectedDate!,
      versionId: "synthetic-event-" + index + "-v1",
      revision: { sequence: 1, supersedesVersionId: null, change: "initial" },
    })),
  };
}
