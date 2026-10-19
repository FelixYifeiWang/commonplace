"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { imageSource } from "@/lib/media-source.mjs";
import { classifyImage, cutOut } from "@/lib/image-fit.mjs";
import type { Item } from "@/lib/types";
import { MediaCard } from "./media-card";

// Fitting is presentation-only. The saved original stays untouched, and images
// that cannot be read with normal CORS fall back to their original preview.
export function SheetMedia({
  item,
  screenshots = true,
}: {
  item: Item;
  screenshots?: boolean;
}) {
  const [fit, setFit] = useState<{
    source: string;
    url: string;
    kind: string;
  } | null>(null);
  const source = imageSource(item);
  const isStill =
    item.kind === "image" &&
    !/gif/i.test(item.mimeType || "") &&
    !/\.gif(?:[?#]|$)/i.test(item.imageUrl || item.title);
  useEffect(() => {
    if (!isStill || !source) return;
    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled || !image.naturalWidth) return;
      try {
        const scale = Math.min(
          1,
          960 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const classification = classifyImage(pixels);
        if (classification.kind === "page") return;
        if (classification.kind === "object") {
          const cut = cutOut(pixels);
          if (!cut.width || !cut.height) return;
          canvas.width = cut.width;
          canvas.height = cut.height;
          const output = context.createImageData(cut.width, cut.height);
          output.data.set(cut.data);
          context.putImageData(output, 0, 0);
        }
        setFit({
          source,
          kind: classification.kind,
          url: canvas.toDataURL("image/png"),
        });
      } catch {
        // A cross-origin or unsupported image still displays through MediaCard.
      }
    };
    image.src = source;
    return () => {
      cancelled = true;
      image.onload = null;
      image.src = "";
    };
  }, [source, isStill]);
  if (fit && fit.source === source)
    return (
      <Image
        className={`fitted-media fitted-${fit.kind}`}
        src={fit.url}
        width={960}
        height={720}
        alt={item.title}
        unoptimized
        draggable={false}
      />
    );
  return <MediaCard item={item} screenshots={screenshots} />;
}
