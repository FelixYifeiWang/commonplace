"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Buddy } from "@/components/buddy";
import type { SessionState } from "@/lib/types";
export default function DropFeedback() {
  const [value, setValue] = useState<{
    state: SessionState;
    targetTitle: string;
    error: string;
    feedbackActive?: boolean;
    feedbackPoint?: { x: number; y: number };
  }>({ state: "connecting", targetTitle: "", error: "" });
  useEffect(() => {
    document.body.classList.add("desktop-feedback-page");
    let disposed = false;
    const update = async () => {
      try {
        const snapshot = await window.commonplaceDesktop?.snapshot();
        if (snapshot && !disposed) setValue(snapshot);
      } catch {
        if (!disposed)
          setValue((v) => ({
            ...v,
            state: "error",
            error: "Connection unavailable.",
          }));
      }
    };
    void update();
    const timer = setInterval(() => void update(), 100);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.body.classList.remove("desktop-feedback-page");
    };
  }, []);
  const success = value.state === "following",
    error = value.state === "error";
  const label = success
    ? "Connected"
    : error
      ? "Couldn’t connect"
      : value.state === "collecting"
        ? "Collecting"
        : "Connecting";
  if (!value.feedbackActive) return null;
  return (
    <div
      className={`drop-feedback ${success ? "success" : error ? "failed" : "processing"}`}
      style={
        {
          "--drop-x": `${value.feedbackPoint?.x ?? 50}%`,
          "--drop-y": `${value.feedbackPoint?.y ?? 50}%`,
        } as React.CSSProperties
      }
    >
      <div className="drop-screen-glow" />
      <div className="drop-ripple" />
      <div className="drop-feedback-message" role="status" aria-live="polite">
        <div className="drop-feedback-face">
          <Buddy state={value.state} />
          {success ? (
            <span className="drop-result">
              <Check size={18} />
            </span>
          ) : error ? (
            <span className="drop-result">
              <X size={18} />
            </span>
          ) : null}
        </div>
        <strong>{label}</strong>
        {(error ? value.error : value.targetTitle) && (
          <span>{error ? value.error : value.targetTitle}</span>
        )}
        {!success && !error && (
          <div className="drop-progress">
            <i />
          </div>
        )}
      </div>
    </div>
  );
}
