import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "vite";

// Exercise the merged config: plugins may override the caller's watch settings.
test("local preview stays non-watching after all plugin configuration is merged", async () => {
  const previous = process.env.COMMONPLACE_LOCAL_PREVIEW;
  process.env.COMMONPLACE_LOCAL_PREVIEW = "1";
  try {
    const config = await resolveConfig({}, "serve");
    assert.equal(config.server.watch, null);
    assert.equal(config.server.hmr, false);
    assert.ok(config.cacheDir.endsWith("/node_modules/.vite-local"));
  } finally {
    if (previous === undefined) delete process.env.COMMONPLACE_LOCAL_PREVIEW;
    else process.env.COMMONPLACE_LOCAL_PREVIEW = previous;
  }
});
