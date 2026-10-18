// Nox's neuron: a tetrahedron whose edges are pulled in toward its centre, drawn as fibre bundles with knobs at
// the corners and a small nucleus. While Nox works, signals travel along the fibres and each corner flashes as one
// arrives and fires the next. At rest nothing animates and no frames are drawn.
import * as THREE from "three";

export type NeuronMood = "rest" | "working" | "muted" | "alert";
const INK: Record<NeuronMood, number> = {
  rest: 0x3b36d4,
  working: 0x3b36d4,
  muted: 0x8f8da6,
  alert: 0xc2410c,
};
// How far each edge bows toward the centre (0 is a straight edge).
const SHRINK = 0.55;
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

// A face is a quadratic Bezier triangle on the three bowed edges, so the membrane meets every fibre exactly.
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
  geometry.computeVertexNormals();
  return geometry;
}

type Pulse = { edge: number; from: number; t: number; mesh: THREE.Mesh };

export function createNeuron(canvas: HTMLCanvasElement, size: number) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  // Far enough that the neuron keeps clear glass around it; the rim refracts only empty glass.
  camera.position.set(0, 0, 6.6);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);

  const ink = new THREE.Color(INK.rest);
  const neuron = new THREE.Group();
  // The resting pose matches the sketch: corners at the upper left, the right and the lower left, and the fourth
  // inside toward the lower right, leaning toward you.
  const pose = new THREE.Euler(1.02, 2.86, -0.4);
  neuron.rotation.copy(pose);
  scene.add(neuron);

  // Membranes are a lighter wash of the ink, so the faces read as a faint body, not a solid.
  const membraneMaterial = new THREE.MeshStandardMaterial({
    color: ink.clone().lerp(new THREE.Color(0xffffff), 0.6),
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.6,
  });
  for (const [a, b, c] of FACES)
    neuron.add(new THREE.Mesh(membrane(a, b, c), membraneMaterial));

  // Each edge is a bundle of three fibres that part in the middle and meet at the corners.
  const curves: THREE.QuadraticBezierCurve3[] = [];
  const fibreMaterials = EDGES.map(
    () =>
      new THREE.MeshStandardMaterial({
        color: ink,
        emissive: ink,
        emissiveIntensity: 0.15,
        roughness: 0.45,
      }),
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
      .multiplyScalar(0.055);
    for (const s of [-1, 0, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        A,
        mid
          .clone()
          .addScaledVector(side, s)
          .multiplyScalar(1 + s * 0.04),
        B,
      );
      neuron.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 40, s ? 0.009 : 0.014, 6, false),
          fibreMaterials[e],
        ),
      );
    }
  });

  // Knobs at the corners (where signals arrive) and a nucleus at the centre.
  const knobMaterials = CORNERS.map(
    () =>
      new THREE.MeshStandardMaterial({
        color: ink,
        emissive: ink,
        emissiveIntensity: 0.2,
        roughness: 0.35,
      }),
  );
  const knobs = CORNERS.map((corner, i) => {
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 14),
      knobMaterials[i],
    );
    knob.position.copy(corner);
    neuron.add(knob);
    return knob;
  });
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 12),
    new THREE.MeshStandardMaterial({
      color: ink,
      emissive: ink,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    }),
  );
  neuron.add(nucleus);

  const pulseGeometry = new THREE.SphereGeometry(0.045, 12, 8);
  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
  });
  const pulses: Pulse[] = [];
  const flash = CORNERS.map(() => 0);
  const fire = (corner: number, except = -1) => {
    const options = EDGES.flatMap(([a, b], e) =>
      (a === corner || b === corner) && e !== except ? [e] : [],
    );
    for (const edge of options.sort(() => Math.random() - 0.5).slice(0, 2)) {
      if (pulses.length >= 5) return;
      const mesh = new THREE.Mesh(pulseGeometry, pulseMaterial);
      neuron.add(mesh);
      pulses.push({ edge, from: corner, t: 0, mesh });
    }
  };

  let mood: NeuronMood = "rest";
  let frame = 0;
  let last = 0;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const paint = (color: number) => {
    ink.setHex(color);
    membraneMaterial.color.copy(ink).lerp(new THREE.Color(0xffffff), 0.6);
    for (const m of [...fibreMaterials, ...knobMaterials]) {
      m.color.copy(ink);
      m.emissive.copy(ink);
    }
    (nucleus.material as THREE.MeshStandardMaterial).color.copy(ink);
    (nucleus.material as THREE.MeshStandardMaterial).emissive.copy(ink);
  };

  const step = (now: number) => {
    frame = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const working = mood === "working" && !reducedMotion;
    gaze.x += (gaze.tx - gaze.x) * 0.18;
    gaze.y += (gaze.ty - gaze.y) * 0.18;
    if (working) pose.y += dt * 0.55;
    neuron.rotation.set(pose.x + gaze.y, pose.y + gaze.x, pose.z);

    if (working && pulses.length === 0)
      fire(Math.floor(Math.random() * CORNERS.length));
    for (const pulse of [...pulses]) {
      pulse.t += dt / 0.7;
      const [a, b] = EDGES[pulse.edge];
      const forward = pulse.from === a;
      const point = curves[pulse.edge].getPoint(
        forward ? Math.min(1, pulse.t) : 1 - Math.min(1, pulse.t),
      );
      pulse.mesh.position.copy(point);
      if (pulse.t >= 1) {
        const to = forward ? b : a;
        flash[to] = 1;
        neuron.remove(pulse.mesh);
        pulses.splice(pulses.indexOf(pulse), 1);
        if (working) fire(to, pulse.edge);
      }
    }
    // A corner swells and glows as a signal lands, then settles; a fibre glows while a signal runs along it.
    knobs.forEach((knob, i) => {
      flash[i] = Math.max(0, flash[i] - dt * 2.2);
      knob.scale.setScalar(1 + flash[i] * 0.55);
      knobMaterials[i].emissiveIntensity = 0.2 + flash[i] * 1.4;
    });
    fibreMaterials.forEach((m, e) => {
      const live = pulses.some((p) => p.edge === e);
      m.emissiveIntensity += ((live ? 0.75 : 0.15) - m.emissiveIntensity) * 0.2;
    });
    renderer.render(scene, camera);

    const settling =
      Math.abs(gaze.tx - gaze.x) > 0.001 ||
      Math.abs(gaze.ty - gaze.y) > 0.001 ||
      pulses.length > 0 ||
      flash.some((f) => f > 0.01);
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
    // Gaze is in pixels (about ±3); Nox turns a little toward the pointer.
    setGaze(x: number, y: number) {
      gaze.tx = Math.max(-0.3, Math.min(0.3, x * 0.08));
      gaze.ty = Math.max(-0.3, Math.min(0.3, y * 0.08));
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material as THREE.Material;
          material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
