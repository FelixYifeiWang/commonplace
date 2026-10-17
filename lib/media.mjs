import { Parser } from "htmlparser2";
import { safeUrl } from "./protocol.mjs";
export function publicUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (
    !safeUrl(url.href) ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.includes(":") ||
    url.hostname.startsWith("[") ||
    /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    (url.port && !["80", "443"].includes(url.port)) ||
    [...url.searchParams.keys()].some((k) =>
      /^(token|key|secret|auth|signature|access_token|x-amz-signature)$/i.test(
        k,
      ),
    )
  )
    return null;
  return url.href;
}
export function embedFor(value) {
  const safe = publicUrl(value);
  if (!safe) return null;
  const url = new URL(safe),
    host = url.hostname.replace(/^www\./, "");
  if (["youtube.com", "youtu.be", "m.youtube.com"].includes(host)) {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    if (/^[\w-]{11}$/.test(id || ""))
      return "https://www.youtube-nocookie.com/embed/" + id;
  }
  if (host === "vimeo.com" && /^\/\d+$/.test(url.pathname))
    return "https://player.vimeo.com/video" + url.pathname;
  return null;
}
export function classifyMedia(value, contentType = "") {
  const path = new URL(value).pathname.toLowerCase();
  if (
    contentType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|avif|svg)$/.test(path)
  )
    return "image";
  if (
    contentType.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v)$/.test(path) ||
    embedFor(value)
  )
    return "video";
  if (
    contentType.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|flac)$/.test(path)
  )
    return "audio";
  if (contentType.includes("application/pdf") || /\.pdf$/.test(path))
    return "document";
  if (/\.(zip|epub|docx?|xlsx?|pptx?)$/.test(path)) return "file";
  return "link";
}
export function parsePageMetadata(html, url) {
  const meta = {},
    title = [];
  let inTitle = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === "title") inTitle = true;
        if (name === "meta") {
          const key = (attrs.property || attrs.name || "").toLowerCase();
          if (attrs.content && !meta[key]) meta[key] = attrs.content.trim();
        }
        if (name === "link" && attrs.rel === "image_src" && attrs.href)
          meta.image_src = attrs.href;
      },
      ontext(text) {
        if (inTitle) title.push(text);
      },
      onclosetag(name) {
        if (name === "title") inTitle = false;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return {
    title: (meta["og:title"] || meta["twitter:title"] || title.join(""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240),
    body: (
      meta["og:description"] ||
      meta["twitter:description"] ||
      meta.description ||
      ""
    ).slice(0, 2000),
    imageUrl: publicUrl(
      meta["og:image:secure_url"] ||
        meta["og:image"] ||
        meta["twitter:image"] ||
        meta.image_src,
      url,
    ),
    kind: classifyMedia(url),
    embedUrl: embedFor(url),
  };
}
