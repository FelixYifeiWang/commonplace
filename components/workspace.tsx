"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plus,
  Unplug,
  Monitor,
  Trash2,
  Radio,
  Star,
} from "lucide-react";
import type {
  Collection,
  Item,
  ItemKind,
  Session,
  WorkspaceData,
} from "@/lib/types";
import { MAX_FAVORITES, overlayFavorites } from "@/lib/favorites.mjs";
import { SAMPLE } from "@/lib/sample";
import { sessionLabel } from "./buddy";
import { MediaDetail } from "./media-card";
import { CollectionPicker } from "./collection-picker";
import { parseBlockInput } from "@/lib/gallery.mjs";
import { Gallery } from "./gallery";
import { SessionView } from "./session-view";
import { MediaCard } from "./media-card";
import { AddBlock } from "./add-block";
import { AccountControls, AccountTransition } from "./account-controls";
import { Modal } from "./modal";
import { OpenBuddy } from "./open-buddy";
import { SetupDialog } from "./setup-dialog";
import { RecentlyDeleted } from "./recently-deleted";
import { itemAvailable } from "@/lib/item-retention.mjs";

const EMPTY: WorkspaceData = {
  collections: [],
  sessions: [],
  items: [],
  devices: [],
  user: null,
};
async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Please sign in to connect your space.");
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function Logo() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}
function Provider({ name }: { name: string }) {
  return (
    <span
      className={`provider-icon provider-${name.toLowerCase().replace(" ", "-")}`}
      aria-hidden="true"
    >
      {name === "Claude Code"
        ? "✳"
        : name === "Codex"
          ? "⌘"
          : name === "Cursor"
            ? "◈"
            : "↗"}
    </span>
  );
}

