// Small geometry toolkit shared by every builder in the scene.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldUV } from './materials.js';

// Rounded box whose origin sits at the centre of its bottom face.
export function rbox(w, h, d, mat, { r = 0.008, seg = 2, uv = 0, shadow = true } = {}) {
  const radius = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = radius > 0.0005 ? new RoundedBoxGeometry(w, h, d, seg, radius) : new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (uv) worldUV(g, uv);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// Plain box centred on its origin (used for thin panels).
export function box(w, h, d, mat, { uv = 0, shadow = true } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uv) worldUV(g, uv);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop, rBot, h, mat, { seg = 24, open = false, shadow = true } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function sphere(r, mat, { seg = 16 } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function torus(r, tube, mat, { seg = 32, tubeSeg = 8 } = {}) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, tubeSeg, seg), mat);
  m.castShadow = true;
  return m;
}

// Lathe from a list of [radius, height] pairs; good for pots, plates, bowls.
export function lathe(points, mat, seg = 40) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function at(obj, x = 0, y = 0, z = 0, ry = 0) {
  obj.position.set(x, y, z);
  if (ry) obj.rotation.y = ry;
  return obj;
}

export function add(parent, ...children) {
  for (const c of children) parent.add(c);
  return children[0];
}

// Tubular rail between two points (handles, towel bars, pass rails).
export function rod(a, b, radius, mat, seg = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(radius, radius, len, seg);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}

// Four round legs with bullet feet, typical NSF worktable undercarriage.
export function legs(group, w, d, h, M, { inset = 0.04, shelf = true } = {}) {
  const lx = w / 2 - inset, lz = d / 2 - inset;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
    add(group, at(cyl(0.019, 0.019, h - 0.03, M.steel, { seg: 12 }), x, 0.03, z));
    add(group, at(cyl(0.022, 0.016, 0.03, M.steelDark, { seg: 12 }), x, 0, z));
  }
  if (shelf) {
    add(group, at(rbox(w - 0.02, 0.025, d - 0.06, M.steel, { r: 0.004 }), 0, 0.22, 0));
  }
}

// A worktable with backsplash, optional undershelf and selectable top surface.
export function worktable(M, w, d, { h = 0.9, top = 'steel', splash = true, shelf = true } = {}) {
  const g = new THREE.Group();
  const topMat = top === 'wood' ? M.wood : top === 'marble' ? M.marble : M.steel;
  const thick = top === 'steel' ? 0.04 : 0.06;
  legs(g, w, d, h - thick, M, { shelf });
  add(g, at(rbox(w, thick, d, topMat, { r: top === 'steel' ? 0.01 : 0.006, uv: top === 'steel' ? 0 : 0.8 }), 0, h - thick, 0));
  if (top !== 'steel') add(g, at(rbox(w, 0.035, d, M.steel, { r: 0.004 }), 0, h - thick - 0.035, 0));
  if (splash) add(g, at(rbox(w, 0.12, 0.015, M.steel, { r: 0.004 }), 0, h, -d / 2 + 0.0075));
  g.userData.topY = h;
  return g;
}

// Group of meshes to be baked into merged static geometry later.
export function markStatic(obj) {
  obj.traverse((o) => { if (o.isMesh) o.userData.static = true; });
  return obj;
}

export function markDynamic(obj) {
  obj.traverse((o) => { o.userData.dynamic = true; });
  return obj;
}

