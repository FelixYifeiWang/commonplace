"use client";
import Image from "next/image";
import { useState } from "react";

// Reserve the canvas slot before bytes arrive. Keying readiness by URL also
// makes a failed cover's screenshot fallback show a fresh loading state.
export function PreviewImage({
  src,
  alt = "",
  onError,
  loading = "lazy",
}: {
  src: string;
  alt?: string;
  onError: () => void;
  loading?: "eager" | "lazy";
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = loaded === src;
  return (
    <span
      className={`preview-frame ${ready ? "is-ready" : "is-loading"}`}
      aria-busy={!ready}
    >
      {!ready && (
        <span
          className="preview-pending"
          role="status"
          aria-label="Loading preview"
        >
          <span>Loading…</span>
        </span>
      )}
      <Image
        unoptimized
        width={1200}
        height={750}
        src={src}
        alt={alt}
        loading={loading}
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(src)}
        onError={onError}
      />
    </span>
  );
}
