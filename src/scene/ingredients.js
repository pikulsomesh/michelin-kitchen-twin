// Ingredient visuals: every raw material (RM-*) and intermediate (INT-*)
// from /data gets a container in its storage location: small hotel pans on
// the glass reach-in shelves, crates and bottles in the dry store, wheels in
// the cheese humidor, oysters and lobsters on the live ice well, and held
// sauces in bains-marie on the suites. Each container shows a live level
// (0..1) that drains as the simulation consumes stock, like a buffer on a
// factory line.
import * as THREE from 'three';
import { rbox, cyl, lathe, hash01 } from './kit.js';

// Name keywords -> [form, colour]. First match wins.
const NAME_RULES = [
  [/kaluga|caviar|roe/i, 'pearls', 0x1d1c1a], [/oyster/i, 'shells', 0x9c9a92], [/lobster/i, 'lobster', 0xd2452a],
  [/tapioca base|sabayon|custard/i, 'liquid', 0xf2e2b0],
  [/stock|jus|sauce|cream|crème|creme|milk|oil|vinaigrette|monté|monte|consomm|broth|purée|puree|yogurt|batter|coulis|emulsion|syrup|honey|glucose|extract|vinegar|wine|madeira|rum|vermouth|jurançon|jurancon|relish/i, 'liquid', 0xe9d9b0],
  [/flour|sugar|salt|powder|cocoa|curry|cinnamon|pepper/i, 'powder', 0xf5f2ea],
  [/butter|foie|chocolate|torchon|panisse|dough|brioche|pretzel/i, 'block', 0xf3d98a],
  [/egg/i, 'eggs', 0xe9d6bb], [/gruy|comt|cheese/i, 'wheel', 0xe8c56a],
  [/chive|carrot|bean|asparagus|vanilla|leek|celery|endive/i, 'sticks', 0x4f9a33],
  [/thyme|tarragon|mint|herb|green|lettuce|basil|parsley|sorrel|leaf|watercress|arugula|spinach/i, 'leaves', 0x5c8f3a],
  [/pea|berry|berries|grape|radish|pearl|cherr|olive|nut|pistachio|walnut|macadamia|raisin|sesame|oat|granola|dragée|dragee|tomato/i, 'pearls', 0x6dbb3c],
  [/truffle|morel|mushroom|chanterelle|cèpe|cepe|porcini/i, 'nuggets', 0x4a3a2a],
  [/shallot|onion|tartare|brunoise|dice|cipollini|garlic|corn|fava|piperade|confit/i, 'dice', 0xdcc3c9],
  [/cornet|shell/i, 'cones', 0xd9a25a], [/gougère|gougere|doughnut|bonbon|semifreddo|sherbet/i, 'puffs', 0xd99a3c],
  [/salmon|trout/i, 'pieces', 0xf08a5d], [/yellowtail|hamachi/i, 'pieces', 0xf3d6c8],
  [/beef|wagyu|calotte|lamb|veal|squab|duck|pork|venison|marrow|tongue|bones/i, 'pieces', 0xa33f48],
  [/fish|halibut|bass|sole|turbot|cod/i, 'pieces', 0xf1ece2], [/potato/i, 'pieces', 0xd8b878],
  [/apricot|apple|lemon|pepper/i, 'pearls', 0xe8a040], [/veg|garden/i, 'pieces', 0x8fbf5a],
];

