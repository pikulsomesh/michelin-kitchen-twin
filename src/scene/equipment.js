// The French Laundry equipment schedule, modelled from data/resources.json.
// buildEquipment() maps each equipment record to a detailed 3D model at its
// published (or estimated) dimensions; every model is an Appliance with live
// state visuals the simulation can drive.
import * as THREE from 'three';
import {
  rbox, box, cyl, sphere, torus, lathe, at, add, rod, legs, worktable,
  SteamEmitter, FireSprites, lerp, clamp01, hash01,
} from './kit.js';
import {
  Appliance, buildRange, buildSalamander, buildCombi, buildPacojet, buildDishwasher,
  buildDeckOven, buildHeatLamps, flameRing, grate, burner, ovenDoor, knobRow,
} from './appliances.js';

// ------------------------------------------------------------ cooking zones
// A zone is one cooking position on a suite: a solid top, a plancha half,
// a burner, an induction plate or an oven. Suites light up as many zones as
// the simulation says are busy, so a 12-slot suite reads like 12 machines.

function solidTop(M, w, d, h) {
  const g = new THREE.Group();
  add(g, at(rbox(w, 0.025, d, M.castIron, { r: 0.004 }), 0, h - 0.025, 0));
  const zones = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x262628, metalness: 0.6, roughness: 0.55, emissive: 0xff3a0a, emissiveIntensity: 0 });
    const rings = [];
    for (const [r0, r1] of [[0, 0.06], [0.08, 0.13], [0.15, 0.19]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, h + 0.001, 0);
      ring.userData.dynamic = true;
      g.add(ring);
      rings.push(ring);
    }
    zones.push({
      slot: new THREE.Vector3(x, h + 0.004, 0),
      set: (k) => { mat.emissiveIntensity = k * k * 1.6; },
    });
  }
  return { group: g, zones };
}

function planchaTop(M, w, d, h) {
  const g = new THREE.Group();
  const zones = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc4c7c9, metalness: 1, roughness: 0.16, emissive: 0xff4a10, emissiveIntensity: 0 });
    const plate = rbox(w / 2 - 0.01, 0.02, d, mat, { r: 0.003 });
    plate.position.set(-w / 4 + (i * w) / 2, h - 0.02, 0);
    plate.userData.dynamic = true;
    g.add(plate);
    zones.push({ slot: new THREE.Vector3(plate.position.x, h + 0.002, 0), set: (k) => { mat.emissiveIntensity = k * 0.07; } });
  }
  // grease gutter
  add(g, at(rbox(w, 0.02, 0.05, M.steelDark, { r: 0.003 }), 0, h - 0.03, d / 2 + 0.025));
  return { group: g, zones };
}

function burnerTop(M, w, d, h) {
  const g = new THREE.Group();
  add(g, at(rbox(w, 0.012, d, M.blackSteel, { r: 0.003 }), 0, h - 0.012, 0));
  const zones = [];
  const n = Math.max(1, Math.round(w / 0.4));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    add(g, at(burner(M), x, h - 0.01, 0));
    add(g, at(grate(M, Math.min(0.34, w / n - 0.04)), x, h + 0.035, 0));
    const f = flameRing(0.05);
    f.position.set(x, h + 0.012, 0);
    f.visible = false;
    g.add(f);
    zones.push({
      slot: new THREE.Vector3(x, h + 0.055, 0),
      set: (k, t) => { f.visible = k > 0.05; f.scale.set(1, k * (0.85 + Math.sin(t * 31 + i * 3) * 0.08 + Math.random() * 0.08), 1); },
    });
  }
  return { group: g, zones };
}

function inductionTop(M, w, d, h, n = 2) {
  const g = new THREE.Group();
  add(g, at(rbox(w - 0.02, 0.008, d - 0.02, M.ceramicGlass, { r: 0.003 }), 0, h - 0.008, 0));
  const zones = [];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    const outline = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.134, 48), new THREE.MeshBasicMaterial({ color: 0x5a5a5a }));
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(x, h + 0.001, 0);
    g.add(outline);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.1), transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.12, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, h + 0.0015, 0);
    ring.userData.dynamic = true;
    g.add(ring);
    zones.push({ slot: new THREE.Vector3(x, h + 0.002, 0), set: (k) => { mat.opacity = k > 0.05 ? 0.4 + k * 0.5 : 0; } });
  }
  return { group: g, zones };
}

// Held sauces in a bain-marie well: steaming inserts.
function bainWell(M, w, d, h) {
  const g = new THREE.Group();
  add(g, at(rbox(w, 0.01, d, M.steelDark, { r: 0.003 }), 0, h - 0.01, 0));
  const water = rbox(w - 0.04, 0.005, d - 0.04, M.water, { r: 0.002, shadow: false });
  water.position.y = h - 0.03;
  g.add(water);
  const steam = new SteamEmitter({ count: 24, area: [w * 0.8, d * 0.6], height: 0.5, size: 0.18, opacity: 0.12 });
  steam.points.position.set(0, h, 0);
  g.add(steam.points);
  const slots = [];
  const n = Math.max(1, Math.floor(w / 0.17));
  for (let i = 0; i < n; i++) slots.push(new THREE.Vector3(-w / 2 + (w / n) * (i + 0.5), h - 0.12, 0));
  return { group: g, zones: [], steam, holdSlots: slots };
}

function worktop(M, w, d, h, mat) {
  const g = new THREE.Group();
  add(g, at(rbox(w, 0.03, d, mat || M.steel, { r: 0.004, uv: mat ? 0.8 : 0 }), 0, h - 0.03, 0));
  return { group: g, zones: [], work: true };
}

const MODULES = { solidtop: solidTop, plancha: planchaTop, burners: burnerTop, induction: inductionTop, bain: bainWell, worktop };

