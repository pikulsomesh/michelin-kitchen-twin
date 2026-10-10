// The building: The French Laundry's 2017 kitchen (curved skylit vault,
// terrazzo floor, white solid-surface walls, fritted ribbon window on the
// garden corner), the courtyard, the support annex, a glimpse of the dining
// room, and the culinary garden across the window. Built from data/layout.json.
import * as THREE from 'three';
import { rbox, box, cyl, lathe, at, add, rod, legs, worktable, markStatic, hash01 } from './kit.js';
import { worldUV } from './materials.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SITE } from './plan.js';

const WALL_T = 0.15;

// A rosette of curved leaves with a light heart and darker tips, used for
// the garden's lettuces, kale and herbs.
function rosette(leaves, len, width, curl, lift, heart, tip) {
  const geos = [];
  for (let k = 0; k < leaves; k++) {
    const ring = k / leaves;
    const L = len * (0.65 + 0.35 * ((k * 7) % leaves) / leaves);
    const g = new THREE.PlaneGeometry(width, L, 2, 6);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / L + 0.5; // 0 at stem, 1 at tip
      const x = p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
      const out = t * L;
      const up = Math.sin(t * Math.PI * 0.5) * lift * L - curl * t * t * L * 0.6;
      p.setXYZ(i, x, up + Math.abs(x) * 0.25, out);
      const c = [0, 1, 2].map((j) => heart[j] + (tip[j] - heart[j]) * t);
      col.push(...c);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.rotateY(ring * Math.PI * 2 + (k % 2) * 0.3);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

// A dressed dining table: linen, porcelain, candle and chairs. shape is
// 'round' or 'rect'; seats are spread around it.
const diningWood = new THREE.MeshPhysicalMaterial({ color: 0x5b3a26, roughness: 0.5, clearcoat: 0.3 });
const candleMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffb25a, emissiveIntensity: 2.5 });
export function diningTable(M, { id, seats = 4, shape = 'round' } = {}) {
  const t = new THREE.Group();
  t.name = id ? `Table_${id}` : 'Table';
  const round = shape !== 'rect';
  const n = Math.max(1, seats | 0);
  const R = round ? Math.max(0.45, 0.25 + n * 0.08) : 0;
  const L = round ? 0 : Math.max(0.8, Math.ceil(n / 2) * 0.62), W = 0.85;
  if (round) {
    add(t, lathe([[0, 0.74], [R, 0.74], [R + 0.02, 0.72], [R + 0.04, 0.4], [R + 0.02, 0.4], [R - 0.02, 0.71], [0, 0.71]], M.linen, 40));
    add(t, at(cyl(0.05, 0.05, 0.7, M.blackSteel), 0, 0, 0));
  } else {
    add(t, at(rbox(L + 0.08, 0.3, W + 0.08, M.linen, { r: 0.02 }), 0, 0.45, 0));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(t, at(cyl(0.025, 0.025, 0.44, diningWood, { seg: 8 }), lx * (L / 2 - 0.08), 0, lz * (W / 2 - 0.08)));
  }
  const seatsAt = [];
  if (round) for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.4; seatsAt.push([Math.cos(a), Math.sin(a), a]); }
  else for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1, col = Math.floor(k / 2), cols = Math.ceil(n / 2);
    const x = (col - (cols - 1) / 2) * 0.62;
    seatsAt.push([x, side, side > 0 ? Math.PI / 2 : -Math.PI / 2, true]);
  }
  for (const [cx, cz, a, rect] of seatsAt) {
    const px = rect ? cx : cx * (R - 0.2), pz = rect ? cz * (W / 2 - 0.2) : cz * (R - 0.2);
    add(t, at(lathe([[0, 0], [0.12, 0], [0.145, 0.018], [0.14, 0.02], [0, 0.008]], M.porcelain, 24), px, 0.745, pz));
    const chair = new THREE.Group();
    add(chair, at(rbox(0.45, 0.06, 0.45, diningWood, { r: 0.02 }), 0, 0.45, 0));
    add(chair, at(rbox(0.45, 0.5, 0.05, diningWood, { r: 0.02 }), 0, 0.5, -0.22));
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) add(chair, at(cyl(0.018, 0.015, 0.45, diningWood, { seg: 8 }), lx, 0, lz));
    const d = rect ? W / 2 + 0.3 : R + 0.33;
    chair.position.set(rect ? cx : Math.cos(a) * d, 0, rect ? cz * d : Math.sin(a) * d);
    chair.rotation.y = rect ? (cz > 0 ? Math.PI : 0) : -a + Math.PI / 2 + Math.PI;
    t.add(chair);
  }
  add(t, at(cyl(0.02, 0.02, 0.1, candleMat, { seg: 10 }), 0, 0.745, 0));
  return t;
}