// Colours for well-known items, to keep the shelves true to life.
const COLOR_HINTS = [
  [/kaluga|caviar/i, 0x1d1c1a], [/sturgeon/i, 0x2a2824], [/salmon/i, 0xf08a5d], [/lobster/i, 0xd2452a], [/yellowtail/i, 0xf3d6c8],
  [/foie/i, 0xe8c9a0], [/duck breast/i, 0x8a2f35], [/wagyu|calotte|beef/i, 0xb4475a], [/tongue/i, 0x9a5a5a], [/bone/i, 0xd9c7a6],
  [/marrow/i, 0xe8d2b8], [/cream|milk|yogurt|crème fraîche|creme fraiche/i, 0xfbf8f0], [/butter/i, 0xf6dd7c], [/egg/i, 0xe9d6bb],
  [/gruy|comt/i, 0xe8c56a], [/chive|tarragon|mint|thyme|watercress|arugula|spinach/i, 0x3f8a2c], [/carrot/i, 0xf07a22],
  [/pea|fava/i, 0x6dbb3c], [/radish/i, 0xd0405f], [/corn/i, 0xf2d76a], [/tomato/i, 0xd8392b], [/endive|celery/i, 0xd8e6b0],
  [/apricot/i, 0xf0a640], [/cherr/i, 0x7a0f1e], [/truffle/i, 0x2a211c], [/morel|cèpe|cepe/i, 0x6b5236],
  [/potato|panisse|chickpea/i, 0xe0c890], [/onion|shallot|cipollini|garlic/i, 0xe9d6dc], [/red onion/i, 0x9a3a6a],
  [/pepper.*red|piperade/i, 0xc8302a], [/apple/i, 0x9ccc54], [/lemon/i, 0xf3dd4a], [/olive/i, 0x5a6a2a],
  [/chocolate|cocoa/i, 0x3a2116], [/sugar|flour|salt|tapioca/i, 0xf7f4ec], [/honey|glucose/i, 0xe7b545],
  [/oil/i, 0xd9c25a], [/wine|madeira|rum|vermouth|vinegar|jurancon|jurançon/i, 0x5a1a22], [/vanilla/i, 0x2c1a12],
  [/pistachio/i, 0x8fb05a], [/walnut|macadamia|oat|granola|raisin/i, 0xb08a5a], [/sesame|pepper/i, 0x1d1c1a],
  [/curry/i, 0xd9a52a], [/cinnamon/i, 0xa0602a], [/espresso/i, 0x2a1810], [/brioche|pretzel|cornet|doughnut|gougère|gougere/i, 0xc98a4a],
  [/stock|jus|bordelaise|perigourdine/i, 0x6a3a1c], [/beurre|sabayon|tapioca base/i, 0xf3e3a6], [/sherbet|semifreddo/i, 0xf3ead6],
];

export function inferVisual(def) {
  const text = `${def.name || ''} ${def.id}`;
  let form = def.form, color = def.color;
  if (!form) for (const [re, f, c] of NAME_RULES) if (re.test(text)) { form = f; color ??= c; break; }
  if (color == null) for (const [re, c] of COLOR_HINTS) if (re.test(text)) { color = c; break; }
  for (const [re, c] of COLOR_HINTS) if (color == null && re.test(text)) color = c;
  if (!form) form = def.category === 'herb' ? 'leaves' : def.category === 'dry' ? 'powder' : 'dice';
  if (color == null) color = new THREE.Color().setHSL(hash01(def.id), 0.45, 0.55).getHex();
  // Liquids in the dry store are bottles, not open pans.
  if (form === 'liquid' && def.storage === 'SL-DRY') form = 'bottles';
  return { ...def, form, color };
}

// ------------------------------------------------------------- containers
const PAN = { w: 0.108, d: 0.176, h: 0.065 };   // 1/9 hotel pan, 65 mm deep
const BAIN = { r: 0.07, h: 0.15 };
const CRATE = { w: 0.3, d: 0.4, h: 0.16 };      // lexan ingredient bin

function hotelPan(M, w, d, h) {
  // Open-top box built from five thin slabs.
  const g = new THREE.Group();
  const t = 0.003;
  const wall = (ww, hh, dd, x, y, z) => { const m = rbox(ww, hh, dd, M.polished, { r: 0.001, seg: 1 }); m.position.set(x, y, z); g.add(m); };
  wall(w - 0.012, t, d - 0.012, 0, 0, 0);
  wall(w, h, t, 0, 0, -d / 2 + t / 2); wall(w, h, t, 0, 0, d / 2 - t / 2);
  wall(t, h, d, -w / 2 + t / 2, 0, 0); wall(t, h, d, w / 2 - t / 2, 0, 0);
  return g;
}

