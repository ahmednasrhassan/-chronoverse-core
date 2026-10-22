// No dotenv/Next startup: never load .env.local into regression processes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = join(root, ".next", "readiness");
mkdirSync(output, { recursive: true });
const groups = {
  safety: ["scripts/tests/offline-guard.test.mjs"],
  "auth-billing": ["src/lib/auth/tests", "src/lib/billing/tests"],
  financial: ["src/lib/markets/tests"],
  "free-public": ["src/components/home/tests", "src/components/navigation/tests", "src/lib/markets/tests/services/vipDeepDelivery.test.ts"],
  "ledger-lua": ["src/lib/markets/tests/persistence/ecbMonetaryPolicyOwnershipLedgerRedis.test.ts"],
  "boj-mutations": ["src/lib/markets/tests/boj/facts.test.ts"],
  "launch-products": [
    "src/lib/markets/tests/ecb/fxReferenceSeries.test.ts",
    "src/lib/markets/tests/ecb/estrSeries.test.ts",
    "src/lib/markets/tests/ecb/fxProductionRuntime.test.ts",
    "src/lib/markets/tests/eurusd/productionRuntime.test.ts",
    "src/lib/markets/tests/estr",
    "src/lib/markets/tests/projections/fiveProductProjections.test.ts",
    "src/lib/markets/tests/services/canonicalProductResults.test.ts",
    "src/lib/markets/tests/services/canonicalProductResultQualification.test.ts",
    "src/lib/markets/tests/services/canonicalTemporalQualification.test.ts",
    "src/lib/markets/tests/services/fxTemporalProductionAdmission.test.ts",
    "src/lib/markets/tests/services/estrTemporalProductionAdmission.test.ts",
    "src/lib/markets/tests/analysis/fxCalibration.test.ts",
    "src/lib/markets/tests/analysis/estrRateCalibration.test.ts",
  ],
  "content-backup": ["src/lib/sanity/tests", "src/lib/seo/tests", "src/lib/backup/tests", "src/app/api/amazon/tests"],
};
// These existing scripts require live provider/Next context. Deferrals are
// explicit, so a newly added dotenv-based test cannot silently disappear.
const liveScripts = new Set([
  "src/lib/markets/tests/eia/client.test.ts",
  "src/lib/markets/tests/eia/inventories.test.ts",
  "src/lib/markets/tests/eia/oil.provider.test.ts",
  "src/lib/markets/tests/eia/production.test.ts",
  "src/lib/markets/tests/oil/intelligence.liveMacro.test.ts",
]);
const selected = process.argv.slice(2);
if (selected.some(name => !Object.hasOwn(groups, name))) {
  console.error(`Choose groups: ${Object.keys(groups).join(", ")}`);
  process.exit(2);
}
function discover(path) {
  const absolute = join(root, path);
  if (/\.test\.(?:ts|mjs)$/.test(path)) return [path];
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? discover(child) : /\.test\.(?:ts|mjs)$/.test(child) ? [child] : [];
  });
}
// Pass OS/tooling variables only; drop NODE_OPTIONS and all inherited app/cloud
// settings, including credential-file paths. Tests inject their own fixtures.
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR)$/i.test(key)) env[key] = value;
}
Object.assign(env, {
  NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1", TZ: "UTC",
  // Also protect inherited Node subprocesses (e.g. mutation-test children).
  NODE_OPTIONS: `--import=${new URL("./offline-network-preload.mjs", import.meta.url).href}`,
});
// Optional pinned test-only Python dependencies installed under ignored output.
const luaPath = join(root, ".next", "readiness-lua");
if (existsSync(join(luaPath, "fakeredis")) && existsSync(join(luaPath, "lupa"))) {
  env.ECB_LEDGER_LUA_PYTHONPATH = luaPath;
  env.PYTHONNOUSERSITE = "1";
}
const summary = { date: new Date().toISOString(), node: process.version, platform: process.platform, groups: [] };
for (const name of selected.length ? selected : ["safety", "auth-billing", "financial", "free-public", "content-backup"]) {
  const discovered = groups[name].flatMap(discover).sort();
  // Existing live EIA smoke scripts load dotenv and require provider access.
  // Explicitly defer them; never turn live integration gaps into fixture passes.
  const deferred = discovered.filter(file => liveScripts.has(file.replaceAll("\\", "/")));
  for (const file of discovered.filter(file => !deferred.includes(file))) {
    if (/import\s.*from\s*["'](?:@next\/env|dotenv)["']/.test(readFileSync(join(root, file), "utf8"))) {
      throw new Error("Unreviewed environment-loading test in offline group: " + file);
    }
  }
  const files = discovered.filter(file => !deferred.includes(file));
  if (deferred.length) console.log(`Deferred live integration scripts: ${deferred.join(", ")}`);
  console.log(`${name}: ${files.length} files; no inherited service credentials; Node networking blocked`);
  const started = performance.now();
  const child = spawn(process.execPath, [
    "--require", "next/dist/server/node-environment-baseline",
    "--import", "./scripts/tests/offline-network-preload.mjs",
    "--import", "./scripts/tests/server-only-preload.mjs",
    "--import", "tsx", "--test", "--test-concurrency=4", "--test-reporter=tap", ...files,
  ], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let log = "";
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  const timeout = setTimeout(() => child.kill(), 10 * 60 * 1000);
  const result = await new Promise(resolve => {
    child.on("error", () => resolve({ code: null, signal: "spawn-error" }));
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    counts[key] = Number(log.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1] ?? -1);
  }
  const report = { name, files: files.length, deferred, ...result, ...counts, durationMs: Math.round(performance.now() - started) };
  summary.groups.push(report);
  writeFileSync(join(output, `${name}.tap`), log);
  writeFileSync(join(output, `${name}.json`), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (result.code !== 0 || counts.fail !== 0 || counts.pass < 1 || counts.cancelled !== 0 || counts.skipped !== 0 || counts.todo !== 0) process.exitCode = 1;
}
console.log(`Local evidence: ${relative(root, output)} (ignored; review before sharing)`);
