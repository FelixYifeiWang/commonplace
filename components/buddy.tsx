"use client";
import type { SessionState } from "@/lib/types";
// State labels shared by Nox and the session list. Nox itself is drawn in components/nox.tsx.
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
