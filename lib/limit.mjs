// Runs at most `max` tasks at once; the rest wait in order.
export function createLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < max && waiting.length) {
      const entry = waiting.shift();
      active++;
      entry.running = true;
      entry.start();
    }
  };
  return {
    /** Calls `start` once a slot is free. The returned stop() frees that slot, or drops a request that never started.
     * @param {() => void} start
     */
    acquire(start) {
      const entry = { start, running: false, done: false };
      waiting.push(entry);
      next();
      return () => {
        if (entry.done) return;
        entry.done = true;
        if (entry.running) {
          active--;
          next();
        } else waiting.splice(waiting.indexOf(entry), 1);
      };
    },
  };
}
