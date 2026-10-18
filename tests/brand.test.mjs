import test from "node:test";
import assert from "node:assert/strict";
import { buddyLink, PRODUCTION_ORIGIN, LEGACY_ORIGIN } from "../lib/brand.mjs";
import { installationOrigin } from "../desktop/install.mjs";

test("Newron opens the existing buddy using its registered legacy link", () => {
  assert.equal(buddyLink(PRODUCTION_ORIGIN), buddyLink(LEGACY_ORIGIN));
});
test("Newron setup reuses the original production installation identity", () => {
  assert.equal(installationOrigin(PRODUCTION_ORIGIN), LEGACY_ORIGIN);
  assert.equal(installationOrigin(LEGACY_ORIGIN), LEGACY_ORIGIN);
});
test("other spaces retain independent launcher and installation identities", () => {
  assert.equal(
    installationOrigin("https://space.example"),
    "https://space.example",
  );
  assert.equal(
    buddyLink("https://space.example"),
    "commonplace://show?origin=https%3A%2F%2Fspace.example",
  );
});
