// Manual hiding and a short explicit reveal are independent of automatic hiding.
export function createVisibilityPolicy({ now = Date.now } = {}) {
  let manual = false,
    revealUntil = now() + 15000,
    misses = 0,
    visible = true;
  return {
    reveal() {
      manual = false;
      revealUntil = now() + 15000;
      misses = 0;
      visible = true;
    },
    hide() {
      manual = true;
      visible = false;
    },
    isManual() {
      return manual;
    },
    update({ supported, interacting = false }) {
      if (manual) return false;
      if (interacting) {
        revealUntil = now() + 1200;
        misses = 0;
        return (visible = true);
      }
      if (now() < revealUntil) return (visible = true);
      if (supported === true) {
        misses = 0;
        return (visible = true);
      }
      if (supported === false && ++misses >= 2) visible = false;
      // An inspector error is unknown, not a reason to flash or disappear.
      return visible;
    },
  };
}
