/*
 * Glass lens for Nox, ported from React Bits' Glass Surface (https://reactbits.dev/components/glass-surface):
 * adapted to symmetric radial refraction, with red, green and blue offsets for a subtle chromatic fringe.
 * Here the backdrop is Nox's own neuron, rendered into
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
  distortionScale: number;
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
  saturation: number;
};

// A symmetric, size-independent lens keeps the center clear at every icon size.
// The former directional SVG displacement map shifted even the center of the
// drawing, and its fixed pixel blur exaggerated that shift on small icons.
const fragmentShader = `
uniform sampler2D uBackdrop;
uniform vec3 uScale;
uniform float uSaturation;
varying vec2 vUv;
vec4 bend(vec2 uv) {
  vec2 radial = (uv - 0.5) * 2.0;
  vec2 shift = radial * smoothstep(0.45, 0.98, length(radial)) * 0.12;
  vec4 red = texture2D(uBackdrop, uv + shift * uScale.r / 80.0);
  vec4 green = texture2D(uBackdrop, uv + shift * uScale.g / 80.0);
  vec4 blue = texture2D(uBackdrop, uv + shift * uScale.b / 80.0);
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

// Draw the backdrop through the lens without waiting for an external texture.
export function createLens(pixels: number, options: LensOptions) {
  const target = new THREE.WebGLRenderTarget(pixels, pixels, { samples: 4 });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBackdrop: { value: target.texture },
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
  return {
    target,
    draw(renderer: THREE.WebGLRenderer) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      material.dispose();
      quad.geometry.dispose();
      target.dispose();
    },
  };
}
