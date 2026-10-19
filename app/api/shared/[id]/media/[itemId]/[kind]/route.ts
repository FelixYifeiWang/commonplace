import { env } from "@/lib/runtime-env";
import { createSharedCollectionStore } from "@/lib/shared-collection.mjs";
import { previewImageResponse } from "@/lib/preview-image.mjs";
import preview from "@/lib/runtime-preview";
import { fail, HttpError } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string; kind: string }> },
) {
  try {
    const { id, itemId, kind } = await params;
    if (!["image", "screenshot", "file"].includes(kind))
      throw new HttpError(404, "Media not found.");
    const item = await createSharedCollectionStore(env.DB).media(id, itemId);
    if (!item) throw new HttpError(404, "Media not found.");
    let response: Response;
    if (kind === "image")
      response = await previewImageResponse(
        item,
        item.ownerId,
        preview.image ? { fetcher: preview.image } : {},
      );
    else if (kind === "screenshot" && item.kind === "link" && item.url)
      response = await preview.screenshot(item.url);
    else if (kind === "file" && item.fileKey)
      response = await preview.file(
        item.fileKey,
        request.headers.get("range") || undefined,
      );
    else throw new HttpError(404, "Media not found.");
    const headers = new Headers(response.headers);
    // Recheck collection/item deletion on each visit, including attachments.
    headers.set("Cache-Control", "private, no-cache");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    return fail(e);
  }
}
