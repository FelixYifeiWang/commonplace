import sharp from "sharp";
import { fetchPublic } from "../../desktop/public-fetch.mjs";

export async function optimizeCover(image) {
  if (!/^image\/(png|jpeg|webp|avif)(?:;|$)/i.test(image.contentType))
    return image;
  try {
    const pipeline = sharp(image.body, { limitInputPixels: 40000000 });
    const metadata = await pipeline.metadata();
    // Keep animation and small originals. This is a preview, not a replacement
    // for the source file, and transparent artwork must remain transparent.
    if (
      (metadata.pages || 1) > 1 ||
      ((metadata.width || 0) <= 1280 && image.body.length < 120000)
    )
      return image;
    const body = await pipeline
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 3 })
      .toBuffer();
    return body.length < image.body.length
      ? { body, contentType: "image/webp" }
      : image;
  } catch {
    return image;
  }
}
export function createCoverLoader({
  fetcher = fetchPublic,
  optimize = optimizeCover,
  now = Date.now,
} = {}) {
  const memory = new Map(),
    pending = new Map();
  let bytes = 0;
  return async function load(url) {
    const saved = memory.get(url);
    if (saved && saved.until > now()) return saved.image;
    if (saved) {
      bytes -= saved.image.body.length;
      memory.delete(url);
    }
    if (pending.has(url)) return pending.get(url);
    const job = fetcher(url, { image: true }).then(optimize);
    pending.set(url, job);
    try {
      const image = await job;
      memory.set(url, { image, until: now() + 3600000 });
      bytes += image.body.length;
      while (memory.size > 64 || bytes > 32 * 1024 * 1024) {
        const first = memory.keys().next().value;
        bytes -= memory.get(first).image.body.length;
        memory.delete(first);
      }
      return image;
    } finally {
      pending.delete(url);
    }
  };
}
export const loadCover = createCoverLoader();
