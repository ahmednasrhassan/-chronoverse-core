import {
  isTargetBusinessDateV1,
  previousTargetBusinessDateV1,
} from "../../engine/targetBusinessCalendar";

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

for (const [day, expected] of [
  ["2026-09-07", true],  // ordinary Monday
  ["2026-09-05", false], // Saturday
  ["2026-09-06", false], // Sunday
  ["2026-01-01", false], // New Year
  ["2026-04-02", true],  // Maundy Thursday is open
  ["2026-04-03", false], // Good Friday
  ["2026-04-06", false], // Easter Monday
  ["2026-04-07", true],  // first business day after Easter
  ["2025-04-18", false], // movable Good Friday in another year
  ["2025-04-21", false], // movable Easter Monday in another year
  ["2025-05-01", false], // Labour Day
  ["2025-12-25", false], // Christmas Day
  ["2025-12-26", false], // Boxing Day
] as const) {
  assertEqual(isTargetBusinessDateV1(date(day)), expected, day);
}

assertEqual(
  previousTargetBusinessDateV1(date("2026-04-07")).toISOString().slice(0, 10),
  "2026-04-02",
  "Easter weekend and closing days are skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2025-04-22")).toISOString().slice(0, 10),
  "2025-04-17",
  "another Easter year is skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2026-09-07")).toISOString().slice(0, 10),
  "2026-09-04",
  "weekend is skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2025-05-02")).toISOString().slice(0, 10),
  "2025-04-30",
  "Labour Day is skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2023-12-27")).toISOString().slice(0, 10),
  "2023-12-22",
  "Christmas closing days and weekend are skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2026-01-02")).toISOString().slice(0, 10),
  "2025-12-31",
  "New Year's Day is skipped",
);
assertEqual(
  previousTargetBusinessDateV1(date("2024-01-02")).toISOString().slice(0, 10),
  "2023-12-29",
  "New Year crosses a weekend and year boundary",
);
assertEqual(isTargetBusinessDateV1(new Date(Number.NaN)), false,
  "invalid date is not a business date");
let invalidPreviousDateRejected = false;
try {
  previousTargetBusinessDateV1(new Date(Number.NaN));
} catch (error) {
  invalidPreviousDateRejected = error instanceof TypeError;
}
assertEqual(invalidPreviousDateRejected, true,
  "invalid date is rejected before the backwards search");
let dateRangeExceeded = false;
try {
  previousTargetBusinessDateV1(new Date(-8_640_000_000_000_000));
} catch (error) {
  dateRangeExceeded = error instanceof RangeError;
}
assertEqual(dateRangeExceeded, true,
  "backwards search stops at the Date range boundary");

console.log("PASS: ECB TARGET business-date calendar");
