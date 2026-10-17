"use client";
import type { SessionState } from "@/lib/types";
export function Buddy({
  state = "following",
  small = false,
}: {
  state?: SessionState;
  small?: boolean;
}) {
  return (
    <span
      className={`buddy-creature ${small ? "small" : ""} state-${state}`}
      aria-hidden="true"
    >
      <span className="buddy-body">
        <i className="buddy-eye left" />
        <i className="buddy-eye right" />
        <i className="buddy-cheek left" />
        <i className="buddy-cheek right" />
      </span>
      <span className="buddy-shadow" />
    </span>
  );
}
export function buddyLabel(state: SessionState) {
  return {
    waiting: "Ready",
    reading: "Reading your session",
    collecting: "Collecting",
    connecting: "Finding connections",
    following: "All caught up",
    paused: "Paused",
    complete: "Complete",
    error: "Needs attention",
    revoked: "Disconnected",
  }[state];
}
export function sessionLabel(state: SessionState, lastSeen: string | null) {
  if (
    state === "following" &&
    lastSeen &&
    Date.now() - new Date(lastSeen).getTime() > 90000
  )
    return "Waiting for updates";
  return {
    waiting: "Waiting for agent",
    reading: "Reading",
    collecting: "Collecting",
    connecting: "Connecting ideas",
    following: "Following",
    paused: "Paused",
    complete: "Collected",
    error: "Needs attention",
    revoked: "Disconnected",
  }[state];
}
