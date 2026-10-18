import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSetupSession } from "../desktop/setup-session.mjs";
import { parseTranscript } from "../lib/protocol.mjs";
const code = "a".repeat(64),
  link = "https://space.example/setup#" + code;
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "setup-session-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
for (const provider of ["Codex", "Claude Code", "Cursor"])
  test(`setup selects the exact ${provider} user prompt`, async (t) => {
    const home = await fixture(t),
      id = "12345678-1234-1234-1234-123456789abc";
    const file = join(
      home,
      provider === "Codex"
        ? ".codex/sessions/2026/10/17/rollout-" + id + ".jsonl"
        : provider === "Claude Code"
          ? ".claude/projects/project/" + id + ".jsonl"
          : ".cursor/projects/project/agent-transcripts/" +
            id +
            "/" +
            id +
            ".jsonl",
    );
    await mkdir(join(file, ".."), { recursive: true });
    const message = {
      role: "user",
      content: [{ type: "text", text: "Set up " + link }],
    };
    const row =
      provider === "Codex"
        ? { type: "response_item", payload: message }
        : provider === "Claude Code"
          ? { message }
          : { role: "user", message: { content: message.content } };
    await writeFile(file, JSON.stringify(row) + "\n");
    assert.equal(
      (await findSetupSession(code, { home })).file,
      await realpath(file),
    );
    assert.equal((await findSetupSession(code, { home })).provider, provider);
  });
test("setup never falls back to the newest or assistant-only mention", async (t) => {
  const home = await fixture(t),
    folder = join(home, ".claude/projects/project");
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, "id.jsonl"),
    JSON.stringify({ role: "assistant", content: link }) + "\n",
  );
  await assert.rejects(findSetupSession(code, { home }), /not found/i);
});
test("copied setup prompts in two conversations fail closed", async (t) => {
  const home = await fixture(t),
    folder = join(home, ".claude/projects/project");
  await mkdir(folder, { recursive: true });
  for (const id of ["one", "two"])
    await writeFile(
      join(folder, id + ".jsonl"),
      JSON.stringify({ role: "user", content: link }) + "\n",
    );
  await assert.rejects(findSetupSession(code, { home }), /more than one/i);
});
test("a symlink cannot turn setup into reading an unrelated file", async (t) => {
  const home = await fixture(t),
    folder = join(home, ".claude/projects/project");
  await mkdir(folder, { recursive: true });
  const outside = join(home, "private.jsonl");
  await writeFile(outside, JSON.stringify({ role: "user", content: link }));
  await symlink(outside, join(folder, "id.jsonl"));
  await assert.rejects(findSetupSession(code, { home }), /not found/i);
});
test("Cursor outer roles retain text but exclude tool payloads", () => {
  const rows = parseTranscript(
    JSON.stringify({
      role: "user",
      message: {
        content: [
          { type: "text", text: "hello" },
          { type: "tool_use", input: "secret" },
        ],
      },
    }),
  );
  assert.deepEqual(
    rows.map((t) => [t.role, t.text]),
    [["user", "hello"]],
  );
});
