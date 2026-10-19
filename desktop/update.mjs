// Nox keeps itself current: the same verified release the installer would fetch, switched in by moving
// root/current, then a restart. Setup is still needed when a release brings a different Electron runtime.
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  download,
  fetchRelease,
  pointCurrent,
  validateManifest,
  verifyRuntime,
} from "./install.mjs";

const exec = promisify(execFile);
const digest = (value) => createHash("sha256").update(value).digest("hex");
// An APFS clone: the Electron runtime is copied instantly and takes no extra space.
const cloneDir = (from, to) => exec("/bin/cp", ["-cR", from, to]);

export async function updateNox({
  origin,
  root,
  runtime,
  download: get = download,
  clone = cloneDir,
  remove = (dir) => rm(dir, { recursive: true, force: true }),
}) {
  // The installer holds the same lock; never change releases under it.
  const lock = join(root, "install.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") return { status: "busy" };
    throw error;
  }
  try {
    // Nox may see its folder through the current link; compare real release folders.
    runtime = await realpath(runtime);
    const manifest = validateManifest(
      JSON.parse((await get(origin + "/companion/manifest.json")).toString()),
    );
    if (manifest.release === basename(runtime)) return { status: "current" };
    const lockfile = await readFile(join(runtime, "package-lock.json"));
    const sameRuntime = (sha) => sha === digest(lockfile);
    if (
      !sameRuntime(
        manifest.files.find((f) => f.path === "package-lock.json").sha256,
      )
    )
      return { status: "needs-setup" };
    const { manifest: fetched, runtime: next } = await fetchRelease({
      origin,
      root,
      get,
    });
    if (next === runtime) return { status: "current" };
    if (!sameRuntime(digest(await readFile(join(next, "package-lock.json"))))) {
      await rm(next, { recursive: true, force: true });
      return { status: "needs-setup" };
    }
    try {
      await access(join(next, "node_modules"));
    } catch {
      await clone(join(runtime, "node_modules"), join(next, "node_modules"));
    }
    await chmod(join(next, "desktop/native/bin/commonplace-target"), 0o755);
    await verifyRuntime(next);
    await writeFile(join(next, ".installed"), "1");
    await pointCurrent(root, next);
    // Keep the release that is running and the new one; older releases are no longer needed. Removal is
    // best-effort: macOS App Management can refuse to delete an old Electron.app, and a leftover folder
    // must never stop the restart onto the new release.
    for (const name of await readdir(join(root, "releases")))
      if (![basename(runtime), basename(next)].includes(name))
        await remove(join(root, "releases", name)).catch(() => {});
    return { status: "updated", release: fetched.release };
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
