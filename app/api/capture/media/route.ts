import { agentSession, fail, HttpError } from "@/lib/server";
import { env } from "@/lib/runtime-env";
import preview from "@/lib/runtime-preview";
import { parseMediaUpload } from "@/lib/session-media.mjs";
import { createSessionMediaStore } from "@/lib/session-media-store.mjs";
export const runtime = "nodejs";
// The companion sends pictures it found in a session one at a time: images the human pasted,
// and captures of artifacts the assistant published (see lib/session-media.mjs).
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    // Under Vercel's 4.5 MB request limit: a 3 MB image in base64 plus its context.
    if (raw.length > 4_400_000)
      throw new HttpError(413, "This picture is too large.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Send valid JSON.");
    }
    const session = await agentSession(request, body.subscriptionId);
    let upload;
    try {
      upload = parseMediaUpload(body);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const saved = await createSessionMediaStore(env.DB, {
      put: (file: Parameters<typeof preview.store>[0]) => preview.store(file),
    }).save(session, upload);
    return Response.json(
      { ok: true, ...saved },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
