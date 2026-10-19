import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseSetupLink,
  validateManifest,
  install,
  verifyRuntime,
  installLauncher,
  bootstrapBuddy,
  installAppShortcut,
} from "../desktop/install.mjs";
import { redactSetupLinks } from "../desktop/setup-session.mjs";
test("installer accepts only a private setup link on HTTPS or local development", () => {
  assert.equal(
    parseSetupLink("https://space.example/setup#" + "a".repeat(64)).origin,
    "https://space.example",
  );
  for (const link of [
    "http://public.example/setup#" + "a".repeat(64),
    "https://user:pass@space.example/setup#" + "a".repeat(64),
    "https://space.example/setup?code=secret",
    "https://space.example/agent#" + "a".repeat(64),
  ])
    assert.throws(() => parseSetupLink(link));
});
test("release hashes and paths fail closed before any downloaded code runs", async () => {
  const manifest = JSON.parse(await readFile("public/companion/manifest.json"));
  assert.equal(validateManifest(manifest).version, 1);
  assert.throws(() =>
    validateManifest({
      ...manifest,
      files: [{ ...manifest.files[0], path: "../../outside" }],
    }),
  );
  assert.throws(() =>
    validateManifest({ ...manifest, release: "0".repeat(64) }),
  );
});
test("a cloud Linux agent cannot claim to install a laptop buddy", async () => {
  await assert.rejects(
    install(
      { link: "https://space.example/setup#" + "a".repeat(64) },
      { platform: "linux" },
    ),
    /local macOS/,
  );
});
test("pairing credentials are removed before transcript upload and link extraction", () => {
  assert.equal(
    redactSetupLinks("Set up https://space.example/setup#" + "a".repeat(64)),
    "Set up [private setup link]",
  );
});

test("first install prepares a private per-space LaunchAgent; repeat setup reuses the runtime", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { createServer } = await import("node:http");
  const home = await mkdtemp(join(tmpdir(), "buddy-install-"));
  let releaseChanged = false,
    manifestDownloads = 0;
  const server = createServer(async (req, res) => {
    try {
      const content = await readFile(
        "public" + new URL(req.url, "http://local").pathname,
      );
      if (req.url.endsWith("manifest.json")) manifestDownloads++;
      if (req.url.endsWith("desktop/main.mjs") && !releaseChanged) {
        releaseChanged = true;
        res.end(Buffer.concat([content, Buffer.from("\n")]));
      } else res.end(content);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await rm(home, { recursive: true, force: true });
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const file = join(home, ".claude/projects/qa/selected.jsonl");
  let installs = 0,
    boots = 0,
    kicks = 0,
    data;
  const run = async (command, args, options) => {
    if (args[0] === "--register-opener")
      return { stdout: JSON.stringify({ handler: args[1] }) };
    if (command === "npm") {
      installs++;
      assert.deepEqual(args, ["ci", "--omit=dev", "--no-audit", "--no-fund"]);
      await mkdir(join(options.cwd, "node_modules/electron"), {
        recursive: true,
      });
      await writeFile(
        join(options.cwd, "node_modules/electron/path.txt"),
        "Electron.app/Contents/MacOS/Electron",
      );
    } else if (command === process.execPath) {
      const dist = join(options.cwd, "node_modules/electron/dist");
      for (const name of [
        "Electron.app/Contents/MacOS/Electron",
        "Electron.app/Contents/Info.plist",
        "Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework",
      ]) {
        const target = join(dist, name);
        await mkdir(join(target, ".."), { recursive: true });
        await writeFile(target, "fixture", { mode: 0o700 });
      }
    } else if (args[0] === "bootstrap") {
      boots++;
      const plist = await readFile(args[2], "utf8");
      assert.ok(plist.includes("<key>RunAtLoad</key><true/>"));
      assert.ok(
        !plist.includes("/Contents/MacOS/Electron</string><string>/desktop"),
      );
      // Nox starts through root/current, so a self-update only moves that link.
      assert.match(
        plist,
        /\/current\/node_modules\/electron\/dist\/Electron\.app\/Contents\/MacOS\/Electron<\/string><string>[^<]+\/current<\/string>/,
      );
      data = plist.match(
        /<key>COMMONPLACE_DATA_DIR<\/key><string>([^<]+)<\/string>/,
      )[1];
    } else if (args[0] === "kickstart") kicks++;
    if (["bootstrap", "kickstart"].includes(args[0])) {
      const request = JSON.parse(
        await readFile(join(data, "setup-request.json")),
      );
      if (boots === 1 && kicks === 0) {
        assert.equal(request.action, "setup");
        assert.equal(request.source, undefined);
      } else {
        assert.equal(request.action, "connect");
        assert.equal(request.source.provider, "Claude Code");
      }
      await mkdir(join(data, "receipts"), { recursive: true });
      await writeFile(
        join(data, "receipts", request.id + ".json"),
        JSON.stringify({ ok: true }),
      );
    }
  };
  for (const code of ["a".repeat(64), "b".repeat(64)]) {
    const link =
      origin + (code.startsWith("a") ? "/setup#" : "/connect#") + code;
    if (code.startsWith("b")) {
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(
        file,
        JSON.stringify({ role: "user", content: "Connect " + link }) + "\n",
      );
    }
    assert.equal(
      (
        await install(
          { link },
          { home, platform: "darwin", run, onProgress: () => {} },
        )
      ).ok,
      true,
    );
  }
  assert.deepEqual([installs, boots, kicks], [1, 1, 1]);
  assert.equal(
    manifestDownloads,
    3,
    "The first install retries a changed release; repeat setup reads it once",
  );
  let launched = false;
  await assert.rejects(
    install(
      { link: origin + "/setup#" + "c".repeat(64) },
      {
        home: join(home, "blocked-fixture"),
        platform: "darwin",
        onProgress: () => {},
        run: async (command) => {
          if (command === process.execPath)
            throw new Error("Operation not permitted");
          if (command === "/bin/launchctl") launched = true;
        },
      },
    ),
    /macOS blocked/,
  );
  assert.equal(launched, false);
});

test("a success marker cannot hide a missing Electron executable", async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "buddy-incomplete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "node_modules/electron"), { recursive: true });
  await writeFile(join(root, ".installed"), "1");
  await writeFile(
    join(root, "node_modules/electron/path.txt"),
    "Electron.app/Contents/MacOS/Electron",
  );
  await assert.rejects(verifyRuntime(root), { code: "ENOENT" });
});

test("Markdown setup links pair without selecting a session", () => {
  for (const path of ["/setup.md", "/SKILL.md"]) {
    const link = "https://space.example" + path + "#" + "a".repeat(64);
    assert.equal(parseSetupLink(link).action, "setup");
    assert.equal(
      redactSetupLinks("Set up " + link),
      "Set up [private setup link]",
    );
  }
});

test("launcher registers a reveal-only app without modifying Electron", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "buddy-launcher-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const appPath = await installLauncher(
    {
      root,
      origin: "https://space.example",
      data: join(root, "data"),
      service: "gui/501/ai.commonplace.test",
      plist: join(root, "agent.plist"),
      space: "test",
      helper: join(root, "commonplace-target"),
    },
    async (...args) => {
      calls.push(args);
      return {
        stdout: JSON.stringify({ handler: "ai.commonplace.opener.test" }),
      };
    },
  );
  const script = await readFile(join(root, "open-buddy.applescript"), "utf8");
  assert.ok(script.includes("on open location incomingURL"));
  assert.ok(
    script.includes("commonplace://show?origin=https%3A%2F%2Fspace.example"),
  );
  assert.ok(script.includes("show-request"));
  assert.ok(!script.includes("setup-request"));
  assert.ok(!script.includes("incomingURL &"));
  assert.equal(calls[0][0], "/usr/bin/osacompile");
  assert.ok(calls.some(([, args]) => args.includes("CFBundleURLTypes")));
  for (const field of ["CFBundleName", "CFBundleDisplayName"])
    assert.ok(calls.some(([, args]) => args[1] === field && args[3] === "Nox"));
  assert.deepEqual(calls.at(-2)[1], ["-f", appPath]);
  assert.deepEqual(calls.at(-1)[1], [
    "--register-opener",
    "ai.commonplace.opener.test",
  ]);
  assert.ok(!JSON.stringify(calls).includes("Electron.app"));
});

