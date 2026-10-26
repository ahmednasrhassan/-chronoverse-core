import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { hiddenPassphrase } from "../src/prompt.mjs";
import { passphrase } from "./fixtures.mjs";
function terminal() {
  const input = new EventEmitter(), text = [];
  Object.assign(input, { isTTY: true, setRawMode(value) { this.raw = value; }, resume() {}, pause() {}, setEncoding() {} });
  return { input, text, output: { isTTY: true, write: value => text.push(value) } };
}
test("hidden prompt never echoes password characters or permits redirected password input", async () => {
  const f = terminal(), pending = hiddenPassphrase("Unlock: ", f.input, f.output);
  f.input.emit("data", passphrase + "\r"); assert.equal(await pending, passphrase);
  assert.deepEqual(f.text, ["Unlock: ", "\n"]); assert.equal(f.input.raw, false);
  f.input.isTTY = false; await assert.rejects(hiddenPassphrase("", f.input, f.output), /private_terminal/);
});
test("short passwords and cancellation restore terminal echo without exposing buffered input", async () => {
  for (const value of ["short\r", "synthetic\u0003"]) {
    const f = terminal(), pending = hiddenPassphrase("Unlock: ", f.input, f.output), rejection = assert.rejects(pending);
    f.input.emit("data", value); await rejection; assert.equal(f.input.raw, false); assert.equal(f.text.join("").includes("synthetic"), false);
  }
});
