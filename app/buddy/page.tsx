"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Buddy } from "@/components/buddy";
import type { SessionState } from "@/lib/types";
type Snapshot = {
  gaze?: { x: number; y: number };
  buddyOffsetY: number;
  expanded: boolean;
  candidateTitle: string;
  candidateConnected: boolean;
  connecting: boolean;
  targetTitle: string;
  feedbackActive?: boolean;
  feedbackPoint?: { x: number; y: number };
  state: SessionState;
  error: string;
};
type Bridge = {
  snapshot: () => Promise<Snapshot>;
  dragStart: (point: { x: number; y: number }) => Promise<boolean>;
  dragEnd: () => Promise<{ click: boolean; moved?: boolean }>;
  dragCancel: () => Promise<void>;
  toggle: () => Promise<void>;
  connect: () => Promise<{ connected: boolean }>;
  openSpace: () => void;
  hide: () => void;
};
declare global {
  interface Window {
    commonplaceDesktop?: Bridge;
  }
}
export default function Companion() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    document.body.classList.add("desktop-buddy-page");
    let disposed = false;
    const update = async () => {
      try {
        const value = await window.commonplaceDesktop?.snapshot();
        if (value && !disposed) setSnapshot(value);
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Buddy unavailable.");
      }
    };
    void update();
    const timer = setInterval(() => void update(), 200);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDragging(false);
        void window.commonplaceDesktop?.dragCancel();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("keydown", escape);
      document.body.classList.remove("desktop-buddy-page");
    };
  }, []);
  const offset = snapshot?.buddyOffsetY || 0;
  return (
    <div
      className={`native-buddy compact ${snapshot?.expanded ? "expanded" : ""}`}
      style={
        {
          "--gaze-x": `${snapshot?.gaze?.x || 0}px`,
          "--gaze-y": `${snapshot?.gaze?.y || 0}px`,
          "--buddy-offset": `${offset}px`,
        } as React.CSSProperties
      }
    >
      <button
        className={`native-buddy-grab ${dragging ? "dragging" : ""}`}
        aria-label="Move buddy. Click for connection."
        title={error || "Move buddy. Click to connect."}
        onPointerDown={(e) => {
          if (e.button !== 0 || snapshot?.connecting) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setError("");
          void window.commonplaceDesktop
            ?.dragStart({ x: e.screenX, y: e.screenY })
            .catch((e) => {
              setDragging(false);
              setError(e.message);
            });
        }}
        onPointerUp={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          void window.commonplaceDesktop
            ?.dragEnd()
            .then(async () => {
              const value = await window.commonplaceDesktop?.snapshot();
              if (value) setSnapshot(value);
            })
            .catch((e) => setError(e.message));
        }}
        onPointerCancel={() => {
          setDragging(false);
          void window.commonplaceDesktop?.dragCancel();
        }}
        onClick={(e) => {
          if (e.detail === 0) void window.commonplaceDesktop?.toggle();
        }}
      >
        <Buddy state={snapshot?.state || "waiting"} />
      </button>
      {snapshot?.expanded && !dragging && (
        <div className={`native-connect-panel ${offset ? "above" : ""}`}>
          <button
            className={`native-connect ${snapshot.candidateConnected ? "connected" : ""}`}
            disabled={
              snapshot.connecting ||
              !snapshot.candidateTitle ||
              snapshot.candidateConnected
            }
            title={
              snapshot.error ||
              snapshot.candidateTitle ||
              "Move the buddy over an open Codex conversation or Claude Code session, then click it."
            }
            aria-label={
              snapshot.candidateConnected
                ? "Connected"
                : snapshot.connecting
                  ? "Connecting"
                  : "Connect session"
            }
            onClick={async () => {
              try {
                setSnapshot((s) => (s ? { ...s, connecting: true } : s));
                await window.commonplaceDesktop?.connect();
                const value = await window.commonplaceDesktop?.snapshot();
                if (value) setSnapshot(value);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not connect.");
              }
            }}
          >
            {snapshot.connecting ? (
              <Loader2 size={12} className="spin" />
            ) : snapshot.candidateConnected ? (
              <Check size={12} />
            ) : (
              <Plus size={12} />
            )}
            <span>
              {snapshot.candidateConnected
                ? "Connected"
                : snapshot.connecting
                  ? "Connecting"
                  : "Connect"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
