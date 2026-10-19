"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { PreviewImage } from "./preview-image";
import type { Item } from "@/lib/types";
import type {
  CanvasItem,
  CuratedPicture,
  SessionDocument,
  SessionStep,
  WordsCanvas,
} from "@/lib/session-types";
import {
  canvasVariant,
  orderItems,
  pageUrl,
  pictureFor,
} from "@/lib/story-canvas.mjs";
import { SheetMedia } from "./sheet-media";
// The Story: up to five steps in the human's voice, each beside one canvas (STORY_CANVAS.md).
const screenshots = true;
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
  const stepKeys = document.steps
    .map((step, i) => `${i}-${step.title}`)
    .join("\n");
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
  }, [stepKeys]);
  // A wipe runs left to right while its whole frame is on screen: from the moment its bottom edge comes into view
  // until its top nears the top of the screen, eased at both ends. The page scrolls normally and never pins.
  useEffect(() => {
    const frames = root.current?.querySelectorAll<HTMLElement>(".sv-frame");
    if (!frames?.length) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const ease = (t: number) => t * t * (3 - 2 * t);
    let queued = 0;
    const scrub = () => {
      queued = 0;
      for (const frame of frames) {
        const r = frame.getBoundingClientRect(),
          start = innerHeight - r.height,
          end = innerHeight * 0.12;
        const t = Math.max(
          0,
          Math.min(1, (start - r.top) / Math.max(160, start - end)),
        );
        frame.style.setProperty(
          "--p",
          `${(still.matches ? 50 : ease(t) * 100).toFixed(2)}%`,
        );
      }
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(scrub);
    };
    // Captured, so a scroll inside any container moves the wipe too.
    window.addEventListener("scroll", queue, { passive: true, capture: true });
    window.addEventListener("resize", queue);
    scrub();
    return () => {
      cancelAnimationFrame(queued);
      window.removeEventListener("scroll", queue, true);
      window.removeEventListener("resize", queue);
    };
  }, [stepKeys]);
  return (
    // A curated Story is still, as its mockup is; any other Story rises in step by step.
    <div
      className={document.curated ? "sv sv-curated" : "sv sv-rise"}
      ref={root}
    >
      <div className="sv-dots" aria-hidden="true" />
      {document.steps.map((step, i) => (
        <article className="sv-step" key={`${i}-${step.title}`}>
          <div className="sv-say">
            <div className="sv-label">
              <b>Step {String(i + 1).padStart(2, "0")}</b>
              {step.date && <span>{step.date}</span>}
            </div>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </div>
          {document.curated ? (
            <CuratedCanvas step={step} pictures={document.pictures || {}} />
          ) : (
            <Canvas step={step} media={media} onOpen={onOpen} />
          )}
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
// A curated step draws its canvas as the Story mockup does: pictures fill it, a short caption sits under each, and
// the human's words sit in one line at the foot, in the same place on every canvas.
function CuratedCanvas({
  step,
  pictures,
}: {
  step: SessionStep;
  pictures: Record<string, CuratedPicture>;
}) {
  const { items, said, wipe, rules } = step.canvas;
  return (
    <Sheet className={`sv-q${said ? "" : " sv-nq"}`}>
      {wipe ? (
        <div className={`sv-pics sv-wipe${wipe.beside ? " sv-vs" : ""}`}>
          {wipe.beside && (
            <Still className="sv-st" picture={pictures[wipe.beside.itemId]} />
          )}
          <div
            className="sv-frame"
            style={{ "--p": "0%" } as CSSProperties}
            role="img"
            aria-label={wipe.alt || `${wipe.from.label}, then ${wipe.to.label}`}
          >
            <Still
              className="sv-d"
              picture={pictures[wipe.from.itemId]}
              alt=""
            />
            <Still className="sv-k" picture={pictures[wipe.to.itemId]} alt="" />
            <i className="sv-handle" aria-hidden="true" />
          </div>
          {wipe.beside && (
            <span className="sv-st-cap">
              <b>{wipe.beside.label}</b>
            </span>
          )}
          <div className="sv-lbls">
            <span>
              <b>{wipe.from.label}</b>
              <i className="sv-tag off">Dropped</i>
            </span>
            <span aria-hidden="true">→</span>
            <span>
              <b>{wipe.to.label}</b>
              <i className="sv-tag">Kept</i>
            </span>
          </div>
        </div>
      ) : rules ? (
        // Each note beside the prompt line it became.
        <div
          className="sv-nr"
          style={{ "--n": rules.rows.length } as CSSProperties}
        >
          <div className="sv-nr-h">
            <span>{rules.heads[0]}</span>
            <span />
            <span>{rules.heads[1]}</span>
          </div>
          {rules.rows.map((row, i) => (
            <div className="sv-nr-row" key={i}>
              {row.note.itemId ? (
                <Still
                  className="sv-nr-note"
                  picture={pictures[row.note.itemId]}
                />
              ) : (
                <p className="sv-nr-say">“{row.note.text}”</p>
              )}
              <i className="sv-arrow" aria-hidden="true" />
              <code>{row.rule}</code>
            </div>
          ))}
        </div>
      ) : (
        <div className={`sv-pics ${items.length > 1 ? "sv-two" : "sv-one"}`}>
          {items.map((entry) => {
            const picture = pictures[entry.itemId];
            const tag = TAGS[entry.role];
            return (
              <figure key={entry.itemId} className={`sv-pc sv-${picture.fit}`}>
                <Still picture={picture} />
                {(entry.label || tag) && (
                  <figcaption>
                    {entry.label && <b>{entry.label}</b>}
                    {tag && <i className={`sv-tag ${tag[1]}`}>{tag[0]}</i>}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}
      {said && (
        <blockquote className="sv-said">
          <p>“{said.text}”</p>
          {said.by && <footer>{said.by}</footer>}
        </blockquote>
      )}
    </Sheet>
  );
}
// A picture a curated document ships with the site. Loaded at once, so nothing pops in while the page scrolls.
function Still({
  picture,
  className,
  alt,
}: {
  picture: CuratedPicture;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      unoptimized
      width={1600}
      height={1000}
      className={className}
      src={picture.src}
      alt={alt ?? picture.alt}
      loading="eager"
      draggable={false}
    />
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
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const { item } = entry;
  // Pictures are fitted in the browser (page, object cut out, or ink); links show their page.
  const still = item.kind === "image" && !!(item.fileKey || item.imageUrl);
  const picture = still
    ? null
    : pictureFor(item, { screenshots, failedSources });
  const tag = TAGS[entry.role];
  const state =
    entry.role === "option"
      ? "sv-faded"
      : entry.role === "attempt"
        ? "sv-dropped"
        : "";
  const fit = still ? "fit" : picture ? picture.fit : "text";
  // A link's picture opens its page (an artifact opens the artifact); anything else opens in place.
  const href = pageUrl(item);
  const face = still ? (
    <SheetMedia item={item} screenshots={screenshots} />
  ) : picture ? (
    <PreviewImage
      src={picture.src}
      onError={() => setFailedSources((failed) => [...failed, picture.src])}
    />
  ) : (
    <span className="sv-tile">
      <b>{item.title}</b>
      <small>{hostname(item.url)}</small>
    </span>
  );
  return (
    <figure className={`sv-cell ${lead ? "sv-lead" : ""} ${state} sv-${fit}`}>
      {href ? (
        <a
          className="sv-open"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${entry.label}`}
        >
          {face}
        </a>
      ) : (
        <button
          type="button"
          className="sv-open"
          onClick={() => onOpen(item)}
          aria-label={`Open ${entry.label}`}
        >
          {face}
        </button>
      )}
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
