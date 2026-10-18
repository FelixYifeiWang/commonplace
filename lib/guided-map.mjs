// Camera uses actual-size content when possible. Reserve the bottom for navigation.
export function guidedCamera(bounds, viewport) {
  const availableWidth = Math.max(1, viewport.width - 40);
  const availableHeight = Math.max(1, viewport.height - 104);
  const scale = Math.min(
    1,
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
  );
  return {
    scale,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: 20 + availableHeight / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

// Include every measured source and evidence box, not just the main picture.
export function guidedBounds(widgets) {
  const visible = widgets.filter((w) => w.w > 0 && w.h > 0);
  if (!visible.length) return { x: -1, y: -1, width: 2, height: 2 };
  const left = Math.min(...visible.map((w) => w.x + (w.ox || 0) - w.w / 2));
  const top = Math.min(...visible.map((w) => w.y + (w.oy || 0) - w.cy));
  const right = Math.max(...visible.map((w) => w.x + (w.ox || 0) + w.w / 2));
  const bottom = Math.max(
    ...visible.map((w) => w.y + (w.oy || 0) - w.cy + w.h),
  );
  return {
    x: left - 24,
    y: top - 24,
    width: right - left + 48,
    height: bottom - top + 48,
  };
}
