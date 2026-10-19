import { createHash } from "node:crypto";
// Completion markers differ by agent. Unknown formats settle after quiet time
// on the server; they are never guessed complete from an assistant text chunk.
export function createResponseBoundary(previous = {}) {
  let state = previous.responseState || "unknown",
    activityId = previous.activityId || "";
  return {
    read(line) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        return;
      }
      const event = r.type === "event_msg" ? r.payload?.type : r.type;
      const message = r.type === "response_item" ? r.payload : r.message || r;
      const role = message?.role;
      const end =
        [
          "task_complete",
          "turn_completed",
          "turn_aborted",
          "task_aborted",
        ].includes(event) ||
        (role === "assistant" &&
          ["end_turn", "stop_sequence"].includes(message.stop_reason));
      const start =
        ["task_started", "turn_started"].includes(event) ||
        role === "user" ||
        r.attachment?.type === "queued_command";
      const text = role === "assistant" && message.content;
      if (!end && !start && !text) return;
      const running = ["task_started", "turn_started"].includes(event);
      state = end
        ? "complete"
        : running
          ? "running"
          : start
            ? "busy"
            : state === "running"
              ? "running"
              : "unknown";
      activityId = createHash("sha256").update(line).digest("hex");
    },
    snapshot: () => ({ responseState: state, activityId }),
  };
}
