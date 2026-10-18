"use client";
import { buddyLink } from "@/lib/brand.mjs";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import { Modal } from "./modal";

const Nox = dynamic(() => import("./nox").then((module) => module.Nox), {
  ssr: false,
});

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
        Open Nox
      </button>
      {open && (
        <Modal
          title="Open Nox"
          className="nox-launch-dialog"
          onClose={() => setOpen(false)}
        >
          <span className="nox-launch-mark">
            <Nox size={48} />
          </span>
          <p className="nox-launch-description">
            Allow your browser to open the desktop app.
          </p>
          <div className="nox-launch-actions">
            <button
              className="text-button"
              onClick={() => {
                setOpen(false);
                onSetup();
              }}
            >
              Set up Nox
            </button>
            <button className="button primary" onClick={launch}>
              Try again <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
