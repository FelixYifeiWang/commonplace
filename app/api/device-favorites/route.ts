import { getDb } from "@/db";
import { collections, collectionReferenceLinks } from "@/db/schema";
import { and, eq, isNull, desc, lt } from "drizzle-orm";
import {
  deviceRequired,
  fail,
  jsonBody,
  HttpError,
  newToken,
  hash,
} from "@/lib/server";
import {
  referencePrompt,
  REFERENCE_LINK_LIFETIME,
} from "@/lib/reference-link.mjs";
import { PRODUCTION_ORIGIN, LEGACY_ORIGIN } from "@/lib/brand.mjs";
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
    const token = newToken().slice(0, 48);
    const now = new Date();
    // Bound storage for repeat copies without revoking links still in use.
    await db
      .delete(collectionReferenceLinks)
      .where(lt(collectionReferenceLinks.expiresAt, now.toISOString()));
    await db.insert(collectionReferenceLinks).values({
      tokenHash: await hash(token),
      ownerId: device.ownerId,
      collectionId: collection.id,
      deviceId: device.id,
      expiresAt: new Date(
        now.getTime() + REFERENCE_LINK_LIFETIME,
      ).toISOString(),
    });
    const origin = new URL(request.url).origin;

    return Response.json(
      {
        prompt: referencePrompt(
          origin === LEGACY_ORIGIN ? PRODUCTION_ORIGIN : origin,
          token,
        ),
      },
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