test("setup fails instead of claiming success when the URL handler remains Electron", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "buddy-handler-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    installLauncher(
      {
        root,
        origin: "https://space.example",
        data: root,
        service: "gui/501/ai.commonplace.test",
        plist: join(root, "agent.plist"),
        space: "test",
        helper: join(root, "helper"),
      },
      async () => ({
        stdout: JSON.stringify({ handler: "com.github.electron" }),
      }),
    ),
    /Could not register/,
  );
});

test("launch retries the macOS teardown race, but never retries unrelated failures", async () => {
  let attempts = 0;
  const delays = [];
  await bootstrapBuddy(
    "/buddy.plist",
    async () => {
      if (++attempts < 3)
        throw Object.assign(
          new Error("Bootstrap failed: 5: Input/output error"),
          { stderr: "Bootstrap failed: 5" },
        );
    },
    async (ms) => delays.push(ms),
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [300, 600]);
  await assert.rejects(
    bootstrapBuddy(
      "/buddy.plist",
      async () => {
        throw new Error("Permission denied");
      },
      async () => assert.fail("Must not retry permission denial"),
    ),
    /Permission denied/,
  );
});
test("Nox app shortcut is repeatable and preserves an existing app", async (t) => {
  const { mkdtemp, readlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = await mkdtemp(join(tmpdir(), "buddy-shortcut-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await installAppShortcut(home, "/first/Commonplace.app");
  await installAppShortcut(home, "/other/Commonplace.app");
  assert.equal(
    await readlink(join(home, "Applications/Nox.app")),
    "/first/Commonplace.app",
  );
});

test("shortcut migration removes only an owned legacy alias", async (t) => {
  const { mkdtemp, mkdir, symlink, readlink, access, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = await mkdtemp(join(tmpdir(), "nox-upgrade-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const apps = join(home, "Applications");
  await mkdir(apps);
  await symlink("/owned/Commonplace.app", join(apps, "Newron.app"));
  await installAppShortcut(home, "/owned/Commonplace.app");
  assert.equal(await readlink(join(apps, "Nox.app")), "/owned/Commonplace.app");
  await assert.rejects(access(join(apps, "Newron.app")), { code: "ENOENT" });
  await symlink("/unrelated/app", join(apps, "Newron.app"));
  await installAppShortcut(home, "/owned/Commonplace.app");
  assert.equal(await readlink(join(apps, "Newron.app")), "/unrelated/app");
});
