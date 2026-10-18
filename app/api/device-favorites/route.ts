import { getDb } from "@/db";
import { collections, items } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { deviceRequired, fail, jsonBody, HttpError } from "@/lib/server";
import { collectionReferencePrompt } from "@/lib/collection-reference.mjs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    const device = await deviceRequired(request);
    const rows = await getDb()
      .select({ id: collections.id, name: collections.name })
      .from(collections)
      .where(
        and(
          eq(collections.ownerId, device.ownerId),
          eq(collections.favorite, true),
          isNull(collections.deletedAt),
        ),
      )
      .orderBy(desc(collections.createdAt))
      .limit(5);
    return Response.json({ collections: rows }, { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const device = await deviceRequired(request),
      body = await jsonBody(request),
      db = getDb();
    if (typeof body.id !== "string")
      throw new HttpError(400, "Choose a collection.");
    const [collection] = await db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.id, body.id),
          eq(collections.ownerId, device.ownerId),
          eq(collections.favorite, true),
          isNull(collections.deletedAt),
        ),
      );
    if (!collection) throw new HttpError(404, "Starred collection not found.");
    const sources = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.collectionId, collection.id),
          eq(items.ownerId, device.ownerId),
          isNull(items.deletedAt),
        ),
      )
      .orderBy(desc(items.createdAt))
      .limit(80);
    return Response.json(
      { prompt: collectionReferencePrompt(collection, sources) },
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