// Circular vault through (0, spring), (D/2, peak), (D, spring).
export function vaultProfile(D, spring, peak) {
  const a = D / 2, s = peak - spring;
  const R = (a * a + s * s) / (2 * s);
  const cy = peak - R;
  return { R, cy, a, y: (z) => cy + Math.sqrt(Math.max(0, R * R - (z - a) ** 2)) };
}

// A wall as a flat shape with rectangular holes for doors and windows.
// `outline` is a list of [u, v] points; holes are [u0, u1, v0, v1].
function wallMesh(outline, holes, mat) {
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const [u0, u1, v0, v1] of holes) {
    const h = new THREE.Path();
    h.moveTo(u0, v0); h.lineTo(u0, v1); h.lineTo(u1, v1); h.lineTo(u1, v0); h.lineTo(u0, v0);
    shape.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(shape, 24);
  worldUV(g, 1);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export function buildSite(M, plan, nav) {
  const g = new THREE.Group();
  g.name = 'site';
  const K = plan.kitchen;
  const KW = K.footprint.width, KD = K.footprint.depth;
  const spring = K.ceiling.springHeight, peak = K.ceiling.peakHeight;
  const vault = vaultProfile(KD, spring, peak);
  const out = { lights: [], storeSlots: {}, canopies: [] };

  // ---------------------------------------------------------------- ground
  const ground = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), 1.6), M.grass);
  ground.position.set(8, -0.03, 0);
  ground.receiveShadow = true;
  g.add(ground);
  // courtyard path between kitchen and annex
  const path = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(2.2, 4.4).rotateX(-Math.PI / 2), 0.8), M.gravel);
  path.position.set(SITE.annexDoor.at, -0.02, -2);
  path.receiveShadow = true;
  g.add(path);

  // ---------------------------------------------------------------- kitchen floor
  const fg = new THREE.PlaneGeometry(KW, KD).rotateX(-Math.PI / 2);
  fg.translate(KW / 2, 0, KD / 2);
  worldUV(fg, 1.2);
  const floor = new THREE.Mesh(fg, M.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // perimeter slab edge so the cutaway reads as a building
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.9 });
  add(g, at(box(KW + 0.3, 0.3, KD + 0.3, slabMat), KW / 2, -0.16, KD / 2));

  // ---------------------------------------------------------------- kitchen walls
  const openings = K.openings.map((o) => {
    const a = o.from != null ? o.from : o.at - o.width / 2;
    const b = o.from != null ? o.to : o.at + o.width / 2;
    return { ...o, a, b };
  });
  const holesFor = (wall, flip, len) => openings.filter((o) => o.wall === wall).map((o) => {
    const u0 = flip ? len - o.b : o.a, u1 = flip ? len - o.a : o.b;
    return o.sill != null ? [u0, u1, o.sill, Math.min(o.head, spring - 0.05)] : [u0, u1, 0, o.height];
  });
  // south (z=0) faces +z; north (z=KD) faces -z, local u runs from x=KW down.
  const southHoles = holesFor('south', false, KW);
  const northHoles = holesFor('north', true, KW);
  const south = wallMesh([[0, 0], [KW, 0], [KW, spring], [0, spring]], southHoles, M.solidSurface);
  g.add(south);
  const north = wallMesh([[0, 0], [KW, 0], [KW, spring], [0, spring]], northHoles, M.solidSurface);
  north.position.set(KW, 0, KD);
  north.rotation.y = Math.PI;
  g.add(north);
  // gable walls follow the vault; west local u runs from z=KD down, east from z=0 up.
  const gable = [];
  for (let i = 0; i <= 40; i++) { const z = (i / 40) * KD; gable.push([z, vault.y(z)]); }
  const westHoles = holesFor('west', true, KD);
  const eastHoles = holesFor('east', false, KD);
  const west = wallMesh([[0, 0], [KD, 0], ...gable.slice().reverse().map(([z, y]) => [z, y])], westHoles, M.solidSurface);
  west.position.set(0, 0, KD);
  west.rotation.y = Math.PI / 2;
  g.add(west);
  const east = wallMesh([[0, 0], [KD, 0], ...gable.slice().reverse().map(([z, y]) => [z, y])], eastHoles, M.solidSurface);
  east.position.set(KW, 0, 0);
  east.rotation.y = -Math.PI / 2;
  g.add(east);
  // stainless kick base along the walls
  for (const [x, z, w, d] of [[KW / 2, 0.01, KW, 0.02], [KW / 2, KD - 0.01, KW, 0.02], [0.01, KD / 2, 0.02, KD], [KW - 0.01, KD / 2, 0.02, KD]]) {
    add(g, at(box(w, 0.15, d, M.steel, { shadow: false }), x, 0.075, z));
  }

  // Fritted ribbon window panes with slim mullions, plus the garden view.
  for (const o of openings.filter((o) => o.sill != null)) {
    const len = o.b - o.a, hgt = Math.min(o.head, spring - 0.05) - o.sill;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), M.frit);
    const mid = (o.a + o.b) / 2, y = o.sill + hgt / 2;
    if (o.wall === 'north') pane.position.set(mid, y, KD);
    else if (o.wall === 'east') { pane.position.set(KW, y, mid); pane.rotation.y = Math.PI / 2; }
    else if (o.wall === 'south') pane.position.set(mid, y, 0);
    else { pane.position.set(0, y, mid); pane.rotation.y = Math.PI / 2; }
    g.add(pane);
    const n = Math.round(len / 1.5);
    for (let i = 0; i <= n; i++) {
      const t = o.a + (len * i) / n;
      const mul = box(0.04, hgt, 0.08, M.blackSteel);
      if (o.wall === 'north' || o.wall === 'south') mul.position.set(t, y, o.wall === 'north' ? KD : 0);
      else { mul.position.set(o.wall === 'east' ? KW : 0, y, t); mul.rotation.y = Math.PI / 2; }
      g.add(mul);
    }
    // sill
    const sill = box(o.wall === 'north' || o.wall === 'south' ? len : 0.25, 0.03, o.wall === 'north' || o.wall === 'south' ? 0.25 : len, M.solidSurface);
    if (o.wall === 'north') sill.position.set(mid, o.sill, KD - 0.1);
    else if (o.wall === 'east') sill.position.set(KW - 0.1, o.sill, mid);
    g.add(sill);
  }

  // Nav: walls block, openings don't.
  const wallRects = (along, fixed, len, holes, isX) => {
    let cur = 0;
    const doors = holes.filter((h) => h[2] === 0).sort((p, q) => p[0] - q[0]);
    for (const [u0, u1] of doors.concat([[len, len]])) {
      if (u0 > cur) isX ? nav.addRect(cur, u0, fixed - 0.05, fixed + 0.05) : nav.addRect(fixed - 0.05, fixed + 0.05, cur, u0);
      cur = u1;
    }
  };
  wallRects('x', 0, KW, southHoles, true);
  wallRects('x', KD, KW, holesFor('north', false, KW), true);
  wallRects('z', 0, KD, holesFor('west', false, KD), false);
  wallRects('z', KW, KD, eastHoles, false);

  // ---------------------------------------------------------------- vault
  {
    const segU = 2, segA = 56;
    const pos = [], nor = [], uv = [], idx = [];
    const th0 = Math.asin((0 - vault.a) / vault.R), th1 = Math.asin((KD - vault.a) / vault.R);
    for (let j = 0; j <= segA; j++) {
      const th = th0 + (th1 - th0) * (j / segA);
      const z = vault.a + Math.sin(th) * vault.R, y = vault.cy + Math.cos(th) * vault.R;
      for (let i = 0; i <= segU; i++) {
        const x = (i / segU) * KW;
        pos.push(x, y, z);
        nor.push(0, -Math.cos(th), -Math.sin(th));
        uv.push(x / 2, (th * vault.R) / 2);
      }
    }
    for (let j = 0; j < segA; j++) for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    vg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    vg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    vg.setIndex(idx);
    // make sure faces point down into the room
    const tri = new THREE.Triangle(new THREE.Vector3(...pos.slice(0, 3)), new THREE.Vector3(...pos.slice(3, 6)), new THREE.Vector3(...pos.slice((segU + 1) * 3, (segU + 1) * 3 + 3)));
    const n = new THREE.Vector3(); tri.getNormal(n);
    if (n.y > 0 || n.z < 0 && Math.abs(n.y) < 0.1) { idx.reverse(); vg.setIndex(idx); }
    const vaultMat = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.85 });
    const vm = new THREE.Mesh(vg, vaultMat);
    vm.receiveShadow = true;
    g.add(vm);
    // Exterior roof: a standing-seam skin facing out, lifted away in the
    // bird's-eye cutaway so the line shows from above.
    const sg = vg.clone();
    const sp = sg.attributes.position, sn = sg.attributes.normal;
    for (let i = 0; i < sp.count; i++) {
      sp.setXYZ(i, sp.getX(i), sp.getY(i) - sn.getY(i) * 0.14, sp.getZ(i) - sn.getZ(i) * 0.14);
      sn.setXYZ(i, -sn.getX(i), -sn.getY(i), -sn.getZ(i));
    }
    sg.setIndex([...sg.index.array].reverse());
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc9c7c1, roughness: 0.42, metalness: 0.55 });
    const roof = new THREE.Mesh(sg, roofMat);
    roof.castShadow = false; // the key light stands in for the vault LEDs
    roof.name = 'VaultRoof';
    roof.userData.dynamic = true;
    g.add(roof);
    out.canopies.push(roof);
    // skylight along the crown (evening sky)
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(KW - 2, 1.0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.5) }));
    sky.position.set(KW / 2, peak - 0.02, KD / 2);
    g.add(sky);
    // linear LED pendants along the vault, warm to match the dining room
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 2.1) });
    for (const z of [2.2, 8.6]) {
      for (const [x0, x1] of [[0.8, 3.8], [11.2, 16.2]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, 0.06), ledMat);
        bar.position.set((x0 + x1) / 2, 3.3, z);
        g.add(bar);
        g.add(rod([x0 + 0.1, 3.3, z], [x0 + 0.1, vault.y(z), z], 0.003, M.blackSteel));
        g.add(rod([x1 - 0.1, 3.3, z], [x1 - 0.1, vault.y(z), z], 0.003, M.blackSteel));
      }
    }
  }

  // Ventilated canopies over the two island suites, at overSuitesHeight.
  const canopyH = K.ceiling.overSuitesHeight ?? 2.75;
  for (const p of plan.placements.filter((p) => p.eq.type === 'cooking-suite')) {
    const [w, d] = p.eq.dimsM;
    const cw = w + 0.6, cd = d + 0.8;
    const c = new THREE.Group();
    add(c, at(rbox(cw, 0.45, cd, M.steel, { r: 0.02 }), 0, 0, 0));
    add(c, at(rbox(cw - 0.12, 0.03, cd - 0.12, M.steelDark, { r: 0.004 }), 0, -0.02, 0));
    for (let x = -cw / 2 + 0.4; x < cw / 2 - 0.3; x += 0.55) {
      for (const s of [-1, 1]) add(c, at(rbox(0.48, 0.01, 0.4, M.filterMesh, { r: 0.002 }), x, -0.005, s * (cd / 2 - 0.35)));
    }
    const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2.2) });
    for (let x = -cw / 2 + 0.6; x < cw / 2 - 0.4; x += 1.2) {
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12).rotateX(Math.PI / 2), lensMat);
      lens.position.set(x, -0.025, 0);
      c.add(lens);
    }
    // duct up into the vault
    add(c, at(rbox(0.8, peak - canopyH - 0.6, 0.6, M.steel, { r: 0.01 }), 0, 0.45, 0));
    c.position.set(p.x, canopyH, p.z);
    c.name = `Canopy_${p.eq.id}`;
    c.userData.dynamic = true; // hidden in the bird's-eye view so the line shows
    g.add(c);
    out.canopies.push(c);
    const rl = new THREE.RectAreaLight(0xffe7cc, 3.2, w, d * 0.8);
    rl.position.set(p.x, canopyH - 0.05, p.z);
    rl.lookAt(p.x, 0, p.z);
    g.add(rl);
    out.lights.push(rl);
  }

  // ---------------------------------------------------------------- benches
  for (const b of plan.benches) {
    const t = worktable(M, b.width, b.depth, { h: b.height ?? 0.92, splash: false });
    t.position.set(b.x, 0, b.z);
    g.add(t);
    nav.addRect(b.x - b.width / 2, b.x + b.width / 2, b.z - b.depth / 2, b.z + b.depth / 2);
  }

  // ---------------------------------------------------------------- dressing
  // Pot sink beside the dish machine, hand sinks, speed racks and bins.
  const potSink = sinkUnit(M, 1.4, 3);
  potSink.position.set(0.42, 0, 7.3);
  potSink.rotation.y = Math.PI / 2;
  g.add(potSink);
  nav.addBox(0.42, 7.3, 1.4, 0.7, Math.PI / 2);
  for (const [x, z, r] of [[0.25, 3.3, Math.PI / 2], [16.75, 9.9, -Math.PI / 2], [3.6, 0.25, 0]]) {
    const hs = sinkUnit(M, 0.45, 1, true);
    hs.position.set(x, 0, z);
    hs.rotation.y = r;
    g.add(hs);
    nav.addBox(x, z, 0.45, 0.4, r);
  }
  for (const [x, z, r] of [[16.55, 0.6, 0], [10.1, 9.4, 0]]) {
    const rk = speedRack(M);
    rk.position.set(x, 0, z);
    rk.rotation.y = r;
    g.add(rk);
    nav.addBox(x, z, 0.55, 0.7, r);
  }
  const binMat = new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.7 });
  const compostMat = new THREE.MeshStandardMaterial({ color: 0x3b6f3f, roughness: 0.7 });
  for (const [x, z, m] of [[3.95, 1.0, binMat], [11.4, 1.0, compostMat], [16.6, 5.2, binMat], [4.1, 10.2, compostMat]]) {
    add(g, at(cyl(0.22, 0.2, 0.75, m, { seg: 20 }), x, 0, z));
    nav.addBox(x, z, 0.46, 0.46, 0);
  }

  // Live shellfish well: crushed ice on a cart, oysters and lobsters on top.
  {
    const L = SITE.liveTank;
    const cart = worktable(M, L.w, L.d, { h: 0.85, splash: false });
    const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f8fb, roughness: 0.25, clearcoat: 1 });
    const ice = rbox(L.w - 0.08, 0.12, L.d - 0.08, M.steel, { r: 0.01 });
    ice.position.y = 0.85;
    cart.add(ice);
    const bed = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.018, 0), iceMat, 500);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 500; i++) {
      m4.makeRotationFromEuler(new THREE.Euler(i, i * 1.3, i * 0.7));
      m4.setPosition((hash01('ix' + i) - 0.5) * (L.w - 0.14), 0.955 + hash01('iy' + i) * 0.02, (hash01('iz' + i) - 0.5) * (L.d - 0.14));
      bed.setMatrixAt(i, m4);
    }
    bed.castShadow = bed.receiveShadow = true;
    cart.add(bed);
    cart.position.set(L.x, 0, L.z);
    cart.rotation.y = L.rot;
    g.add(cart);
    nav.addBox(L.x, L.z, L.w, L.d, L.rot);
    out.storeSlots['SL-LIVE-TANK'] = [-0.25, 0.25].map((u) => new THREE.Vector3(L.x + u, 0.98, L.z));
  }

  // ---------------------------------------------------------------- annex
  if (plan.annex) {
    const A = plan.annex.footprint;
    const ax0 = A.x, ax1 = A.x + A.width, az0 = A.z, az1 = A.z + A.depth;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.6, metalness: 0 });
    const af = new THREE.Mesh(new THREE.PlaneGeometry(A.width, A.depth).rotateX(-Math.PI / 2), concrete);
    af.position.set((ax0 + ax1) / 2, 0, (az0 + az1) / 2);
    af.receiveShadow = true;
    g.add(af);
    add(g, at(box(A.width + 0.3, 0.3, A.depth + 0.3, slabMat), (ax0 + ax1) / 2, -0.16, (az0 + az1) / 2));
    const AH = 3.0;
    const door = SITE.annexDoor;
    const aw = (u0, u1) => [[u0, 0], [u1, 0], [u1, AH], [u0, AH]];
    // north wall (z=az1) faces -z: local u runs from x=ax1 down
    const nwall = wallMesh(aw(0, A.width), [[ax1 - (door.at + door.width / 2), ax1 - (door.at - door.width / 2), 0, 2.4]], M.paint);
    nwall.position.set(ax1, 0, az1);
    nwall.rotation.y = Math.PI;
    g.add(nwall);
    const swall = wallMesh(aw(0, A.width), [], M.paint);
    swall.position.set(ax0, 0, az0);
    g.add(swall);
    const wwall = wallMesh(aw(0, A.depth), [], M.paint);
    wwall.position.set(ax0, 0, az1);
    wwall.rotation.y = Math.PI / 2;
    g.add(wwall);
    const ewall = wallMesh(aw(0, A.depth), [], M.paint);
    ewall.position.set(ax1, 0, az0);
    ewall.rotation.y = -Math.PI / 2;
    g.add(ewall);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(A.width, A.depth).rotateX(Math.PI / 2), M.ceiling);
    ceil.position.set((ax0 + ax1) / 2, AH, (az0 + az1) / 2);
    g.add(ceil);
    nav.addRect(ax0, door.at - door.width / 2, az1 - 0.05, az1 + 0.05);
    nav.addRect(door.at + door.width / 2, ax1, az1 - 0.05, az1 + 0.05);
    nav.addRect(ax0, ax1, az0 - 0.05, az0 + 0.05);
    nav.addRect(ax0 - 0.05, ax0 + 0.05, az0, az1);
    nav.addRect(ax1 - 0.05, ax1 + 0.05, az0, az1);
    // block the open lawn so cooks keep to the courtyard path
    nav.addRect(-3, door.at - 1.1, az1 + 0.1, -0.1);
    nav.addRect(door.at + 1.1, ax1 + 1, az1 + 0.1, -0.1);
    // ceiling panel lights
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1) });
    for (let x = ax0 + 2; x < ax1 - 1; x += 4) for (let z = az0 + 2; z < az1 - 1; z += 3.5) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2), panelMat);
      p.position.set(x, AH - 0.01, z);
      g.add(p);
    }
    const arl = new THREE.RectAreaLight(0xf4f6ff, 1.6, A.width - 2, A.depth - 2);
    arl.position.set((ax0 + ax1) / 2, AH - 0.02, (az0 + az1) / 2);
    arl.lookAt((ax0 + ax1) / 2, 0, (az0 + az1) / 2);
    g.add(arl);

    // wine cellar racks
    const cellar = plan.zones.find((z) => z.id === 'wine-cellar');
    if (cellar) {
      const rackWood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.7 });
      const bottleMat = new THREE.MeshPhysicalMaterial({ color: 0x14301c, roughness: 0.1, clearcoat: 1 });
      const bottleGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.3, 10).rotateX(Math.PI / 2);
      for (let r = 0; r < 3; r++) {
        const rz = cellar.z + 0.6 + r * 1.8;
        add(g, at(rbox(cellar.width - 1, 2.1, 0.4, rackWood, { r: 0.01 }), cellar.x + cellar.width / 2, 0, rz));
        const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, 400);
        const m4 = new THREE.Matrix4();
        let k = 0;
        for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 40 && k < 400; xx++) {
          m4.makeTranslation(cellar.x + 0.7 + xx * ((cellar.width - 1.4) / 39), 0.15 + yy * 0.2, rz + 0.22 * (r % 2 ? -1 : 1));
          bottles.setMatrixAt(k++, m4);
        }
        g.add(bottles);
        nav.addRect(cellar.x + 0.5, cellar.x + cellar.width - 0.5, rz - 0.2, rz + 0.2);
      }
    }
    // offices: two desks with monitors
    const office = plan.zones.find((z) => z.id === 'offices');
    if (office) {
      for (let i = 0; i < 2; i++) {
        const dz = office.z + 1.2 + i * 2.6;
        const desk = worktable(M, 1.4, 0.7, { h: 0.75, top: 'wood', splash: false, shelf: false });
        desk.position.set(office.x + office.width / 2, 0, dz);
        g.add(desk);
        const mon = box(0.55, 0.32, 0.03, new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3a6fd8, emissiveIntensity: 0.9 }));
        mon.position.set(office.x + office.width / 2, 1.0, dz - 0.2);
        g.add(mon);
        nav.addBox(office.x + office.width / 2, dz, 1.4, 0.7, 0);
      }
    }
    // dry store shelving along the annex's north wall
    const D = SITE.dryStore;
    const units = Math.round(D.len / 2.4);
    const slots = [];
    for (let i = 0; i < units; i++) {
      const sh = shelving(M, D.len / units - 0.05, D.depth);
      const x = D.x - D.len / 2 + (D.len / units) * (i + 0.5);
      sh.position.set(x, 0, D.z);
      sh.rotation.y = D.rot;
      g.add(sh);
      for (const y of sh.userData.levels.slice(0, 4)) {
        const n = Math.floor((D.len / units - 0.1) / 0.32);
        for (let k = 0; k < n; k++) slots.push(new THREE.Vector3(x - (D.len / units) / 2 + 0.2 + k * 0.32, y, D.z));
      }
    }
    nav.addRect(D.x - D.len / 2, D.x + D.len / 2, D.z - D.depth / 2, D.z + D.depth / 2);
    out.storeSlots['SL-DRY'] = slots;
    out.dryRot = D.rot;
  }

  // ---------------------------------------------------------------- dining room glimpse
  {
    const dx0 = -7, dx1 = 0;
    const df = new THREE.Mesh(new THREE.PlaneGeometry(dx1 - dx0, KD).rotateX(-Math.PI / 2), diningWood);
    df.position.set((dx0 + dx1) / 2, 0, KD / 2);
    df.receiveShadow = true;
    g.add(df);
    const dining = new THREE.Group();
    dining.name = 'Dining';
    dining.userData.dynamic = true; // replaceable via setDining()
    for (const [i, [x, z]] of [[-2.2, 2.4], [-2.2, 8.4], [-5, 3.6], [-5, 7.2]].entries()) {
      const t = diningTable(M, { id: `T${i + 1}`, seats: 4 });
      t.position.set(x, 0, z);
      dining.add(t);
    }
    g.add(dining);
    out.dining = dining;
    nav.addRect(-7, -0.05, -0.5, 4.5);
    nav.addRect(-7, -0.05, 6.3, KD + 0.5);
  }

  // ---------------------------------------------------------------- garden
  {
    const G = SITE.garden;
    // Each bed grows one crop: lettuces, red oak leaf, lacinato kale, herbs.
    const crops = [
      { geo: rosette(9, 0.16, 0.09, 0.9, 0.5, [0.55, 0.78, 0.32], [0.25, 0.48, 0.14]), n: 24, s: 0.9 },
      { geo: rosette(11, 0.15, 0.07, 1.2, 0.55, [0.62, 0.22, 0.2], [0.3, 0.42, 0.16]), n: 24, s: 0.9 },
      { geo: rosette(7, 0.34, 0.07, 0.4, 1.2, [0.16, 0.3, 0.2], [0.08, 0.18, 0.1]), n: 12, s: 1 },
      { geo: rosette(14, 0.09, 0.03, 0.6, 0.9, [0.4, 0.62, 0.26], [0.2, 0.38, 0.12]), n: 36, s: 1 },
    ];
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
    out.leafMat = leafMat;
    let bedN = 0;
    for (let x = G.x0 + 0.5; x < G.x1 - 1; x += 2.6) {
      for (let z = G.z0 + 0.4; z < G.z1 - 1; z += 2.2) {
        add(g, at(rbox(2.0, 0.45, 1.2, M.redwood, { r: 0.01 }), x + 1, 0, z + 0.6));
        add(g, at(box(1.9, 0.02, 1.1, M.soil), x + 1, 0.44, z + 0.6));
        const crop = crops[bedN++ % crops.length];
        const plants = new THREE.InstancedMesh(crop.geo, leafMat, crop.n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        const cols = crop.n === 12 ? 6 : crop.n === 36 ? 12 : 8, rows = crop.n / cols;
        for (let i = 0; i < crop.n; i++) {
          const h = hash01(`p${x}${z}${i}`);
          const sc = crop.s * (0.7 + h * 0.6);
          q.setFromEuler(e.set(0, h * 6.28, 0));
          m4.compose(new THREE.Vector3(x + 0.12 + ((i % cols) + 0.5) * (1.76 / cols), 0.45, z + 0.08 + (Math.floor(i / cols) + 0.5) * (1.04 / rows)), q, new THREE.Vector3(sc, sc, sc));
          plants.setMatrixAt(i, m4);
        }
        plants.castShadow = true;
        plants.receiveShadow = true;
        g.add(plants);
      }
    }
    // olive trees and clipped hedges around the property
    const treeGeo = (() => {
      const parts = [];
      for (let k = 0; k < 6; k++) {
        const b = new THREE.IcosahedronGeometry(0.9 + hash01('tb' + k) * 0.5, 3);
        const p = b.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const n = 1 + (hash01(`tv${k}${p.getX(i).toFixed(2)}${p.getY(i).toFixed(2)}${p.getZ(i).toFixed(2)}`) - 0.5) * 0.35;
          p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.75, p.getZ(i) * n);
        }
        const a = (k / 6) * Math.PI * 2;
        b.translate(Math.cos(a) * 0.9, 3.0 + hash01('th' + k) * 0.9, Math.sin(a) * 0.9);
        parts.push(b);
      }
      const crown = mergeVertices(mergeGeometries(parts), 1e-3);
      crown.computeVertexNormals();
      return crown;
    })();
    const leafTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#3d4a2e'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) {
        const v = hash01('lf' + i);
        x.fillStyle = `rgb(${(70 + v * 70) | 0},${(85 + v * 70) | 0},${(55 + v * 40) | 0})`;
        x.beginPath(); x.ellipse(hash01('lx' + i) * 256, hash01('ly' + i) * 256, 3 + v * 3, 1.2, hash01('la' + i) * 3, 0, Math.PI * 2); x.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
    })();
    const foliage = new THREE.MeshStandardMaterial({ map: leafTex, color: 0xb8c4a0, roughness: 0.9 });
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });
    const treeSpots = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash01('ta' + i) * 0.2;
      const r = 26 + hash01('tr' + i) * 10;
      if (a > 0.35 && a < 1.3) continue; // keep the garden view toward the kitchen open
      treeSpots.push([8 + Math.cos(a) * r, -2 + Math.sin(a) * r * 0.8]);
    }
    const crowns = new THREE.InstancedMesh(treeGeo, foliage, treeSpots.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 3, 7).translate(0, 1.5, 0), bark, treeSpots.length);
    const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler();
    treeSpots.forEach(([x, z], i) => {
      const sc = 0.8 + hash01('ts' + i) * 0.6;
      tq.setFromEuler(te.set(0, hash01('ty' + i) * 6.28, 0));
      tm.compose(new THREE.Vector3(x, 0, z), tq, new THREE.Vector3(sc, sc, sc));
      crowns.setMatrixAt(i, tm); trunks.setMatrixAt(i, tm);
    });
    for (const m of [crowns, trunks]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f4426, roughness: 0.95 });
    for (const [x0, x1, z] of [[G.x0 - 1, G.x1 + 1, G.z1 + 1.2], [-7, 3, 13.5]]) {
      const hedge = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, 1.1, 0.8, 3, 0.3), hedgeMat);
      hedge.position.set((x0 + x1) / 2, 0.55, z);
      hedge.castShadow = true; hedge.receiveShadow = true;
      g.add(hedge);
    }
    // path lights in the garden
    for (let x = G.x0 + 1.5; x < G.x1; x += 5) {
      add(g, at(cyl(0.04, 0.04, 0.6, M.blackSteel, { seg: 8 }), x, 0, G.z0 - 0.4));
      add(g, at(cyl(0.05, 0.05, 0.08, new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc070, emissiveIntensity: 3 }), { seg: 10 }), x, 0.6, G.z0 - 0.4));
    }
  }

  markStatic(g);
  out.group = g;
  out.vault = vault;
  return out;
}

