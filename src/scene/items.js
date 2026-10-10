// Movable work-in-progress: plated courses, sauté pans, sheet trays and
// ingredient portions that travel between stations and to the pass.
import * as THREE from 'three';
import { lathe, cyl, rbox, rod, hash01 } from './kit.js';

const PALETTES = [
  { protein: 0xd2452a, sauce: 0xf3e3a6, garnish: 0x3f8a2c },  // lobster, beurre blanc, chive
  { protein: 0x9e3b3b, sauce: 0x3d1414, garnish: 0xf07a22 },  // lamb, bordelaise, carrot
  { protein: 0xf1ece2, sauce: 0xf2d98a, garnish: 0x1d1c1a },  // halibut, sabayon, caviar
  { protein: 0xb4475a, sauce: 0x5a2a1a, garnish: 0x6b5236 },  // wagyu, jus, morels
  { protein: 0xe8c9a0, sauce: 0x8a2a3a, garnish: 0x7cc04a },  // foie gras, gastrique, greens
  { protein: 0x3a2116, sauce: 0xfdfbf3, garnish: 0xc8212c },  // chocolate, crème, berries
];

function plateGeometry(M, kind) {
  if (kind === 'bowl') {
    return lathe([[0, 0], [0.05, 0], [0.06, 0.008], [0.11, 0.05], [0.13, 0.055], [0.125, 0.06], [0.1, 0.048], [0.055, 0.012], [0, 0.01]], M.porcelain, 40);
  }
  // wide-rim fine-dining plate, 30 cm
  return lathe([[0, 0], [0.07, 0], [0.075, 0.006], [0.08, 0.012], [0.15, 0.022], [0.152, 0.026], [0.148, 0.027], [0.078, 0.016], [0.07, 0.012], [0, 0.012]], M.porcelain, 48);
}

function plated(dishId, M, colors = {}) {
  const g = new THREE.Group();
  const h = hash01(dishId || 'dish');
  const pal = { ...PALETTES[Math.floor(h * PALETTES.length)], ...colors };
  const bowl = /oyster|soup|velout|pearl/i.test(dishId || '');
  g.add(plateGeometry(M, bowl ? 'bowl' : 'plate'));
  const base = bowl ? 0.03 : 0.013;
  // sauce pool / swoosh
  const sauceMat = new THREE.MeshPhysicalMaterial({ color: pal.sauce, roughness: 0.1, clearcoat: 1 });
  const sauce = new THREE.Mesh(new THREE.CircleGeometry(bowl ? 0.09 : 0.045, 32), sauceMat);
  sauce.rotation.x = -Math.PI / 2;
  sauce.position.set(bowl ? 0 : 0.01, base, 0);
  if (!bowl) sauce.scale.set(1.6, 0.8, 1);
  g.add(sauce);
  // protein
  const pMat = new THREE.MeshPhysicalMaterial({ color: pal.protein, roughness: 0.45, clearcoat: 0.3 });
  const protein = rbox(0.06, 0.025, 0.035, pMat, { r: 0.01 });
  protein.position.set(-0.01, base + 0.001, 0);
  protein.rotation.y = h * 3;
  g.add(protein);
  // garnish dots and leaves
  const gMat = new THREE.MeshStandardMaterial({ color: pal.garnish, roughness: 0.5 });
  for (let i = 0; i < 7; i++) {
    const a = h * 20 + i * 0.9;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.005 + (i % 3) * 0.002, 8, 6), gMat);
    dot.position.set(Math.cos(a) * 0.05, base + 0.004, Math.sin(a) * 0.035);
    g.add(dot);
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.008, 6), leafMat);
    leaf.position.set(-0.01 + i * 0.008, base + 0.03, 0.003 * i);
    leaf.rotation.set(-1.2 + i * 0.3, i, 0);
    g.add(leaf);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function sautePan(M) {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.11, 0], [0.12, 0.01], [0.125, 0.06], [0.12, 0.06], [0.115, 0.012], [0, 0.006]], M.polished, 36));
  g.add(rod([0.12, 0.05, 0], [0.34, 0.09, 0], 0.01, M.steelDark));
  return g;
}

function sheetTray(M) {
  const g = new THREE.Group();
  g.add(rbox(0.33, 0.02, 0.45, M.steel, { r: 0.006 }));
  return g;
}

function cocotte(M) {
  const g = new THREE.Group();
  const enamel = new THREE.MeshPhysicalMaterial({ color: 0x1d3b6a, roughness: 0.3, clearcoat: 0.8 });
  g.add(cyl(0.11, 0.1, 0.1, enamel, { seg: 28 }));
  const lid = cyl(0.112, 0.112, 0.02, enamel, { seg: 28 });
  lid.position.y = 0.1;
  g.add(lid);
  const knob = cyl(0.02, 0.02, 0.02, M.brass, { seg: 12 });
  knob.position.y = 0.12;
  g.add(knob);
  return g;
}

export class Item {
  constructor(id, spec, M) {
    this.id = id;
    this.kind = spec.kind || 'plate';
    this.dishId = spec.dishId;
    this.label = spec.label;
    let obj;
    switch (this.kind) {
      case 'pan': obj = sautePan(M); break;
      case 'tray': obj = sheetTray(M); break;
      case 'pot': obj = cocotte(M); break;
      case 'ingredient': {
        const c = new THREE.Color(spec.color ?? new THREE.Color().setHSL(hash01(spec.ingredientId || id), 0.5, 0.5));
        obj = rbox(0.12, 0.05, 0.08, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.3 }), { r: 0.015 });
        break;
      }
      default: obj = plated(spec.dishId, M, spec.colors);
    }
    this.object = new THREE.Group();
    this.object.add(obj);
    this.object.name = `item:${id}`;
    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = 0.04;
    pick.userData.pick = { type: 'item', id };
    this.object.add(pick);
    this.tween = null;
    this.carrier = null;
    this.at = null;
  }

  // Slide along an arc from current world position to target over seconds.
  moveTo(target, seconds, onDone) {
    const from = this.object.position.clone();
    this.tween = { from, to: target.clone(), t: 0, dur: Math.max(0.05, seconds), onDone };
  }

  update(dt) {
    if (this.carrier) {
      this.carrier.carry.getWorldPosition(this.object.position);
      this.object.rotation.y = this.carrier.yaw;
      return;
    }
    if (!this.tween) return;
    const tw = this.tween;
    tw.t += dt / tw.dur;
    const k = Math.min(1, tw.t);
    const e = k * k * (3 - 2 * k);
    this.object.position.lerpVectors(tw.from, tw.to, e);
    this.object.position.y += Math.sin(Math.PI * k) * Math.min(0.25, tw.from.distanceTo(tw.to) * 0.15);
    if (k >= 1) { this.tween = null; tw.onDone?.(); }
  }
}
