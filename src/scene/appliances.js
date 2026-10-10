// Commercial kitchen equipment, modelled at real-world dimensions (metres).
// Every builder returns an Appliance: a Three.js group plus the live parts
// (flames, glowing elements, steam, status LED) the simulation can drive.
import * as THREE from 'three';
import {
  rbox, box, cyl, sphere, torus, lathe, at, add, rod, legs, worktable,
  SteamEmitter, lerp, clamp01,
} from './kit.js';

export const STATE_COLORS = {
  off: 0x3a3d40,
  preheating: 0xffa21f,
  idle: 0x2fd16b,
  busy: 0x3aa0ff,
  fault: 0xff3b30,
};

export class Appliance {
  constructor(id, type, name, w, d, h) {
    this.id = id; this.type = type; this.name = name;
    this.size = { w, d, h };
    this.group = new THREE.Group();
    this.group.name = id;
    this.state = 'off';
    this.info = {};
    this.heat = 0;           // 0..1 smoothed thermal output (drives glows)
    this.targetHeat = 0;
    this.animators = [];     // (dt, t, appliance) => void
    this.emitters = [];
    this.lights = [];
    this.slots = [];         // local positions where pans/plates sit
    this.slotUse = 0;
    this.blink = 0;
  }
  addLed(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: STATE_COLORS.off, emissiveIntensity: 0.4 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), mat);
    led.position.set(x, y, z);
    led.userData.dynamic = true;
    this.group.add(led);
    this.led = led;
    return led;
  }
  setState(state, info = {}) {
    this.state = state;
    this.info = { ...this.info, ...info };
    this.targetHeat = { off: 0, preheating: 0.55, idle: 0.6, busy: 1, fault: 0 }[state] ?? 0;
    if (this.led) this.led.material.emissive.set(STATE_COLORS[state] ?? STATE_COLORS.off);
  }
  update(dt, t) {
    const rate = this.state === 'preheating' ? 0.25 : 1.2;
    this.heat += (this.targetHeat - this.heat) * Math.min(1, dt * rate);
    if (this.led) {
      const blinking = this.state === 'preheating' || this.state === 'fault';
      const on = !blinking || Math.sin(t * (this.state === 'fault' ? 12 : 5)) > 0;
      this.led.material.emissiveIntensity = this.state === 'off' ? 0.3 : on ? 6 : 0.4;
    }
    for (const a of this.animators) a(dt, t, this);
    for (const e of this.emitters) e.update(dt);
  }
  // Next free resting spot for an item placed on this appliance.
  nextSlot() {
    if (!this.slots.length) return new THREE.Vector3(0, this.size.h + 0.02, 0);
    const s = this.slots[this.slotUse % this.slots.length];
    this.slotUse++;
    return s.clone();
  }
}

// --------------------------------------------------------------- shared parts

export function knobRow(app, M, w, y, z, n) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / (n + 1)) * (i + 1);
    const k = cyl(0.022, 0.026, 0.03, M.plasticBlack, { seg: 16 });
    k.rotation.x = Math.PI / 2;
    k.position.set(x, y, z + 0.015);
    app.group.add(k);
    const ptr = box(0.004, 0.02, 0.004, M.chrome);
    ptr.position.set(x, y + 0.008, z + 0.032);
    app.group.add(ptr);
  }
}

// Ring of small flame cones for an open burner; scaled by heat each frame.
export function flameRing(radius, count = 18) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const g = new THREE.ConeGeometry(0.009, 0.05, 6, 1, true);
    g.translate(0, 0.025, 0);
    g.rotateZ(-0.35);
    g.rotateY(-a);
    g.translate(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    geos.push(g);
  }
  const merged = mergeSimple(geos);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 0.6, 3.2), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(merged, mat);
  m.userData.dynamic = true;
  return m;
}

