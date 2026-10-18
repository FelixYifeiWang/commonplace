"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";
import type { SessionDocument } from "@/lib/session-types";
import { SessionMap } from "./session-map";

// Both modes render the same map. The toggle changes only its camera controls.
export function DevSessionMap({
  doc,
  items,
}: {
  doc: SessionDocument;
  items: Item[];
}) {
  const [free, setFree] = useState(false);
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
