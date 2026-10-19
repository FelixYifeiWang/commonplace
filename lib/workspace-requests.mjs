// A slow poll may finish, but no read may cross a mutation boundary.
export function workspaceRequests() {
  let revision = 0;
  let writes = 0;
  let active = null;
  const invalidate = () => {
    revision++;
    active = null;
  };
  return {
    read() {
      if (writes || active !== null) return null;
      return (active = ++revision);
    },
    current(ticket) {
      return ticket !== null && !writes && ticket === revision;
    },
    complete(ticket) {
      if (active === ticket) active = null;
    },
    invalidate,
    mutate() {
      writes++;
      invalidate();
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        writes--;
        invalidate();
      };
    },
  };
}