// Bonnet island cooking suite: a monolithic double-sided block with a
// polished rail all round, ovens under the solid tops and a raised centre
// spine with an overshelf. `sides` lists modules per side (north = +z).
function buildSuite(id, name, M, { w, d, h }, sides, { generator = false } = {}) {
  const app = new Appliance(id, 'cooking-suite', name, w, d, h);
  const g = app.group;
  // plinth and body
  add(g, at(rbox(w - 0.06, 0.1, d - 0.12, M.blackSteel, { r: 0.004 }), 0, 0, 0));
  add(g, at(rbox(w, h - 0.18, d, M.steel, { r: 0.015 }), 0, 0.1, 0));
  add(g, at(rbox(w + 0.02, 0.06, d + 0.02, M.steel, { r: 0.012 }), 0, h - 0.08, 0));
  // central spine
  add(g, at(rbox(w - 0.1, 0.22, 0.16, M.steel, { r: 0.01 }), 0, h - 0.02, 0));
  for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3 + 1e-6; x += (w - 0.6) / Math.max(1, Math.round((w - 0.6) / 1.5))) {
    add(g, rod([x, h + 0.2, 0], [x, 1.42, 0], 0.016, M.polished));
  }
  add(g, at(rbox(w - 0.3, 0.025, 0.36, M.steel, { r: 0.005 }), 0, 1.42, 0));
  add(g, at(rbox(w - 0.3, 0.03, 0.03, M.brass, { r: 0.008 }), 0, 1.445, 0.18));
  add(g, at(rbox(w - 0.3, 0.03, 0.03, M.brass, { r: 0.008 }), 0, 1.445, -0.18));
  // brass corner caps (a Bonnet signature)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, at(cyl(0.03, 0.03, h - 0.12, M.brass, { seg: 16 }), sx * (w / 2 - 0.02), 0.1, sz * (d / 2 - 0.02)));

  const zones = [];
  const holdSlots = [];
  const work = [];
  const steams = [];
  const sd = d / 2 - 0.12;   // usable depth per side, outside the spine
  for (const [sideName, mods] of Object.entries(sides)) {
    const s = sideName === 'north' ? 1 : -1;
    const total = mods.reduce((a, m) => a + m.w, 0);
    let x = -total / 2;
    const zc = s * (0.08 + sd / 2 + 0.02);
    for (const m of mods) {
      const mod = MODULES[m.type](M, m.w - 0.02, sd - 0.06, h, m.n ?? m.mat);
      mod.group.position.set(x + m.w / 2, 0, zc);
      g.add(mod.group);
      for (const z of mod.zones) {
        z.slot.add(mod.group.position);
        z.side = sideName;
        zones.push(z);
      }
      if (mod.holdSlots) for (const p of mod.holdSlots) holdSlots.push(p.add(mod.group.position));
      if (mod.steam) steams.push(mod.steam);
      if (mod.work) work.push(new THREE.Vector3(x + m.w / 2, h, zc));
      // oven doors under solid tops, drawers elsewhere
      const front = s * (d / 2);
      if (m.type === 'solidtop') {
        const door = ovenDoor(M, m.w - 0.1, 0.5, 0);
        door.position.set(x + m.w / 2, 0.16, front);
        if (s < 0) door.rotation.y = Math.PI;
        g.add(door);
      } else {
        for (const y of [0.18, 0.47]) {
          const dr = rbox(m.w - 0.06, 0.25, 0.02, M.steel, { r: 0.004 });
          dr.position.set(x + m.w / 2, y, front);
          g.add(dr);
          g.add(rod([x + m.w * 0.25, y + 0.2, front + s * 0.035], [x + m.w * 0.75, y + 0.2, front + s * 0.035], 0.008, M.polished));
        }
      }
      // knobs along the front fascia
      for (let k = 0; k < Math.max(1, Math.round(m.w / 0.4)); k++) {
        if (m.type === 'worktop' || m.type === 'bain') continue;
        const kx = x + (m.w / (Math.round(m.w / 0.4) + 1)) * (k + 1);
        const kn = cyl(0.022, 0.026, 0.03, M.plasticBlack, { seg: 16 });
        kn.rotation.x = s * Math.PI / 2;
        kn.position.set(kx, h - 0.17, front + s * 0.015);
        g.add(kn);
      }
      x += m.w;
    }
    // towel rail along the whole side
    g.add(rod([-w / 2 + 0.05, h - 0.12, s * (d / 2 + 0.06)], [w / 2 - 0.05, h - 0.12, s * (d / 2 + 0.06)], 0.014, M.polished));
    for (const xx of [-w / 2 + 0.05, w / 2 - 0.05]) g.add(rod([xx, h - 0.12, s * d / 2], [xx, h - 0.12, s * (d / 2 + 0.06)], 0.012, M.polished));
  }
  if (generator) {
    // induction generator cabinet vents on the ends
    for (const sx of [-1, 1]) add(g, at(rbox(0.01, 0.4, d - 0.4, M.filterMesh, { r: 0.002 }), sx * (w / 2 + 0.002), 0.25, 0));
  }
  app.addLed(w / 2 - 0.1, h - 0.12, d / 2 + 0.006);
  app.zones = zones;
  app.holdSlots = holdSlots;
  app.workSpots = work;
  app.slots = zones.map((z) => z.slot);
  for (const st of steams) { g.add(st.points); app.emitters.push(st); }
  const steam = new SteamEmitter({ area: [w * 0.7, d * 0.6], height: 1.2, size: 0.35, opacity: 0.12 });
  steam.points.position.set(0, h + 0.05, 0);
  g.add(steam.points);
  app.emitters.push(steam);
  const light = new THREE.PointLight(0xff8a4a, 0, 3, 2);
  light.position.set(0, h + 0.3, 0);
  g.add(light);
  app.animators.push((dt, t, a) => {
    const on = a.state !== 'off' && a.state !== 'fault';
    // number of zones hot: from info.slotsBusy, info.load, or state default
    const busyN = a.info.slotsBusy != null ? a.info.slotsBusy
      : a.state === 'busy' ? Math.round((a.info.load ?? 0.6) * zones.length) : 0;
    const idleK = on ? 0.35 * a.heat : 0;
    zones.forEach((z, i) => {
      const target = !on ? 0 : i < busyN ? 1 : idleK;
      z.k = lerp(z.k ?? 0, target, Math.min(1, dt * 1.5));
      z.set(z.k, t);
    });
    steam.intensity = on ? clamp01(busyN / Math.max(1, zones.length) * 1.5) : 0;
    for (const st of steams) st.intensity = on ? 0.7 : 0;
    light.intensity = on ? 0.8 + busyN * 0.25 : 0;
  });
  return app;
}

// Savory suite: fish on the north side, meat and garnish on the south.
function buildSavorySuite(id, name, M, dims) {
  const [w] = dims;
  const side = (lead) => {
    const mods = lead === 'north'
      ? [{ type: 'worktop', w: 0.6 }, { type: 'plancha', w: 1.1 }, { type: 'solidtop', w: 1.5 }, { type: 'burners', w: 0.8 }, { type: 'bain', w: 1.0 }, { type: 'worktop', w: 0.6 }]
      : [{ type: 'worktop', w: 0.6 }, { type: 'bain', w: 1.0 }, { type: 'burners', w: 0.8 }, { type: 'solidtop', w: 1.5 }, { type: 'plancha', w: 1.1 }, { type: 'worktop', w: 0.6 }];
    const total = mods.reduce((a, m) => a + m.w, 0);
    mods[0].w += (w - 0.1 - total) / 2;
    mods[mods.length - 1].w += (w - 0.1 - total) / 2;
    return mods;
  };
  return buildSuite(id, name, M, { w: dims[0], d: dims[1], h: dims[2] }, { north: side('north'), south: side('south') });
}

