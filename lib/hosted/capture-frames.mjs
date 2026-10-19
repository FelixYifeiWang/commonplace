// Runs before site scripts. A still preview needs a few settled frames, not
// an unbounded stream of WebGL commands queued on a server's software GPU.
export function installCaptureFrames() {
  Object.defineProperty(window, "devicePixelRatio", { get: () => 0.25 });
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const callbacks = new Map();
  let next = 0,
    timer = null,
    frame = null,
    paused = false;
  const schedule = () => {
    if (paused || timer !== null || frame !== null || !callbacks.size) return;
    timer = setTimeout(() => {
      timer = null;
      frame = request((time) => {
        frame = null;
        const batch = [...callbacks.keys()];
        for (const id of batch) {
          const callback = callbacks.get(id);
          callbacks.delete(id);
          if (callback && !paused) {
            // A site callback must not prevent unrelated callbacks from running.
            try {
              callback(time);
            } catch (error) {
              console.warn("Animation callback failed", error);
            }
          }
        }
        schedule();
      });
    }, 500);
  };
  window.requestAnimationFrame = (callback) => {
    const id = ++next;
    if (!paused) {
      callbacks.set(id, callback);
      schedule();
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => callbacks.delete(id);
  window.__newronPauseCaptureFrames = () => {
    paused = true;
    callbacks.clear();
    if (timer !== null) clearTimeout(timer);
    if (frame !== null) cancel(frame);
    timer = frame = null;
  };
}
