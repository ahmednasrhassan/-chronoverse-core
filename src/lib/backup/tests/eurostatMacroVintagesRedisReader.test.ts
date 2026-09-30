import assert from "node:assert/strict";

import {
  EurostatMacroVintagesRedisReaderErrorV1,
  createEurostatMacroVintagesRedisReaderV1,
} from "../eurostatMacroVintagesRedisReader";

const hicpKey =
  "chronoverse:markets:eurostat:macro-series-vintages-v1:euro-area-hicp-all-items-annual-rate";
const gdpKey =
  "chronoverse:markets:eurostat:macro-series-vintages-v1:euro-area-real-gdp-qoq-sca";

async function run(): Promise<void> {
  const calls: string[] = [];
  const rawMember = "  { not valid Eurostat JSON } \n";
  const unicodeMember = "\u{1F600}";
  const reader = createEurostatMacroVintagesRedisReaderV1(async (key) => {
    calls.push(key);
    return key === hicpKey
      ? [rawMember, "0", "\uE000", "123", unicodeMember, 123]
      : ["invalid semantic snapshot", 9];
  });
  assert.deepEqual(calls, [], "construction must not call transport");
  const result = await reader.read();
  assert.deepEqual(calls, [hicpKey, gdpKey]);
  assert.deepEqual(result, {
    hicp: [
      { score: 0, member: rawMember },
      { score: 123, member: "\uE000" },
      { score: 123, member: unicodeMember },
    ],
    gdp: [{ score: 9, member: "invalid semantic snapshot" }],
  });
  assert.equal(result.hicp[0]?.member, rawMember);
  assert.equal(result.hicp[2]?.member, unicodeMember);

  const bothEmpty = createEurostatMacroVintagesRedisReaderV1(async () => []);
  assert.deepEqual(await bothEmpty.read(), { hicp: [], gdp: [] });
  const oneEmpty = createEurostatMacroVintagesRedisReaderV1(async (key) =>
    key === hicpKey ? [] : ["gdp", "1"]);
  assert.deepEqual(await oneEmpty.read(), {
    hicp: [],
    gdp: [{ score: 1, member: "gdp" }],
  });

  const invalidResponses: readonly unknown[] = [
    null,
    "not an array",
    ["member"],
    [7, "1"],
    ["member", "-1"],
    ["member", -1],
    ["member", "1.5"],
    ["member", 1.5],
    ["member", "1e3"],
    ["member", " 1"],
    ["member", "+1"],
    ["member", "01"],
    ["member", "9007199254740992"],
    ["member", Number.MAX_SAFE_INTEGER + 1],
    ["member", Number.NaN],
    ["member", Number.POSITIVE_INFINITY],
    ["later", "2", "earlier", "1"],
    ["a", "1", "Z", "1"],
    ["duplicate", "1", "duplicate", "2"],
  ];
  for (const raw of invalidResponses) {
    const invalidReader = createEurostatMacroVintagesRedisReaderV1(async () => raw);
    await assert.rejects(invalidReader.read(), (error: unknown) =>
      error instanceof EurostatMacroVintagesRedisReaderErrorV1 &&
      error.code === "invalid-response" &&
      !error.message.includes("duplicate") &&
      !error.message.includes("member"));
  }

  for (const error of [new ReferenceError("programming bug"), new TypeError("unrelated bug")]) {
    const throwingReader = createEurostatMacroVintagesRedisReaderV1(async () => {
      throw error;
    });
    await assert.rejects(throwingReader.read(), (caught: unknown) => caught === error);
  }
}

run().then(() => console.log("PASS: Inactive Eurostat macro vintages Redis reader V1"),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  });
