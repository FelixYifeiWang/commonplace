"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Nox } from "@/components/nox";
import { noxState } from "@/lib/nox-motion.mjs";
import type { SessionState } from "@/lib/types";
type Snapshot = {
  separateControls?: boolean;
  favorites?: { id: string; name: string }[];
  connected?: boolean;
  setupPending?: boolean;
  revision?: number;
  dragging?: boolean;
  gaze?: { x: number; y: number };
  buddyOffsetY: number;
  expanded: boolean;
  candidateTitle: string;
  candidateConnected: boolean;
  connecting: boolean;
  targetTitle: string;
  feedbackMessage?: string;
  feedbackActive?: boolean;
  feedbackPoint?: { x: number; y: number };
  state: SessionState;
  error: string;
};
type Bridge = {
  onGaze?: (callback: (gaze: { x: number; y: number }) => void) => () => void;
  copyReference?: (id: string) => Promise<{ copied: boolean }>;
  nativeDrag?: boolean;
  snapshot: () => Promise<Snapshot>;
  onSnapshot?: (callback: (snapshot: Snapshot) => void) => () => void;
  hitTest?: (interactive: boolean) => Promise<void>;
  contextMenu?: () => Promise<void>;
  dragStart: (point: { offset: { x: number; y: number } }) => Promise<boolean>;
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
    [error, setError] = useState("");
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const pointer = useRef<number | null>(null);
  const dragging = snapshot?.dragging || false;
  const receive = (value: Snapshot) =>
    setSnapshot((current) =>
      !current || (value.revision || 0) >= (current.revision || 0)
        ? value
        : current,
    );
  useEffect(() => {
    document.body.classList.add("desktop-buddy-page");
    let disposed = false;
    const update = async () => {
      try {
        const value = await window.commonplaceDesktop?.snapshot();
        if (value && !disposed) receive(value);
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Nox unavailable.");
      }
    };
    const unsubscribe = window.commonplaceDesktop?.onSnapshot?.((value) => {
      if (!disposed) receive(value);
    });
    void update();
    const timer = setInterval(() => void update(), 200);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pointer.current = null;
        if (!window.commonplaceDesktop?.nativeDrag)
          void window.commonplaceDesktop?.dragCancel();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener("keydown", escape);
      document.body.classList.remove("desktop-buddy-page");
    };
  }, []);
  const offset = snapshot?.buddyOffsetY ?? 54;
  const needsSetup = snapshot?.connected === false;
  const panelVisible =
    !!snapshot?.expanded &&
    !!snapshot?.candidateTitle &&
    !dragging &&
    !snapshot?.separateControls;
  return (
    <div
      className={`native-buddy compact ${snapshot?.expanded ? "expanded" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        void window.commonplaceDesktop?.contextMenu?.();
      }}
      onPointerMove={(e) => {
        if (pointer.current === null)
          void window.commonplaceDesktop?.hitTest?.(
            !!(e.target as HTMLElement).closest("button") ||
              (panelVisible && e.clientY >= 12 && e.clientY <= 166),
          );
      }}
      onPointerLeave={() => {
        if (pointer.current === null)
          void window.commonplaceDesktop?.hitTest?.(false);
      }}
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
        data-keyboard-focus={keyboardFocus}
        onKeyUp={(e) => {
          if (["Tab", "Enter", " "].includes(e.key)) setKeyboardFocus(true);
        }}
        onBlur={() => setKeyboardFocus(false)}
        aria-label="Move Nox. Hover or click to connect."
        title={error || "Move Nox. Click to connect."}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          setKeyboardFocus(false);
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = e.pointerId;
          setError("");
          if (window.commonplaceDesktop?.nativeDrag) return;
          void window.commonplaceDesktop
            ?.dragStart({ offset: { x: e.clientX, y: e.clientY } })
            .then((started) => {
              if (!started) pointer.current = null;
            })
            .catch((e) => {
              pointer.current = null;
              setError(e.message);
            });
        }}
        onPointerUp={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          pointer.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (window.commonplaceDesktop?.nativeDrag) return;
          void window.commonplaceDesktop
            ?.dragEnd()
            .then(async () => {
              const value = await window.commonplaceDesktop?.snapshot();
              if (value) receive(value);
            })
            .catch((e) => setError(e.message));
        }}
        onPointerCancel={() => {
          pointer.current = null;
          if (!window.commonplaceDesktop?.nativeDrag)
            void window.commonplaceDesktop?.dragCancel();
        }}
        onLostPointerCapture={() => {
          if (pointer.current !== null) {
            pointer.current = null;
            if (!window.commonplaceDesktop?.nativeDrag)
              void window.commonplaceDesktop?.dragCancel();
          }
        }}
        onClick={(e) => {
          if (e.detail === 0) void window.commonplaceDesktop?.toggle();
        }}
      >
        <Nox
          state={noxState(snapshot || {}) as SessionState}
          gaze={snapshot?.gaze}
          trackPointer
        />
      </button>
      <div
        className={`native-connect-panel above ${panelVisible ? "visible" : ""}`}
        aria-hidden={!panelVisible}
        inert={!panelVisible}
      >
        <button
          className={`native-connect ${snapshot?.candidateConnected ? "connected" : ""}`}
          disabled={
            snapshot?.setupPending ||
            (!needsSetup &&
              (snapshot?.connecting ||
                !snapshot?.candidateTitle ||
                snapshot?.candidateConnected))
          }
          title={
            needsSetup
              ? "Open Newron to set up Nox."
              : snapshot?.error ||
                snapshot?.candidateTitle ||
                "Move Nox over an open Codex conversation or Claude Code session, then choose Connect."
          }
          aria-label={
            needsSetup
              ? "Set up Nox"
              : snapshot?.candidateConnected
                ? "Connected"
                : snapshot?.connecting
                  ? "Connecting"
                  : "Connect session"
          }
          onClick={async () => {
            if (needsSetup) {
              window.commonplaceDesktop?.openSpace();
              return;
            }
            try {
              setSnapshot((s) => (s ? { ...s, connecting: true } : s));
              await window.commonplaceDesktop?.connect();
              const value = await window.commonplaceDesktop?.snapshot();
              if (value) receive(value);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not connect.");
            }
          }}
        >
          {snapshot?.connecting ? (
            <Loader2 size={12} className="spin" />
          ) : snapshot?.candidateConnected ? (
            <Check size={12} />
          ) : (
            <Plus size={12} />
          )}
          <span>
            {snapshot?.setupPending
              ? "Setting up…"
              : needsSetup
                ? "Set up"
                : snapshot?.candidateConnected
                  ? "Connected"
                  : snapshot?.connecting
                    ? "Connecting"
                    : "Connect"}
          </span>
        </button>
      </div>
    </div>
  );
}
