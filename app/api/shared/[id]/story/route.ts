import { env } from "@/lib/runtime-env";
import { createSharedCollectionStore } from "@/lib/shared-collection.mjs";
import { fail, HttpError } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await createSharedCollectionStore(env.DB).story(id);
    if (!data) throw new HttpError(404, "Collection not found.");
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
