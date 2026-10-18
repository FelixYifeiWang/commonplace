import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

// The installed buddy runs only the packaged files, so a local import that is not packaged crashes it on start.
test("every file the companion imports is packaged with it", async () => {
  const manifest = JSON.parse(
    await readFile("public/companion/manifest.json", "utf8"),
  );
  const packaged = new Set(manifest.files.map((f) => f.path));
  for (const path of packaged) {
    if (!/\.(mjs|cjs|js)$/.test(path)) continue;
    const source = await readFile(join("public/companion/files", path), "utf8");
    for (const [, spec] of source.matchAll(
      /(?:from\s+|import\s*\(\s*|require\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
    ))
      assert.ok(
        packaged.has(normalize(join(dirname(path), spec))),
        `${path} imports ${spec}, which is not packaged`,
      );
  }
});
