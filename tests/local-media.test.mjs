import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { createLocalFiles } from "../build/local-files.mjs";
import { screenshotResource } from "../desktop/screenshot-resource.mjs";

test("screenshots reject private DNS results before connecting", async () => {
  await assert.rejects(
    screenshotResource("https://example.com", {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      transport: () => assert.fail("must not connect"),
    }),
    /Public address/,
  );
});
test("screenshots reject credentials and local URLs", async () => {
  for (const url of [
    "http://localhost/a",
    "https://user:pass@example.com",
    "file:///etc/passwd",
  ])
    await assert.rejects(screenshotResource(url), /Public web/);
});
test("screenshot transport pins DNS, strips cookies and preserves redirects for revalidation", async () => {
  let options;
  const result = await screenshotResource("https://example.com", {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: (_url, opts, callback) => {
      options = opts;
      const req = new EventEmitter();
      req.end = () => {
        const res = Readable.from([Buffer.from("body")]);
        res.statusCode = 302;
        res.headers = {
          location: "http://127.0.0.1/private",
          "set-cookie": "secret=1",
          "content-type": "text/html",
        };
        callback(res);
        res.on("end", () => req.emit("close"));
      };
      return req;
    },
  });
  options.lookup("example.com", {}, (_error, address) =>
    assert.equal(address, "93.184.216.34"),
  );
  assert.deepEqual(result.headers, {
    "Content-Type": "text/html",
    Location: "http://127.0.0.1/private",
  });
  assert.equal(options.headers.Cookie, undefined);
});
test("local file tickets are single-use, retain ownership and serve byte ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "commonplace-files-")),
    files = createLocalFiles(root);
  const server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/__commonplace/files/"))
        await files.upload(req, res, req.url.split("/").at(-1));
      else await files.send(req.url.slice(1), req.headers.range, res);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ticket = files.ticket("owner-a");
    const upload = await fetch(base + ticket.url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "X-File-Name": "clip.mp4" },
      body: "0123456789",
    });
    assert.equal(upload.status, 200);
    const { key } = await upload.json();
    assert.equal((await files.info(key)).ownerId, "owner-a");
    assert.equal(
      (await fetch(base + ticket.url, { method: "PUT", body: "replacement" }))
        .status,
      403,
    );
    const partial = await fetch(base + "/" + key, {
      headers: { Range: "bytes=2-5" },
    });
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), "2345");
    assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(
      (await fetch(base + "/" + key, { headers: { Range: "bytes=99-100" } }))
        .status,
      416,
    );
    await assert.rejects(files.info("../secret"), /Invalid file/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