function mergeSimple(geos) {
  let total = 0;
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// Cast-iron trivet grate over an open burner.
export function grate(M, size) {
  const g = new THREE.Group();
  const bars = 5;
  for (let i = 0; i < bars; i++) {
    const off = -size / 2 + (size / (bars - 1)) * i;
    add(g, at(rbox(size, 0.018, 0.016, M.castIron, { r: 0.004 }), 0, 0, off));
    add(g, at(rbox(0.016, 0.018, size, M.castIron, { r: 0.004 }), off, 0, 0));
  }
  return g;
}

export function burner(M) {
  const g = new THREE.Group();
  add(g, cyl(0.07, 0.08, 0.02, M.castIron, { seg: 24 }));
  add(g, at(cyl(0.035, 0.035, 0.012, M.brass, { seg: 20 }), 0, 0.02, 0));
  return g;
}

export function ovenDoor(M, w, h, z) {
  const g = new THREE.Group();
  add(g, at(rbox(w, h, 0.03, M.steel, { r: 0.006 }), 0, 0, z));
  add(g, rod([-w / 2 + 0.06, h - 0.06, z + 0.06], [w / 2 - 0.06, h - 0.06, z + 0.06], 0.012, M.polished));
  add(g, rod([-w / 2 + 0.06, h - 0.06, z + 0.03], [-w / 2 + 0.06, h - 0.06, z + 0.06], 0.008, M.polished));
  add(g, rod([w / 2 - 0.06, h - 0.06, z + 0.03], [w / 2 - 0.06, h - 0.06, z + 0.06], 0.008, M.polished));
  return g;
}

export function flueAndPlinth(app, M, w, d) {
  // Rear flue riser and toe-kick plinth found on heavy-duty ranges.
  add(app.group, at(rbox(w, 0.22, 0.08, M.steel, { r: 0.006 }), 0, 0.9, -d / 2 + 0.04));
  add(app.group, at(rbox(w - 0.04, 0.012, 0.06, M.filterMesh, { r: 0.002 }), 0, 1.12, -d / 2 + 0.04));
  add(app.group, at(rbox(w - 0.02, 0.1, d - 0.06, M.blackSteel, { r: 0.004 }), 0, 0, -0.01));
}

// --------------------------------------------------------------- appliances

// Heavy-duty range in the style of a Bonnet / Molteni suite: French top
// (concentric solid-top rings hottest at centre) plus two open burners,
// static oven below, and a polished front rail.
// Heavy-duty open-burner range (Hestan style): stainless body, cast-iron
// grates over a grid of burners, two ovens below, signature red knobs.
export function buildRange(id, name, M, { w = 1.8, d = 0.9, h = 0.92, burners = 6 } = {}) {
  const app = new Appliance(id, 'range', name, w, d, h);
  const g = app.group;
  flueAndPlinth(app, M, w, d);
  add(g, at(rbox(w, h - 0.14, d, M.steel, { r: 0.012 }), 0, 0.1, 0));
  add(g, at(rbox(w + 0.004, 0.05, d, M.steel, { r: 0.01 }), 0, h - 0.05, 0));
  add(g, at(rbox(w - 0.04, 0.012, d - 0.1, M.blackSteel, { r: 0.003 }), 0, h - 0.004, -0.02));
  add(g, rod([-w / 2 + 0.02, h - 0.1, d / 2 + 0.06], [w / 2 - 0.02, h - 0.1, d / 2 + 0.06], 0.014, M.polished));
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) add(g, rod([x, h - 0.1, d / 2], [x, h - 0.1, d / 2 + 0.06], 0.012, M.polished));
  const doors = w > 1.3 ? 2 : 1;
  for (let i = 0; i < doors; i++) add(g, at(ovenDoor(M, w / doors - 0.06, 0.5, 0), -w / 2 + (w / doors) * (i + 0.5), 0.15, d / 2));
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xb3171e, roughness: 0.35, metalness: 0.2 });
  const cols = Math.ceil(burners / 2);
  for (let i = 0; i < burners; i++) {
    const k = cyl(0.024, 0.028, 0.035, knobMat, { seg: 18 });
    k.rotation.x = Math.PI / 2;
    k.position.set(-w / 2 + (w / (burners + 1)) * (i + 1), h - 0.17, d / 2 + 0.015);
    g.add(k);
  }
  app.addLed(w / 2 - 0.05, h - 0.12, d / 2 + 0.006);
  const flames = [];
  const cw = (w - 0.06) / cols;
  for (let c = 0; c < cols; c++) {
    for (const bz of [-0.2, 0.17]) {
      const bx = -w / 2 + 0.03 + cw * (c + 0.5);
      add(g, at(burner(M), bx, h, bz));
      add(g, at(grate(M, Math.min(0.34, cw - 0.02)), bx, h + 0.045, bz));
      const f = flameRing(0.05);
      f.position.set(bx, h + 0.022, bz);
      g.add(f);
      flames.push(f);
      app.slots.push(new THREE.Vector3(bx, h + 0.065, bz));
    }
  }
  const light = new THREE.PointLight(0x5a8cff, 0, 1.4, 2);
  light.position.set(0, h + 0.15, 0);
  g.add(light);
  const steam = new SteamEmitter({ area: [w * 0.6, 0.4], height: 1.1, size: 0.3 });
  steam.points.position.set(0, h + 0.1, 0);
  g.add(steam.points);
  app.emitters.push(steam);
  app.animators.push((dt, t, a) => {
    const lit = a.state !== 'off' && a.state !== 'fault';
    const n = lit ? (a.state === 'busy' ? Math.max(1, Math.round((a.info.load ?? 0.7) * flames.length)) : 2) : 0;
    flames.forEach((f, i) => {
      f.visible = i < n;
      const flick = 0.85 + Math.sin(t * 31 + i * 7) * 0.08 + Math.random() * 0.08;
      f.scale.set(1, (a.state === 'busy' ? 1 : 0.5) * flick, 1);
    });
    light.intensity = n ? 0.3 * n * (0.9 + Math.random() * 0.1) : 0;
    steam.intensity = a.state === 'busy' ? 1 : 0;
  });
  return app;
}

