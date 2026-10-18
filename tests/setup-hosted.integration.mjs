// Live pairing and public-release checks. No transcripts or paid model calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { connect } from "@tursodatabase/serverless";
import { validateManifest } from "../desktop/install.mjs";
const base = process.env.COMMONPLACE_TEST_URL;
if (!base?.startsWith("https://") || !process.env.COMMONPLACE_ACCESS_CODE)
  throw new Error("Set the hosted URL and access code.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const codes = [],
  devices = [];
try {
  for (const path of ["/setup", "/SKILL.md"]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Wait for “Buddy connected.”/);
  }
  const manifest = validateManifest(
    await (await fetch(base + "/companion/manifest.json")).json(),
  );
  for (const file of manifest.files) {
    const r = await fetch(base + "/companion/files/" + file.path);
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.length, file.size);
    assert.equal(hash(bytes), file.sha256);
  }
  assert.equal((await fetch(base + "/companion/install.mjs")).status, 200);
  assert.equal(
    (await fetch(base + "/api/setup", { method: "POST" })).status,
    401,
  );
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base },
    body: new URLSearchParams({ code: process.env.COMMONPLACE_ACCESS_CODE }),
    redirect: "manual",
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("commonplace_session="));
  async function issue() {
    const r = await fetch(base + "/api/setup", {
      method: "POST",
      headers: { Cookie: cookie, Origin: base },
    });
    assert.equal(r.status, 200);
    const setup = await r.json(),
      link = new URL(setup.link);
    assert.equal(link.origin, base);
    assert.match(link.hash, /^#[a-f0-9]{64}$/);
    const code = link.hash.slice(1);
    codes.push(code);
    return code;
  }
  async function claim(code, deviceToken) {
    return fetch(base + "/api/setup/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceToken }),
    });
  }
  const code = await issue(),
    r = await claim(code);
  assert.equal(r.status, 200);
  const device = await r.json();
  devices.push(device.id);
  assert.equal((await claim(code)).status, 410);
  const reused = await claim(await issue(), device.token);
  assert.equal(reused.status, 200);
  assert.deepEqual(await reused.json(), device);
  console.log(
    "Hosted instructions, every release checksum, anonymous isolation, pairing, replay rejection and device reuse passed.",
  );
} finally {
  if (codes.length || devices.length)
    await db.batch(
      [
        ...codes.map((code) => ({
          sql: "DELETE FROM pairing_codes WHERE code_hash=?",
          args: [hash(code)],
        })),
        ...devices.map((id) => ({
          sql: "DELETE FROM devices WHERE id=?",
          args: [id],
        })),
      ],
      "write",
    );
  await db.close();
  console.log("Removed hosted pairing fixtures.");
}
