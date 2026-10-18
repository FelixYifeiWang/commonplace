import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseSetupLink,
  validateManifest,
  install,
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
  const server = createServer(async (req, res) => {
    try {
      const content = await readFile(
        "public" + new URL(req.url, "http://local").pathname,
      );
      res.end(content);
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
  const folder = join(home, ".claude/projects/qa");
  await mkdir(folder, { recursive: true });
  const file = join(folder, "selected.jsonl");
  let installs = 0,
    boots = 0,
    kicks = 0,
    data;
  const run = async (command, args, options) => {
    if (command === "npm") {
      installs++;
      assert.deepEqual(args, ["ci", "--omit=dev", "--no-audit", "--no-fund"]);
      await mkdir(join(options.cwd, "node_modules/electron"), {
        recursive: true,
      });
      await writeFile(
        join(options.cwd, "node_modules/electron/path.txt"),
        "test",
      );
    } else if (args[0] === "bootstrap") {
      boots++;
      const plist = await readFile(args[2], "utf8");
      assert.ok(plist.includes("<key>RunAtLoad</key><true/>"));
      assert.ok(
        !plist.includes("/Contents/MacOS/Electron</string><string>/desktop"),
      );
      data = plist.match(
        /<key>COMMONPLACE_DATA_DIR<\/key><string>([^<]+)<\/string>/,
      )[1];
    } else if (args[0] === "kickstart") kicks++;
    if (["bootstrap", "kickstart"].includes(args[0])) {
      const request = JSON.parse(
        await readFile(join(data, "setup-request.json")),
      );
      assert.equal(request.source.provider, "Claude Code");
      await mkdir(join(data, "receipts"), { recursive: true });
      await writeFile(
        join(data, "receipts", request.id + ".json"),
        JSON.stringify({ ok: true }),
      );
    }
  };
  for (const code of ["a".repeat(64), "b".repeat(64)]) {
    const link = origin + "/setup#" + code;
    await writeFile(
      file,
      JSON.stringify({ role: "user", content: "Set up " + link }) + "\n",
    );
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
});
