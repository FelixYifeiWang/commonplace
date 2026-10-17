import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import electron from "electron";
import { publicUrl } from "../lib/media.mjs";
const exec = promisify(execFile);
export function createScreenshotCache(root) {
  const lanes = [Promise.resolve()];
  let nextLane = 0;
  const pending = new Map(),
    failures = new Map();
  return async (url) => {
    if (!publicUrl(url)) throw new Error("Public web pages only.");
    const key = createHash("sha256")
        .update("content-ready-v2:" + url)
        .digest("hex"),
      file = join(root, key + ".jpg");
    try {
      return await readFile(file);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if ((failures.get(key) || 0) > Date.now())
      throw new Error("Screenshot unavailable.");
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 32) throw new Error("Screenshot queue busy.");
    const lane = nextLane++ % lanes.length;
    const work = lanes[lane].then(async () => {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const profile = await mkdtemp(join(root, "capture-"));
      try {
        await exec(
          electron,
          [
            fileURLToPath(new URL("./screenshot-worker.mjs", import.meta.url)),
            url,
            file,
            profile,
          ],
          { timeout: 33000, maxBuffer: 128 * 1024, env },
        );
        return await readFile(file);
      } catch (error) {
        console.warn(
          "Page screenshot unavailable:",
          error.stderr?.trim().slice(-400) || error.message,
        );
        await rm(file, { force: true });
        failures.set(key, Date.now() + 10 * 60 * 1000);
        throw new Error("Screenshot unavailable.");
      } finally {
        await rm(profile, { recursive: true, force: true });
      }
    });
    pending.set(key, work);
    lanes[lane] = work.catch(() => {});
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  };
}
