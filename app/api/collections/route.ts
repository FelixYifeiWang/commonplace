import { getDb } from "@/db";
import { and, eq } from "drizzle-orm";
import { collections, sessions } from "@/db/schema";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 100
    )
      throw new HttpError(
        400,
        "Give your collection a name, up to 100 characters.",
      );
    const collection = {
      id: crypto.randomUUID(),
      ownerId: user.userId,
      name: body.name.trim(),
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 500)
          : "",
      createdAt: new Date().toISOString(),
    };
    await getDb().insert(collections).values(collection);
    return Response.json(collection, { status: 201 });
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
    const [collection] = await db
      .select()
      .from(collections)
      .where(
        and(eq(collections.id, body.id), eq(collections.ownerId, user.userId)),
      );
    if (!collection) throw new HttpError(404, "Collection not found.");
    await db.batch([
      db
        .update(collections)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(collections.id, collection.id)),
      db
        .update(sessions)
        .set({ state: "revoked" })
        .where(
          and(
            eq(sessions.collectionId, collection.id),
            eq(sessions.ownerId, user.userId),
          ),
        ),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request);
    if (body.action !== "restore") throw new HttpError(400, "Unknown action.");
    await getDb()
      .update(collections)
      .set({ deletedAt: null })
      .where(
        and(eq(collections.id, body.id), eq(collections.ownerId, user.userId)),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
