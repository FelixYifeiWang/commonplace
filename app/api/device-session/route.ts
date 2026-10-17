import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { deviceRequired, jsonBody, fail, HttpError } from "@/lib/server";
export async function PATCH(request: Request) {
  try {
    const device = await deviceRequired(request),
      body = await jsonBody(request),
      db = getDb();
    if (!["pause", "resume"].includes(body.action))
      throw new HttpError(400, "Unknown action.");
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, body.subscriptionId),
          eq(sessions.deviceId, device.id),
          eq(sessions.ownerId, device.ownerId),
        ),
      );
    if (!session || session.state === "revoked")
      throw new HttpError(404, "This session is no longer connected.");
    const state = body.action === "pause" ? "paused" : "following";
    await db.update(sessions).set({ state }).where(eq(sessions.id, session.id));
    return Response.json({ ok: true, state });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(request: Request) {
  try {
    const device = await deviceRequired(request),
      url = new URL(request.url);
    const [session] = await getDb()
      .select({ id: sessions.id, state: sessions.state })
      .from(sessions)
      .where(
        and(
          eq(sessions.deviceId, device.id),
          eq(sessions.ownerId, device.ownerId),
          eq(sessions.externalId, url.searchParams.get("externalId") || ""),
        ),
      );
    return Response.json(
      {
        connected: !!session && !["revoked", "paused"].includes(session.state),
        session,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
