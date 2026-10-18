"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUpRight, Minus, Plus, RotateCcw } from "lucide-react";
import { SheetMedia } from "./sheet-media";
import { SAMPLE_SESSION } from "@/lib/sample";
import { StoryView } from "./story-view";
import { mapLayout, zoomAround, pinchAround } from "@/lib/map-layout.mjs";
import type { Item } from "@/lib/types";
import type {
  MapDetail,
  MapNode,
  SessionDocument,
  SessionStep,
} from "@/lib/session-types";

type StoryState = {
  session: SessionDocument | null;
  pending: boolean;
  enabled: boolean;
  status: string;
  error: string | null;
  beats: unknown[];
};
type Viewport = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
function safeURL(value: string | null | undefined) {
  try {
    const url = new URL(value || "");
    return /^(https?:)$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function SessionView({
  collectionId,
  items,
  mode,
  onOpen,
  demo = false,
}: {
  collectionId: string;
  name: string;
  items: Item[];
  mode: "gallery" | "story";
  onOpen: (item: Item) => void;
  demo?: boolean;
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
          `/api/stories?collectionId=${encodeURIComponent(collectionId)}`,
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
  }, [collectionId, demo]);
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
  const session = demo ? SAMPLE_SESSION : story?.session;
  const working = story?.enabled && story.pending && story.status !== "error";
  const problem = error || story?.error;
  return (
    <section
      className={`session-view session-${mode}`}
      aria-label={mode === "gallery" ? "Collection map" : "Collection story"}
    >
      <div className="session-feedback" aria-live="polite">
        {problem ? (
          <>
            <span>{problem}</span>
            <button onClick={() => void retry()} disabled={retrying}>
              Retry
            </button>
          </>
        ) : working && session ? (
          <span className="session-updating">
            <i />
            {session ? "Updating" : "Reading the session"}
          </span>
        ) : null}
      </div>
      {session ? (
        mode === "gallery" ? (
          <SessionMap document={session} items={items} onOpen={onOpen} />
        ) : (
          <SessionStory document={session} items={items} onOpen={onOpen} />
        )
      ) : mode === "story" && !!story?.beats.length ? (
        <StoryView collectionId={collectionId} items={items} onOpen={onOpen} />
      ) : (
        <div className="session-await" role="status" aria-live="polite">
          {!problem && (
            <p className={working || !story ? "session-updating" : ""}>
              {(working || !story) && <i />}
              {!story
                ? "Loading…"
                : story.enabled === false
                  ? "Not available yet."
                  : working
                    ? `Creating ${mode === "gallery" ? "map" : "story"}…`
                    : "Add sources or connect a session to begin."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SessionStory({
  document,
  items,
  onOpen,
}: {
  document: SessionDocument;
  items: Item[];
  onOpen: (item: Item) => void;
}) {
  const media = new Map(items.map((item) => [item.id, item]));
  return (
    <div className="session-story-thread">
      {!document.steps.length && (
        <p className="session-empty">No decisions yet.</p>
      )}
      {document.steps.map((step, index) => (
        <article className="session-step" key={`${index}-${step.title}`}>
          <div className="session-step-copy">
            <span className="session-step-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            <details className="session-evidence">
              <summary>From the session</summary>
              {step.evidence.map((e, i) => (
                <blockquote key={`${e.sourceId}-${i}`}>{e.quote}</blockquote>
              ))}
            </details>
          </div>
          <StorySheet step={step} media={media} onOpen={onOpen} />
        </article>
      ))}
    </div>
  );
}
function StorySheet({
  step,
  media,
  onOpen,
}: {
  step: SessionStep;
  media: Map<string, Item>;
  onOpen: (item: Item) => void;
}) {
  const entries = step.canvas.items.filter((entry) => media.has(entry.itemId));
  if (!entries.length && !step.canvas.quote) return null;
  return (
    <div
      className={`soft-sheet story-sheet layout-${step.canvas.layout} count-${entries.length}`}
    >
      <div className="story-sheet-content">
        {entries.map((entry) => {
          const item = media.get(entry.itemId)!;
          return (
            <button
              className={`sheet-object role-${entry.role} kind-${item.kind}`}
              key={entry.itemId}
              onClick={() => onOpen(item)}
            >
              <span className="sheet-media">
                <SheetMedia item={item} />
              </span>
              <span className="sheet-caption">
                {entry.label}
                {entry.role === "picked" && <small>Picked</small>}
                {entry.role === "attempt" && <small>Dropped</small>}
              </span>
            </button>
          );
        })}
        {step.canvas.quote && (
          <blockquote className="sheet-quote">
            “{step.canvas.quote.text}”
          </blockquote>
        )}
      </div>
    </div>
  );
}

export function SessionMap({
  document,
  items,
  onOpen,
}: {
  document: SessionDocument;
  items: Item[];
  onOpen: (item: Item) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 0.7 });
  const [offsets, setOffsets] = useState<Record<number, Point>>({});
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    point: Point;
    group: number | null;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const media = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const details = view.zoom >= 1.05;
  const boxes = useMemo(
    () => mapLayout(document.map.nodes, { details, offsets }),
    [document.map.nodes, details, offsets],
  );
  const initialBoxes = useMemo(
    () => mapLayout(document.map.nodes),
    [document.map.nodes],
  );
  const reset = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const minX = Math.min(...initialBoxes.map((b) => b.x - b.width / 2)),
      maxX = Math.max(...initialBoxes.map((b) => b.x + b.width / 2));
    const minY = Math.min(...initialBoxes.map((b) => b.y - b.height / 2)),
      maxY = Math.max(...initialBoxes.map((b) => b.y + b.height / 2));
    const zoom = Math.max(
      0.35,
      Math.min(
        0.9,
        (el.clientWidth - 64) / (maxX - minX),
        (el.clientHeight - 80) / (maxY - minY),
      ),
    );
    setView({
      x: el.clientWidth / 2 - ((minX + maxX) / 2) * zoom,
      y: el.clientHeight / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
    setOffsets({});
  }, [initialBoxes]);
  // Resize keeps the map framed. Content changes preserve the user's exploration.
  const resetRef = useRef(reset);
  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => resetRef.current());
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) =>
        zoomAround(
          v,
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          Math.exp(-e.deltaY * 0.002),
        ),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  const zoom = (factor: number) => {
    const el = stage.current;
    if (el)
      setView((v) =>
        zoomAround(
          v,
          { x: el.clientWidth / 2, y: el.clientHeight / 2 },
          factor,
        ),
      );
  };
  const open = (
    entry: { itemId: string | null; url: string | null },
    group: number,
  ) => {
    if (suppressClick.current) return;
    // A removed saved item must not become a new external link after sync.
    if (entry.itemId && !media.has(entry.itemId)) return;
    const item = entry.itemId ? media.get(entry.itemId) : null;
    const url = safeURL(entry.url || (item?.kind === "link" ? item.url : null));
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item) {
      onOpen(item);
      return;
    }
    const box = boxes.find((b) => b.id === `node-${group}`),
      el = stage.current;
    if (box && el)
      setView({
        x: el.clientWidth / 2 - box.x * 1.15,
        y: el.clientHeight / 2 - box.y * 1.15,
        zoom: 1.15,
      });
  };
  return (
    <div
      className={`session-map ${view.zoom < 0.65 ? "map-condensed" : ""}`}
      ref={stage}
      style={{ "--map-zoom": view.zoom } as CSSProperties}
      tabIndex={0}
      aria-label="Idea map. Drag to pan. Scroll to zoom. Plus and minus zoom; zero resets."
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("button,a")) return;
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoom(1.2);
        } else if (e.key === "-") {
          e.preventDefault();
          zoom(1 / 1.2);
        } else if (e.key === "0") {
          e.preventDefault();
          reset();
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          setView((v) => ({
            ...v,
            x:
              v.x +
              (e.key === "ArrowLeft" ? 50 : e.key === "ArrowRight" ? -50 : 0),
            y:
              v.y +
              (e.key === "ArrowUp" ? 50 : e.key === "ArrowDown" ? -50 : 0),
          }));
        }
      }}
      onPointerDown={(e) => {
        if (
          e.button !== 0 ||
          (e.target as HTMLElement).closest(".map-controls")
        )
          return;
        const rect = e.currentTarget.getBoundingClientRect(),
          point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        pointers.current.set(e.pointerId, point);
        const tile = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-group]",
        );
        gesture.current = {
          point,
          group: tile ? Number(tile.dataset.group) : null,
          moved: false,
        };
        suppressClick.current = false;
        (
          (e.target as HTMLElement).closest("button") || e.currentTarget
        ).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const old = pointers.current.get(e.pointerId),
          drag = gesture.current;
        if (!old || !drag) return;
        const rect = e.currentTarget.getBoundingClientRect(),
          point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const other = [...pointers.current.entries()].find(
          ([id]) => id !== e.pointerId,
        )?.[1];
        pointers.current.set(e.pointerId, point);
        if (other) {
          setView((v) => pinchAround(v, old, point, other));
          drag.moved = true;
          suppressClick.current = true;
          return;
        }
        if (
          !drag.moved &&
          Math.hypot(point.x - drag.point.x, point.y - drag.point.y) < 4
        )
          return;
        const dx = point.x - (drag.moved ? old.x : drag.point.x),
          dy = point.y - (drag.moved ? old.y : drag.point.y);
        drag.moved = true;
        suppressClick.current = true;
        if (drag.group !== null && drag.group >= 0) {
          const group = drag.group;
          setOffsets((all) => ({
            ...all,
            [group]: {
              x: (all[group]?.x || 0) + dx / view.zoom,
              y: (all[group]?.y || 0) + dy / view.zoom,
            },
          }));
        } else setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (!pointers.current.size) gesture.current = null;
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        gesture.current = null;
      }}
    >
      <div
        className="map-world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <svg className="map-edges" aria-hidden="true">
          {boxes
            .filter((b) => b.id !== "center")
            .map((box) => {
              const owner = box.id.startsWith("detail")
                ? boxes.find((b) => b.id === `node-${box.group}`)!
                : boxes[0];
              return (
                <line
                  key={box.id}
                  x1={owner.x}
                  y1={owner.y}
                  x2={box.x}
                  y2={box.y}
                />
              );
            })}
        </svg>
        {boxes.map((box) => {
          const node = document.map.nodes[box.group];
          const detailIndex = box.id.startsWith("detail")
            ? Number(box.id.split("-")[2])
            : -1;
          const entry =
            box.id === "center"
              ? document.map.center
              : detailIndex >= 0
                ? node.details[detailIndex]
                : node;
          const item = entry.itemId ? media.get(entry.itemId) : undefined;
          const removed = !!entry.itemId && !item;
          const proof =
            "evidence" in entry ? (entry as MapDetail).evidence.quote : "";
          return (
            <div
              className={`map-object ${box.id === "center" ? "map-center" : detailIndex >= 0 ? "map-detail" : "map-node"}`}
              data-group={box.group}
              key={box.id}
              style={{
                left: box.x - box.width / 2,
                top: box.y - box.height / 2,
                width: box.width,
                height: box.height,
              }}
            >
              <button
                className={`soft-sheet map-tile ${item?.kind === "link" ? "is-page" : ""}`}
                style={{
                  height:
                    box.id === "center"
                      ? 114
                      : "size" in box
                        ? (box.size as number)
                        : 160,
                }}
                onClick={(event) => {
                  if (event.detail === 0) suppressClick.current = false;
                  open(entry, box.group);
                }}
                disabled={removed}
                title={removed ? "Item removed" : entry.label}
              >
                {item ? (
                  <SheetMedia item={item} />
                ) : box.id === "center" ? (
                  <strong>{entry.label}</strong>
                ) : detailIndex < 0 && node.font ? (
                  <span
                    className="map-specimen"
                    style={{
                      fontFamily: `${node.font.family}, Georgia, serif`,
                    }}
                  >
                    {node.font.sample}
                  </span>
                ) : (
                  <span className="map-quote">
                    {removed ? "Item removed" : proof || entry.label}
                  </span>
                )}
                {!removed &&
                  safeURL(
                    entry.url || (item?.kind === "link" ? item.url : null),
                  ) && <ArrowUpRight className="map-external" size={13} />}
              </button>
              <div className="map-caption">
                <strong>{entry.label}</strong>
                {detailIndex < 0 && box.group >= 0 && (
                  <p>{(entry as MapNode).summary}</p>
                )}
              </div>
              {view.zoom >= 1.4 && detailIndex >= 0 && item && (
                <span className="map-proof">
                  {(entry as MapDetail).evidence.quote}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="map-controls" role="group" aria-label="Map controls">
        <button onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
          <Minus size={15} />
        </button>
        <button onClick={reset} aria-label="Reset map">
          <RotateCcw size={14} />
        </button>
        <button onClick={() => zoom(1.2)} aria-label="Zoom in">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
