"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Modal } from "./modal";
type Ticket = { link: string; setupId: string; expiresAt: number };
export function SetupDialog({
  mode,
  demo,
  onClose,
  onConnect,
}: {
  mode: "setup" | "connect";
  demo: boolean;
  onClose: () => void;
  onConnect: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ticket || demo || status !== "waiting") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (Date.now() >= ticket!.expiresAt) {
          setStatus("expired");
          setTicket(null);
          return;
        }
        const r = await fetch(`/api/setup?id=${ticket!.setupId}`, {
          cache: "no-store",
        });
        const result = (await r.json()) as { status?: string; error?: string };
        if (cancelled) return;
        if (!r.ok)
          throw new Error(result.error || "Could not check setup. Try again.");
        if (result.status === "ready") {
          setStatus("ready");
          setError("");
          return;
        }
        if (result.status === "expired") {
          setStatus("expired");
          setTicket(null);
          return;
        }
        setError("");
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not check setup.");
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ticket, demo, status]);
  async function copy() {
    setStatus("copying");
    setError("");
    try {
      let next = ticket;
      if (!next || next.expiresAt <= Date.now()) {
        if (demo) throw new Error("Open your own space to set up the buddy.");
        const r = await fetch("/api/setup", { method: "POST" });
        const result = (await r.json()) as Ticket & { error?: string };
        if (!r.ok) throw new Error(result.error || "Could not start setup.");
        next = result as Ticket;
        setTicket(next);
      }
      const link =
        mode === "setup"
          ? next.link
          : next.link.replace("/setup.md#", "/connect#");
      await navigator.clipboard.writeText(
        `${mode === "setup" ? "Set up" : "Connect"} ${link}`,
      );
      setStatus("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy. Try again.");
      setStatus("idle");
    }
  }
  const ready = status === "ready";
  return (
    <Modal
      title={
        ready
          ? mode === "setup"
            ? "Buddy ready"
            : "Session connected"
          : mode === "setup"
            ? "Set up buddy"
            : "Connect a session"
      }
      onClose={onClose}
    >
      {ready ? (
        <>
          <p className="setup-description">
            {mode === "setup"
              ? "Open a conversation in Codex or Claude desktop. Move the buddy over it, click it, then Connect."
              : "Your collection will update as you work."}
          </p>
          <button className="button primary full" onClick={onClose}>
            Done
          </button>
          {mode === "setup" && (
            <button
              className="setup-alternative text-button"
              onClick={onConnect}
            >
              Using Cursor or a terminal? Connect with a prompt
            </button>
          )}
        </>
      ) : (
        <>
          <p className="setup-description">
            {mode === "setup"
              ? "Copy this prompt into Codex, Claude Code, or Cursor. Your agent will install and open the buddy."
              : "Paste this prompt into the conversation you want to save."}
          </p>
          <button
            className="button primary full"
            onClick={() => void copy()}
            disabled={status === "copying"}
          >
            {status === "copying" ? (
              <Loader2 size={15} className="spin" />
            ) : status === "waiting" ? (
              <Check size={15} />
            ) : (
              <Copy size={15} />
            )}
            {status === "waiting"
              ? "Copy again"
              : status === "expired"
                ? "Copy a new prompt"
                : "Copy prompt"}
          </button>
          <p className="setup-progress" role="status">
            {status === "waiting" ? (
              <>
                <Loader2 size={12} className="spin" />{" "}
                {mode === "setup"
                  ? "Paste in your agent. Waiting for setup…"
                  : "Waiting for your agent…"}
              </>
            ) : status === "expired" ? (
              "This prompt expired. Copy a new one."
            ) : mode === "setup" ? (
              "Mac only · one-time setup"
            ) : (
              "Codex · Claude Code · Cursor"
            )}
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
