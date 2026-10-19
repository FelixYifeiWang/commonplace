"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, RotateCw } from "lucide-react";
import { MediaCard } from "./media-card";
import type { Item } from "@/lib/types";
export type StoryBeat = {
  id: string;
  position: number;
  title: string;
  text: string;
  connections: { itemId: string; label: string }[];
  evidence: { sourceId: string; quote: string }[];
};
type Story = {
  status: string;
  error: string | null;
  pending: boolean;
  enabled: boolean;
  beats: StoryBeat[];
};
export function StoryView({
  collectionId,
  items,
  onOpen,
  demo = false,
  shared = false,
}: {
  collectionId: string;
  items: Item[];
  onOpen: (item: Item) => void;
  demo?: boolean;
  shared?: boolean;
}) {
  const [story, setStory] = useState<Story | null>(null),
    [error, setError] = useState(""),
    [retrying, setRetrying] = useState(false);
  const media = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  useEffect(() => {
    if (demo) return;
    let cancelled = false,
      busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(
          shared
            ? `/api/shared/${encodeURIComponent(collectionId)}/story`
            : `/api/stories?collectionId=${encodeURIComponent(collectionId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as Story;
        if (!response.ok) throw new Error(data.error || "Story unavailable.");
        if (!cancelled) {
          setStory(data);
          setError("");
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Story unavailable.");
      } finally {
        busy = false;
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [collectionId, demo, shared]);
  async function retry() {
    setRetrying(true);
    try {
      const r = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!r.ok) throw new Error("Could not continue the story.");
      setStory((s) =>
        s ? { ...s, status: "pending", pending: true, error: null } : s,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Story unavailable.");
    } finally {
      setRetrying(false);
    }
  }
  const writing = story?.enabled && story.pending && story.status !== "error";
  const problem = error || story?.error;
  return (
    <section className="story-view" aria-label="Collection story">
      <div className="story-toolbar">
        <span>
          {story?.beats.length
            ? `${story.beats.length} ${story.beats.length === 1 ? "moment" : "moments"}`
            : "Story"}
        </span>
        <span className="story-status" role="status" aria-live="polite">
          {writing ? (
            <>
              <Loader2 size={12} className="spin" />
              {story?.beats.length ? "Continuing…" : "Writing…"}
            </>
          ) : story?.beats.length && !problem ? (
            "Up to date"
          ) : null}
        </span>
      </div>
      {problem && (
        <div className="story-error" role="alert">
          <span>{problem}</span>
          {!shared && (
            <button onClick={() => void retry()} disabled={retrying}>
              <RotateCw size={13} />
              Retry
            </button>
          )}
        </div>
      )}
      {!story && !error && !demo && (
        <div className="story-wait" role="status">
          <StorySketch />
          <span>Reading the session…</span>
        </div>
      )}
      {demo || story?.enabled === false ? (
        <div className="story-wait">
          <StorySketch />
          <span>Open your local space to write a story.</span>
        </div>
      ) : null}
      {story?.enabled && story.beats.length === 0 && !problem && (
        <div className="story-wait">
          <StorySketch active={!!writing} />
          <span>
            {writing
              ? "Connecting the thread…"
              : "The story starts with your first idea."}
          </span>
        </div>
      )}
      <div className="story-thread">
        {story?.beats.map((beat) => (
          <article className="story-beat" key={beat.id}>
            <div className="story-beat-copy">
              <span className="story-index">
                {String(beat.position).padStart(2, "0")}
              </span>
              <h2>{beat.title}</h2>
              <p>{beat.text}</p>
              <details className="story-evidence">
                <summary>From the session</summary>
                {beat.evidence.map((proof, i) => (
                  <blockquote key={`${proof.sourceId}-${i}`}>
                    {proof.quote}
                  </blockquote>
                ))}
              </details>
            </div>
            <StoryGraph beat={beat} media={media} onOpen={onOpen} />
          </article>
        ))}
      </div>
      {writing && !!story?.beats.length && (
        <div className="story-tail" role="status">
          <span className="story-tail-dot" />
          Following the next idea…
        </div>
      )}
    </section>
  );
}
function StorySketch({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`story-sketch ${active ? "is-writing" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 180 120">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M28 30Q70 28 90 62T154 94M38 96Q70 83 90 62T151 28M90 62Q105 90 103 110" />
          <circle cx="90" cy="62" r="16" />
          <circle cx="28" cy="30" r="9" />
          <circle cx="151" cy="28" r="9" />
          <circle cx="154" cy="94" r="9" />
          <circle cx="38" cy="96" r="9" />
        </g>
        <circle cx="90" cy="62" r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
function StoryGraph({
  beat,
  media,
  onOpen,
}: {
  beat: StoryBeat;
  media: Map<string, Item>;
  onOpen: (item: Item) => void;
}) {
  const marker = useId().replace(/:/g, "");
  const edges = beat.connections.flatMap((edge) => {
    const item = media.get(edge.itemId);
    return item ? [{ ...edge, item }] : [];
  });
  if (!edges.length)
    return (
      <div className="story-text-mark" aria-hidden="true">
        <span />
        <svg viewBox="0 0 300 80">
          <path d="M5 48C74 12 95 66 151 37S246 54 294 26" />
        </svg>
      </div>
    );
  const positions =
    edges.length === 1
      ? [{ x: 6, y: 24 }]
      : edges.length === 2
        ? [
            { x: 5, y: 8 },
            { x: 69, y: 56 },
          ]
        : [
            { x: 4, y: 5 },
            { x: 70, y: 4 },
            { x: 5, y: 57 },
            { x: 70, y: 58 },
          ];
  return (
    <div
      className={`story-graph graph-count-${edges.length}`}
      role="group"
      aria-label={`Sources for ${beat.title}`}
    >
      <svg
        className="story-edges"
        viewBox="0 0 640 370"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id={marker}
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
          >
            <path
              d="M1 1L5 3.5L1 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </marker>
        </defs>
        {edges.map((edge, i) => {
          const p = positions[i],
            left = p.x < 50,
            x = left ? (p.x + 24) * 6.4 : p.x * 6.4,
            y = (p.y + 16) * 3.7,
            endX = left ? 230 : 410;
          return (
            <path
              key={edge.itemId}
              d={`M${x} ${y} Q${left ? 260 : 380} ${y} ${endX} 185`}
              markerEnd={`url(#${marker})`}
            />
          );
        })}
      </svg>
      <div className="story-idea">
        <span>{String(beat.position).padStart(2, "0")}</span>
        <strong>{beat.title}</strong>
      </div>
      {edges.map((edge, i) => (
        <div
          className={`story-source source-${i}`}
          key={edge.itemId}
          style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
        >
          <button
            onClick={() => onOpen(edge.item)}
            aria-label={`Open ${edge.item.title}`}
            className="story-source-card"
          >
            <div className="story-source-art">
              <MediaCard item={edge.item} />
            </div>
            <span>
              {edge.item.title}
              <ArrowUpRight size={11} />
            </span>
          </button>
          <span className="story-connection-label">{edge.label}</span>
        </div>
      ))}
    </div>
  );
}
