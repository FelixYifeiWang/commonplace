import { getDb } from "@/db";
import { sessions, items, turns, devices } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { agentSession, jsonBody, fail, HttpError, hash } from "@/lib/server";
import { isReferenceUrl } from "@/lib/source-policy.mjs";
import { classifyMedia } from "@/lib/media.mjs";
import { itemIdentity, safeUrl } from "@/lib/protocol.mjs";
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request),
      session = await agentSession(request, body.subscriptionId);
    if (!Array.isArray(body.turns) || body.turns.length > 50)
      throw new HttpError(400, "Send at most 50 turns per update.");
    if (session.mode === "once" && session.state === "complete")
      throw new HttpError(409, "This import is complete.");
    for (const turn of body.turns)
      if (
        typeof turn.id !== "string" ||
        turn.id.length > 240 ||
        !["user", "assistant"].includes(turn.role) ||
        typeof turn.text !== "string" ||
        turn.text.length > 64000
      )
        throw new HttpError(
          400,
          "Each turn needs an id, role, and text of at most 64,000 characters.",
        );
    const db = getDb(),
      now = new Date().toISOString(),
      statements = [];
    let references = 0;
    for (const turn of body.turns) {
      const turnId = await hash(`${turn.id}:${turn.text}`);
      statements.push(
        db
          .insert(turns)
          .values({
            id: crypto.randomUUID(),
            sessionId: session.id,
            ownerId: session.ownerId,
            externalId: turnId,
            role: turn.role,
            body: turn.text,
            digestStatus: "pending",
            createdAt: now,
          })
          .onConflictDoNothing({ target: [turns.sessionId, turns.externalId] }),
      );
      const matches = turn.text.match(/https?:\/\/[^\s<>"'`\]\)]+/g) || [];
      for (const raw of [...new Set<string>(matches)]) {
        const url = safeUrl(raw.replace(/[.,;:!?]+$/, ""));
        if (!url) continue;
        const parsed = new URL(url);
        if (!isReferenceUrl(url)) continue;
        const kind = classifyMedia(url);
        const identity = await hash(itemIdentity({ url }));
        const lastPath =
          parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
        let decodedPath = lastPath;
        try {
          decodedPath = decodeURIComponent(lastPath);
        } catch {
          /* Preserve malformed but valid URL text. */
        }
        const title =
          decodedPath.replace(/[-_]/g, " ").slice(0, 240) || parsed.hostname;
        const excerptStart = Math.max(0, turn.text.indexOf(raw) - 2000);
        statements.push(
          db
            .insert(items)
            .values({
              id: crypto.randomUUID(),
              ownerId: session.ownerId,
              sessionId: session.id,
              collectionId: session.collectionId,
              identity,
              kind,
              title,
              body: "",
              url,
              imageUrl: kind === "image" ? url : null,
              sourceText: turn.text.slice(excerptStart, excerptStart + 16000),
              sourceRole: turn.role,
              sourceTurn: turn.id,
              inferred: false,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: [items.sessionId, items.identity] }),
        );
        references++;
      }
    }
    const state =
      body.complete && session.mode === "once" ? "complete" : "following";
    statements.push(
      db
        .update(sessions)
        .set({ lastSeen: now, state })
        .where(
          and(
            eq(sessions.id, session.id),
            notInArray(sessions.state, ["paused", "revoked"]),
          ),
        ),
    );
    if (session.deviceId)
      statements.push(
        db
          .update(devices)
          .set({ lastSeen: now })
          .where(eq(devices.id, session.deviceId)),
      );
    // Keep individual transactions small enough for D1's statement limits.
    for (let i = 0; i < statements.length; i += 80) {
      const batch = statements.slice(i, i + 80);
      await db.batch(
        batch as [(typeof batch)[number], ...(typeof batch)[number][]],
      );
    }
    return Response.json(
      {
        ok: true,
        received: body.turns.length,
        references,
        digestStatus: "pending",
        state,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
