"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  LayoutGrid,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { Collection } from "@/lib/types";
export function CollectionPicker({
  collections,
  selected,
  screen,
  onChoose,
  onManage,
  onDelete,
  onFavorite,
}: {
  collections: Collection[];
  selected: string;
  screen: string;
  onChoose: (id: string) => void;
  onManage: (screen: "trash" | "settings") => void;
  onDelete: (id: string) => void;
  onFavorite: (collection: Collection) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const title =
    screen === "trash"
      ? "Trash"
      : screen === "settings"
        ? "Settings"
        : collections.find((c) => c.id === selected)?.name || "Collections";
  function choose(id: string) {
    onChoose(id);
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }
  return (
    <div
      className="channel-picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="channel-picker-trigger"
        aria-label="Choose collection"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      >
        <span>{title}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="channel-menu" role="dialog" aria-label="Collections">
          <label className="channel-search">
            <Search size={14} />
            <input
              aria-label="Find collection"
              placeholder="Find a collection…"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="collection-menu-overview">
            <button className="channel-menu-all" onClick={() => choose("all")}>
              <LayoutGrid size={14} />
              <span>All collections</span>
              {selected === "all" && screen === "collection" && (
                <Check size={13} />
              )}
            </button>
          </div>
          <div className="channel-menu-list">
            {collections
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <div className="channel-menu-row" key={c.id}>
                  <button onClick={() => choose(c.id)} title={c.name}>
                    <span>{c.name}</span>
                    {selected === c.id && screen === "collection" && (
                      <Check size={13} />
                    )}
                  </button>
                  <button
                    className="channel-favorite"
                    aria-label={`${c.favorite ? "Unfavorite" : "Favorite"} ${c.name}`}
                    aria-pressed={!!c.favorite}
                    onClick={() => onFavorite(c)}
                  >
                    <Star
                      size={13}
                      fill={c.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    className="channel-delete"
                    title="Delete and disconnect collection"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => {
                      setOpen(false);
                      onDelete(c.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>
          <div className="channel-menu-footer">
            <button
              onClick={() => {
                setOpen(false);
                onManage("trash");
              }}
            >
              Trash
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onManage("settings");
              }}
            >
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
