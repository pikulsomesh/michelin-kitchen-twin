// Physically based materials with procedurally generated texture maps.
// Everything is generated at runtime from canvases, so the scene ships with
// no binary assets and loads instantly on GitHub Pages.
import * as THREE from 'three';

const TEX_CACHE = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Seeded PRNG so textures look identical on every load.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Converts a grayscale height canvas into a tangent-space normal map.
function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  // Same maths as sampling with wrapped (x, y), with the wrap and the /255
  // hoisted out of the per-pixel loop: this runs on ~3M pixels at startup.
  const H = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = sd[i * 4] / 255;
  const out8 = img.data;
  for (let y = 0; y < h; y++) {
    const row = y * w, up = ((y + 1) % h) * w, down = ((y - 1 + h) % h) * w;
    for (let x = 0; x < w; x++) {
      const xr = x + 1 === w ? 0 : x + 1, xl = x === 0 ? w - 1 : x - 1;
      const dx = (H[row + xr] - H[row + xl]) * strength;
      const dy = (H[up + x] - H[down + x]) * strength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 4;
      out8[i] = (-dx * nz * 0.5 + 0.5) * 255;
      out8[i + 1] = (dy * nz * 0.5 + 0.5) * 255;
      out8[i + 2] = nz * 255;
      out8[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, { srgb = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cached(key, fn) {
  if (!TEX_CACHE.has(key)) TEX_CACHE.set(key, fn());
  return TEX_CACHE.get(key);
}

// ---------------------------------------------------------------- textures

// Brushed stainless: fine directional streaks drive roughness and a faint normal.
function brushedMaps() {
  return cached('brushed', () => {
    const size = 512, r = rng(7);
    const c = makeCanvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      const y = r() * size, x = r() * size, len = 40 + r() * 260;
      const v = 100 + r() * 70;
      ctx.strokeStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.25})`;
      ctx.lineWidth = 0.5 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (r() - 0.5) * 1.5);
      ctx.stroke();
      if (x + len > size) { ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + len - size, y); ctx.stroke(); }
    }
    // Faint smudges and fingerprints so the steel looks used, not CG-perfect.
    for (let i = 0; i < 40; i++) {
      const x = r() * size, y = r() * size, rad = 10 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(170,170,170,0.18)');
      g.addColorStop(1, 'rgba(170,170,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return { rough: tex(c), normal: tex(heightToNormal(c, 0.6)) };
  });
}

// Polished terrazzo: marble chips of mixed size and colour set in a warm
// grey cement matrix, with control joints every 1.2 m.
function floorMaps() {
  return cached('floor', () => {
    const size = 1024, r = rng(11);
    const col = makeCanvas(size), cctx = col.getContext('2d');
    const hgt = makeCanvas(size), hctx = hgt.getContext('2d');
    const rough = makeCanvas(size), rctx = rough.getContext('2d');
    cctx.fillStyle = '#cfc9be'; cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
    rctx.fillStyle = '#4a4a4a'; rctx.fillRect(0, 0, size, size);
    // matrix mottling
    for (let k = 0; k < 900; k++) {
      const x = r() * size, y = r() * size, pr = 8 + r() * 40;
      const g = cctx.createRadialGradient(x, y, 0, x, y, pr);
      const v = r() > 0.5 ? '255,250,240' : '150,140,128';
      g.addColorStop(0, `rgba(${v},0.08)`); g.addColorStop(1, `rgba(${v},0)`);
      cctx.fillStyle = g; cctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    }
    const chips = ['#f4f1ea', '#e9e3d6', '#8d8780', '#5b5752', '#b9a58c', '#d8cbb6', '#2f2d2b', '#a8b0b0'];
    for (let k = 0; k < 14000; k++) {
      const x = r() * size, y = r() * size;
      const big = r() < 0.06;
      const s = big ? 4 + r() * 7 : 0.8 + r() * 2.6;
      cctx.fillStyle = chips[Math.floor(r() * chips.length)];
      cctx.beginPath();
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5;
        const rr = s * (0.6 + r() * 0.5);
        i ? cctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : cctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      cctx.fill();
    }
    // brass control joints on the tile edges
    cctx.fillStyle = '#a88b55'; cctx.fillRect(0, 0, size, 3); cctx.fillRect(0, 0, 3, size);
    hctx.fillStyle = '#606060'; hctx.fillRect(0, 0, size, 3); hctx.fillRect(0, 0, 3, size);
    // scuffs and wet spots vary the polish
    for (let k = 0; k < 80; k++) {
      const x = r() * size, y = r() * size, pr = 20 + r() * 120;
      const g = rctx.createRadialGradient(x, y, 0, x, y, pr);
      const v = r() > 0.6 ? 20 : 120;
      g.addColorStop(0, `rgba(${v},${v},${v},0.35)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      rctx.fillStyle = g; rctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    }
    return { map: tex(col, { srgb: true }), normal: tex(heightToNormal(hgt, 1.5)), rough: tex(rough) };
  });
}

// White subway tile (75 x 150 mm) in running bond.
function subwayMaps() {
  return cached('subway', () => {
    const size = 1024, r = rng(23);
    const cols = 4, rows = 8, tw = size / cols, th = size / rows, g = 5;
    const col = makeCanvas(size), cctx = col.getContext('2d');
    const hgt = makeCanvas(size), hctx = hgt.getContext('2d');
    cctx.fillStyle = '#b9b5ad'; cctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * tw / 2;
      for (let x = -1; x < cols; x++) {
        const px = x * tw + off + g / 2, py = y * th + g / 2;
        const v = 236 + Math.floor(r() * 12);
        cctx.fillStyle = `rgb(${v},${v},${v - 3})`;
        cctx.fillRect(px, py, tw - g, th - g);
        // bevelled edge in height
        const grd = hctx.createLinearGradient(0, py, 0, py + th - g);
        grd.addColorStop(0, '#888'); grd.addColorStop(0.08, '#fff');
        grd.addColorStop(0.92, '#fff'); grd.addColorStop(1, '#888');
        hctx.fillStyle = grd; hctx.fillRect(px, py, tw - g, th - g);
      }
    }
    return { map: tex(col, { srgb: true }), normal: tex(heightToNormal(hgt, 2.5)) };
  });
}

