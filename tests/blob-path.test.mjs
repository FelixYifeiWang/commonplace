import test from "node:test";
import assert from "node:assert/strict";
import { blobRequestPath } from "../lib/hosted/blob-path.mjs";

test("retrieval preserves encoded owner IDs and filenames as literal Blob keys", () => {
  const key = "users/google%3A123/id/a%20sketch%23one.png";
  const url = new URL(
    `https://store.private.blob.vercel-storage.com/${blobRequestPath(key)}`,
  );
  assert.equal(decodeURIComponent(url.pathname.slice(1)), key);
});

test("ordinary screenshot and upload keys keep their directory structure", () => {
  assert.equal(
    blobRequestPath("previews/page-v2/hash.jpg"),
    "previews/page-v2/hash.jpg",
  );
});
