import { storyResponse } from "@/lib/story-response";
import { env } from "@/lib/runtime-env";
import { enabled, scheduleStoryWork } from "@/lib/runtime-story";
import { createStoryStore } from "@/lib/story-store.mjs";
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
    if (!id) throw new HttpError(400, "Choose a channel.");
    const story = await createStoryStore(env.DB).get(id, user.userId);
    if (!story) throw new HttpError(404, "Channel not found.");
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
      throw new HttpError(400, "Choose a channel.");
    if (!(await store.get(body.collectionId, user.userId)))
      throw new HttpError(404, "Channel not found.");
    await store.retry(body.collectionId, user.userId);
    return storyResponse({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
