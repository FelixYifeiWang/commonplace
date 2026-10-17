"use client";
import { useMemo, useState } from "react";
import {
  Check,
  CheckSquare2,
  Layers2,
  Search,
  SlidersHorizontal,
  X,
  Trash2,
  Plus,
  ArrowUp,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import type { Item } from "@/lib/types";
import { filterItems, groupItems, sourceHost } from "@/lib/gallery.mjs";
import { MediaCard } from "./media-card";
type Group = { key: string; title: string; topic: boolean; items: Item[] };
type Drop = { files?: File[]; text?: string };
export function Gallery({
  items,
  onOpen,
  onDelete,
  onAdd,
  onQuickAdd,
  canAdd = true,
}: {
  items: Item[];
  onOpen: (item: Item) => void;
  onDelete: (ids: string[]) => Promise<void>;
  onAdd: (drop?: Drop) => void;
  onQuickAdd: (text: string) => Promise<void>;
  canAdd?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [site, setSite] = useState("all"),
    [expanded, setExpanded] = useState<string[]>([]),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [screenshots, setScreenshots] = useState(true);
  const sites = useMemo(
    () => [...new Set(items.map(sourceHost).filter(Boolean))].sort(),
    [items],
  );
  const filtered = filterItems(items, { query, type, site }) as Item[];
  const groups: Group[] = groupItems(filtered, !selecting);
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  const filtersActive = type !== "all" || site !== "all" || !!query;
  function card(group: Group, cover = false) {
    const item = group.items[0],
      stack = group.items.length > 1,
      open = expanded.includes(group.key);
    return (
      <button
        className={`gallery-card ${stack ? "is-stack" : ""} ${open && stack ? "stack-open" : ""} ${selected.includes(item.id) ? "is-selected" : ""}`}
        key={group.key}
        aria-label={
          stack
            ? `${open ? "Fold" : "Expand"} ${group.title}, ${group.items.length} sources`
            : item.title
        }
        aria-expanded={stack ? open : undefined}
        aria-pressed={selecting ? selected.includes(item.id) : undefined}
        onClick={() =>
          selecting
            ? toggle(item.id)
            : stack
              ? setExpanded((s) =>
                  open ? s.filter((x) => x !== group.key) : [...s, group.key],
                )
              : onOpen(item)
        }
      >
        <div className="gallery-card-art">
          {stack && !open && (
            <>
              <div className="stack-sheet stack-back" />
              <div className="stack-sheet stack-middle" />
            </>
          )}
          <div className="stack-front">
            <MediaCard key={item.id} item={item} screenshots={screenshots} />
          </div>
          {selecting && (
            <span className="block-select">
              {selected.includes(item.id) && <Check size={13} />}
            </span>
          )}
          {stack && (
            <span className="stack-count">
              {open ? <ChevronDown size={12} /> : <Layers2 size={12} />}{" "}
              {group.items.length}
            </span>
          )}
        </div>
        <div className="gallery-caption">
          <span>{stack ? group.title : item.title}</span>
          <small>
            {stack
              ? open
                ? "Click to fold"
                : `${group.items.length} sources`
              : sourceHost(item) ||
                (
                  {
                    note: "Text",
                    idea: "Text",
                    quote: "Text",
                    image: "Image",
                    video: "Video",
                    audio: "Audio",
                    file: "File",
                    document: "PDF",
                  } as Record<string, string>
                )[item.kind]}
          </small>
        </div>
        {cover && <span className="sr-only">Group cover</span>}
      </button>
    );
  }
  return (
    <section className="gallery" aria-label="Saved sources">
      <div className="gallery-tools">
        <span className="gallery-count">
          {filtersActive ? `${filtered.length} / ` : ""}
          {items.length} {items.length === 1 ? "block" : "blocks"}
        </span>
        <div className="gallery-tool-actions">
          <label className="gallery-search">
            <Search size={14} />
            <input
              aria-label="Search sources"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={12} />
              </button>
            )}
          </label>
          <details className="gallery-filters">
            <summary aria-label="Filter sources" title="Filter sources">
              <SlidersHorizontal size={16} />
              {filtersActive && <i />}
            </summary>
            <div className="gallery-filter-panel">
              <label>
                Type
                <select
                  aria-label="Media type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {[
                    ["all", "Everything"],
                    ["link", "Websites"],
                    ["image", "Images"],
                    ["text", "Text"],
                    ["video", "Video"],
                    ["audio", "Audio"],
                    ["file", "Files"],
                  ].map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  aria-label="Source website"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                >
                  <option value="all">All sites</option>
                  {sites.map((host) => (
                    <option key={host}>{host}</option>
                  ))}
                </select>
              </label>
              <label>
                Web previews
                <select
                  aria-label="Website preview style"
                  value={screenshots ? "page" : "cover"}
                  onChange={(e) => setScreenshots(e.target.value === "page")}
                >
                  <option value="page">Page screenshots</option>
                  <option value="cover">Cover images</option>
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setType("all");
                  setSite("all");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            </div>
          </details>
          <button
            className={`gallery-tool ${selecting ? "active" : ""}`}
            aria-label={selecting ? "Cancel selection" : "Select blocks"}
            title="Select blocks"
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
              setError("");
            }}
          >
            <CheckSquare2 size={16} />
          </button>
        </div>
      </div>
      {selecting && (
        <div className="gallery-selection">
          <span>{selected.length} selected</span>
          <button
            onClick={() =>
              setSelected(
                selected.length === filtered.length
                  ? []
                  : filtered.map((i) => i.id),
              )
            }
          >
            {selected.length === filtered.length
              ? "Deselect all"
              : "Select all"}
          </button>
          <button
            className="delete-selection"
            disabled={!selected.length || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(selected);
                setSelected([]);
                setSelecting(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not delete.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="gallery-grid">
        {!selecting && (
          <AddTile canAdd={canAdd} onAdd={onAdd} onSave={onQuickAdd} />
        )}
        {groups.map((group) =>
          expanded.includes(group.key) &&
          group.items.length > 1 &&
          !selecting ? (
            <div
              className="gallery-cluster"
              role="group"
              aria-label={`${group.title} sources`}
              key={group.key}
            >
              <div className="gallery-group-grid">
                {card(group, true)}
                {group.items.map((item) =>
                  card({
                    key: item.id,
                    title: item.title,
                    topic: false,
                    items: [item],
                  }),
                )}
              </div>
            </div>
          ) : (
            card(group)
          ),
        )}
      </div>
      {!groups.length && items.length > 0 && (
        <div className="gallery-empty">
          <p>No matching blocks</p>
          <button
            onClick={() => {
              setQuery("");
              setType("all");
              setSite("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
function AddTile({
  onAdd,
  onSave,
  canAdd,
}: {
  onAdd: (drop?: Drop) => void;
  onSave: (text: string) => Promise<void>;
  canAdd: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [over, setOver] = useState(false);
  return (
    <div
      className={`gallery-add-tile ${over ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onAdd({
          files: Array.from(e.dataTransfer.files),
          text: e.dataTransfer.files.length
            ? ""
            : e.dataTransfer.getData("text/uri-list") ||
              e.dataTransfer.getData("text/plain"),
        });
      }}
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave(text);
              setText("");
              setEditing(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            aria-label="New block content"
            placeholder="Paste a link or write something…"
            autoFocus
            value={text}
            disabled={busy}
            maxLength={12000}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                onAdd({ files: Array.from(e.clipboardData.files) });
              }
            }}
          />
          {error && <small role="alert">{error}</small>}
          <div>
            <button
              type="button"
              aria-label="Choose files"
              onClick={() => {
                setEditing(false);
                onAdd({ text });
              }}
            >
              <Paperclip size={15} />
            </button>
            <button
              type="button"
              aria-label="Cancel new block"
              onClick={() => {
                setEditing(false);
                setText("");
              }}
            >
              <X size={15} />
            </button>
            <button aria-label="Save block" disabled={busy || !text.trim()}>
              <ArrowUp size={16} />
            </button>
          </div>
        </form>
      ) : (
        <button
          className="gallery-add-placeholder"
          aria-label="Add a block"
          onClick={() => (canAdd ? setEditing(true) : onAdd())}
          onPaste={(e) => {
            e.preventDefault();
            if (e.clipboardData.files.length)
              onAdd({ files: Array.from(e.clipboardData.files) });
            else {
              setText(e.clipboardData.getData("text"));
              setEditing(true);
            }
          }}
        >
          <Plus size={22} strokeWidth={1} />
          <span>Add a block</span>
        </button>
      )}
    </div>
  );
}