// Edge-grain maple butcher block.
function woodMaps() {
  return cached('wood', () => {
    const size = 512, r = rng(5);
    const c = makeCanvas(size), ctx = c.getContext('2d');
    const strips = 12, sw = size / strips;
    for (let i = 0; i < strips; i++) {
      const base = 0.85 + r() * 0.25;
      ctx.fillStyle = `rgb(${Math.floor(214 * base)},${Math.floor(170 * base)},${Math.floor(118 * base)})`;
      ctx.fillRect(i * sw, 0, sw, size);
      for (let k = 0; k < 40; k++) {
        const x = i * sw + r() * sw;
        ctx.strokeStyle = `rgba(120,80,40,${0.05 + r() * 0.12})`;
        ctx.lineWidth = 0.5 + r();
        ctx.beginPath(); ctx.moveTo(x, 0);
        for (let y = 0; y <= size; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + k) * 1.5, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,40,20,0.35)'; ctx.fillRect(i * sw, 0, 1, size);
    }
    // knife marks
    for (let k = 0; k < 300; k++) {
      const x = r() * size, y = r() * size, a = r() * Math.PI;
      ctx.strokeStyle = 'rgba(90,60,30,0.15)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.stroke();
    }
    return { map: tex(c, { srgb: true }) };
  });
}

// Carrara-style marble for the pastry bench.
function marbleMaps() {
  return cached('marble', () => {
    const size = 1024, r = rng(31);
    const c = makeCanvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#eeece8'; ctx.fillRect(0, 0, size, size);
    for (let k = 0; k < 600; k++) {
      const x = r() * size, y = r() * size, pr = 20 + r() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, 'rgba(210,208,204,0.15)'); g.addColorStop(1, 'rgba(210,208,204,0)');
      ctx.fillStyle = g; ctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    }
    for (let v = 0; v < 14; v++) {
      let x = r() * size, y = r() * size, a = r() * Math.PI * 2;
      ctx.strokeStyle = `rgba(110,110,115,${0.15 + r() * 0.35})`;
      ctx.lineWidth = 0.6 + r() * 2.2;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 120; s++) {
        a += (r() - 0.5) * 0.6; x += Math.cos(a) * 9; y += Math.sin(a) * 9;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return { map: tex(c, { srgb: true }) };
  });
}