// Wall-mounted salamander broiler (sits above a range).
export function buildSalamander(id, name, M, { w = 0.6, d = 0.45, h = 0.45 } = {}) {
  const app = new Appliance(id, 'salamander', name, w, d, h);
  const g = app.group;
  // body hollow: top, back, sides, bottom tray
  add(g, at(rbox(w, 0.18, d, M.steel, { r: 0.01 }), 0, h - 0.18, 0));
  add(g, at(rbox(w, h, 0.03, M.steel, { r: 0.004 }), 0, 0, -d / 2 + 0.015));
  for (const s of [-1, 1]) add(g, at(rbox(0.03, h, d, M.steel, { r: 0.004 }), s * (w / 2 - 0.015), 0, 0));
  add(g, at(rbox(w - 0.06, 0.03, d - 0.06, M.steelDark, { r: 0.004 }), 0, 0.02, 0.0));
  // rack
  add(g, at(rbox(w - 0.1, 0.008, d - 0.1, new THREE.MeshStandardMaterial({ color: 0xbfc2c4, metalness: 1, roughness: 0.3, wireframe: true })), 0, 0.12, 0));
  // glowing ceramic elements
  const elMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: 0xff4810, emissiveIntensity: 0, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const el = rbox(w - 0.14, 0.02, 0.06, elMat, { r: 0.004, shadow: false });
    el.position.set(0, h - 0.205, -d / 2 + 0.08 + i * 0.09);
    el.userData.dynamic = true;
    g.add(el);
  }
  knobRow(app, M, 0.25, h - 0.09, d / 2, 2);
  g.children[g.children.length - 1].position.x += w / 2 - 0.15;
  g.children[g.children.length - 2].position.x += w / 2 - 0.15;
  g.children[g.children.length - 3].position.x += w / 2 - 0.15;
  g.children[g.children.length - 4].position.x += w / 2 - 0.15;
  app.addLed(-w / 2 + 0.06, h - 0.09, d / 2 + 0.006);
  const glow = new THREE.PointLight(0xff6a2a, 0, 1.0, 2);
  glow.position.set(0, h - 0.25, 0.05);
  g.add(glow);
  app.slots = [new THREE.Vector3(0, 0.13, 0.02)];
  app.animators.push((dt, t, a) => {
    elMat.emissiveIntensity = a.heat * a.heat * 4.5 * (0.95 + Math.sin(t * 3) * 0.05);
    glow.intensity = a.heat * 1.5;
  });
  return app;
}

