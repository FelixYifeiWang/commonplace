import { env } from "cloudflare:workers";
import { authorized } from "virtual:commonplace-story";
import { createStoryStore } from "@/lib/story-store.mjs";
import { jsonBody, fail, HttpError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    if (!authorized(request))
      throw new HttpError(401, "Private story worker only.");
    const body = await jsonBody(request),
      store = createStoryStore(env.DB);
    if (body.op === "claim") return Response.json({ job: await store.claim() });
    if (body.op === "complete")
      return Response.json({
        ok: await store.complete(body.job, body.batch, body.beats, body.model),
      });
    if (body.op === "fail") {
      await store.fail(body.job, body.message);
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Unknown story operation.");
  } catch (error) {
    return fail(error);
  }
}
