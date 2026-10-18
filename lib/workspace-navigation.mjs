export function readWorkspaceNavigation(href, demo = false) {
  const params = new URL(href).searchParams;
  const devMode = params.get("dev") === "1";
  const requestedView = params.get("view");
  return {
    selected: params.get("collection") || (demo ? "c1" : "all"),
    screen: ["settings", "trash"].includes(params.get("screen"))
      ? params.get("screen")
      : "collection",
    view:
      requestedView === "story"
        ? "story"
        : requestedView === "gallery" && devMode
          ? "gallery"
          : "map",
    devMode,
  };
}

export function workspaceNavigationUrl(href, state) {
  const url = new URL(href);
  const values = {
    collection:
      state.selected === "all" && url.searchParams.get("demo") !== "1"
        ? null
        : state.selected,
    screen: state.screen === "collection" ? null : state.screen,
    view: state.view === "map" ? null : state.view,
    dev: state.devMode ? "1" : null,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url.pathname + url.search + url.hash;
}
