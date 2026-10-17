"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Pause, Play, X } from "lucide-react";
import { Buddy } from "@/components/buddy";
import type { SessionState } from "@/lib/types";
type Snapshot = {
  gaze?: { x: number; y: number };
  subscriptions: {
    id: string;
    title: string;
    paused: boolean;
    done: boolean;
    error?: string;
  }[];
  connected: boolean;
  expanded: boolean;
  targetTitle: string;
  feedbackActive?: boolean;
  feedbackPoint?: { x: number; y: number };
  state: SessionState;
  error: string;
};
type Bridge = {
  snapshot: () => Promise<Snapshot>;
  dragStart: () => Promise<boolean>;
  dragEnd: () => Promise<{ click: boolean; connected?: boolean }>;
  dragCancel: () => Promise<void>;
  toggle: () => Promise<void>;
  pause: (id: string) => Promise<void>;
  openSpace: () => void;
  hide: () => void;
};
declare global {
  interface Window {
    commonplaceDesktop?: Bridge;
  }
}
export default function Companion() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    document.body.classList.add("desktop-buddy-page");
    let disposed = false;
    const update = async () => {
      try {
        const value = await window.commonplaceDesktop?.snapshot();
        if (value && !disposed) setSnapshot(value);
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Companion unavailable.");
      }
    };
    void update();
    const timer = setInterval(() => void update(), 250);
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDragging(false);
        void window.commonplaceDesktop?.dragCancel();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("keydown", cancel);
      document.body.classList.remove("desktop-buddy-page");
    };
  }, []);
  const expanded = snapshot?.expanded || !snapshot;
  const message = error || snapshot?.error;
  return (
    <div
      className={`native-buddy ${expanded ? "expanded" : ""}`}
      style={
        {
          "--gaze-x": `${snapshot?.gaze?.x || 0}px`,
          "--gaze-y": `${snapshot?.gaze?.y || 0}px`,
        } as React.CSSProperties
      }
    >
      <button
        className={`native-buddy-grab ${dragging ? "dragging" : ""}`}
        aria-label="Drag buddy over an open Codex conversation. Click for controls."
        title="Drop over an open Codex conversation"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setError("");
          void window.commonplaceDesktop?.dragStart().catch((e) => {
            setDragging(false);
            setError(e.message);
          });
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
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
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void window.commonplaceDesktop?.toggle();
          }
        }}
      >
        <Buddy state={snapshot?.state || "waiting"} />
        {snapshot?.state === "following" && (
          <span className="native-status-dot" aria-label="Following" />
        )}
        {snapshot?.state === "error" && (
          <span
            className="native-status-dot error"
            aria-label="Needs attention"
          />
        )}
      </button>
      {expanded && !dragging && (
        <div className="native-buddy-controls">
          <button
            className="native-close icon-button"
            aria-label="Close controls"
            onClick={() => void window.commonplaceDesktop?.toggle()}
          >
            <X size={13} />
          </button>
          {!snapshot ? (
            <p>Open the desktop buddy to drag onto other apps.</p>
          ) : (
            <>
              <div className="native-controls-heading">
                {snapshot.subscriptions?.filter((s) => !s.paused && !s.done)
                  .length || 0}{" "}
                following
              </div>
              <div className="native-session-list">
                {snapshot.subscriptions
                  ?.filter((s) => !s.done)
                  .map((source) => (
                    <div className="native-session" key={source.id}>
                      <i
                        className={
                          source.error ? "error" : source.paused ? "paused" : ""
                        }
                      />
                      <span title={source.title}>{source.title}</span>
                      <button
                        aria-label={`${source.paused ? "Resume" : "Pause"} ${source.title}`}
                        onClick={async () => {
                          try {
                            await window.commonplaceDesktop?.pause(source.id);
                            const next =
                              await window.commonplaceDesktop?.snapshot();
                            if (next) setSnapshot(next);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not update session.",
                            );
                          }
                        }}
                      >
                        {source.paused ? (
                          <Play size={12} />
                        ) : (
                          <Pause size={12} />
                        )}
                      </button>
                    </div>
                  ))}
              </div>
              {!snapshot.subscriptions?.length && (
                <p>Drop onto a Codex session.</p>
              )}
              {message && (
                <p className="native-error" role="alert">
                  {message}
                </p>
              )}
              <button
                className="text-button"
                onClick={() => window.commonplaceDesktop?.openSpace()}
              >
                Open space <ArrowUpRight size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