// Rational-style combi oven on a stand: dark glass door, touchscreen, steam.
export function buildCombi(id, name, M) {
  const w = 0.85, d = 0.8, h = 1.65;
  const app = new Appliance(id, 'combi', name, w, d, h);
  const g = app.group;
  // stand
  const stand = new THREE.Group();
  legs(stand, w - 0.02, d - 0.05, 0.6, M, { shelf: true });
  add(stand, at(rbox(w - 0.02, 0.03, d - 0.05, M.steel), 0, 0.57, 0));
  g.add(stand);
  const body = rbox(w, 1.02, d, M.steel, { r: 0.02 });
  body.position.y = 0.6;
  g.add(body);
  // door: dark glass panel with steel frame on left 3/4
  const doorW = w * 0.74;
  add(g, at(rbox(doorW, 0.92, 0.04, M.blackSteel, { r: 0.014 }), -w / 2 + doorW / 2 + 0.02, 0.65, d / 2));
  add(g, at(rbox(doorW - 0.08, 0.8, 0.012, M.glassDark, { r: 0.01 }), -w / 2 + doorW / 2 + 0.02, 0.71, d / 2 + 0.04));
  // interior glow behind the glass
  const inner = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb15a, emissiveIntensity: 0 });
  const innerPanel = box(doorW - 0.12, 0.74, 0.005, inner, { shadow: false });
  innerPanel.position.set(-w / 2 + doorW / 2 + 0.02, 1.08, d / 2 + 0.035);
  innerPanel.userData.dynamic = true;
  g.add(innerPanel);
  // rack silhouettes visible through glass
  for (let i = 0; i < 6; i++) {
    add(g, at(box(doorW - 0.14, 0.006, 0.006, M.blackSteel), -w / 2 + doorW / 2 + 0.02, 0.8 + i * 0.12, d / 2 + 0.038));
  }
  // handle
  add(g, rod([-w / 2 + doorW - 0.03, 0.85, d / 2 + 0.06], [-w / 2 + doorW - 0.03, 1.35, d / 2 + 0.06], 0.014, M.polished));
  // control panel with touch screen and dial
  const panelX = w / 2 - (w - doorW) / 2 + 0.005;
  add(g, at(rbox(w - doorW - 0.03, 0.92, 0.03, M.blackSteel, { r: 0.008 }), panelX, 0.65, d / 2));
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x1b6dff, emissiveIntensity: 0, roughness: 0.15 });
  const screen = box(0.15, 0.2, 0.004, screenMat, { shadow: false });
  screen.position.set(panelX, 1.38, d / 2 + 0.017);
  screen.userData.dynamic = true;
  g.add(screen);
  const dial = cyl(0.04, 0.04, 0.025, M.chrome, { seg: 32 });
  dial.rotation.x = Math.PI / 2;
  dial.position.set(panelX, 1.12, d / 2 + 0.015);
  g.add(dial);
  app.addLed(panelX, 1.22, d / 2 + 0.018);
  // vent stack
  add(g, at(cyl(0.035, 0.035, 0.08, M.steel), -w / 2 + 0.1, 1.62, -d / 2 + 0.12));
  const steam = new SteamEmitter({ area: [0.08, 0.08], height: 0.9, size: 0.28, opacity: 0.22 });
  steam.points.position.set(-w / 2 + 0.1, 1.7, -d / 2 + 0.12);
  g.add(steam.points);
  app.emitters.push(steam);
  app.slots = [new THREE.Vector3(0, h + 0.005, 0)];
  app.animators.push((dt, t, a) => {
    inner.emissiveIntensity = a.state === 'busy' ? 1.6 : a.heat * 0.6;
    screenMat.emissiveIntensity = a.state === 'off' ? 0.05 : 1.4;
    steam.intensity = a.state === 'busy' ? 1 : a.state === 'preheating' ? 0.3 : 0;
  });
  return app;
}

