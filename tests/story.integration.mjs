// Live local verification; uses the configured GPT-6 Luna key and removes only its fixtures.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
const base = "http://127.0.0.1:3100";
async function call(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: "__sites_local_auth=1",
      Origin: base,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.ok, `API ${path}: ${r.status}`);
  return data;
}
async function ready(id, after = 0) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const s = await call("/api/stories?collectionId=" + id);
    if (s.status === "error") throw new Error(s.error);
    if (!s.pending && s.status === "ready" && s.beats.length >= after) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Story did not finish in time.");
}
let id;
try {
  assert.equal(
    (
      await fetch(base + "/api/story-jobs", {
        method: "POST",
        body: '{"op":"claim"}',
      })
    ).status,
    401,
  );
  const c = await call("/api/collections", "POST", {
    name: "QA Story continuation",
  });
  id = c.id;
  assert.equal(
    (await fetch(base + "/api/stories?collectionId=" + id)).status,
    401,
  );
  await call("/api/items", "POST", {
    collectionId: id,
    kind: "note",
    title: "Initial direction",
    body: "We chose a quiet portfolio: one serif headline, then three project cards. No slogan. The sketch set the layout.",
  });
  const first = await ready(id, 1),
    saved = JSON.stringify(first.beats);
  assert.ok(first.beats.every((b) => b.model === "gpt-6-luna"));
  console.log("Live first story generated with GPT-6 Luna.");
  const added = await call("/api/items", "POST", {
    collectionId: id,
    kind: "note",
    title: "A new motion direction",
    body: "After trying fast motion, we decided to slow every card transition to 600 milliseconds and replace the blue accent with warm ochre. The earlier serif headline stays.",
  });
  const second = await ready(id, first.beats.length + 1);
  assert.equal(
    JSON.stringify(second.beats.slice(0, first.beats.length)),
    saved,
  );
  console.log(
    "New gallery content appended a story beat; earlier beats are byte-for-byte unchanged.",
  );
  await call("/api/items", "DELETE", { ids: [added.id] });
  const third = await ready(id, second.beats.length);
  assert.equal(JSON.stringify(third.beats), JSON.stringify(second.beats));
  console.log(
    "Deletion preserves narrative; unchanged checkpoints do not rewrite it.",
  );
} finally {
  if (id) {
    const root = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
    const file = readdirSync(root).find(
      (n) => n.endsWith(".sqlite") && !n.includes("metadata"),
    );
    const db = new DatabaseSync(join(root, file));
    db.exec("PRAGMA busy_timeout=5000; BEGIN");
    db.prepare("DELETE FROM items WHERE collection_id=?").run(id);
    db.prepare("DELETE FROM collections WHERE id=?").run(id);
    db.exec("COMMIT");
    db.close();
    console.log("Removed story integration fixtures.");
  }
}
