"use client";

import { useEffect, useState } from "react";
import { SAMPLE_SESSION } from "@/lib/sample";
import { StoryView } from "./story-view";
import { SessionStory } from "./session-story";
import { SessionMap } from "./session-map";
import { DevSessionMap } from "./guided-session-map";
import type { Item } from "@/lib/types";
import type { SessionDocument } from "@/lib/session-types";

type StoryState = {
  session: SessionDocument | null;
  frozen?: boolean;
  paused?: boolean;
  preview?: boolean;
  previewSession?: SessionDocument | null;
  pending: boolean;
  enabled: boolean;
  status: string;
  error: string | null;
  beats: unknown[];
};
export function SessionView({
  collectionId,
  items,
  mode,
  onOpen,
  demo = false,
  devMode = false,
  shared = false,
}: {
  collectionId: string;
  name: string;
  items: Item[];
  mode: "gallery" | "story";
  onOpen: (item: Item) => void;
  demo?: boolean;
  devMode?: boolean;
  shared?: boolean;
}) {
  const [story, setStory] = useState<StoryState | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch(
          shared
            ? `/api/shared/${encodeURIComponent(collectionId)}/story`
            : `/api/stories?collectionId=${encodeURIComponent(collectionId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = (await response.json()) as StoryState;
        if (!response.ok)
          throw new Error(data.error || "Could not load this view.");
        if (!controller.signal.aborted) {
          setStory(data);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load this view.",
          );
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [collectionId, demo, shared]);
  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!response.ok) throw new Error("Could not retry. Try again shortly.");
      setError("");
      setStory(
        (s) => s && { ...s, pending: true, status: "pending", error: null },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setRetrying(false);
    }
  };
  const generated = demo ? SAMPLE_SESSION : story?.session;
  const missingView =
    mode === "gallery"
      ? !generated?.map?.nodes?.length
      : !generated?.steps.length && !story?.beats.length;
  const usePreview = !demo && missingView && !!story?.previewSession;
  const session = usePreview ? story?.previewSession : generated;
  const showingSources = story?.preview || usePreview;
  const working = story?.enabled && story.pending && story.status !== "error";
  const problem = error || story?.error;
  const hasView =
    mode === "gallery"
      ? !!session?.map?.nodes?.length
      : !!session?.steps.length || !!story?.beats.length;
  // A curated document is shown exactly as its mockup: its own page width, type and the guided Map.
  const curated = !!session?.curated;
  return (
    <section
      className={`session-view session-${mode}${hasView ? "" : " session-waiting"}${curated ? " session-curated" : ""}`}
      aria-label={mode === "gallery" ? "Collection map" : "Collection story"}
    >
      <div className="session-feedback" aria-live="polite">
        {story?.paused ? (
          <span className="session-notice">Paused</span>
        ) : problem && session ? (
          // The last good view stays below; say so, so it isn't mistaken for new.
          <span className="session-notice">
            <i aria-hidden="true" />
            <span>
              {showingSources
                ? shared
                  ? "Showing sources."
                  : "Showing your sources."
                : shared
                  ? "Update paused."
                  : "Update paused. Your last version is here."}
            </span>
            {!shared && !story?.frozen && (
              <button onClick={() => void retry()} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry"}
              </button>
            )}
          </span>
        ) : working && session ? (
          <span className="session-updating">
            <i />
            {showingSources
              ? shared
                ? "Organizing sources…"
                : "Organizing your sources…"
              : "Updating"}
          </span>
        ) : showingSources ? (
          <span className="session-updating">
            {shared ? "From this session" : "From your session"}
          </span>
        ) : null}
      </div>
      {session && mode === "gallery" && session.map?.nodes?.length ? (
        devMode || curated ? (
          <DevSessionMap doc={session} items={items} />
        ) : (
          <SessionMap doc={session} items={items} />
        )
      ) : session && mode === "story" && session.steps.length ? (
        <SessionStory document={session} items={items} onOpen={onOpen} />
      ) : mode === "story" && !!story?.beats.length ? (
        <StoryView
          collectionId={collectionId}
          items={items}
          onOpen={onOpen}
          shared={shared}
        />
      ) : (
        <div className="session-await" role="status" aria-live="polite">
          {problem ? (
            // With no view to fall back on, the failure is the page's message.
            <div className="session-await-problem">
              <p>{problem}</p>
              {!shared && !story?.frozen && (
                <button onClick={() => void retry()} disabled={retrying}>
                  {retrying ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          ) : (
            <p className={working || !story ? "session-updating" : ""}>
              {(working || !story) && <i />}
              {!story
                ? "Loading…"
                : story.paused
                  ? "Paused. Resume in Settings."
                  : story.enabled === false
                    ? "Not available yet."
                    : working
                      ? `Creating ${mode === "gallery" ? "map" : "story"}…`
                      : shared || story.frozen
                        ? "Nothing here yet."
                        : "Add sources or connect a session to begin."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
