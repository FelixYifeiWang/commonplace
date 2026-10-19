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

// How far Nox's mark is into working (0 at rest, 1 working) moves on a critically damped spring: it eases in and
// out, never overshoots from rest, and stays smooth when the state flips back halfway. Small substeps keep long
// frames stable. Returns [value, velocity].
export function springStep(value, velocity, target, seconds, stiffness = 5.5) {
  const steps = Math.max(1, Math.ceil(seconds / 0.01));
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) {
    velocity +=
      (stiffness * stiffness * (target - value) - 2 * stiffness * velocity) *
      dt;
    value += velocity * dt;
  }
  return [value, velocity];
}

const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
// Just after work ends, the two right-hand drops let go of each other quickly: the release is on within a fifth
// of a second, held, then handed back to the slow resting rhythm by about four seconds.
export function releaseAfter(seconds) {
  if (seconds < 0) return 0;
  return ease(0, 0.2, seconds) * (1 - ease(1.6, 3.8, seconds));
}
