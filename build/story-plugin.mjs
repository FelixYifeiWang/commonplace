import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { prepareStoryBatch, STORY_MODEL } from "../lib/story.mjs";
import { generateStory } from "../lib/story-provider.mjs";
// Only the local server owns the provider key. The browser never receives it.
export function storyWorker() {
  const id = "virtual:commonplace-story",
    resolved = "\0" + id,
    token = randomBytes(32).toString("hex");
  let dev = false,
    root,
    base,
    timer,
    busy = false,
    stopped = false;
  async function call(op, body = {}) {
    const r = await fetch(base + "/api/story-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Commonplace-Story": token,
      },
      body: JSON.stringify({ op, ...body }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("Story queue unavailable.");
    return r.json();
  }
  async function key() {
    try {
      const env = parseEnv(await readFile(join(root, ".env.local"), "utf8"));
      return env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return process.env.OPENAI_API_KEY;
    }
  }
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    let job;
    try {
      ({ job } = await call("claim"));
      if (!job) return;
      const batch = await prepareStoryBatch(job);
      const beats = batch.needsModel
        ? await generateStory(batch.input, { apiKey: await key() })
        : [];
      await call("complete", {
        job: {
          collectionId: job.collectionId,
          lease: job.lease,
          revision: job.revision,
        },
        batch: { checkpoint: batch.checkpoint, hasMore: batch.hasMore },
        beats,
        model: STORY_MODEL,
      });
    } catch (error) {
      if (job) {
        const message =
          error.name === "TimeoutError"
            ? "Story generation timed out. Retry to continue."
            : error.message;
        await call("fail", {
          job: { collectionId: job.collectionId, lease: job.lease },
          message,
        }).catch(() => {});
      }
      // Startup/restart failures are recovered by the next tick and durable lease.
    } finally {
      busy = false;
    }
  }
  return {
    name: "commonplace-story-worker",
    configResolved(config) {
      dev = config.command === "serve";
      root = config.root;
      base = `http://127.0.0.1:${config.server.port || 3100}`;
    },
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(source) {
      if (source !== resolved) return;
      if (this.environment?.name === "client")
        throw new Error("Story worker is server-only.");
      return dev
        ? `export function scheduleStoryWork(){}; export const enabled=true; export function authorized(request){return request.headers.get('X-Commonplace-Story')===${JSON.stringify(token)}};`
        : `export function scheduleStoryWork(){}; export const enabled=false; export function authorized(){return false;}`;
    },
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        timer = setInterval(() => void tick(), 3000);
        timer.unref();
      });
      server.httpServer?.once("close", () => {
        stopped = true;
        clearInterval(timer);
      });
    },
  };
}