// Ceramic frit pattern for the ribbon window: a fine dot screen that
// fades toward the top, as on the garden glazing.
function fritMap() {
  return cached('frit', () => {
    const size = 256;
    const c = makeCanvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#555'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    for (let y = 0; y < size; y += 8) for (let x = (y / 8) % 2 * 4; x < size; x += 8) {
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    const t = tex(c);
    t.repeat.set(20, 4);
    return t;
  });
}

// Houndstooth check for chef trousers.
function checkMap() {
  return cached('check', () => {
    const size = 64;
    const c = makeCanvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1a1a1a';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) ctx.fillRect(x * 8, y * 8, 8, 8);
    const t = tex(c, { srgb: true });
    t.repeat.set(6, 6);
    return t;
  });
}

// ---------------------------------------------------------------- materials

// Lawn: thousands of short blades in mixed greens over dark soil.
function grassMaps() {
  return cached('grass', () => {
    const N = 512, c = makeCanvas(N), x = c.getContext('2d'), r = rng(41);
    x.fillStyle = '#2c3b1d'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 26000; i++) {
      const px = r() * N, py = r() * N, len = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const g = 70 + r() * 70, rr = 35 + r() * 45 + (r() < 0.08 ? 50 : 0);
      x.strokeStyle = `rgb(${rr | 0},${g | 0},${(20 + r() * 25) | 0})`;
      x.lineWidth = 0.8 + r();
      x.beginPath();
      for (const dx of [0, N, -N]) for (const dy of [0, N, -N]) {
        x.moveTo(px + dx, py + dy); x.lineTo(px + dx + Math.cos(a) * len, py + dy + Math.sin(a) * len);
      }
      x.stroke();
    }
    const h = makeCanvas(N), hx = h.getContext('2d');
    hx.drawImage(c, 0, 0);
    const map = tex(c, { srgb: true });
    const normal = tex(heightToNormal(h, 3));
    return { map, normal };
  });
}

// Pea gravel: packed rounded stones.
function gravelMaps() {
  return cached('gravel', () => {
    const N = 512, c = makeCanvas(N), x = c.getContext('2d'), r = rng(77);
    x.fillStyle = '#5d564c'; x.fillRect(0, 0, N, N);
    const hc = makeCanvas(N), hx = hc.getContext('2d');
    hx.fillStyle = '#000'; hx.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) {
      const px = r() * N, py = r() * N, rad = 2 + r() * 4.5, v = 120 + r() * 90;
      x.fillStyle = `rgb(${v | 0},${(v * 0.95) | 0},${(v * 0.86) | 0})`;
      x.beginPath(); x.ellipse(px, py, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, Math.PI * 2); x.fill();
      const g = hx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
      hx.fillStyle = g; hx.beginPath(); hx.arc(px, py, rad, 0, Math.PI * 2); hx.fill();
    }
    return { map: tex(c, { srgb: true }), normal: tex(heightToNormal(hc, 4)) };
  });
}

