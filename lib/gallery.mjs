import { LEGACY_ORIGIN, PRODUCTION_ORIGIN } from "./brand.mjs";
import { isReferenceItem } from "./source-policy.mjs";
// A link keeps its address even when it carries a captured page as its file.
const fileOnly = (item) => !!item.fileKey && item.kind !== "link";
export function sourceHost(item) {
  if (fileOnly(item) || !item.url) return "";
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
    // Session attachments have stored image bytes and no external source URL.
    // Keep these together even if an individual image has been named or grouped.
    const pasted =
      item.kind === "image" &&
      !!item.fileKey &&
      (!!item.sessionId || item.sessionAttachment === true) &&
      !item.url;
    const topic = item.groupName?.trim(),
      host = sourceHost(item);
    const key = grouped
      ? pasted
        ? "media:pasted-images"
        : topic
          ? `topic:${topic.toLocaleLowerCase()}`
          : host
            ? `site:${host}`
            : `item:${item.id}`
      : `item:${item.id}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        title:
          grouped && pasted ? "Pasted images" : topic || host || item.title,
        topic: !pasted && !!topic,
        items: [],
      });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map((group) => {
    const cover = group.items.findIndex(
      (item) =>
        item.imageUrl ||
        (item.fileKey && ["image", "link"].includes(item.kind)),
    );
    return cover > 0
      ? {
          ...group,
          items: [
            group.items[cover],
            ...group.items.filter((_, i) => i !== cover),
          ],
        }
      : group;
  });
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

// A wrapped stack gets one quiet outline per occupied row, never around unrelated tiles.
export function stackRows(rects, padding = 10) {
  const rows = [];
  for (const rect of rects) {
    let row = rows.find((r) => Math.abs(r.top - rect.top) < 2);
    if (!row) {
      row = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      rows.push(row);
    } else {
      row.left = Math.min(row.left, rect.left);
      row.right = Math.max(row.right, rect.right);
      row.bottom = Math.max(row.bottom, rect.bottom);
    }
  }
  return rows.map((r) => ({
    left: r.left - padding,
    top: r.top - padding,
    width: r.right - r.left + padding * 2,
    height: r.bottom - r.top + padding * 2,
  }));
}

// Display-only curation: original blocks remain available to Story, Map and Trash.
export function galleryUrlKey(value) {
  try {
    const url = new URL(value);
    if (url.origin === LEGACY_ORIGIN)
      url.hostname = new URL(PRODUCTION_ORIGIN).hostname;
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "");
    if (!/^#!?\//.test(url.hash)) url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (url.pathname === "/") url.searchParams.delete("demo");
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i.test(key))
        url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return value;
  }
}
export function isGallerySource(item) {
  if (!isReferenceItem(item)) return false;
  if (!item.sessionId || !item.url) return true; // Manual saves are intentional.
  const url = new URL(item.url),
    host = url.hostname.replace(/^www\./, ""),
    path = url.pathname;
  if (
    [
      "console.cloud.google.com",
      "console.aws.amazon.com",
      "dashboard.stripe.com",
    ].includes(host)
  )
    return false;
  if (
    host === "vercel.com" &&
    (/\/~\//.test(path) ||
      /^\/[^/]+\/[^/]+\/(settings|deployments|logs|analytics)(\/|$)/.test(path))
  )
    return false;
  if (
    host === "github.com" &&
    /^\/[^/]+\/[^/]+\/(commit|commits|pull|pulls|actions|settings|compare)(\/|$)/.test(
      path,
    )
  )
    return false;
  if (
    ["newron.app", "commonplace-pearl.vercel.app"].includes(host) &&
    (path !== "/" ||
      ["collection", "dev", "view"].some((k) => url.searchParams.has(k)))
  )
    return false;
  if (/\/(request-client-id|accept-terms)(\/|$)/.test(path)) return false;
  return true;
}
export function curateGalleryItems(items) {
  const unique = new Map();
  for (const item of items) {
    if (!isGallerySource(item)) continue;
    const key =
      (fileOnly(item) && item.fileKey) ||
      (item.url ? galleryUrlKey(item.url) : `item:${item.id}`);
    const previous = unique.get(key);
    const pictured = (i) => !!i.imageUrl || (i.kind === "link" && !!i.fileKey);
    if (!previous || (!pictured(previous) && pictured(item)))
      unique.set(key, item);
  }
  return [...unique.values()];
}

// Deleting a consolidated tile also trashes its duplicates, so it cannot reappear on refresh.
export function galleryDeletionIds(items, selected) {
  const keys = new Set(
    items
      .filter((item) => selected.includes(item.id))
      .map((item) =>
        item.url ? galleryUrlKey(item.url) : item.fileKey || `item:${item.id}`,
      ),
  );
  return items
    .filter((item) =>
      keys.has(
        item.url ? galleryUrlKey(item.url) : item.fileKey || `item:${item.id}`,
      ),
    )
    .map((item) => item.id);
}
