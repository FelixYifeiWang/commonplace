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
      <svg className="nosy-face" viewBox="0 0 80 80" fill="none">
        <path
          className="nosy-outline"
          d="M71 40C71 58 58 71 40 71C22 71 9 58 9 40C9 22 22 9 40 9C58 9 71 22 71 40Z"
          fill="white"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <g
          className="nosy-features"
          stroke="currentColor"
          strokeWidth="3.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="nosy-brow left" d="M20 29C23 25 28 24 32 26" />
          <path className="nosy-brow right" d="M47 25C51 22 57 23 60 27" />
          <g className="nosy-eyes" fill="currentColor" stroke="none">
            <ellipse cx="27" cy="36" rx="2.3" ry="3" />
            <ellipse cx="53" cy="34" rx="2.3" ry="3" />
          </g>
          <path className="nosy-nose" d="M39 30L34 49L45 49" />
        </g>
      </svg>
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
