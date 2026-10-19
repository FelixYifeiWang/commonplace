// Nox's mark: Newron's N, drawn live with a small WebGL shader so it can move like a liquid.
//
// At rest it is the N (lib/newron-mark.mjs traces the same shape for the logo): the stem and diagonal bonded, the
// top right drop a little apart, its link slowly forming and letting go. While Nox works it melts into one drop and
// branches into the firing cell, whose dendrites shoot out and fall back while loose drops bond to its arms. When
// work ends it gathers back into the N, and the two right-hand drops let go of each other quickly.
//
// "melt" is the motion in use. "rewire", "relay" and "mesh" are earlier working motions kept for later: each rests
// on the same N and only reconnects its four drops while working (see docs/design/labs/newron-marks.html).
import { followGaze, releaseAfter, springStep } from "./nox-motion.mjs";

export type MarkMood = "rest" | "working" | "muted" | "alert";
export type MarkMotion = "melt" | "rewire" | "relay" | "mesh";

const INK: Record<MarkMood, [number, number, number]> = {
  rest: [0x3b, 0x36, 0xd4],
  working: [0x3b, 0x36, 0xd4],
  muted: [0x8f, 0x8d, 0xa6],
  alert: [0xc2, 0x41, 0x0c],
};
// The moment of rest Newron's logo shows (the top right drop furthest apart); also used when motion is reduced.
const REST_POSE = (Math.PI * 1.5) / 1.1;

