import { getDb } from "@/db";
import { collections, sessions, items, devices } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { userRequired, fail } from "@/lib/server";
export async function GET() {
  try {
    const user = await userRequired(),
      db = getDb();
    const [cs, ss, ii] = await Promise.all([
      db.select().from(collections).where(eq(collections.ownerId, user.userId)),
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
        .where(eq(items.ownerId, user.userId))
        .orderBy(desc(items.createdAt)),
    ]);
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
    return Response.json(
      {
        collections: cs,
        sessions: ss,
        items: ii,
        devices: ds,
        user: { displayName: user.displayName, email: user.email },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
