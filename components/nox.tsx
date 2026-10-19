"use client";
import { useEffect, useRef } from "react";
import type { SessionState } from "@/lib/types";
import { createMark } from "@/lib/nox-mark";
import type { MarkMood } from "@/lib/nox-mark";

// Nox (formerly the buddy): a flat glass lens with Newron's mark inside. At rest the mark is the N; while Nox
// works it melts into the firing cell (lib/nox-mark.ts). The mark sits sharp on the glass, unbent, like a label.
const MOOD: Record<SessionState, MarkMood> = {
  waiting: "rest",
  following: "rest",
  complete: "rest",
  reading: "working",
  collecting: "working",
  connecting: "working",
  paused: "muted",
  revoked: "muted",
  error: "alert",
};
// The mark's share of the bubble's width.
const MARK = 0.62;
export function Nox({
  state = "following",
  gaze,
  size = 72,
  trackPointer = false,
}: {
  state?: SessionState;
  gaze?: { x: number; y: number };
  size?: number;
  trackPointer?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mark = useRef<ReturnType<typeof createMark> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    try {
      mark.current = createMark(canvas.current, size * MARK);
    } catch {
      // Without WebGL the bubble stays empty glass rather than breaking the window.
      mark.current = null;
    }
    const unsubscribe = trackPointer
      ? window.commonplaceDesktop?.onGaze?.(({ x, y }) =>
          mark.current?.setGaze(x, y),
        )
      : undefined;
    return () => {
      unsubscribe?.();
      mark.current?.dispose();
      mark.current = null;
    };
  }, [size, trackPointer]);
  useEffect(() => {
    mark.current?.setMood(MOOD[state] || "rest");
  }, [state, size, trackPointer]);
  useEffect(() => {
    if (trackPointer && window.commonplaceDesktop?.onGaze) return;
    mark.current?.setGaze(gaze?.x || 0, gaze?.y || 0);
  }, [gaze?.x, gaze?.y, size, trackPointer]);
  return (
    <span
      className={`nox state-${state}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="nox-frame" />
      <canvas ref={canvas} className="nox-mark" />
    </span>
  );
}
