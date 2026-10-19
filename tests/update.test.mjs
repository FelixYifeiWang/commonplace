import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  readdir,
  rm,
  cp,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { updateNox } from "../desktop/update.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const ORIGIN = "https://nox.example";

// A published release: its files and a manifest exactly as scripts/package-companion.mjs writes them.
function release(files) {
  const list = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({
      path,
      size: Buffer.byteLength(content),
      sha256: digest(content),
    }));
  return {
    files,
    manifest: {
      version: 1,
      release: digest(JSON.stringify(list)),
      files: list,
    },
  };
}
const base = {
  "package.json": '{"name":"nox"}',
  "package-lock.json": '{"lockfileVersion":3,"electron":"44.9.0"}',
  "desktop/setup-session.mjs": "export {};",
  "desktop/native/bin/commonplace-target": "binary",
};

async function fixture(t, { next = {} } = {}) {
  const home = await mkdtemp(join(tmpdir(), "nox-update-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = join(home, "space");
  const old = release({ ...base, "desktop/main.mjs": "// old" });
  const running = join(root, "releases", old.manifest.release);
  for (const [path, content] of Object.entries(old.files)) {
    await mkdir(join(running, path, ".."), { recursive: true });
    await writeFile(join(running, path), content);
  }
  // The Electron runtime the installer put in place.
  const electron = join(running, "node_modules/electron");
  await mkdir(electron, { recursive: true });
  await writeFile(
    join(electron, "path.txt"),
    "Electron.app/Contents/MacOS/Electron",
  );
  for (const name of [
    "Electron.app/Contents/MacOS/Electron",
    "Electron.app/Contents/Info.plist",
    "Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework",
  ]) {
    await mkdir(join(electron, "dist", name, ".."), { recursive: true });
    await writeFile(join(electron, "dist", name), "fixture", { mode: 0o700 });
  }
  await symlink(running, join(root, "current"));
  const published = release({ ...base, "desktop/main.mjs": "// new", ...next });
  const downloads = [];
  let tamper = null;
  const download = async (url) => {
    downloads.push(url.slice(ORIGIN.length));
    if (url === ORIGIN + "/companion/manifest.json")
      return Buffer.from(JSON.stringify(published.manifest));
    const path = url.slice((ORIGIN + "/companion/files/").length);
    if (path === tamper) return Buffer.from("// changed in transit");
    return Buffer.from(published.files[path]);
  };
  // `runtime` is the release Nox is running from: after an update, Nox restarts on the new one.
  let remove;
  const update = (runtime = running) =>
    updateNox({
      origin: ORIGIN,
      root,
      runtime,
      ...(remove ? { remove } : {}),
      download,
      clone: (from, to) => cp(from, to, { recursive: true }),
    });
  return {
    root,
    running,
    published,
    downloads,
    update,
    tamperWith: (path) => (tamper = path),
    refuseRemoval: () =>
      (remove = async () => {
        throw Object.assign(new Error("Operation not permitted"), {
          code: "EPERM",
        });
      }),
    current: () => readlink(join(root, "current")),
  };
}

test("Nox moves to a new release only after every file is verified, keeping its runtime", async (t) => {
  const { root, running, published, update, current } = await fixture(t);
  const result = await update();
  const next = join(root, "releases", published.manifest.release);
  assert.deepEqual(result, {
    status: "updated",
    release: published.manifest.release,
  });
  assert.equal(await current(), next);
  assert.equal(
    await readFile(join(next, "desktop/main.mjs"), "utf8"),
    "// new",
  );
  assert.equal(
    await readFile(join(next, "node_modules/electron/path.txt"), "utf8"),
    "Electron.app/Contents/MacOS/Electron",
  );
  // The release still running stays until Nox has restarted on the new one.
  assert.ok(
    (await readdir(join(root, "releases"))).includes(running.split("/").pop()),
  );
});

test("Nox running through the current link knows which release it is", async (t) => {
  const { root, update } = await fixture(t);
  await update();
  assert.deepEqual(await update(join(root, "current")), { status: "current" });
});

test("an old release macOS will not delete never stops the update", async (t) => {
  const { root, published, update, refuseRemoval, current } = await fixture(t);
  await mkdir(join(root, "releases", "older"), { recursive: true });
  refuseRemoval();
  assert.deepEqual(await update(), {
    status: "updated",
    release: published.manifest.release,
  });
  assert.equal(
    await current(),
    join(root, "releases", published.manifest.release),
  );
});

test("a file that does not match the published release never becomes current", async (t) => {
  const { running, update, tamperWith, current } = await fixture(t);
  tamperWith("desktop/main.mjs");
  await assert.rejects(update(), /release changed/i);
  assert.equal(await current(), running);
});

test("an up-to-date Nox downloads nothing but the manifest", async (t) => {
  const { update, downloads, current } = await fixture(t);
  await update();
  downloads.length = 0;
  assert.deepEqual(await update(await current()), { status: "current" });
  assert.deepEqual(downloads, ["/companion/manifest.json"]);
});

test("a release that needs a different Electron runtime waits for setup", async (t) => {
  const { root, running, update, current } = await fixture(t, {
    next: { "package-lock.json": '{"lockfileVersion":3,"electron":"45.0.0"}' },
  });
  assert.deepEqual(await update(), { status: "needs-setup" });
  assert.equal(await current(), running);
  assert.deepEqual(await readdir(join(root, "releases")), [
    running.split("/").pop(),
  ]);
});

test("Nox never updates while setup is running", async (t) => {
  const { root, running, update, current } = await fixture(t);
  await mkdir(join(root, "install.lock"));
  assert.deepEqual(await update(), { status: "busy" });
  assert.equal(await current(), running);
});