// Pacojet: compact countertop micro-puree machine.
export function buildPacojet(id, name, M) {
  const w = 0.2, d = 0.36, h = 0.5;
  const app = new Appliance(id, 'pacojet', name, w, d, h);
  const g = app.group;
  add(g, rbox(w, 0.08, d, M.plasticWhite, { r: 0.02 }));
  add(g, at(rbox(w, 0.42, 0.12, M.plasticWhite, { r: 0.03 }), 0, 0.08, -d / 2 + 0.06));
  add(g, at(rbox(w, 0.08, d - 0.04, M.plasticWhite, { r: 0.03 }), 0, 0.42, -0.02));
  add(g, at(cyl(0.06, 0.06, 0.13, M.polished, { seg: 24 }), 0, 0.08, 0.05));
  const bowlCover = cyl(0.075, 0.075, 0.2, M.polyCarbonate, { seg: 24, shadow: false });
  bowlCover.position.set(0, 0.1, 0.05);
  g.add(bowlCover);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x9af27b, emissiveIntensity: 0 });
  add(g, at(box(0.07, 0.03, 0.004, scrMat, { shadow: false }), 0, 0.46, d / 2 - 0.02));
  app.addLed(0.05, 0.46, d / 2 - 0.018);
  app.animators.push((dt, t, a) => { scrMat.emissiveIntensity = a.state === 'off' ? 0 : 1.2; });
  return app;
}

// Hood-type dishwasher between soiled and clean landing tables.
export function buildDishwasher(id, name, M, { w: total = 1.8, d = 0.8, h: totalH = 1.9 } = {}) {
  const w = 0.75, h = 1.5;
  const app = new Appliance(id, 'dishwasher', name, total, d, totalH);
  const g = app.group;
  add(g, at(rbox(w, 0.85, d, M.steel, { r: 0.01 }), 0, 0, 0));
  const side = (total - w) / 2;
  if (side > 0.1) {
    for (const s of [-1, 1]) {
      const t = worktable(M, side, d, { h: 0.9, splash: true });
      t.position.x = s * (w / 2 + side / 2);
      g.add(t);
    }
    // dish racks waiting on the soiled side, clean plates on the other
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x2f5f9a, roughness: 0.6 });
    add(g, at(rbox(0.5, 0.1, 0.5, rackMat, { r: 0.01 }), -(w / 2 + side / 2), 0.9, 0));
    for (let k = 0; k < 10; k++) add(g, at(lathe([[0, 0], [0.12, 0], [0.145, 0.018], [0.14, 0.02], [0, 0.008]], M.porcelain, 28), w / 2 + side / 2, 0.9 + k * 0.022, 0));
  }
  const hood = new THREE.Group();
  add(hood, at(rbox(w + 0.02, 0.5, d + 0.02, M.steel, { r: 0.01 }), 0, 0, 0));
  add(hood, rod([-w / 2, 0.42, d / 2 + 0.05], [w / 2, 0.42, d / 2 + 0.05], 0.014, M.polished));
  hood.position.y = 0.9;
  hood.userData.dynamic = true;
  g.add(hood);
  add(g, at(rbox(w, 0.25, 0.3, M.steel, { r: 0.01 }), 0, 1.42, -d / 2 + 0.15));
  const scr = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff8833, emissiveIntensity: 0 });
  add(g, at(box(0.1, 0.04, 0.004, scr, { shadow: false }), 0, 1.6, -d / 2 + 0.302));
  app.addLed(0.1, 1.6, -d / 2 + 0.304);
  const steam = new SteamEmitter({ area: [0.6, 0.6], height: 0.8, size: 0.4, opacity: 0.25 });
  steam.points.position.set(0, 1.0, 0.2);
  g.add(steam.points);
  app.emitters.push(steam);
  app.slots = [new THREE.Vector3(0, 0.88, 0)];
  app.animators.push((dt, t, a) => {
    const busy = a.state === 'busy';
    hood.position.y = lerp(hood.position.y, busy ? 0.86 : 1.22, Math.min(1, dt * 3));
    scr.emissiveIntensity = a.state === 'off' ? 0 : 1.5;
    steam.intensity = !busy && hood.position.y > 1.0 && a.heat > 0.4 ? 0.8 : busy ? 0.15 : 0;
  });
  return app;
}

