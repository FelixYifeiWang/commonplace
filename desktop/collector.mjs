import { open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parseTranscript } from "../lib/protocol.mjs";

async function filesUnder(root, depth) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (["ENOENT", "EACCES"].includes(error.code)) return [];
    throw error;
  }
  const result = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) result.push(path);
    else if (entry.isDirectory() && depth > 0 && entry.name !== "subagents")
      result.push(...(await filesUnder(path, depth - 1)));
  }
  return result;
}
export async function discoverSessions(base = homedir()) {
  const groups = [
    {
      provider: "Claude Code",
      root: join(base, ".claude", "projects"),
      depth: 1,
    },
    { provider: "Codex", root: join(base, ".codex", "sessions"), depth: 3 },
  ];
  const candidates = [];
  for (const group of groups) {
    for (const path of await filesUnder(group.root, group.depth)) {
      const info = await stat(path);
      if (info.isFile())
        candidates.push({
          path,
          provider: group.provider,
          mtime: info.mtimeMs,
        });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  const result = [];
  for (const candidate of candidates.slice(0, 30)) {
    const file = await open(candidate.path, "r");
    let head;
    try {
      const buf = Buffer.alloc(65536);
      const read = await file.read(buf, 0, buf.length, 0);
      head = buf.toString("utf8", 0, read.bytesRead);
    } finally {
      await file.close();
    }
    const turns = parseTranscript(head),
      first = turns.find(
        (t) =>
          t.role === "user" &&
          !t.text.startsWith("<environment_context>") &&
          !t.text.startsWith("# AGENTS.md"),
      );
    const filename = candidate.path.split("/").pop().replace(".jsonl", "");
    result.push({
      id: createHash("sha256").update(candidate.path).digest("hex"),
      file: candidate.path,
      provider: candidate.provider,
      title:
        first?.text
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100) || filename,
      updatedAt: new Date(candidate.mtime).toISOString(),
      sessionId: filename,
    });
  }
  return result;
}
export async function readSelectedTranscript(path) {
  const info = await stat(path);
  if (info.size > 25 * 1024 * 1024)
    throw new Error(
      "This transcript exceeds the 25 MB preview limit. Choose a smaller session.",
    );
  return parseTranscript(await readFile(path, "utf8"));
}
export async function syncTranscript({
  connection,
  subscription,
  cursors,
  request = fetch,
}) {
  const turns = await readSelectedTranscript(subscription.file);
  const seen = new Set(cursors[subscription.id] || []);
  const pending = turns
    .map((t) => ({ ...t, text: t.text.slice(0, 64000) }))
    .map((t) => ({
      turn: t,
      key: createHash("sha256").update(`${t.id}:${t.text}`).digest("hex"),
    }))
    .filter((t) => !seen.has(t.key));
  const batches = [];
  let current = [],
    size = 0;
  for (const entry of pending) {
    const length = JSON.stringify(entry.turn).length;
    if (current.length >= 10 || size + length > 700000) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += length;
  }
  if (current.length) batches.push(current);
  if (!batches.length) batches.push([]);
  let captured = 0;
  for (const batch of batches) {
    const response = await request(`${connection.origin}/api/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.token}`,
      },
      redirect: "error",
      body: JSON.stringify({
        subscriptionId: subscription.id,
        turns: batch.map((e) => e.turn),
        complete:
          subscription.mode === "once" && batch === batches[batches.length - 1],
      }),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Sign in to your space before syncing this computer.");
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "Unable to sync this session.");
      error.status = response.status;
      throw error;
    }
    for (const entry of batch) seen.add(entry.key);
    captured += batch.length;
    cursors[subscription.id] = [...seen];
  }
  return { captured, total: turns.length, pendingAI: pending.length > 0 };
}
