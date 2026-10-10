// The studio's 3D stage: the dining room the viewer lays out, the garden outside the ribbon window,
// the kitchen shell from data/layout.json, and a light rig driven by computeLook(). It renders into
// any THREE.Scene, so the realistic scene in src/scene can host it (or replace parts of it) later.
//
//   const stage = createStage({ THREE, renderer, scene, layout, equipment });
//   stage.applyLook(look); stage.setDining(tables, season); stage.setGuests(simTables); stage.update(dt);
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { roomExtent, TABLE_TYPES } from './config.js';

const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ------------------------------------------------------------------------------ procedural textures
function canvasTex(w, h, draw, repeat = [1, 1], color = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture() {
  const r = rand(7);
  return canvasTex(1024, 1024, (g, w, h) => {
    const rows = 8; const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 400;
      while (x < w) {
        const len = 260 + r() * 300; const tone = 0.82 + r() * 0.3;
        const base = [104 * tone, 70 * tone, 44 * tone];
        g.fillStyle = `rgb(${base.map(Math.round).join(',')})`; g.fillRect(x, i * ph, len, ph);
        for (let k = 0; k < 40; k++) { // grain
          g.strokeStyle = `rgba(${r() < 0.5 ? '40,24,12' : '150,110,72'},${0.08 + r() * 0.12})`; g.lineWidth = 0.6 + r() * 1.6;
          const y = i * ph + r() * ph; g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y + (r() - 0.5) * 4); g.stroke();
        }
        g.fillStyle = 'rgba(20,12,6,0.55)'; g.fillRect(x, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(0, i * ph, w, 2);
    }
  }, [3, 3]);
}

function terrazzoTexture() {
  const r = rand(11);
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d8d3c9'; g.fillRect(0, 0, w, h);
    const chips = ['#b9b2a4', '#8f897e', '#efece5', '#a39582', '#6f6b65', '#c9b79a'];
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = chips[(r() * chips.length) | 0]; g.globalAlpha = 0.5 + r() * 0.5;
      const s = 1 + r() ** 3 * 9; g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.5), r() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }, [4, 4]);
}

function linenTexture() {
  const r = rand(5);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { g.fillStyle = `rgba(160,150,135,${0.03 + r() * 0.05})`; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  }, [2, 2]);
}

function grassTexture() {
  const r = rand(3);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 20000; i++) { const v = 90 + r() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * w, r() * h, 1.5, 3 + r() * 4); }
  }, [30, 30]);
}