function bainMarie(M) {
  return lathe([[0, 0], [BAIN.r - 0.004, 0], [BAIN.r, 0.004], [BAIN.r, BAIN.h], [BAIN.r + 0.006, BAIN.h + 0.003], [BAIN.r - 0.002, BAIN.h + 0.003], [BAIN.r - 0.003, 0.006], [0, 0.003]], M.polished, 28);
}

function lexanCrate(M) {
  const g = new THREE.Group();
  const mat = M.polyCarbonate;
  const t = 0.004, { w, d, h } = CRATE;
  const slab = (ww, hh, dd, x, y, z) => { const m = rbox(ww, hh, dd, mat, { r: 0.002, seg: 1, shadow: false }); m.position.set(x, y, z); g.add(m); };
  slab(w, t, d, 0, 0, 0);
  slab(w, h, t, 0, 0, -d / 2); slab(w, h, t, 0, 0, d / 2);
  slab(t, h, d, -w / 2, 0, 0); slab(t, h, d, w / 2, 0, 0);
  return g;
}

function caviarTin(M) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.06, 0.035, M.polished, { seg: 32 }));
  const lid = cyl(0.062, 0.062, 0.006, new THREE.MeshStandardMaterial({ color: 0x2b6aa8, metalness: 0.8, roughness: 0.3 }), { seg: 32 });
  lid.position.set(0.08, 0, 0.02);
  g.add(lid);
  return g;
}

// ------------------------------------------------------------- contents

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

