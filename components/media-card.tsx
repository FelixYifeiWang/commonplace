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
export function MediaCard({
  item,
  screenshots = true,
}: {
  item: Item;
  screenshots?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const cover =
    item.fileKey && item.kind === "image"
      ? `/api/files/${item.id}`
      : item.imageUrl;
  const hasImage = !!cover && failed !== cover;
  const [pageLoaded, setPageLoaded] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const page =
    screenshots &&
    item.kind === "link" &&
    !!item.url &&
    /^[0-9a-f-]{36}$/.test(item.id) &&
    !pageFailed;
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
      className={`block-preview block-${item.kind} ${hasImage ? "has-cover" : ""} ${pageLoaded && page ? "has-screenshot" : ""}`}
    >
      {hasImage ? (
        <Image
          unoptimized
          width={600}
          height={600}
          src={cover!}
          alt={item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(cover)}
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
      {page && (
        <Image
          className={`page-screenshot ${pageLoaded ? "loaded" : ""}`}
          unoptimized
          width={960}
          height={720}
          src={`/api/screenshots/${item.id}`}
          alt={`Page preview of ${item.title}`}
          loading="lazy"
          onLoad={() => setPageLoaded(true)}
          onError={() => setPageFailed(true)}
        />
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
  const mediaUrl = item.fileKey ? `/api/files/${item.id}` : item.url;
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
        mediaUrl &&
        (item.fileKey || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaUrl)) ? (
        <video
          className="media-player"
          src={mediaUrl!}
          controls
          preload="metadata"
        />
      ) : item.kind === "audio" && mediaUrl ? (
        <div className="audio-detail">
          <Music2 size={40} strokeWidth={1} />
          <audio src={mediaUrl!} controls preload="metadata" />
        </div>
      ) : item.kind === "document" && mediaUrl ? (
        <object
          className="document-player"
          data={mediaUrl!}
          type="application/pdf"
        >
          <a href={mediaUrl!} target="_blank" rel="noreferrer">
            Open document
          </a>
        </object>
      ) : item.imageUrl ||
        (item.fileKey && item.kind === "image") ||
        item.kind === "link" ? (
        <div className="media-detail-cover">
          <MediaCard item={item} />
        </div>
      ) : null}
      {item.fileKey && (
        <a className="text-link file-download" href={mediaUrl!} download>
          Download file <ArrowUpRight size={13} />
        </a>
      )}
      {item.body && <p className="minimal-detail-body">{item.body}</p>}
    </>
  );
}
