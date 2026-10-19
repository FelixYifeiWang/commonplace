import { getDb } from "@/db";
import { items, collections } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
} from "@/lib/server";
import preview from "@/lib/runtime-preview";
import { PREVIEW_VERSION, needsPreview } from "@/lib/preview-policy.mjs";
import { publicUrl } from "@/lib/media.mjs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    if (
      !Array.isArray(body.ids) ||
      !body.ids.length ||
      body.ids.length > 4 ||
      body.ids.some((id: unknown) => typeof id !== "string")
    )
      throw new HttpError(400, "Choose up to four blocks.");
    const rows = await db
      .select({ item: items })
      .from(items)
      .innerJoin(collections, eq(items.collectionId, collections.id))
      .where(
        and(
          eq(items.ownerId, user.userId),
          inArray(items.id, body.ids),
          isNull(collections.frozenAt),
        ),
      );
    await Promise.all(
      rows.map(async ({ item }) => {
        if (!item.url || item.deletedAt || !needsPreview(item)) return;
        let data;
        try {
          data = await preview.preview(item.url);
        } catch {
          data = { previewStatus: "unavailable" };
        }
        await db
          .update(items)
          .set({
            previewVersion: PREVIEW_VERSION,
            previewStatus:
              data.previewStatus === "ready" ? "ready" : "unavailable",
            ...(data.title ? { title: data.title.slice(0, 240) } : {}),
            ...(data.body && !item.body
              ? { body: data.body.slice(0, 12000) }
              : {}),
            ...(data.kind ? { kind: data.kind } : {}),
            imageUrl: publicUrl(data.imageUrl) || item.imageUrl,
            embedUrl: publicUrl(data.embedUrl),
            mimeType: data.mimeType || null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(items.id, item.id));
      }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
