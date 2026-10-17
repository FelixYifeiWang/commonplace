// Reject almost-uniform frames (blank documents and tiny loading spinners).
export function hasVisualContent(bitmap, width, height) {
  if (!width || !height || bitmap.length < width * height * 4) return false;
  const colors = new Map();
  let count = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 12000)));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4,
        key = `${bitmap[i] >> 5},${bitmap[i + 1] >> 5},${bitmap[i + 2] >> 5}`;
      colors.set(key, (colors.get(key) || 0) + 1);
      count++;
    }
  return Math.max(...colors.values()) / count < 0.985;
}
