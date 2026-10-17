import { getDb } from "@/db";
import { items, collections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
  hash,
} from "@/lib/server";
import { normalizeItem, itemIdentity } from "@/lib/protocol.mjs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    const [collection] = await db
      .select()
      .from(collections)
      .where(
        and(
          eq(collections.id, body.collectionId),
          eq(collections.ownerId, user.userId),
        ),
      );
    if (!collection) throw new HttpError(404, "Choose a collection.");
    let item;
    try {
      item = normalizeItem({
        ...body,
        sourceText: body.body || body.url || body.title,
        sourceRole: "user",
      });
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Invalid item.",
      );
    }
    const now = new Date().toISOString(),
      row = {
        id: crypto.randomUUID(),
        ownerId: user.userId,
        sessionId: null,
        collectionId: collection.id,
        identity: await hash(itemIdentity(item)),
        kind: item.kind,
        title: item.title,
        body: item.body,
        url: item.url,
        imageUrl: item.imageUrl,
        sourceText: item.sourceText,
        sourceRole: "user",
        sourceTurn: "",
        inferred: false,
        createdAt: now,
        updatedAt: now,
      };
    await db.insert(items).values(row);
    return Response.json(row, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, body.id), eq(items.ownerId, user.userId)));
    if (!item) throw new HttpError(404, "Item not found.");
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 240
    )
      throw new HttpError(400, "A title is required (up to 240 characters).");
    await db
      .update(items)
      .set({ title: body.title.trim(), updatedAt: new Date().toISOString() })
      .where(eq(items.id, item.id));
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
