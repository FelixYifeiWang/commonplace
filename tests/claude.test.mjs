import test from "node:test";
import assert from "node:assert/strict";
import {
  focusedClaudeSession,
  readFocusedClaudeSession,
  resolveClaudeTarget,
  findClaudeTranscript,
  claudeProjectSource,
  CLAUDE_BUNDLE_ID,
} from "../desktop/claude.mjs";
import { connectSession } from "../desktop/connect.mjs";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const launch = new Date(2026, 9, 17, 12, 0, 0).getTime();
const pad = (n) => String(n).padStart(2, "0");
const stamp = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const focus = (id, time = launch + 1000) =>
  `${stamp(time)} [info] [CCD] LocalSessions.setFocusedSession: sessionId=${id}`;
const target = (extra = {}) => ({
  bundleId: CLAUDE_BUNDLE_ID,
  pid: 42,
  launchedAt: launch,
  windowCount: 1,
  bounds: { x: 0, y: 0, width: 1200, height: 800 },
  point: { x: 800, y: 400 },
  ...extra,
});
test("the latest focused Claude session is selected", () => {
  assert.equal(
    focusedClaudeSession(
      [focus(`local_${a}`), focus(`local_${b}`, launch + 2000)].join("\n"),
      launch,
    ),
    `local_${b}`,
  );
});
test("a null focus event clears the selection instead of reusing an earlier session", () => {
  assert.throws(
    () =>
      focusedClaudeSession(
        [focus(`local_${a}`), focus("null", launch + 2000)].join("\n"),
        launch,
      ),
    /Open the session/,
  );
});
test("focus events from before Claude launched are ignored", () => {
  assert.throws(
    () => focusedClaudeSession(focus(`local_${a}`, launch - 5000), launch),
    /Open the session/,
  );
});
test("a sidebar location never connects the open Claude session", async () => {
  await assert.rejects(
    readFocusedClaudeSession(target({ point: { x: 100, y: 400 } }), "/none"),
    /Open that session first/,
  );
});
test("several Claude windows fail closed", async () => {
  await assert.rejects(
    readFocusedClaudeSession(target({ windowCount: 2 }), "/none"),
    /one Claude window/,
  );
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "commonplace-claude-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logFile = join(dir, "main.log");
  const sessionsRoot = join(dir, "sessions");
  const projectsRoot = join(dir, "projects");
  await mkdir(join(sessionsRoot, "account", "org"), { recursive: true });
  await mkdir(join(projectsRoot, "-Users-me-app"), { recursive: true });
  await writeFile(logFile, focus(`local_${a}`) + "\n");
  await writeFile(
    join(sessionsRoot, "account", "org", `local_${a}.json`),
    JSON.stringify({
      sessionId: `local_${a}`,
      cliSessionId: b,
      title: "Portfolio references",
      cwd: "/Users/me/app",
    }),
  );
  return { dir, logFile, sessionsRoot, projectsRoot };
}
test("the focused desktop session resolves to its Claude Code transcript", async (t) => {
  const paths = await fixture(t);
  const file = join(paths.projectsRoot, "-Users-me-app", `${b}.jsonl`);
  await writeFile(file, "");
  const source = await resolveClaudeTarget(target(), paths);
  assert.equal(source.sessionId, b);
  assert.equal(source.title, "Portfolio references");
  assert.equal(source.provider, "Claude Code");
  assert.match(source.file, new RegExp(`${b}\\.jsonl$`));
});
test("a session without a transcript is not connected", async (t) => {
  const paths = await fixture(t);
  await assert.rejects(
    resolveClaudeTarget(target(), paths),
    /no transcript yet/,
  );
});
test("a symlinked transcript cannot read a file outside the projects folder", async (t) => {
  const paths = await fixture(t);
  await writeFile(join(paths.dir, "private.jsonl"), "private");
  await symlink(
    join(paths.dir, "private.jsonl"),
    join(paths.projectsRoot, "-Users-me-app", `${b}.jsonl`),
  );
  await assert.rejects(
    findClaudeTranscript(b, paths.projectsRoot),
    /no transcript yet/,
  );
});
test("a Claude target passes the connect gate", async () => {
  const states = [];
  const r = await connectSession({
    inspect: async () => target(),
    resolve: async () => ({ title: "Session", provider: "Claude Code" }),
    subscribe: async () => ({ id: "s" }),
    capture: async () => {},
    report: (v) => states.push(v.state),
  });
  assert.equal(r.connected, true);
  assert.equal(states.at(-1), "following");
});
test("a project folder maps to its Claude Code transcript folder", async (t) => {
  const paths = await fixture(t);
  const source = await claudeProjectSource(
    "/Users/me/app/",
    paths.projectsRoot,
  );
  assert.equal(source.sessionId, "claude-project:/Users/me/app");
  assert.equal(source.title, "app");
  assert.equal(source.folder, true);
  assert.match(source.file, /-Users-me-app$/);
});
test("a folder without Claude Code sessions is not followed", async (t) => {
  const paths = await fixture(t);
  await assert.rejects(
    claudeProjectSource("/Users/me/other", paths.projectsRoot),
    /No Claude Code sessions/,
  );
});
test("a relative project path is rejected", async (t) => {
  const paths = await fixture(t);
  await assert.rejects(
    claudeProjectSource("app", paths.projectsRoot),
    /full path/,
  );
});
test("a symlinked project folder cannot point outside the Claude Code folder", async (t) => {
  const paths = await fixture(t);
  await mkdir(join(paths.dir, "elsewhere"));
  await symlink(
    join(paths.dir, "elsewhere"),
    join(paths.projectsRoot, "-Users-me-escape"),
  );
  await assert.rejects(
    claudeProjectSource("/Users/me/escape", paths.projectsRoot),
    /outside/,
  );
});
