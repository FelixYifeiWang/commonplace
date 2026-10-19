import { ensureSubscription } from "@/lib/subscription-store.mjs";
import { env } from "@/lib/runtime-env";
import { createCollectionTrash } from "@/lib/collection-trash.mjs";
import { storyResponse } from "@/lib/story-response";
import { createStoryStore } from "@/lib/story-store.mjs";
import { normalizeCuratedSession } from "@/lib/story.mjs";
import { DEMO_SESSIONS } from "@/lib/demo-sessions";
import { getDb } from "@/db";
import { sessions, collections } from "@/db/schema";
import { and, eq, ne, desc } from "drizzle-orm";
import {
  deviceRequired,
  jsonBody,
  fail,
  HttpError,
  newToken,
  hash,
} from "@/lib/server";
// Demo video only: a session listed in DEMO_SESSIONS shows its curated Story and Map on every connect.
async function showDemo(
  sessionId: string,
  collectionId: string,
  ownerId: string,
) {
  const document = DEMO_SESSIONS[sessionId];
  if (document)
    await createStoryStore(env.DB).save(
      collectionId,
      ownerId,
      normalizeCuratedSession(document),
    );
}
export async function POST(request: Request) {
  try {
    const device = await deviceRequired(request),
      body = await jsonBody(request),
      db = getDb();
    const database = env.DB;
    if (!database) throw new HttpError(503, "Storage is unavailable.");
    if (
      typeof body.sessionId !== "string" ||
      !body.sessionId.trim() ||
      body.sessionId.length > 240
    )
      throw new HttpError(400, "Provide a stable sessionId.");
    if (!["Codex", "Claude Code", "Cursor", "Other"].includes(body.provider))
      throw new HttpError(400, "Unknown provider.");
    await createCollectionTrash(database).purge(device.ownerId);
    const id = crypto.randomUUID(),
      now = new Date().toISOString(),
      collectionId = `session-${id}`;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : `A session with ${body.provider}`;
    const created = await ensureSubscription(database, {
      id,
      collectionId,
      ownerId: device.ownerId,
      deviceId: device.id,
      externalId: body.sessionId,
      provider: body.provider,
      title,
      mode: body.mode === "once" ? "once" : "follow",
      tokenHash: await hash(newToken()),
      now,
    });
    if (created) {
      await showDemo(body.sessionId, collectionId, device.ownerId);
      return storyResponse(
        { subscriptionId: id, collectionId, state: "reading" },
        { status: 201 },
      );
    }
    const [existing] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.ownerId, device.ownerId),
          eq(sessions.externalId, body.sessionId),
          ne(sessions.state, "revoked"),
          eq(sessions.provider, body.provider),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    if (existing) {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, existing.collectionId));
      if (!collection) throw new HttpError(404, "Collection not found.");
      let restored = false;
      if (collection.deletedAt) {
        const trash = createCollectionTrash(database);
        if (DEMO_SESSIONS[body.sessionId]) {
          // Preserve the presentation rule: follow restores, then showDemo below
          // reloads the prepared Story/Map. One-time demo imports stay unchanged.
          restored =
            body.mode === "follow" &&
            (await trash.restore(existing.ownerId, collection.id));
        } else {
          restored = await trash.restoreForConnection(
            existing.ownerId,
            collection.id,
            existing.id,
            body.mode === "once" ? "once" : "follow",
          );
        }
        if (!restored)
          throw new HttpError(
            409,
            "This collection is unavailable. Connect again to start fresh.",
          );
      }
      const attached = await database
        .prepare(
          `UPDATE sessions SET device_id=?,token_hash=CASE WHEN device_id IS NOT ? THEN ? ELSE token_hash END
        WHERE id=? AND owner_id=? AND state!='revoked'
        AND EXISTS(SELECT 1 FROM collections WHERE id=sessions.collection_id AND owner_id=? AND deleted_at IS NULL AND frozen_at IS NULL)`,
        )
        .bind(
          device.id,
          device.id,
          await hash(newToken()),
          existing.id,
          device.ownerId,
          device.ownerId,
        )
        .run();
      if (!attached.meta.changes)
        throw new HttpError(409, "This collection changed. Connect again.");
      // Connect resumes a paused session. Disconnected sessions are never reused.
      if (body.mode === "follow") {
        const changed = await db
          .update(sessions)
          .set({ mode: "follow", state: "reading" })
          .where(
            and(eq(sessions.id, existing.id), ne(sessions.state, "revoked")),
          )
          .returning({ id: sessions.id });
        if (!changed.length)
          throw new HttpError(
            409,
            "This session was disconnected. Connect again to start a new collection.",
          );
        await showDemo(body.sessionId, existing.collectionId, existing.ownerId);
      }
      return storyResponse({
        subscriptionId: existing.id,
        collectionId: existing.collectionId,
        state: body.mode === "follow" || restored ? "reading" : existing.state,
        restored,
        ...(restored ? { message: "Collection restored." } : {}),
      });
    }
    throw new HttpError(
      409,
      "This session changed. Connect again to start a new collection.",
    );
  } catch (e) {
    return fail(e);
  }
}
