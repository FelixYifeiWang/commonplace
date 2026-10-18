import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeItem,
  itemIdentity,
  parseTranscript,
  validateIngest,
  safeUrl,
  trimUrl,
} from "../lib/protocol.mjs";

test("only web URLs can become clickable sources", () => {
  assert.deepEqual(
    ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,test"].map(
      safeUrl,
    ),
    [null, null, null],
  );
});
test("tracking parameters and fragments do not create duplicate references", () => {
  assert.equal(
    itemIdentity({
      kind: "link",
      url: "https://example.com/article?utm_source=agent#section",
    }),
    itemIdentity({ kind: "link", url: "https://example.com/article" }),
  );
});
test("ideas with a stable external id retain their identity after revision", () => {
  assert.equal(
    itemIdentity({ kind: "idea", externalId: "turn-2-idea", title: "First" }),
    itemIdentity({ kind: "idea", externalId: "turn-2-idea", title: "Revised" }),
  );
});
test("an item requires attributable source text", () => {
  assert.throws(
    () => normalizeItem({ kind: "idea", title: "A thought" }),
    /source/i,
  );
});
test("inferred connections are explicitly marked", () => {
  assert.equal(
    normalizeItem({
      kind: "idea",
      title: "A thought",
      sourceText: "Original material",
      inferred: true,
    }).inferred,
    true,
  );
});
test("batches are bounded", () => {
  assert.throws(
    () => validateIngest({ items: Array.from({ length: 101 }, () => ({})) }),
    /100/,
  );
});
test("Claude and Codex turns normalize without tool execution content", () => {
  const raw = [
    {
      type: "user",
      uuid: "c1",
      message: { role: "user", content: "See https://are.na" },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "A useful reference." }],
      },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", input: { command: "secret" } }],
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");
  assert.deepEqual(
    parseTranscript(raw).map((t) => t.role),
    ["user", "assistant"],
  );
});
test("a partial final JSONL line is ignored until the next read", () => {
  assert.equal(
    parseTranscript(
      '{"type":"user","message":{"role":"user","content":"hello"}}\n{"type":',
    ).length,
    1,
  );
});
test("a link wrapped in Markdown bold keeps its real address", () => {
  assert.equal(
    trimUrl("https://www.eileen-z.com**"),
    "https://www.eileen-z.com",
  );
});
test("a link ending a sentence drops the full stop", () => {
  assert.equal(trimUrl("https://example.com/a."), "https://example.com/a");
});
