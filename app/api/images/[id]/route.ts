import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items } from "@/db/schema";
import { userRequired, fail } from "@/lib/server";
import { previewImageResponse } from "@/lib/preview-image.mjs";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userRequired(),
      { id } = await params;
    const [item] = await getDb()
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.ownerId, user.userId)));
    return previewImageResponse(item, user.userId);
  } catch (error) {
    return fail(error);
  }
}
