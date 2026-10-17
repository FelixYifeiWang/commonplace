import {
  classifyMedia,
  parsePageMetadata,
  embedFor,
  publicUrl,
} from "../lib/media.mjs";
import { fetchPublic } from "./public-fetch.mjs";
export async function previewUrl(url) {
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
    const page = await fetchPublic(url),
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