// Bread deck oven with three stone decks.
export function buildDeckOven(id, name, M, { w = 1.4, d = 1.2, h = 1.6 } = {}) {
  const app = new Appliance(id, 'deck-oven', name, w, d, h);
  const g = app.group;
  legs(g, w - 0.04, d - 0.1, 0.35, M, { shelf: false });
  add(g, at(rbox(w, h - 0.4, d, M.blackSteel, { r: 0.015 }), 0, 0.35, 0));
  const glows = [];
  const decks = h < 1.7 ? 2 : 3;
  const pitch = (h - 0.55) / decks;
  for (let i = 0; i < decks; i++) {
    const y = 0.45 + i * pitch;
    add(g, at(rbox(w - 0.3, pitch - 0.12, 0.04, M.steel, { r: 0.008 }), -0.08, y, d / 2));
    const glowMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff9a40, emissiveIntensity: 0 });
    const win = box(w * 0.45, 0.12, 0.004, glowMat, { shadow: false });
    win.position.set(-0.08, y + pitch / 2 - 0.04, d / 2 + 0.022);
    win.userData.dynamic = true;
    g.add(win);
    glows.push(glowMat);
    add(g, rod([-w / 2 + 0.15, y + pitch - 0.16, d / 2 + 0.05], [w / 2 - 0.3, y + pitch - 0.16, d / 2 + 0.05], 0.011, M.polished));
    const scr = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3322, emissiveIntensity: 1 });
    add(g, at(box(0.06, 0.025, 0.004, scr, { shadow: false }), w / 2 - 0.12, y + pitch / 2, d / 2 + 0.002));
  }
  app.addLed(w / 2 - 0.12, h - 0.15, d / 2 + 0.004);
  app.animators.push((dt, t, a) => {
    glows.forEach((m, i) => { m.emissiveIntensity = a.state === 'busy' ? 1.5 : a.heat * 0.6; });
  });
  return app;
}

// Heat-lamp strip for the pass (orange glow, lights the plates).
export function buildHeatLamps(id, name, M, length = 4.6) {
  const app = new Appliance(id, 'heat-lamp', name, length, 0.25, 0.1);
  const g = app.group;
  const lampMats = [];
  const n = Math.round(length / 0.6);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n);
    add(g, at(rbox(length / n - 0.04, 0.07, 0.22, M.steel, { r: 0.01 }), x, 0, 0));
    const lm = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a1a, emissiveIntensity: 0 });
    const tube = box(length / n - 0.1, 0.006, 0.04, lm, { shadow: false });
    tube.position.set(x, -0.004, 0);
    tube.userData.dynamic = true;
    g.add(tube);
    lampMats.push(lm);
  }
  const warm = new THREE.SpotLight(0xff9a50, 0, 3, Math.PI / 2.4, 0.8, 1.5);
  warm.position.set(0, -0.05, 0);
  warm.target.position.set(0, -1, 0);
  g.add(warm, warm.target);
  app.addLed(length / 2 - 0.1, 0.035, 0.112);
  app.animators.push((dt, t, a) => {
    for (const m of lampMats) m.emissiveIntensity = a.heat * 3.2;
    warm.intensity = a.heat * 6;
  });
  return app;
}

