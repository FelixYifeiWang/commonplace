import {
  classifyMedia,
  parsePageMetadata,
  embedFor,
  publicUrl,
} from "../lib/media.mjs";
import { fetchPublic } from "./public-fetch.mjs";
import { privatePage } from "../lib/session-media.mjs";
export async function previewUrl(url, { fetcher = fetchPublic } = {}) {
  if (!publicUrl(url)) return { previewStatus: "unavailable" };
  const initialKind = classifyMedia(url),
    embedUrl = embedFor(url);
  const initial = {
    kind: initialKind,
    embedUrl,
    imageUrl: null,
    title: "",
    body: "",
    mimeType: "",
  };
  if (embedUrl?.startsWith("https://www.youtube-nocookie.com/"))
    initial.imageUrl =
      "https://i.ytimg.com/vi/" + embedUrl.split("/").pop() + "/hqdefault.jpg";
  try {
    const page = await fetcher(url),
      kind = classifyMedia(page.url, page.contentType);
    if (!page.contentType.includes("html"))
      return {
        ...initial,
        kind,
        imageUrl: kind === "image" ? page.url : initial.imageUrl,
        mimeType: page.contentType,
        previewStatus: "ready",
      };
    const metadata = parsePageMetadata(page.body, page.url);
    // A private page's cover is the site's default card (Claude's logo), not the page.
    if (privatePage(page.url)) metadata.imageUrl = null;
    return {
      ...metadata,
      imageUrl: metadata.imageUrl || initial.imageUrl,
      mimeType: page.contentType,
      previewStatus:
        metadata.imageUrl || initial.imageUrl || metadata.title
          ? "ready"
          : "unavailable",
    };
  } catch {
    return {
      ...initial,
      previewStatus: initial.imageUrl ? "ready" : "unavailable",
    };
  }
}
