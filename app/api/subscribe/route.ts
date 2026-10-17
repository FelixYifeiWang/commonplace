import { storyResponse } from "@/lib/story-response";
import { getDb } from "@/db";
import { sessions, collections, devices } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  deviceRequired,
  jsonBody,
  fail,
  HttpError,
  newToken,
  hash,
} from "@/lib/server";
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
          eq(sessions.provider, body.provider),
        ),
      );
    if (existing) {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, existing.collectionId));
      if (!collection) throw new HttpError(404, "Channel not found.");
      if (collection.deletedAt && body.mode !== "follow")
        throw new HttpError(409, "Reconnect this channel to restore it.");
      // An explicit Connect resumes the existing channel without reimporting deleted blocks.
      if (body.mode === "follow") {
        await db.batch([
          db
            .update(collections)
            .set({ deletedAt: null })
            .where(eq(collections.id, collection.id)),
          db
            .update(sessions)
            .set({ mode: "follow", state: "reading" })
            .where(eq(sessions.id, existing.id)),
        ]);
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
    return storyResponse(
      { subscriptionId: id, collectionId, state: "reading" },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
