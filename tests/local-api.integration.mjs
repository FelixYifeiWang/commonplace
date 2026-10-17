// Run against the local preview only: node tests/local-api.integration.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const root = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const dbFile = readdirSync(root).find(
  (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
);
const origin = "http://127.0.0.1:3100",
  created = { sessions: [], devices: [], collections: [], files: [] };
async function call(path, method = "GET", body, token) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { Cookie: "__sites_local_auth=1" }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  const device = await call("/api/devices", "POST", {
    name: "Temporary integration fixture",
  });
  created.devices.push(device.data.id);
  assert.equal(device.status, 201);
  const inputs = ["First fixture", "Second fixture"].map((title) => ({
    sessionId: crypto.randomUUID(),
    title,
    provider: "Codex",
    mode: "follow",
  }));
  for (const input of inputs) {
    const r = await call("/api/subscribe", "POST", input, device.data.token);
    created.sessions.push(r.data.subscriptionId);
    created.collections.push(r.data.collectionId);
    assert.equal(r.status, 201);
  }
  assert.notEqual(created.collections[0], created.collections[1]);
  const repeat = await call(
    "/api/subscribe",
    "POST",
    inputs[0],
    device.data.token,
  );
  assert.equal(repeat.data.subscriptionId, created.sessions[0]);
  assert.equal(repeat.data.collectionId, created.collections[0]);
  for (const [i, id] of created.sessions.entries()) {
    const payload = {
      subscriptionId: id,
      turns: [
        {
          id: "turn",
          role: "user",
          text: i
            ? "A document https://example.com/paper.pdf"
            : "A website https://www.are.na and a video https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      ],
    };
    assert.equal(
      (await call("/api/capture", "POST", payload, device.data.token)).status,
      200,
    );
    assert.equal(
      (await call("/api/capture", "POST", payload, device.data.token)).status,
      200,
    );
  }
  let space = (await call("/api/workspace")).data;
  const fixtureItems = space.items.filter((i) =>
    created.sessions.includes(i.sessionId),
  );
  assert.equal(fixtureItems.length, 3);
  assert.deepEqual(fixtureItems.map((i) => i.kind).sort(), [
    "document",
    "link",
    "video",
  ]);
  assert.equal(
    space.collections.find((c) => c.id === created.collections[0]).name,
    "First fixture",
  );
  for (const item of fixtureItems)
    assert.equal(
      item.collectionId,
      created.collections[created.sessions.indexOf(item.sessionId)],
    );
  const link = fixtureItems.find((i) => i.kind === "link");
  assert.equal(
    (await call("/api/previews", "POST", { ids: [link.id] })).status,
    200,
  );
  space = (await call("/api/workspace")).data;
  const enriched = space.items.find((i) => i.id === link.id);
  assert.equal(enriched.title, "Are.na");
  assert.ok(enriched.imageUrl?.startsWith("https://"));
  assert.equal(enriched.previewStatus, "ready");
  const unauth = await fetch(origin + "/api/previews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [link.id] }),
  });
  assert.equal(unauth.status, 401);
  assert.equal(
    (
      await call("/api/groups", "PATCH", {
        ids: fixtureItems.map((i) => i.id),
        name: "Test research",
      })
    ).status,
    200,
  );
  space = (await call("/api/workspace")).data;
  assert.equal(
    space.items.filter((i) => i.groupName === "Test research").length,
    3,
  );
  assert.equal(
    (
      await call("/api/groups", "PATCH", {
        ids: [crypto.randomUUID()],
        name: "Unavailable",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/groups", "PATCH", {
        ids: fixtureItems.map((i) => i.id),
        name: "",
      })
    ).status,
    200,
  );
  const ticket = await call("/api/uploads", "POST");
  assert.equal(ticket.status, 200);
  const upload = await fetch(origin + ticket.data.url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain", "X-File-Name": "test-note.txt" },
    body: "Local file fixture",
  });
  assert.equal(upload.status, 200);
  const file = await upload.json();
  created.files.push(file.key);
  const added = await call("/api/items", "POST", {
    fileKey: file.key,
    collectionId: created.collections[0],
  });
  assert.equal(added.status, 201);
  assert.equal(added.data.kind, "file");
  const download = await fetch(origin + "/api/files/" + added.data.id, {
    headers: { Cookie: "__sites_local_auth=1" },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Local file fixture");
  assert.equal(
    (await fetch(origin + "/api/files/" + added.data.id)).status,
    401,
  );
  assert.equal(
    (await fetch(origin + "/api/screenshots/" + link.id)).status,
    401,
  );
  assert.equal(
    (await fetch(origin + "/api/uploads", { method: "POST" })).status,
    401,
  );
  console.log(
    "Verified: separate session collections, repeat-drop reuse, All items union, capture deduplication, media classification, real website metadata, authenticated previews, saved groups, local file upload and download, media authentication.",
  );
} finally {
  const db = new DatabaseSync(join(root, dbFile));
  db.exec("PRAGMA busy_timeout=5000; BEGIN");
  for (const id of created.sessions.filter(Boolean)) {
    db.prepare("DELETE FROM turns WHERE session_id=?").run(id);
    db.prepare("DELETE FROM items WHERE session_id=?").run(id);
    db.prepare("DELETE FROM sessions WHERE id=?").run(id);
  }
  for (const id of created.collections.filter(Boolean)) {
    db.prepare("DELETE FROM items WHERE collection_id=?").run(id);
    db.prepare("DELETE FROM collections WHERE id=?").run(id);
  }
  for (const key of created.files) {
    rmSync(join(".sites-runtime/files", key), { force: true });
    rmSync(join(".sites-runtime/files", key + ".json"), { force: true });
  }
  for (const id of created.devices.filter(Boolean))
    db.prepare("DELETE FROM devices WHERE id=?").run(id);
  db.exec("COMMIT");
  db.close();
  console.log("Removed integration fixtures.");
}
