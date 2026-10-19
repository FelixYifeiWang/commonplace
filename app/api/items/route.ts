import { storyResponse } from "@/lib/story-response";
import { isReferenceUrl } from "@/lib/source-policy.mjs";
import { getDb } from "@/db";
import { items, collections } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
  hash,
} from "@/lib/server";
import preview from "@/lib/runtime-preview";
import { classifyMedia } from "@/lib/media.mjs";
import { normalizeItem, itemIdentity } from "@/lib/protocol.mjs";
import { createItemTrash } from "@/lib/item-trash.mjs";
import { env } from "@/lib/runtime-env";
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
          isNull(collections.deletedAt),
        ),
      );
    if (!collection) throw new HttpError(404, "Choose a collection.");
    if (collection.frozenAt)
      throw new HttpError(409, "This collection is frozen.");
    if (body.url && !isReferenceUrl(body.url))
      throw new HttpError(
        400,
        "Sign-in, callback and private pages aren’t saved.",
      );
    const file = body.fileKey ? await preview.fileInfo(body.fileKey) : null;
    if (file && file.ownerId !== user.userId)
      throw new HttpError(403, "File unavailable.");
    let item;
    try {
      item = normalizeItem({
        ...body,
        ...(file
          ? { kind: "note", title: file.name, url: null, body: "" }
          : body.url
            ? { kind: classifyMedia(body.url) }
            : {}),
        sourceText: file?.name || body.body || body.url || body.title,
        sourceRole: "user",
      });
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Invalid item.",
      );
    }
    const detectedFileKind = file
      ? classifyMedia(
          `https://upload.invalid/${encodeURIComponent(file.name)}`,
          file.mimeType,
        )
      : null;
    const now = new Date().toISOString(),
      row = {
        id: crypto.randomUUID(),
        ownerId: user.userId,
        sessionId: null,
        collectionId: collection.id,
        identity: await hash(itemIdentity(item)),
        kind: file
          ? detectedFileKind === "link"
            ? "file"
            : detectedFileKind!
          : item.kind,
        fileKey: file?.key || null,
        mimeType: file?.mimeType || null,
        previewStatus: file || !item.url ? "ready" : "pending",
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
    return storyResponse(row, { status: 201 });
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
    if (body.action === "restore") {
      const ids = validateIds(body.ids);
      await assertWritableItems(user.userId, ids);
      const restored = await createItemTrash(env.DB).restore(user.userId, ids);
      if (!restored.length)
        throw new HttpError(410, "These items can no longer be restored.");
      return storyResponse({ ok: true, restored });
    }
    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, body.id), eq(items.ownerId, user.userId)));
    if (!item) throw new HttpError(404, "Item not found.");
    await assertWritableItems(user.userId, [item.id]);
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
    return storyResponse({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

function validateIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string")
  )
    throw new HttpError(400, "Choose blocks to delete.");
  return [...new Set<string>(value)];
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      ids = validateIds(body.ids),
      db = getDb();
    await assertWritableItems(user.userId, ids);
    for (let i = 0; i < ids.length; i += 80)
      await db
        .update(items)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(items.ownerId, user.userId),
            isNull(items.deletedAt),
            inArray(items.id, ids.slice(i, i + 80)),
          ),
        );
    return storyResponse({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

async function assertWritableItems(ownerId: string, ids: string[]) {
  const database = env.DB;
  if (!database) throw new HttpError(503, "Storage is unavailable.");
  for (let offset = 0; offset < ids.length; offset += 80) {
    const chunk = ids.slice(offset, offset + 80);
    const frozen = await database
      .prepare(
        `SELECT i.id FROM items i JOIN collections c ON c.id=i.collection_id WHERE i.owner_id=? AND c.frozen_at IS NOT NULL AND i.id IN (${chunk.map(() => "?").join(",")}) LIMIT 1`,
      )
      .bind(ownerId, ...chunk)
      .first();
    if (frozen) throw new HttpError(409, "This collection is frozen.");
  }
}
