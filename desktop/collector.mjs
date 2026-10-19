import { createResponseBoundary } from "./response-boundary.mjs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { redactSetupLinks } from "./setup-session.mjs";
import { resolveFollowedTranscript } from "./target.mjs";
import { parseTranscript } from "../lib/protocol.mjs";
import { createMediaReader, MAX_MEDIA_BYTES } from "../lib/session-media.mjs";

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
// Snapshot the current end so an actively growing log cannot keep an import open.
// Memory is bounded by one JSONL record, rather than the entire session file.
// `onMedia` also receives the pictures in each line (pasted images, published artifacts).
export async function* readSelectedTranscript(
  path,
  { onMedia, onRecord } = {},
) {
  const reader = onMedia && createMediaReader();
  const media = (line, index) => {
    onRecord?.(line);
    if (reader) for (const event of reader.read(line, index)) onMedia(event);
  };
  const file = await open(path, "r");
  let stream;
  try {
    const { size } = await file.stat();
    if (!size) return;
    stream = file.createReadStream({
      encoding: "utf8",
      end: size - 1,
      autoClose: false,
    });
    let lineIndex = 0;
    let fragments = [];
    for await (const chunk of stream) {
      let start = 0;
      let end;
      while ((end = chunk.indexOf("\n", start)) !== -1) {
        fragments.push(chunk.slice(start, end));
        const line = fragments.join("");
        fragments = [];
        media(line, lineIndex);
        yield* parseTranscript(line, lineIndex++);
        start = end + 1;
      }
      if (start < chunk.length) fragments.push(chunk.slice(start));
    }
    if (fragments.length) {
      media(fragments.join(""), lineIndex);
      yield* parseTranscript(fragments.join(""), lineIndex);
    }
  } finally {
    stream?.destroy();
    await file.close();
  }
}
// A followed project is a folder of session transcripts. Read each one oldest first, so new sessions join automatically.
// Skip anything that resolves outside the folder, such as a symlink, and nested subagent transcripts.
// Transcripts can be hundreds of megabytes, so one whose size and modification time match `previous` is not read again.
export async function* readProjectTranscripts(
  folder,
  previous = {},
  next = {},
  options = {},
) {
  const root = await realpath(folder);
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.name.endsWith(".jsonl")) continue;
    let file;
    try {
      file = await realpath(join(root, entry.name));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (dirname(file) !== root) continue;
    const info = await stat(file);
    if (info.isFile())
      files.push({
        file,
        mtime: info.mtimeMs,
        version: `${info.size}:${info.mtimeMs}`,
      });
  }
  files.sort((a, b) => a.mtime - b.mtime);
  for (const { file, version } of files) {
    if (previous[file]?.version === version) {
      next[file] = previous[file];
      continue;
    }
    let turns = 0;
    for await (const turn of readSelectedTranscript(file, options)) {
      turns++;
      yield turn;
    }
    next[file] = { version, turns };
  }
}
const MEDIA_PER_SYNC = 8;
// Raised when Nox frames artifacts differently (desktop/artifact-region.mjs), so each is captured again once.
const ARTIFACT_FRAMING = 2;
// Pictures go up after the turns, so an artifact's capture finds the link the conversation created.
// Each is sent once; an artifact again only when its local file changes. A failed upload never fails
// the sync: it is retried next time, unless the server rejected it as invalid.
async function uploadMedia({
  connection,
  subscription,
  cursors,
  request,
  media,
  found,
}) {
  const cursor = `media:${subscription.id}`;
  const sent = new Set(cursors[cursor] || []);
  const prepare = media.prepareImage || ((image) => image);
  let uploaded = 0;
  async function post(key, body) {
    let response;
    try {
      response = await request(`${connection.origin}/api/capture/media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.token}`,
        },
        redirect: "error",
        body: JSON.stringify({ subscriptionId: subscription.id, ...body }),
      });
    } catch {
      return;
    }
    if (response.ok || [400, 413].includes(response.status)) sent.add(key);
    if (response.ok) uploaded++;
    cursors[cursor] = [...sent];
  }
  async function send(key, image, body) {
    const prepared = image && (await prepare(image));
    if (!prepared || prepared.data.length > MAX_MEDIA_BYTES) {
      sent.add(key);
      cursors[cursor] = [...sent];
      return;
    }
    await post(key, {
      ...body,
      mimeType: prepared.mimeType,
      data: Buffer.from(prepared.data).toString("base64"),
    });
  }
  for (const [key, event] of found.pasted) {
    if (uploaded >= MEDIA_PER_SYNC) break;
    if (sent.has(key)) continue;
    await send(
      key,
      { data: Buffer.from(event.data, "base64"), mimeType: event.mimeType },
      {
        kind: "pasted",
        turnId: event.turnId,
        context: redactSetupLinks(event.context),
      },
    );
  }
  if (!media.captureArtifact) return uploaded;
  for (const event of found.artifacts.values()) {
    if (uploaded >= MEDIA_PER_SYNC) break;
    let info;
    try {
      info = await stat(event.file);
    } catch {
      continue;
    }
    const key = `artifact:${ARTIFACT_FRAMING}:${event.url}:${info.size}:${info.mtimeMs}`;
    if (sent.has(key)) continue;
    let capture = null;
    try {
      capture = await media.captureArtifact(event.file);
    } catch {
      capture = null;
    }
    await send(key, capture, {
      kind: "artifact",
      turnId: event.turnId,
      url: event.url,
      title: capture?.title || "",
      context: event.context,
    });
  }
  return uploaded;
}
export async function syncTranscript({
  connection,
  subscription,
  cursors,
  request = fetch,
  resolveTranscript = resolveFollowedTranscript,
  media,
}) {
  // The latest publish of each artifact wins; pasted images are known by their bytes.
  const found = { pasted: new Map(), artifacts: new Map() };
  const onMedia = media
    ? (event) => {
        if (event.kind === "artifact") found.artifacts.set(event.url, event);
        else
          found.pasted.set(
            `pasted:${createHash("sha256").update(event.data).digest("hex")}`,
            event,
          );
      }
    : undefined;
  const boundary = createResponseBoundary();
  const onRecord = (line) => boundary.read(line);
  const seen = new Set(cursors[subscription.id] || []);
  const queued = new Set();
  let batch = [],
    size = 0,
    captured = 0,
    total = 0;
  async function sendBatch(complete) {
    const response = await request(`${connection.origin}/api/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.token}`,
      },
      redirect: "error",
      body: JSON.stringify({
        subscriptionId: subscription.id,
        ...boundary.snapshot(),
        syncComplete: complete,
        turns: batch.map((e) => e.turn),
        complete: subscription.mode === "once" && complete,
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
    batch = [];
    size = 0;
    queued.clear();
  }
  const versions = {};
  const source = subscription.folder
    ? { file: subscription.file }
    : await resolveTranscript(subscription);
  async function* selectedTranscripts() {
    // Drain the old file first so a rotation between polls cannot lose its tail.
    if (source.file !== subscription.file) {
      try {
        yield* readSelectedTranscript(subscription.file, { onMedia, onRecord });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    yield* readSelectedTranscript(source.file, { onMedia, onRecord });
  }
  const transcript = subscription.folder
    ? readProjectTranscripts(
        subscription.file,
        subscription.versions,
        versions,
        { onMedia, onRecord },
      )
    : selectedTranscripts();
  for await (const raw of transcript) {
    total++;
    const turn = { ...raw, text: redactSetupLinks(raw.text).slice(0, 64000) };
    const key = createHash("sha256")
      .update(`${turn.id}:${turn.text}`)
      .digest("hex");
    if (seen.has(key) || queued.has(key)) continue;
    const length = Buffer.byteLength(JSON.stringify(turn), "utf8");
    if (batch.length && (batch.length >= 10 || size + length > 700000))
      await sendBatch(false);
    batch.push({ turn, key });
    queued.add(key);
    size += length;
  }
  // Even an unchanged session needs a heartbeat; only the last batch completes imports.
  await sendBatch(true);
  // Persist the new path only after the server has acknowledged its contents.
  Object.assign(subscription, source);
  if (subscription.folder) {
    // Remember which transcripts were read only after every batch is acknowledged.
    subscription.versions = versions;
    total = Object.values(versions).reduce((n, v) => n + v.turns, 0);
  }
  const pictures = media
    ? await uploadMedia({
        connection,
        subscription,
        cursors,
        request,
        media,
        found,
      })
    : 0;
  return { captured, total, pendingAI: captured > 0 || pictures > 0, pictures };
}
