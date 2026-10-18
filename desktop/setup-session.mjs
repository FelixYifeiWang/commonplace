import { readdir, realpath, open, stat } from "node:fs/promises";
import { join, relative, isAbsolute, basename } from "node:path";
import { homedir } from "node:os";
import { parseTranscript } from "../lib/protocol.mjs";
function roots(home, codexHome) {
  return [
    {
      provider: "Codex",
      root: join(codexHome || join(home, ".codex"), "sessions"),
      depth: 4,
    },
    {
      provider: "Claude Code",
      root: join(home, ".claude", "projects"),
      depth: 2,
    },
    { provider: "Cursor", root: join(home, ".cursor", "projects"), depth: 4 },
  ];
}
async function* walk(root, depth) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name === "subagents") continue;
    const file = join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith(".jsonl")) yield file;
    else if (entry.isDirectory() && depth > 0) yield* walk(file, depth - 1);
  }
}
export async function validateSessionSource(
  source,
  { home = homedir(), codexHome = process.env.CODEX_HOME } = {},
) {
  const canonical = await realpath(source.file);
  for (const group of roots(home, codexHome)) {
    if (source.provider !== group.provider) continue;
    let root;
    try {
      root = await realpath(group.root);
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    const local = relative(root, canonical);
    if (
      local &&
      !local.startsWith("..") &&
      !isAbsolute(local) &&
      canonical.endsWith(".jsonl") &&
      !local.split("/").includes("subagents") &&
      (group.provider !== "Cursor" ||
        local.split("/").includes("agent-transcripts"))
    ) {
      const name = basename(canonical, ".jsonl");
      const sessionId =
        group.provider === "Codex"
          ? name.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)?.[0]
          : name;
      if (!sessionId)
        throw new Error("Transcript has no stable session identifier.");
      if (source.sessionId && source.sessionId !== sessionId)
        throw new Error("Transcript does not match the selected session.");
      return {
        provider: group.provider,
        file: canonical,
        sessionId,
        title: String(source.title || `${group.provider} session`).slice(
          0,
          120,
        ),
      };
    }
  }
  throw new Error("Transcript is outside the supported session folders.");
}
export async function findSetupSession(
  code,
  {
    home = homedir(),
    codexHome = process.env.CODEX_HOME,
    file: explicitFile,
    linkPath = "/setup",
  } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(code))
    throw new Error("Invalid setup link. Copy a fresh link from your space.");
  const matches = [];
  let checked = 0,
    bytes = 0;
  for (const group of roots(home, codexHome)) {
    const files = explicitFile ? [explicitFile] : walk(group.root, group.depth);
    for await (const file of files) {
      if (
        group.provider === "Cursor" &&
        !file.split("/").includes("agent-transcripts")
      )
        continue;
      if (++checked > 12000)
        throw new Error(
          "Too many session files. Pass this conversation’s exact transcript path.",
        );
      let source;
      try {
        source = await validateSessionSource(
          { file, provider: group.provider },
          { home, codexHome },
        );
      } catch (e) {
        if (explicitFile) continue;
        throw e;
      }
      const info = await stat(source.file);
      if (!explicitFile && info.mtimeMs < Date.now() - 60 * 60 * 1000) continue;
      const handle = await open(source.file, "r");
      let tail;
      try {
        const length = Math.min(info.size, 4 * 1024 * 1024);
        bytes += length;
        if (bytes > 128 * 1024 * 1024)
          throw new Error(
            "Session search is too large. Pass this conversation’s exact transcript path.",
          );
        const buffer = Buffer.alloc(length);
        const read = await handle.read(buffer, 0, length, info.size - length);
        tail = buffer.toString("utf8", 0, read.bytesRead);
      } finally {
        await handle.close();
      }
      const turns = parseTranscript(tail);
      if (
        !turns.some(
          (t) => t.role === "user" && t.text.includes(linkPath + "#" + code),
        )
      )
        continue;
      const first = turns.find(
        (t) =>
          t.role === "user" &&
          !t.text.includes(code) &&
          !t.text.startsWith("<") &&
          !t.text.startsWith("# AGENTS"),
      );
      if (first) source.title = first.text.replace(/\s+/g, " ").slice(0, 100);
      matches.push(source);
    }
  }
  if (matches.length > 1)
    throw new Error(
      "Setup link appears in more than one conversation. Copy a fresh link and paste it only in the session you want.",
    );
  if (!matches.length)
    throw new Error(
      "Setup prompt not found in a saved local transcript. Wait for the agent to save it, or pass this session’s exact JSONL path. Cloud-only agents and disabled transcripts cannot be followed.",
    );
  return matches[0];
}
export function redactSetupLinks(text) {
  return text.replace(
    /(https?:\/\/[^\s<>"']+\/(?:setup|connect|agent))#[a-f0-9]{64}\b/gi,
    "[private setup link]",
  );
}
