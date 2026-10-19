import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { fetchPublic } from "../desktop/public-fetch.mjs";
import { imageSource } from "../lib/media-source.mjs";
import { previewImageResponse } from "../lib/preview-image.mjs";
const id = "0b7e4c1e-1111-4222-8333-444455556666";
const item = {
  id,
  ownerId: "owner",
  imageUrl: "https://claude.ai/images/claude_ogimage.png",
  kind: "link",
  updatedAt: "2026-10-18",
};
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128]);
function transport(
  { type = "image/png", body = bytes, status = 200, location } = {},
  requests = [],
) {
  return (url, options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = (e) => {
      if (e) req.emit("error", e);
      req.emit("close");
    };
    req.end = () => {
      requests.push({ url: String(url), headers: options.headers });
      const res = new EventEmitter();
      res.headers = {
        "content-type": type,
        location,
        "cross-origin-resource-policy": "same-origin",
      };
      res.statusCode = status;
      res.destroy = () => {};
      callback(res);
      res.emit("data", body);
      res.emit("end");
      req.emit("close");
    };
    return req;
  };
}
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
test("saved remote previews use an owned same-origin endpoint", () => {
  assert.equal(imageSource(item), `/api/images/${id}?v=2026-10-18&p=2`);
  assert.equal(
    imageSource({ ...item, kind: "image", fileKey: "private" }),
    `/api/files/${id}`,
  );
  assert.notEqual(
    imageSource(item),
    imageSource({ ...item, updatedAt: "2026-10-19" }),
  );
});
test("image fetch preserves binary bytes and sends no browser credentials", async () => {
  const requests = [];
  const result = await fetchPublic(item.imageUrl, {
    image: true,
    lookup,
    transport: transport({}, requests),
  });
  assert.deepEqual(result.body, bytes);
  assert.equal(requests[0].headers.Cookie, undefined);
  assert.equal(requests[0].headers.Authorization, undefined);
});
test("image fetch rejects HTML error pages and oversized previews", async () => {
  await assert.rejects(
    fetchPublic(item.imageUrl, {
      image: true,
      lookup,
      transport: transport({
        type: "text/html",
        body: Buffer.from("<html>Sign in</html>"),
      }),
    }),
    /image/i,
  );
  await assert.rejects(
    fetchPublic(item.imageUrl, {
      image: true,
      maxBytes: 10,
      lookup,
      transport: transport(),
    }),
    /large/i,
  );
});
test("image redirects retain private-network protection", async () => {
  await assert.rejects(
    fetchPublic(item.imageUrl, {
      image: true,
      lookup,
      transport: transport({
        status: 302,
        location: "http://127.0.0.1/private",
      }),
    }),
    /public preview/,
  );
});
test("private previews enforce ownership and retention before any fetch", async () => {
  let fetched = 0;
  const fetcher = async () => {
    fetched++;
    return { body: bytes, contentType: "image/png" };
  };
  for (const value of [
    null,
    { ...item, ownerId: "other" },
    { ...item, deletedAt: "2000-01-01" },
    { ...item, imageUrl: null },
  ]) {
    assert.equal(
      (await previewImageResponse(value, "owner", { fetcher })).status,
      404,
    );
  }
  assert.equal(fetched, 0);
});
test("successful preview has safe private response headers and retains bytes", async () => {
  const r = await previewImageResponse(item, "owner", {
    fetcher: async () => ({
      body: bytes,
      contentType: "image/png",
      headers: { "set-cookie": "secret" },
    }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);
  assert.match(r.headers.get("cache-control"), /^private/);
  assert.equal(r.headers.get("vary"), "Cookie");
  assert.equal(r.headers.get("set-cookie"), null);
  assert.match(r.headers.get("content-security-policy"), /sandbox/);
});
test("unavailable upstream images return an uncached failure for the source-card fallback", async () => {
  const r = await previewImageResponse(item, "owner", {
    fetcher: async () => {
      throw Error("upstream failed");
    },
  });
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
