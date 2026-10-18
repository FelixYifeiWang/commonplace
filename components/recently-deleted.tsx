"use client";
import { useState } from "react";
import type { Item } from "@/lib/types";
import { daysToRestore, itemAvailable } from "@/lib/item-retention.mjs";

export function RecentlyDeleted({
  items,
  onOpen,
  onRestore,
}: {
  items: Item[];
  onOpen: (item: Item) => void;
  onRestore: (item: Item) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = items.filter((item) => item.deletedAt && itemAvailable(item));
  return (
    <details className="settings-section recently-deleted">
      <summary>
        Recently deleted <span>{visible.length || ""}</span>
      </summary>
      <p className="section-description">Restore items for 30 days.</p>
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
      ) : (
        <p className="section-description">No deleted items.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
