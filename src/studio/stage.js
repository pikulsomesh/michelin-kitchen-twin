// The studio's layer on top of the photoreal twin (src/scene). The twin owns the kitchen, garden, sky,
// sun and render loop; the studio drives it through its hooks (setLook, setDining) and adds only what
// the twin does not model: a dining room sized to the viewer's floor plan (floor, walls, pin spots),
// candlelight and seasonal flowers on the tables, guests seated from the simulation, and rain or snow.
//
//   const stage = createStage({ twin, layout, quality });
//   stage.applyLook(computeLook(...)); stage.setDining(tables); stage.setGuests(sim.state.tables); stage.update(dt);
import * as THREE from 'three';
import { roomExtent } from './config.js';

const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const GLIMPSE_X0 = -7; // the twin's own dining floor runs from x = -7 to the kitchen wall at x = 0

// twin.setDining shapes: round, or rect (two-tops and eight-tops are rect in the studio's table types)
const sceneShape = (t) => (t.shape === 'round' ? 'round' : 'rect');

/** Chair positions around a table, matching the twin's diningTable() so guests sit in its chairs. */
function seatSpots(t) {
  const n = Math.max(1, t.seats | 0);
  const out = [];
  if (sceneShape(t) === 'round') {
    const R = Math.max(0.45, 0.25 + n * 0.08);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.4; out.push([Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3)]); }
  } else {
    const W = 0.85; const cols = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) { const side = k % 2 ? 1 : -1; out.push([(Math.floor(k / 2) - (cols - 1) / 2) * 0.62, side * (W / 2 + 0.27)]); }
  }
  const up = new THREE.Vector3(0, 1, 0); const rot = THREE.MathUtils.degToRad(t.rotY || 0);
  return out.map(([x, z]) => {
    const p = new THREE.Vector3(x, 0, z).applyAxisAngle(up, rot);
    return { x: t.x + p.x, z: t.z + p.z, yaw: Math.atan2(-p.x, -p.z) }; // facing the table
  });
}

