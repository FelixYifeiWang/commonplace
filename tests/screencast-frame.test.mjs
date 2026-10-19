import test from "node:test";
import assert from "node:assert/strict";
import { createFrameBuffer } from "../lib/hosted/screencast-frame.mjs";
test("only a fresh compositor frame can be used after page readiness", () => {
  const buffer = createFrameBuffer();
  buffer.receive(Buffer.from("early").toString("base64"), 10);
  assert.equal(buffer.after(11), null);
  buffer.receive(Buffer.from("ready").toString("base64"), 12);
  assert.equal(buffer.after(11).toString(), "ready");
});
test("the frame buffer retains only the latest bounded frame", () => {
  const buffer = createFrameBuffer();
  buffer.receive(Buffer.from("one").toString("base64"), 1);
  buffer.receive(Buffer.from("two").toString("base64"), 2);
  assert.equal(buffer.after(0).toString(), "two");
  buffer.receive("a".repeat(4 * 1024 * 1024 + 1), 3);
  assert.equal(buffer.after(3), null);
});
