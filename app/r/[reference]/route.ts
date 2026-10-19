import { getDb } from "@/db";
import { items } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { env } from "@/lib/runtime-env";
import { hash } from "@/lib/server";
import { referenceLinkQuery } from "@/lib/reference-link.mjs";
import { collectionReferenceMarkdown } from "@/lib/collection-reference.mjs";
const headers = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;
  const missing = () =>
    new Response(
      "This reference link is unavailable or expired. Copy a new prompt from Nox.",
      { status: 404, headers },
    );
  if (!/^[a-f0-9]{48}\.md$/.test(reference)) return missing();
  if (!env.DB)
    return new Response("References are temporarily unavailable.", {
      status: 503,
      headers,
    });
  const collection = await env.DB.prepare(referenceLinkQuery)
    .bind(await hash(reference.slice(0, -3)), new Date().toISOString())
    .first<{
      ownerId: string;
      id: string;
      name: string;
      description: string;
    }>();
  if (!collection) return missing();
  const sources = await getDb()
    .select()
    .from(items)
    .where(
      and(
        eq(items.collectionId, collection.id),
        eq(items.ownerId, collection.ownerId),
        isNull(items.deletedAt),
      ),
    )
    .orderBy(desc(items.createdAt))
    .limit(80);
  return new Response(
    collectionReferenceMarkdown(
      collection,
      sources,
      new URL(`/r/${reference}`, request.url).href,
    ),
    {
      headers,
    },
  );
}
