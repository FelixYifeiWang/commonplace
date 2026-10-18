// Nox's neuron: a tetrahedron whose edges bow toward its centre, drawn like the sketch: flat ink strokes (each edge
// a bundle of three), dots at the corners, faint flat membranes and a small nucleus. It is a 3D model drawn without
// light or shading under an orthographic camera, so it turns in space but always reads as a 2D drawing.
// It is seen through a glass lens (lib/glass-lens.ts) that bends it near the rim. While Nox works, signals travel
// along the strokes and each corner flashes as one lands and fires the next. At rest nothing is drawn.
import * as THREE from "three";
import { followGaze } from "./nox-motion.mjs";
import { createLens } from "./glass-lens";

export type NeuronMood = "rest" | "working" | "muted" | "alert";
const INK: Record<NeuronMood, number> = {
  rest: 0x3b36d4,
  working: 0x3b36d4,
  muted: 0x8f8da6,
  alert: 0xc2410c,
};
// How far each edge bows toward the centre (0 is a straight edge).
const SHRINK = 0.55;
// Half the visible width in model units: the corners reach the lens's bending band, like the sketch's
// corners reach toward its circle.
const VIEW = 1.42;
const CORNERS = [
  new THREE.Vector3(1, 1, 1),
  new THREE.Vector3(1, -1, -1),
  new THREE.Vector3(-1, 1, -1),
  new THREE.Vector3(-1, -1, 1),
].map((v) => v.normalize());
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const FACES: [number, number, number][] = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 2, 3],
  [1, 2, 3],
];
const control = (a: THREE.Vector3, b: THREE.Vector3) =>
  a
    .clone()
    .add(b)
    .multiplyScalar(0.5 * (1 - SHRINK));

