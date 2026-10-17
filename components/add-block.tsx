"use client";
import { useRef, useState } from "react";
import { ArrowUp, FilePlus2, Paperclip, X } from "lucide-react";
import { parseBlockInput } from "@/lib/gallery.mjs";
import type { Collection } from "@/lib/types";
import { Modal } from "./modal";
export function AddBlock({
  collections,
  collectionId,
  initialFiles = [],
  initialText = "",
  allowFiles = true,
  onSave,
  onClose,
}: {
  collections: Collection[];
  collectionId: string;
  initialFiles?: File[];
  initialText?: string;
  allowFiles?: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText),
    [files, setFiles] = useState(initialFiles),
    [collection, setCollection] = useState(collectionId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const append = (newFiles: File[]) => {
    setFiles((f) => [...f, ...newFiles]);
    setError("");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (files.length && !allowFiles)
        throw new Error("Open your local space to save files.");
      for (const file of files) {
        if (file.size > 250 * 1024 * 1024)
          throw new Error(`${file.name} exceeds 250 MB.`);
        const auth = await fetch("/api/uploads", { method: "POST" });
        if (!auth.ok) throw new Error("Could not prepare upload.");
        const ticket = (await auth.json()) as { url: string };
        const uploaded = await fetch(ticket.url, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        });
        if (!uploaded.ok) throw new Error(`Could not upload ${file.name}.`);
        const data = (await uploaded.json()) as { key: string };
        await onSave({
          fileKey: data.key,
          title: file.name,
          collectionId: collection,
        });
        setFiles((current) => current.filter((f) => f !== file));
      }
      if (text.trim()) {
        await onSave({ ...parseBlockInput(text), collectionId: collection });
        setText("");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add block"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className={`add-block-form ${over ? "drag-over" : ""}`}
        onSubmit={submit}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length)
            append(Array.from(e.dataTransfer.files));
          else
            setText(
              e.dataTransfer.getData("text/uri-list") ||
                e.dataTransfer.getData("text/plain"),
            );
        }}
      >
        <textarea
          aria-label="Block content"
          placeholder="Paste a link, write a thought, or drop a file."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          maxLength={12000}
          disabled={busy}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              append(Array.from(e.clipboardData.files));
            }
          }}
        />
        {files.length > 0 && (
          <div className="add-files">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`}>
                <FilePlus2 size={16} />
                <span>{file.name}</span>
                <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  onClick={() =>
                    setFiles((f) => f.filter((_, i) => i !== index))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="add-block-bottom">
          <button
            type="button"
            className="gallery-tool"
            title="Choose files"
            aria-label="Choose files"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              append(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <select
            aria-label="Save to collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            disabled={busy}
          >
            {collections.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="add-block-submit"
            aria-label="Save block"
            disabled={busy || (!files.length && !text.trim())}
          >
            {busy ? <span className="saving-dot" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
