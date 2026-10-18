// Real hosted capture and GPT-6 Luna. Isolated owner; only synthetic content is sent.
import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const origin = process.env.COMMONPLACE_TEST_URL;
if (!origin?.startsWith("https://")) throw Error("Use the hosted HTTPS URL.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const owner = "visual-qa:" + randomUUID(),
  token = randomBytes(32).toString("hex");
const call = async (path, body) => {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
};
let subscription;
async function ready() {
  const until = Date.now() + 240000;
  while (Date.now() < until) {
    const row = await db.get("SELECT * FROM stories WHERE collection_id=?", [
      subscription.collectionId,
    ]);
    if (row?.status === "error") throw Error(row.error);
    if (row?.session_json && row.processed_revision >= row.revision)
      return JSON.parse(row.session_json);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw Error("Hosted generation did not finish in four minutes.");
}
try {
  await db.run(
    "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)",
    [
      randomUUID(),
      owner,
      "Visual QA",
      createHash("sha256").update(token).digest("hex"),
      new Date().toISOString(),
    ],
  );
  subscription = await call("/api/subscribe", {
    sessionId: randomUUID(),
    title: "Visual QA",
    provider: "Codex",
    mode: "follow",
  });
  await call("/api/capture", {
    subscriptionId: subscription.subscriptionId,
    turns: [
      {
        id: "design",
        role: "user",
        text: `<in-app-browser-context>Current URL: https://example.com/incidental</in-app-browser-context>
The project is called Field Notes. Use https://www.are.na/ for uncropped image grids. Use https://linear.app/ for navigation. Use https://www.notion.com/ for restrained typography. Those three references define our portfolio. Keep Georgia for the heading. Show three project cards with generous spacing. No slogans.
I also logged into https://mail.google.com/mail/u/0/ and visited https://claude.ai/design/p/private-session and https://auth.openai.com/log-in; these are unrelated navigation.`,
      },
    ],
  });
  const rows = await db.all("SELECT url FROM items WHERE owner_id=?", [owner]);
  assert.equal(
    rows.length,
    3,
    "Only the three intentional references are collected",
  );
  const first = await ready();
  assert.equal(first.collectionName, "Field Notes");
  assert.equal(
    (
      await db.get("SELECT name FROM collections WHERE id=?", [
        subscription.collectionId,
      ])
    ).name,
    "Field Notes",
  );
  const ids = new Set(
    first.steps.flatMap((s) => s.canvas.items.map((i) => i.itemId)),
  );
  const mapIds = new Set(
    first.map.nodes
      .flatMap((n) => [n.itemId, ...n.details.map((d) => d.itemId)])
      .filter(Boolean),
  );
  assert.ok(ids.size >= 2, "Story should connect multiple relevant media");
  assert.ok(mapIds.size >= 2, "Map should show multiple relevant media");
  assert.ok(first.steps.every((s) => s.text.split(/\s+/).length <= 45));
  console.log(
    JSON.stringify({
      phase: "initial",
      storyMedia: ids.size,
      mapMedia: mapIds.size,
      steps: first.steps.map((s) => ({
        title: s.title,
        text: s.text,
        media: s.canvas.items.length,
      })),
    }),
  );
  await call("/api/capture", {
    subscriptionId: subscription.subscriptionId,
    turns: [
      {
        id: "direction-two",
        role: "user",
        text: "Keep Are.na's image proportions, Linear's navigation and Notion's typography. Change the project grid from three columns to two so the work has more room.",
      },
    ],
  });
  const next = await ready();
  assert.match(JSON.stringify(next), /two|2 columns/i);
  const nextIds = new Set(
    next.steps.flatMap((s) => s.canvas.items.map((i) => i.itemId)),
  );
  assert.ok(nextIds.size >= 2, "Continuation retains visual references");
  console.log(
    JSON.stringify({
      phase: "continued",
      storyMedia: nextIds.size,
      steps: next.steps.length,
    }),
  );
} finally {
  await db.batch(
    [
      "turns",
      "items",
      "story_beats",
      "stories",
      "sessions",
      "collections",
      "devices",
    ].map((table) => ({
      sql:
        table === "story_beats"
          ? "DELETE FROM story_beats WHERE collection_id IN (SELECT id FROM collections WHERE owner_id=?)"
          : `DELETE FROM ${table} WHERE owner_id=?`,
      args: [owner],
    })),
    "write",
  );
  await db.close();
  console.log("Removed isolated visual QA fixtures.");
}
