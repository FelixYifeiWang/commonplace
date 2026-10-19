"use client";
import { useState } from "react";
import type { Item, Collection } from "@/lib/types";
import { daysToRestore, itemAvailable } from "@/lib/item-retention.mjs";

export function RecentlyDeleted({
  items,
  collections,
  onRestoreCollection,
  onOpen,
  onRestore,
}: {
  items: Item[];
  collections: Collection[];
  onRestoreCollection: (collection: Collection) => Promise<void>;
  onOpen: (item: Item) => void;
  onRestore: (item: Item) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = items.filter((item) => item.deletedAt && itemAvailable(item));
  const visibleCollections = collections.filter(
    (c) => c.deletedAt && itemAvailable(c),
  );
  return (
    <section className="recently-deleted" aria-label="Trash">
      <p className="section-description">
        Restore collections and items for 30 days.
      </p>
      {visibleCollections.map((collection) => (
        <div className="setting-row" key={collection.id}>
          <div className="trash-item-title">
            <strong>{collection.name}</strong>
            <small>
              Collection · {daysToRestore(collection.deletedAt)} days left
              {collection.resumeOnRestore
                ? " · Restores and resumes syncing"
                : ""}
            </small>
          </div>
          <button
            className="text-button"
            aria-label={`Restore ${collection.name}`}
            disabled={busy !== null}
            onClick={async () => {
              setBusy(collection.id);
              setError("");
              try {
                await onRestoreCollection(collection);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not restore.");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === collection.id ? "Restoring…" : "Restore"}
          </button>
        </div>
      ))}
      {visible.length ? (
        visible.map((item) => (
          <div className="setting-row" key={item.id}>
            <button className="trash-item-title" onClick={() => onOpen(item)}>
              <strong>{item.title}</strong>
              <small>
                {item.collectionName} · {daysToRestore(item.deletedAt)} days
                left
              </small>
            </button>
            <button
              className="text-button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(item.id);
                setError("");
                try {
                  await onRestore(item);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not restore.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === item.id ? "Restoring…" : "Restore"}
            </button>
          </div>
        ))
      ) : !visibleCollections.length ? (
        <p className="section-description">Trash is empty.</p>
      ) : null}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
