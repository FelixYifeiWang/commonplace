"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import type { Item } from "@/lib/types";
import type {
  CanvasItem,
  SessionDocument,
  SessionStep,
  WordsCanvas,
} from "@/lib/session-types";
import { canvasVariant, orderItems, pictureFor } from "@/lib/story-canvas.mjs";
import { SheetMedia } from "./sheet-media";
// The Story: up to five steps in the human's voice, each beside one canvas (STORY_CANVAS.md).
const screenshots = process.env.NEXT_PUBLIC_HOSTED !== "1";
export function SessionStory({
  document,
  items,
  onOpen,
}: {
  document: SessionDocument;
  items: Item[];
  onOpen: (item: Item) => void;
}) {
  const media = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Each step rises in once as it scrolls into view; steps added by a later update join in.
  const root = useRef<HTMLDivElement>(null);
  const count = document.steps.length;
  useEffect(() => {
    const steps = root.current?.querySelectorAll<HTMLElement>(
      ".sv-step:not([data-in])",
    );
    if (!steps?.length) return;
    // A step that comes into view also reveals every step above it, so jumping past one never leaves it hidden.
    const all = [...root.current!.querySelectorAll<HTMLElement>(".sv-step")];
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          for (const step of all.slice(
            0,
            all.indexOf(entry.target as HTMLElement) + 1,
          )) {
            step.dataset.in = "";
            observer.unobserve(step);
          }
        }),
      { threshold: 0.15 },
    );
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, [count]);
  return (
    <div className="sv sv-rise" ref={root}>
      <div className="sv-dots" aria-hidden="true" />
      {document.steps.map((step, i) => (
        <article className="sv-step" key={`${i}-${step.title}`}>
          <div className="sv-say">
            <div className="sv-label">
              <b>Step {String(i + 1).padStart(2, "0")}</b>
            </div>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </div>
          <Canvas step={step} media={media} onOpen={onOpen} />
        </article>
      ))}
    </div>
  );
}
// Stories written before the words forms carry one quote; it reads as a line.
function wordsOf(step: SessionStep): WordsCanvas | null {
  const { words, quote } = step.canvas;
  if (words?.rows?.length) return words;
  if (quote?.text)
    return {
      form: "line",
      rows: [{ label: "", text: quote.text, sourceId: quote.sourceId }],
    };
  return null;
}
function Canvas({
  step,
  media,
  onOpen,
}: {
  step: SessionStep;
  media: Map<string, Item>;
  onOpen: (item: Item) => void;
}) {
  const words = wordsOf(step);
  if (words && !step.canvas.items.length)
    return (
      <Sheet className={`sv-words sv-${words.form}`}>
        <WordsBody words={words} />
      </Sheet>
    );
  // Items deleted since the story was written are left out; the variant shrinks to fit.
  const entries = (orderItems(step.canvas.items) as CanvasItem[]).flatMap(
    (e) => {
      const item = media.get(e.itemId);
      return item ? [{ ...e, item }] : [];
    },
  );
  const variant = canvasVariant(step.canvas.layout, entries.length);
  if (!variant) return null;
  return (
    <Sheet className={`sv-${variant}`}>
      {entries.map((entry, i) => (
        <Fragment key={entry.itemId}>
          {variant === "pair" && i === 1 && (
            <span className="sv-arrow" aria-hidden="true" />
          )}
          <Cell entry={entry} lead={i === 0} onOpen={onOpen} />
        </Fragment>
      ))}
    </Sheet>
  );
}
// The grey sheet: one rounded shape drawn three times, crisp at the top and blurring toward the bottom.
function Sheet({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <figure className={`sv-canvas ${className}`}>
      <div className="sv-sheet" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="sv-cv">
        <div className="sv-cb">{children}</div>
      </div>
    </figure>
  );
}
// Pills carry meaning only: what was picked, dropped or kept. Shape marks the state too, never colour alone.
const TAGS: Record<string, [string, string]> = {
  picked: ["Picked", ""],
  attempt: ["Dropped", "off"],
  result: ["Kept", ""],
};
function Cell({
  entry,
  lead,
  onOpen,
}: {
  entry: CanvasItem & { item: Item };
  lead: boolean;
  onOpen: (item: Item) => void;
}) {
  const [failed, setFailed] = useState(false);
  const { item } = entry;
  // Pictures are fitted in the browser (page, object cut out, or ink); links show their page.
  const still =
    item.kind === "image" && !!(item.fileKey || item.imageUrl) && !failed;
  const picture = still || failed ? null : pictureFor(item, { screenshots });
  const tag = TAGS[entry.role];
  const state =
    entry.role === "option"
      ? "sv-faded"
      : entry.role === "attempt"
        ? "sv-dropped"
        : "";
  const fit = still ? "fit" : picture ? picture.fit : "text";
  return (
    <figure className={`sv-cell ${lead ? "sv-lead" : ""} ${state} sv-${fit}`}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`Open ${entry.label}`}
      >
        {still ? (
          <SheetMedia item={item} screenshots={screenshots} />
        ) : picture ? (
          <Image
            unoptimized
            width={1200}
            height={750}
            src={picture.src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="sv-tile">
            <b>{item.title}</b>
            <small>{hostname(item.url)}</small>
          </span>
        )}
      </button>
      <figcaption>
        <b>{entry.label}</b>
        {tag && <i className={`sv-tag ${tag[1]}`}>{tag[0]}</i>}
      </figcaption>
    </figure>
  );
}
function hostname(url: string | null) {
  try {
    return new URL(url || "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
// A step with no picture: what happened, in the shape that fits it (STORY_CANVAS.md, "Words").
function WordsBody({ words }: { words: WordsCanvas }) {
  const { form, rows } = words;
  if (form === "flow")
    return (
      <ol className="sv-flow" style={{ "--n": rows.length } as CSSProperties}>
        {rows.map((r, i) => (
          <li key={i}>
            <b>{r.text}</b>
          </li>
        ))}
      </ol>
    );
  if (form === "change")
    return (
      <div className="sv-change">
        {rows.map((r, i) => (
          <Fragment key={i}>
            {i === 1 && (
              <span className="sv-to" aria-hidden="true">
                ↓
              </span>
            )}
            <div className={i === 0 ? "sv-was" : "sv-now"}>
              {r.label && <small>{r.label}</small>}
              <p>{i === 0 ? <del>{r.text}</del> : r.text}</p>
            </div>
          </Fragment>
        ))}
      </div>
    );
  if (form === "spec")
    return (
      <dl className="sv-spec">
        {rows.map((r, i) => (
          <Fragment key={i}>
            <dt>{r.label}</dt>
            <dd>{r.text}</dd>
          </Fragment>
        ))}
      </dl>
    );
  const [row] = rows;
  if (form === "line")
    return (
      <blockquote className="sv-line">
        <p>{row.text}</p>
        {row.label && <small>{row.label}</small>}
      </blockquote>
    );
  return (
    <div className="sv-number">
      <strong>{row.text}</strong>
      {row.label && <small>{row.label}</small>}
    </div>
  );
}
