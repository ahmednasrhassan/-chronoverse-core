// Offline inspection only. Never approves, uploads, imports or changes data.
import { readFileSync } from "node:fs";
import { parseContentManifest } from "../src/content.mjs";
import { hash, weeklyWindow } from "../src/domain.mjs";
try {
  const [file, cutover] = process.argv.slice(2);
  const startAt = Date.parse(cutover);
  if (!file || !Number.isSafeInteger(startAt) || new Date(startAt).toISOString() !== cutover || /(?:^|[\\/])\.env(?:\.|$)/.test(file)) throw new Error("invalid_input");
  const raw = readFileSync(file, "utf8"), now = Date.now();
  const parsed = parseContentManifest(raw, weeklyWindow(now), now, startAt);
  console.log(JSON.stringify({ valid: true, sequence: parsed.sequence, eligibleArticles: parsed.articles.length, sha256: hash(raw), uploads: 0, publications: 0 }));
} catch {
  console.error("Content validation failed. No publication, upload or approval performed."); process.exitCode = 1;
}
