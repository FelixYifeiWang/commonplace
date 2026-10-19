import { storyResponse } from "@/lib/story-response";
import { disconnectCollection } from "@/lib/disconnect.mjs";
import { env } from "@/lib/runtime-env";
import { getDb } from "@/db";
import { sessions, collections } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
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
    const token = newToken(),
      id = crypto.randomUUID(),
      collectionId = `session-${id}`;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : `A session with ${body.provider}`;
    const now = new Date().toISOString();
    await db.batch([
      db.insert(collections).values({
        id: collectionId,
        ownerId: user.userId,
        name: title,
        description: "",
        createdAt: now,
      }),
      db.insert(sessions).values({
        id,
        ownerId: user.userId,
        collectionId,
        title,
        provider: body.provider,
        mode: body.mode === "once" ? "once" : "follow",
        state: "waiting",
        tokenHash: await hash(token),
        createdAt: now,
      }),
    ]);
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
    const [collection] = await db
      .select({ deletedAt: collections.deletedAt })
      .from(collections)
      .where(eq(collections.id, session.collectionId));
    if (collection?.deletedAt)
      throw new HttpError(409, "Restore this collection from Trash first.");
    if (session.state === "revoked")
      throw new HttpError(409, "Connect a new session to restore access.");
    if (body.action === "revoke") {
      const outcome = await disconnectCollection(
        env.DB,
        user.userId,
        session.collectionId,
        { allowIncomplete: body.allowIncomplete === true },
      );
      if (outcome === "unfinished")
        throw new HttpError(
          409,
          "Map or Story is unfinished. Confirm freezing the current version to disconnect.",
        );
      if (outcome !== "disconnected")
        throw new HttpError(
          409,
          "This collection is unavailable. Refresh and try again.",
        );
      return Response.json({ ok: true, state: "revoked" });
    }
    const state =
      body.action === "pause"
        ? "paused"
        : session.externalId
          ? "following"
          : "waiting";
    const changed = await db
      .update(sessions)
      .set({ state })
      .where(and(eq(sessions.id, session.id), ne(sessions.state, "revoked")))
      .returning({ id: sessions.id });
    if (!changed.length)
      throw new HttpError(409, "This session is disconnected.");
    return storyResponse({ ok: true, state });
  } catch (e) {
    return fail(e);
  }
}
