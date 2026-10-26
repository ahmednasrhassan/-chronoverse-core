import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const env = {};
for (const [key, value] of Object.entries(process.env)) if (/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR)$/i.test(key)) env[key] = value;
env.NODE_ENV = "test";
const guard = new URL("../../../scripts/tests/offline-network-preload.mjs", import.meta.url).href;
const result = spawnSync(process.execPath, ["--import", guard, "--test", "--test-concurrency=1", "test/*.test.mjs"], { cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