// Pastry and garde-manger suite: induction plates, marble work surface.
function buildPastrySuite(id, name, M, dims) {
  const [w] = dims;
  const fill = (mods) => {
    const total = mods.reduce((a, m) => a + m.w, 0);
    mods[0].w += (w - 0.1 - total);
    return mods;
  };
  return buildSuite(id, name, M, { w: dims[0], d: dims[1], h: dims[2] }, {
    north: fill([{ type: 'worktop', w: 1.4, mat: M.marble }, { type: 'induction', w: 0.8, n: 2 }, { type: 'worktop', w: 1.0 }, { type: 'worktop', w: 0.8 }]),
    south: fill([{ type: 'worktop', w: 1.2, mat: M.marble }, { type: 'induction', w: 0.8, n: 2 }, { type: 'induction', w: 0.8, n: 2 }, { type: 'worktop', w: 0.8 }]),
  }, { generator: true });
}

// ------------------------------------------------------------ fire

// Wood-burning hearth: steel firebox, log fire with embers, adjustable grill.
function buildHearth(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'grill', name, w, d, h);
  const g = app.group;
  const brick = new THREE.MeshStandardMaterial({ color: 0x5a2f22, roughness: 0.9 });
  add(g, at(rbox(w, 0.55, d, M.blackSteel, { r: 0.01 }), 0, 0, 0));
  // firebox walls (open front above the ledge)
  add(g, at(rbox(w, h + 0.5, 0.06, M.blackSteel, { r: 0.006 }), 0, 0.55, -d / 2 + 0.03));
  for (const s of [-1, 1]) add(g, at(rbox(0.06, h - 0.05, d, M.blackSteel, { r: 0.006 }), s * (w / 2 - 0.03), 0.55, 0));
  add(g, at(rbox(w - 0.12, 0.02, d - 0.1, brick, { r: 0.003 }), 0, 0.55, 0));
  // firebrick back
  add(g, at(rbox(w - 0.14, h - 0.1, 0.02, brick, { r: 0.002 }), 0, 0.55, -d / 2 + 0.07));
  // split oak logs: bark, charred faces, glowing ends
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.95 });
  const charMat = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 1, emissive: 0xff3c0a, emissiveIntensity: 0 });
  for (let i = 0; i < 5; i++) {
    const l = cyl(0.045 + hash01(id + 'r' + i) * 0.015, 0.05, 0.5, i % 2 ? logMat : charMat, { seg: 7 });
    l.rotation.z = Math.PI / 2;
    l.rotation.y = (hash01(id + i) - 0.5) * 0.8;
    l.position.set(-0.4 + i * 0.2, 0.6 + (i % 2) * 0.05, -d / 2 + 0.22 + (i % 3) * 0.05);
    g.add(l);
  }
  // ember bed: a glowing coal layer, dark charcoal chunks on top and a
  // scatter of live coals
  const bedTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const px = hash01('bx' + i) * 128, py = hash01('by' + i) * 128, r = 2 + hash01('br' + i) * 7;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      const v = 0.4 + hash01('bv' + i) * 0.6;
      gr.addColorStop(0, `rgba(255,${(120 + v * 90) | 0},${(30 + v * 40) | 0},${v})`); gr.addColorStop(1, 'rgba(255,60,10,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x120a07, roughness: 1, emissive: 0xffffff, emissiveMap: bedTex, emissiveIntensity: 1.5 });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, d - 0.14).rotateX(-Math.PI / 2), bedMat);
  bed.position.set(0, 0.575, 0.0);
  bed.userData.dynamic = true;
  g.add(bed);
  const coalGeo = new THREE.DodecahedronGeometry(0.028, 0);
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.95, metalness: 0 });
  const coals = new THREE.InstancedMesh(coalGeo, coalMat, 170);
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a14, emissiveIntensity: 2, roughness: 1 });
  const embers = new THREE.InstancedMesh(coalGeo, emberMat, 60);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
  for (let i = 0; i < 230; i++) {
    const s = 0.5 + hash01(id + 's' + i) * 0.9;
    q4.setFromEuler(e4.set(i, i * 2, i * 3));
    m4.compose(new THREE.Vector3((hash01(id + 'x' + i) - 0.5) * (w - 0.25), 0.582 + hash01('y' + i) * 0.03, (hash01('z' + i) - 0.5) * (d - 0.3) + 0.05), q4, new THREE.Vector3(s, s * 0.7, s));
    if (i < 170) coals.setMatrixAt(i, m4); else embers.setMatrixAt(i - 170, m4);
  }
  coals.castShadow = true;
  for (const m of [coals, embers]) { m.userData.dynamic = true; g.add(m); }
  // flames licking up from the logs
  const fire = new FireSprites({ count: 16, area: [w - 0.4, 0.25], height: 0.42, width: 0.16 });
  fire.group.position.set(0, 0.6, -d / 2 + 0.27);
  g.add(fire.group);
  const flames = [];
  // grill grate with crank
  const grill = new THREE.Group();
  for (let i = 0; i < 18; i++) add(grill, at(rbox(0.012, 0.012, d - 0.25, M.castIron, { r: 0.003 }), -w / 2 + 0.12 + i * ((w - 0.24) / 17), 0, 0));
  add(grill, at(rbox(w - 0.2, 0.02, 0.03, M.castIron, { r: 0.004 }), 0, -0.005, (d - 0.25) / 2));
  grill.position.set(0, 0.86, 0.06);
  g.add(grill);
  const wheel = torus(0.11, 0.012, M.polished);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(w / 2 + 0.02, 0.95, 0.2);
  g.add(wheel);
  // hood
  add(g, at(rbox(w + 0.1, 0.4, d * 0.7, M.steel, { r: 0.02 }), 0, h + 0.55, -d * 0.15));
  // stacked firewood beside
  for (let i = 0; i < 6; i++) {
    const l = cyl(0.05, 0.05, 0.4, logMat, { seg: 10 });
    l.rotation.x = Math.PI / 2;
    l.position.set(-w / 2 + 0.2 + (i % 3) * 0.11, 0.06 + Math.floor(i / 3) * 0.1, d / 2 - 0.2);
    g.add(l);
  }
  app.slots = [];
  for (let i = 0; i < 8; i++) app.slots.push(new THREE.Vector3(-w / 2 + 0.25 + (i % 4) * ((w - 0.5) / 3), 0.875, i < 4 ? -0.05 : 0.2));
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 4, 2);
  fireLight.position.set(0, 1.0, 0.3);
  fireLight.castShadow = false;
  g.add(fireLight);
  const smoke = new SteamEmitter({ area: [w * 0.7, 0.3], height: 1.2, size: 0.4, color: 0xb8b2aa, opacity: 0.16 });
  smoke.points.position.set(0, 0.9, -0.1);
  g.add(smoke.points);
  app.emitters.push(smoke);
  app.addLed(w / 2 - 0.08, 0.45, d / 2 + 0.006);
  app.animators.push((dt, t, a) => {
    const on = a.state !== 'off';
    const k = on ? (a.state === 'busy' ? 1 : a.state === 'preheating' ? 0.5 + 0.5 * a.heat : 0.6) : 0.05;
    emberMat.emissiveIntensity = 0.4 + k * 2.6 + Math.sin(t * 2.3) * 0.15 * k;
    bedMat.emissiveIntensity = 0.2 + k * 1.6 + Math.sin(t * 1.7) * 0.1 * k;
    charMat.emissiveIntensity = k * 0.6;
    fire.intensity = on ? k : 0;
    fire.update(dt, t);
    fireLight.intensity = on ? k * (3 + Math.sin(t * 13) * 0.5 + Math.random() * 0.6) : 0;
    smoke.intensity = a.state === 'busy' ? 1 : on ? 0.3 : 0;
  });
  return app;
}

