import { createCollectionTrash } from "@/lib/collection-trash.mjs";
import { env } from "@/lib/runtime-env";
import { favoriteUpdateSQL } from "@/lib/favorites.mjs";
import { storyResponse } from "@/lib/story-response";
import { getDb } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { collections } from "@/db/schema";
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
      body = await jsonBody(request);
    if (typeof body.id !== "string")
      throw new HttpError(400, "Choose a collection.");
    if (body.permanent === true) {
      if (!(await createCollectionTrash(env.DB).destroy(user.userId, body.id)))
        throw new HttpError(
          409,
          "Collection is no longer in Trash. Refresh and try again.",
        );
      return storyResponse({ ok: true });
    }
    if (!(await createCollectionTrash(env.DB).remove(user.userId, body.id)))
      throw new HttpError(404, "Collection not found.");
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
    // A name the owner gives a session collection is kept by later Story updates (lib/story-store.mjs).
    if (body.action === "rename") {
      if (
        typeof body.id !== "string" ||
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 100
      )
        throw new HttpError(
          400,
          "Give your collection a name, up to 100 characters.",
        );
      const db = getDb();
      const [collection] = await db
        .select({ id: collections.id })
        .from(collections)
        .where(
          and(
            eq(collections.id, body.id),
            eq(collections.ownerId, user.userId),
            isNull(collections.deletedAt),
          ),
        );
      if (!collection) throw new HttpError(404, "Collection not found.");
      await db
        .update(collections)
        .set({ name: body.name.trim() })
        .where(eq(collections.id, collection.id));
      return Response.json({ ok: true });
    }
    if (body.action !== "restore") throw new HttpError(400, "Unknown action.");
    if (typeof body.id !== "string")
      throw new HttpError(400, "Choose a collection.");
    if (!(await createCollectionTrash(env.DB).restore(user.userId, body.id)))
      throw new HttpError(410, "This collection can no longer be restored.");
    return storyResponse({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
