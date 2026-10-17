import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { items } from "@/db/schema";
import {
  userRequired,
  jsonBody,
  checkOrigin,
  HttpError,
  fail,
} from "@/lib/server";
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request),
      db = getDb();
    if (
      !Array.isArray(body.ids) ||
      !body.ids.length ||
      body.ids.length > 200 ||
      body.ids.some((id: unknown) => typeof id !== "string") ||
      typeof body.name !== "string" ||
      body.name.length > 100
    )
      throw new HttpError(
        400,
        "Choose blocks and a group name up to 100 characters.",
      );
    const ids = [...new Set<string>(body.ids)];
    const owned = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.ownerId, user.userId), inArray(items.id, ids)));
    if (owned.length !== ids.length)
      throw new HttpError(404, "Some blocks are unavailable.");
    await db
      .update(items)
      .set({ groupName: body.name.trim(), updatedAt: new Date().toISOString() })
      .where(and(eq(items.ownerId, user.userId), inArray(items.id, ids)));
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
