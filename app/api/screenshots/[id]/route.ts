import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items } from "@/db/schema";
import { userRequired, fail, HttpError } from "@/lib/server";
import preview from "virtual:commonplace-preview";
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
    if (!item?.url || item.kind !== "link")
      throw new HttpError(404, "Website not found.");
    const response = await preview.screenshot(item.url);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": response.ok ? "private, max-age=86400" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
