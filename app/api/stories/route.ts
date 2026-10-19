import { storyResponse } from "@/lib/story-response";
import { env } from "@/lib/runtime-env";
import { enabled, scheduleStoryWork } from "@/lib/runtime-story";
import { createStoryStore } from "@/lib/story-store.mjs";
import { normalizeCuratedSession } from "@/lib/story.mjs";
import {
  userRequired,
  checkOrigin,
  jsonBody,
  fail,
  HttpError,
} from "@/lib/server";
export async function GET(request: Request) {
  try {
    const user = await userRequired(),
      id = new URL(request.url).searchParams.get("collectionId");
    if (!id) throw new HttpError(400, "Choose a collection.");
    const story = await createStoryStore(env.DB).get(id, user.userId);
    if (!story) throw new HttpError(404, "Collection not found.");
    if (story.pending && story.status !== "error") scheduleStoryWork();
    return Response.json(
      { ...story, enabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      store = createStoryStore(env.DB);
    if (typeof body.collectionId !== "string")
      throw new HttpError(400, "Choose a collection.");
    const current = await store.get(body.collectionId, user.userId);
    if (!current) throw new HttpError(404, "Collection not found.");
    if (current.frozen)
      throw new HttpError(
        409,
        "This collection is frozen. Connect the session again to start a new collection.",
      );
    // "save" replaces the Story and Map with a curated document the story job never revises; "restore" puts
    // back the version it replaced; "rewrite" writes the Story again from the first turn; otherwise retry.
    if (body.action === "save") {
      let session;
      try {
        session = normalizeCuratedSession(body.session);
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Invalid document.",
        );
      }
      if (!(await store.save(body.collectionId, user.userId, session)))
        throw new HttpError(404, "Collection not found.");
      return Response.json({ ok: true });
    }
    if (body.action === "restore") {
      if (!(await store.restore(body.collectionId, user.userId)))
        throw new HttpError(409, "This Story has no curated version to undo.");
    } else if (body.action === "rewrite") {
      if (!(await store.rewrite(body.collectionId, user.userId)))
        throw new HttpError(
          409,
          "The Story is being written. Try again in a minute.",
        );
    } else await store.retry(body.collectionId, user.userId);
    return storyResponse({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
