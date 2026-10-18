import test from "node:test";
import assert from "node:assert/strict";
import {
  readWorkspaceNavigation,
  workspaceNavigationUrl,
} from "../lib/workspace-navigation.mjs";

test("refresh restores collection, view and Dev mode", () => {
  for (const view of ["map", "story", "gallery"]) {
    const state = {
      selected: "session-123",
      screen: "collection",
      view,
      devMode: true,
    };
    const path = workspaceNavigationUrl("https://newron.app/", state);
    assert.deepEqual(
      readWorkspaceNavigation(new URL(path, "https://newron.app").href),
      state,
    );
  }
});
test("normal mode never restores the hidden grid", () => {
  assert.equal(
    readWorkspaceNavigation("https://newron.app/?collection=a&view=gallery")
      .view,
    "map",
  );
});
test("invalid view and screen use safe defaults", () => {
  assert.deepEqual(
    readWorkspaceNavigation("https://newron.app/?screen=bad&view=bad"),
    { selected: "all", screen: "collection", view: "map", devMode: false },
  );
});
test("navigation preserves unrelated parameters and supports returning home", () => {
  assert.equal(
    workspaceNavigationUrl(
      "https://newron.app/?demo=1&collection=a&view=story&dev=1#top",
      { selected: "all", screen: "collection", view: "map", devMode: false },
    ),
    "/?demo=1&collection=all#top",
  );
});
test("settings and trash can reload without losing the collection context", () => {
  for (const screen of ["settings", "trash"]) {
    const state = { selected: "a", screen, view: "story", devMode: false };
    const path = workspaceNavigationUrl("https://newron.app/", state);
    assert.deepEqual(
      readWorkspaceNavigation(new URL(path, "https://newron.app").href),
      state,
    );
  }
});
