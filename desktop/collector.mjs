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
  let uploaded = 0,
    attempts = 0;
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
    if (!prepared) return;
    if (prepared.data.length > MAX_MEDIA_BYTES) {
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
    if (attempts >= MEDIA_PER_SYNC) break;
    if (sent.has(key)) continue;
    attempts++;
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
  if (!media.captureArtifact)
    return {
      uploaded,
      pendingPasted: [...found.pasted.keys()].some((key) => !sent.has(key)),
    };
  let pendingArtifacts = false;
  for (const event of found.artifacts.values()) {
    let info;
    try {
      info = await stat(event.file);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    const key = `artifact:${ARTIFACT_FRAMING}:${event.url}:${info.size}:${info.mtimeMs}`;
    if (sent.has(key)) continue;
    if (attempts >= MEDIA_PER_SYNC) {
      pendingArtifacts = true;
      continue;
    }
    attempts++;
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
    if (!sent.has(key)) pendingArtifacts = true;
  }
  return {
    uploaded,
    pendingArtifacts,
    pendingPasted: [...found.pasted.keys()].some((key) => !sent.has(key)),
  };
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
  const found = {
    pasted: new Map(),
    artifacts: new Map(
      (subscription.artifacts || []).map((event) => [event.url, event]),
    ),
  };
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
  const boundary = createResponseBoundary(subscription.responseBoundary);
  const onRecord = (line) => boundary.read(line);
  const seen = new Set(cursors[subscription.id] || []);
  const queued = new Set();
  let batch = [],
    size = 0,
    captured = 0,
    total = 0;
  async function sendBatch(complete, finalize = false) {
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
        complete: subscription.mode === "once" && finalize,
      }),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Sign in to your space before syncing this computer.");
    const result = await response.json();
    if (!response.ok) {
      if (
        response.status === 409 &&
        result.code === "IMPORT_COMPLETE" &&
        subscription.mode === "once"
      )
        return false;
      const error = new Error(result.error || "Unable to sync this session.");
      error.status = response.status;
      error.code = result.code;
      throw error;
    }
    for (const entry of batch) seen.add(entry.key);
    captured += batch.length;
    cursors[subscription.id] = [...seen];
    batch = [];
    size = 0;
    queued.clear();
    return true;
  }
  function alreadyCompleted() {
    subscription.historyRemaining = false;
    return {
      captured: 0,
      total: subscription.turns || total,
      pendingAI: false,
      pictures: 0,
      completed: true,
    };
  }
  const versions = {};
  const source = subscription.folder
    ? { file: subscription.file }
    : await resolveTranscript(subscription);
  const historyVersions = { ...subscription.historyVersions };
  let historyRemaining = false;
  let historicalFilesRead = 0;
  async function* selectedTranscripts() {
    const files = [
      ...new Set(source.files || [subscription.file, source.file]),
    ];
    for (const file of files) {
      let info;
      try {
        info = await stat(file);
      } catch (error) {
        if (error.code === "ENOENT" && file !== source.file) continue;
        throw error;
      }
      const version = `${info.size}:${info.mtimeMs}`;
      const previous = subscription.historyVersions?.[file];
      if (previous?.version === version) {
        historyVersions[file] = previous;
        continue;
      }
      // Keep ingestion chronological: a current segment must not leap ahead
      // of deferred history, which Story would otherwise treat as new events.
      if (historicalFilesRead++ >= 6) {
        historyRemaining = true;
        continue;
      }
      let turns = 0;
      for await (const turn of readSelectedTranscript(file, {
        onMedia,
        onRecord: file === source.file ? onRecord : undefined,
      })) {
        turns++;
        yield turn;
      }
      historyVersions[file] = { version, turns };
    }
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
    const legacyKey = createHash("sha256")
      .update(`${turn.id}:${turn.text}`)
      .digest("hex");
    // Rotated Codex files copy messages at different line offsets. Timestamps
    // identify those copies; explicit Claude UUIDs remain unchanged.
    if (source.files && /^line-\d+$/.test(turn.id) && turn.timestamp)
      turn.id = `message-${createHash("sha256").update(`${turn.role}:${turn.timestamp}:${turn.text}`).digest("hex")}`;
    const key = createHash("sha256")
      .update(`${turn.id}:${turn.text}`)
      .digest("hex");
    if (seen.has(legacyKey)) {
      seen.add(key);
      continue;
    }
    if (seen.has(key) || queued.has(key)) continue;
    const length = Buffer.byteLength(JSON.stringify(turn), "utf8");
    if (batch.length && (batch.length >= 10 || size + length > 700000))
      if (!(await sendBatch(false))) return alreadyCompleted();
    batch.push({ turn, key });
    queued.add(key);
    size += length;
  }
  // Acknowledge text before uploading its media. A text-only import can finish
  // here; media-enabled imports finish only after every available picture is acknowledged.
  if (!(await sendBatch(true, !media && !historyRemaining)))
    return alreadyCompleted();
  // Persist the new path only after the server has acknowledged its contents.
  Object.assign(subscription, source);
  if (subscription.folder) {
    total = Object.values(versions).reduce((n, v) => n + v.turns, 0);
  }
  const mediaResult = media
    ? await uploadMedia({
        connection,
        subscription,
        cursors,
        request,
        media,
        found,
      })
    : { uploaded: 0, pendingPasted: false };
  if (
    media &&
    subscription.mode === "once" &&
    !historyRemaining &&
    !mediaResult.pendingPasted &&
    !mediaResult.pendingArtifacts
  )
    if (!(await sendBatch(true, true))) return alreadyCompleted();
  // Revisit either kind of transcript until its remaining pictures are stored.
  if (!mediaResult.pendingPasted) {
    if (subscription.folder) subscription.versions = versions;
    else subscription.historyVersions = historyVersions;
  }
  subscription.responseBoundary = boundary.snapshot();
  subscription.artifacts = [...found.artifacts.values()];
  subscription.historyRemaining =
    historyRemaining ||
    mediaResult.pendingPasted ||
    !!mediaResult.pendingArtifacts;
  if (!subscription.folder)
    total = Object.values(historyVersions).reduce((n, v) => n + v.turns, 0);
  const pictures = mediaResult.uploaded;
  return { captured, total, pendingAI: captured > 0 || pictures > 0, pictures };
}
