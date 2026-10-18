// A 140ms time constant keeps pointer tracking consistent across refresh rates.
export function followGaze(current, target, seconds) {
  return (
    current + (target - current) * (1 - Math.exp(-Math.max(0, seconds) / 0.14))
  );
}

// Radial saturation keeps the direction true even at the far corners of a display.
export function pointerDirection(dx, dy) {
  const distance = Math.hypot(240, dx, dy);
  return { x: (2 * dx) / distance, y: (2 * dy) / distance };
}

// Balance the ink in a fully connected neuron, rather than its empty bounding box.
// Projected edge lengths weight the midpoint of each stroke. This stays continuous
// as the model turns, including when two projected corners overlap.
export function strokeCenter(points) {
  let x = 0,
    y = 0,
    weight = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i],
        b = points[j];
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      x += (a.x + b.x) * 0.5 * length;
      y += (a.y + b.y) * 0.5 * length;
      weight += length;
    }
  }
  return weight
    ? { x: x / weight, y: y / weight }
    : { x: points[0]?.x || 0, y: points[0]?.y || 0 };
}