// Rotisol-style infrared rotisserie: black enamel and brass, glass front,
// five spits turning in front of glowing elements.
function buildRotisserie(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'rotisserie', name, w, d, h);
  const g = app.group;
  const enamel = new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  legs(g, w - 0.04, d - 0.06, 0.3, M, { shelf: false });
  add(g, at(rbox(w, h - 0.3, d, enamel, { r: 0.02 }), 0, 0.3, 0));
  // brass frame around the glass
  add(g, at(rbox(w - 0.08, 0.04, 0.03, M.brass, { r: 0.01 }), 0, 0.42, d / 2));
  add(g, at(rbox(w - 0.08, 0.04, 0.03, M.brass, { r: 0.01 }), 0, h - 0.12, d / 2));
  for (const s of [-1, 1]) add(g, at(rbox(0.04, h - 0.58, 0.03, M.brass, { r: 0.01 }), s * (w / 2 - 0.06), 0.44, d / 2));
  const cavity = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 0.6 });
  add(g, at(box(w - 0.14, h - 0.62, 0.01, cavity, { shadow: false }), 0, 0.46 + (h - 0.62) / 2, -d / 2 + 0.08));
  add(g, at(box(w - 0.12, h - 0.62, 0.006, M.glass, { shadow: false }), 0, 0.46 + (h - 0.62) / 2, d / 2 - 0.02));
  // elements
  const elMat = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4510, emissiveIntensity: 0 });
  for (let i = 0; i < 4; i++) {
    const e = box(w - 0.2, 0.012, 0.012, elMat, { shadow: false });
    e.position.set(0, 0.6 + i * 0.18, -d / 2 + 0.1);
    g.add(e);
  }
  // spits with birds
  const birdMat = new THREE.MeshPhysicalMaterial({ color: 0xb0662a, roughness: 0.35, clearcoat: 0.8 });
  const spits = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Group();
    sp.position.set(0, 0.55 + i * 0.15, 0.02);
    sp.add(rod([-w / 2 + 0.08, 0, 0], [w / 2 - 0.08, 0, 0], 0.005, M.polished));
    for (let k = 0; k < 3; k++) {
      const b = sphere(0.05, birdMat, { seg: 12 });
      b.scale.set(1.4, 0.9, 0.9);
      b.position.x = -0.3 + k * 0.3;
      sp.add(b);
    }
    sp.userData.dynamic = true;
    g.add(sp);
    spits.push(sp);
  }
  // brass nameplate and crown
  add(g, at(rbox(w + 0.02, 0.05, d + 0.02, M.brass, { r: 0.012 }), 0, h - 0.05, 0));
  app.slots = spits.map((s) => s.position.clone());
  app.addLed(w / 2 - 0.1, 0.36, d / 2 + 0.006);
  app.animators.push((dt, t, a) => {
    const on = a.state !== 'off' && a.state !== 'fault';
    elMat.emissiveIntensity = a.heat * a.heat * 3.5;
    cavity.emissiveIntensity = a.heat * 0.35;
    const busyN = a.state === 'busy' ? (a.info.slotsBusy ?? 5) : 0;
    spits.forEach((s, i) => { s.visible = i < Math.max(busyN, on ? 1 : 0); s.rotation.x += dt * (on ? 1.6 : 0); });
  });
  return app;
}

// Imperial stock pot ranges: low ring burners carrying 60-litre pots.
function buildStockpotRange(id, name, M, [w, d, h], count = 2) {
  const app = new Appliance(id, 'stockpot-range', name, w, d, 1.15);
  const g = app.group;
  const flames = [], steams = [], surfaces = [];
  const stockMat = new THREE.MeshPhysicalMaterial({ color: 0x8a5524, roughness: 0.12, clearcoat: 1 });
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (w / count) * (i + 0.5);
    const u = new THREE.Group();
    u.position.x = x;
    legs(u, w / count - 0.04, d - 0.04, h - 0.1, M, { shelf: false });
    add(u, at(rbox(w / count - 0.02, 0.1, d - 0.02, M.steel, { r: 0.008 }), 0, h - 0.1, 0));
    add(u, at(burner(M), 0, h, 0));
    add(u, at(grate(M, 0.44), 0, h + 0.04, 0));
    const f = flameRing(0.09, 26);
    f.position.set(0, h + 0.015, 0);
    u.add(f);
    flames.push(f);
    // 60 L stockpot
    const pot = lathe([[0, 0], [0.22, 0], [0.225, 0.01], [0.225, 0.46], [0.235, 0.47], [0.22, 0.47], [0.215, 0.012], [0, 0.008]], M.polished, 40);
    pot.position.y = h + 0.06;
    u.add(pot);
    for (const s of [-1, 1]) add(u, at(torus(0.03, 0.008, M.polished), s * 0.235, h + 0.48, 0));
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.214, 32), stockMat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = h + 0.45;
    surf.userData.dynamic = true;
    u.add(surf);
    surfaces.push(surf);
    // bones poking through
    for (let k = 0; k < 4; k++) {
      const bone = cyl(0.02, 0.025, 0.12, new THREE.MeshStandardMaterial({ color: 0xd9c7a6, roughness: 0.7 }), { seg: 8 });
      bone.rotation.z = 0.6 + k;
      bone.position.set(Math.cos(k * 1.7) * 0.1, h + 0.43, Math.sin(k * 1.7) * 0.1);
      u.add(bone);
    }
    const st = new SteamEmitter({ area: [0.35, 0.35], height: 1.3, size: 0.45, opacity: 0.2 });
    st.points.position.set(0, h + 0.5, 0);
    u.add(st.points);
    app.emitters.push(st);
    steams.push(st);
    g.add(u);
    app.slots.push(new THREE.Vector3(x, h + 0.53, 0));
  }
  app.addLed(w / 2 - 0.06, h - 0.05, d / 2 + 0.006);
  app.animators.push((dt, t, a) => {
    const on = a.state !== 'off' && a.state !== 'fault';
    const n = a.info.slotsBusy ?? (on ? count : 0);
    flames.forEach((f, i) => { f.visible = on && i < Math.max(n, 1); f.scale.y = (a.state === 'busy' ? 0.8 : 0.4) * (0.9 + Math.random() * 0.1); });
    steams.forEach((s, i) => { s.intensity = on && i < Math.max(n, 1) ? (a.state === 'busy' ? 1 : 0.5) : 0; });
    surfaces.forEach((s, i) => { s.position.y = h + 0.45 + Math.sin(t * 8 + i) * 0.002 * a.heat; });
  });
  return app;
}

