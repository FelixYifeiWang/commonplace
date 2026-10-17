export function sourceHost(item) {
  if (item.fileKey || !item.url) return "";
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function mediaFamily(kind) {
  if (["note", "quote", "idea"].includes(kind)) return "text";
  if (["document", "file"].includes(kind)) return "file";
  return kind;
}
export function filterItems(
  items,
  { query = "", type = "all", site = "all" } = {},
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(
    (item) =>
      (type === "all" || mediaFamily(item.kind) === type) &&
      (site === "all" || sourceHost(item) === site) &&
      words.every((word) =>
        [item.title, item.body, item.url, item.groupName]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
}
export function groupItems(items, grouped = true) {
  const groups = new Map();
  for (const item of items) {
    const topic = item.groupName?.trim(),
      host = sourceHost(item);
    const key = grouped
      ? topic
        ? `topic:${topic.toLocaleLowerCase()}`
        : host
          ? `site:${host}`
          : `item:${item.id}`
      : `item:${item.id}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        title: topic || host || item.title,
        topic: !!topic,
        items: [],
      });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
export function parseBlockInput(value) {
  const content = value.trim();
  if (!content) throw new Error("Add a link, text, or file.");
  let url;
  try {
    const candidate = new URL(content);
    if (["https:", "http:"].includes(candidate.protocol) && !/\s/.test(content))
      url = candidate.href;
  } catch {
    /* Text block. */
  }
  return url
    ? {
        url,
        title: new URL(url).hostname.replace(/^www\./, ""),
        body: "",
        kind: "link",
      }
    : {
        url: null,
        title: content.split("\n")[0].slice(0, 240),
        body: content,
        kind: "note",
      };
}
