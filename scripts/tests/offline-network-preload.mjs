// Trusted regression tests only; this is not an OS sandbox for untrusted code.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";

// Restricted Windows processes may deny uv_os_get_passwd. tsx uses only the
// username for a temporary IPC directory. This fallback is test-local only.
if (process.platform === "win32") {
  const userInfo = os.userInfo;
  os.userInfo = function (...args) {
    try {
      return userInfo.apply(this, args);
    } catch (error) {
      if (error?.info?.syscall !== "uv_os_get_passwd") throw error;
      return { username: "chronoverse-offline-tests", uid: -1, gid: -1, homedir: os.tmpdir(), shell: null };
    }
  };
}

let attempts = 0;
let environmentReads = 0;
// Prevent Next/dotenv from reintroducing workstation secrets after the runner
// sanitizes inherited variables. Source/fixture reads remain available.
function checkEnvironmentPath(path) {
  const text = path instanceof URL ? path.pathname : String(path);
  if (/(?:^|[\\/])\.env(?:\.[^\\/]*)?$/.test(text)) {
    environmentReads += 1;
    throw new Error("OFFLINE_TEST_ENV_FILE_BLOCKED");
  }
}
for (const name of ["readFileSync", "readFile", "createReadStream", "openSync", "open"]) {
  const original = fs[name];
  fs[name] = function (path, ...args) {
    checkEnvironmentPath(path);
    return original.call(this, path, ...args);
  };
}
for (const name of ["readFile", "open"]) {
  const original = fs.promises[name];
  fs.promises[name] = async function (path, ...args) {
    checkEnvironmentPath(path);
    return original.call(this, path, ...args);
  };
}
function deny() {
  attempts += 1;
  throw new Error("OFFLINE_TEST_NETWORK_BLOCKED");
}

globalThis.fetch = async () => deny();
http.request = http.get = https.request = https.get = deny;
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // tsx uses a local named pipe/Unix socket to notify its parent. Permit only
  // that IPC path, never TCP (including localhost) or arbitrary pipe endpoints.
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const path = typeof options === "string" ? options : options?.path;
  const localPipe = typeof path === "string" &&
    (process.platform === "win32" ? path.startsWith("\\\\?\\pipe\\") : path.startsWith("/")) &&
    /[\\/]tsx-[^\\/]+[\\/]\d+\.pipe$/.test(path) && !options?.port;
  return localPipe ? connect.apply(this, args) : deny();
};
tls.connect = deny;
dgram.Socket.prototype.send = dgram.Socket.prototype.connect = deny;
syncBuiltinESMExports();

process.on("exit", () => {
  if (environmentReads > 0) {
    process.stderr.write(`Offline guard blocked ${environmentReads} environment-file read(s).\n`);
    process.exitCode = 1;
  }
  if (attempts > 0) {
    // No addresses, headers, request bodies, credentials or environment values.
    process.stderr.write(`Offline guard blocked ${attempts} network attempt(s).\n`);
    process.exitCode = 1;
  }
});