export function createStage({ twin, layout, quality = 'balanced' }) {
  const { scene } = twin;
  const root = new THREE.Group(); root.name = 'StudioDining'; scene.add(root);
  const light = quality === 'mobile';
  const { width: KW, depth: KD } = layout.kitchen.footprint;
  const WALL_H = 3.1;
  const WALL_T = 0.15;

  const M = {
    floor: new THREE.MeshPhysicalMaterial({ color: 0x5b3a26, roughness: 0.5, clearcoat: 0.3 }), // matches the twin's dining floor
    wall: new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.85 }),
    wainscot: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfeef0, roughness: 0.05, transparent: true, opacity: 0.16 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46b }),
    flowers: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 0.9 }),
    guest: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc89c80, roughness: 0.7 }),
  };
  const add = (geo, mat, x, y, z, parent = root, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };

  // ---- precipitation -----------------------------------------------------------------------------
  const N_DROPS = light ? 2500 : 6000;
  const dropPos = new Float32Array(N_DROPS * 3);
  { const r = rand(41); for (let i = 0; i < N_DROPS; i++) { dropPos[i * 3] = -30 + r() * 70; dropPos[i * 3 + 1] = r() * 18; dropPos[i * 3 + 2] = -18 + r() * 50; } }
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
  drops.frustumCulled = false; drops.visible = false; root.add(drops);
  let ext = roomExtent([]);
  const underRoof = (x, z) => (x > ext.x0 && x < KW && z > 0 && z < KD) || (x > 0 && x < 19 && z > -16 && z < -4);

  // ---- dining room (rebuilt by setDining) ----------------------------------------------------------
  let room = new THREE.Group(); root.add(room);
  let candleLights = []; let flames = []; let pinSpots = []; let spotsByTable = new Map();
  const guests = { body: null, head: null };

  function setDining(tables) {
    twin.setDining(tables.map((t) => ({ id: t.id, seats: t.seats, shape: sceneShape(t), x: t.x, z: t.z, rotY: t.rotY || 0 })));
    root.remove(room); room.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    room = new THREE.Group(); root.add(room);
    ext = roomExtent(tables);
    const W = -ext.x0;
    // floor beyond the twin's own dining floor, when the plan needs a deeper room
    if (ext.x0 < GLIMPSE_X0) {
      const w = GLIMPSE_X0 - ext.x0;
      add(new THREE.PlaneGeometry(w, KD).rotateX(-Math.PI / 2), M.floor, ext.x0 + w / 2, 0.001, KD / 2, room, false);
    }
    // walls: west and south full height; the north wall is low with garden windows above
    const wall = (x, z, w, d, y0, y1, mat = M.wall) => add(new THREE.BoxGeometry(w, y1 - y0, d), mat, x, (y0 + y1) / 2, z, room, mat !== M.glass);
    wall(ext.x0 - WALL_T / 2, KD / 2, WALL_T, KD + 2 * WALL_T, 0, WALL_H);
    wall(ext.x0 + W / 2, -WALL_T / 2, W, WALL_T, 0, WALL_H);
    wall(ext.x0 + W / 2, KD + WALL_T / 2, W, WALL_T, 0, 1.1);
    wall(ext.x0 + W / 2, KD + WALL_T / 2, W, WALL_T, 2.3, WALL_H);
    wall(ext.x0 + W / 2, KD + WALL_T / 2, W, 0.03, 1.1, 2.3, M.glass);
    wall(ext.x0 + W / 2, 0.02, W, 0.03, 0, 0.9, M.wainscot);
    wall(ext.x0 + 0.02, KD / 2, 0.03, KD, 0, 0.9, M.wainscot);

    // candle and a small seasonal arrangement on every table; candle light on the nearest few
    candleLights = []; flames = []; spotsByTable = new Map();
    const H = 0.745;
    const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12);
    const flameGeo = new THREE.ConeGeometry(0.009, 0.03, 8);
    const bloom = new THREE.IcosahedronGeometry(0.028, 1);
    const maxLights = light ? 4 : 12;
    const byDoor = [...tables].sort((a, b) => Math.hypot(a.x, a.z - 5.4) - Math.hypot(b.x, b.z - 5.4));
    for (const t of tables) {
      const g = new THREE.Group(); g.position.set(t.x, 0, t.z); room.add(g);
      flames.push(add(flameGeo, M.flame, 0, H + 0.115, 0, g, false));
      for (let k = 0; k < 7; k++) add(bloom, k % 3 ? M.flowers : M.leaves, 0.16 + Math.cos(k) * 0.05, H + 0.03 + (k % 3) * 0.02, Math.sin(k) * 0.05, g, false);
      if (byDoor.indexOf(t) < maxLights) {
        const cl = new THREE.PointLight(0xffa64d, 0.6, 2.4, 2); cl.position.set(0, H + 0.25, 0); g.add(cl); candleLights.push(cl);
      }
      spotsByTable.set(t.id, seatSpots(t));
    }
    // pin spots over the room
    pinSpots = [];
    const cols = Math.max(2, Math.round(W / 3.5));
    for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) {
      const l = new THREE.RectAreaLight(0xffd6a8, 1, 1.2, 1.2);
      const x = ext.x0 + W * (i + 0.5) / cols, z = KD * (j + 0.5) / 2;
      l.position.set(x, WALL_H - 0.05, z); l.lookAt(x, 0, z);
      room.add(l); pinSpots.push(l);
    }
    // guests: one instanced body and head per seat, shown by setGuests
    const seats = Math.max(1, tables.reduce((s, t) => s + t.seats, 0));
    guests.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), M.guest, seats);
    guests.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 16, 12), M.skin, seats);
    guests.body.castShadow = guests.head.castShadow = true;
    guests.body.count = guests.head.count = 0;
    room.add(guests.body, guests.head);
    if (lastLook) applyLook(lastLook);
  }

  /** Seat guests from the simulation's tables snapshot: [{ id, state, size }]. */
  const tint = [0x23262c, 0x3a2f2a, 0x1f2a3a, 0x4a4a4f, 0x5b3a3a, 0x2f3b2f].map((c) => new THREE.Color(c));
  function setGuests(simTables = []) {
    if (!guests.body) return;
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const one = new THREE.Vector3(1, 1, 1); const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const t of simTables) {
      if (t.state !== 'seated' || !t.size) continue;
      const spots = spotsByTable.get(t.id); if (!spots) continue;
      for (let s = 0; s < Math.min(t.size, spots.length); s++) {
        const p = spots[s]; q.setFromAxisAngle(up, p.yaw);
        guests.body.setMatrixAt(n, m4.compose(new THREE.Vector3(p.x, 0.86, p.z), q, one));
        guests.head.setMatrixAt(n, m4.compose(new THREE.Vector3(p.x, 1.33, p.z), q, one));
        guests.body.setColorAt(n, tint[(n * 7 + s) % tint.length]);
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
  const FOLIAGE = { spring: 1, summer: 1, fall: 0.8, winter: 0.5 };
  function applyLook(look) {
    lastLook = look;
    twin.setLook({
      // the twin's sun is calibrated for 1.5 at golden hour; computeLook peaks near 3.2 at noon
      sun: { azimuthDeg: look.sun.azimuthDeg, elevationDeg: Math.max(look.sun.elevationDeg, -10), color: look.sun.color, intensity: look.sun.intensity * 0.7 },
      sky: { top: look.sky.top, horizon: look.sky.horizon },
      interior: { kelvin: look.interior.kelvin, intensity: look.interior.intensity },
      // canopy heat lamps run at 3.2 in the twin; accent intensity is 0.4 to 1.2
      accent: { kelvin: look.accent.kelvin, intensity: 4 * look.accent.intensity },
      exposure: look.exposure,
      haze: look.haze,
      season: look.season,
      foliage: look.weather === 'snow' ? 0.3 : FOLIAGE[look.season] ?? 1,
    });
    // after dark the room is lit by its fixtures, so the ambient light follows them
    scene.environmentIntensity = 0.06 + 0.36 * look.daylight + 0.2 * look.interior.intensity ** 1.5;
    for (const l of pinSpots) { l.color.setHex(look.accent.color); l.intensity = 10 * look.interior.intensity ** 1.3; }
    for (const c of candleLights) { c.visible = look.candles; c.userData.base = 1.6 * look.accent.intensity; }
    for (const f of flames) f.visible = look.candles;
    M.flowers.color.setHex(look.blossom);
    precip = look.precipitation ? look.weather : 'none';
    drops.visible = precip !== 'none';
    drops.material.size = precip === 'snow' ? 0.09 : 0.035;
    drops.material.opacity = precip === 'snow' ? 0.9 : 0.45;
  }

  let time = 0;
  function update(dt) {
    time += dt;
    for (let i = 0; i < flames.length; i++) flames[i].scale.y = 1 + Math.sin(time * 13 + i * 2.1) * 0.12 + Math.sin(time * 7.3 + i) * 0.08;
    for (let i = 0; i < candleLights.length; i++) { const c = candleLights[i]; c.intensity = (c.userData.base ?? 1) * (1 + Math.sin(time * 11 + i * 3) * 0.06 + Math.sin(time * 23 + i) * 0.03); }
    if (precip !== 'none') {
      const p = dropGeo.attributes.position.array; const speed = precip === 'snow' ? 1.1 : 9;
      for (let i = 0; i < N_DROPS; i++) {
        p[i * 3 + 1] -= speed * dt;
        if (precip === 'snow') p[i * 3] += Math.sin(time + i) * 0.004;
        if (p[i * 3 + 1] < 0 || (p[i * 3 + 1] < 6.5 && underRoof(p[i * 3], p[i * 3 + 2]))) p[i * 3 + 1] = 18;
      }
      dropGeo.attributes.position.needsUpdate = true;
    }
  }

  return {
    root, applyLook, setDining, setGuests, update,
    get extent() { return ext; },
    focus: { dining: () => new THREE.Vector3(ext.x0 / 2, 0, KD / 2), kitchen: () => new THREE.Vector3(KW / 2, 0, KD / 2), all: () => new THREE.Vector3((ext.x0 + KW) / 2, 0, KD / 2 - 3) },
  };
}
