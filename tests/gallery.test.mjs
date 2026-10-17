import test from "node:test";
import assert from "node:assert/strict";
import {
  groupItems,
  filterItems,
  sourceHost,
  parseBlockInput,
} from "../lib/gallery.mjs";
const items = [
  {
    id: "a",
    title: "Paul Davison",
    url: "https://www.abcd.com/xxx",
    kind: "link",
  },
  { id: "b", title: "Rohan Seth", url: "https://abcd.com/yyy", kind: "link" },
  {
    id: "c",
    title: "Paul interview",
    url: "https://example.org/interview",
    kind: "video",
  },
];
test("domain stacks keep every page and original path", () =>
  assert.deepEqual(
    groupItems(items).map((g) => g.items.map((i) => i.url)),
    [[items[0].url, items[1].url], [items[2].url]],
  ));
test("explicit person groups span websites", () =>
  assert.equal(
    groupItems(items.map((i) => ({ ...i, groupName: "Paul" }))).length,
    1,
  ));
test("search and type filters operate on sources inside stacks", () =>
  assert.deepEqual(
    filterItems(items, { query: "Paul", type: "video" }).map((i) => i.id),
    ["c"],
  ));
test("distinct subdomains and hosted tenants remain distinct", () =>
  assert.notEqual(
    sourceHost({ url: "https://alice.github.io" }),
    sourceHost({ url: "https://bob.github.io" }),
  ));
test("uploads are not grouped under the app hostname", () =>
  assert.equal(sourceHost({ fileKey: "abc", url: "http://localhost/a" }), ""));
test("pasted links and notes do not require choosing a type", () =>
  assert.deepEqual(
    [
      parseBlockInput("https://are.na").kind,
      parseBlockInput("A thought about https://are.na").kind,
    ],
    ["link", "note"],
  ));
