import { Buffer } from "node:buffer";

import type { EurostatMacroVintageBackupEntryV1 } from "./eurostatMacroVintagesBackup";
import { buildEurostatMacroSeriesVintageRedisKeyV1 } from
  "../markets/persistence/eurostatMacroSeriesVintageRedis";

export type ReadRedisSortedSetWithScoresV1 = (key: string) => Promise<unknown>;

export type EurostatMacroVintagesRedisReaderErrorCodeV1 =
  | "invalid-response"
  | "redis-failure"
  | "configuration-failure";

export class EurostatMacroVintagesRedisReaderErrorV1 extends Error {
  constructor(readonly code: EurostatMacroVintagesRedisReaderErrorCodeV1) {
    super(`Eurostat macro-vintage Redis read failed: ${code}.`);
    this.name = "EurostatMacroVintagesRedisReaderErrorV1";
  }
}

export interface EurostatMacroVintagesRedisReadResultV1 {
  readonly hicp: readonly EurostatMacroVintageBackupEntryV1[];
  readonly gdp: readonly EurostatMacroVintageBackupEntryV1[];
}

export interface EurostatMacroVintagesRedisReaderV1 {
  readonly read: () => Promise<EurostatMacroVintagesRedisReadResultV1>;
}

/** Each ZRANGE is complete for its key; the two sequential reads are not atomic. */
export function createEurostatMacroVintagesRedisReaderV1(
  readSortedSet: ReadRedisSortedSetWithScoresV1,
): EurostatMacroVintagesRedisReaderV1 {
  return Object.freeze({
    read: async (): Promise<EurostatMacroVintagesRedisReadResultV1> => {
      const hicp = parseWithScores(await readSortedSet(
        buildEurostatMacroSeriesVintageRedisKeyV1("hicp"),
      ));
      const gdp = parseWithScores(await readSortedSet(
        buildEurostatMacroSeriesVintageRedisKeyV1("gdp"),
      ));
      return Object.freeze({ hicp: Object.freeze(hicp), gdp: Object.freeze(gdp) });
    },
  });
}

/** Upstash with automaticDeserialization:false preserves the alternating response. */
function parseWithScores(raw: unknown): EurostatMacroVintageBackupEntryV1[] {
  if (!Array.isArray(raw) || raw.length % 2 !== 0) throw invalidResponse();

  const entries: EurostatMacroVintageBackupEntryV1[] = [];
  const seenMembers = new Set<string>();
  let previousScore = -1;
  let previousMemberBytes: Buffer | null = null;
  for (let index = 0; index < raw.length; index += 2) {
    const member = raw[index];
    if (typeof member !== "string") throw invalidResponse();
    const score = parseScore(raw[index + 1]);
    const memberBytes = Buffer.from(member, "utf8");
    const identity = memberBytes.toString("base64");
    if (seenMembers.has(identity) || score < previousScore ||
        (score === previousScore && previousMemberBytes !== null &&
          Buffer.compare(previousMemberBytes, memberBytes) >= 0)) {
      throw invalidResponse();
    }
    seenMembers.add(identity);
    entries.push(Object.freeze({ score, member }));
    previousScore = score;
    previousMemberBytes = memberBytes;
  }
  return entries;
}

function parseScore(value: unknown): number {
  const score = typeof value === "number"
    ? value
    : typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(score) || score < 0) throw invalidResponse();
  return score;
}

function invalidResponse(): EurostatMacroVintagesRedisReaderErrorV1 {
  return new EurostatMacroVintagesRedisReaderErrorV1("invalid-response");
}