export function createMaterials() {
  const b = brushedMaps();
  const f = floorMaps();
  const s = subwayMaps();

  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xc9ccce, metalness: 1, roughness: 0.32,
    roughnessMap: b.rough, normalMap: b.normal, normalScale: new THREE.Vector2(0.15, 0.15),
    anisotropy: 0.55, clearcoat: 0.08, clearcoatRoughness: 0.4,
  });
  const steelDark = steel.clone();
  steelDark.color.set(0x9a9da0);
  steelDark.roughness = 0.45;
  const polished = new THREE.MeshPhysicalMaterial({ color: 0xe3e5e7, metalness: 1, roughness: 0.12 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 });
  const castIron = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, metalness: 0.6, roughness: 0.75 });
  const blackSteel = new THREE.MeshStandardMaterial({ color: 0x232426, metalness: 0.7, roughness: 0.45 });
  const enamelNavy = new THREE.MeshPhysicalMaterial({ color: 0x14233d, metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a95a, metalness: 1, roughness: 0.25 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8764a, metalness: 1, roughness: 0.22 });
  const glassDark = new THREE.MeshPhysicalMaterial({ color: 0x111316, metalness: 0, roughness: 0.04, clearcoat: 1, reflectivity: 0.6 });
  // Glass-like materials use plain alpha rather than transmission: a single
  // transmissive material forces an extra full-scene render every frame.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8ea, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false,
  });
  const ceramicGlass = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const plasticBlack = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.4 });
  const plasticWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.35 });
  const polyCarbonate = new THREE.MeshPhysicalMaterial({
    color: 0xeaf2f5, roughness: 0.08, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false,
  });
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x9fc4d6, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1,
  });
  const oil = new THREE.MeshPhysicalMaterial({ color: 0xb3861f, roughness: 0.05, clearcoat: 1, metalness: 0.1 });
  const porcelain = new THREE.MeshPhysicalMaterial({
    color: 0xfbfaf6, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.06, sheen: 0.2,
  });
  const floor = new THREE.MeshPhysicalMaterial({
    map: f.map, normalMap: f.normal, roughnessMap: f.rough, roughness: 0.55, metalness: 0,
    normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 0.5, clearcoatRoughness: 0.12,
  });
  // White solid-surface wall cladding (Corian-like), as published for TFL.
  const solidSurface = new THREE.MeshPhysicalMaterial({ color: 0xf3f2ee, roughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const frit = new THREE.MeshPhysicalMaterial({
    color: 0xe8eef0, roughness: 0.05, transparent: true, opacity: 0.22, alphaMap: fritMap(),
    clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  const gm = grassMaps(), gv = gravelMaps();
  const grass = new THREE.MeshStandardMaterial({ map: gm.map, normalMap: gm.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92 });
  const gravel = new THREE.MeshStandardMaterial({ map: gv.map, normalMap: gv.normal, roughness: 0.9 });
  const redwood = new THREE.MeshStandardMaterial({ color: 0x7a4a33, roughness: 0.8 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 });
  const wallTile = new THREE.MeshPhysicalMaterial({
    map: s.map, normalMap: s.normal, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1,
  });
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.9 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.95, side: THREE.FrontSide });
  const wood = new THREE.MeshStandardMaterial({ map: woodMaps().map, roughness: 0.6 });
  const marble = new THREE.MeshPhysicalMaterial({ map: marbleMaps().map, roughness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.15 });
  const cuttingBoardWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 });
  const cuttingBoardGreen = new THREE.MeshStandardMaterial({ color: 0x3f8f4c, roughness: 0.7 });
  const cuttingBoardRed = new THREE.MeshStandardMaterial({ color: 0xb33a32, roughness: 0.7 });
  const cuttingBoardBlue = new THREE.MeshStandardMaterial({ color: 0x2f62a8, roughness: 0.7 });
  const cuttingBoardYellow = new THREE.MeshStandardMaterial({ color: 0xd9b23a, roughness: 0.7 });
  const insulatedPanel = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.5, metalness: 0.1 });
  const filterMesh = new THREE.MeshStandardMaterial({ color: 0x8b8e90, metalness: 0.9, roughness: 0.5 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.95 });
  const chefWhite = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f3, roughness: 0.85, sheen: 0.6, sheenColor: 0xffffff });
  const apron = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.92 });
  const apronBlue = new THREE.MeshStandardMaterial({ color: 0x2b3e5a, roughness: 0.9 });
  const trousers = new THREE.MeshStandardMaterial({ map: checkMap(), roughness: 0.9, color: 0x9a9a9a });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

  return {
    steel, steelDark, polished, chrome, castIron, blackSteel, enamelNavy, brass, copper,
    glassDark, glass, ceramicGlass, rubber, plasticBlack, plasticWhite, polyCarbonate, water, oil,
    porcelain, floor, solidSurface, frit, grass, gravel, redwood, soil, wallTile, paint, ceiling, wood, marble, insulatedPanel,
    filterMesh, linen, chefWhite, apron, apronBlue, trousers, shoes,
    cuttingBoardWhite, cuttingBoardGreen, cuttingBoardRed, cuttingBoardBlue, cuttingBoardYellow,
    // Factory helpers for colored food and emissive parts.
    food: (color, opts = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, ...opts }),
    emissive: (color, intensity = 2) => new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.5,
    }),
    skin: (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.3, sheenColor: 0xffd8c8 }),
  };
}

// Re-projects UVs so a texture tiles at a constant size in meters regardless
// of the mesh's dimensions (box-projection on the dominant normal axis).
export function worldUV(geometry, metersPerTile = 1) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  if (!uv || !nor) return geometry;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv.setXY(i, u / metersPerTile, v / metersPerTile);
  }
  uv.needsUpdate = true;
  return geometry;
}
