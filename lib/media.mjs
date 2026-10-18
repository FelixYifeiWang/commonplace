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
    title = [],
    images = [],
    elements = [];
  let inTitle = false;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const parent = elements.at(-1);
        const excluded =
          parent?.excluded ||
          ["nav", "header", "footer", "aside"].includes(name) ||
          attrs.hidden !== undefined ||
          attrs["aria-hidden"] === "true";
        const article =
          parent?.article || ["main", "article", "figure"].includes(name);
        if (
          ![
            "img",
            "meta",
            "link",
            "br",
            "hr",
            "input",
            "source",
            "wbr",
          ].includes(name)
        )
          elements.push({ name, excluded, article });
        if (name === "img" && !excluded) {
          const width = Number(attrs.width) || 0,
            height = Number(attrs.height) || 0;
          const src = publicUrl(attrs.src || attrs["data-src"], url);
          const decorative =
            /logo|icon|avatar|badge|pixel|spinner|loading|spacer/i.test(
              [attrs.class, attrs.alt, src].join(" "),
            );
          if (
            src &&
            !decorative &&
            (!width || width >= 240) &&
            (!height || height >= 120) &&
            (article || width >= 400)
          ) {
            images.push({
              src,
              score: (article ? 1000000 : 0) + Math.min(width * height, 900000),
            });
          }
        }
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
        const index = elements.findLastIndex((el) => el.name === name);
        if (index >= 0) elements.splice(index);
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
    imageUrl:
      [
        meta["og:image:secure_url"],
        meta["og:image"],
        meta["twitter:image"],
        meta["twitter:image:src"],
        meta.image_src,
        ...images.sort((a, b) => b.score - a.score).map((i) => i.src),
      ]
        .map((value) => publicUrl(value, url))
        .find(Boolean) || null,
    kind: classifyMedia(url),
    embedUrl: embedFor(url),
  };
}
