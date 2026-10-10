// Render quality levels and the Pro Max progressive renderer.
//
//   Every level keeps the same look: the same materials and textures, the
//   in-kitchen reflections, filmic tone mapping, the glow on flames and
//   lamps, and soft shadows from both the evening sun and the vault lights.
//   Higher levels add sharpness and depth, not a different picture.
//
//   Low (mobile)       phones, tablets and older laptops: 1x pixels with
//                      FXAA edge smoothing in place of MSAA, 2K sun shadows
//   Medium (balanced)  everyday laptops (MacBook Air, integrated GPUs): up to
//                      1.5x pixels, MSAA
//   High (high)        the best for moving around, on a stronger GPU (Apple
//                      Pro/Max, discrete cards): up to 2x pixels, MSAA,
//                      ground-truth ambient occlusion, 4K shadows
//   Pro Max (ultra)    stills, not navigation: native pixels, GTAO, 4K shadows,
//                      plus progressive accumulation while the camera rests:
//                      sub-pixel jitter (supersampling) and a jittered sun and
//                      key light (soft area shadows) converge over ~1-2 s into
//                      a still that reads like an offline render, and a gentle
//                      depth of field. Never picked automatically.
//
// Auto picks a level from the GPU the browser reports, then steps down a
// level if the frame rate stays low (see AutoQuality).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const TIERS = {
  mobile: { label: 'Low', pixelRatio: 1, msaa: 0, fxaa: true, bloom: true, ao: false, shadow: 2048, keyShadow: true, accumulate: false },
  balanced: { label: 'Medium', pixelRatio: 1.5, msaa: 4, bloom: true, ao: false, shadow: 2048, keyShadow: true, accumulate: false },
  high: { label: 'High', pixelRatio: 2, msaa: 4, bloom: true, ao: true, shadow: 4096, keyShadow: true, accumulate: false },
  ultra: { label: 'Pro Max (stills)', pixelRatio: 2.5, msaa: 4, bloom: true, ao: true, shadow: 4096, keyShadow: true, accumulate: true, dof: true },
};
export const LADDER = ['mobile', 'balanced', 'high', 'ultra'];
const ALIAS = { low: 'mobile', medium: 'balanced', med: 'balanced', 'pro-max': 'ultra', promax: 'ultra', max: 'ultra' };
export const tierName = (q) => (TIERS[q] ? q : ALIAS[q] || 'balanced');

// Picks a starting level from what the browser reports. Pro Max is opt-in.
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
  // older laptops: pre-Iris Intel graphics, or anything with little memory
  if (/intel.*(hd graphics|uhd graphics [56]\d\d)/i.test(gpu)) return 'mobile';
  // Apple's Pro/Max/Ultra chips and discrete GPUs take High; a base M chip
  // (MacBook Air, 13" Pro) runs smoother on Medium.
  if (/apple m\d+ (pro|max|ultra)|rtx|radeon rx|radeon pro|arc a/i.test(gpu)) return 'high';
  return 'balanced';
}

// Auto mode's safety net: if frames stay slow for a few seconds while the
// view is in use, step down one level (never below Low, never from a level
// the viewer picked). Call frame(dt) every frame; it returns the new level
// name when it decides to step down.
export class AutoQuality {
  constructor(level) { this.level = level; this.t = 0; this.n = 0; this.grace = 4; }
  reset(level) { this.level = level; this.t = 0; this.n = 0; this.grace = 3; }
  frame(dt) {
    if (dt <= 0 || dt > 0.5) return null; // tab was hidden or a one-off hitch
    if (this.grace > 0) { this.grace -= dt; return null; } // shaders warming up, intro starting
    this.t += dt; this.n++;
    if (this.t < 3) return null;
    const fps = this.n / this.t;
    this.t = 0; this.n = 0;
    const i = LADDER.indexOf(this.level);
    if (fps >= 28 || i <= 0 || this.level === 'ultra') return null;
    this.reset(LADDER[i - 1]);
    return this.level;
  }
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
