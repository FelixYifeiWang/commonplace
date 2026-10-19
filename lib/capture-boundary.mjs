export const RESPONSE_QUIET_MS = 60000;
// Changes wait for response completion (when provided), otherwise one quiet
// minute. Empty heartbeats do not postpone publication indefinitely.
export function captureBoundarySQL({
  session,
  activityId,
  responseState,
  syncComplete,
  hasTurns,
  now,
}) {
  const changed =
    hasTurns || (!!activityId && activityId !== session.activityKey);
  if (!changed && syncComplete !== false && responseState !== "running")
    return null;
  const complete = syncComplete !== false && responseState === "complete";
  return {
    holdUntil: complete
      ? now + 8000
      : now + (responseState === "running" ? 90000 : RESPONSE_QUIET_MS),
    invalidate: changed || syncComplete === false,
    activityId:
      syncComplete !== false
        ? activityId || session.activityKey || ""
        : session.activityKey || "",
  };
}
