import { env } from "@/lib/runtime-env";
import { favoriteUpdateSQL } from "@/lib/favorites.mjs";
import { storyResponse } from "@/lib/story-response";
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
    return storyResponse(collection, { status: 201 });
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
    return storyResponse({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request);
    if (body.action === "favorite") {
      if (typeof body.favorite !== "boolean" || typeof body.id !== "string")
        throw new HttpError(400, "Invalid favorite.");
      const database = env.DB;
      if (!database) throw new HttpError(503, "Storage is unavailable.");
      const changed = await database
        .prepare(favoriteUpdateSQL)
        .bind(
          Number(body.favorite),
          body.id,
          user.userId,
          Number(body.favorite),
          user.userId,
        )
        .first();
      if (!changed) {
        const collection = await database
          .prepare(
            "SELECT id FROM collections WHERE id=? AND owner_id=? AND deleted_at IS NULL",
          )
          .bind(body.id, user.userId)
          .first();
        if (!collection) throw new HttpError(404, "Collection not found.");
        throw new HttpError(409, "You can star up to five collections.");
      }
      return storyResponse({ ok: true });
    }
    if (body.action !== "restore") throw new HttpError(400, "Unknown action.");
    await getDb()
      .update(collections)
      .set({ deletedAt: null, favorite: false })
      .where(
        and(eq(collections.id, body.id), eq(collections.ownerId, user.userId)),
      );
    return storyResponse({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