// ---------------------------------------------------------------- furniture

function sinkUnit(M, w, bowls, hand = false) {
  const g = new THREE.Group();
  const d = hand ? 0.4 : 0.7, h = hand ? 1.0 : 0.9;
  if (hand) {
    add(g, at(rbox(w, 0.3, d, M.steel, { r: 0.02 }), 0, h - 0.3, 0));
    add(g, at(rbox(w - 0.08, 0.02, d - 0.12, M.steelDark, { r: 0.01 }), 0, h - 0.02, 0.02));
    add(g, rod([0, h, -d / 2 + 0.06], [0, h + 0.25, -d / 2 + 0.06], 0.012, M.chrome));
    add(g, rod([0, h + 0.25, -d / 2 + 0.06], [0, h + 0.2, -d / 2 + 0.16], 0.01, M.chrome));
    add(g, at(rbox(0.1, 0.18, 0.08, M.plasticWhite, { r: 0.015 }), -0.12, h + 0.3, -d / 2 + 0.04));
    add(g, at(rbox(0.28, 0.35, 0.1, M.plasticWhite, { r: 0.02 }), 0, h + 0.55, -d / 2 + 0.05));
    return g;
  }
  legs(g, w, d, h - 0.3, M, { shelf: false });
  add(g, at(rbox(w, 0.3, d, M.steel, { r: 0.01 }), 0, h - 0.3, 0));
  const bw = (w - 0.1) / bowls;
  for (let i = 0; i < bowls; i++) {
    const x = -w / 2 + 0.05 + bw * (i + 0.5);
    add(g, at(rbox(bw - 0.04, 0.02, d - 0.14, M.steelDark, { r: 0.01 }), x, h - 0.02, 0.02));
    add(g, rod([x, h, -d / 2 + 0.06], [x, h + 0.4, -d / 2 + 0.06], 0.014, M.chrome));
    add(g, rod([x, h + 0.4, -d / 2 + 0.06], [x, h + 0.36, -d / 2 + 0.26], 0.012, M.chrome));
  }
  add(g, at(rbox(w, 0.25, 0.02, M.steel, { r: 0.004 }), 0, h, -d / 2 + 0.01));
  add(g, rod([w / 2 - 0.15, h, -d / 2 + 0.06], [w / 2 - 0.15, h + 0.9, -d / 2 + 0.06], 0.012, M.chrome));
  return g;
}

