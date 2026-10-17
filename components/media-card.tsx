"use client";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
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
  const element = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    still = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false),
    [motion, setMotion] = useState(false),
    [near, setNear] = useState(false),
    [embedActive, setEmbedActive] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (hover && motion) {
      void video.current?.play().catch(() => {});
      const timer = setTimeout(() => setEmbedActive(true), 400);
      return () => clearTimeout(timer);
    }
    video.current?.pause();
    if (video.current) video.current.currentTime = 0;
  }, [hover, motion]);
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
    near &&
    item.kind === "link" &&
    !!item.url &&
    /^[0-9a-f-]{36}$/.test(item.id) &&
    !pageFailed;
  const mediaUrl = item.fileKey ? `/api/files/${item.id}` : item.url;
  const directVideo =
    item.kind === "video" &&
    mediaUrl &&
    (item.fileKey || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaUrl));
  const embed = item.kind === "video" && item.url ? embedFor(item.url) : null;
  const gif =
    item.kind === "image" &&
    (item.mimeType === "image/gif" || /\.gif(\?|$)/i.test(cover || item.title));
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
      ref={element}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setEmbedActive(false);
      }}
      className={`block-preview ${hover && motion ? "motion-active" : ""} ${gif ? "is-gif" : ""} block-${item.kind} ${hasImage ? "has-cover" : ""} ${pageLoaded && page ? "has-screenshot" : ""}`}
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
          onLoad={(e) => {
            if (gif && still.current) {
              const img = e.currentTarget;
              still.current.width = img.naturalWidth;
              still.current.height = img.naturalHeight;
              still.current.getContext("2d")?.drawImage(img, 0, 0);
            }
          }}
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
      {gif && hasImage && (
        <canvas ref={still} className="gif-still" aria-hidden="true" />
      )}
      {directVideo && near && (
        <video
          ref={video}
          className={`hover-video ${hover && motion ? "playing" : ""}`}
          src={mediaUrl!}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={`Preview ${item.title}`}
        />
      )}
      {embed && hover && embedActive && motion && (
        <iframe
          className="hover-embed"
          src={`${embed}?autoplay=1&mute=1&muted=1&controls=0&playsinline=1`}
          title={`Preview ${item.title}`}
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="no-referrer"
          tabIndex={-1}
        />
      )}
      {page && (
        <Image
          className={`page-screenshot ${pageLoaded ? "loaded" : ""}`}
          unoptimized
          width={960}
          height={720}
          src={`/api/screenshots/${item.id}?v=2`}
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
