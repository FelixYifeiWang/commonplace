"use client";
import Image from "next/image";
import { useState } from "react";
import { FileText, Play, Music2, ArrowUpRight, File } from "lucide-react";
import type { Item } from "@/lib/types";
import { embedFor } from "@/lib/media.mjs";
function hostname(url: string | null) {
  try {
    return new URL(url || "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function MediaCard({ item }: { item: Item }) {
  const [failed, setFailed] = useState<string | null>(null);
  const hasImage = !!item.imageUrl && failed !== item.imageUrl;
  const text = ["note", "idea", "quote"].includes(item.kind);
  const Icon =
    item.kind === "video"
      ? Play
      : item.kind === "audio"
        ? Music2
        : item.kind === "document"
          ? FileText
          : File;
  return (
    <div
      className={`block-preview block-${item.kind} ${hasImage ? "has-cover" : ""}`}
    >
      {hasImage ? (
        <Image
          unoptimized
          width={600}
          height={600}
          src={item.imageUrl!}
          alt={item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(item.imageUrl)}
        />
      ) : text ? (
        <div className="block-text">
          {item.kind === "quote" ? "“" : ""}
          {item.body || item.title}
          {item.kind === "quote" ? "”" : ""}
        </div>
      ) : (
        <div className="block-fallback">
          {item.kind !== "link" && <Icon size={28} strokeWidth={1} />}
          <p>{item.title}</p>
          {item.body && <span className="block-description">{item.body}</span>}
          <span>{hostname(item.url)}</span>
        </div>
      )}
      {item.kind === "video" && hasImage && (
        <span className="block-play">
          <Play size={22} fill="currentColor" />
        </span>
      )}
      {item.previewStatus === "pending" && !hasImage && (
        <span className="block-loading" aria-label="Loading preview" />
      )}
      {!text && (
        <div className="block-caption">
          <span>{item.title}</span>
          <ArrowUpRight size={12} />
        </div>
      )}
    </div>
  );
}
export function MediaDetail({ item }: { item: Item }) {
  const embed = item.url ? embedFor(item.url) : null;
  return (
    <>
      {item.kind === "video" && embed ? (
        <iframe
          className="media-player"
          src={embed}
          title={item.title}
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      ) : item.kind === "video" &&
        item.url &&
        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url) ? (
        <video
          className="media-player"
          src={item.url}
          controls
          preload="metadata"
        />
      ) : item.kind === "audio" && item.url ? (
        <div className="audio-detail">
          <Music2 size={40} strokeWidth={1} />
          <audio src={item.url} controls preload="metadata" />
        </div>
      ) : item.kind === "document" && item.url ? (
        <object
          className="document-player"
          data={item.url}
          type="application/pdf"
        >
          <a href={item.url} target="_blank" rel="noreferrer">
            Open document
          </a>
        </object>
      ) : item.imageUrl ? (
        <div className="media-detail-cover">
          <MediaCard item={item} />
        </div>
      ) : null}
      {item.body && <p className="minimal-detail-body">{item.body}</p>}
    </>
  );
}
