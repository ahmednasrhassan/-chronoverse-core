import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeShareText, socialImageResponse } from "../social-image-response";

test("share titles truncate at Unicode boundaries with an ellipsis", () => {
  const title = normalizeShareText("😀".repeat(125), "Fallback", 120);
  assert.equal(Array.from(title).length, 120); assert.ok(title.endsWith("…"));
  assert.ok(!title.includes("\ufffd"));
  assert.equal(normalizeShareText("  ", "Fallback", 120), "Fallback");
});

test("fallback catches both construction and asynchronous image rendering failures", async () => {
  const fallback = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
  for (const primary of [() => { throw new Error("Synthetic render failure"); }, () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("Synthetic stream failure")); } }))]) {
    const response = await socialImageResponse("Title", "Category", primary, fallback);
    assert.equal(response.status, 200); assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  }
  const broken = () => { throw new Error("Synthetic render failure"); };
  const logo = await socialImageResponse("Title", "Category", broken, broken, async () => new Uint8Array([4]));
  assert.deepEqual(new Uint8Array(await logo.arrayBuffer()), new Uint8Array([4]));
});
