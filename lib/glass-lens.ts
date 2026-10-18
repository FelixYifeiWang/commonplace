/*
 * Glass lens for Nox, ported from React Bits' Glass Surface (https://reactbits.dev/components/glass-surface):
 * the same displacement map and the same refraction shader, which bends the backdrop near the rim and offsets
 * the red, green and blue channels for a chromatic fringe. Here the backdrop is Nox's own neuron, rendered into
 * a texture, because a transparent desktop window cannot see what is behind it.
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
import * as THREE from "three";

export type LensOptions = {
  borderWidth: number;
  brightness: number;
  opacity: number;
  blur: number;
  distortionScale: number;
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
  saturation: number;
};

// React Bits' displacement map for a circle: a red gradient across and a blue one down (blended by difference),
// with a blurred grey core that leaves the middle of the lens clear.
function lensMap(size: number, o: LensOptions) {
  const r = size / 2,
    edge = size * (o.borderWidth * 0.5);
  return `data:image/svg+xml,${encodeURIComponent(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>
      <linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>
      <filter id="s" filterUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${o.blur}"/></filter>
    </defs>
    <rect x="0" y="0" width="${size}" height="${size}" fill="black"/>
    <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" fill="url(#r)"/>
    <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" fill="url(#b)" style="mix-blend-mode: difference"/>
    <rect x="${edge}" y="${edge}" width="${size - edge * 2}" height="${size - edge * 2}" rx="${r - edge}" fill="hsl(0 0% ${o.brightness}% / ${o.opacity})" filter="url(#s)"/>
  </svg>`)}`;
}

// React Bits' refraction shader: each channel samples the backdrop shifted by the map, by its own amount.
const fragmentShader = `
uniform sampler2D uBackdrop;
uniform sampler2D uMap;
uniform vec2 uSize;
uniform vec3 uScale;
uniform float uSaturation;
varying vec2 vUv;
vec4 bend(vec2 uv) {
  vec4 map = texture2D(uMap, uv);
  // x reads the red gradient and y the blue one (React Bits' yChannel "B"), so the rim bends evenly all round.
  vec2 shift = vec2(map.r, map.b) - 0.5;
  // The map is laid out top-down like the page; textures here run bottom-up.
  vec2 step = vec2(1.0, -1.0) / uSize;
  vec4 red = texture2D(uBackdrop, uv + shift * uScale.r * step);
  vec4 green = texture2D(uBackdrop, uv + shift * uScale.g * step);
  vec4 blue = texture2D(uBackdrop, uv + shift * uScale.b * step);
  return vec4(red.r, green.g, blue.b, (red.a + green.a + blue.a) / 3.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec4 color = bend(vUv);
  vec3 rgb = color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
  float s = uSaturation;
  mat3 tone = mat3(
    0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
    0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
    0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s
  );
  rgb = toSRGB(clamp(tone * rgb, 0.0, 1.0));
  gl_FragColor = vec4(rgb * color.a, color.a);
}`;

// Draws a backdrop texture through the lens onto the canvas. The map loads once; until then nothing is drawn.
export function createLens(
  size: number,
  pixels: number,
  options: LensOptions,
  onReady: () => void,
) {
  const target = new THREE.WebGLRenderTarget(pixels, pixels, { samples: 4 });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBackdrop: { value: target.texture },
      uMap: { value: null },
      uSize: { value: new THREE.Vector2(size, size) },
      uScale: {
        value: new THREE.Vector3(
          options.distortionScale + options.redOffset,
          options.distortionScale + options.greenOffset,
          options.distortionScale + options.blueOffset,
        ),
      },
      uSaturation: { value: options.saturation },
    },
    vertexShader:
      "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.Camera();
  let ready = false;
  new THREE.TextureLoader().load(lensMap(size, options), (map) => {
    map.minFilter = THREE.LinearFilter;
    material.uniforms.uMap.value = map;
    ready = true;
    onReady();
  });
  return {
    target,
    get ready() {
      return ready;
    },
    draw(renderer: THREE.WebGLRenderer) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      (material.uniforms.uMap.value as THREE.Texture | null)?.dispose();
      material.dispose();
      quad.geometry.dispose();
      target.dispose();
    },
  };
}
