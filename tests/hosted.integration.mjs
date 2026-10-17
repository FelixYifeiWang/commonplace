// Explicit live check: uses production secrets from the environment and paid model calls.
// Creates and removes only its own fixtures. Never prints credentials or tokens.
import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { uploadPresigned } from "@vercel/blob/client";
const base = process.env.COMMONPLACE_TEST_URL;
if (!base?.startsWith("https://") || !process.env.COMMONPLACE_ACCESS_CODE)
  throw new Error("Set a hosted test URL and access code.");
let cookie, id;
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
async function call(path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
async function ready(minimum = 1) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    // Observe the queue directly so this check cannot accidentally start generation.
    const state = await db.get(
      "SELECT status,error,revision,processed_revision FROM stories WHERE collection_id=?",
      [id],
    );
    if (state.status === "error") throw new Error(state.error);
    if (
      state.status === "ready" &&
      state.revision === state.processed_revision
    ) {
      const story = await call("/api/stories?collectionId=" + id);
      if (story.beats.length >= minimum) return story;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Hosted story did not finish.");
}
try {
  for (const headers of [
    {},
    {
      "oai-authenticated-user-id": "hosted-owner",
      "oai-authenticated-user-email": "forged@example.com",
    },
  ])
    assert.equal(
      (await fetch(base + "/api/workspace", { headers })).status,
      401,
    );
  assert.equal((await fetch(base + "/api/story-run")).status, 401);
  const wrong = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: new URLSearchParams({ code: "wrong" }),
    redirect: "manual",
  });
  assert.equal(wrong.headers.get("location"), "/signin-with-chatgpt?error=1");
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: new URLSearchParams({ code: process.env.COMMONPLACE_ACCESS_CODE }),
    redirect: "manual",
  });
  assert.equal(login.status, 303);
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("commonplace_session="));
  const initial = await call("/api/workspace");
  assert.ok(Array.isArray(initial.collections));
  console.log("Private sign-in and forged-header isolation passed.");
  const created = await call("/api/collections", "POST", {
    name: "QA hosted deployment " + Date.now(),
  });
  id = created.id;
  await call("/api/items", "POST", {
    collectionId: id,
    kind: "note",
    title: "Initial direction",
    body: "We chose a quiet portfolio: one serif headline, then three project cards. No slogan. The sketch set the layout.",
  });
  const first = await ready();
  assert.ok(first.beats.every((beat) => beat.model === "gpt-6-luna"));
  console.log("Hosted GPT-6 Luna generated the first story.");
  await call("/api/items", "POST", {
    collectionId: id,
    kind: "note",
    title: "Motion decision",
    body: "After trying fast motion, we slowed card transitions to 600 milliseconds and replaced the blue accent with warm ochre. The serif headline stays.",
  });
  const second = await ready(first.beats.length + 1);
  assert.deepEqual(second.beats.slice(0, first.beats.length), first.beats);
  console.log(
    "Hosted continuation appended without rewriting earlier moments.",
  );
  const ticket = await call("/api/uploads", "POST");
  assert.equal(ticket.mode, "blob");
  const content = new Blob(["Commonplace hosted upload QA"], {
    type: "text/plain",
  });
  const uploaded = await uploadPresigned(
    ticket.prefix + "deployment-check.txt",
    content,
    {
      access: "private",
      handleUploadUrl: base + ticket.url,
      headers: { Cookie: cookie, Origin: base },
      contentType: "text/plain",
    },
  );
  const file = await call("/api/items", "POST", {
    collectionId: id,
    fileKey: uploaded.pathname,
  });
  assert.equal((await fetch(base + "/api/files/" + file.id)).status, 401);
  const download = await fetch(base + "/api/files/" + file.id, {
    headers: { Cookie: cookie },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Commonplace hosted upload QA");
  const range = await fetch(base + "/api/files/" + file.id, {
    headers: { Cookie: cookie, Range: "bytes=0-10" },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "Commonplace");
  console.log(
    "Direct private Blob upload, authenticated download and byte ranges passed.",
  );
  // Blob cleanup is performed separately through the authenticated Vercel CLI.
  console.log("QA_BLOB_PATH=" + uploaded.pathname);
  await call("/api/items", "DELETE", { ids: [file.id] });
  await call("/api/collections", "DELETE", { id });
  const remaining = await call("/api/workspace");
  assert.ok(!remaining.collections.some((row) => row.id === id));
  assert.ok(!remaining.items.some((row) => row.collectionId === id));
  console.log("Deletion and empty-space restoration passed.");
} finally {
  if (id) {
    await db.batch(
      [
        { sql: "DELETE FROM story_beats WHERE collection_id=?", args: [id] },
        { sql: "DELETE FROM stories WHERE collection_id=?", args: [id] },
        { sql: "DELETE FROM items WHERE collection_id=?", args: [id] },
        { sql: "DELETE FROM collections WHERE id=?", args: [id] },
      ],
      "write",
    );
    console.log("Removed only hosted QA database fixtures.");
  }
  db.close();
}
