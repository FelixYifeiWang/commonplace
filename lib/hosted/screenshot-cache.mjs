import { createHash } from "node:crypto";
import { createLimiter } from "../limit.mjs";
export function createScreenshotCache({
  read,
  write,
  capture,
  now = Date.now,
}) {
  const pending = new Map(),
    failures = new Map(),
    memory = new Map();
  const slots = createLimiter(2);
  return async function screenshot(url) {
    const key = `previews/page-v1/${createHash("sha256").update(url).digest("hex")}.jpg`;
    if (memory.has(key)) return memory.get(key);
    if (pending.has(key)) return pending.get(key);
    if ((failures.get(key) || 0) > now())
      throw Error("Preview temporarily unavailable.");
    if (pending.size >= 16) throw Error("Preview queue is busy.");
    const job = (async () => {
      let saved;
      try {
        saved = await read(key);
      } catch {
        console.warn("Screenshot cache read unavailable");
      }
      if (saved) return saved;
      const bytes = await new Promise((resolve, reject) => {
        const release = slots.acquire(() => {
          Promise.resolve()
            .then(() => capture(url))
            .then(resolve, reject)
            .finally(() => release());
        });
      });
      try {
        await write(key, bytes);
      } catch {
        console.warn("Screenshot cache write unavailable");
      }
      return bytes;
    })();
    pending.set(key, job);
    try {
      const bytes = await job;
      memory.set(key, bytes);
      if (memory.size > 32) memory.delete(memory.keys().next().value);
      failures.delete(key);
      return bytes;
    } catch (error) {
      failures.set(key, now() + 60000);
      if (failures.size > 64) failures.delete(failures.keys().next().value);
      throw error;
    } finally {
      pending.delete(key);
    }
  };
}
