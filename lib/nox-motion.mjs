// A 140ms time constant keeps pointer tracking consistent across refresh rates.
export function followGaze(current, target, seconds) {
  return (
    current + (target - current) * (1 - Math.exp(-Math.max(0, seconds) / 0.14))
  );
}
