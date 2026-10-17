import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function activeConversation(raw, launchedAt = 0) {
  const windows = new Map();
  for (const line of raw.split("\n")) {
    if (!line.includes(" thread_stream_view_activity_changed ")) continue;
    const timestamp = Date.parse(line.slice(0, 24));
    if (!Number.isFinite(timestamp) || timestamp < launchedAt) continue;
    const fields = Object.fromEntries(
      [...line.matchAll(/\b([A-Za-z][A-Za-z0-9]*)=([^\s]+)/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    if (
      fields.rendererWindowAppearance !== "primary" ||
      !uuid.test(fields.conversationId || "") ||
      !/^\d+$/.test(fields.rendererWindowId || "")
    )
      continue;
    const id = fields.conversationId,
      window = fields.rendererWindowId;
    if (fields.active === "true" && fields.rendererWindowVisible === "true")
      windows.set(window, id);
    else if (
      (fields.active === "false" || fields.rendererWindowVisible === "false") &&
      windows.get(window) === id
    )
      windows.delete(window);
  }
  const ids = [...new Set(windows.values())];
  if (ids.length !== 1)
    throw new Error(
      ids.length
        ? "More than one conversation is open. Keep one Codex window open and connect again."
        : "Open the conversation in Codex, then connect again.",
    );
  return ids[0];
}

async function logFiles(root, pid) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of entries) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await logFiles(file, pid)));
    else if (
      entry.isFile() &&
      entry.name.includes(`-${pid}-t0-`) &&
      entry.name.endsWith(".log")
    )
      result.push(file);
  }
  return result;
}
export async function readOpenConversation(
  target,
  root = join(homedir(), "Library/Logs/com.openai.codex"),
) {
  if (target.bundleId !== "com.openai.codex")
    throw new Error(
      "Move the buddy over the open Codex conversation. Other apps are not supported yet.",
    );
  if (target.windowCount !== 1)
    throw new Error("Keep one Codex window open, then connect again.");
  if (
    !Number.isSafeInteger(target.pid) ||
    target.pid <= 0 ||
    !(target.launchedAt > 0)
  )
    throw new Error("Could not identify the running Codex app.");
  // Without screen access we cannot identify an inactive sidebar row. Do not silently choose the open conversation for such a drop.
  if (
    !target.bounds ||
    !target.point ||
    target.point.x < target.bounds.x + Math.min(360, target.bounds.width * 0.35)
  )
    throw new Error(
      "Open that session first, then move the buddy over the conversation area.",
    );
  const files = await Promise.all(
    (await logFiles(root, target.pid)).map(async (file) => ({
      file,
      info: await stat(file),
    })),
  );
  const current = files
    .filter((entry) => entry.info.mtimeMs >= target.launchedAt)
    .sort((a, b) => a.info.mtimeMs - b.info.mtimeMs);
  if (!current.length)
    throw new Error(
      "This Codex version has no readable navigation record. Nothing was connected.",
    );
  if (current.reduce((n, file) => n + file.info.size, 0) > 32 * 1024 * 1024)
    throw new Error(
      "Navigation history is too large for this preview. Restart Codex and try again.",
    );
  // Keep only the navigation event. Conversation messages and other log contents are never uploaded.
  const events = [];
  for (const { file } of current) {
    const raw = await readFile(file, "utf8");
    events.push(
      ...raw
        .split("\n")
        .filter((line) =>
          line.includes(" thread_stream_view_activity_changed "),
        ),
    );
  }
  events.sort((a, b) => a.slice(0, 24).localeCompare(b.slice(0, 24)));
  return activeConversation(events.join("\n"), target.launchedAt);
}