// A face is a quadratic Bezier triangle on the three bowed edges, so the membrane meets every stroke exactly.
function membrane(a: number, b: number, c: number, steps = 10) {
  const [A, B, C] = [CORNERS[a], CORNERS[b], CORNERS[c]];
  const [AB, BC, CA] = [control(A, B), control(B, C), control(C, A)];
  const points: number[] = [];
  const index: number[] = [];
  const at: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    at.push([]);
    for (let j = 0; j <= steps - i; j++) {
      const u = 1 - (i + j) / steps,
        v = i / steps,
        w = j / steps;
      const p = A.clone()
        .multiplyScalar(u * u)
        .addScaledVector(B, v * v)
        .addScaledVector(C, w * w)
        .addScaledVector(AB, 2 * u * v)
        .addScaledVector(BC, 2 * v * w)
        .addScaledVector(CA, 2 * w * u);
      at[i].push(points.length / 3);
      points.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < steps - i; j++) {
      index.push(at[i][j], at[i + 1][j], at[i][j + 1]);
      if (j < steps - i - 1)
        index.push(at[i + 1][j], at[i + 1][j + 1], at[i][j + 1]);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(index);
  return geometry;
}

type Pulse = { edge: number; from: number; t: number; mesh: THREE.Mesh };

export function createNeuron(canvas: HTMLCanvasElement, size: number) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(ratio);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // Orthographic: no perspective, so strokes keep one width and the drawing stays flat as it turns.
  const camera = new THREE.OrthographicCamera(
    -VIEW,
    VIEW,
    VIEW,
    -VIEW,
    0.1,
    10,
  );
  camera.position.set(0, 0, 5);

  const ink = new THREE.Color(INK.rest);
  const lighter = () => ink.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const neuron = new THREE.Group();
  // The resting pose matches the sketch: corners at the upper left, the right and the lower left, and the fourth
  // inside toward the lower right.
  const pose = new THREE.Euler(1.02, 2.86, -0.4);
  neuron.rotation.copy(pose);
  const pointerTilt = new THREE.Group();
  pointerTilt.add(neuron);
  scene.add(pointerTilt);

  // Flat, unlit materials: colour only, like ink on paper.
  const membraneMaterial = new THREE.MeshBasicMaterial({
    color: ink,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const [a, b, c] of FACES)
    neuron.add(new THREE.Mesh(membrane(a, b, c), membraneMaterial));

  // Each edge is a bundle of three strokes that part in the middle and meet at the corners, like pen strokes.
  const curves: THREE.QuadraticBezierCurve3[] = [];
  const strokeMaterials = EDGES.map(
    () => new THREE.MeshBasicMaterial({ color: ink }),
  );
  EDGES.forEach(([a, b], e) => {
    const A = CORNERS[a],
      B = CORNERS[b],
      mid = control(A, B);
    curves.push(new THREE.QuadraticBezierCurve3(A, mid, B));
    const side = new THREE.Vector3()
      .subVectors(B, A)
      .cross(mid)
      .normalize()
      .multiplyScalar(0.05);
    for (const s of [-1, 0, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        A,
        mid.clone().addScaledVector(side, s),
        B,
      );
      neuron.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 48, s ? 0.016 : 0.024, 6, false),
          strokeMaterials[e],
        ),
      );
    }
  });

  // Dots at the corners (where signals arrive) and a nucleus at the centre.
  const dotMaterials = CORNERS.map(
    () => new THREE.MeshBasicMaterial({ color: ink }),
  );
  const dots = CORNERS.map((corner, i) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 20, 14),
      dotMaterials[i],
    );
    dot.position.copy(corner);
    neuron.add(dot);
    return dot;
  });
  const nucleusMaterial = new THREE.MeshBasicMaterial({ color: ink });
  neuron.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), nucleusMaterial),
  );

  const pulseGeometry = new THREE.SphereGeometry(0.04, 12, 8);
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pulses: Pulse[] = [];
  const flash = CORNERS.map(() => 0);
  const fire = (corner: number, except = -1) => {
    const options = EDGES.flatMap(([a, b], e) =>
      (a === corner || b === corner) && e !== except ? [e] : [],
    );
    for (const edge of options.sort(() => Math.random() - 0.5).slice(0, 2)) {
      if (pulses.length >= 5) return;
      const mesh = new THREE.Mesh(pulseGeometry, pulseMaterial);
      mesh.renderOrder = 2;
      neuron.add(mesh);
      pulses.push({ edge, from: corner, t: 0, mesh });
    }
  };

  let mood: NeuronMood = "rest";
  let frame = 0;
  let last = 0;
  let spin = 0;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const lens = createLens(
    size,
    Math.round(size * ratio),
    {
      borderWidth: 0.28,
      brightness: 50,
      opacity: 0.93,
      blur: 6,
      distortionScale: -18,
      redOffset: 0,
      greenOffset: 4,
      blueOffset: 8,
      saturation: 1,
    },
    () => wake(),
  );

  const paint = (color: number) => {
    ink.setHex(color);
    membraneMaterial.color.copy(ink);
    for (const m of [...strokeMaterials, ...dotMaterials, nucleusMaterial])
      m.color.copy(ink);
  };

  const step = (now: number) => {
    frame = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const working = mood === "working" && !reducedMotion;
    gaze.x = followGaze(gaze.x, gaze.tx, dt);
    gaze.y = followGaze(gaze.y, gaze.ty, dt);
    spin = working
      ? ((spin + dt * 0.55 + Math.PI) % (Math.PI * 2)) - Math.PI
      : followGaze(spin, 0, dt);
    // Tilt around screen axes, outside the model's resting rotation.
    pointerTilt.rotation.set(gaze.y, gaze.x, 0);
    pointerTilt.position.set(gaze.x * 0.35, -gaze.y * 0.35, 0);
    neuron.rotation.set(pose.x, pose.y + spin, pose.z);

    if (working && pulses.length === 0)
      fire(Math.floor(Math.random() * CORNERS.length));
    for (const pulse of [...pulses]) {
      pulse.t += dt / 0.7;
      const [a, b] = EDGES[pulse.edge];
      const forward = pulse.from === a;
      pulse.mesh.position.copy(
        curves[pulse.edge].getPoint(
          forward ? Math.min(1, pulse.t) : 1 - Math.min(1, pulse.t),
        ),
      );
      if (pulse.t >= 1) {
        const to = forward ? b : a;
        flash[to] = 1;
        neuron.remove(pulse.mesh);
        pulses.splice(pulses.indexOf(pulse), 1);
        if (working) fire(to, pulse.edge);
      }
    }
    // A corner swells and lightens as a signal lands, then settles; a stroke lightens while a signal runs on it.
    const light = lighter();
    dots.forEach((dot, i) => {
      flash[i] = Math.max(0, flash[i] - dt * 2.2);
      dot.scale.setScalar(1 + flash[i] * 0.7);
      dotMaterials[i].color.copy(ink).lerp(light, flash[i]);
    });
    strokeMaterials.forEach((m, e) => {
      const live = pulses.some((p) => p.edge === e);
      m.color.lerp(live ? light : ink, 0.2);
    });

    if (lens.ready) {
      renderer.setRenderTarget(lens.target);
      renderer.clear();
      renderer.render(scene, camera);
      lens.draw(renderer);
    }

    const settling =
      Math.abs(gaze.tx - gaze.x) > 0.001 ||
      Math.abs(gaze.ty - gaze.y) > 0.001 ||
      Math.abs(spin) > 0.001 ||
      pulses.length > 0 ||
      flash.some((f) => f > 0.01) ||
      strokeMaterials.some((m) => Math.abs(m.color.r - ink.r) > 0.002);
    if (working || settling) wake();
    else last = 0;
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  wake();
  return {
    setMood(next: NeuronMood) {
      mood = next;
      paint(INK[next]);
      wake();
    },
    // Gaze is a normalized screen direction, bounded to a radius of two.
    setGaze(x: number, y: number) {
      if (reducedMotion) return;
      gaze.tx = Math.max(-0.3, Math.min(0.3, x * 0.13));
      gaze.ty = Math.max(-0.3, Math.min(0.3, y * 0.13));
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      lens.dispose();
      renderer.dispose();
    },
  };
}
