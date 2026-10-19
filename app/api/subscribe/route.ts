import { storyResponse } from "@/lib/story-response";
import { env } from "@/lib/runtime-env";
import { createStoryStore } from "@/lib/story-store.mjs";
import { normalizeCuratedSession } from "@/lib/story.mjs";
import { DEMO_SESSIONS } from "@/lib/demo-sessions";
import { getDb } from "@/db";
import { sessions, collections, devices } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
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
    if (
      typeof body.sessionId !== "string" ||
      !body.sessionId.trim() ||
      body.sessionId.length > 240
    )
      throw new HttpError(400, "Provide a stable sessionId.");
    if (!["Codex", "Claude Code", "Cursor", "Other"].includes(body.provider))
      throw new HttpError(400, "Unknown provider.");
    const [existing] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.deviceId, device.id),
          eq(sessions.externalId, body.sessionId),
          ne(sessions.state, "revoked"),
          eq(sessions.provider, body.provider),
        ),
      );
    if (existing) {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, existing.collectionId));
      if (!collection) throw new HttpError(404, "Collection not found.");
      if (collection.deletedAt && body.mode !== "follow")
        throw new HttpError(409, "Reconnect this collection to restore it.");
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
        state: body.mode === "follow" ? "reading" : existing.state,
      });
    }
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const collectionId = `session-${id}`;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : `A session with ${body.provider}`;
    await db.batch([
      db.insert(collections).values({
        id: collectionId,
        ownerId: device.ownerId,
        name: title,
        description: "",
        createdAt: now,
      }),
      db.insert(sessions).values({
        id,
        ownerId: device.ownerId,
        deviceId: device.id,
        collectionId,
        title,
        provider: body.provider,
        externalId: body.sessionId,
        mode: body.mode === "once" ? "once" : "follow",
        state: "reading",
        tokenHash: await hash(newToken()),
        createdAt: now,
      }),
      db
        .update(devices)
        .set({ lastSeen: now })
        .where(eq(devices.id, device.id)),
    ]);
    await showDemo(body.sessionId, collectionId, device.ownerId);
    return storyResponse(
      { subscriptionId: id, collectionId, state: "reading" },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
