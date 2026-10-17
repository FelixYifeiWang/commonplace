import { lookup } from "node:dns/promises";
import { request as https } from "node:https";
import { request as http } from "node:http";
import { gunzipSync, brotliDecompressSync, inflateSync } from "node:zlib";
import { publicUrl } from "../lib/media.mjs";
import { isPublicAddress } from "./public-fetch.mjs";
// All renderer HTTP traffic uses this pinned, credential-free transport.
export async function screenshotResource(
  value,
  { resolve = lookup, transport } = {},
) {
  const safe = publicUrl(value);
  if (!safe) throw new Error("Public web pages only.");
  const url = new URL(safe);
  let timer;
  const addresses = await Promise.race([
    resolve(url.hostname, { all: true, family: 4 }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("DNS timeout")), 4000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Public address required.");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (transport || (url.protocol === "https:" ? https : http))(
      url,
      {
        agent: false,
        method: "GET",
        lookup: (_hostname, opts, cb) =>
          opts.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) {
            req.destroy(new Error("Resource too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            let body = Buffer.concat(chunks);
            const decode = {
              gzip: gunzipSync,
              br: brotliDecompressSync,
              deflate: inflateSync,
            }[res.headers["content-encoding"]];
            if (decode)
              body = decode(body, { maxOutputLength: 8 * 1024 * 1024 });
            resolve({
              status: res.statusCode || 502,
              headers: {
                "Content-Type": String(
                  res.headers["content-type"] || "application/octet-stream",
                ),
                ...(res.headers.location
                  ? { Location: res.headers.location }
                  : {}),
                ...(res.headers["access-control-allow-origin"]
                  ? {
                      "Access-Control-Allow-Origin":
                        res.headers["access-control-allow-origin"],
                    }
                  : {}),
              },
              body,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Resource timeout")),
      8000,
    );
    req.once("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end();
  });
}
