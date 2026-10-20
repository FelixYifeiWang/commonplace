"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";
import type { SessionDocument } from "@/lib/session-types";
import { SessionMap } from "./session-map";

// Both modes render the same map. The toggle changes only its camera controls; Dev mode opens guided, a
// curated map opens free.
export function DevSessionMap({
  doc,
  items,
  initialFree = false,
}: {
  doc: SessionDocument;
  items: Item[];
  initialFree?: boolean;
}) {
  const [free, setFree] = useState(initialFree);
  return (
    <div className="dev-map">
      <SessionMap
        doc={doc}
        items={items}
        guided={!free}
        onToggleMode={() => setFree((value) => !value)}
      />
    </div>
  );
}
