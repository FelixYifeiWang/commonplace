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
        ),
      );
    if (existing) {
      if (existing.state === "revoked")
        throw new HttpError(
          409,
          "This subscription was disconnected. Create a new device connection to reconnect.",
        );
      // A deliberate new drop resumes the same subscription instead of creating a duplicate.
      if (body.mode === "follow") {
        await db
          .update(sessions)
          .set({ mode: "follow", state: "reading" })
          .where(eq(sessions.id, existing.id));
      }
      return Response.json({
        subscriptionId: existing.id,
        state: body.mode === "follow" ? "reading" : existing.state,
      });
    }
    let collectionId = body.collectionId;
    if (collectionId) {
      const [c] = await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.id, collectionId),
            eq(collections.ownerId, device.ownerId),
          ),
        );
      if (!c) throw new HttpError(404, "Collection not found.");
    } else {
      const [c] = await db
        .select()
        .from(collections)
        .where(eq(collections.ownerId, device.ownerId));
      collectionId = c?.id;
      if (!collectionId) {
        collectionId = crypto.randomUUID();
        await db.insert(collections).values({
          id: collectionId,
          ownerId: device.ownerId,
          name: "Collected thoughts",
          description: "Ideas from your conversations.",
          createdAt: new Date().toISOString(),
        });
      }
    }
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await db.batch([
      db.insert(sessions).values({
        id,
        ownerId: device.ownerId,
        deviceId: device.id,
        collectionId,
        title:
          typeof body.title === "string"
            ? body.title.slice(0, 120)
            : `A session with ${body.provider}`,
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
    return Response.json(
      { subscriptionId: id, state: "reading" },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
