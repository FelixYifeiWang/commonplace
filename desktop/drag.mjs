// This controller owns a user-initiated drag only. It never clicks or types into the target app.
export function createDragController({
  window,
  cursor,
  inspect,
  resolve,
  subscribe,
  capture = async () => {},
  report,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
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
    finishing = true;
    window.hide();
    try {
      report({ state: "reading", error: "", target: "" });
      await sleep(90); // Let macOS remove our overlay before hit-testing the same screen point.
      const target = await inspect(point);
      if (target.error)
        throw Object.assign(
          new Error(target.message || "Could not identify this session."),
          { code: target.error },
        );
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
      window.setBounds(active.bounds, false);
      window.showInactive();
      finishing = false;
    }
  }
  return { start, end, cancel, isDragging: () => !!drag || finishing };
}
