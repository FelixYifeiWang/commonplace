import { after } from "next/server";
import { env } from "./runtime-env";
import { createStoryStore } from "../story-store.mjs";
import { prepareSessionBatch, STORY_MODEL } from "../story.mjs";
import { generateSession } from "../story-provider.mjs";
export const enabled = true;
// The local bridge is never exposed on the public deployment.
export function authorized() {
  return false;
}
export async function drainStories() {
  const store = createStoryStore(env.DB);
  const deadline = Date.now() + 145000;
  while (Date.now() < deadline) {
    const job = await store.claim();
    if (!job) return;
    try {
      const batch = await prepareSessionBatch(job);
      const session = batch.needsModel
        ? await generateSession(batch.input, {
            apiKey: process.env.OPENAI_API_KEY,
          })
        : null;
      await store.completeSession(job, batch, session, STORY_MODEL);
    } catch (error) {
      await store.fail(
        job,
        error instanceof Error
          ? error.message
          : "Story unavailable. Retry to continue.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
}
export function scheduleStoryWork() {
  after(async () => {
    // Wait for the queue's debounce; leases make concurrent requests safe.
    await new Promise((resolve) => setTimeout(resolve, 8500));
    await drainStories();
  });
}