function scatter(geo, mat, n, w, d, h, { seed = 1, scaleJitter = 0.3, flat = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const items = [];
  for (let i = 0; i < n; i++) {
    const y = h * Math.pow(i / n, 0.9) + r() * 0.01;
    items.push({ x: (r() - 0.5) * w, y, z: (r() - 0.5) * d, rx: flat ? (r() - 0.5) * 0.4 : r() * 6.28, ry: r() * 6.28, rz: flat ? (r() - 0.5) * 0.4 : r() * 6.28, sc: 1 + (r() - 0.5) * scaleJitter });
  }
  items.sort((a, b) => a.y - b.y);
  items.forEach((it, i) => {
    tmpE.set(it.rx, it.ry, it.rz);
    tmpQ.setFromEuler(tmpE);
    tmpS.setScalar(it.sc);
    tmpP.set(it.x, it.y, it.z);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, max: n };
}

// Returns { object, setLevel(f) } for the edible part of a container.
function contents(def, M, w, d, h, round = false) {
  const color = new THREE.Color(def.color);
  const seed = Math.floor(hash01(def.id) * 1000);
  const mat = M.food(color, { roughness: 0.5 });
  let obj, setLevel;
  const bank = (geo, n, opts) => {
    const { mesh, max } = scatter(geo, mat, n, w * 0.8, d * 0.8, h * 0.85, { seed, ...opts });
    obj = mesh;
    setLevel = (f) => { mesh.count = Math.max(0, Math.round(max * f)); mesh.visible = mesh.count > 0; };
  };
  switch (def.form) {
    case 'liquid': {
      const surf = new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.2 });
      const geo = round ? new THREE.CylinderGeometry(w / 2 - 0.003, w / 2 - 0.004, 1, 28) : new THREE.BoxGeometry(w - 0.008, 1, d - 0.008);
      geo.translate(0, 0.5, 0);
      obj = new THREE.Mesh(geo, surf);
      obj.receiveShadow = true;
      setLevel = (f) => { obj.scale.y = Math.max(0.001, f * h * 0.92); obj.visible = f > 0.01; };
      break;
    }
    case 'powder': {
      const geo = new THREE.BoxGeometry(w - 0.008, 1, d - 0.008, 6, 1, 6);
      geo.translate(0, 0.5, 0);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9) p.setY(i, 1 + Math.sin(p.getX(i) * 40 + seed) * 0.04 * Math.cos(p.getZ(i) * 30));
      geo.computeVertexNormals();
      obj = new THREE.Mesh(geo, M.food(color, { roughness: 0.95 }));
      obj.receiveShadow = true;
      setLevel = (f) => { obj.scale.y = Math.max(0.001, f * h * 0.9); obj.visible = f > 0.01; };
      break;
    }
    case 'block': {
      const n = 4;
      const grp = new THREE.Group();
      const blocks = [];
      for (let i = 0; i < n; i++) {
        const b = rbox(w * 0.38, h * 0.38, d * 0.42, mat, { r: 0.006 });
        b.position.set((i % 2 - 0.5) * w * 0.42, Math.floor(i / 2) * h * 0.4, 0);
        grp.add(b); blocks.push(b);
      }
      obj = grp;
      setLevel = (f) => blocks.forEach((b, i) => { b.visible = f > i / n; });
      break;
    }
    case 'pearls': bank(new THREE.SphereGeometry(def.id.includes('caviar') ? 0.0035 : 0.007, 8, 6), def.id.includes('caviar') ? 600 : 160, { scaleJitter: 0.2 }); if (def.id.includes('caviar')) mat.roughness = 0.08, mat.clearcoat = 1; break;
    case 'berries': bank(new THREE.ConeGeometry(0.014, 0.03, 10), 30, {}); break;
    case 'dice': bank(new THREE.BoxGeometry(0.008, 0.008, 0.008), 260, {}); break;
    case 'sticks': bank(new THREE.CylinderGeometry(0.003, 0.003, d * 0.85, 6), 70, { flat: true }); obj.geometry.rotateX(Math.PI / 2); break;
    case 'leaves': {
      const geo = new THREE.CircleGeometry(0.012, 7);
      mat.side = THREE.DoubleSide;
      bank(geo, 140, {});
      break;
    }
    case 'nuggets': bank(new THREE.IcosahedronGeometry(0.016, 0), 22, {}); mat.roughness = 0.9; break;
    case 'eggs': {
      const geo = new THREE.SphereGeometry(0.022, 14, 10);
      geo.scale(1, 1.3, 1);
      bank(geo, 18, { scaleJitter: 0.1 });
      break;
    }
    case 'bottles': {
      const geo = lathe([[0, 0], [0.032, 0], [0.033, 0.2], [0.012, 0.26], [0.011, 0.3], [0, 0.3]], mat, 14).geometry;
      mat.roughness = 0.1; mat.clearcoat = 1;
      const n = Math.max(1, Math.floor(w / 0.075)) * Math.max(1, Math.floor(d / 0.075));
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4();
      const cols = Math.max(1, Math.floor(w / 0.075));
      for (let i = 0; i < n; i++) { m4.makeTranslation(-w / 2 + 0.04 + (i % cols) * 0.075, 0, -d / 2 + 0.04 + Math.floor(i / cols) * 0.075); mesh.setMatrixAt(i, m4); }
      mesh.castShadow = true;
      obj = mesh;
      setLevel = (f) => { mesh.count = Math.max(0, Math.round(n * f)); mesh.visible = mesh.count > 0; };
      break;
    }
    case 'wheel': {
      const grp = new THREE.Group();
      const wheels = [];
      for (let i = 0; i < 3; i++) {
        const wh = cyl(0.17, 0.17, 0.09, mat, { seg: 32 });
        wh.position.y = i * 0.095;
        const rind = cyl(0.172, 0.172, 0.085, M.food(0xb8873a, { roughness: 0.9 }), { seg: 32, open: true });
        rind.position.y = i * 0.095 + 0.002;
        grp.add(wh, rind);
        wheels.push(wh, rind);
      }
      obj = grp;
      setLevel = (f) => wheels.forEach((m, i) => { m.visible = f > Math.floor(i / 2) / 3; });
      break;
    }
    case 'lobster': {
      const geo = new THREE.CapsuleGeometry(0.03, 0.14, 4, 10).rotateZ(Math.PI / 2);
      geo.scale(1, 0.7, 1);
      mat.roughness = 0.35; mat.clearcoat = 0.6;
      bank(geo, 8, { scaleJitter: 0.15, flat: true });
      break;
    }
    case 'puffs': bank(new THREE.SphereGeometry(0.018, 12, 8), 20, {}); mat.roughness = 0.8; break;
    case 'cones': {
      const geo = new THREE.ConeGeometry(0.012, 0.06, 12);
      bank(geo, 24, {});
      break;
    }
    case 'shells': {
      const geo = new THREE.SphereGeometry(0.035, 10, 6);
      geo.scale(1, 0.35, 0.7);
      mat.roughness = 0.85;
      bank(geo, 14, { scaleJitter: 0.3, flat: true });
      break;
    }
    case 'pieces':
    default: {
      const geo = new THREE.CapsuleGeometry(0.018, 0.05, 4, 10);
      geo.rotateZ(Math.PI / 2);
      geo.scale(1, 0.6, 1);
      bank(geo, 10, { scaleJitter: 0.25, flat: true });
      mat.roughness = 0.4;
      mat.clearcoat = 0.4;
    }
  }
  setLevel(1);
  obj.userData.dynamic = true;   // never baked into static geometry
  return { object: obj, setLevel };
}

