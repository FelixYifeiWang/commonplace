import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMedia,
  parsePageMetadata,
  embedFor,
  publicUrl,
} from "../lib/media.mjs";
import { isPublicAddress, fetchPublic } from "../desktop/public-fetch.mjs";
test("page metadata handles entities, relative covers, and reversed attribute order", () => {
  const m = parsePageMetadata(
    '<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta content="/cover.jpg" property="og:image"><meta name="description" content="A short description">',
    "https://example.com/page",
  );
  assert.deepEqual(m, {
    title: "A & B",
    body: "A short description",
    imageUrl: "https://example.com/cover.jpg",
    kind: "link",
    embedUrl: null,
  });
});
test("script content is never interpreted as metadata", () => {
  assert.equal(
    parsePageMetadata(
      '<script>"<meta property="og:title" content="wrong">"</script><title>Right</title>',
      "https://example.com",
    ).title,
    "Right",
  );
});
test("unsafe metadata images are ignored", () => {
  assert.equal(
    parsePageMetadata(
      '<meta property="og:image" content="http://127.0.0.1/private">',
      "https://example.com",
    ).imageUrl,
    null,
  );
});
test("media classification handles documents, audio, direct video and content types", () => {
  assert.deepEqual(
    [
      "https://example.com/a.PDF",
      "https://example.com/a.mp3",
      "https://example.com/a.webm",
      "https://example.com/asset",
    ].map((url, i) => classifyMedia(url, i === 3 ? "image/png" : "")),
    ["document", "audio", "video", "image"],
  );
});
test("video embeds use exact provider hosts and safe identifiers", () => {
  assert.equal(
    embedFor("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    embedFor("https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ"),
    null,
  );
});
test("private, credential-bearing and signed URLs are not previewed", () => {
  assert.deepEqual(
    [
      "http://localhost/",
      "http://2130706433/",
      "https://user:pass@example.com",
      "https://example.com/?token=secret",
      "http://printer.local/",
    ].map(publicUrl),
    [null, null, null, null, null],
  );
});
test("private and special IPv4 ranges are excluded", () => {
  assert.deepEqual(
    [
      "127.0.0.1",
      "10.0.1.1",
      "169.254.169.254",
      "192.168.1.1",
      "100.64.0.1",
      "224.0.0.1",
      "8.8.8.8",
    ].map(isPublicAddress),
    [false, false, false, false, false, false, true],
  );
});
test("DNS resolving a public-looking hostname to a private address is refused", async () => {
  await assert.rejects(
    fetchPublic("https://public-looking.example", {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    /public address/,
  );
});

test("missing cover metadata never becomes a made-up URL", () => {
  assert.equal(
    parsePageMetadata("<title>No image</title>", "https://example.com/page")
      .imageUrl,
    null,
  );
});

import { EventEmitter } from "node:events";
function redirectTransport(location, observed = []) {
  return (_url, options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = () => {};
    req.end = () => {
      options.lookup("example.com", {}, (_error, address) =>
        observed.push(address),
      );
      const response = new EventEmitter();
      response.statusCode = 302;
      response.headers = { location };
      response.destroy = () => {};
      callback(response);
    };
    return req;
  };
}
test("a redirect cannot turn a public preview into a local network request", async () => {
  const observed = [];
  await assert.rejects(
    fetchPublic("https://example.com", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: redirectTransport("http://127.0.0.1/private", observed),
    }),
    /public preview/,
  );
  assert.deepEqual(observed, ["93.184.216.34"]);
});
test("every redirected hostname is resolved and checked again", async () => {
  let lookups = 0;
  await assert.rejects(
    fetchPublic("https://example.com", {
      lookup: async () => [
        { address: ++lookups === 1 ? "93.184.216.34" : "10.0.0.1", family: 4 },
      ],
      transport: redirectTransport("https://private-looking.example/"),
    }),
    /public address/,
  );
  assert.equal(lookups, 2);
});
