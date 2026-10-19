import { fetchPublic } from "../desktop/public-fetch.mjs";
import { itemAvailable } from "./item-retention.mjs";

export async function previewImageResponse(
  item,
  ownerId,
  { fetcher = fetchPublic } = {},
) {
  const unavailable = (status) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (
    !item ||
    item.ownerId !== ownerId ||
    !itemAvailable(item) ||
    !item.imageUrl
  )
    return unavailable(404);
  try {
    // fetchPublic validates and pins DNS for every redirect. No request cookies
    // or credentials are forwarded, and only a bounded image body is read.
    const image = await fetcher(item.imageUrl, { image: true });
    if (!image.body.length) return unavailable(502);
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=300",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch {
    return unavailable(502);
  }
}
