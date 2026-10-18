export function zoomAround(view, point, factor) {
  const zoom = Math.max(0.35, Math.min(2, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    zoom,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  };
}
export function overlaps(a, b, gap = 20) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
  );
}
// Fixed, measured CSS boxes make layout deterministic across font loads. Detail
// sectors spread around their owner; collision resolution includes text bubbles.
// Distance from the center to each main idea before collisions resolve.
const RING = 330;
/**
 * @param {Array<{ weight?: string, details?: unknown[] }>} nodes
 * @param {{ details?: boolean, offsets?: Record<number, { x: number, y: number }>, pinned?: number | null }} [options]
 */
export function mapLayout(
  nodes,
  { details = false, offsets = {}, pinned = null } = {},
) {
  // The center card holds its name and "Session output"; nothing hangs below.
  const boxes = [
    { id: "center", x: 0, y: 0, width: 224, height: 150, group: -1 },
  ];
  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const offset = offsets[i] || { x: 0, y: 0 };
    const size =
      node.weight === "major" ? 190 : node.weight === "minor" ? 130 : 160;
    boxes.push({
      id: `node-${i}`,
      group: i,
      angle,
      x: Math.cos(angle) * RING + offset.x,
      y: Math.sin(angle) * RING + offset.y,
      width: 240,
      height: size + 100,
      size,
    });
  });
  if (details)
    nodes.forEach((node, i) => {
      const angle =
        -Math.PI / 2 + (2 * Math.PI * i) / Math.max(nodes.length, 1);
      const offset = offsets[i] || { x: 0, y: 0 };
      (node.details || []).forEach((detail, j) => {
        const a = angle + (j - (node.details.length - 1) / 2) * 0.36;
        boxes.push({
          id: `detail-${i}-${j}`,
          group: i,
          angle: a,
          x: Math.cos(a) * 660 + offset.x,
          y: Math.sin(a) * 660 + offset.y,
          width: 190,
          height: 190,
          size: 110,
        });
      });
    });
  // Keep owners in their sectors, resolving crowded details before rendering.
  // A pinned group (the one being dragged) stays exactly under the pointer;
  // whatever it touches steps away from it in small steps. Pushing the held
  // group itself made it fight the pointer and jitter on every move.
  const held = (box) => pinned !== null && box.group === pinned;
  for (let pass = 0; pass < 150; pass++) {
    let changed = false;
    for (let i = 1; i < boxes.length; i++)
      for (let j = 0; j < i; j++) {
        if (!overlaps(boxes[i], boxes[j])) continue;
        let mover = boxes[i],
          other = boxes[j];
        if (held(mover)) [mover, other] = [other, mover];
        if (held(mover) || mover.id === "center") continue;
        let dx = Math.cos(mover.angle),
          dy = Math.sin(mover.angle),
          step = 24;
        if (held(other)) {
          const away = Math.hypot(mover.x - other.x, mover.y - other.y);
          if (away > 0) {
            dx = (mover.x - other.x) / away;
            dy = (mover.y - other.y) / away;
          }
          step = 8;
        }
        mover.x += dx * step;
        mover.y += dy * step;
        changed = true;
      }
    if (!changed) break;
  }
  return boxes;
}

// Dragging carries pushed neighbors along: their pushed positions become
// their offsets, so the next move starts where this one ended and no box
// flips across the held one when the pointer passes its old center.
export function dragOffsets(nodes, offsets, pinned) {
  const next = { ...offsets };
  for (const box of mapLayout(nodes, { offsets, pinned }))
    if (box.id.startsWith("node-") && box.group !== pinned)
      next[box.group] = {
        x: box.x - Math.cos(box.angle) * RING,
        y: box.y - Math.sin(box.angle) * RING,
      };
  return next;
}

// Where a tile's center sits inside its box. Captions hang on the side away
// from whatever the box connects to, so edges never cross a title.
export function captionAbove(box) {
  return box.id !== "center" && Math.sin(box.angle) < -0.2;
}
export function tileCenter(box) {
  if (box.id === "center") return { x: box.x, y: box.y };
  const shift = (box.height - box.size) / 2;
  return { x: box.x, y: captionAbove(box) ? box.y + shift : box.y - shift };
}
// The point where the segment from `from` (inside `box`) toward `to` leaves
// the box, so a node's edges to its details start beyond its own caption.
export function exitPoint(box, from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  let t = 1;
  if (dx)
    t = Math.min(t, (box.x + (Math.sign(dx) * box.width) / 2 - from.x) / dx);
  if (dy)
    t = Math.min(t, (box.y + (Math.sign(dy) * box.height) / 2 - from.y) / dy);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

export function pinchAround(view, previous, point, other) {
  const before = Math.hypot(previous.x - other.x, previous.y - other.y);
  if (before < 1) return view;
  const after = Math.hypot(point.x - other.x, point.y - other.y);
  const oldMid = {
    x: (previous.x + other.x) / 2,
    y: (previous.y + other.y) / 2,
  };
  const next = zoomAround(view, oldMid, after / before);
  return {
    ...next,
    x: next.x + (point.x - previous.x) / 2,
    y: next.y + (point.y - previous.y) / 2,
  };
}
