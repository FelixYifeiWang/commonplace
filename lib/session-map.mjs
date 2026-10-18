// Layout for the Gallery's session map (do's Session Map; see STORY_CANVAS.md, "Gallery").
// Works on measured boxes, so it is tested without a browser. A widget is { w, h, cy } where cy is the
// vertical centre of its tile or picture inside the box; tiles, bubbles and the core are fixed, details move.

// Tiles sit at even angles on an ellipse; each bubble sits on the outer side of its tile; details fan out
// beyond the tile inside its own sector. A collision pass then separates anything that touches.
export function placeMap(widgets, count) {
  const W = Object.fromEntries(
    Object.entries(widgets).map(([k, w]) => [k, { ...w }]),
  );
  const start = count === 6 ? -60 : -90;
  if (W.core) Object.assign(W.core, { x: 0, y: 0 });
  for (let i = 0; i < count; i++) {
    const a = ((start + (360 / count) * i) * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    const m = W["m" + i],
      reach = 190 + Math.max(m.w, m.h) * 0.45;
    m.x = c * reach * 1.25;
    m.y = s * reach;
    const side = c > 0.3 ? 1 : c < -0.3 ? -1 : 0,
      b = W["b" + i];
    if (b) {
      b.x = side ? m.x + side * (m.w / 2 + 30 + b.w / 2) : m.x + 60;
      b.y = side
        ? m.y + s * 40
        : m.y + (m.h / 2 + b.h / 2 + 24) * Math.sign(s || 1);
    }
    const dets = Object.keys(W)
      .filter((k) => W[k].det && W[k].node === i)
      .map((k) => W[k]);
    dets.forEach((d, j) => {
      const aa = a + (j - (dets.length - 1) / 2) * 0.6,
        r = 150 + Math.max(m.w, m.h) / 2 + d.h / 3;
      d.x = m.x + Math.cos(aa) * r;
      d.y = m.y + Math.sin(aa) * r * 0.85;
      Object.assign(d, { ux: c, uy: s, vx: -s, vy: c });
    });
  }
  relax(Object.values(W));
  return W;
}
const box = (w) => ({
  l: w.x - w.w / 2,
  r: w.x + w.w / 2,
  t: w.y - w.cy,
  b: w.y - w.cy + w.h,
});
function relax(all) {
  const gap = 14;
  for (let it = 0; it < 400; it++) {
    let pushed = false;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i],
          B = all[j];
        // Hidden items (bubbles on phones) take no space; fixed pairs never move each other.
        if ((A.fixed && B.fixed) || !A.w || !B.w) continue;
        const a = box(A),
          b = box(B),
          ox = Math.min(a.r, b.r) - Math.max(a.l, b.l) + gap,
          oy = Math.min(a.b, b.b) - Math.max(a.t, b.t) + gap;
        if (ox <= 0 || oy <= 0) continue;
        pushed = true;
        const m = Math.min(ox, oy) / 2 + 1;
        if (A.det && B.det && A.node === B.node) {
          // Siblings slide apart sideways, so they stay beside each other.
          const dv = (B.x - A.x) * A.vx + (B.y - A.y) * A.vy,
            sg = Math.sign(dv) || 1;
          A.x -= A.vx * m * sg;
          A.y -= A.vy * m * sg;
          B.x += B.vx * m * sg;
          B.y += B.vy * m * sg;
        } else
          for (const N of [A, B])
            if (!N.fixed) {
              const k = A.fixed || B.fixed ? 2 : 1;
              N.x += N.ux * m * k;
              N.y += N.uy * m * k;
            }
      }
    if (!pushed) break;
  }
  // Bubbles of neighbouring tiles must not touch either: nudge the lower one down.
  for (let it = 0; it < 40; it++) {
    let pushed = false;
    const fixed = all.filter((w) => w.fixed && w.w);
    for (let i = 0; i < fixed.length; i++)
      for (let j = i + 1; j < fixed.length; j++) {
        const A = fixed[i],
          B = fixed[j];
        if (!(A.bubble || B.bubble)) continue;
        const a = box(A),
          b = box(B),
          ox = Math.min(a.r, b.r) - Math.max(a.l, b.l) + 12,
          oy = Math.min(a.b, b.b) - Math.max(a.t, b.t) + 12;
        if (ox <= 0 || oy <= 0) continue;
        pushed = true;
        const mover = A.bubble ? A : B,
          other = mover === A ? B : A;
        mover.y += (mover.y >= other.y ? 1 : -1) * oy;
      }
    if (!pushed) break;
  }
}
// Every line leaves the centre of its widget and bends the same way into the target (do's radial curve).
export function radialPath(p, q) {
  const dx = q.x - p.x,
    dy = q.y - p.y,
    d = Math.hypot(dx, dy) || 1,
    ux = dx / d,
    uy = dy / d,
    nx = -uy,
    ny = ux;
  const r = (v) => Math.round(v * 100) / 100;
  return `M${r(p.x)} ${r(p.y)}C${r(p.x + ux * d * 0.4)} ${r(p.y + uy * d * 0.4)} ${r(q.x - ux * d * 0.3 + nx * d * 0.2)} ${r(q.y - uy * d * 0.3 + ny * d * 0.2)} ${r(q.x)} ${r(q.y)}`;
}
// Zoom relative to the fitted view: 0 overview, 1 details pop out, 2 the human's own words appear.
export function zoomLevel(relative) {
  return relative < 1.45 ? 0 : relative < 2.4 ? 1 : 2;
}
