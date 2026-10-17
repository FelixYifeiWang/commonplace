import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items } from "@/db/schema";
import { userRequired, fail, HttpError } from "@/lib/server";
import preview from "@/lib/runtime-preview";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userRequired(),
      { id } = await params;
    const [item] = await getDb()
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.ownerId, user.userId)));
    if (!item?.fileKey) throw new HttpError(404, "File not found.");
    const response = await preview.file(
      item.fileKey,
      request.headers.get("range") || undefined,
    );
    return new Response(response.body, {
      status: response.status,
      headers: new Headers(response.headers),
    });
  } catch (e) {
    return fail(e);
  }
}
