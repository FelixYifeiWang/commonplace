// Per-tab, per-account recovery. Never retain setup links beyond their lifetime.
export function readSetupTicket(storage, key, now = Date.now()) {
  try {
    const ticket = JSON.parse(storage?.getItem(key) || "null");
    if (
      !ticket ||
      !/^[a-f0-9]{64}$/.test(ticket.setupId) ||
      !Number.isFinite(ticket.expiresAt) ||
      ticket.expiresAt <= now
    ) {
      storage?.removeItem(key);
      return null;
    }
    const link = new URL(ticket.link);
    if (link.protocol !== "https:" && link.hostname !== "127.0.0.1")
      return null;
    if (
      !/^[a-f0-9]{64}$/.test(link.hash.slice(1)) ||
      link.pathname !== "/setup.md"
    )
      return null;
    return ticket;
  } catch {
    return null;
  }
}
export function saveSetupTicket(storage, key, ticket) {
  try {
    if (ticket) storage?.setItem(key, JSON.stringify(ticket));
    else storage?.removeItem(key);
  } catch {
    /* Setup still works when browser storage is unavailable. */
  }
}
