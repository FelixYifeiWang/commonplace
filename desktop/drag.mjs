// Window positions and native event coordinates use Electron DIPs.
export function createDragController({
  window,
  cursor,
  every = setInterval,
  stop = clearInterval,
  onMoveStart = () => {},
  polling = true,
}) {
  let drag = null;
  function move(point) {
    if (!drag) return;
    const x = Math.round(point.x - drag.offset.x),
      y = Math.round(point.y - drag.offset.y);
    if (!drag.moved && Math.hypot(x - drag.bounds.x, y - drag.bounds.y) > 6) {
      drag.moved = true;
      onMoveStart();
    }
    if (drag.moved) window.setPosition(x, y, false);
  }
  function start(input) {
    if (drag) return false;
    const bounds = window.getBounds(),
      native = cursor();
    const offset = input?.offset || {
      x: native.x - bounds.x,
      y: native.y - bounds.y,
    };
    if (
      !Number.isFinite(offset.x) ||
      !Number.isFinite(offset.y) ||
      offset.x < 0 ||
      offset.y < 0 ||
      offset.x > bounds.width ||
      offset.y > bounds.height
    )
      return false;
    drag = { offset: { ...offset }, bounds, moved: false, timer: null };
    if (polling) drag.timer = every(() => move(cursor()), 16);
    return true;
  }
  function cancel({ restore = false } = {}) {
    if (!drag) return;
    stop(drag.timer);
    if (restore) window.setBounds(drag.bounds, false);
    drag = null;
  }
  function end(point = cursor()) {
    if (!drag) return { click: false };
    if (point) move(point);
    const active = drag;
    stop(active.timer);
    drag = null;
    return active.moved ? { click: false, moved: true } : { click: true };
  }
  return {
    start,
    move,
    end,
    cancel,
    isDragging: () => !!drag,
    hasMoved: () => !!drag?.moved,
  };
}
// Reserve the control space above the face. Opening controls never resizes or moves it.
export function buddyBounds(anchor) {
  return {
    bounds: { x: anchor.x, y: anchor.y - 54, width: 104, height: 166 },
    offsetY: 54,
  };
}

// Native event coordinates are captured before renderer dispatch. Never poll the
// cursor on release: it may already have moved while the renderer was busy.
export function handleBuddyMouse(
  drag,
  mouse,
  bounds,
  onFinish,
  enabled = true,
) {
  const point = { x: mouse.globalX, y: mouse.globalY };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  if (mouse.type === "mouseDown" && mouse.button === "left") {
    if (
      !enabled ||
      mouse.x < 0 ||
      mouse.x > 104 ||
      mouse.y < 54 ||
      mouse.y > 166
    )
      return;
    drag.start({ offset: { x: point.x - bounds.x, y: point.y - bounds.y } });
  } else if (mouse.type === "mouseUp" && mouse.button === "left") {
    if (drag.isDragging()) onFinish(drag.end(point));
  } else if (mouse.type === "mouseMove" && drag.isDragging()) {
    if (mouse.modifiers && !mouse.modifiers.includes("leftButtonDown")) {
      // A release outside the window must not turn the next hover into a drag.
      drag.cancel();
      onFinish({ click: false, moved: true });
    } else drag.move(point);
  }
}
