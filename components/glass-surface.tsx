"use client";
/*
 * Glass Surface, adapted from React Bits (https://reactbits.dev/components/glass-surface).
 * Trimmed to the SVG refraction path and its frosted fallback; the WebGL and custom-shape renderers are left out.
 *
 * MIT + Commons Clause License Condition v1.0
 * Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, and distribute the Software as part of an application, website,
 * or product, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 *
 * Commons Clause Restriction: You may use this Software, including for any commercial purpose, so long as you do
 * not sell, sublicense, or redistribute the components themselves, whether alone, in a bundle, or as a ported
 * version.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";

type Channel = "R" | "G" | "B";
// Chromium (and so Electron) can refract through an SVG backdrop filter; Safari and Firefox get frosted glass.
// Support never changes on a page, so it is read once; the server renders nothing until the browser answers.
let refraction: boolean | undefined;
function supportsRefraction() {
  if (refraction === undefined) {
    const ua = navigator.userAgent;
    const probe = document.createElement("div");
    probe.style.backdropFilter = "url(#glass-probe)";
    refraction =
      !((/Safari/.test(ua) && !/Chrome/.test(ua)) || /Firefox/.test(ua)) &&
      probe.style.backdropFilter !== "";
  }
  return refraction;
}
const never = () => () => {};
export function GlassSurface({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = "R",
  yChannel = "G",
  mixBlendMode = "difference",
  className = "",
  style = {},
}: {
  children?: ReactNode;
  width?: number;
  height?: number;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: Channel;
  yChannel?: Channel;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  className?: string;
  style?: CSSProperties;
}) {
  const id = useId().replace(/:/g, "-");
  const filterId = `glass-filter-${id}`;
  const feImage = useRef<SVGFEImageElement>(null);
  const red = useRef<SVGFEDisplacementMapElement>(null);
  const green = useRef<SVGFEDisplacementMapElement>(null);
  const blue = useRef<SVGFEDisplacementMapElement>(null);
  const soften = useRef<SVGFEGaussianBlurElement>(null);
  const refractive = useSyncExternalStore(
    never,
    supportsRefraction,
    () => null,
  );

  // The displacement map: red and blue gradients push the backdrop sideways and down toward the rim,
  // a blurred grey core leaves the middle almost clear.
  useEffect(() => {
    const edge = Math.min(width, height) * (borderWidth * 0.5);
    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="r-${id}" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>
        <linearGradient id="b-${id}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>
        <filter id="s-${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/></filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="black"/>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" fill="url(#r-${id})"/>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" fill="url(#b-${id})" style="mix-blend-mode: ${mixBlendMode}"/>
      <rect x="${edge}" y="${edge}" width="${width - edge * 2}" height="${height - edge * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" filter="url(#s-${id})"/>
    </svg>`;
    feImage.current?.setAttribute(
      "href",
      `data:image/svg+xml,${encodeURIComponent(svg)}`,
    );
    [
      [red, redOffset],
      [green, greenOffset],
      [blue, blueOffset],
    ].forEach(([ref, offset]) => {
      const node = (ref as typeof red).current;
      node?.setAttribute("scale", String(distortionScale + Number(offset)));
      node?.setAttribute("xChannelSelector", xChannel);
      node?.setAttribute("yChannelSelector", yChannel);
    });
    soften.current?.setAttribute("stdDeviation", String(displace));
  }, [
    id,
    width,
    height,
    borderRadius,
    borderWidth,
    brightness,
    opacity,
    blur,
    displace,
    distortionScale,
    redOffset,
    greenOffset,
    blueOffset,
    xChannel,
    yChannel,
    mixBlendMode,
  ]);

  return (
    <div
      className={`glass-surface ${refractive ? "glass-surface--svg" : "glass-surface--fallback"} ${className}`}
      style={
        {
          ...style,
          width,
          height,
          borderRadius,
          "--glass-frost": backgroundOpacity,
          "--glass-saturation": saturation,
          "--filter-id": `url(#${filterId})`,
        } as CSSProperties
      }
    >
      <svg className="glass-surface__filter" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feImage
              ref={feImage}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap
              ref={red}
              in="SourceGraphic"
              in2="map"
              result="dispRed"
            />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />
            <feDisplacementMap
              ref={green}
              in="SourceGraphic"
              in2="map"
              result="dispGreen"
            />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="green"
            />
            <feDisplacementMap
              ref={blue}
              in="SourceGraphic"
              in2="map"
              result="dispBlue"
            />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="blue"
            />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={soften} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>
      {refractive === false && (
        <>
          <span className="glass-surface__sheen" aria-hidden="true" />
          <span className="glass-surface__rim" aria-hidden="true" />
        </>
      )}
      <div className="glass-surface__content">{children}</div>
    </div>
  );
}