const vertex = `attribute vec2 aPos; varying vec2 vP; void main() { vP = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const fragment = `
precision highp float;
varying vec2 vP;
uniform float uTime;
uniform float uWork;
uniform float uSplit;
uniform float uPx;
uniform vec2 uShift;
uniform vec3 uInk;

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float circle(vec2 p, vec2 c, float r) { return length(p - c) - r; }
vec2 dir(float a) { return vec2(cos(a), sin(a)); }
float taper(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float bond(vec2 p, vec2 a, vec2 b, float r) { return taper(p, a, b, r, r); }
// A dendrite: a drop narrowing along a neck to a smaller knob.
float stick(vec2 q, vec2 b, vec2 k, float rb, float rk, float rn) {
  float d = smin(circle(q, b, rb), bond(q, b, k, rn), 0.08);
  return smin(d, circle(q, k, rk), 0.05);
}

const vec2 NBL = vec2(-0.42, -0.42);
const vec2 NTL = vec2(-0.42, 0.42);
const vec2 NBR = vec2(0.42, -0.42);
const vec2 NTR = vec2(0.42, 0.42);

// The resting N. s breathes slowly; uSplit holds the right-hand drops apart just after work ends.
float idleN(vec2 p, float t) {
  float s = 0.5 + 0.5 * sin(t * 1.1);
  vec2 tr = NTR + vec2(0.03, 0.05) * (1.0 - s);
  float r = 0.21, k = 0.12;
  float d = circle(p, NBL, r);
  d = smin(d, circle(p, NTL, r), 0.06);
  d = smin(d, bond(p, NBL, NTL, 0.08), k);
  d = smin(d, bond(p, NTL, NBR, 0.08), k);
  d = smin(d, circle(p, NBR, r), 0.06);
  d = smin(d, circle(p, tr, r), 0.06);
  float g = smoothstep(0.25, 0.95, s) * (1.0 - uSplit);
  vec2 m = mix(NBR, tr, 0.5);
  d = smin(d, taper(p, NBR, mix(NBR, m, g), 0.08, 0.055), k * g + 0.001);
  d = smin(d, taper(p, tr, mix(tr, m, g), 0.08, 0.055), k * g + 0.001);
  return d;
}

// The firing cell, upright: arms at 90, -30 and -150 degrees, dendrites between them. Branch k fires on its own
// beat: c runs from rest (0) to the full drawing (1); the loose drop links to the arm a little later (e).
const float ARM0 = 1.5708;
void branch(int k, float t, out vec2 tip, out vec2 blob, out vec2 knob, out vec2 drop, out vec4 r, out float link) {
  float ph = t * 2.6 - float(k) * 2.0944;
  float c = 0.5 - 0.5 * cos(ph);
  float e = 0.5 - 0.5 * cos(ph - 1.5);
  vec2 u = dir(ARM0 - float(k) * 2.0944), v = dir(ARM0 + 1.0472 - float(k) * 2.0944);
  tip = (0.34 + 0.04 * c) * u;
  blob = (0.36 + 0.03 * c) * v;
  knob = mix(0.42, 0.82, c) * v;
  drop = mix(0.82, 0.66, e) * u;
  r = vec4(mix(0.08, 0.125, c), mix(0.04, 0.09, c), mix(0.024, 0.047, c), mix(0.05, 0.09, e));
  link = smoothstep(0.4, 0.92, e);
}
float linkLine(vec2 p, vec2 a, vec2 b, float g) {
  vec2 m = mix(a, b, 0.5);
  return min(taper(p, a, mix(a, m, g), 0.05, 0.032), taper(p, b, mix(b, m, g), 0.05, 0.032));
}
float firingCell(vec2 p, float t) {
  // The central chunk: a slightly fuller body and arms than the drawing it came from.
  float d = circle(p, vec2(0.0), 0.19);
  for (int k = 0; k < 3; k++) {
    vec2 tip, blob, knob, drop; vec4 r; float g;
    branch(k, t, tip, blob, knob, drop, r, g);
    d = smin(d, bond(p, vec2(0.0), tip, 0.115), 0.07);
    d = min(d, stick(p, blob, knob, r.x, r.y, r.z));
    d = min(d, circle(p, drop, r.w));
    d = smin(d, linkLine(p, tip, drop, g), 0.06 * g + 0.001);
  }
  return d;
}

// Melt: the N melts into one drop, which branches into the cell.
float melt(vec2 p, float t, float w) {
  float drop = circle(p, vec2(0.0), 0.36);
  float d = mix(idleN(p, t), drop, smoothstep(0.0, 0.5, w));
  return mix(d, firingCell(p, t), smoothstep(0.5, 1.0, w));
}

// ---- Kept for later: working motions that only reconnect the N's four drops ----
float grow(vec2 p, vec2 a, vec2 b, float g, float r0, float r1) {
  vec2 m = mix(a, b, 0.5);
  return min(taper(p, a, mix(a, m, g), r0, r1), taper(p, b, mix(b, m, g), r0, r1));
}
// Rests exactly as idleN. n: stem, diagonal, right link; o: top, other diagonal, bottom (working strengths).
float restN(vec2 p, float t, float w, vec3 n, vec3 o, vec4 shiftA, vec4 shiftB, float lite) {
  float s = 0.5 + 0.5 * sin(t * 1.1);
  float wr = smoothstep(0.55, 1.0, w);
  vec2 bl = NBL + shiftA.xy, tl = NTL + shiftA.zw, br = NBR + shiftB.xy;
  vec2 tr = NTR + shiftB.zw + (1.0 - wr) * vec2(0.03, 0.05) * (1.0 - s);
  float r = mix(0.21, 0.17, lite), rb = mix(0.08, 0.052, lite), rt = mix(0.055, 0.036, lite), k = 0.12;
  float nl = mix(1.0, n.x, w), nd = mix(1.0, n.y, w), nr = mix(smoothstep(0.25, 0.95, s) * (1.0 - uSplit), n.z, wr);
  vec3 ow = o * w;
  float d = circle(p, bl, r);
  d = smin(d, circle(p, tl, r), 0.06);
  d = smin(d, grow(p, bl, tl, nl, rb, rb), max(k * nl, 0.0001));
  d = smin(d, grow(p, tl, br, nd, rb, rb), max(k * nd, 0.0001));
  d = smin(d, circle(p, br, r), 0.06);
  d = smin(d, circle(p, tr, r), 0.06);
  vec2 m = mix(br, tr, 0.5);
  d = smin(d, taper(p, br, mix(br, m, nr), rb, rt), k * nr + 0.001);
  d = smin(d, taper(p, tr, mix(tr, m, nr), rb, rt), k * nr + 0.001);
  d = smin(d, grow(p, tl, tr, ow.x, rb, rt), k * ow.x + 0.001);
  d = smin(d, grow(p, bl, tr, ow.y, rb, rt), k * ow.y + 0.001);
  return smin(d, grow(p, bl, br, ow.z, rb, rt), k * ow.z + 0.001);
}
// Rewire: whole shapes in turn, N, Z, square, cross.
void shapeOf(int k, out vec3 n, out vec3 o) {
  if (k == 0) { n = vec3(1.0); o = vec3(0.0); }
  else if (k == 1) { n = vec3(0.0); o = vec3(1.0); }
  else if (k == 2) { n = vec3(1.0, 0.0, 1.0); o = vec3(1.0, 0.0, 1.0); }
  else { n = vec3(0.0, 1.0, 0.0); o = vec3(0.0, 1.0, 0.0); }
}
float rewire(vec2 p, float t, float w) {
  float u = t / 1.7;
  float k = mod(floor(u), 4.0);
  float f = smoothstep(0.4, 1.0, fract(u));
  vec3 n0, o0, n1, o1;
  shapeOf(int(k), n0, o0);
  shapeOf(int(mod(k + 1.0, 4.0)), n1, o1);
  return restN(p, t, w, mix(n0, n1, f), mix(o0, o1, f), vec4(0.0), vec4(0.0), 0.0);
}
// Relay: two travelling connections; each reaches from one drop to the next, then flows into it.
vec4 hop(int h) {
  if (h == 0) return vec4(NBL, NTL);
  if (h == 1) return vec4(NTL, NBR);
  if (h == 2) return vec4(NBR, NTR);
  if (h == 3) return vec4(NTR, NTL);
  if (h == 4) return vec4(NTL, NBL);
  if (h == 5) return vec4(NBL, NTR);
  if (h == 6) return vec4(NTR, NBR);
  return vec4(NBR, NBL);
}
float messenger(vec2 p, float u) {
  vec4 e = hop(int(mod(floor(u), 8.0)));
  float f = fract(u);
  float head = smoothstep(0.0, 0.55, f), tail = smoothstep(0.45, 1.0, f);
  return taper(p, mix(e.xy, e.zw, tail), mix(e.xy, e.zw, head), 0.06, 0.08);
}
float relay(vec2 p, float t, float w) {
  float d = restN(p, t, w, vec3(0.0), vec3(0.0), vec4(0.0), vec4(0.0), 0.0);
  float u = t / 0.85;
  float m = min(messenger(p, u), messenger(p, u + 4.5)) + (1.0 - w) * 0.1;
  return smin(d, m, 0.1 * w + 0.001);
}
// Mesh: every pair on its own rhythm; drops lean toward the drops they hold.
float beat(float t, float i) { return smoothstep(0.3, 0.75, 0.5 + 0.5 * sin(t * (1.1 + 0.21 * i) + i * 2.3)); }
float mesh(vec2 p, float t, float w) {
  vec3 n = vec3(beat(t, 0.0), beat(t, 1.0), beat(t, 2.0));
  vec3 o = vec3(beat(t, 3.0), beat(t, 4.0), beat(t, 5.0));
  float lean = 0.07 * w;
  vec2 bl = lean * (n.x * normalize(NTL - NBL) + o.y * normalize(NTR - NBL) + o.z * normalize(NBR - NBL));
  vec2 tl = lean * (n.x * normalize(NBL - NTL) + n.y * normalize(NBR - NTL) + o.x * normalize(NTR - NTL));
  vec2 br = lean * (n.y * normalize(NTL - NBR) + n.z * normalize(NTR - NBR) + o.z * normalize(NBL - NBR));
  vec2 tr = lean * (n.z * normalize(NBR - NTR) + o.x * normalize(NTL - NTR) + o.y * normalize(NBL - NTR));
  return restN(p, t, w, n, o, vec4(bl, tl), vec4(br, tr), w);
}

void main() {
  vec2 p = vP * 1.04 - uShift;
  float t = uTime;
  float a = clamp(0.5 - MOTION / uPx, 0.0, 1.0);
  gl_FragColor = vec4(uInk * a, a);
}`;

export function createMark(
  canvas: HTMLCanvasElement,
  size: number,
  motion: MarkMotion = "melt",
) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pixels = Math.max(8, Math.round(size * ratio));
  canvas.width = canvas.height = pixels;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl)
    throw new Error("WebGL is unavailable, so Nox's mark cannot be drawn");
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(
        `Nox's mark shader failed: ${gl.getShaderInfoLog(shader)}`,
      );
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      fragment.replace("MOTION", `${motion}(p, t, uWork)`),
    ),
  );
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(
      `Nox's mark failed to link: ${gl.getProgramInfoLog(program)}`,
    );
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const uTime = u("uTime"),
    uWork = u("uWork"),
    uSplit = u("uSplit"),
    uPx = u("uPx"),
    uShift = u("uShift"),
    uInk = u("uInk");
  gl.viewport(0, 0, pixels, pixels);
  gl.uniform1f(uPx, 2.08 / pixels);

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const started = performance.now();
  let mood: MarkMood = "rest";
  let work = 0,
    speed = 0,
    target = 0;
  let restedAt: number | null = null;
  const ink = [...INK.rest].map((c) => c / 255);
  let inkTarget = ink.slice();
  const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  let frame = 0,
    timer = 0,
    last = 0;

  const draw = (now: number) => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, reducedMotion ? REST_POSE : (now - started) / 1000);
    gl.uniform1f(uWork, Math.min(1, Math.max(0, work)));
    gl.uniform1f(
      uSplit,
      reducedMotion || restedAt === null
        ? 0
        : releaseAfter((now - restedAt) / 1000),
    );
    gl.uniform2f(uShift, gaze.x, gaze.y);
    gl.uniform3fv(uInk, ink);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const step = (now: number) => {
    frame = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    if (reducedMotion) {
      work = target;
      speed = 0;
    } else [work, speed] = springStep(work, speed, target, dt);
    gaze.x = followGaze(gaze.x, gaze.tx, dt);
    gaze.y = followGaze(gaze.y, gaze.ty, dt);
    for (let i = 0; i < 3; i++) ink[i] = followGaze(ink[i], inkTarget[i], dt);
    draw(now);
    const changing =
      Math.abs(work - target) > 0.0005 ||
      Math.abs(speed) > 0.0005 ||
      Math.abs(gaze.tx - gaze.x) > 0.0005 ||
      Math.abs(gaze.ty - gaze.y) > 0.0005 ||
      ink.some((c, i) => Math.abs(c - inkTarget[i]) > 0.002) ||
      (restedAt !== null && now - restedAt < 4000);
    if (reducedMotion) {
      if (changing) wake();
      else last = 0;
    } else if (changing || target === 1) wake();
    else {
      // At rest the N only breathes, so it is redrawn about 24 times a second instead of every frame.
      last = 0;
      timer = window.setTimeout(wake, 42);
    }
  };
  const wake = () => {
    window.clearTimeout(timer);
    if (!frame) frame = requestAnimationFrame(step);
  };

  wake();
  return {
    setMood(next: MarkMood) {
      if (mood === "working" && next !== "working")
        restedAt = performance.now();
      mood = next;
      target = next === "working" ? 1 : 0;
      inkTarget = INK[next].map((c) => c / 255);
      wake();
    },
    // Gaze is a normalized screen direction, bounded to a radius of two; the mark shifts a couple of pixels toward it.
    setGaze(x: number, y: number) {
      if (reducedMotion) return;
      gaze.tx = Math.max(-0.09, Math.min(0.09, x * 0.045));
      gaze.ty = Math.max(-0.09, Math.min(0.09, -y * 0.045));
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
