import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("operational reconciliation, finalization and preview guards pass without private release files or AWS", () => {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3",
    ["-B", "-m", "unittest", "discover", "-s", "test", "-p", "test_*.py"],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
