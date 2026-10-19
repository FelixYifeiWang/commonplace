import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  markPath,
  noxSvg,
  restingN,
  traceOutline,
} from "../lib/newron-mark.mjs";

test("the resting N is one bonded body and the drop about to join it", () => {
  const loops = traceOutline();
  assert.equal(loops.length, 2);
  // The drop that sits apart is the top right one.
  const centres = loops.map((loop) =>
    loop.reduce(
      ([x, y], [px, py]) => [x + px / loop.length, y + py / loop.length],
      [0, 0],
    ),
  );
  const apart = centres.find(([x, y]) => x > 0.3 && y > 0.3);
  assert.ok(apart, "the top right drop is a separate shape");
});
test("the stem, diagonal and drops are inside the mark and the gaps are not", () => {
  assert.ok(restingN(-0.42, 0) < 0, "left stem");
  assert.ok(restingN(0, 0) < 0, "diagonal");
  assert.ok(restingN(0.45, 0.47) < 0, "top right drop");
  assert.ok(restingN(0.43, 0.05) > 0, "no right stem at rest");
  assert.ok(restingN(0, 0.45) > 0, "no top bar");
});
test("the outline is centred in its box and only uses commands the icon builder reads", () => {
  const d = markPath();
  assert.match(d, /^M [\d. CZM]+$/);
  const numbers = d
    .split(" ")
    .filter((t) => !/[MCZ]/.test(t))
    .map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0),
    ys = numbers.filter((_, i) => i % 2 === 1);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 40) < 1);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 40) < 1);
});
test("the header mark and favicon are the current resting N", async () => {
  for (const file of ["nox.svg", "favicon.svg"]) {
    const svg = await readFile(
      new URL(`../public/${file}`, import.meta.url),
      "utf8",
    );
    assert.equal(
      svg,
      noxSvg(),
      `${file} is stale; run node scripts/build-newron-mark.mjs`,
    );
  }
});
