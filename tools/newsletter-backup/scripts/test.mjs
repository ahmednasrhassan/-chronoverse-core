import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)), env = {};
for (const [key, value] of Object.entries(process.env)) if (/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR)$/i.test(key)) env[key] = value;
const guard = new URL("../../../scripts/tests/offline-network-preload.mjs", import.meta.url).href;
const absent = path.join(os.tmpdir(), `chronoverse-no-aws-config-${randomUUID()}`);
Object.assign(env, { NODE_ENV: "test", CV_BACKUP_OFFLINE_TEST: "1", NODE_OPTIONS: `--import=${guard}`, TZ: "UTC",
  AWS_CONFIG_FILE: absent, AWS_SHARED_CREDENTIALS_FILE: absent + "-credentials", AWS_EC2_METADATA_DISABLED: "true" });
const files = readdirSync(new URL("../test/", import.meta.url)).filter(n => n.endsWith(".test.mjs")).sort().map(n => `test/${n}`);
const child = spawn(process.execPath, ["--import", guard, "--test", "--test-concurrency=1", ...files], { cwd: root, env, windowsHide: true, stdio: "inherit" });
child.on("error", () => { process.exitCode = 1; }); child.on("close", code => { process.exitCode = code ?? 1; });
