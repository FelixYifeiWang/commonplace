// A bounded constellation, with enough air for 180 × 180 reference cards.
export function guidedPositions(count) {
  return Array.from({ length: Math.min(6, Math.max(0, count)) }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return {
      x: Math.round(Math.cos(angle) * 410),
      y: Math.round(Math.sin(angle) * 285),
    };
  });
}

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
