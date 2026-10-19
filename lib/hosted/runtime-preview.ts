import { head, get } from "@vercel/blob";
import { previewUrl } from "../../desktop/preview.mjs";
const bridge = {
  preview: previewUrl,
  async screenshot(url: string) {
    const { hostedScreenshot } = await import("./screenshot.mjs");
    return hostedScreenshot(url);
  },
  async ticket(ownerId: string) {
    return {
      url: "/api/blob-upload",
      mode: "blob",
      prefix: `users/${encodeURIComponent(ownerId)}/${crypto.randomUUID()}/`,
    };
  },
  async fileInfo(key: string) {
    if (!/^users\/[^/]+\/[0-9a-f-]{36}\/[^/]+$/.test(key))
      throw new Error("Invalid file.");
    const info = await head(key);
    return {
      key: info.pathname,
      name: decodeURIComponent(key.split("/").at(-1)!),
      mimeType: info.contentType,
      ownerId: decodeURIComponent(key.split("/")[1]),
      size: info.size,
    };
  },
  async file(key: string, range?: string) {
    const response = await get(key, {
      access: "private",
      ...(range ? { headers: { Range: range } } : {}),
    });
    if (!response || !response.stream)
      return new Response(null, { status: 404 });
    const headers = new Headers();
    response.headers.forEach((value, name) => headers.set(name, value));
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
    return new Response(response.stream, {
      status: headers.has("content-range") ? 206 : 200,
      headers,
    });
  },
};
export default bridge;
