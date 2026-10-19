import { createCollectionTrash } from "@/lib/collection-trash.mjs";
import { isReferenceItem } from "@/lib/source-policy.mjs";
import { getDb } from "@/db";
import { collections, sessions, items, devices } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { userRequired, fail } from "@/lib/server";
import { createItemTrash } from "@/lib/item-trash.mjs";
import { env } from "@/lib/runtime-env";
export async function GET() {
  try {
    const user = await userRequired(),
      db = getDb();
    const [cs, ss, ii, recentlyDeleted, deletedCollections] = await Promise.all(
      [
        db
          .select()
          .from(collections)
          .where(
            and(
              eq(collections.ownerId, user.userId),
              isNull(collections.deletedAt),
            ),
          ),
        db
          .select({
            id: sessions.id,
            title: sessions.title,
            provider: sessions.provider,
            collectionId: sessions.collectionId,
            mode: sessions.mode,
            state: sessions.state,
            lastSeen: sessions.lastSeen,
            createdAt: sessions.createdAt,
            externalId: sessions.externalId,
          })
          .from(sessions)
          .where(eq(sessions.ownerId, user.userId)),
        db
          .select()
          .from(items)
          .where(and(eq(items.ownerId, user.userId), isNull(items.deletedAt)))
          .orderBy(desc(items.createdAt)),
        createItemTrash(env.DB).list(user.userId),
        createCollectionTrash(env.DB).list(user.userId),
      ],
    );
    const ds = await db
      .select({
        id: devices.id,
        name: devices.name,
        lastSeen: devices.lastSeen,
        revoked: devices.revoked,
        createdAt: devices.createdAt,
      })
      .from(devices)
      .where(eq(devices.ownerId, user.userId));
    const visibleCollections = new Set(cs.map((c) => c.id));
    return Response.json(
      {
        collections: cs,
        recentlyDeleted,
        deletedCollections,
        sessions: ss.filter((s) => visibleCollections.has(s.collectionId)),
        items: ii.filter(
          (i) => visibleCollections.has(i.collectionId) && isReferenceItem(i),
        ),
        devices: ds,
        user: { displayName: user.displayName, email: user.email },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
