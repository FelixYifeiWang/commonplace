// Which part of an artifact is its picture (STORY_CANVAS.md, "Artifact pictures"). Nox frames the work the page
// shows (its images, canvases and demo panels) instead of the title and intro at the top. Boxes are in page
// pixels: media (img, svg, canvas, video), backdrop (a background image or gradient) or panel (a framed card).
const WEIGHT = { media: 1, backdrop: 0.7, panel: 0.4 };
const PAD = 24; // room around the work
const GAP = 48; // pictures this close read as one group, like a before and after
const MIN_WIDTH = 480;
const CELL = 16;

export function pickRegion({ view, page, boxes }) {
  const maxW = Math.min(view.width, page.width);
  const maxH = view.height;
  // A page that fits one screen was designed as one composition.
  if (page.height <= maxH) return null;
  const usable = boxes
    .filter((b) => isVisual(b, maxW, maxH))
    .map((b) => ({
      ...b,
      width: Math.min(b.width, maxW),
      height: Math.min(b.height, maxH),
    }))
    .sort((a, b) => weighted(b) - weighted(a))
    .slice(0, 200);
  let best = null;
  const seen = new Set();
  for (const seed of usable) {
    const { box, members } = grow(seed, usable, maxW, maxH);
    const key = `${box.x},${box.y},${box.width},${box.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const area = coverage(box, members);
    // Earlier work is what the page leads with.
    const value = area / (1 + box.y / (2 * maxH));
    if (!best || value > best.value) best = { box, value, area };
  }
  // Too little to show: the page top says more.
  if (!best || best.area < 0.05 * maxW * maxH) return null;
  return frame(best.box, { maxW, maxH, pageH: page.height });
}

function isVisual(b, maxW, maxH) {
  if (!WEIGHT[b.kind] || b.width < 120 || b.height < 90) return false;
  // A rule, strip or column of text, not a picture.
  if (b.width / b.height > 6 || b.height / b.width > 4) return false;
  if (b.kind === "media") return true;
  // A section that fills the screen is the page's layout.
  return (
    b.width <= maxW &&
    b.height <= maxH &&
    !(b.width >= 0.9 * maxW && b.height >= 0.6 * maxH)
  );
}

const weighted = (b) => WEIGHT[b.kind] * b.width * b.height;

function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function gap(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.max(dx, dy);
}

// The seed and every visual near it, while the group still fits one screen.
function grow(seed, boxes, maxW, maxH) {
  let box = { x: seed.x, y: seed.y, width: seed.width, height: seed.height };
  const members = [seed];
  for (let added = true; added;) {
    added = false;
    for (const b of boxes) {
      if (members.includes(b) || gap(box, b) > GAP) continue;
      const next = union(box, b);
      if (next.width + 2 * PAD > maxW || next.height + 2 * PAD > maxH) continue;
      box = next;
      members.push(b);
      added = true;
    }
  }
  return { box, members };
}

// How much of the group is picture, counting each spot once at its strongest kind.
function coverage(box, members) {
  let total = 0;
  for (let y = box.y + CELL / 2; y < box.y + box.height; y += CELL)
    for (let x = box.x + CELL / 2; x < box.x + box.width; x += CELL) {
      let w = 0;
      for (const m of members)
        if (
          x >= m.x &&
          x < m.x + m.width &&
          y >= m.y &&
          y < m.y + m.height &&
          WEIGHT[m.kind] > w
        )
          w = WEIGHT[m.kind];
      total += w;
    }
  return total * CELL * CELL;
}

// A little room around the work, at least a card's width, between 4:3 and 16:9, on the page and in one screen.
function frame(box, { maxW, maxH, pageH }) {
  let { x, y, width: w, height: h } = box;
  const padX = Math.max(0, Math.min(PAD, (maxW - w) / 2));
  const padY = Math.max(0, Math.min(PAD, (maxH - h) / 2));
  x -= padX;
  y -= padY;
  w += 2 * padX;
  h += 2 * padY;
  const widen = (to) => {
    const next = Math.min(to, maxW);
    x -= (next - w) / 2;
    w = next;
  };
  const heighten = (to) => {
    const next = Math.min(to, maxH, pageH);
    y -= (next - h) / 2;
    h = next;
  };
  if (w < MIN_WIDTH) widen(MIN_WIDTH);
  if (w / h < 4 / 3) widen((h * 4) / 3);
  // Still too tall for a card: keep its top.
  if (w / h < 4 / 3) h = (w * 3) / 4;
  if (w / h > 16 / 9) heighten((w * 9) / 16);
  x = Math.min(Math.max(0, x), maxW - w);
  y = Math.min(Math.max(0, y), pageH - h);
  return {
    x: Math.round(x),
    y: Math.round(Math.max(0, y)),
    width: Math.round(w),
    height: Math.round(Math.min(h, pageH)),
  };
}

// Runs inside the artifact's page (serialized, so it uses nothing from this module): every box that could be
// its picture, in page pixels. Navigation and anything pinned to the screen are left out.
export function visualBoxes() {
  const pinned = new Map();
  const isPinned = (el) => {
    if (!el || el === document.body) return false;
    if (pinned.has(el)) return pinned.get(el);
    const { position } = getComputedStyle(el);
    const value =
      position === "fixed" ||
      position === "sticky" ||
      isPinned(el.parentElement);
    pinned.set(el, value);
    return value;
  };
  const clear = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
  const ground = getComputedStyle(document.body).backgroundColor;
  const skip = new Set(
    "script style noscript template button input select textarea option iframe".split(
      " ",
    ),
  );
  const paint = (s, pseudo) => {
    if (pseudo && (s.content === "none" || s.content === "normal")) return null;
    if (s.backgroundImage !== "none") return "backdrop";
    const filled = !clear(s.backgroundColor) && s.backgroundColor !== ground;
    const rounded = parseFloat(s.borderTopLeftRadius) > 0;
    const bordered =
      parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
    const shadow = s.boxShadow !== "none";
    return (filled && (rounded || bordered)) || shadow || (bordered && rounded)
      ? "panel"
      : null;
  };
  const boxes = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (boxes.length >= 600) break;
    const tag = el.localName;
    if (skip.has(tag)) continue;
    if (el instanceof SVGElement && (tag !== "svg" || el.ownerSVGElement))
      continue;
    if (tag === "img" && !el.naturalWidth) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 90) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || el.closest("nav") || isPinned(el))
      continue;
    // A card is often painted by a pseudo-element, like the Story's own sheet.
    const kind = ["img", "video", "canvas", "svg"].includes(tag)
      ? "media"
      : paint(s) ||
        paint(getComputedStyle(el, "::before"), true) ||
        paint(getComputedStyle(el, "::after"), true) ||
        (tag === "figure" ? "panel" : null);
    if (kind)
      boxes.push({
        kind,
        x: r.left + scrollX,
        y: r.top + scrollY,
        width: r.width,
        height: r.height,
      });
  }
  return {
    view: { width: innerWidth, height: innerHeight },
    page: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
    boxes,
  };
}
