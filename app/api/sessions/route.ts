import { getDb } from "@/db";
import { sessions, collections } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
  newToken,
  hash,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    if (!["Codex", "Claude Code", "Cursor", "Other"].includes(body.provider))
      throw new HttpError(400, "Choose a supported agent.");
    let collectionId = body.collectionId;
    if (collectionId) {
      const [c] = await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.id, collectionId),
            eq(collections.ownerId, user.userId),
          ),
        );
      if (!c) throw new HttpError(404, "Collection not found.");
    } else {
      collectionId = crypto.randomUUID();
      await db
        .insert(collections)
        .values({
          id: collectionId,
          ownerId: user.userId,
          name: "Collected thoughts",
          description: "A little of everything worth keeping.",
          createdAt: new Date().toISOString(),
        });
    }
    const token = newToken(),
      id = crypto.randomUUID();
    await db
      .insert(sessions)
      .values({
        id,
        ownerId: user.userId,
        collectionId,
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim().slice(0, 120)
            : `A session with ${body.provider}`,
        provider: body.provider,
        mode: body.mode === "once" ? "once" : "follow",
        state: "waiting",
        tokenHash: await hash(token),
        createdAt: new Date().toISOString(),
      });
    return Response.json(
      { id, token, collectionId },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request);
    if (!["pause", "resume", "revoke"].includes(body.action))
      throw new HttpError(400, "Unknown session action.");
    const db = getDb();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, body.id), eq(sessions.ownerId, user.userId)));
    if (!session) throw new HttpError(404, "Session not found.");
    if (session.state === "revoked")
      throw new HttpError(409, "Connect a new session to restore access.");
    const state =
      body.action === "pause"
        ? "paused"
        : body.action === "revoke"
          ? "revoked"
          : session.externalId
            ? "following"
            : "waiting";
    await db
      .update(sessions)
      .set({
        state,
        ...(state === "revoked" ? { tokenHash: await hash(newToken()) } : {}),
      })
      .where(eq(sessions.id, session.id));
    return Response.json({ ok: true, state });
  } catch (e) {
    return fail(e);
  }
}
