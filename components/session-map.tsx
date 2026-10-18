"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import type { Item } from "@/lib/types";
import { pictureFor } from "@/lib/story-canvas.mjs";
import {
  placeMap,
  radialPath,
  zoomLevel,
  visibleSessionMap,
} from "@/lib/session-map.mjs";
import type { MapNode, SessionDocument } from "@/lib/session-types";
import { SheetMedia } from "./sheet-media";
import { ArrowLeft, ArrowRight, Move, Scan } from "lucide-react";
import { guidedBounds, guidedCamera } from "@/lib/guided-map.mjs";
// The Gallery tab: do's session map, curated by the model (STORY_CANVAS.md, "Gallery").
const screenshots = process.env.NEXT_PUBLIC_HOSTED !== "1";
const LEVELS = ["Overview", "Details", "Messages"];
const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'’‘.,!?…:;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
// Text wraps only at spaces and after / - _, never inside a word.
function soft(text: string) {
  return text
    .split(/(?<=[/_-])(?=\S)/)
    .flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));
}
type Engine = {
  focusNode: (i: number) => void;
  focusOn: (key: string) => void;
  zoomBy: (f: number) => void;
  reset: () => void;
  setMode: (guided: boolean) => void;
};
type Widget = {
  el: HTMLElement;
  ox: number;
  oy: number;
  node?: number;
  det: boolean;
  fixed: boolean;
  bubble: boolean;
  w: number;
  h: number;
  cy: number;
  x: number;
  y: number;
};
export function SessionMap({
  doc,
  items,
  guided = false,
  onToggleMode,
}: {
  doc: SessionDocument;
  items: Item[];
  guided?: boolean;
  onToggleMode?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null),
    worldRef = useRef<HTMLDivElement>(null),
    svgRef = useRef<SVGSVGElement>(null),
    levelRef = useRef<HTMLElement>(null),
    pctRef = useRef<HTMLElement>(null),
    dotsRef = useRef<HTMLSpanElement>(null),
    engine = useRef<Engine | null>(null);
  const modeRef = useRef(guided);
  const guidedFocus = useRef<{ nodeKey: string; detail?: string } | null>(null);
  const [focusedNode, setFocusedNode] = useState(-1);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const media = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const map = useMemo(
    () => visibleSessionMap(doc.map, items),
    [doc.map, items],
  );
  const nodes: MapNode[] = map.nodes.slice(0, 6);
  // Lines a story canvas already shows are not shown again on a tile; the tile shows its name instead.
  const shown = useMemo(
    () =>
      new Set(
        doc.steps.flatMap((s) => [
          ...(s.canvas.words?.form === "line"
            ? s.canvas.words.rows.map((r) => squash(r.text))
            : []),
          ...(s.canvas.quote?.text ? [squash(s.canvas.quote.text)] : []),
        ]),
      ),
    [doc],
  );
  useFonts(nodes);
  const nodeKey = (n: MapNode) => `${n.itemId || n.url || ""}:${n.label}`;
  // The story and items are polled every few seconds; lay out again only when their content changes,
  // so a refresh never undoes the viewer's zoom or drags.
  const docKey = JSON.stringify(map);
  const mediaKey = items.map((i) => `${i.id}:${i.imageUrl || ""}`).join("|");
  useEffect(() => {
    const stage = stageRef.current,
      world = worldRef.current,
      svg = svgRef.current;
    if (!stage || !world || !svg) return;
    const nodes: MapNode[] = JSON.parse(docKey).nodes.slice(0, 6);
    const W: Record<string, Widget> = {};
    world.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const key = el.dataset.key!;
      W[key] = {
        el,
        ox: 0,
        oy: 0,
        node: el.dataset.node ? Number(el.dataset.node) : undefined,
        det: key.startsWith("d"),
        fixed: !key.startsWith("d"),
        bubble: key.startsWith("b"),
        w: 0,
        h: 0,
        cy: 0,
        x: 0,
        y: 0,
      };
    });
    let guidedMode = modeRef.current;
    let freeStart: { z: number; px: number; py: number } | null = null;
    let glideTimer: ReturnType<typeof setTimeout> | undefined;
    let fit = 1,
      cx0 = 0,
      cy0 = 0,
      z = 1,
      px = 0,
      py = 0,
      moved = false,
      sx = 0,
      sy = 0,
      down = false,
      pd = 0,
      touched = false;
    let drag: {
      w: Widget;
      g: Widget[];
      sx: number;
      sy: number;
      lx: number;
      ly: number;
      on: boolean;
    } | null = null;
    const pts = new Map<number, PointerEvent>();
    const count = Object.keys(W).filter((k) => /^m\d+$/.test(k)).length;
    const detailsOf = (i: number) =>
      Object.keys(W).filter((k) => k.startsWith(`d${i}.`));
    const box = (w: Widget) => ({
      l: w.x - w.w / 2,
      r: w.x + w.w / 2,
      t: w.y - w.cy,
      b: w.y - w.cy + w.h,
    });
    // Every box is measured at the size it renders at the closest zoom, where quotes are visible.
    function measure() {
      const level = world!.dataset.lvl || "0";
      world!.dataset.lvl = "2";
      for (const w of Object.values(W)) {
        w.w = w.el.offsetWidth;
        w.h = w.el.offsetHeight;
        const p = w.el.querySelector<HTMLElement>(
          ":scope > .gm-pic, :scope > .gm-say, :scope > .gm-spec, :scope > .gm-box",
        );
        w.cy = p ? p.offsetTop + p.offsetHeight / 2 : w.h / 2;
      }
      world!.dataset.lvl = level;
    }
    function layout() {
      measure();
      const placed = placeMap(
        Object.fromEntries(
          Object.entries(W).map(([k, w]) => [
            k,
            {
              w: w.w,
              h: w.h,
              cy: w.cy,
              node: w.node,
              det: w.det,
              fixed: w.fixed,
              bubble: w.bubble,
            },
          ]),
        ),
        count,
      );
      for (const [k, p] of Object.entries(placed) as [
        string,
        { x: number; y: number },
      ][])
        Object.assign(W[k], { x: p.x, y: p.y });
      Object.values(W).forEach(place);
      measureFit();
    }
    function place(w: Widget) {
      w.el.style.left = `${w.x + w.ox}px`;
      w.el.style.top = `${w.y + w.oy - w.cy}px`;
    }
    const at = (w: Widget) => ({ x: w.x + w.ox, y: w.y + w.oy });
    // Lines end on the part of a bubble or detail that is visible at every zoom, measured live.
    function center(w: Widget) {
      const p = at(w);
      if (!(w.bubble || w.det)) return p;
      const a = w.det
        ? w.el.querySelector<HTMLElement>(":scope > .gm-pic, :scope > b")
        : null;
      const top = p.y - w.cy;
      return {
        x: p.x,
        y: top + (a ? a.offsetTop + a.offsetHeight / 2 : w.el.offsetHeight / 2),
      };
    }
    function measureFit() {
      let x0 = 0,
        y0 = 0,
        x1 = 0,
        y1 = 0;
      Object.values(W)
        .filter((w) => !w.det)
        .forEach((w) => {
          const b = box(w);
          x0 = Math.min(x0, b.l + w.ox);
          x1 = Math.max(x1, b.r + w.ox);
          y0 = Math.min(y0, b.t + w.oy);
          y1 = Math.max(y1, b.b + w.oy);
        });
      fit = Math.min(
        1.1,
        stage!.clientWidth / (x1 - x0 + 80),
        (stage!.clientHeight - 90) / (y1 - y0 + 60),
      );
      cx0 = (x0 + x1) / 2;
      cy0 = (y0 + y1) / 2;
    }
    function paths() {
      const lines: { d: string; c: string }[] = [];
      const selectedIndex = guidedFocus.current
        ? nodes.findIndex((n) => nodeKey(n) === guidedFocus.current!.nodeKey)
        : -1;
      for (let i = 0; i < count; i++) {
        const m = W["m" + i];
        if (!m || !W.core) continue;
        const highlight =
          guidedMode && i === selectedIndex ? " is-current" : "";
        lines.push({
          d: radialPath(at(W.core), at(m)),
          c: "trunk" + highlight,
        });
        if (W["b" + i])
          lines.push({
            d: radialPath(at(m), center(W["b" + i])),
            c: "bl" + highlight,
          });
        for (const key of detailsOf(i))
          lines.push({
            d: radialPath(at(m), center(W[key])),
            c: "det" + highlight,
          });
      }
      return lines;
    }
    function draw(rebuild: boolean) {
      const lines = paths();
      if (rebuild || svg!.children.length !== lines.length) {
        svg!.innerHTML = lines
          .map(
            (o, i) =>
              `<path pathLength="1" class="${o.c}" style="animation-delay:${(i * 0.05).toFixed(2)}s" d="${o.d}"/>`,
          )
          .join("");
        svg!.classList.add("anim");
      } else
        [...svg!.children].forEach((p, i) => {
          p.setAttribute("d", lines[i].d);
          p.setAttribute("class", lines[i].c);
        });
    }
    function view() {
      world!.style.transform = `translate(${stage!.clientWidth / 2 + px - cx0 * z}px,${(stage!.clientHeight - 60) / 2 + py - cy0 * z}px) scale(${z})`;
      // The dot grid is fixed to the stage: panning and dragging leave it still; zooming changes its spacing.
      stage!.style.setProperty("--ds", `${14 * (z / fit)}px`);
      stage!.style.setProperty("--dx", `${stage!.clientWidth / 2}px`);
      stage!.style.setProperty("--dy", `${stage!.clientHeight / 2}px`);
      const rel = z / fit,
        level = guidedMode ? (guidedFocus.current ? 2 : 0) : zoomLevel(rel);
      if (world!.dataset.lvl !== String(level)) {
        world!.dataset.lvl = String(level);
        draw(false);
      }
      if (levelRef.current) levelRef.current.textContent = LEVELS[level];
      if (pctRef.current)
        pctRef.current.textContent = `${Math.round(rel * 100)}%`;
      dotsRef.current
        ?.querySelectorAll("i")
        .forEach((e, i) => e.classList.toggle("on", i <= level));
    }
    function zoomAt(f: number, mx: number, my: number) {
      touched = true;
      const tx = stage!.clientWidth / 2 + px - cx0 * z,
        ty = (stage!.clientHeight - 60) / 2 + py - cy0 * z,
        nz = Math.max(fit * 0.7, Math.min(fit * 4.5, z * f));
      px += (mx - tx) * (1 - nz / z);
      py += (my - ty) * (1 - nz / z);
      z = nz;
      view();
    }
    function startGlide() {
      clearTimeout(glideTimer);
      world!.classList.add("glide");
      glideTimer = setTimeout(() => world!.classList.remove("glide"), 700);
    }
    function guidedFrame(key?: string, animate = true) {
      const selected = guidedFocus.current;
      const index = selected
        ? nodes.findIndex((n) => nodeKey(n) === selected.nodeKey)
        : -1;
      if (index < 0 && selected?.nodeKey !== "core") guidedFocus.current = null;
      const exactKey = key || (index >= 0 ? `m${index}` : null);
      setFocusedKey(exactKey);
      setFocusedNode(index);
      // The exact same three layers as free mode: output, references, evidence.
      world!.dataset.lvl = index < 0 ? "0" : "2";
      if (index < 0) delete world!.dataset.focus;
      else world!.dataset.focus = String(index);
      Object.entries(W).forEach(([widgetKey, w]) => {
        w.el.classList.toggle("gm-current", w.node === index && index >= 0);
        w.el.classList.toggle("gm-focused", widgetKey === exactKey);
        if (widgetKey === exactKey) w.el.setAttribute("aria-current", "true");
        else w.el.removeAttribute("aria-current");
      });
      let group = Object.values(W).filter((w) =>
        index < 0 ? !w.det : w.node === index,
      );
      if (key && W[key]) group = [W[key]];
      const camera = guidedCamera(guidedBounds(group), {
        width: stage!.clientWidth,
        height: stage!.clientHeight,
      });
      if (animate) startGlide();
      z = camera.scale;
      px = camera.x - stage!.clientWidth / 2 + cx0 * z;
      py = camera.y - (stage!.clientHeight - 60) / 2 + cy0 * z;
      view();
      draw(false);
    }
    function glideTo(wx: number, wy: number, nz: number) {
      touched = true;
      startGlide();
      z = nz;
      px = -(wx - cx0) * z;
      py = -(wy - cy0) * z;
      view();
    }
    const local = (e: { clientX: number; clientY: number }) => {
      const r = stage!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      if (guidedMode) return;
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      if (guidedMode || (e.target as Element).closest(".gm-toolbar")) return;
      clearTimeout(glideTimer);
      world!.classList.remove("glide");
      pts.set(e.pointerId, e);
      down = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      pd = 0;
      if ((e.pointerType === "mouse" && e.button) || pts.size > 1) return;
      const key = Object.keys(W).find((k) =>
        W[k].el.contains(e.target as Node),
      );
      if (!key) return;
      // Dragging a tile moves its bubble and details with it.
      const g = key.startsWith("m")
        ? Object.values(W).filter((w) => w.node === W[key].node)
        : [W[key]];
      drag = {
        w: W[key],
        g,
        sx: e.clientX,
        sy: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        on: false,
      };
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()],
          d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          r = stage!.getBoundingClientRect();
        if (pd)
          zoomAt(
            d / pd,
            (a.clientX + b.clientX) / 2 - r.left,
            (a.clientY + b.clientY) / 2 - r.top,
          );
        pd = d;
        moved = true;
        return;
      }
      if (drag) {
        if (!drag.on) {
          if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
          drag.on = true;
          moved = true;
          touched = true;
          drag.w.el.classList.add("gm-dragging");
        }
        const dx = (e.clientX - drag.lx) / z,
          dy = (e.clientY - drag.ly) / z;
        drag.lx = e.clientX;
        drag.ly = e.clientY;
        drag.g.forEach((w) => {
          w.ox += dx;
          w.oy += dy;
          place(w);
        });
        draw(false);
        return;
      }
      if (!down) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) {
        touched = true;
        px += dx;
        py += dy;
        sx = e.clientX;
        sy = e.clientY;
        view();
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (!pts.size) down = false;
      pd = 0;
      if (drag) {
        drag.w.el.classList.remove("gm-dragging");
        drag = null;
      }
    };
    // A drag or pan never counts as a click, so links don't open by accident.
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };
    // Pictures report their own shape once loaded; the map lays out again until the viewer has moved it.
    const onLoad = (e: Event) => {
      const img = e.target as HTMLImageElement;
      const pic = img.closest<HTMLElement>(".gm-pic");
      if (!pic || !img.naturalWidth) return;
      if (!pic.classList.contains("gm-page"))
        pic.style.setProperty(
          "--ar",
          String(
            Math.min(1.7, Math.max(0.55, img.naturalWidth / img.naturalHeight)),
          ),
        );
      if (guidedMode) {
        layout();
        guidedFrame(guidedFocus.current?.detail, false);
      } else if (!touched) {
        layout();
        z = fit;
        px = py = 0;
        view();
      }
      draw(false);
    };
    const resize = new ResizeObserver(() => {
      if (guidedMode) {
        layout();
        guidedFrame(guidedFocus.current?.detail, false);
      } else {
        measureFit();
        view();
      }
    });
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("click", onClick, true);
    world.addEventListener("load", onLoad, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    resize.observe(stage);
    engine.current = {
      setMode(next) {
        if (guidedMode === next) return;
        guidedMode = next;
        // Keep positions and camera alive. Free movement starts exactly where the tour left off.
        if (!next) {
          touched = true;
          freeStart = { z, px, py };
          delete world.dataset.focus;
          Object.values(W).forEach((w) => {
            w.el.classList.remove("gm-current", "gm-focused");
            w.el.removeAttribute("aria-current");
          });
          view();
          draw(false);
          return;
        }
        // A round trip without navigation keeps the exact same branch framing.
        if (
          freeStart &&
          freeStart.z === z &&
          freeStart.px === px &&
          freeStart.py === py
        ) {
          guidedFrame(guidedFocus.current?.detail);
          return;
        }
        // Rejoin the tour at the closest visible node, instead of flying back to the start.
        const cameraX = cx0 - px / z,
          cameraY = cy0 - py / z;
        const nearest = Object.entries(W)
          .filter(([, w]) => !w.det || zoomLevel(z / fit) >= 1)
          .sort(
            ([, a], [, b]) =>
              Math.hypot(center(a).x - cameraX, center(a).y - cameraY) -
              Math.hypot(center(b).x - cameraX, center(b).y - cameraY),
          )[0];
        if (z / fit < 1.2 || !nearest) {
          guidedFocus.current = null;
          guidedFrame();
        } else {
          engine.current?.focusOn(nearest[0]);
        }
      },
      focusNode(i) {
        if (moved || !nodes[i]) return;
        if (guidedMode) {
          guidedFocus.current = { nodeKey: nodeKey(nodes[i]) };
          guidedFrame();
          return;
        }
        const ps = Object.values(W)
          .filter((w) => w.node === i)
          .map(center);
        glideTo(
          ps.reduce((s, p) => s + p.x, 0) / ps.length,
          ps.reduce((s, p) => s + p.y, 0) / ps.length,
          fit * 1.9,
        );
      },
      focusOn(key) {
        if (moved || !W[key]) return;
        if (guidedMode) {
          if (key === "core") {
            guidedFocus.current = { nodeKey: "core", detail: "core" };
            guidedFrame("core");
            return;
          }
          const i = W[key].node;
          if (i !== undefined && nodes[i]) {
            guidedFocus.current = { nodeKey: nodeKey(nodes[i]), detail: key };
            guidedFrame(key);
          }
          return;
        }
        const p = center(W[key]);
        glideTo(p.x, p.y, fit * 2.8);
      },
      zoomBy(f) {
        zoomAt(f, stage.clientWidth / 2, stage.clientHeight / 2);
      },
      reset() {
        if (guidedMode) {
          guidedFocus.current = null;
          guidedFrame();
          return;
        }
        Object.values(W).forEach((w) => {
          w.ox = w.oy = 0;
          place(w);
        });
        touched = false;
        draw(false);
        z = fit;
        px = py = 0;
        view();
      },
    };
    layout();
    z = fit;
    view();
    draw(true);
    if (guidedMode) guidedFrame(guidedFocus.current?.detail, false);
    else {
      delete world.dataset.focus;
      Object.values(W).forEach((w) => w.el.classList.remove("gm-current"));
    }
    return () => {
      clearTimeout(glideTimer);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("click", onClick, true);
      world.removeEventListener("load", onLoad, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      resize.disconnect();
      engine.current = null;
    };
  }, [docKey, mediaKey]);
  useEffect(() => {
    modeRef.current = guided;
    engine.current?.setMode(guided);
  }, [guided]);
  const { center } = map;
  return (
    <section
      className={`gm${guided ? " gm-guided" : ""}`}
      aria-label={guided ? "Guided session map" : "Gallery: session map"}
    >
      <div
        className="gm-stage"
        ref={stageRef}
        tabIndex={guided ? 0 : undefined}
        onKeyDown={
          guided
            ? (event) => {
                if (
                  event.altKey ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey
                )
                  return;
                if (event.key === "Escape") engine.current?.reset();
                if (
                  (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                  nodes.length
                ) {
                  event.preventDefault();
                  const next =
                    focusedNode < 0
                      ? event.key === "ArrowRight"
                        ? 0
                        : nodes.length - 1
                      : (focusedNode +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          nodes.length) %
                        nodes.length;
                  engine.current?.focusNode(next);
                }
              }
            : undefined
        }
      >
        <div className="gm-world" ref={worldRef} data-lvl="0">
          <svg className="gm-lines" ref={svgRef} aria-hidden="true" />
          <Target
            url={center.url}
            focusFirst={guided && focusedKey !== "core"}
            className="gm-core"
            dataKey="core"
            label={center.label}
            onActivate={() =>
              guided ? engine.current?.focusOn("core") : engine.current?.reset()
            }
          >
            <span className="gm-box">
              <Ring />
            </span>
            <span className="gm-lbl">
              <b>
                {center.label}
                {center.url && (!guided || focusedKey === "core") ? " ↗" : ""}
              </b>
              Session output
            </span>
          </Target>
          {nodes.map((n, i) => (
            <Fragment key={`${i}-${n.label}`}>
              <Target
                url={n.url}
                focusFirst={guided && focusedKey !== `m${i}`}
                className={`gm-tile w-${n.weight}`}
                dataKey={`m${i}`}
                node={i}
                label={n.label}
                onActivate={() => engine.current?.focusNode(i)}
              >
                <Face
                  node={n}
                  item={n.itemId ? media.get(n.itemId) : undefined}
                  shown={shown}
                />
              </Target>
              <Target
                url={n.url}
                focusFirst={guided && focusedKey !== `b${i}`}
                className="gm-bubble"
                dataKey={`b${i}`}
                node={i}
                onActivate={() => engine.current?.focusOn(`b${i}`)}
              >
                <Sheet />
                <span className="gm-t">{soft(n.summary)}</span>
                <small>{soft(n.label)}</small>
              </Target>
              {n.details.slice(0, 3).map((d, j) => {
                const item = d.itemId ? media.get(d.itemId) : undefined;
                const picture = item && pictureOf(item);
                return (
                  <Target
                    key={j}
                    url={d.url}
                    focusFirst={guided && focusedKey !== `d${i}.${j}`}
                    className={`gm-detail ${picture ? "has-pic" : ""}`}
                    dataKey={`d${i}.${j}`}
                    node={i}
                    onActivate={() => engine.current?.focusOn(`d${i}.${j}`)}
                  >
                    {picture ? (
                      <>
                        <Picture
                          item={item!}
                          fit={picture.fit}
                          src={picture.src}
                        />
                        <span className="gm-cap">
                          <b>{soft(d.label)}</b>
                        </span>
                      </>
                    ) : (
                      <>
                        <Sheet />
                        <b>{soft(d.label)}</b>
                      </>
                    )}
                    <q>{soft(d.evidence.quote)}</q>
                  </Target>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="gm-toolbar" aria-label="Map controls">
          {guided ? (
            <nav className="gm-navigation" aria-label="Map navigation">
              <button
                type="button"
                aria-label="Previous node"
                onClick={() =>
                  engine.current?.focusNode(
                    focusedNode < 0
                      ? nodes.length - 1
                      : (focusedNode - 1 + nodes.length) % nodes.length,
                  )
                }
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => engine.current?.reset()}
                aria-label="Show map overview"
              >
                {focusedNode >= 0 && (
                  <span className="gm-node-count">
                    {focusedNode + 1} / {nodes.length} ·{" "}
                  </span>
                )}
                Overview
              </button>
              <button
                type="button"
                aria-label="Next node"
                onClick={() =>
                  engine.current?.focusNode((focusedNode + 1) % nodes.length)
                }
              >
                <ArrowRight size={15} />
              </button>
            </nav>
          ) : (
            <div className="gm-zoom" title="Scroll to zoom, drag to move">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => engine.current?.zoomBy(1 / 1.35)}
              >
                −
              </button>
              <span className="gm-dots" ref={dotsRef}>
                <i />
                <i />
                <i />
              </span>
              <span className="gm-level">
                <b ref={levelRef}>Overview</b> <em ref={pctRef}>100%</em>
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => engine.current?.zoomBy(1.35)}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Reset layout"
                title="Reset layout"
                onClick={() => engine.current?.reset()}
              >
                ↺
              </button>
            </div>
          )}
          {onToggleMode && (
            <>
              <span className="gm-toolbar-divider" aria-hidden="true" />
              <div
                className="map-mode-switch"
                role="group"
                aria-label="Map navigation"
              >
                <button
                  type="button"
                  aria-label="Guided map"
                  aria-pressed={guided}
                  onClick={() => !guided && onToggleMode()}
                >
                  <Scan size={13} /> Guided
                </button>
                <button
                  type="button"
                  aria-label="Free movement"
                  aria-pressed={!guided}
                  onClick={() => guided && onToggleMode()}
                >
                  <Move size={13} /> Free
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
// A reference opens its site in a new tab; anything else zooms to itself. Nothing opens a pop-up.
function Target({
  url,
  focusFirst = false,
  className,
  dataKey,
  node,
  label,
  onActivate,
  children,
}: {
  url: string | null;
  focusFirst?: boolean;
  className: string;
  dataKey: string;
  node?: number;
  label?: string;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const common = {
    className,
    "data-key": dataKey,
    "data-node": node,
    "aria-label": label,
  };
  return url ? (
    <a
      {...common}
      href={focusFirst ? undefined : url}
      target="_blank"
      rel="noopener noreferrer"
      role={focusFirst ? "button" : undefined}
      tabIndex={0}
      onClick={
        focusFirst
          ? (event) => {
              event.preventDefault();
              onActivate?.();
            }
          : undefined
      }
      onKeyDown={
        focusFirst
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate?.();
              }
            }
          : undefined
      }
    >
      {children}
    </a>
  ) : (
    <button type="button" {...common} onClick={onActivate}>
      {children}
    </button>
  );
}
function Sheet() {
  return (
    <span className="gm-sheet" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
// A still image is fitted in the browser (an object is cut out, ink blends in); a link shows its page.
function pictureOf(item: Item) {
  if (item.kind === "image" && (item.fileKey || item.imageUrl))
    return { fit: "fit", src: "" };
  return pictureFor(item, { screenshots });
}
function Picture({ item, fit, src }: { item: Item; fit: string; src: string }) {
  return (
    <span
      className={`gm-pic gm-${fit}`}
      style={{ "--ar": fit === "page" ? 1.5 : 1 } as CSSProperties}
    >
      <Sheet />
      {fit === "fit" ? (
        <SheetMedia item={item} screenshots={screenshots} />
      ) : (
        <Image
          unoptimized
          width={600}
          height={400}
          src={src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  );
}
// A tile shows its picture, a live specimen for a typeface, or the node's quote (its name if the Story shows it).
function Face({
  node,
  item,
  shown,
}: {
  node: MapNode;
  item?: Item;
  shown: Set<string>;
}) {
  if (node.font)
    return (
      <span className="gm-spec">
        <Sheet />
        <span
          className="gm-txt"
          style={{ fontFamily: `'${node.font.family}', monospace` }}
        >
          {node.font.sample.split(/\s+/).map((w, i) => (
            <Fragment key={i}>
              {i ? <br /> : null}
              {w}
            </Fragment>
          ))}
        </span>
      </span>
    );
  const picture = item && pictureOf(item);
  if (picture)
    return <Picture item={item!} fit={picture.fit} src={picture.src} />;
  const quote = node.evidence?.quote;
  const say = quote && !shown.has(squash(quote)) ? `“${quote}”` : node.label;
  return (
    <span className="gm-say">
      <Sheet />
      <span className="gm-txt">{soft(say)}</span>
    </span>
  );
}
function Ring() {
  return (
    <svg width="62" height="62" viewBox="-32 -32 64 64" aria-hidden="true">
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return (
          <circle
            key={`a${i}`}
            cx={(Math.cos(a) * 20).toFixed(1)}
            cy={(Math.sin(a) * 20).toFixed(1)}
            r="2.2"
            fill="currentColor"
          />
        );
      })}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <circle
            key={`b${i}`}
            cx={(Math.cos(a) * 29).toFixed(1)}
            cy={(Math.sin(a) * 29).toFixed(1)}
            r=".9"
            fill="currentColor"
            opacity=".45"
          />
        );
      })}
    </svg>
  );
}
// A typography node is set in its own font, loaded by the family name the session used.
function useFonts(nodes: MapNode[]) {
  const families = nodes
    .map((n) => n.font?.family)
    .filter((f): f is string => !!f && /^[\p{L}\p{N} ]{1,40}$/u.test(f));
  const key = families.join("|");
  useEffect(() => {
    for (const family of key ? key.split("|") : []) {
      const id = `gm-font-${family.replace(/\s+/g, "-")}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
      document.head.appendChild(link);
    }
  }, [key]);
}
