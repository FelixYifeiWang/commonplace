// Live local test with a real GPT-6 Luna response. Only this test's fixtures are removed.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync } from "node:fs";
const base = "http://127.0.0.1:3100";
const root = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file =
  root +
  "/" +
  readdirSync(root).find(
    (n) => n.endsWith(".sqlite") && !n.includes("metadata"),
  );
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout=5000");
let device,
  subscription,
  passed = false;
async function call(path, method = "GET", body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { Cookie: "__sites_local_auth=1" }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${data.error || ""}`);
  return data;
}
async function ready() {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const story = await call(
      "/api/stories?collectionId=" + subscription.collectionId,
    );
    if (story.status === "error") throw new Error(story.error);
    if (!story.pending && story.session) return story;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Session view did not finish in time.");
}
function prioritize() {
  db.prepare("UPDATE stories SET next_attempt_at=-1 WHERE collection_id=?").run(
    subscription.collectionId,
  );
}
try {
  device = await call("/api/devices", "POST", {
    name: "Session view QA fixture",
  });
  subscription = await call(
    "/api/subscribe",
    "POST",
    {
      sessionId: crypto.randomUUID(),
      title: "QA Quiet portfolio",
      provider: "Codex",
      mode: "follow",
    },
    device.token,
  );
  await call(
    "/api/capture",
    "POST",
    {
      subscriptionId: subscription.subscriptionId,
      turns: [
        {
          id: "design-one",
          role: "user",
          text: "I want a quiet portfolio. Use https://www.are.na/ as a reference for generous spacing, and https://linear.app/ for clear navigation. I picked Georgia for the headline Small things, made well. The layout starts with one serif headline and three project cards. No slogans and no extra tags. Keep the original proportions of every image.",
        },
      ],
    },
    device.token,
  );
  prioritize();
  const first = await ready();
  assert.ok(first.session.steps.length > 0);
  assert.ok(first.session.map.nodes.length > 0);
  assert.equal(
    db
      .prepare("SELECT session_model FROM stories WHERE collection_id=?")
      .get(subscription.collectionId).session_model,
    "gpt-6-luna",
  );
  console.log("Real GPT-6 Luna produced grounded Story and Gallery views.");
  const before = JSON.stringify(first.session);
  await call(
    "/api/capture",
    "POST",
    {
      subscriptionId: subscription.subscriptionId,
      turns: [
        {
          id: "design-two",
          role: "user",
          text: "I tried the motion and changed my mind. Make card transitions 600 milliseconds instead of 150 milliseconds. I also want warm ochre for the accent, not blue. Keep Georgia, the serif headline, and the generous spacing from Are.na.",
        },
      ],
    },
    device.token,
  );
  prioritize();
  const second = await ready();
  assert.notEqual(JSON.stringify(second.session), before);
  assert.match(JSON.stringify(second.session), /600|ochre/i);
  assert.match(JSON.stringify(second.session), /Georgia|serif|Are.na/i);
  assert.ok(second.session.steps.length <= 5);
  console.log(
    "Continuation includes the new choice and retains the earlier design direction.",
  );
  const space = await call("/api/workspace");
  const block = space.items.find(
    (item) => item.collectionId === subscription.collectionId,
  );
  assert.ok(block);
  await call("/api/items", "DELETE", { ids: [block.id] });
  prioritize();
  const third = await ready();
  assert.equal(JSON.stringify(third.session), JSON.stringify(second.session));
  await call(
    "/api/capture",
    "POST",
    {
      subscriptionId: subscription.subscriptionId,
      turns: [
        {
          id: "design-one",
          role: "user",
          text: "I want a quiet portfolio. Use https://www.are.na/ as a reference for generous spacing, and https://linear.app/ for clear navigation. I picked Georgia for the headline Small things, made well. The layout starts with one serif headline and three project cards. No slogans and no extra tags. Keep the original proportions of every image.",
        },
      ],
    },
    device.token,
  );
  assert.ok(
    !(await call("/api/workspace")).items.some((item) => item.id === block.id),
  );
  console.log(
    "Deleted media stays deleted after capture replay, and deletion does not rewrite the story.",
  );
  passed = true;
  if (process.env.KEEP_QA_FIXTURE === "1")
    writeFileSync(
      "../../work/session-qa-fixture.json",
      JSON.stringify({
        collectionId: subscription.collectionId,
        subscriptionId: subscription.subscriptionId,
        deviceId: device.id,
      }),
      { mode: 0o600 },
    );
} finally {
  if (!passed || process.env.KEEP_QA_FIXTURE !== "1") {
    db.exec("BEGIN");
    if (subscription) {
      db.prepare("DELETE FROM turns WHERE session_id=?").run(
        subscription.subscriptionId,
      );
      db.prepare("DELETE FROM items WHERE collection_id=?").run(
        subscription.collectionId,
      );
      db.prepare("DELETE FROM sessions WHERE id=?").run(
        subscription.subscriptionId,
      );
      db.prepare("DELETE FROM story_beats WHERE collection_id=?").run(
        subscription.collectionId,
      );
      db.prepare("DELETE FROM stories WHERE collection_id=?").run(
        subscription.collectionId,
      );
      db.prepare("DELETE FROM collections WHERE id=?").run(
        subscription.collectionId,
      );
    }
    if (device) db.prepare("DELETE FROM devices WHERE id=?").run(device.id);
    db.exec("COMMIT");
    console.log("Removed only the session view test fixtures.");
  }
  db.close();
}
