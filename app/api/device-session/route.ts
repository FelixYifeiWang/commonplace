import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
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
          ne(sessions.state, "revoked"),
        ),
      );
    if (!session || session.state === "revoked")
      throw new HttpError(404, "This session is no longer connected.");
    const state = body.action === "pause" ? "paused" : "following";
    const changed = await db
      .update(sessions)
      .set({ state })
      .where(and(eq(sessions.id, session.id), ne(sessions.state, "revoked")))
      .returning({ id: sessions.id });
    if (!changed.length)
      throw new HttpError(409, "This session is disconnected.");
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
          ne(sessions.state, "revoked"),
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
