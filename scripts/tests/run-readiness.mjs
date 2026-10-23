// No dotenv/Next startup: never load .env.local into regression processes.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = join(root, ".verification", "readiness");
mkdirSync(output, { recursive: true });
const groups = {
  safety: ["scripts/tests/offline-guard.test.mjs", "scripts/tests/publisher.test.mjs"],
  "auth-billing": ["src/lib/auth/tests", "src/lib/billing/tests"],
  public: ["src/components", "src/lib/seo/tests"],
  content: ["src/lib/sanity/tests", "src/lib/content/tests", "src/lib/analytics/tests", "src/app/api/amazon/tests"],
};
const selected = process.argv.slice(2);
if (selected.some(name => !Object.hasOwn(groups, name))) {
  console.error(`Choose groups: ${Object.keys(groups).join(", ")}`);
  process.exit(2);
}
function discover(path) {
  const absolute = join(root, path);
  if (/\.test\.(?:tsx?|mjs)$/.test(path)) return [path];
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? discover(child) : /\.test\.(?:tsx?|mjs)$/.test(child) ? [child] : [];
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
const summary = { date: new Date().toISOString(), node: process.version, platform: process.platform, groups: [] };
for (const name of selected.length ? selected : Object.keys(groups)) {
  const discovered = groups[name].flatMap(discover).sort();
  const deferred = [];
  for (const file of discovered) {
    if (/import\s.*from\s*["'](?:@next\/env|dotenv)["']/.test(readFileSync(join(root, file), "utf8"))) {
      throw new Error("Unreviewed environment-loading test in offline group: " + file);
    }
  }
  const files = discovered;
  console.log(`${name}: ${files.length} files; no inherited service credentials; Node networking blocked`);
  const started = performance.now();
  const child = spawn(process.execPath, [
    "--require", "next/dist/server/node-environment-baseline",
    "--import", "./scripts/tests/offline-network-preload.mjs",
    "--import", "./scripts/tests/server-only-preload.mjs",
    "--import", "tsx", "--test", "--test-concurrency=2", "--test-reporter=tap", ...files,
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
