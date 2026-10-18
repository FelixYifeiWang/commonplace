"use client";
import { useEffect, useRef } from "react";
import type { SessionState } from "@/lib/types";
import { createNeuron } from "@/lib/nox-neuron";
import type { NeuronMood } from "@/lib/nox-neuron";
import { GlassSurface } from "./glass-surface";

// Nox (formerly the buddy): a flat glass bubble with a neuron inside. The neuron sits behind the glass, so the
// glass refracts it at the rim the way it would refract anything behind a lens.
const MOOD: Record<SessionState, NeuronMood> = {
  waiting: "rest",
  following: "rest",
  complete: "rest",
  reading: "working",
  collecting: "working",
  connecting: "working",
  paused: "muted",
  revoked: "muted",
  error: "alert",
};
export function Nox({
  state = "following",
  gaze,
  size = 72,
}: {
  state?: SessionState;
  gaze?: { x: number; y: number };
  size?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const neuron = useRef<ReturnType<typeof createNeuron> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    try {
      neuron.current = createNeuron(canvas.current, size);
    } catch {
      // Without WebGL the bubble stays empty glass rather than breaking the window.
      neuron.current = null;
    }
    return () => {
      neuron.current?.dispose();
      neuron.current = null;
    };
  }, [size]);
  useEffect(() => {
    neuron.current?.setMood(MOOD[state] || "rest");
  }, [state, size]);
  useEffect(() => {
    neuron.current?.setGaze(gaze?.x || 0, gaze?.y || 0);
  }, [gaze?.x, gaze?.y, size]);
  return (
    <span
      className={`nox state-${state}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas ref={canvas} className="nox-neuron" width={size} height={size} />
      <GlassSurface
        className="nox-glass"
        width={size}
        height={size}
        borderRadius={size / 2}
        borderWidth={0.09}
        brightness={52}
        opacity={0.9}
        blur={6}
        backgroundOpacity={0.05}
        saturation={1.15}
        distortionScale={-36}
        redOffset={0}
        greenOffset={4}
        blueOffset={8}
      />
    </span>
  );
}
