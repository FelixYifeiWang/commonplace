import { env } from "@/lib/runtime-env";
import { hash, fail, HttpError } from "@/lib/server";
import { referenceMediaQuery } from "@/lib/reference-link.mjs";
import preview from "@/lib/runtime-preview";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string; itemId: string }> },
) {
  try {
    const { reference, itemId } = await params;
    if (!/^[a-f0-9]{48}\.md$/.test(reference))
      throw new HttpError(404, "Media unavailable.");
    if (!env.DB) throw new HttpError(503, "Media temporarily unavailable.");
    const item = await env.DB.prepare(referenceMediaQuery)
      .bind(
        await hash(reference.slice(0, -3)),
        new Date().toISOString(),
        itemId,
      )
      .first<{ fileKey: string }>();
    if (!item) throw new HttpError(404, "Media unavailable.");
    const response = await preview.file(
      item.fileKey,
      request.headers.get("range") || undefined,
    );
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return fail(error);
  }
}
