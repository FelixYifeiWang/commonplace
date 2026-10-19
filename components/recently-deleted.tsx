"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
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
      <p className="section-description">
        Restore collections and items for 30 days.
      </p>
      {visibleCollections.map((c) => (
        <div className="setting-row" key={c.id}>
          <div className="trash-item-title">
            <strong>{c.name}</strong>
            <small>
              Collection · {daysToRestore(c.deletedAt)} days left
              {c.resumeOnRestore ? " · Restores and resumes syncing" : ""}
            </small>
          </div>
          {actions({ kind: "collection", value: c })}
        </div>
      ))}
      {visible.map((i) => (
        <div className="setting-row" key={i.id}>
          <button className="trash-item-title" onClick={() => onOpen(i)}>
            <strong>{i.title}</strong>
            <small>
              {i.collectionName} · {daysToRestore(i.deletedAt)} days left
            </small>
          </button>
          {actions({ kind: "item", value: i })}
        </div>
      ))}
      {!visible.length && !visibleCollections.length && (
        <p className="section-description">Trash is empty.</p>
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
