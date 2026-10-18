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