// --------------------------------------------------------------------------------------- stage
export function createStage({ renderer, scene, layout, equipment, quality = 'high' }) {
  RectAreaLightUniformsLib.init();
  const root = new THREE.Group(); root.name = 'studio-stage'; scene.add(root);
  const hi = quality === 'high';
  const { width: KW, depth: KD } = layout.kitchen.footprint;
  const WALL_H = layout.kitchen.ceiling.springHeight;

  // ---- sky dome ------------------------------------------------------------------------------
  const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunSize: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, horizon, ground, sunDir, sunColor; uniform float sunSize; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.35));
        float d = max(dot(normalize(vDir), sunDir), 0.0); c += sunColor * (pow(d, 900.0) * 6.0 + pow(d, 12.0) * 0.25) * sunSize;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; root.add(sky);

  // ---- lights --------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  const center = new THREE.Vector3(KW / 2 - 6, 0, KD / 2);
  sun.target.position.copy(center);
  const moon = new THREE.DirectionalLight(0x8fa3c8, 0);
  moon.position.set(center.x - 30, 40, center.z + 20); moon.target.position.copy(center);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
  root.add(sun, sun.target, moon, moon.target, hemi);

  // ceiling LED field over the kitchen and pin spots over the dining room (rect area lights: no shadow cost)
  const ledPanels = [];
  const led = (x, z, w, d, room) => {
    const l = new THREE.RectAreaLight(0xffffff, 1, w, d);
    l.position.set(x, WALL_H - 0.02, z); l.lookAt(x, 0, z); l.userData.room = room; root.add(l); ledPanels.push(l);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    panel.rotation.x = Math.PI / 2; panel.position.set(x, WALL_H, z); panel.userData.room = room; root.add(panel); l.userData.panel = panel;
  };
  led(KW * 0.3, KD * 0.3, 6, 1.2, 'kitchen'); led(KW * 0.72, KD * 0.3, 6, 1.2, 'kitchen');
  led(KW * 0.3, KD * 0.7, 6, 1.2, 'kitchen'); led(KW * 0.72, KD * 0.7, 6, 1.2, 'kitchen');
  const passLamp = new THREE.PointLight(0xffb070, 4, 3.5, 2); passLamp.position.set(2.6, 1.5, 5.4); root.add(passLamp);
  const diningSpots = []; // repositioned by setDining

  // ---- materials -----------------------------------------------------------------------------
  const M = {
    terrazzo: new THREE.MeshStandardMaterial({ map: terrazzoTexture(), roughness: 0.32, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.75 }),
    diningWall: new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.85 }),
    wainscot: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.28 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x2c2e31, metalness: 0.9, roughness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89f5a, metalness: 1, roughness: 0.25 }),
    linen: new THREE.MeshStandardMaterial({ map: linenTexture(), roughness: 0.9 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95 }),
    porcelain: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    crystal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: hi ? 0.95 : 0, transparent: !hi, opacity: hi ? 1 : 0.25, thickness: 0.02, ior: 1.5 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46b }),
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0x6d8f4a, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.9, flatShading: true }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3d2c20, roughness: 1 }),
    produce: new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.7 }),
    blossom: new THREE.MeshStandardMaterial({ color: 0xf2c4d6, roughness: 0.8 }),
    guest: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc89c80, roughness: 0.7 }),
  };

  const add = (geo, mat, x, y, z, parent = root, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };

  // ---- kitchen shell (floor, walls with the ribbon window, equipment blocks) ----------------------
  const kitchen = new THREE.Group(); root.add(kitchen);
  add(new THREE.BoxGeometry(KW, 0.1, KD), M.terrazzo, KW / 2, -0.05, KD / 2, kitchen, false);
  const WALL_T = 0.15;
  function wall(side) {
    const horizontal = side === 'south' || side === 'north';
    const length = horizontal ? KW : KD;
    const openings = layout.kitchen.openings.filter((o) => o.wall === side)
      .map((o) => (o.from != null ? { ...o, a: o.from, b: o.to } : { ...o, a: o.at - o.width / 2, b: o.at + o.width / 2 })).sort((p, q) => p.a - q.a);
    const piece = (a, b, y0, y1, mat = M.wall) => {
      if (b - a <= 0.01 || y1 - y0 <= 0.01) return;
      const len = b - a;
      const geo = horizontal ? new THREE.BoxGeometry(len, y1 - y0, WALL_T) : new THREE.BoxGeometry(WALL_T, y1 - y0, len);
      const fixed = { south: -WALL_T / 2, north: KD + WALL_T / 2, west: -WALL_T / 2, east: KW + WALL_T / 2 }[side];
      const m = add(geo, mat, horizontal ? a + len / 2 : fixed, (y0 + y1) / 2, horizontal ? fixed : a + len / 2, kitchen, mat !== M.glass);
      if (mat === M.glass) m.receiveShadow = false;
    };
    let cursor = 0;
    for (const o of openings) {
      piece(cursor, o.a, 0, WALL_H);
      if (o.sill != null) { piece(o.a, o.b, 0, o.sill); piece(o.a, o.b, o.sill, o.head, M.glass); piece(o.a, o.b, o.head, WALL_H); }
      else piece(o.a, o.b, o.height, WALL_H);
      cursor = o.b;
    }
    piece(cursor, length, 0, WALL_H);
  }
  ['south', 'north', 'east'].forEach(wall); // the west wall is shared with the dining room, built below

  for (const pl of layout.placements) {
    if (pl.embeddedIn || pl.z < 0) continue;
    const eq = equipment.get(pl.equipment); if (!eq) continue;
    const [w, d, h] = eq.dimsM;
    const mat = /suite|range|grill|hearth|rotisserie/.test(eq.type) ? M.darkSteel : M.steel;
    const m = add(new THREE.BoxGeometry(w, h, d), mat, pl.x, (pl.y ?? 0) + h / 2, pl.z, kitchen);
    m.rotation.y = THREE.MathUtils.degToRad(pl.rotY ?? 0);
    if (eq.type === 'cooking-suite') add(new THREE.BoxGeometry(w - 0.1, 0.03, d - 0.1), M.brass, pl.x, h + 0.015, pl.z, kitchen).rotation.y = m.rotation.y;
  }
  for (const b of layout.benches) add(new THREE.BoxGeometry(b.width, b.height, b.depth), M.steel, b.x, b.height / 2, b.z, kitchen);

  // seasonal produce on the north bench under the window (hotel pans of the day's delivery)
  const produceGroup = new THREE.Group(); root.add(produceGroup);
  const pans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), M.steel, 14);
  const fruit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 1), M.produce, 14 * 18);
  { const m4 = new THREE.Matrix4(); const r = rand(21); let k = 0;
    for (let i = 0; i < 14; i++) {
      const x = 4.9 + i * 0.75, z = 10.4;
      pans.setMatrixAt(i, m4.makeTranslation(x, 1.0, z));
      for (let j = 0; j < 18; j++) fruit.setMatrixAt(k++, m4.makeTranslation(x + (r() - 0.5) * 0.4, 1.07 + r() * 0.04, z + (r() - 0.5) * 0.2));
    }
    pans.castShadow = fruit.castShadow = true; produceGroup.add(pans, fruit);
  }

  // ---- garden outside the ribbon window ----------------------------------------------------------
  const garden = new THREE.Group(); root.add(garden);
  const ground = add(new THREE.PlaneGeometry(400, 400), M.grass, KW / 2, -0.06, KD / 2, garden, false);
  ground.rotation.x = -Math.PI / 2;
  const bedGeo = new THREE.BoxGeometry(5, 0.3, 1.1);
  const plantGeo = new THREE.IcosahedronGeometry(0.12, 2);
  const beds = new THREE.InstancedMesh(bedGeo, M.soil, 8);
  const plants = new THREE.InstancedMesh(plantGeo, M.produce, 8 * 22);
  { const m4 = new THREE.Matrix4(); const r = rand(17); let k = 0;
    for (let i = 0; i < 8; i++) {
      const x = 3 + (i % 2) * 6.5, z = KD + 3 + Math.floor(i / 2) * 2.2;
      beds.setMatrixAt(i, m4.makeTranslation(x, 0.15, z));
      for (let j = 0; j < 22; j++) {
        const s = 0.6 + r() * 0.8;
        plants.setMatrixAt(k++, m4.compose(new THREE.Vector3(x - 2.3 + j * 0.22, 0.38, z + (r() - 0.5) * 0.6), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      }
    }
    beds.receiveShadow = plants.castShadow = true; garden.add(beds, plants);
  }
  const trees = [];
  { const r = rand(29); const spots = [];
    for (let i = 0; i < 14; i++) spots.push([-16 + r() * 40, KD + 13 + r() * 14]);
    for (let i = 0; i < 6; i++) spots.push([KW + 4 + r() * 8, -4 + r() * 18]);
    for (const [x, z] of spots) {
      const t = new THREE.Group(); t.position.set(x, 0, z);
      const h = 2.6 + r() * 2.5;
      add(new THREE.CylinderGeometry(0.1, 0.18, h, 8), M.bark, 0, h / 2, 0, t);
      const crown = new THREE.Group(); crown.position.y = h;
      for (let k = 0; k < 6; k++) add(new THREE.IcosahedronGeometry(0.8 + r() * 0.7, 1), M.foliage, (r() - 0.5) * 1.6, (r() - 0.3) * 1.1, (r() - 0.5) * 1.6, crown);
      t.add(crown); t.userData.crown = crown; garden.add(t); trees.push(t);
    }
  }

  // ---- precipitation -----------------------------------------------------------------------------
  const N_DROPS = hi ? 6000 : 2500;
  const dropPos = new Float32Array(N_DROPS * 3);
  { const r = rand(41); for (let i = 0; i < N_DROPS; i++) { dropPos[i * 3] = -30 + r() * 70; dropPos[i * 3 + 1] = r() * 18; dropPos[i * 3 + 2] = -10 + r() * 50; } }
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
  drops.visible = false; root.add(drops);
  const roofOver = (x, z, ext) => (x > ext.x0 && x < KW && z > 0 && z < KD);

  // ---- dining room (rebuilt by setDining) ----------------------------------------------------------
  let dining = new THREE.Group(); root.add(dining);
  let ext = roomExtent([]);
  let candleLights = []; let flames = []; let seatSpots = new Map();
  const guests = { body: null, head: null };

  function setDining(tables) {
    root.remove(dining); dining.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const l of diningSpots) { root.remove(l); root.remove(l.userData.panel); }
    diningSpots.length = 0;
    dining = new THREE.Group(); root.add(dining);
    ext = roomExtent(tables);
    const W = ext.x1 - ext.x0;
    const floor = add(new THREE.BoxGeometry(W, 0.1, KD), M.wood, ext.x0 + W / 2, -0.05, KD / 2, dining, false);
    floor.material.map.repeat.set(W / 3, KD / 3);
    // walls: west, north, south; the shared kitchen wall has the service door
    const dw = (x, z, w, d, h = WALL_H) => add(new THREE.BoxGeometry(w, h, d), M.diningWall, x, h / 2, z, dining);
    dw(ext.x0 - WALL_T / 2, KD / 2, WALL_T, KD);
    dw(ext.x0 + W / 2, -WALL_T / 2, W, WALL_T); dw(ext.x0 + W / 2, KD + WALL_T / 2, W, WALL_T, 1.1); // low north wall: garden windows above
    add(new THREE.BoxGeometry(W, WALL_H - 2.3, WALL_T), M.diningWall, ext.x0 + W / 2, 2.3 + (WALL_H - 2.3) / 2, KD + WALL_T / 2, dining);
    add(new THREE.BoxGeometry(W, 1.2, 0.04), M.glass, ext.x0 + W / 2, 1.7, KD + WALL_T / 2, dining, false);
    const door = layout.kitchen.openings.find((o) => o.id === 'door-dining');
    const da = door.at - door.width / 2, db = door.at + door.width / 2;
    dw(-WALL_T / 2, da / 2, WALL_T, da); dw(-WALL_T / 2, (db + KD) / 2, WALL_T, KD - db);
    add(new THREE.BoxGeometry(WALL_T, WALL_H - door.height, door.width), M.diningWall, -WALL_T / 2, door.height + (WALL_H - door.height) / 2, door.at, dining);
    // wainscot rail
    add(new THREE.BoxGeometry(W, 0.9, 0.03), M.wainscot, ext.x0 + W / 2, 0.45, 0.02, dining, false);
    add(new THREE.BoxGeometry(0.03, 0.9, KD), M.wainscot, ext.x0 + 0.02, 0.45, KD / 2, dining, false);

    // tables, chairs and place settings, instanced per part
    const seatsTotal = tables.reduce((s, t) => s + t.seats, 0);
    const chairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), M.seat, seatsTotal);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.5, 0.05), M.chair, seatsTotal);
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), M.chair, seatsTotal * 4);
    const plates = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.12, 0.018, 32), M.porcelain, seatsTotal);
    const glassGeo = new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.035, 0.005], [0.004, 0.012], [0.004, 0.11], [0.03, 0.13], [0.042, 0.18], [0.038, 0.23], [0.036, 0.235]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
    const glasses = new THREE.InstancedMesh(glassGeo, M.crystal, seatsTotal);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const one = new THREE.Vector3(1, 1, 1);
    let si = 0, li = 0;
    seatSpots = new Map();
    candleLights = []; flames = [];
    const flowers = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    flowers.userData.season = true;
    for (const t of tables) {
      const tt = TABLE_TYPES[t.seats] ?? TABLE_TYPES[4];
      const g = new THREE.Group(); g.position.set(t.x, 0, t.z); g.rotation.y = THREE.MathUtils.degToRad(t.rotY || 0); dining.add(g);
      const H = 0.74;
      if (tt.shape === 'round') {
        add(new THREE.CylinderGeometry(tt.w / 2 + 0.02, tt.w / 2 + 0.12, H - 0.05, 48, 1, true), M.linen, 0, (H - 0.05) / 2 + 0.03, 0, g);
        add(new THREE.CylinderGeometry(tt.w / 2 + 0.02, tt.w / 2 + 0.02, 0.03, 48), M.linen, 0, H, 0, g);
      } else {
        add(new THREE.BoxGeometry(tt.w + 0.04, 0.03, tt.d + 0.04), M.linen, 0, H, 0, g);
        add(new THREE.BoxGeometry(tt.w + 0.06, 0.4, tt.d + 0.06), M.linen, 0, H - 0.2, 0, g);
        add(new THREE.BoxGeometry(tt.w * 0.8, H - 0.4, tt.d * 0.8), M.chair, 0, (H - 0.4) / 2, 0, g);
      }
      // centrepiece: candle and a small seasonal arrangement
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 16), M.wax, 0.12, H + 0.085, 0, g, false);
      const fl = add(new THREE.ConeGeometry(0.011, 0.035, 8), M.flame, 0.12, H + 0.175, 0, g, false); flames.push(fl);
      for (let k = 0; k < 7; k++) add(new THREE.IcosahedronGeometry(0.03, 1), flowers, -0.06 + Math.cos(k) * 0.05, H + 0.07 + (k % 3) * 0.02, Math.sin(k) * 0.05, g, false);
      if (candleLights.length < (hi ? 10 : 4)) {
        const cl = new THREE.PointLight(0xffa64d, 0.6, 2.2, 2); cl.position.set(0.12, H + 0.25, 0); g.add(cl); candleLights.push(cl);
      }
      // seats around the table
      const spots = [];
      for (let s = 0; s < t.seats; s++) {
        let lx, lz, rot;
        if (tt.shape === 'rect') { const side = s % 2 ? 1 : -1; const i = Math.floor(s / 2); const n = t.seats / 2; lx = -tt.w / 2 + (i + 0.5) * (tt.w / n); lz = side * (tt.d / 2 + 0.32); rot = side > 0 ? Math.PI : 0; }
        else if (t.seats === 2) { lz = s ? tt.d / 2 + 0.32 : -(tt.d / 2 + 0.32); lx = 0; rot = s ? Math.PI : 0; }
        else { const a = (s / t.seats) * Math.PI * 2; const rr = tt.w / 2 + 0.34; lx = Math.sin(a) * rr; lz = -Math.cos(a) * rr; rot = -a; }
        const wp = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
        const yaw = rot + g.rotation.y;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        chairs.setMatrixAt(si, m4.compose(new THREE.Vector3(wp.x, 0.46, wp.z), q, one));
        const back = new THREE.Vector3(0, 0, -0.21).applyQuaternion(q);
        backs.setMatrixAt(si, m4.compose(new THREE.Vector3(wp.x + back.x, 0.74, wp.z + back.z), q, one));
        for (const [ox, oz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
          const o = new THREE.Vector3(ox, 0, oz).applyQuaternion(q);
          legs.setMatrixAt(li++, m4.makeTranslation(wp.x + o.x, 0.23, wp.z + o.z));
        }
        const inward = new THREE.Vector3(0, 0, 0.36).applyQuaternion(q);
        plates.setMatrixAt(si, m4.makeTranslation(wp.x + inward.x, H + 0.025, wp.z + inward.z));
        const side = new THREE.Vector3(0.17, 0, 0.42).applyQuaternion(q);
        glasses.setMatrixAt(si, m4.makeTranslation(wp.x + side.x, H + 0.015, wp.z + side.z));
        spots.push({ x: wp.x, z: wp.z, yaw });
        si++;
      }
      seatSpots.set(t.id, spots);
    }
    for (const im of [chairs, backs, legs, plates, glasses]) { im.castShadow = true; im.receiveShadow = true; dining.add(im); }
    glasses.castShadow = false;

    // pin spots over the room, a 3 x 2 grid
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const l = new THREE.RectAreaLight(0xffd6a8, 1, 1.4, 1.4);
      const x = ext.x0 + W * (i + 0.5) / 3, z = KD * (j + 0.5) / 2;
      l.position.set(x, WALL_H - 0.02, z); l.lookAt(x, 0, z); l.userData.room = 'dining';
      const panel = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      panel.rotation.x = Math.PI / 2; panel.position.set(x, WALL_H, z); l.userData.panel = panel;
      root.add(l, panel); diningSpots.push(l);
    }

    // guests: one instanced body and head per seat, shown by setGuests
    guests.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), M.guest, Math.max(1, seatsTotal));
    guests.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 16, 12), M.skin, Math.max(1, seatsTotal));
    guests.body.castShadow = guests.head.castShadow = true;
    guests.body.count = guests.head.count = 0;
    dining.add(guests.body, guests.head);
    applySeasonColors();
    if (lastLook) applyLook(lastLook);
  }

  /** Seat guests from the simulation's tables snapshot: [{ id, state, size }]. */
  function setGuests(simTables = []) {
    if (!guests.body) return;
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const one = new THREE.Vector3(1, 1, 1);
    const tint = [0x23262c, 0x3a2f2a, 0x1f2a3a, 0x4a4a4f, 0x5b3a3a, 0x2f3b2f];
    let n = 0;
    for (const t of simTables) {
      if (t.state !== 'seated' || !t.size) continue;
      const spots = seatSpots.get(t.id); if (!spots) continue;
      for (let s = 0; s < Math.min(t.size, spots.length); s++) {
        const p = spots[s]; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
        const back = new THREE.Vector3(0, 0, -0.04).applyQuaternion(q);
        guests.body.setMatrixAt(n, m4.compose(new THREE.Vector3(p.x + back.x, 0.86, p.z + back.z), q, one));
        guests.head.setMatrixAt(n, m4.compose(new THREE.Vector3(p.x + back.x, 1.33, p.z + back.z), q, one));
        guests.body.setColorAt(n, new THREE.Color(tint[(n * 7 + s) % tint.length]));
        n++;
      }
    }
    guests.body.count = guests.head.count = n;
    guests.body.instanceMatrix.needsUpdate = guests.head.instanceMatrix.needsUpdate = true;
    if (guests.body.instanceColor) guests.body.instanceColor.needsUpdate = true;
  }

  // ---- look ------------------------------------------------------------------------------------
  let lastLook = null;
  let precip = 'none';
  function applySeasonColors() {
    if (!lastLook) return;
    M.foliage.color.setHex(lastLook.foliage);
    M.grass.color.setHex(lastLook.groundColor);
    M.blossom.color.setHex(lastLook.blossom);
    M.produce.color.setHex(PRODUCE_COLOR[lastLook.season]);
    dining.traverse((o) => { if (o.material?.userData?.season) o.material.color.setHex(lastLook.blossom); });
    for (const t of trees) {
      const bare = lastLook.season === 'winter' && lastLook.weather !== 'snow' ? 0.55 : lastLook.season === 'winter' ? 0.75 : lastLook.season === 'fall' ? 0.92 : 1;
      t.userData.crown.scale.setScalar(bare);
    }
  }

  function applyLook(look) {
    lastLook = look;
    const { azimuthDeg: az, elevationDeg: el } = look.sun;
    const dir = new THREE.Vector3(Math.sin(az * Math.PI / 180) * Math.cos(el * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(az * Math.PI / 180) * Math.cos(el * Math.PI / 180));
    // layout x runs west to east, z south to north: north is +z
    sun.position.copy(center).addScaledVector(dir, 60);
    sun.color.setHex(look.sun.color); sun.intensity = look.sun.intensity;
    sun.visible = look.sun.intensity > 0.001;
    moon.intensity = look.moon ? look.moon.intensity * 3 : 0;
    skyUniforms.top.value.setHex(look.sky.top); skyUniforms.horizon.value.setHex(look.sky.horizon); skyUniforms.ground.value.setHex(look.sky.ground);
    skyUniforms.sunDir.value.copy(dir); skyUniforms.sunColor.value.setHex(look.sun.color); skyUniforms.sunSize.value = el > -2 ? 1 - look.cloud * 0.9 : 0;
    hemi.color.setHex(look.sky.top); hemi.groundColor.setHex(look.sky.ground);
    hemi.intensity = 0.04 + 1.1 * look.daylight * (1 - look.cloud * 0.3);
    // indoors after dark the room is lit by its fixtures, so ambient (environment) light follows them closely
    scene.environmentIntensity = 0.03 + 0.45 * look.daylight + 0.22 * look.interior.intensity ** 1.5;
    for (const l of ledPanels) { l.color.setHex(look.interior.color); l.intensity = 9 * look.interior.intensity; l.userData.panel.material.color.setHex(look.interior.color).multiplyScalar(Math.min(1, 0.3 + look.interior.intensity)); }
    for (const l of diningSpots) { l.color.setHex(look.accent.color); l.intensity = 12 * look.interior.intensity ** 1.3; l.userData.panel.material.color.setHex(look.accent.color); }
    passLamp.color.setHex(look.accent.color); passLamp.intensity = 5 * look.accent.intensity;
    for (const c of candleLights) { c.visible = look.candles; c.intensity = 1.6 * look.accent.intensity; c.userData.base = c.intensity; }
    for (const f of flames) f.visible = look.candles;
    renderer.toneMappingExposure = look.exposure;
    const fogColor = new THREE.Color(look.sky.horizon).lerp(new THREE.Color(look.interior.color), 0.25);
    scene.fog = look.haze > 0.001 ? new THREE.FogExp2(fogColor, 0.004 + look.haze * 0.03) : null;
    precip = look.precipitation ? look.weather : 'none';
    drops.visible = precip !== 'none';
    drops.material.size = precip === 'snow' ? 0.09 : 0.035;
    drops.material.opacity = precip === 'snow' ? 0.9 : 0.45;
    applySeasonColors();
  }

  let time = 0;
  function update(dt) {
    time += dt;
    for (let i = 0; i < flames.length; i++) { const f = flames[i]; f.scale.y = 1 + Math.sin(time * 13 + i * 2.1) * 0.12 + Math.sin(time * 7.3 + i) * 0.08; }
    for (let i = 0; i < candleLights.length; i++) { const c = candleLights[i]; c.intensity = (c.userData.base ?? 1) * (1 + Math.sin(time * 11 + i * 3) * 0.06 + Math.sin(time * 23 + i) * 0.03); }
    if (precip !== 'none') {
      const p = dropGeo.attributes.position.array; const speed = precip === 'snow' ? 1.1 : 9;
      for (let i = 0; i < N_DROPS; i++) {
        p[i * 3 + 1] -= speed * dt;
        if (precip === 'snow') p[i * 3] += Math.sin(time + i) * 0.004;
        if (p[i * 3 + 1] < 0 || roofOver(p[i * 3], p[i * 3 + 2], ext)) p[i * 3 + 1] = 18;
      }
      dropGeo.attributes.position.needsUpdate = true;
    }
  }

  return {
    root, applyLook, setDining, setGuests, update,
    get extent() { return ext; },
    focus: { dining: () => new THREE.Vector3((ext.x0 + ext.x1) / 2, 0, KD / 2), kitchen: () => new THREE.Vector3(KW / 2, 0, KD / 2), all: () => new THREE.Vector3((ext.x0 + KW) / 2, 0, KD / 2) },
  };
}

const PRODUCE_COLOR = { spring: 0x6fae4a, summer: 0xd2452f, fall: 0xd9822b, winter: 0xe0a33a };
