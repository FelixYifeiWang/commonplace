"use client";

import { useState } from "react";
import { Move, Scan } from "lucide-react";
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
      <SessionMap doc={doc} items={items} guided={!free} />
      <button
        type="button"
        className="map-navigation-toggle"
        aria-label={free ? "Switch to guided map" : "Switch to free movement"}
        aria-pressed={free}
        onClick={() => setFree((value) => !value)}
      >
        {free ? <Scan size={14} /> : <Move size={14} />}
        {free ? "Guided" : "Free move"}
      </button>
    </div>
  );
}
