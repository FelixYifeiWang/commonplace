"use client";
import { buddyLink } from "@/lib/brand.mjs";
import { useState } from "react";
import { Modal } from "./modal";

export function OpenBuddy({ onSetup }: { onSetup: () => void }) {
  const [open, setOpen] = useState(false);
  function launch() {
    // This link only opens the installed app. It never pairs or subscribes.
    window.location.href = buddyLink(window.location.origin);
  }
  return (
    <>
      <button
        className="text-button open-buddy"
        onClick={() => {
          setOpen(true);
          launch();
        }}
      >
        Open buddy
      </button>
      {open && (
        <Modal title="Open buddy" onClose={() => setOpen(false)}>
          <p className="modal-description">
            Allow your browser to open Newron.
          </p>
          <div className="buddy-launch-actions">
            <button className="button primary" onClick={launch}>
              Open again
            </button>
            <button
              className="text-button"
              onClick={() => {
                setOpen(false);
                onSetup();
              }}
            >
              Nothing opened? Set up buddy
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
