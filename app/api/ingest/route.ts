import { storyResponse } from "@/lib/story-response";
import { isReferenceItem } from "@/lib/source-policy.mjs";
import { getDb } from "@/db";
import { captureChecks, sessions, items } from "@/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { agentSession, jsonBody, fail, HttpError, hash } from "@/lib/server";
import { validateIngest, itemIdentity } from "@/lib/protocol.mjs";
export async function POST(request: Request) {
  try {
    const raw = await jsonBody(request),
      session = await agentSession(request, raw.subscriptionId);
    let body;
    try {
      body = validateIngest(raw);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Invalid items.",
      );
    }
    if (
      typeof body.sessionId !== "string" ||
      !body.sessionId.trim() ||
      body.sessionId.length > 240
    )
      throw new HttpError(400, "Provide the source sessionId.");
    if (session.externalId && session.externalId !== body.sessionId)
      throw new HttpError(403, "This key belongs to a different session.");
    if (session.mode === "once" && session.state === "complete")
      throw new HttpError(409, "This one-time import is complete.");
    const now = new Date().toISOString(),
      db = getDb();
    const statements = [];
    for (const item of body.items) {
      if (!isReferenceItem(item)) continue;
      const identity = await hash(itemIdentity(item));
      const row = {
        id: crypto.randomUUID(),
        ownerId: session.ownerId,
        sessionId: session.id,
        collectionId: session.collectionId,
        identity,
        kind: item.kind,
        title: item.title,
        body: item.body,
        url: item.url,
        imageUrl: item.imageUrl,
        sourceText: item.sourceText,
        sourceRole: item.sourceRole,
        sourceTurn: item.sourceTurn,
        inferred: item.inferred,
        createdAt: now,
        updatedAt: now,
      };
      statements.push(
        db
          .insert(items)
          .values(row)
          .onConflictDoUpdate({
            target: [items.sessionId, items.identity],
            setWhere: isNull(items.deletedAt),
            set: {
              title: row.title,
              body: row.body,
              imageUrl: row.imageUrl,
              sourceText: row.sourceText,
              sourceRole: row.sourceRole,
              sourceTurn: row.sourceTurn,
              inferred: row.inferred,
              updatedAt: now,
            },
          }),
      );
    }
    const requested = body.state || "following";
    const state =
      session.mode === "once" && requested === "following"
        ? "complete"
        : requested;
    statements.push(
      db
        .update(sessions)
        .set({
          externalId: body.sessionId,
          lastSeen: now,
          state,
          ...(typeof body.title === "string" && body.title.trim()
            ? { title: body.title.slice(0, 120) }
            : {}),
        })
        .where(
          and(
            eq(sessions.id, session.id),
            notInArray(sessions.state, ["paused", "revoked"]),
          ),
        ),
    );
    const transaction = [
      db
        .insert(captureChecks)
        .values({ sessionId: session.id, ownerId: session.ownerId }),
      ...statements,
      db.delete(captureChecks).where(eq(captureChecks.sessionId, session.id)),
    ];
    await db.batch(
      transaction as [
        (typeof transaction)[number],
        ...(typeof transaction)[number][],
      ],
    );
    return storyResponse(
      { ok: true, accepted: body.items.length, state },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