// A mise-en-place container (hotel pan or bain-marie) holding one ingredient.
// Which container an ingredient lives in, given its storage and form.
function containerKind(v) {
  if (v.storage === 'SL-HUMIDOR' || v.form === 'wheel') return 'board';
  if (v.storage === 'SL-LIVE-TANK') return 'loose';
  if (v.storage === 'SL-DRY') return 'crate';
  if (v.storage === 'SL-AGING') return 'hanging';
  if (!v.storage) return 'bain';
  if (/caviar/i.test(v.name || '')) return 'tin';
  return 'pan';
}

// Builds the container and contents for one ingredient.
// Returns { group, setLevel, def, kind }.
export function buildContainer(def, M) {
  const v = inferVisual(def);
  const kind = containerKind(v);
  const g = new THREE.Group();
  let c;
  switch (kind) {
    case 'tin':
      g.add(caviarTin(M));
      c = contents({ ...v, form: 'pearls' }, M, 0.11, 0.11, 0.03, true);
      break;
    case 'bain':
      g.add(bainMarie(M));
      c = contents({ ...v, form: 'liquid' }, M, BAIN.r * 2, BAIN.r * 2, BAIN.h, true);
      break;
    case 'crate':
      g.add(lexanCrate(M));
      c = contents(v, M, CRATE.w, CRATE.d, CRATE.h);
      break;
    case 'board': {
      g.add(rbox(0.4, 0.02, 0.4, M.wood, { r: 0.004 }));
      c = contents({ ...v, form: 'wheel' }, M, 0.36, 0.36, 0.3);
      c.object.position.y = 0.02;
      break;
    }
    case 'loose':
      c = contents(v, M, 0.42, 0.42, 0.06);
      break;
    case 'hanging': {
      // dry-aged primal on a hook
      const meat = M.food(v.color ?? 0x8a2a2a, { roughness: 0.7 });
      const fat = M.food(0xeee0c8, { roughness: 0.6 });
      const pieces = [];
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 12), meat);
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.28, 4, 12, 1), fat);
        cap.scale.set(1.02, 1, 0.5);
        cap.position.z = 0.03;
        p.add(body, cap);
        p.add(at3(rod3(M), 0, 0.26, 0));
        p.position.set(-0.2 + i * 0.2, -0.3, 0);
        g.add(p);
        pieces.push(p);
      }
      c = { object: new THREE.Group(), setLevel: (f) => pieces.forEach((p, i) => { p.visible = f > i / 3; }) };
      c.object.userData.dynamic = true;
      break;
    }
    default:
      g.add(hotelPan(M, PAN.w, PAN.d, PAN.h));
      c = contents(v, M, PAN.w, PAN.d, PAN.h);
  }
  if (kind !== 'board' && kind !== 'loose') c.object.position.y = 0.004;
  g.add(c.object);
  g.userData.ingredient = def.id;
  g.userData.dynamic = kind === 'hanging';
  return { group: g, setLevel: c.setLevel, def: v, kind };
}

function rod3(M) { return new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 12, Math.PI * 1.3), M.polished); }
function at3(o, x, y, z) { o.position.set(x, y, z); return o; }

export const SIZES = { PAN, BAIN, CRATE };
