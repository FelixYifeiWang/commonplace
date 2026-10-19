"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Gallery } from "./gallery";
import { SessionView } from "./session-view";
import { Modal } from "./modal";
import { MediaDetail } from "./media-card";
import type { Collection, Item } from "@/lib/types";
import {
  readWorkspaceNavigation,
  workspaceNavigationUrl,
} from "@/lib/workspace-navigation.mjs";
type View = "map" | "gallery" | "story";
type SharedData = { collection: Collection; items: Item[] };
const noAdd = () => {};
const noSave = async () => {};
export function SharedCollection({
  initial,
  initialView,
  initialDev,
}: {
  initial: SharedData;
  initialView: View;
  initialDev: boolean;
}) {
  const [data, setData] = useState(initial),
    [view, setView] = useState<View>(initialView),
    [dev, setDev] = useState(initialDev),
    [detail, setDetail] = useState<Item | null>(null),
    [unavailable, setUnavailable] = useState(false);
  const id = initial.collection.id;
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch(`/api/shared/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) {
          setUnavailable(true);
          return;
        }
        if (response.ok) {
          setData(await response.json());
          setUnavailable(false);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          console.warn("Shared collection refresh unavailable", error);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void refresh(), 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        const target = event.target as HTMLElement;
        if (
          target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        )
          return;
        event.preventDefault();
        setDev((value) => !value);
        setView(dev ? "map" : "gallery");
      }
    };
    const pop = () => {
      const state = readWorkspaceNavigation(window.location.href);
      setDev(state.devMode);
      setView(state.view as View);
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("popstate", pop);
    };
  }, [dev]);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      workspaceNavigationUrl(window.location.href, {
        selected: id,
        screen: "collection",
        view,
        devMode: dev,
      }),
    );
  }, [id, view, dev]);
  return (
    <div className="workspace shared-workspace">
      <header className="minimal-header">
        <Link href="/" className="minimal-home" aria-label="Newron">
          <Image
            src="/nox.svg"
            alt=""
            width={34}
            height={34}
            className="brand-nox"
          />
        </Link>
        <span className="shared-collection-title" title={data.collection.name}>
          {data.collection.name}
        </span>
        <div
          className="channel-view-switch"
          role="group"
          aria-label="Collection view"
        >
          {(dev
            ? (["gallery", "map", "story"] as const)
            : (["map", "story"] as const)
          ).map((option) => (
            <button
              key={option}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === "map" && !dev
                ? "Gallery"
                : option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
        <div className="workspace-actions">
          <span className="shared-collection-label">View only</span>
        </div>
      </header>
      <main className={view === "map" ? "map-main" : undefined}>
        {unavailable ? (
          <div className="session-await">
            <p>Collection unavailable.</p>
          </div>
        ) : view === "gallery" ? (
          <Gallery
            items={data.items}
            onOpen={setDetail}
            onDelete={noSave}
            onAdd={noAdd}
            onQuickAdd={noSave}
            canAdd={false}
            readOnly
          />
        ) : (
          <SessionView
            key={id}
            collectionId={id}
            name={data.collection.name}
            items={data.items}
            mode={view === "story" ? "story" : "gallery"}
            onOpen={setDetail}
            devMode={dev}
            shared
          />
        )}
      </main>
      {!unavailable &&
        detail &&
        data.items.some((item) => item.id === detail.id) && (
          <Modal title={detail.title} onClose={() => setDetail(null)} wide>
            <MediaDetail
              item={data.items.find((item) => item.id === detail.id) || detail}
            />
            {detail.url && (
              <a
                className="text-link"
                href={detail.url}
                target="_blank"
                rel="noreferrer"
              >
                Open original <ExternalLink size={13} />
              </a>
            )}
          </Modal>
        )}
    </div>
  );
}
