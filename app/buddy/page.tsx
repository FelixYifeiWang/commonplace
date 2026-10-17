"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { Buddy, buddyLabel } from "@/components/buddy";
import type { SessionState } from "@/lib/types";
type Source = {
  id: string;
  title: string;
  provider: string;
  updatedAt: string;
};
type Subscription = {
  id: string;
  title: string;
  provider: string;
  paused: boolean;
  done: boolean;
  turns?: number;
  error?: string;
};
type Snapshot = {
  connected: boolean;
  subscriptions: Subscription[];
  state: SessionState;
  error: string;
  origin: string;
};
type Bridge = {
  snapshot: () => Promise<Snapshot>;
  discover: () => Promise<Source[]>;
  pair: (token: string, origin: string) => Promise<void>;
  subscribe: (id: string, mode: string) => Promise<void>;
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
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [sources, setSources] = useState<Source[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("follow");
  useEffect(() => {
    document.body.classList.add("desktop-buddy-page");
    async function refresh() {
      try {
        if (window.commonplaceDesktop)
          setSnapshot(await window.commonplaceDesktop.snapshot());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reach companion.");
      }
    }
    void refresh();
    const id = setInterval(() => void refresh(), 1500);
    return () => {
      clearInterval(id);
      document.body.classList.remove("desktop-buddy-page");
    };
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (window.commonplaceDesktop)
        setSnapshot(await window.commonplaceDesktop.snapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="desktop-panel">
      <div className="desktop-handle">
        <Buddy state={snapshot?.state || "waiting"} small />
        <h1>Commonplace</h1>
        <button
          className="icon-button"
          aria-label="Hide companion"
          onClick={() => window.commonplaceDesktop?.hide()}
        >
          <Minus size={15} />
        </button>
      </div>
      <div className="desktop-status">
        <span className="live-dot" />
        {buddyLabel(snapshot?.state || "waiting")}
      </div>
      {error || snapshot?.error ? (
        <p className="desktop-panel-error" role="alert">
          {error || snapshot?.error}
        </p>
      ) : null}
      {!snapshot ? (
        <p className="desktop-note">
          Open this view in the desktop companion to connect local sessions.
        </p>
      ) : !snapshot.connected ? (
        <>
          <p className="desktop-note">
            Connect your computer once.
            <br />
            Then choose which conversations come along.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const response = await fetch("/api/devices", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "My desktop companion" }),
                });
                const data = (await response.json()) as {
                  token: string;
                  error?: string;
                };
                if (!response.ok)
                  throw new Error(data.error || "Sign in to your space first.");
                await window.commonplaceDesktop!.pair(
                  data.token,
                  window.location.origin,
                );
              })
            }
          >
            {busy ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
            Connect to my space
          </button>
        </>
      ) : (
        <>
          <div className="section-heading" style={{ marginTop: 17 }}>
            <span className="eyebrow">YOUR SESSIONS</span>
            <button
              className="text-button"
              onClick={() =>
                void run(async () =>
                  setSources(await window.commonplaceDesktop!.discover()),
                )
              }
              disabled={busy}
            >
              <Plus size={12} />
              Choose session
            </button>
          </div>
          {sources ? (
            <>
              <div className="desktop-source-heading">
                <span>Recent local conversations</span>
                <button
                  className="text-button"
                  onClick={() => setSources(null)}
                >
                  Done
                </button>
              </div>
              <label className="desktop-mode">
                Capture mode
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="follow">Keep following</option>
                  <option value="once">Read once</option>
                </select>
              </label>
              <div className="desktop-sources">
                {sources.length ? (
                  sources.map((source) => (
                    <button
                      className="desktop-source"
                      key={source.id}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await window.commonplaceDesktop!.subscribe(
                            source.id,
                            mode,
                          );
                          setSources(null);
                        })
                      }
                    >
                      <span>
                        <strong>{source.title}</strong>
                        <small>
                          {source.provider} ·{" "}
                          {new Date(source.updatedAt).toLocaleDateString()}
                        </small>
                      </span>
                      <Plus size={13} />
                    </button>
                  ))
                ) : (
                  <p className="desktop-note">
                    No supported sessions found.
                    <br />
                    This preview reads local Claude Code and Codex JSONL
                    histories.
                  </p>
                )}
              </div>
            </>
          ) : snapshot.subscriptions.length ? (
            snapshot.subscriptions.map((s) => (
              <div className="session-row" key={s.id}>
                <div className="session-row-main">
                  <strong>{s.title}</strong>
                  <p>
                    {s.provider} ·{" "}
                    {s.done
                      ? "Collected"
                      : s.paused
                        ? "Paused"
                        : `${s.turns || 0} turns read`}
                  </p>
                </div>
                <button
                  className="icon-button"
                  disabled={busy || s.done}
                  aria-label={s.paused ? "Resume session" : "Pause session"}
                  onClick={() =>
                    void run(() => window.commonplaceDesktop!.pause(s.id))
                  }
                >
                  {s.done ? (
                    <Check size={13} />
                  ) : s.paused ? (
                    <Play size={13} />
                  ) : (
                    <Pause size={13} />
                  )}
                </button>
              </div>
            ))
          ) : (
            <p className="desktop-note">
              Choose a session to start.
              <br />
              Your coding agent doesn’t need to do a thing.
            </p>
          )}
        </>
      )}
      <div className="desktop-panel-footer">
        <span>Only the sessions you choose.</span>
        <button
          className="text-button"
          onClick={() => window.commonplaceDesktop?.openSpace()}
        >
          Open space <ArrowUpRight size={12} />
        </button>
      </div>
      <p className="desktop-preview-note">
        Preview: reference capture is live. AI idea extraction is not connected
        yet.
      </p>
    </div>
  );
}