// Induction fry kettle sitting on the pastry suite (doughnuts).
function buildFryKettle(id, name, M, [w, d, h], suiteH = 0.92) {
  const app = new Appliance(id, 'fryer', name, w, d, 0.25);
  const g = app.group;
  const pot = lathe([[0, 0], [0.15, 0], [0.155, 0.01], [0.155, 0.2], [0.162, 0.205], [0.15, 0.205], [0.148, 0.012], [0, 0.008]], M.polished, 36);
  g.add(pot);
  const oilMat = new THREE.MeshPhysicalMaterial({ color: 0xb3861f, roughness: 0.05, clearcoat: 1 });
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.147, 32), oilMat);
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 0.14;
  g.add(oil);
  const basket = new THREE.Group();
  add(basket, cyl(0.12, 0.12, 0.09, new THREE.MeshStandardMaterial({ color: 0xbfc2c4, metalness: 1, roughness: 0.4, wireframe: true }), { seg: 16, open: true }));
  add(basket, rod([0.12, 0.08, 0], [0.32, 0.18, 0], 0.007, M.polished));
  basket.position.y = 0.18;
  basket.userData.dynamic = true;
  g.add(basket);
  const dough = new THREE.MeshStandardMaterial({ color: 0xd9a25a, roughness: 0.7 });
  for (let i = 0; i < 4; i++) add(basket, at(torus(0.025, 0.012, dough, { seg: 14 }), Math.cos(i * 1.6) * 0.06, 0.02, Math.sin(i * 1.6) * 0.06)).rotation.x = Math.PI / 2;
  const bubbles = new SteamEmitter({ count: 26, area: [0.22, 0.22], height: 0.04, rise: 0.1, size: 0.025, color: 0xfff1c0, opacity: 0.6 });
  bubbles.points.position.y = 0.14;
  g.add(bubbles.points);
  app.emitters.push(bubbles);
  app.slots = [new THREE.Vector3(0, 0.22, 0)];
  app.addLed(0.14, 0.18, 0.06);
  app.animators.push((dt, t, a) => {
    basket.position.y = lerp(basket.position.y, a.state === 'busy' ? 0.08 : 0.18, Math.min(1, dt * 3));
    bubbles.intensity = a.state === 'busy' ? 1 : a.heat > 0.3 ? 0.2 : 0;
  });
  app.group.position.y = suiteH;
  app.mountY = suiteH;
  return app;
}

// ------------------------------------------------------------ refrigeration

// Traulsen-style tall reach-in with glass doors, lit shelves and stock.
// kind: fridge | freezer | aging | humidor
function buildCabinet(id, type, name, M, [w, d, h], { kind = 'fridge', tempC } = {}) {
  const app = new Appliance(id, type, name, w, d, h);
  const g = app.group;
  const wood = kind === 'humidor';
  const bodyMat = wood ? new THREE.MeshPhysicalMaterial({ color: 0x5a3a24, roughness: 0.45, clearcoat: 0.6 }) : M.steel;
  const wallT = 0.04;
  // shell: back, sides, top, bottom
  add(g, at(rbox(w, h - 0.12, wallT, bodyMat, { r: 0.006 }), 0, 0.12, -d / 2 + wallT / 2));
  for (const s of [-1, 1]) add(g, at(rbox(wallT, h - 0.12, d, bodyMat, { r: 0.006 }), s * (w / 2 - wallT / 2), 0.12, 0));
  add(g, at(rbox(w, 0.2, d, bodyMat, { r: 0.01 }), 0, h - 0.2, 0));
  add(g, at(rbox(w, 0.12, d, M.blackSteel, { r: 0.004 }), 0, 0, 0));
  add(g, at(rbox(w - 0.02, 0.04, d - 0.02, bodyMat, { r: 0.004 }), 0, 0.12, 0));
  // interior liner and LED strips
  const liner = new THREE.MeshStandardMaterial({ color: kind === 'freezer' ? 0xdfe9f2 : wood ? 0x6b4a30 : 0xe8eaec, roughness: 0.4, metalness: wood ? 0 : 0.3 });
  add(g, at(box(w - 0.1, h - 0.4, 0.005, liner, { shadow: false }), 0, 0.17 + (h - 0.4) / 2, -d / 2 + wallT + 0.003));
  const ledColor = kind === 'freezer' ? new THREE.Color(1.6, 2.0, 2.6) : wood ? new THREE.Color(2.4, 1.7, 1.1) : new THREE.Color(2.2, 2.2, 2.1);
  const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
  for (const s of [-1, 1]) add(g, at(box(0.012, h - 0.5, 0.012, ledMat, { shadow: false }), s * (w / 2 - wallT - 0.01), 0.2 + (h - 0.5) / 2, d / 2 - 0.08));
  // shelves
  const shelfMat = new THREE.MeshStandardMaterial({ color: wood ? 0x7a5236 : 0xb8c0c4, metalness: wood ? 0 : 0.8, roughness: 0.35 });
  const usable = h - 0.5;
  const nShelves = Math.max(3, Math.round(usable / 0.36));
  const pitch = usable / nShelves;
  const shelfYs = [];
  for (let i = 0; i < nShelves; i++) {
    const y = 0.17 + i * pitch;
    add(g, at(rbox(w - 0.1, 0.015, d - 0.14, shelfMat, { r: 0.003 }), 0, y, -0.03));
    shelfYs.push(y + 0.015);
  }
  // glass doors in steel frames
  const doors = w > 1.0 ? 2 : 1;
  const dw = (w - 0.02) / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 0.01 + dw * (i + 0.5);
    const frame = new THREE.Group();
    add(frame, at(rbox(dw - 0.01, 0.05, 0.04, bodyMat, { r: 0.005 }), 0, 0, 0));
    add(frame, at(rbox(dw - 0.01, 0.05, 0.04, bodyMat, { r: 0.005 }), 0, h - 0.4, 0));
    for (const s of [-1, 1]) add(frame, at(rbox(0.05, h - 0.4, 0.04, bodyMat, { r: 0.005 }), s * (dw / 2 - 0.03), 0, 0));
    const pane = box(dw - 0.1, h - 0.45, 0.01, kind === 'freezer' ? new THREE.MeshPhysicalMaterial({ color: 0xeaf4ff, roughness: 0.25, transparent: true, opacity: 0.3, depthWrite: false }) : M.glass, { shadow: false });
    pane.position.set(0, (h - 0.4) / 2 + 0.02, 0);
    frame.add(pane);
    const hx = (i === 0 && doors === 2 ? 1 : -1) * (dw / 2 - 0.08);
    add(frame, rod([hx, h * 0.35, 0.05], [hx, h * 0.6, 0.05], 0.013, M.polished));
    frame.position.set(x, 0.14, d / 2 - 0.02);
    g.add(frame);
  }
  // temperature display on the header
  const disp = new THREE.MeshStandardMaterial({ color: 0, emissive: kind === 'freezer' ? 0x47b5ff : 0x3dfc8b, emissiveIntensity: 1.3 });
  add(g, at(box(0.1, 0.04, 0.004, disp, { shadow: false }), 0, h - 0.1, d / 2 + 0.002));
  app.addLed(0.09, h - 0.1, d / 2 + 0.004);
  app.tempC = tempC;
  // storage grid: two rows deep per shelf, small hotel-pan pitch
  app.storeSlots = [];
  const cols = Math.max(1, Math.floor((w - 0.12) / 0.13));
  for (const y of shelfYs.slice(0, -1).reverse().concat(shelfYs.slice(-1))) {
    for (const row of [0.12, -0.16]) {
      for (let c = 0; c < cols; c++) app.storeSlots.push(new THREE.Vector3(-w / 2 + 0.06 + (w - 0.12) / cols * (c + 0.5), y, row));
    }
  }
  // fill the front row of each shelf first so stock is visible through glass
  app.storeSlots.sort((a, b) => (b.z - a.z) || (b.y - a.y));
  app.cabinetKind = kind;
  if (kind === 'aging') {
    // dry-aging cooler: Himalayan salt panel and hanging primals
    const salt = new THREE.MeshStandardMaterial({ color: 0xe8a58c, roughness: 0.8, emissive: 0xff7040, emissiveIntensity: 0.25 });
    add(g, at(box(w - 0.12, h * 0.5, 0.02, salt, { shadow: false }), 0, h * 0.3, -d / 2 + 0.07));
  }
  if (kind === 'freezer') {
    const frost = new SteamEmitter({ count: 16, area: [w * 0.6, 0.05], height: -0.25, rise: 0.06, size: 0.2, opacity: 0.08 });
    frost.points.position.set(0, h * 0.5, d / 2 + 0.05);
    g.add(frost.points);
    app.emitters.push(frost);
    app.animators.push(() => { frost.intensity = 1; });
  }
  return app;
}

