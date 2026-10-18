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

// Center the visible projected silhouette, rather than the 3D model's origin.
export function silhouetteCenter(points) {
  return {
    x:
      (Math.min(...points.map((p) => p.x)) +
        Math.max(...points.map((p) => p.x))) /
      2,
    y:
      (Math.min(...points.map((p) => p.y)) +
        Math.max(...points.map((p) => p.y))) /
      2,
  };
}
