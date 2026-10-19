// Newron's mark is Nox at rest: an N of four liquid drops. The stem and the diagonal are bonded; the top right drop
// sits a little apart, about to join. This file traces that resting shape into a vector outline, so the favicon, the
// header mark and the desktop icons all match what Nox draws (lib/nox-mark.ts uses the same shape as a shader).

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// A polynomial smooth union: shapes closer than k melt into each other.
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
// A straight stroke between two points.
const bond = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax,
    py = y - ay,
    dx = bx - ax,
    dy = by - ay;
  const h = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - dx * h, py - dy * h) - r;
};

// The resting N's drops, in mark units (the mark spans about -0.63 to 0.68 on each axis, y up).
export const DROPS = {
  bl: [-0.42, -0.42],
  tl: [-0.42, 0.42],
  br: [0.42, -0.42],
  tr: [0.45, 0.47],
};

// Signed distance to the resting N: negative inside. This is the moment of rest where the top right drop is
// furthest apart, the frame Nox also shows when motion is reduced.
export function restingN(x, y) {
  const { bl, tl, br, tr } = DROPS;
  const r = 0.21;
  let d = circle(x, y, ...bl, r);
  d = smin(d, circle(x, y, ...tl, r), 0.06);
  d = smin(d, bond(x, y, ...bl, ...tl, 0.08), 0.12);
  d = smin(d, bond(x, y, ...tl, ...br, 0.08), 0.12);
  d = smin(d, circle(x, y, ...br, r), 0.06);
  return smin(d, circle(x, y, ...tr, r), 0.06);
}

// Marching squares over the distance field: closed loops of points along its zero line.
export function traceOutline(
  field = restingN,
  { span = 0.9, cells = 480 } = {},
) {
  const n = cells,
    step = (2 * span) / n;
  const at = (i, j) => field(-span + i * step, -span + j * step);
  const values = [];
  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) row.push(at(i, j));
    values.push(row);
  }
  // Each crossing is keyed by its cell edge, so segments that share a point join exactly.
  const point = (i0, j0, i1, j1) => {
    const a = values[j0][i0],
      b = values[j1][i1],
      t = a / (a - b);
    return [
      -span + (i0 + (i1 - i0) * t) * step,
      -span + (j0 + (j1 - j0) * t) * step,
    ];
  };
  const key = (i0, j0, i1, j1) =>
    i0 < i1 || j0 < j1 ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`;
  const next = new Map(),
    coords = new Map();
  const link = (a, b) => {
    const ka = key(...a),
      kb = key(...b);
    coords.set(ka, point(...a));
    coords.set(kb, point(...b));
    next.set(ka, kb);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const bottom = [i, j, i + 1, j],
        right = [i + 1, j, i + 1, j + 1],
        top = [i, j + 1, i + 1, j + 1],
        left = [i, j, i, j + 1];
      const c =
        (values[j][i] < 0 ? 1 : 0) |
        (values[j][i + 1] < 0 ? 2 : 0) |
        (values[j + 1][i + 1] < 0 ? 4 : 0) |
        (values[j + 1][i] < 0 ? 8 : 0);
      // Segments run with the inside on their left, so every loop winds counter-clockwise (y up).
      const cases = {
        1: [[left, bottom]],
        2: [[bottom, right]],
        3: [[left, right]],
        4: [[right, top]],
        5: [
          [left, top],
          [right, bottom],
        ],
        6: [[bottom, top]],
        7: [[left, top]],
        8: [[top, left]],
        9: [[top, bottom]],
        10: [
          [top, right],
          [bottom, left],
        ],
        11: [[top, right]],
        12: [[right, left]],
        13: [[right, bottom]],
        14: [[bottom, left]],
      };
      for (const [a, b] of cases[c] || []) link(b, a);
    }
  }
  const loops = [],
    seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let k = start;
    while (k && !seen.has(k)) {
      seen.add(k);
      loop.push(coords.get(k));
      k = next.get(k);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

// Drops points that sit within tolerance of the line between their neighbours (Ramer–Douglas–Peucker).
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0],
    [bx, by] = points[points.length - 1];
  let worst = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

// The outline as an SVG path in a square box: smooth cubic curves through the traced points, centred by the
// shape's bounds and scaled so its larger side is `extent` units. Only M, C and Z appear, so other tools can read it.
export function markPath({ box = 80, extent = 40, tolerance = 0.0012 } = {}) {
  // A closed loop starts and ends on the same point, so it is simplified as two halves split at its far side.
  const loops = traceOutline().map((loop) => {
    let far = 0;
    loop.forEach(([x, y], i) => {
      if (
        Math.hypot(x - loop[0][0], y - loop[0][1]) >
        Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])
      )
        far = i;
    });
    const first = simplify(loop.slice(0, far + 1), tolerance);
    const second = simplify([...loop.slice(far), loop[0]], tolerance);
    return [...first.slice(0, -1), ...second.slice(0, -1)];
  });
  const all = loops.flat();
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = extent / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const fix = (v) => Number(v.toFixed(2));
  const place = ([x, y]) => [
    fix(box / 2 + (x - cx) * scale),
    fix(box / 2 - (y - cy) * scale),
  ];
  return loops
    .map((loop) => {
      const pts = loop.map(place);
      const n = pts.length;
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      // Catmull-Rom through each point, written as cubic Béziers.
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n],
          p1 = pts[i],
          p2 = pts[(i + 1) % n],
          p3 = pts[(i + 2) % n];
        const c1 = [
          fix(p1[0] + (p2[0] - p0[0]) / 6),
          fix(p1[1] + (p2[1] - p0[1]) / 6),
        ];
        const c2 = [
          fix(p2[0] - (p3[0] - p1[0]) / 6),
          fix(p2[1] - (p3[1] - p1[1]) / 6),
        ];
        d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
      }
      return d + " Z";
    })
    .join(" ");
}

export const INK = "#161616";

// Nox's bubble with the mark: the header mark, the favicon and the source for the app and menu-bar icons.
export function noxSvg(path = markPath()) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="37" fill="#fff" stroke="#e6e6e9"/><path fill="${INK}" d="${path}"/></svg>\n`;
}
