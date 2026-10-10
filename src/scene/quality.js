// Render quality tiers and the Pro Max progressive renderer.
//
//   mobile    1x pixels, no MSAA, no bloom, small shadow maps
//   balanced  up to 1.25x, MSAA, bloom
//   high      up to 2x, MSAA, ground-truth AO, bloom, 4K shadows
//   ultra     "Pro Max": native pixels, GTAO, 4K shadows, plus progressive
//             accumulation while the camera rests: sub-pixel jitter
//             (supersampling) and a jittered sun and key light (soft area
//             shadows) converge over ~1-2 s into a still that reads like an
//             offline render, and a gentle depth of field.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const TIERS = {
  mobile: { label: 'Mobile', pixelRatio: 1, msaa: 0, bloom: false, ao: false, shadow: 1024, keyShadow: false, accumulate: false },
  balanced: { label: 'Balanced', pixelRatio: 1.25, msaa: 4, bloom: true, ao: false, shadow: 2048, keyShadow: true, accumulate: false },
  high: { label: 'High', pixelRatio: 2, msaa: 4, bloom: true, ao: true, shadow: 4096, keyShadow: true, accumulate: false },
  ultra: { label: 'Pro Max', pixelRatio: 2.5, msaa: 4, bloom: true, ao: true, shadow: 4096, keyShadow: true, accumulate: true, dof: true },
};
const ALIAS = { low: 'mobile', medium: 'balanced', 'pro-max': 'ultra', promax: 'ultra', max: 'ultra' };
export const tierName = (q) => (TIERS[q] ? q : ALIAS[q] || 'balanced');

// Picks a default from what the browser reports. Pro Max is opt-in.
export function detectQuality(renderer) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* privacy mode */ }
  if (/swiftshader|llvmpipe|software|mali-[4t]|adreno \(tm\) [3-5]/i.test(gpu)) return 'mobile';
  if (coarse || mem <= 4) return 'mobile';
  if (/apple m\d|rtx|radeon rx|radeon pro|arc a/i.test(gpu)) return 'high';
  return 'balanced';
}

const HALTON = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

// Exponential accumulation of jittered frames into a history buffer. It
// converges to a supersampled, soft-shadowed image when nothing moves, and
// leaves a short, film-like trail on moving cooks and steam.
export class AccumulatePass extends Pass {
  constructor(w, h) {
    super();
    this.history = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.frames = 0;
    this.maxFrames = 96;
    this.minAlpha = 1 / 24;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tOld: { value: null }, alpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tNew, tOld; uniform float alpha; varying vec2 vUv;
        void main() { vec4 n = texture2D(tNew, vUv); vec4 o = texture2D(tOld, vUv); gl_FragColor = mix(o, n, alpha); }`,
      depthTest: false, depthWrite: false,
    }));
    this.copy = new FullScreenQuad(new THREE.MeshBasicMaterial({ toneMapped: false }));
  }
  reset() { this.frames = 0; }
  get converged() { return this.frames >= this.maxFrames; }
  setSize(w, h) { this.history.setSize(w, h); this.reset(); }
  render(renderer, writeBuffer, readBuffer) {
    const alpha = this.frames === 0 ? 1 : Math.max(this.minAlpha, 1 / (this.frames + 1));
    this.frames = Math.min(this.frames + 1, this.maxFrames);
    const u = this.quad.material.uniforms;
    u.tNew.value = readBuffer.texture; u.tOld.value = this.history.texture; u.alpha.value = alpha;
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
    this.copy.material.map = writeBuffer.texture;
    renderer.setRenderTarget(this.history);
    this.copy.render(renderer);
  }
  dispose() { this.history.dispose(); this.quad.dispose(); this.copy.dispose(); }
}

// Drives sub-pixel camera jitter and light jitter for the AccumulatePass.
export class Jitter {
  constructor(camera, lights) {
    this.camera = camera;
    this.lights = lights.map((l) => ({ l, base: l.position.clone(), spread: l.userData.softness ?? 0.6 }));
    this.i = 0;
  }
  rebase() { for (const e of this.lights) e.base.copy(e.l.position); }
  apply(w, h) {
    this.i = (this.i % 64) + 1;
    const jx = HALTON(this.i, 2) - 0.5, jy = HALTON(this.i, 3) - 0.5;
    this.camera.setViewOffset(w, h, jx, jy, w, h);
    const a = HALTON(this.i, 5) * Math.PI * 2, r = Math.sqrt(HALTON(this.i, 7));
    for (const e of this.lights) e.l.position.set(e.base.x + Math.cos(a) * r * e.spread, e.base.y, e.base.z + Math.sin(a) * r * e.spread);
  }
  clear() {
    this.camera.clearViewOffset();
    for (const e of this.lights) e.l.position.copy(e.base);
  }
}