function buildIceMachine(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'ice', name, w, d, h);
  const g = app.group;
  legs(g, w - 0.04, d - 0.06, 0.15, M, { shelf: false });
  add(g, at(rbox(w, 0.95, d, M.steel, { r: 0.015 }), 0, 0.15, 0));
  add(g, at(rbox(w - 0.1, 0.4, 0.03, M.steelDark, { r: 0.01 }), 0, 0.55, d / 2));
  add(g, at(rbox(w, 0.7, d - 0.05, M.steel, { r: 0.015 }), 0, 1.12, -0.02));
  add(g, at(rbox(w - 0.2, 0.15, 0.02, M.filterMesh, { r: 0.004 }), 0, 1.5, d / 2 - 0.04));
  const badge = new THREE.MeshStandardMaterial({ color: 0x1d4f91, roughness: 0.4 });
  add(g, at(box(0.18, 0.04, 0.004, badge), 0, 1.72, d / 2 - 0.02));
  app.addLed(w / 2 - 0.08, 1.72, d / 2 - 0.02);
  return app;
}

// ------------------------------------------------------------ countertop

function standMixer(M, color = 0xd8d4cc) {
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, metalness: 0.1 });
  add(g, rbox(0.22, 0.05, 0.34, body, { r: 0.02 }));
  add(g, at(rbox(0.13, 0.3, 0.12, body, { r: 0.04 }), 0, 0.03, -0.11));
  const head = rbox(0.14, 0.12, 0.34, body, { r: 0.05 });
  head.position.set(0, 0.3, -0.02);
  g.add(head);
  const bowl = lathe([[0, 0], [0.07, 0], [0.1, 0.05], [0.11, 0.16], [0.105, 0.16], [0.095, 0.05], [0.065, 0.004], [0, 0.004]], M.polished, 32);
  bowl.position.set(0, 0.05, 0.05);
  g.add(bowl);
  const beater = cyl(0.008, 0.008, 0.14, M.polished, { seg: 8 });
  beater.position.set(0, 0.15, 0.06);
  beater.userData.dynamic = true;
  g.add(beater);
  return { g, spinner: beater };
}

function buildMixers(id, name, M, dims, count = 2) {
  const app = new Appliance(id, 'mixer', name, Math.max(dims[0], 0.32 * count), dims[1], dims[2]);
  const spinners = [];
  for (let i = 0; i < count; i++) {
    const { g, spinner } = standMixer(M, i % 2 ? 0x9eb7c9 : 0xe9e3d6);
    g.position.x = (i - (count - 1) / 2) * 0.32;
    app.group.add(g);
    spinners.push(spinner);
    app.slots.push(new THREE.Vector3(g.position.x, 0.2, 0.05));
  }
  app.addLed(0, 0.02, 0.18);
  app.animators.push((dt, t, a) => {
    const n = a.state === 'busy' ? (a.info.slotsBusy ?? count) : 0;
    spinners.forEach((s, i) => { s.rotation.y += i < n ? dt * 20 : 0; s.position.x = i < n ? Math.sin(t * 6) * 0.02 : 0; });
  });
  return app;
}

