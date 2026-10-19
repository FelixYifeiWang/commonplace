export function safeUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
// Sentence punctuation and Markdown emphasis such as **https://example.com** are not part of the address.
export function trimUrl(raw) {
  return raw.replace(/[.,;:!?*]+$/, "");
}
export function itemIdentity(item) {
  if (item.url) {
    const url = new URL(item.url);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `url:${url.href}`;
  }
  return item.externalId
    ? `item:${item.externalId}`
    : `text:${String(item.title).trim().toLowerCase()}`;
}
export function normalizeItem(value) {
  if (!value || typeof value !== "object")
    throw new Error("Each item must be an object.");
  const text = (key, limit, required = false) => {
    if (value[key] != null && typeof value[key] !== "string")
      throw new Error(`${key} must be text.`);
    const result = (value[key] || "").trim();
    if (required && !result) throw new Error(`${key} is required.`);
    if (result.length > limit) throw new Error(`${key} is too long.`);
    return result;
  };
  if (
    ![
      "link",
      "image",
      "video",
      "idea",
      "quote",
      "note",
      "audio",
      "document",
      "file",
    ].includes(value.kind)
  )
    throw new Error("Unknown item kind.");
  const url = value.url ? safeUrl(value.url) : null;
  if (
    (value.url && !url) ||
    (["link", "image", "video", "audio", "document", "file"].includes(
      value.kind,
    ) &&
      !url)
  )
    throw new Error("A valid HTTP or HTTPS source URL is required.");
  return {
    kind: value.kind,
    title: text("title", 240, true),
    body: text("body", 12000),
    url,
    imageUrl: safeUrl(value.imageUrl),
    sourceText: text("sourceText", 16000, true),
    sourceRole: ["user", "assistant", "tool"].includes(value.sourceRole)
      ? value.sourceRole
      : "assistant",
    sourceTurn: text("sourceTurn", 240),
    externalId: text("externalId", 240),
    inferred: value.inferred === true,
  };
}
export function validateIngest(value) {
  if (!value || !Array.isArray(value.items) || value.items.length > 100)
    throw new Error("Send an items array with at most 100 items.");
  if (
    value.state &&
    !["reading", "collecting", "connecting", "following", "complete"].includes(
      value.state,
    )
  )
    throw new Error("Unknown processing state.");
  return { ...value, items: value.items.map(normalizeItem) };
}
export function parseTranscript(raw, startLineIndex = 0) {
  const turns = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    // A message the human sent while the assistant was working is stored as a queued attachment.
    if (
      record.type === "attachment" &&
      record.attachment?.type === "queued_command"
    ) {
      const prompt = record.attachment.prompt;
      const text =
        typeof prompt === "string"
          ? prompt
          : Array.isArray(prompt)
            ? prompt
                .filter((p) => p?.type === "text")
                .map((p) => p.text || "")
                .join("\n")
            : "";
      if (text.trim())
        turns.push({
          id: record.uuid || `line-${startLineIndex + index}`,
          role: "user",
          text,
          timestamp: record.timestamp || null,
        });
      continue;
    }
    const message =
      record.type === "response_item"
        ? record.payload
        : record.message || record;
    const role = message?.role || record.role;
    if (!message || !["user", "assistant"].includes(role)) continue;
    const content = message.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter((p) =>
                ["text", "input_text", "output_text"].includes(p.type),
              )
              .map((p) => p.text || "")
              .join("\n")
          : "";
    if (text.trim())
      turns.push({
        id: record.uuid || record.id || `line-${startLineIndex + index}`,
        role,
        text,
        timestamp: record.timestamp || null,
      });
  }
  return turns;
}

// Read-only collection URLs are capabilities, not gallery sources or model evidence.
export function redactReferenceLinks(value, { preserveLength = false } = {}) {
  return String(value || "").replace(
    /https?:\/\/[^\s<>"'/?#]+\/r\/[a-f0-9]{48}\.md\b/gi,
    (match) =>
      preserveLength
        ? "[private collection reference]".padEnd(match.length, " ")
        : "[private collection reference]",
  );
}
