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
      db
        .insert(collections)
        .values({
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
    return Response.json(
      { subscriptionId: id, collectionId, state: "reading" },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