function buildEspresso(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'steamer', name, w, d, h);
  const g = app.group;
  add(g, rbox(w, h * 0.75, d, M.polished, { r: 0.03 }));
  add(g, at(rbox(w - 0.04, 0.03, d - 0.06, M.filterMesh, { r: 0.005 }), 0, h * 0.75, 0));
  for (const x of [-0.18, 0.18]) {
    add(g, at(cyl(0.04, 0.035, 0.06, M.chrome, { seg: 20 }), x, h * 0.42, d / 2 - 0.02));
    add(g, rod([x, h * 0.42, d / 2 + 0.02], [x, h * 0.42, d / 2 + 0.16], 0.01, M.plasticBlack));
    add(g, at(cyl(0.03, 0.025, 0.06, M.porcelain, { seg: 16 }), x, 0.04, d / 2 - 0.08));
  }
  add(g, rod([w / 2 - 0.05, h * 0.55, d / 2 - 0.05], [w / 2 - 0.02, h * 0.2, d / 2 + 0.05], 0.006, M.chrome));
  const gauge = cyl(0.03, 0.03, 0.01, M.porcelain, { seg: 20 });
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(0, h * 0.62, d / 2 + 0.005);
  g.add(gauge);
  const steam = new SteamEmitter({ count: 20, area: [0.05, 0.05], height: 0.4, size: 0.12, opacity: 0.25 });
  steam.points.position.set(w / 2 - 0.02, h * 0.2, d / 2 + 0.05);
  g.add(steam.points);
  app.emitters.push(steam);
  app.addLed(-w / 2 + 0.06, h * 0.62, d / 2 + 0.004);
  app.slots = [new THREE.Vector3(-0.18, 0.04, d / 2 - 0.08), new THREE.Vector3(0.18, 0.04, d / 2 - 0.08)];
  app.animators.push((dt, t, a) => { steam.intensity = a.state === 'busy' ? 1 : 0; });
  return app;
}

function buildRobotCoupe(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'processor', name, w, d, h);
  const g = app.group;
  const grey = new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.4, metalness: 0.4 });
  add(g, rbox(w * 0.8, h * 0.45, d * 0.8, grey, { r: 0.03 }));
  const bowl = cyl(0.11, 0.1, 0.2, M.polyCarbonate, { seg: 24, shadow: false });
  bowl.position.y = h * 0.45;
  g.add(bowl);
  const blade = box(0.18, 0.005, 0.03, M.polished);
  blade.position.y = h * 0.45 + 0.03;
  blade.userData.dynamic = true;
  g.add(blade);
  add(g, at(cyl(0.12, 0.12, 0.02, M.polyCarbonate, { seg: 24 }), 0, h * 0.45 + 0.2, 0));
  app.addLed(0, h * 0.25, d * 0.4 + 0.002);
  app.animators.push((dt, t, a) => { blade.rotation.y += a.state === 'busy' ? dt * 40 : 0; });
  return app;
}

function buildBlenders(id, name, M, dims, count = 3) {
  const app = new Appliance(id, 'blender', name, Math.max(dims[0], 0.24 * count), dims[1], dims[2]);
  const blades = [];
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.24;
    const b = new THREE.Group();
    b.position.x = x;
    add(b, rbox(0.18, 0.14, 0.2, M.plasticBlack, { r: 0.03 }));
    const jar = cyl(0.06, 0.045, 0.24, M.polyCarbonate, { seg: 4, shadow: false });
    jar.rotation.y = Math.PI / 4;
    jar.position.y = 0.14;
    b.add(jar);
    add(b, at(cyl(0.065, 0.065, 0.03, M.plasticBlack, { seg: 4 }), 0, 0.38, 0)).rotation.y = Math.PI / 4;
    const blade = box(0.07, 0.004, 0.015, M.polished);
    blade.position.y = 0.16;
    blade.userData.dynamic = true;
    b.add(blade);
    const purée = cyl(0.05, 0.045, 0.08, new THREE.MeshPhysicalMaterial({ color: [0x7bb04a, 0xf0a640, 0xe7d9b4][i % 3], roughness: 0.3, clearcoat: 0.5 }), { seg: 4 });
    purée.rotation.y = Math.PI / 4;
    purée.position.y = 0.145;
    b.add(purée);
    app.group.add(b);
    blades.push(blade);
    app.slots.push(new THREE.Vector3(x, 0.14, 0));
  }
  app.addLed(0, 0.07, 0.1);
  app.animators.push((dt, t, a) => {
    const n = a.state === 'busy' ? (a.info.slotsBusy ?? count) : 0;
    blades.forEach((b, i) => { b.rotation.y += i < n ? dt * 60 : 0; });
  });
  return app;
}

// Berkel flywheel slicer in its classic red.
function buildSlicer(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'slicer', name, w, d, h);
  const g = app.group;
  const red = new THREE.MeshPhysicalMaterial({ color: 0xa3141b, roughness: 0.25, clearcoat: 1 });
  add(g, rbox(w * 0.7, 0.12, d * 0.6, red, { r: 0.03 }));
  add(g, at(rbox(0.1, 0.2, 0.18, red, { r: 0.03 }), -w * 0.2, 0.12, 0));
  const blade = cyl(0.15, 0.15, 0.01, M.polished, { seg: 40 });
  blade.rotation.z = Math.PI / 2 - 0.2;
  blade.position.set(-w * 0.12, 0.3, 0);
  blade.userData.dynamic = true;
  g.add(blade);
  const fly = torus(0.1, 0.015, red, { seg: 28 });
  fly.position.set(w * 0.35, 0.22, 0);
  fly.rotation.y = Math.PI / 2;
  fly.userData.dynamic = true;
  g.add(fly);
  add(g, at(rbox(0.22, 0.02, 0.2, M.polished, { r: 0.005 }), w * 0.1, 0.22, 0));
  add(g, at(rbox(0.06, 0.06, 0.06, M.brass, { r: 0.02 }), w * 0.1, 0.24, 0.08));
  app.addLed(w * 0.3, 0.06, d * 0.3 + 0.002);
  app.animators.push((dt, t, a) => {
    const busy = a.state === 'busy';
    blade.rotation.x += busy ? dt * 25 : 0;
    fly.rotation.x += busy ? dt * 3 : 0;
  });
  return app;
}

