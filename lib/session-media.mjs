// Pictures that live inside a session transcript (STORY_CANVAS.md, "Human-made material first"):
// images the human pasted, and artifacts the assistant published from a local file. The companion
// reads them, because only it can see the transcript's images and the artifacts' local files.

export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const ARTIFACT =
  /^https:\/\/claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9_-]{6,64})(?:[?#].*)?$/;
const PUBLISHED =
  /^Published (.+?) at (https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+)/;

export function artifactUrl(value) {
  const match = ARTIFACT.exec(String(value || ""));
  return match ? `https://claude.ai/artifact/${match[1]}` : null;
}

// Pages on claude.ai open only for their owner. Anyone else, including our server, gets Claude's
// default card or a sign-in page, which never shows the page itself.
export function privatePage(url) {
  try {
    const host = new URL(url).hostname;
    return host === "claude.ai" || host.endsWith(".claude.ai");
  } catch {
    return false;
  }
}

const textOf = (parts) =>
  parts
    .filter((p) => ["text", "input_text"].includes(p?.type))
    .map((p) => p.text || "")
    .join("\n")
    .trim()
    .slice(0, 2000);

function pasted(parts, turnId) {
  const context = textOf(parts);
  const events = [];
  for (const part of parts) {
    let mimeType, data;
    if (part?.type === "image" && part.source?.type === "base64") {
      mimeType = part.source.media_type;
      data = part.source.data;
    } else if (part?.type === "input_image") {
      const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(
        part.image_url || "",
      );
      if (match) [, mimeType, data] = match;
    }
    if (IMAGE_TYPES.includes(mimeType) && typeof data === "string" && data)
      events.push({ kind: "pasted", turnId, mimeType, data, context });
  }
  return events;
}

const resultText = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((c) => c?.text || "").join("\n")
      : "";

// One reader per pass over a transcript: a publish is known only when its result arrives on a later line.
export function createMediaReader() {
  const publishing = new Map();
  return {
    read(line, lineIndex = 0) {
      // Most lines hold neither an image nor an artifact; skip parsing them.
      if (
        !/"(?:image|input_image|tool_use_id)"|"name":"Artifact"|"queued_command"/.test(
          line,
        )
      )
        return [];
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        return [];
      }
      const turnId = record.uuid || record.id || `line-${lineIndex}`;
      if (
        record.type === "attachment" &&
        record.attachment?.type === "queued_command" &&
        Array.isArray(record.attachment.prompt)
      )
        return pasted(record.attachment.prompt, turnId);
      const message =
        record.type === "response_item" ? record.payload : record.message;
      if (!message || !Array.isArray(message.content)) return [];
      if (message.role === "assistant") {
        for (const part of message.content) {
          const input = part?.input || {};
          if (
            part?.type === "tool_use" &&
            part.name === "Artifact" &&
            (input.action || "publish") === "publish" &&
            !input.asset &&
            /\.html?$/i.test(input.file_path || "")
          )
            publishing.set(part.id, {
              turnId,
              file: input.file_path,
              context: String(input.description || "").slice(0, 2000),
            });
        }
        return [];
      }
      if (message.role !== "user") return [];
      const events = pasted(message.content, turnId);
      for (const part of message.content) {
        if (part?.type !== "tool_result" || !publishing.has(part.tool_use_id))
          continue;
        const use = publishing.get(part.tool_use_id);
        publishing.delete(part.tool_use_id);
        const match = PUBLISHED.exec(resultText(part.content));
        const url = match && match[1] === use.file && artifactUrl(match[2]);
        if (url) events.push({ kind: "artifact", ...use, url });
      }
      return events;
    },
  };
}

const MAGIC = {
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  "image/webp": (b) =>
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP",
};
function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
const clean = (value, max) =>
  typeof value === "string"
    ? value.replace(/[\x00-\x08\x0b-\x1f]/g, "").slice(0, max)
    : "";

// What /api/capture/media accepts from the companion: one image, checked by its bytes, not its label.
export function parseMediaUpload(body) {
  if (!body || !["pasted", "artifact"].includes(body.kind))
    fail("Send a pasted image or an artifact capture.");
  if (
    typeof body.turnId !== "string" ||
    !body.turnId ||
    body.turnId.length > 240
  )
    fail("Each picture needs the ID of its turn.");
  if (
    !IMAGE_TYPES.includes(body.mimeType) ||
    typeof body.data !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)
  )
    fail("Send a PNG, JPEG, WebP or GIF image.");
  if (body.data.length > Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 4)
    fail("This picture is too large.");
  const binary = atob(body.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length > MAX_MEDIA_BYTES) fail("This picture is too large.");
  if (bytes.length < 12 || !MAGIC[body.mimeType](bytes))
    fail("This file is not the image it claims to be.");
  const url = body.kind === "artifact" ? artifactUrl(body.url) : null;
  if (body.kind === "artifact" && !url)
    fail("A capture must belong to a claude.ai artifact.");
  return {
    kind: body.kind,
    turnId: body.turnId,
    mimeType: body.mimeType,
    bytes,
    url,
    title: clean(body.title, 240),
    context: clean(body.context, 4000),
  };
}