function shelving(M, len, depth) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9c0c4, metalness: 0.9, roughness: 0.3 });
  const levels = [0.15, 0.6, 1.05, 1.5, 1.95];
  for (const y of levels) add(g, at(rbox(len, 0.025, depth, mat, { r: 0.004 }), 0, y, 0));
  for (const [x, z] of [[-len / 2, -depth / 2], [len / 2, -depth / 2], [-len / 2, depth / 2], [len / 2, depth / 2]]) {
    add(g, at(cyl(0.013, 0.013, 2.0, mat, { seg: 8 }), x, 0, z));
  }
  g.userData.levels = levels.map((y) => y + 0.025);
  return g;
}

function speedRack(M) {
  const g = new THREE.Group();
  const w = 0.55, d = 0.7, h = 1.75;
  const mat = new THREE.MeshStandardMaterial({ color: 0xc6c9cb, metalness: 0.9, roughness: 0.35 });
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    add(g, at(rbox(0.025, h - 0.1, 0.025, mat, { r: 0.003 }), x, 0.1, z));
    add(g, at(cyl(0.04, 0.04, 0.03, M.rubber, { seg: 12 }), x, 0.03, z));
  }
  add(g, at(rbox(w, 0.03, d, mat, { r: 0.003 }), 0, h - 0.03, 0));
  add(g, at(rbox(w, 0.03, d, mat, { r: 0.003 }), 0, 0.1, 0));
  for (let i = 0; i < 9; i++) {
    if (i % 3 === 2) continue;
    add(g, at(rbox(w - 0.04, 0.015, d - 0.02, M.steel, { r: 0.003 }), 0, 0.3 + i * 0.15, 0));
  }
  return g;
}
