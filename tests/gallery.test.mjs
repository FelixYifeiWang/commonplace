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
test("session-pasted images share one stack while websites and manual uploads stay separate", () => {
  const images = [
    {
      id: "a",
      kind: "image",
      fileKey: "a.png",
      sessionId: "s",
      title: "Pasted image",
    },
    {
      id: "b",
      kind: "image",
      fileKey: "b.png",
      sessionId: "s",
      title: "Sketch",
      groupName: "Layout",
    },
    {
      id: "c",
      kind: "link",
      fileKey: "page.png",
      sessionId: "s",
      url: "https://example.com",
    },
    {
      id: "d",
      kind: "image",
      fileKey: "upload.png",
      sessionId: null,
      title: "Upload",
    },
    {
      id: "e",
      kind: "image",
      sessionId: "s",
      url: "https://images.example.com/image.png",
    },
  ];
  const groups = groupItems(images);
  assert.deepEqual(
    groups.map((g) => g.items.map((i) => i.id)),
    [["a", "b"], ["c"], ["d"], ["e"]],
  );
  assert.equal(groups[0].title, "Pasted images");
});
test("selection mode keeps pasted images individually selectable", () => {
  const images = ["a", "b"].map((id) => ({
    id,
    kind: "image",
    fileKey: `${id}.png`,
    sessionId: "s",
  }));
  assert.deepEqual(
    groupItems(images, false).map((g) => g.items.map((i) => i.id)),
    [["a"], ["b"]],
  );
});
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

import { stackRows } from "../lib/gallery.mjs";
test("wrapped outlines follow only occupied cells without moving the cover", () => {
  assert.deepEqual(
    stackRows(
      [
        { left: 200, top: 0, right: 300, bottom: 130 },
        { left: 310, top: 0, right: 410, bottom: 130 },
        { left: 0, top: 150, right: 100, bottom: 280 },
      ],
      8,
    ),
    [
      { left: 192, top: -8, width: 226, height: 146 },
      { left: -8, top: 142, width: 116, height: 146 },
    ],
  );
});

import { curateGalleryItems } from "../lib/gallery.mjs";
test("gallery collapses tracking and anchor variants but keeps distinct pages and meaningful queries", () => {
  const urls = [
    "https://www.example.com/design/?utm_source=mail#top",
    "https://example.com/design",
    "https://example.com/design?version=2",
    "https://example.com/other",
  ];
  assert.equal(
    curateGalleryItems(
      urls.map((url, i) => ({ id: String(i), url, sessionId: "s" })),
    ).length,
    3,
  );
});
test("gallery hides workflow navigation but keeps documentation, public products and manually saved sources", () => {
  const urls = [
    "https://vercel.com/team/~/integrations/accept-terms/test",
    "https://console.cloud.google.com/auth/branding",
    "https://github.com/me/project/commit/abcd",
    "https://newron.app/?collection=x&view=gallery",
    "https://newron.app/setup.md",
    "https://openai.com/research",
    "https://developers.google.com/identity",
    "https://github.com/Allenz5/dave",
  ];
  const items = urls.map((url, i) => ({ id: String(i), url, sessionId: "s" }));
  assert.deepEqual(
    curateGalleryItems(items).map((i) => i.id),
    ["5", "6", "7"],
  );
  assert.equal(
    curateGalleryItems([{ ...items[2], sessionId: null }]).length,
    1,
  );
});
test("duplicate gallery entries choose a visual representative without mutating stored items", () => {
  const items = [
    { id: "a", url: "https://example.com" },
    {
      id: "b",
      url: "https://example.com/",
      imageUrl: "https://example.com/cover.png",
    },
  ];
  assert.equal(curateGalleryItems(items)[0].id, "b");
  assert.equal(items.length, 2);
});

import { galleryDeletionIds } from "../lib/gallery.mjs";
test("deleting a consolidated tile includes its duplicates but not another page", () => {
  const items = [
    { id: "a", url: "https://example.com/page" },
    { id: "b", url: "https://www.example.com/page#section" },
    { id: "c", url: "https://example.com/other" },
  ];
  assert.deepEqual(galleryDeletionIds(items, ["a"]), ["a", "b"]);
});

test("a stack uses an available picture instead of a text-only cover", () => {
  const items = [
    { id: "a", url: "https://example.com/a" },
    {
      id: "b",
      url: "https://example.com/b",
      imageUrl: "https://example.com/cover.png",
    },
  ];
  assert.equal(groupItems(items)[0].items[0].id, "b");
  assert.equal(items[0].id, "a");
});

test("hash routes keep distinct documents while demo variants share a cover", () => {
  const urls = [
    "https://example.com/#/one",
    "https://example.com/#/two",
    "https://example.com/?demo=1",
    "https://example.com/",
  ];
  assert.equal(
    curateGalleryItems(urls.map((url, i) => ({ id: String(i), url }))).length,
    3,
  );
});
