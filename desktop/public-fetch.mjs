import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { publicUrl } from "../lib/media.mjs";
export function isPublicAddress(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function fetchPublic(
  value,
  { lookup = dnsLookup, hops = 0, transport } = {},
) {
  const safe = publicUrl(value);
  if (!safe) throw new Error("Not a public preview URL.");
  const url = new URL(safe);
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise((_, reject) => {
      const t = setTimeout(
        () => reject(new Error("Preview DNS timed out.")),
        5000,
      );
      t.unref?.();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Preview requires a public address.");
  const address = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const request =
      transport || (url.protocol === "https:" ? httpsRequest : httpRequest);
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: (_host, opts, cb) =>
          opts.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
        headers: {
          "User-Agent": "Newron/0.1 (link preview)",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.5",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const contentType = String(res.headers["content-type"] || "");
        const response = {
          status: res.statusCode,
          location: res.headers.location,
          contentType,
          url: safe,
          body: "",
        };
        if (
          (res.statusCode >= 300 && res.statusCode < 400) ||
          !contentType.includes("html")
        ) {
          resolve(response);
          res.destroy();
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= 1024 * 1024) {
            response.body = Buffer.concat(chunks)
              .subarray(0, 1024 * 1024)
              .toString("utf8");
            resolve(response);
            res.destroy();
          }
        });
        res.on("end", () => {
          response.body = Buffer.concat(chunks).toString("utf8");
          resolve(response);
        });
        res.on("error", reject);
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Preview request timed out.")),
      6000,
    );
    deadline.unref?.();
    req.once("close", () => clearTimeout(deadline));
    req.setTimeout(6000, () =>
      req.destroy(new Error("Preview request timed out.")),
    );
    req.on("error", reject);
    req.end();
  });
  if (result.status >= 300 && result.status < 400 && result.location) {
    if (hops >= 3) throw new Error("Too many preview redirects.");
    return fetchPublic(new URL(result.location, url).href, {
      lookup,
      hops: hops + 1,
      transport,
    });
  }
  if (result.status < 200 || result.status >= 400)
    throw new Error("This website did not provide a preview.");
  return result;
}
