"use client";
import { useState } from "react";
import {
  Trash2,
  Layers2,
  Image as ImageIcon,
  FileText,
  Link2,
} from "lucide-react";
import type { Item, Collection } from "@/lib/types";
import { daysToRestore, itemAvailable } from "@/lib/item-retention.mjs";
import { Modal } from "./modal";

type Target =
  { kind: "collection"; value: Collection } | { kind: "item"; value: Item };
export function RecentlyDeleted({
  items,
  collections,
  onRestoreCollection,
  onOpen,
  onRestore,
  onDeleteCollection,
  onDeleteItem,
}: {
  items: Item[];
  collections: Collection[];
  onRestoreCollection: (collection: Collection) => Promise<void>;
  onOpen: (item: Item) => void;
  onRestore: (item: Item) => Promise<void>;
  onDeleteCollection: (collection: Collection) => Promise<void>;
  onDeleteItem: (item: Item) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Target | null>(null);
  const visible = items.filter((i) => i.deletedAt && itemAvailable(i));
  const visibleCollections = collections.filter(
    (c) => c.deletedAt && itemAvailable(c),
  );
  const empty = !visible.length && !visibleCollections.length;
  function retention(deletedAt: string) {
    const days = daysToRestore(deletedAt);
    return (
      <span className="trash-retention">
        {days} {days === 1 ? "day" : "days"} left
      </span>
    );
  }
  async function perform(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }
  function actions(target: Target) {
    const { value, kind } = target;
    const name = kind === "collection" ? target.value.name : target.value.title;
    return (
      <div className="trash-actions">
        <button
          className="text-button"
          aria-label={`Restore ${name}`}
          disabled={busy !== null}
          onClick={() =>
            void perform(value.id, () =>
              kind === "collection"
                ? onRestoreCollection(target.value)
                : onRestore(target.value),
            )
          }
        >
          {busy === value.id && !confirm ? "Restoring…" : "Restore"}
        </button>
        <button
          className="icon-button trash-delete"
          aria-label={`Delete ${name} permanently`}
          title="Delete permanently"
          disabled={busy !== null}
          onClick={() => {
            setError("");
            setConfirm(target);
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }
  return (
    <section className="recently-deleted" aria-label="Trash">
      {!empty && (
        <p className="utility-description">
          Restore within 30 days, or delete permanently.
        </p>
      )}
      {visibleCollections.length > 0 && (
        <section
          className="trash-section"
          aria-labelledby="trash-collections-heading"
        >
          <h2 id="trash-collections-heading">
            Collections{" "}
            <span className="section-count">{visibleCollections.length}</span>
          </h2>
          <div className="utility-list">
            {visibleCollections.map((c) => (
              <div className="trash-row" key={c.id}>
                <span className="utility-row-icon" aria-hidden="true">
                  <Layers2 size={19} strokeWidth={1.5} />
                </span>
                <div className="trash-item-title">
                  <strong title={c.name}>{c.name}</strong>
                  <small>
                    {c.resumeOnRestore
                      ? "Resumes syncing when restored"
                      : c.frozenAt
                        ? "Disconnected"
                        : "Saved collection"}
                  </small>
                </div>
                {retention(c.deletedAt!)}
                {actions({ kind: "collection", value: c })}
              </div>
            ))}
          </div>
        </section>
      )}
      {visible.length > 0 && (
        <section
          className="trash-section"
          aria-labelledby="trash-items-heading"
        >
          <h2 id="trash-items-heading">
            Items <span className="section-count">{visible.length}</span>
          </h2>
          <div className="utility-list">
            {visible.map((i) => (
              <div className="trash-row" key={i.id}>
                <span className="utility-row-icon" aria-hidden="true">
                  {i.kind === "image" ? (
                    <ImageIcon size={19} strokeWidth={1.5} />
                  ) : i.kind === "link" ? (
                    <Link2 size={19} strokeWidth={1.5} />
                  ) : (
                    <FileText size={19} strokeWidth={1.5} />
                  )}
                </span>
                <button className="trash-item-title" onClick={() => onOpen(i)}>
                  <strong title={i.title}>{i.title}</strong>
                  <small>{i.collectionName || "Saved item"}</small>
                </button>
                {retention(i.deletedAt!)}
                {actions({ kind: "item", value: i })}
              </div>
            ))}
          </div>
        </section>
      )}
      {empty && (
        <div className="utility-empty">
          <Trash2 size={24} strokeWidth={1.25} aria-hidden="true" />
          <h2>Nothing in Trash</h2>
          <p>Deleted collections and items stay here for 30 days.</p>
        </div>
      )}
      {error && !confirm && <p role="alert">{error}</p>}
      {confirm && (
        <Modal
          title="Delete permanently?"
          className="disconnect-dialog"
          onClose={() => {
            if (!busy) {
              setConfirm(null);
              setError("");
            }
          }}
        >
          <p className="disconnect-copy">
            <strong>
              {confirm.kind === "collection"
                ? confirm.value.name
                : confirm.value.title}
            </strong>
          </p>
          <p className="disconnect-copy">
            {confirm.kind === "collection"
              ? "This removes the collection and disconnects its session."
              : "This removes the item from Newron."}{" "}
            Your coding session is unchanged.
          </p>
          <p className="disconnect-copy">
            <strong>This cannot be undone.</strong>
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="disconnect-actions">
            <button
              className="text-button"
              data-autofocus
              disabled={busy !== null}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="button primary permanent-delete-confirm"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  await perform(confirm.value.id, () =>
                    confirm.kind === "collection"
                      ? onDeleteCollection(confirm.value)
                      : onDeleteItem(confirm.value),
                  )
                )
                  setConfirm(null);
              }}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
