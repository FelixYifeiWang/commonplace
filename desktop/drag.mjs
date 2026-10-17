// This controller owns a user-initiated drag only. It never clicks or types into the target app.
export function createDragController({
  window,
  cursor,
  inspect,
  // Only enable providers whose session resolver is implemented.
  canConnect = (target) => target?.bundleId === "com.openai.codex",
  resolve,
  subscribe,
  capture = async () => {},
  report,
  every = setInterval,
  stop = clearInterval,
}) {
  let drag = null,
    finishing = false;
  function start() {
    if (drag || finishing) return false;
    const origin = cursor(),
      bounds = window.getBounds();
    drag = { origin, bounds, moved: false, timer: null };
    drag.timer = every(() => {
      if (!drag) return;
      const point = cursor();
      if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > 6)
        drag.moved = true;
      if (drag.moved)
        window.setPosition(
          Math.round(drag.bounds.x + point.x - drag.origin.x),
          Math.round(drag.bounds.y + point.y - drag.origin.y),
          false,
        );
    }, 16);
    return true;
  }
  function cancel() {
    if (!drag) return;
    stop(drag.timer);
    window.setBounds(drag.bounds, false);
    drag = null;
  }
  async function end() {
    if (!drag || finishing) return { click: false };
    const active = drag,
      point = cursor();
    stop(active.timer);
    drag = null;
    const moved =
      active.moved ||
      Math.hypot(point.x - active.origin.x, point.y - active.origin.y) > 6;
    if (!moved) return { click: true };
    // A quick drag can end between timer ticks. Always apply the final position.
    window.setPosition(
      Math.round(active.bounds.x + point.x - active.origin.x),
      Math.round(active.bounds.y + point.y - active.origin.y),
      false,
    );
    finishing = true;
    let repositionOnly = false;
    try {
      // Native hit-testing excludes our own windows; the buddy stays visible.
      const target = await inspect(point);
      if (
        target.error === "no-target" ||
        (!target.error && !canConnect(target))
      ) {
        repositionOnly = true;
        return { click: false, moved: true };
      }
      if (target.error)
        throw Object.assign(
          new Error(target.message || "Could not identify this session."),
          { code: target.error },
        );
      report({ state: "reading", error: "", target: "" });
      const session = await resolve(target);
      report({ state: "connecting", target: session.title, point });
      const subscription = await subscribe(session);
      report({ state: "collecting", target: session.title });
      await capture(session, subscription);
      report({ state: "following", target: session.title, error: "" });
      return { click: false, connected: true };
    } catch (error) {
      report({
        state: "error",
        error: error.message,
      });
      return { click: false, connected: false };
    } finally {
      if (!repositionOnly) window.setBounds(active.bounds, false);
      finishing = false;
    }
  }
  return { start, end, cancel, isDragging: () => !!drag || finishing };
}