// Merges a group's opaque meshes by material in place, so it looks the same
// but draws in a handful of calls instead of one per part. `deep` also
// merges nested static meshes (into the group's own space); otherwise only
// direct, childless mesh children are merged, which keeps animated sub-groups
// (a cook's arms and head) moving. Dynamic, pickable, transparent, instanced
// and multi-material meshes, and anything in `keep`, are left alone.
export function batchGroup(group, { deep = false, keep = [] } = {}) {
  const skip = new Set(keep);
  const buckets = new Map();
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const candidate = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !skip.has(o) && !o.userData.dynamic && !o.userData.pick
    && o.children.length === 0 && o.material && !Array.isArray(o.material) && o.material.visible !== false
    && !o.material.transparent && !o.material.transmission && o.visible && !Object.keys(o.geometry.morphAttributes).length;
  const take = (o) => {
    const attrs = Object.keys(o.geometry.attributes).sort().map((n) => `${n}${o.geometry.attributes[n].itemSize}`).join(',');
    const key = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.frustumCulled, o.layers.mask, attrs].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  };
  const visit = (o) => {
    for (const c of o.children) {
      if (c.userData.dynamic || skip.has(c)) continue;
      if (candidate(c)) take(c);
      else if (deep && c.visible) visit(c);
    }
  };
  visit(group);
  const m = new THREE.Matrix4();
  for (const parts of buckets.values()) {
    if (parts.length < 2) continue;
    const geos = parts.map((o) => {
      const g = o.geometry.clone();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      g.clearGroups();
      g.applyMatrix4(m.multiplyMatrices(toGroup, o.matrixWorld));
      // a mirrored part keeps its facing: the renderer flips culling for negative scale, a merged buffer can't
      if (m.determinant() < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; }
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const src = parts[0];
    const mesh = new THREE.Mesh(merged, src.material);
    mesh.name = `${group.name || 'group'}:batched`;
    mesh.castShadow = src.castShadow;
    mesh.receiveShadow = src.receiveShadow;
    mesh.renderOrder = src.renderOrder;
    mesh.frustumCulled = src.frustumCulled;
    mesh.layers.mask = src.layers.mask;
    mesh.userData.batched = true;
    for (const o of parts) o.removeFromParent();
    group.add(mesh);
  }
  return group;
}

// Soft round sprite used by steam, smoke and bubbles.
let SOFT_TEX = null;
export function softSprite() {
  if (SOFT_TEX) return SOFT_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  SOFT_TEX = new THREE.CanvasTexture(c);
  return SOFT_TEX;
}

// Rising steam/smoke particles. intensity 0 hides it, 1 is a full plume.
export class SteamEmitter {
  constructor({ count = 48, area = [0.3, 0.3], rise = 0.5, height = 0.9, size = 0.35, color = 0xffffff, opacity = 0.18 } = {}) {
    this.count = count; this.area = area; this.rise = rise; this.height = height;
    this.intensity = 0;
    const pos = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.life[i] = Math.random(); this.seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      size, map: softSprite(), color, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
    });
    this.baseOpacity = opacity;
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.userData.dynamic = true;
  }
  update(dt) {
    this.mat.opacity += ((this.baseOpacity * this.intensity) - this.mat.opacity) * Math.min(1, dt * 2);
    this.points.visible = this.mat.opacity > 0.002;
    if (!this.points.visible) return;
    const p = this.points.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      this.life[i] += dt * this.rise / this.height * (0.6 + this.seed[i] * 0.8);
      if (this.life[i] > 1) { this.life[i] -= 1; this.seed[i] = Math.random(); }
      const l = this.life[i], s = this.seed[i];
      const sx = (s - 0.5) * this.area[0], sz = (((s * 7.31) % 1) - 0.5) * this.area[1];
      const drift = l * l * 0.25;
      p.setXYZ(i, sx * (1 + l) + Math.sin(l * 6 + s * 20) * 0.04 + drift * 0.3, l * this.height, sz * (1 + l) + drift * 0.2);
    }
    p.needsUpdate = true;
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (t) => t * t * (3 - 2 * t);

// Simple string hash -> [0,1) for deterministic variation from ids.
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// Procedural flame tongue: hot white-yellow core fading to orange, then red.
let FLAME_TEX = null;
export function flameTexture() {
  if (FLAME_TEX) return FLAME_TEX;
  const W = 64, H = 128, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = 1 - j / H;                              // 0 at the base, 1 at the tip
    const half = 0.48 * Math.pow(Math.sin(Math.PI * Math.min(1, (1 - v) * 1.05)), 0.7) * (1 - v * 0.55);
    const u = Math.abs(i / W - 0.5) / Math.max(0.001, half);
    const a = Math.max(0, 1 - u * u) * Math.min(1, (1 - v) * 6) * Math.pow(1 - v, 0.6);
    const hot = Math.max(0, 1 - u * 1.6) * (1 - v);
    const k = (j * W + i) * 4;
    img.data[k] = 255;
    img.data[k + 1] = Math.min(255, 90 + hot * 200 + (1 - v) * 40);
    img.data[k + 2] = Math.min(255, 20 + hot * hot * 200);
    img.data[k + 3] = Math.min(255, a * 255);
  }
  x.putImageData(img, 0, 0);
  FLAME_TEX = new THREE.CanvasTexture(c);
  FLAME_TEX.colorSpace = THREE.SRGBColorSpace;
  return FLAME_TEX;
}

// Licking flames: camera-facing tongues that are born at the fuel, stretch,
// sway and fade. intensity 0 hides them, 1 is a full fire.
export class FireSprites {
  constructor({ count = 14, area = [1, 0.3], height = 0.35, width = 0.14, hdr = 2.4 } = {}) {
    this.group = new THREE.Group();
    this.group.userData.dynamic = true;
    this.intensity = 0;
    this.area = area; this.height = height; this.width = width;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: flameTexture(), color: new THREE.Color(hdr, hdr * 0.8, hdr * 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.center.set(0.5, 0);
      this.group.add(s);
      this.items.push({ s, life: Math.random(), speed: 0.9 + Math.random() * 0.8, x: (Math.random() - 0.5) * area[0], z: (Math.random() - 0.5) * area[1], k: 0.7 + Math.random() * 0.6 });
    }
  }
  update(dt, t) {
    const on = this.intensity > 0.01;
    for (const p of this.items) {
      p.s.visible = on;
      if (!on) continue;
      p.life += dt * p.speed * 1.6;
      if (p.life >= 1) {
        p.life -= 1;
        p.x = (Math.random() - 0.5) * this.area[0];
        p.z = (Math.random() - 0.5) * this.area[1];
        p.k = 0.7 + Math.random() * 0.6;
      }
      const L = p.life;
      const grow = Math.sin(Math.PI * Math.min(1, L * 1.1));
      p.s.position.set(p.x + Math.sin(t * 5 + p.z * 20) * 0.02 * L, L * this.height * 0.25, p.z);
      p.s.scale.set(this.width * p.k * (1 - L * 0.4), this.height * p.k * this.intensity * (0.4 + grow), 1);
      p.s.material.opacity = grow * Math.min(1, this.intensity * 1.2);
    }
  }
}
