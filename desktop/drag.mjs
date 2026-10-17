// Dragging is only movement. No target inspection, session reads, or subscription calls.
export function createDragController({
  window,
  cursor,
  every = setInterval,
  stop = clearInterval,
}) {
  let drag = null;
  function move(point) {
    if (!drag) return;
    const dx = point.x - drag.origin.x,
      dy = point.y - drag.origin.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved)
      window.setPosition(
        Math.round(drag.bounds.x + dx),
        Math.round(drag.bounds.y + dy),
        false,
      );
  }
  function start(origin = cursor()) {
    if (drag) return false;
    drag = { origin, bounds: window.getBounds(), moved: false, timer: null };
    drag.timer = every(() => move(cursor()), 16);
    return true;
  }
  function cancel() {
    if (!drag) return;
    stop(drag.timer);
    window.setBounds(drag.bounds, false);
    drag = null;
  }
  async function end() {
    if (!drag) return { click: false };
    move(cursor());
    const active = drag;
    stop(active.timer);
    drag = null;
    return active.moved ? { click: false, moved: true } : { click: true };
  }
  return { start, end, cancel, isDragging: () => !!drag };
}
export function buddyBounds(anchor, area, expanded) {
  const above = expanded && anchor.y + 166 > area.y + area.height;
  return {
    bounds: {
      x: anchor.x,
      y: anchor.y - (above ? 54 : 0),
      width: 104,
      height: expanded ? 166 : 112,
    },
    offsetY: above ? 54 : 0,
  };
}