function buildSmallMachine(id, type, name, M, [w, d, h]) {
  const app = new Appliance(id, type, name, w, d, h);
  const g = app.group;
  if (type === 'vacuum-sealer') {
    add(g, rbox(w, h * 0.55, d, M.steel, { r: 0.02 }));
    const lid = rbox(w - 0.04, h * 0.3, d - 0.04, M.polyCarbonate, { r: 0.04, shadow: false });
    lid.position.y = h * 0.55;
    g.add(lid);
    add(g, at(rbox(0.1, 0.05, 0.01, new THREE.MeshStandardMaterial({ color: 0, emissive: 0x33ff88, emissiveIntensity: 1 })), 0, h * 0.3, d / 2 + 0.001));
  } else if (type === 'grinder') {
    add(g, rbox(w * 0.6, h * 0.5, d * 0.8, M.steel, { r: 0.02 }));
    const head = cyl(0.06, 0.06, w * 0.6, M.polished, { seg: 20 });
    head.rotation.z = Math.PI / 2;
    head.position.set(w * 0.15, h * 0.65, 0);
    g.add(head);
    add(g, at(cyl(0.1, 0.06, 0.12, M.polished, { seg: 20 }), -w * 0.05, h * 0.72, 0));
  } else if (type === 'induction') {
    const n = 4;
    const c = 0.36;
    for (let i = 0; i < n; i++) {
      const u = new THREE.Group();
      u.position.x = (i - (n - 1) / 2) * c;
      add(u, rbox(0.33, 0.09, 0.42, M.steel, { r: 0.012 }));
      add(u, at(rbox(0.31, 0.008, 0.31, M.ceramicGlass, { r: 0.004 }), 0, 0.09, -0.04));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.098, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.1), transparent: true, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.1, -0.04);
      ring.userData.dynamic = true;
      u.add(ring);
      u.userData.ring = ring;
      g.add(u);
      app.slots.push(new THREE.Vector3(u.position.x, 0.1, -0.04));
    }
    app.size.w = n * c;
    app.animators.push((dt, t, a) => {
      const k = a.state === 'busy' ? (a.info.slotsBusy ?? n) : a.state === 'idle' ? 1 : 0;
      g.children.filter((u) => u.userData.ring).forEach((u, i) => { u.userData.ring.material.opacity = i < k ? 0.9 : 0; });
    });
  } else {
    add(g, rbox(w, h, d, M.steel, { r: 0.02 }));
  }
  app.addLed(w / 2 - 0.04, h * 0.2, d / 2 + 0.004);
  return app;
}

// The pass: heated plate shelf on an enclosed base, ticket rail on the
// kitchen side, and a warmer below holding stacks of plates.
function buildPassTable(id, name, M, [w, d, h]) {
  const app = new Appliance(id, 'pass', name, w, d, h);
  const g = app.group;
  add(g, at(rbox(w, h - 0.14, d, M.steel, { r: 0.01 }), 0, 0.1, 0));
  add(g, at(rbox(w + 0.04, 0.05, d + 0.04, M.steel, { r: 0.012 }), 0, h - 0.05, 0));
  add(g, at(rbox(w - 0.08, 0.004, d - 0.16, new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.15, clearcoat: 1 }), { r: 0.002 }), 0, h, 0));
  add(g, at(rbox(w, 0.1, d, M.blackSteel, { r: 0.004 }), 0, 0, 0));
  // ticket rail and paper tickets on the kitchen (+z) side
  add(g, at(rbox(w - 0.2, 0.04, 0.03, M.polished, { r: 0.006 }), 0, h + 0.38, d / 2 - 0.04));
  for (const s of [-1, 1]) add(g, rod([s * (w / 2 - 0.12), h, d / 2 - 0.04], [s * (w / 2 - 0.12), h + 0.38, d / 2 - 0.04], 0.012, M.polished));
  const paper = new THREE.MeshStandardMaterial({ color: 0xf8f6ee, roughness: 0.9, side: THREE.DoubleSide });
  app.tickets = [];
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), paper);
    t.position.set(-w / 2 + 0.25 + i * ((w - 0.5) / 11), h + 0.3, d / 2 - 0.02);
    t.userData.dynamic = true;
    t.visible = i < 6;
    g.add(t);
    app.tickets.push(t);
  }
  // plate warmer with stacks
  for (let i = 0; i < Math.floor(w / 0.6); i++) {
    for (let k = 0; k < 8; k++) add(g, at(lathe([[0, 0], [0.12, 0], [0.145, 0.018], [0.14, 0.02], [0, 0.008]], M.porcelain, 28), -w / 2 + 0.35 + i * 0.6, 0.14 + k * 0.022, 0.05));
  }
  add(g, at(rbox(w - 0.1, 0.02, d - 0.1, M.steel, { r: 0.004 }), 0, 0.12, 0));
  // staging slots across the top: two rows
  const n = Math.floor((w - 0.2) / 0.33);
  for (const z of [0.12, -0.18]) for (let i = 0; i < n; i++) app.slots.push(new THREE.Vector3(-w / 2 + 0.2 + (i + 0.5) * ((w - 0.4) / n), h + 0.004, z));
  app.addLed(w / 2 - 0.06, h - 0.1, d / 2 + 0.024);
  return app;
}

// ------------------------------------------------------------ dispatcher

const DEFAULT_DIMS = [0.6, 0.6, 0.9];

export function buildEquipment(eq, placement, M) {
  const id = eq.id, name = eq.name;
  const dims = eq.dimsM || DEFAULT_DIMS;
  const [w, d, h] = dims;
  switch (eq.type) {
    case 'cooking-suite':
      return /PASTRY/i.test(id) ? buildPastrySuite(id, name, M, dims) : buildSavorySuite(id, name, M, dims);
    case 'range': return buildRange(id, name, M, { w, d, h, burners: 6 });
    case 'stockpot-range': return buildStockpotRange(id, name, M, dims, eq.count || 1);
    case 'combi-oven': {
      const app = buildCombi(id, name, M);
      app.type = 'combi-oven';
      return app;
    }
    case 'grill': return buildHearth(id, name, M, dims);
    case 'deck-oven': return buildDeckOven(id, name, M, { w, d, h });
    case 'rotisserie': return buildRotisserie(id, name, M, dims);
    case 'salamander': return buildSalamander(id, name, M, { w, d: Math.min(d, 0.45), h: Math.min(h, 0.45) });
    case 'fryer': return buildFryKettle(id, name, M, dims);
    case 'batch-freezer': return buildPacojet(id, name, M);
    case 'mixer': return buildMixers(id, name, M, dims, eq.count || 1);
    case 'steamer': return buildEspresso(id, name, M, dims);
    case 'processor': return buildRobotCoupe(id, name, M, dims);
    case 'blender': return buildBlenders(id, name, M, dims, eq.count || 1);
    case 'slicer': return buildSlicer(id, name, M, dims);
    case 'pass': return buildPassTable(id, name, M, dims);
    case 'warmer': {
      const app = buildHeatLamps(id, name, M, w);
      app.type = 'warmer';
      return app;
    }
    case 'dishwasher': return buildDishwasher(id, name, M, { w, d, h });
    case 'reach-in': return buildCabinet(id, eq.type, name, M, dims, { kind: 'fridge', tempC: eq.tempC });
    case 'freezer': return buildCabinet(id, eq.type, name, M, dims, { kind: 'freezer', tempC: eq.tempC });
    case 'aging-cooler': return buildCabinet(id, eq.type, name, M, dims, { kind: 'aging', tempC: eq.tempC });
    case 'humidor': return buildCabinet(id, eq.type, name, M, dims, { kind: 'humidor', tempC: eq.tempC });
    case 'ice': return buildIceMachine(id, name, M, dims);
    case 'vacuum-sealer': case 'grinder': case 'induction':
      return buildSmallMachine(id, eq.type, name, M, dims);
    default:
      return buildSmallMachine(id, eq.type || 'machine', name, M, dims);
  }
}
