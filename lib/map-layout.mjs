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
export function mapLayout(nodes, { details = false, offsets = {} } = {}) {
  // The center's 114px box plus its name and "Session output" underneath.
  const boxes = [
    { id: "center", x: 0, y: 0, width: 224, height: 200, group: -1 },
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
      x: Math.cos(angle) * 330 + offset.x,
      y: Math.sin(angle) * 330 + offset.y,
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
  for (let pass = 0; pass < 150; pass++) {
    let changed = false;
    for (let i = 1; i < boxes.length; i++) {
      const b = boxes[i];
      for (let j = 0; j < i; j++)
        if (overlaps(b, boxes[j])) {
          const a = b.angle;
          b.x += Math.cos(a) * 24;
          b.y += Math.sin(a) * 24;
          changed = true;
        }
    }
    if (!changed) break;
  }
  return boxes;
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
