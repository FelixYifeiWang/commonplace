"use client";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckSquare2,
  Grid2X2,
  Layers2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Item } from "@/lib/types";
import { filterItems, groupItems, sourceHost } from "@/lib/gallery.mjs";
import { MediaCard } from "./media-card";
import { Modal } from "./modal";
type Group = { key: string; title: string; topic: boolean; items: Item[] };
export function Gallery({
  items,
  onOpen,
  onGroup,
  onAdd,
}: {
  items: Item[];
  onOpen: (item: Item) => void;
  onGroup: (ids: string[], name: string) => Promise<void>;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [site, setSite] = useState("all"),
    [grouped, setGrouped] = useState(true),
    [active, setActive] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [groupModal, setGroupModal] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [screenshots, setScreenshots] = useState(true);
  const sites = useMemo(
    () => [...new Set(items.map(sourceHost).filter(Boolean))].sort(),
    [items],
  );
  const allGroups: Group[] = groupItems(items, true);
  const activeGroup = allGroups.find((g) => g.key === active);
  const filtered = filterItems(activeGroup?.items || items, {
    query,
    type,
    site,
  }) as Item[];
  const groups: Group[] = groupItems(
    filtered,
    grouped && !activeGroup && !selecting,
  );
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((i) => i !== id) : [...s, id],
    );
  return (
    <section className="gallery" aria-label="Saved sources">
      <div className="gallery-tools">
        {activeGroup ? (
          <button className="gallery-back" onClick={() => setActive(null)}>
            <ArrowLeft size={15} />
            <span>{activeGroup.title}</span>
            <small>{activeGroup.items.length}</small>
          </button>
        ) : (
          <span className="gallery-count">
            {items.length} {items.length === 1 ? "block" : "blocks"}
          </span>
        )}
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
              {(type !== "all" || site !== "all") && <i />}
            </summary>
            <div className="gallery-filter-panel">
              <label>
                Type
                <select
                  aria-label="Media type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="all">Everything</option>
                  <option value="link">Websites</option>
                  <option value="image">Images</option>
                  <option value="text">Text</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="file">Files</option>
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
            className="gallery-tool"
            aria-label={grouped ? "Show individual blocks" : "Group by website"}
            title={grouped ? "Show individual blocks" : "Group by website"}
            onClick={() => {
              setGrouped(!grouped);
              setActive(null);
            }}
          >
            {grouped ? <Layers2 size={16} /> : <Grid2X2 size={16} />}
          </button>
          <button
            className={`gallery-tool ${selecting ? "active" : ""}`}
            aria-label={
              selecting ? "Cancel selection" : "Select blocks to group"
            }
            title="Select blocks to group"
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
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
            disabled={!selected.length}
            onClick={() => {
              setError("");
              setGroupModal(true);
            }}
          >
            Group
          </button>
          <button
            disabled={!selected.length || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onGroup(selected, "");
                setSelected([]);
                setSelecting(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not ungroup.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Ungroup
          </button>
        </div>
      )}
      {error && !groupModal && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {groups.length ? (
        <div className="gallery-grid">
          {groups.map((group) => {
            const stack = group.items.length > 1,
              item = group.items[0];
            return (
              <button
                className={`gallery-card ${stack ? "is-stack" : ""} ${selected.includes(item.id) ? "is-selected" : ""}`}
                key={group.key}
                aria-label={
                  stack
                    ? `Open ${group.title}, ${group.items.length} sources`
                    : item.title
                }
                aria-pressed={
                  selecting ? selected.includes(item.id) : undefined
                }
                onClick={() =>
                  selecting
                    ? toggle(item.id)
                    : stack
                      ? setActive(group.key)
                      : onOpen(item)
                }
              >
                <div className="gallery-card-art">
                  {stack && (
                    <>
                      <div className="stack-sheet stack-back">
                        <MediaCard
                          item={group.items[2] || group.items[1]}
                          screenshots={false}
                        />
                      </div>
                      <div className="stack-sheet stack-middle">
                        <MediaCard item={group.items[1]} screenshots={false} />
                      </div>
                    </>
                  )}
                  <div className="stack-front">
                    <MediaCard
                      key={item.id}
                      item={item}
                      screenshots={screenshots}
                    />
                  </div>
                  {selecting && (
                    <span className="block-select">
                      {selected.includes(item.id) && <Check size={13} />}
                    </span>
                  )}
                  {stack && (
                    <span className="stack-count">
                      <Layers2 size={12} />
                      {group.items.length}
                    </span>
                  )}
                </div>
                <div className="gallery-caption">
                  <span>{stack ? group.title : item.title}</span>
                  <small>
                    {stack
                      ? group.topic
                        ? "Group"
                        : "Site"
                      : sourceHost(item) ||
                        (
                          {
                            note: "Text",
                            idea: "Text",
                            quote: "Text",
                          } as Record<string, string>
                        )[item.kind] ||
                        item.kind}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="gallery-empty">
          {items.length ? (
            <>
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
            </>
          ) : (
            <button onClick={onAdd}>+ Add a block</button>
          )}
        </div>
      )}
      {groupModal && (
        <Modal
          title="Group blocks"
          onClose={() => {
            if (!saving) setGroupModal(false);
          }}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name") || "",
              ).trim();
              if (!name) return;
              setSaving(true);
              try {
                await onGroup(selected, name);
                setGroupModal(false);
                setSelecting(false);
                setSelected([]);
                setActive(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not group.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <input
              name="name"
              aria-label="Group name"
              placeholder="A person, a topic, a thread…"
              required
              maxLength={100}
              autoFocus
            />
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={saving}>
              {saving ? "Grouping…" : "Group"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