export default function Workspace({
  initialDemo = false,
}: {
  initialDemo?: boolean;
}) {
  const demo = initialDemo;
  const [data, setData] = useState<WorkspaceData>(() =>
      initialDemo ? structuredClone(SAMPLE) : EMPTY,
    ),
    [ready, setReady] = useState(initialDemo),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(initialDemo ? "c1" : "all"),
    [screen, setScreen] = useState<"collection" | "trash" | "settings">(
      "collection",
    );
  const [modal, setModal] = useState<
      "setup" | "connect" | "collection" | "item" | null
    >(null),
    [detail, setDetail] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [modalError, setModalError] = useState("");
  // Dev mode reveals the item grid and guided map for this workspace visit.
  const [view, setView] = useState<"gallery" | "map" | "story">("map");
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    const toggleDevMode = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "g" &&
        !target.closest("input,textarea,[contenteditable=true]")
      ) {
        event.preventDefault();
        if (event.repeat) return;
        setView(devMode ? "map" : "gallery");
        setDevMode(!devMode);
      }
    };
    window.addEventListener("keydown", toggleDevMode);
    return () => window.removeEventListener("keydown", toggleDevMode);
  }, [devMode]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [droppedText, setDroppedText] = useState("");
  const [undo, setUndo] = useState<{
    kind: "items" | "collection";
    ids: string[];
    previous?: WorkspaceData;
  } | null>(null);
  const favoriteRevision = useRef(0);
  const favoritePending = useRef(new Map<string, boolean>());
  const previewBusy = useRef(false);
  const refresh = useCallback(async () => {
    const revision = favoriteRevision.current;
    try {
      const result = await api<WorkspaceData>("/api/workspace");
      setData((current) =>
        overlayFavorites(
          revision === favoriteRevision.current
            ? result
            : {
                ...result,
                collections: result.collections.map((c) => ({
                  ...c,
                  favorite:
                    current.collections.find((old) => old.id === c.id)
                      ?.favorite ?? c.favorite,
                })),
              },
          favoritePending.current,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your space.");
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    api<WorkspaceData>("/api/workspace")
      .then((result) => {
        if (!cancelled) {
          setData(overlayFavorites(result, favoritePending.current));
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Unable to load your space.",
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);
  useEffect(() => {
    if (demo) return;
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [demo, refresh]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(
      () => {
        setToast("");
        setUndo(null);
      },
      undo ? 15000 : 3500,
    );
    return () => clearTimeout(id);
  }, [toast, undo]);
  useEffect(() => {
    if (demo || previewBusy.current) return;
    const pending = data.items
      .filter((item) => item.url && item.previewStatus === "pending")
      .slice(0, 4);
    if (!pending.length) return;
    previewBusy.current = true;
    void api("/api/previews", "POST", { ids: pending.map((item) => item.id) })
      .then(() => refresh())
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Preview unavailable."),
      )
      .finally(() => {
        previewBusy.current = false;
      });
  }, [data.items, demo, refresh]);
  const collections = [...data.collections].sort(
    (a, b) =>
      Number(!!b.favorite) - Number(!!a.favorite) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  const hasBuddy = data.devices.some((device) => !device.revoked);
  const connectionLabel = hasBuddy ? "Connect a session" : "Set up Nox";
  const allItems =
    selected === "all"
      ? data.items
      : data.items.filter((i) => i.collectionId === selected);
  const visibleItems = [...allItems].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  function openModal(value: typeof modal) {
    setDroppedFiles([]);
    setDroppedText("");
    setModalError("");
    setModal(value === "connect" && !hasBuddy ? "setup" : value);
  }
  function chooseCollection(id: string) {
    setSelected(id);
    setScreen("collection");
  }
  async function sessionAction(
    session: Session,
    action: "pause" | "resume" | "revoke",
  ) {
    try {
      if (demo) {
        setData((d) => ({
          ...d,
          sessions: d.sessions.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  state:
                    action === "pause"
                      ? "paused"
                      : action === "revoke"
                        ? "revoked"
                        : "following",
                }
              : s,
          ),
        }));
      } else {
        await api("/api/sessions", "PATCH", { id: session.id, action });
        await refresh();
      }
      setToast(
        action === "pause"
          ? "Session paused."
          : action === "resume"
            ? "Ready for new updates."
            : "Session disconnected. Your ideas stay here.",
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not update session.");
    }
  }
  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setModalError("");
    try {
      const payload = {
        name: String(form.get("name")),
        description: String(form.get("description")),
      };
      if (demo) {
        const c = {
          ...payload,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        setData((d) => ({ ...d, collections: [...d.collections, c] }));
        setSelected(c.id);
      } else {
        const c = await api<Collection>("/api/collections", "POST", payload);
        await refresh();
        setSelected(c.id);
      }
      setModal(null);
      setScreen("collection");
      setToast("A new place to collect.");
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "Could not create collection.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveBlock(payload: Record<string, unknown>) {
    if (demo) {
      if (payload.fileKey)
        throw new Error("Use your local space to upload files.");
      const now = new Date().toISOString();
      const item = {
        ...payload,
        id: crypto.randomUUID(),
        sessionId: null,
        kind: payload.kind as ItemKind,
        imageUrl: null,
        sourceText: String(payload.body || payload.url || payload.title),
        sourceRole: "user",
        sourceTurn: "",
        inferred: false,
        createdAt: now,
        updatedAt: now,
      } as Item;
      setData((d) => ({ ...d, items: [item, ...d.items] }));
    } else {
      await api("/api/items", "POST", payload);
      await refresh();
    }
  }
  async function deleteBlocks(ids: string[]) {
    const previous = demo ? structuredClone(data) : undefined;
    if (!demo) await api("/api/items", "DELETE", { ids });
    setData((d) => ({
      ...d,
      recentlyDeleted: [
        ...d.items
          .filter((i) => ids.includes(i.id))
          .map((i) => ({
            ...i,
            deletedAt: new Date().toISOString(),
            collectionName: d.collections.find((c) => c.id === i.collectionId)
              ?.name,
          })),
        ...(d.recentlyDeleted || []),
      ],
      items: d.items.filter((i) => !ids.includes(i.id)),
    }));
    setDetail(null);
    setUndo({ kind: "items", ids, previous });
    setToast(`${ids.length} ${ids.length === 1 ? "block" : "blocks"} deleted`);
  }
  async function restoreItem(item: Item) {
    if (!demo) {
      await api("/api/items", "PATCH", { action: "restore", ids: [item.id] });
      await refresh();
    } else
      setData((d) => ({
        ...d,
        items: [{ ...item, deletedAt: null }, ...d.items],
        recentlyDeleted: (d.recentlyDeleted || []).filter(
          (i) => i.id !== item.id,
        ),
      }));
    setDetail(null);
    setToast("Item restored");
  }
  async function favoriteCollection(collection: Collection) {
    if (favoritePending.current.has(collection.id)) return;
    const favorite = !collection.favorite;
    if (
      favorite &&
      data.collections.filter((c) => c.favorite).length >= MAX_FAVORITES
    ) {
      setToast("You can star up to five collections.");
      return;
    }
    favoriteRevision.current++;
    favoritePending.current.set(collection.id, favorite);
    setData((d) => overlayFavorites(d, favoritePending.current));
    try {
      if (!demo)
        await api("/api/collections", "PATCH", {
          id: collection.id,
          action: "favorite",
          favorite,
        });
    } catch (e) {
      setData((d) => ({
        ...d,
        collections: d.collections.map((c) =>
          c.id === collection.id
            ? { ...c, favorite: !!collection.favorite }
            : c,
        ),
      }));
      setError(e instanceof Error ? e.message : "Could not save favorite.");
    } finally {
      favoriteRevision.current++;
      favoritePending.current.delete(collection.id);
    }
  }
  async function deleteCollection(id: string) {
    try {
      const previous = demo ? structuredClone(data) : undefined;
      if (!demo) await api("/api/collections", "DELETE", { id });
      setData((d) => ({
        ...d,
        collections: d.collections.filter((c) => c.id !== id),
        items: d.items.filter((i) => i.collectionId !== id),
        sessions: d.sessions.filter((s) => s.collectionId !== id),
      }));
      if (selected === id) chooseCollection("all");
      setUndo({ kind: "collection", ids: [id], previous });
      setToast("Collection deleted · disconnected");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not delete collection.");
    }
  }
  async function undoDelete() {
    if (!undo) return;
    try {
      if (demo && undo.previous) setData(undo.previous);
      else {
        await api(
          undo.kind === "items" ? "/api/items" : "/api/collections",
          "PATCH",
          {
            action: "restore",
            ...(undo.kind === "items"
              ? { ids: undo.ids }
              : { id: undo.ids[0] }),
          },
        );
        await refresh();
      }
      setToast(
        undo.kind === "collection"
          ? "Collection restored · disconnected"
          : "Blocks restored",
      );
      setUndo(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not restore.");
    }
  }
  function addFromGallery(drop?: { files?: File[]; text?: string }) {
    if (!collections.length) {
      openModal("collection");
      return;
    }
    setDroppedFiles(drop?.files || []);
    setDroppedText(drop?.text || "");
    setModal("item");
  }
  function renderSession(session: Session, compact = false) {
    const count = data.items.filter((i) => i.sessionId === session.id).length;
    return (
      <div
        className={`session-row ${compact ? "compact" : ""}`}
        data-session-id={session.id}
        key={session.id}
      >
        <Provider name={session.provider} />
        <div className="session-row-main">
          <strong>{session.title}</strong>
          <span>
            {session.provider}
            <i>·</i>
            {count} {count === 1 ? "idea" : "ideas"} collected
          </span>
        </div>
        <span className={`session-status ${session.state}`}>
          <i />
          {sessionLabel(
            session.state,
            demo ? new Date().toISOString() : session.lastSeen,
          )}
        </span>
        {session.state !== "revoked" && (
          <div className="session-actions">
            <button
              className="icon-button"
              aria-label={`${session.state === "paused" ? "Resume" : "Pause"} ${session.title}`}
              onClick={() =>
                void sessionAction(
                  session,
                  session.state === "paused" ? "resume" : "pause",
                )
              }
            >
              {session.state === "paused" ? (
                <Play size={14} />
              ) : (
                <Pause size={14} />
              )}
            </button>
            <button
              className="icon-button"
              aria-label={`Disconnect ${session.title}`}
              onClick={() => void sessionAction(session, "revoke")}
            >
              <Unplug size={14} />
            </button>
          </div>
        )}
      </div>
    );
  }

  const itemGrid = (
    <Gallery
      key={selected}
      items={visibleItems}
      onOpen={setDetail}
      onDelete={deleteBlocks}
      canAdd={collections.length > 0}
      onQuickAdd={(text) =>
        saveBlock({
          ...parseBlockInput(text),
          collectionId: selected === "all" ? collections[0]?.id : selected,
        })
      }
      onAdd={addFromGallery}
    />
  );
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        if (!modal) e.preventDefault();
      }}
      onDrop={(e) => {
        if (modal || !collections.length) return;
        e.preventDefault();
        setDroppedFiles(Array.from(e.dataTransfer.files));
        setDroppedText(
          e.dataTransfer.files.length
            ? ""
            : e.dataTransfer.getData("text/uri-list") ||
                e.dataTransfer.getData("text/plain"),
        );
        setModal("item");
      }}
    >
      <div className="workspace">
        <header className="minimal-header">
          <button
            className="minimal-home"
            aria-label="All collections"
            onClick={() => chooseCollection("all")}
          >
            <Logo />
          </button>
          <CollectionPicker
            collections={collections}
            selected={selected}
            screen={screen}
            onChoose={chooseCollection}
            onManage={setScreen}
            onFavorite={(c) => void favoriteCollection(c)}
            onDelete={(id) => void deleteCollection(id)}
          />
          {screen === "collection" && selected !== "all" && (
            <div
              className="channel-view-switch"
              role="group"
              aria-label="Collection view"
            >
              {(devMode
                ? (["gallery", "map", "story"] as const)
                : (["map", "story"] as const)
              ).map((option) => (
                <button
                  key={option}
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                >
                  {option === "map" && !devMode
                    ? "Gallery"
                    : option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          )}
          {demo && (
            <Link className="minimal-demo" href="/">
              Example
            </Link>
          )}
          <div className="workspace-actions">
            {!demo && ready && data.user && (
              <OpenBuddy onSetup={() => openModal("setup")} />
            )}
            {(screen !== "collection" || selected === "all") && (
              <button
                className="button new-collection"
                onClick={() => openModal("collection")}
              >
                <Plus size={16} strokeWidth={1.5} />
                <span>New collection</span>
              </button>
            )}
          </div>
        </header>
        {!demo &&
          process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "1" &&
          data.user && <AccountTransition onLinked={refresh} />}
        <main
          className={
            screen === "collection" && view === "map" && selected !== "all"
              ? "map-main"
              : undefined
          }
        >
          {!ready ? (
            <div className="loading-state">
              <Loader2 className="spin" size={18} aria-label="Loading" />
            </div>
          ) : error && !data.user ? (
            <div className="welcome">
              <a className="button primary" href="/sign-in" target="_top">
                {process.env.NEXT_PUBLIC_HOSTED === "1"
                  ? "Sign in"
                  : "Continue with ChatGPT"}{" "}
                <ArrowRight size={15} />
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                  <button onClick={() => void refresh()}>Try again</button>
                </div>
              )}
              {screen === "collection" && !collections.length && !demo && (
                <div className="welcome first-collection">
                  <h1>Your first collection</h1>
                  <p>Add things yourself, or connect a session with Nox.</p>
                  <div className="first-collection-actions">
                    <button
                      className="button primary"
                      onClick={() => openModal("collection")}
                    >
                      Create collection
                    </button>
                    {hasBuddy ? (
                      <OpenBuddy onSetup={() => openModal("setup")} />
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => openModal("setup")}
                      >
                        Set up Nox
                      </button>
                    )}
                  </div>
                </div>
              )}
              {screen === "collection" &&
                selected !== "all" &&
                (view === "gallery" ? (
                  itemGrid
                ) : (
                  <SessionView
                    key={`${selected}-${view}`}
                    collectionId={selected}
                    name={
                      collections.find((c) => c.id === selected)?.name ||
                      "Untitled"
                    }
                    mode={view === "map" ? "gallery" : "story"}
                    devMode={devMode}
                    items={[
                      ...visibleItems,
                      ...(data.recentlyDeleted || []).filter(
                        (i) => i.collectionId === selected && itemAvailable(i),
                      ),
                    ]}
                    onOpen={setDetail}
                    demo={demo}
                  />
                ))}
              {screen === "collection" &&
                selected === "all" &&
                collections.length > 0 && (
                  <div className="collection-overview">
                    {collections.map((collection) => {
                      const covers = data.items
                        .filter(
                          (item) =>
                            item.collectionId === collection.id &&
                            (item.imageUrl ||
                              (item.fileKey && item.kind === "image")),
                        )
                        .slice(0, 3);
                      return (
                        <div
                          className="collection-overview-card"
                          key={collection.id}
                        >
                          <button
                            className="collection-cover"
                            onClick={() => chooseCollection(collection.id)}
                          >
                            <span className="collection-cover-sheet soft-sheet">
                              {covers.length ? (
                                covers.map((item) => (
                                  <span key={item.id}>
                                    <MediaCard
                                      item={item}
                                      screenshots={false}
                                    />
                                  </span>
                                ))
                              ) : (
                                <span className="collection-cover-empty">
                                  {collection.name.slice(0, 1)}
                                </span>
                              )}
                            </span>
                            <span>{collection.name}</span>
                          </button>
                          <button
                            className="collection-favorite"
                            aria-label={`${collection.favorite ? "Unfavorite" : "Favorite"} ${collection.name}`}
                            aria-pressed={!!collection.favorite}
                            onClick={() => void favoriteCollection(collection)}
                          >
                            <Star
                              size={15}
                              fill={
                                collection.favorite ? "currentColor" : "none"
                              }
                            />
                          </button>
                          <button
                            className="collection-overview-delete"
                            aria-label={`Delete ${collection.name}`}
                            title="Delete and disconnect collection"
                            onClick={() => void deleteCollection(collection.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              {screen === "trash" && (
                <>
                  <div className="page-heading">
                    <h1>Trash</h1>
                  </div>
                  <RecentlyDeleted
                    items={data.recentlyDeleted || []}
                    onOpen={setDetail}
                    onRestore={restoreItem}
                  />
                </>
              )}
              {screen === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>Settings</h1>
                    </div>
                  </div>
                  <section className="settings-section">
                    <h2>Your account</h2>
                    <div className="setting-row">
                      <span className="space-avatar">
                        {data.user?.displayName.slice(0, 1) || "Y"}
                      </span>
                      <div>
                        <strong>
                          {demo ? "Example space" : data.user?.displayName}
                        </strong>
                        <p>
                          {demo
                            ? "A sample collection. Your real space starts empty."
                            : data.user?.email}
                        </p>
                      </div>
                      {!demo &&
                      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "1" ? (
                        <AccountControls />
                      ) : demo ? (
                        <Link className="button subtle" href="/">
                          Open my space
                        </Link>
                      ) : (
                        <a
                          className="text-button"
                          href="/signout-with-chatgpt?return_to=%2F"
                          target="_top"
                        >
                          Sign out <ArrowUpRight size={13} />
                        </a>
                      )}
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-heading">
                      <h2>Connections</h2>
                      <button
                        className="text-button"
                        onClick={() => openModal("connect")}
                      >
                        <Plus size={15} />
                        {connectionLabel}
                      </button>
                    </div>
                    <div className="sessions-table">
                      <div className="table-label">
                        <span>YOUR SESSIONS</span>
                        <span>{data.sessions.length} connected</span>
                      </div>
                      {data.sessions.length ? (
                        data.sessions.map((s) => renderSession(s))
                      ) : (
                        <div className="empty-sessions">
                          <Radio size={26} strokeWidth={1} />
                          <h3>No sessions</h3>
                          <button
                            className="button subtle"
                            onClick={() => openModal("connect")}
                          >
                            {connectionLabel} <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-heading">
                      <h2>Connected computers</h2>
                      <button
                        className="text-button"
                        onClick={() => openModal("setup")}
                      >
                        <Plus size={13} />
                        Connect a computer
                      </button>
                    </div>
                    <OpenBuddy onSetup={() => openModal("setup")} />
                    <p className="section-description">
                      One connection per computer. Your companion remembers it
                      for next time.
                    </p>
                    {data.devices.filter((d) => !d.revoked).length ? (
                      data.devices
                        .filter((d) => !d.revoked)
                        .map((device) => (
                          <div className="setting-row" key={device.id}>
                            <Monitor size={19} />
                            <div>
                              <strong>{device.name}</strong>
                              <p>
                                {device.lastSeen
                                  ? "Connected to your space"
                                  : "Waiting for your companion to connect"}
                              </p>
                            </div>
                            <button
                              className="text-button danger"
                              onClick={async () => {
                                try {
                                  await api("/api/devices", "DELETE", {
                                    id: device.id,
                                  });
                                  await refresh();
                                  setToast("Computer disconnected.");
                                } catch (e) {
                                  setToast(
                                    e instanceof Error
                                      ? e.message
                                      : "Could not disconnect.",
                                  );
                                }
                              }}
                            >
                              Disconnect
                            </button>
                          </div>
                        ))
                    ) : (
                      <div className="setting-row">
                        <Monitor size={20} />
                        <p>No computers connected yet.</p>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={14} />
          {toast}
          {undo && <button onClick={() => void undoDelete()}>Undo</button>}
        </div>
      )}
      {(modal === "connect" || modal === "setup") && (
        <SetupDialog
          key={modal}
          mode={modal}
          demo={demo}
          onClose={() => setModal(null)}
          onConnect={() => setModal("connect")}
        />
      )}

      {modal === "collection" && (
        <Modal title="New collection" onClose={() => setModal(null)}>
          <form onSubmit={createCollection} className="form">
            <label>
              Collection name
              <input
                name="name"
                placeholder="Untitled"
                maxLength={100}
                required
                autoFocus
              />
            </label>
            <label>
              Description <span>optional</span>
              <textarea
                name="description"
                placeholder="Description"
                maxLength={500}
              />
            </label>
            {modalError && (
              <p className="form-error" role="alert">
                {modalError}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Creating..." : "Create collection"}
              <ArrowRight size={14} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "item" && (
        <AddBlock
          allowFiles={!demo}
          collections={collections}
          collectionId={selected === "all" ? collections[0]?.id : selected}
          initialFiles={droppedFiles}
          initialText={droppedText}
          onSave={saveBlock}
          onClose={() => setModal(null)}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          {detail.deletedAt ? (
            <div className="deleted-item-notice">
              <span>Recently deleted</span>
              <button
                className="text-button"
                onClick={() =>
                  void restoreItem(detail).catch((e) => setToast(e.message))
                }
              >
                Restore
              </button>
            </div>
          ) : (
            <button
              className="detail-delete"
              aria-label="Delete block"
              onClick={() =>
                void deleteBlocks([detail.id]).catch((e) => setToast(e.message))
              }
            >
              <Trash2 size={15} />
            </button>
          )}
          <MediaDetail
            item={data.items.find((item) => item.id === detail.id) || detail}
          />
          {detail.inferred && (
            <p className="minimal-inference">AI interpretation</p>
          )}
          {detail.url && (
            <a
              className="text-link"
              href={detail.url}
              target="_blank"
              rel="noreferrer"
            >
              Open original <ExternalLink size={13} />
            </a>
          )}
          <details className="minimal-source">
            <summary>Source</summary>
            <blockquote>{detail.sourceText}</blockquote>
          </details>
        </Modal>
      )}
    </div>
  );
}
