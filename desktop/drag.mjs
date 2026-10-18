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
      mouse.y < 74 ||
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

// A single corridor spans the face and controls. Keep window geometry unchanged.
export function buddyHoverRegion(point, expanded) {
  return (
    point.x >= 0 &&
    point.x <= 104 &&
    point.y >= (expanded ? 12 : 54) &&
    point.y <= 166
  );
}
export function createHoverController({ onChange, now = Date.now }) {
  let open = false,
    leftAt = null,
    suppressed = false,
    pinned = false;
  const set = (value) => {
    if (open === value) return;
    open = value;
    onChange(value);
  };
  return {
    update(inside) {
      if (suppressed) {
        if (!inside) suppressed = false;
        return;
      }
      if (inside) {
        pinned = false;
        leftAt = null;
        set(true);
      } else if (open && !pinned) {
        leftAt ??= now();
        if (now() - leftAt >= 280) set(false);
      }
    },
    show() {
      pinned = true;
      suppressed = false;
      leftAt = null;
      set(true);
    },
    reset() {
      pinned = false;
      suppressed = true;
      leftAt = null;
      set(false);
    },
  };
}

export function buddyControlsBounds(face, count, area) {
  const width = 220,
    height = 44 + Math.min(5, Math.max(0, count)) * 36;
  const above = face.y - 40 - height;
  return {
    x: Math.round(
      Math.max(
        area.x,
        Math.min(face.x - width / 2, area.x + area.width - width),
      ),
    ),
    y: Math.round(
      above >= area.y
        ? above
        : Math.min(area.y + area.height - height, face.y + 40),
    ),
    width,
    height,
  };
}
export function insideBuddyControls(point, face, panel) {
  if (!panel) return false;
  // The rectangle includes the gap, so travelling between windows is forgiving.
  return (
    point.x >= Math.min(panel.x, face.x - 52) - 6 &&
    point.x <= Math.max(panel.x + panel.width, face.x + 52) + 6 &&
    point.y >= Math.min(panel.y, face.y - 30) - 6 &&
    point.y <= Math.max(panel.y + panel.height, face.y + 42) + 6
  );
}
