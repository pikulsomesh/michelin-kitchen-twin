// Site skeleton: draws the kitchen floor plan from data/layout.json and shows the production plan for N covers.
// Step 2 replaces the block models with detailed, physically based equipment; step 3 adds the live service simulation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { data } from './data.js';
import { buildIndex } from './model/mrp.js';
import { renderPanel, showEquipment } from './panel.js';

const index = buildIndex(data);
const { layout } = data;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const labels = new CSS2DRenderer();
labels.domElement.style.position = 'absolute';
labels.domElement.style.inset = '0';
labels.domElement.style.pointerEvents = 'none';
document.getElementById('app').appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f11);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const { width: KW, depth: KD } = layout.kitchen.footprint;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(KW / 2 + 2, 19, KD + 13);
const controls = new OrbitControls(camera, canvas);
controls.target.set(KW / 2 + 3.5, 0, KD / 2 - 3);
controls.maxPolarAngle = Math.PI * 0.47;
controls.enableDamping = true;

const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
sun.position.set(KW / 2 + 6, 18, KD + 8);
sun.target.position.set(KW / 2, 0, KD / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x2a2622, 0.5));

// ---------- Building shell ----------
const terrazzo = new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.35, metalness: 0 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.6 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe3e6, roughness: 0.15, transmission: 0.6, transparent: true, opacity: 0.35 });
const WALL_H = layout.kitchen.ceiling.springHeight;
const WALL_T = 0.15;

function slab(x, z, w, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mat);
  m.position.set(x + w / 2, -0.05, z + d / 2);
  m.receiveShadow = true;
  scene.add(m);
}
slab(0, 0, KW, KD, terrazzo);
const annex = layout.annex.footprint;
slab(annex.x, annex.z, annex.width, annex.depth, terrazzo);

// A wall is a run along one side; openings cut it into solid segments, with sill and head pieces for windows.
function wall(side) {
  const horizontal = side === 'south' || side === 'north';
  const length = horizontal ? KW : KD;
  const openings = layout.kitchen.openings
    .filter((o) => o.wall === side)
    .map((o) => (o.from != null ? { ...o, a: o.from, b: o.to } : { ...o, a: o.at - o.width / 2, b: o.at + o.width / 2 }))
    .sort((p, q) => p.a - q.a);
  const piece = (a, b, y0, y1, mat = wallMat) => {
    if (b - a <= 0.01 || y1 - y0 <= 0.01) return;
    const len = b - a;
    const geo = horizontal ? new THREE.BoxGeometry(len, y1 - y0, WALL_T) : new THREE.BoxGeometry(WALL_T, y1 - y0, len);
    const m = new THREE.Mesh(geo, mat);
    const mid = a + len / 2;
    const fixed = { south: -WALL_T / 2, north: KD + WALL_T / 2, west: -WALL_T / 2, east: KW + WALL_T / 2 }[side];
    m.position.set(horizontal ? mid : fixed, (y0 + y1) / 2, horizontal ? fixed : mid);
    m.castShadow = m.receiveShadow = mat === wallMat;
    scene.add(m);
  };
  let cursor = 0;
  for (const o of openings) {
    piece(cursor, o.a, 0, WALL_H);
    if (o.sill != null) {
      piece(o.a, o.b, 0, o.sill);
      piece(o.a, o.b, o.sill, o.head, glassMat);
      piece(o.a, o.b, o.head, WALL_H);
    } else piece(o.a, o.b, o.height, WALL_H);
    cursor = o.b;
  }
  piece(cursor, length, 0, WALL_H);
}
['south', 'north', 'west', 'east'].forEach(wall);

// ---------- Work-center zones ----------
const zoneColors = { 'WC-PASS': 0xd6b46a, 'WC-FISH': 0x5b8fb9, 'WC-MEAT': 0xb9604a, 'WC-GARNISH': 0x7fa36b, 'WC-STOCK': 0x9a7b5b, 'WC-GM': 0x8fb3a8, 'WC-PASTRY': 0xc7a0b8, 'WC-DISH': 0x7d8288, 'WC-ANNEX-BUTCHERY': 0xb9604a, 'WC-ANNEX-PREP': 0x7fa36b };
function label(text, x, y, z, cls = '') {
  const div = document.createElement('div');
  div.className = `label ${cls}`;
  div.textContent = text;
  const obj = new CSS2DObject(div);
  obj.position.set(x, y, z);
  scene.add(obj);
}
for (const z of [...layout.zones, ...layout.annex.zones]) {
  const color = zoneColors[z.id] ?? 0x555555;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(z.width, z.depth),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(z.x + z.width / 2, 0.005, z.z + z.depth / 2);
  scene.add(m);
  const name = index.workCenters.get(z.id)?.name ?? z.id.replace(/-/g, ' ');
  label(name, z.x + z.width / 2, 0.05, z.z + z.depth / 2, 'zone');
}

// ---------- Equipment (block models for now) ----------
const typeColor = {
  'cooking-suite': 0x2b2d31, range: 0x34363a, grill: 0x3a2a22, 'deck-oven': 0x6b5a4a, rotisserie: 0x3d3f43,
  'combi-oven': 0x8e9399, 'reach-in': 0xc7cacd, freezer: 0xb8c4cc, 'aging-cooler': 0xbfc3c6, humidor: 0x7a5b3f,
  pass: 0xd0d3d6, warmer: 0xe8c27a, dishwasher: 0xaab0b5,
};
const steel = (type) => new THREE.MeshStandardMaterial({ color: typeColor[type] ?? 0xb4b8bc, metalness: 0.85, roughness: 0.32 });
const pickables = [];
for (const pl of layout.placements) {
  if (pl.embeddedIn) continue;
  const eq = index.equipment.get(pl.equipment);
  const [w, d, h] = eq.dimsM;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel(eq.type));
  mesh.position.set(pl.x, (pl.y ?? 0) + h / 2, pl.z);
  mesh.rotation.y = THREE.MathUtils.degToRad(pl.rotY ?? 0);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.equipment = eq.id;
  scene.add(mesh);
  pickables.push(mesh);
}
for (const b of layout.benches) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.width, b.height, b.depth), steel('bench'));
  mesh.position.set(b.x, b.height / 2, b.z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}
label('Dining room', -1.6, 0.1, 5.4, 'zone');
label('Garden', KW / 2 + 2, 0.1, KD + 2.2, 'zone');
label('Annex', annex.x + annex.width / 2, 0.1, annex.z + annex.depth - 1.2, 'zone');

// ---------- Picking ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selected = null;
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables)[0]?.object;
  if (selected) selected.material.emissive.setHex(0x000000);
  selected = hit ?? null;
  if (selected) selected.material.emissive.setHex(0x3a2e10);
  showEquipment(index, selected?.userData.equipment ?? null);
});

// ---------- Loop ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

renderPanel(index, document.getElementById('panel'));
