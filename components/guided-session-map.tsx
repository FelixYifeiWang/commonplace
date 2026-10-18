"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Move, Scan } from "lucide-react";
import type { Item } from "@/lib/types";
import type { MapDetail, SessionDocument } from "@/lib/session-types";
import { visibleSessionMap, radialPath } from "@/lib/session-map.mjs";
import { guidedCamera, guidedPositions } from "@/lib/guided-map.mjs";
import { MapMediaPreview, SessionMap } from "./session-map";

export function DevSessionMap(props: {
  doc: SessionDocument;
  items: Item[];
  onOpen: (item: Item) => void;
}) {
  const [free, setFree] = useState(false);
  return (
    <div className="dev-map">
      {free ? (
        <SessionMap doc={props.doc} items={props.items} />
      ) : (
        <GuidedSessionMap {...props} />
      )}
      <button
        type="button"
        className="map-navigation-toggle"
        aria-label={free ? "Switch to guided map" : "Switch to free movement"}
        aria-pressed={free}
        onClick={() => setFree((value) => !value)}
      >
        {free ? <Scan size={14} /> : <Move size={14} />}
        {free ? "Guided" : "Free move"}
      </button>
    </div>
  );
}

function GuidedSessionMap({
  doc,
  items,
  onOpen,
}: {
  doc: SessionDocument;
  items: Item[];
  onOpen: (item: Item) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const focus = useRef<HTMLDivElement>(null);
  const map = useMemo(
    () => visibleSessionMap(doc.map, items),
    [doc.map, items],
  );
  const nodes = map.nodes.slice(0, 6) as SessionDocument["map"]["nodes"];
  const media = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  // A source's identity survives polling and reordering. Losing it returns to overview.
  const identity = (n: MapDetail) => n.itemId || n.url || n.label;
  const [selected, setSelected] = useState<string | null>(null);
  const index = nodes.findIndex((n) => identity(n) === selected);
  const active = nodes[index];
  const positions = guidedPositions(nodes.length);
  const point = positions[index];
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  const [focusSize, setFocusSize] = useState({ width: 560, height: 420 });
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!focus.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setFocusSize({
        width: entry.contentRect.width,
        height: entry.borderBoxSize[0]?.blockSize || entry.contentRect.height,
      });
    });
    observer.observe(focus.current);
    return () => observer.disconnect();
  }, [selected, index]);
  const compact = viewport.width < 600;
  const branchWidth = compact ? 310 : 560;
  const xs = [0, ...positions.map((p: { x: number }) => p.x)];
  const ys = [0, ...positions.map((p: { y: number }) => p.y)];
  const bounds = active
    ? {
        x: point.x - branchWidth / 2,
        y: point.y - 82,
        width: branchWidth,
        height: focusSize.height,
      }
    : {
        x: Math.min(...xs) - 110,
        y: Math.min(...ys) - 100,
        width: Math.max(...xs) - Math.min(...xs) + 220,
        height: Math.max(...ys) - Math.min(...ys) + 210,
      };
  const camera = guidedCamera(bounds, viewport);
  const move = (direction: number) => {
    if (!nodes.length) return;
    const next =
      index < 0
        ? direction > 0
          ? 0
          : nodes.length - 1
        : (index + direction + nodes.length) % nodes.length;
    setSelected(identity(nodes[next]));
  };
  const preview = (entry: MapDetail) => {
    const item = entry.itemId ? media.get(entry.itemId) : undefined;
    const fallback = (
      <span className="guided-words">
        {entry.evidence?.quote || entry.label}
      </span>
    );
    return item ? (
      <MapMediaPreview item={item} fallback={fallback} />
    ) : (
      fallback
    );
  };
  return (
    <section className="guided-map" aria-label="Guided session map">
      <div
        className={`guided-stage${active ? " is-focused" : ""}${compact ? " is-compact" : ""}`}
        ref={stage}
        tabIndex={0}
        aria-label="Map. Use arrow keys to explore, Escape for overview."
        onKeyDown={(event) => {
          if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey)
            return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1);
          } else if (event.key === "Escape") setSelected(null);
        }}
      >
        <div
          className="guided-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          <svg className="guided-lines" aria-hidden="true">
            {positions.map((p: { x: number; y: number }, i: number) => (
              <path
                key={i}
                d={radialPath({ x: 0, y: 0 }, p)}
                className={i === index ? "is-active" : ""}
              />
            ))}
          </svg>
          <button
            className="guided-core"
            tabIndex={active ? -1 : 0}
            onClick={() => setSelected(null)}
          >
            <span aria-hidden="true" className="guided-orbit" />
            {map.center.label}
          </button>
          {nodes.map((node, i) => (
            <button
              key={identity(node)}
              type="button"
              className="guided-node"
              style={{ left: positions[i].x, top: positions[i].y }}
              tabIndex={active ? -1 : 0}
              aria-label={`Explore ${node.label}`}
              onClick={() => setSelected(identity(node))}
            >
              <span className="guided-preview">{preview(node)}</span>
              <b>{node.label}</b>
            </button>
          ))}
          {active && (
            <div
              className="guided-focus"
              ref={focus}
              style={{
                left: point.x - branchWidth / 2,
                top: point.y - 82,
                width: branchWidth,
              }}
            >
              <div className="guided-focus-heading">
                <span className="guided-preview">{preview(active)}</span>
                <div>
                  <h2>{active.label}</h2>
                  <p>{active.summary}</p>
                  {active.itemId && media.has(active.itemId) ? (
                    <button
                      type="button"
                      onClick={() => onOpen(media.get(active.itemId!)!)}
                    >
                      Open reference ↗
                    </button>
                  ) : active.url ? (
                    <a
                      href={active.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open reference ↗
                    </a>
                  ) : null}
                </div>
              </div>
              {!!active.details.length && (
                <div className="guided-references">
                  {active.details.slice(0, 3).map((detail, i) => {
                    const item = detail.itemId
                      ? media.get(detail.itemId)
                      : undefined;
                    const content = (
                      <>
                        <span className="guided-preview">
                          {preview(detail)}
                        </span>
                        <b>{detail.label}</b>
                      </>
                    );
                    return item ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onOpen(item)}
                      >
                        {content}
                      </button>
                    ) : detail.url ? (
                      <a
                        key={i}
                        href={detail.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {content}
                      </a>
                    ) : (
                      <div key={i}>{content}</div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <nav className="guided-navigation" aria-label="Map navigation">
          <button
            type="button"
            aria-label="Previous node"
            onClick={() => move(-1)}
            disabled={!nodes.length}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className="guided-overview"
            onClick={() => setSelected(null)}
            aria-label="Show map overview"
          >
            {active ? `${index + 1} / ${nodes.length} · Overview` : "Overview"}
          </button>
          <button
            type="button"
            aria-label="Next node"
            onClick={() => move(1)}
            disabled={!nodes.length}
          >
            <ArrowRight size={16} />
          </button>
        </nav>
        <span className="sr-only" role="status">
          {active ? active.label : "Map overview"}
        </span>
      </div>
    </section>
  );
}
