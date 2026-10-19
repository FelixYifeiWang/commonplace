import { getDb } from "@/db";
import { devices, sessions } from "@/db/schema";
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
      token = newToken(),
      id = crypto.randomUUID();
    await getDb()
      .insert(devices)
      .values({
        id,
        ownerId: user.userId,
        name:
          typeof body.name === "string"
            ? body.name.slice(0, 100)
            : "My computer",
        tokenHash: await hash(token),
        createdAt: new Date().toISOString(),
        readyAt: new Date().toISOString(),
      });
    return Response.json(
      { id, token },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, body.id), eq(devices.ownerId, user.userId)));
    if (!device) throw new HttpError(404, "Device not found.");
    await db.batch([
      db
        .update(devices)
        .set({ revoked: true })
        .where(eq(devices.id, device.id)),
      db
        .update(sessions)
        .set({ state: "revoked" })
        .where(eq(sessions.deviceId, device.id)),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
