// OpenUSD (.usda) export of the kitchen, for NVIDIA Omniverse and Isaac Sim.
//
// The stage is laid out like a factory asset in Omniverse:
//   /TheFrenchLaundry            (Y-up, metres)
//     /Looks                     UsdPreviewSurface materials
//     /Building                  shell, benches, annex, garden
//     /Equipment/EQ_HEARTH ...   one Xform per machine, with twin:* metadata,
//                                render meshes and a simple box collider
//     /WorkCenters/WC_FISH ...   stations with cook positions
//     /Brigade/...               cooks at their current positions (capsules)
//     /PhysicsScene              so Isaac Sim can drop robots or people in
//
// Everything is generated in the browser; nothing is uploaded anywhere.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const f = (n) => (Math.abs(n) < 1e-6 ? '0' : (+n.toFixed(4)).toString());
const safe = (s) => {
  const n = String(s).replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(n) ? `_${n}` : n;
};
const str = (s) => JSON.stringify(String(s ?? ''));

class Writer {
  constructor() { this.out = []; this.depth = 0; }
  line(s = '') { this.out.push('    '.repeat(this.depth) + s); }
  open(s) { this.line(s); this.line('{'); this.depth++; }
  close() { this.depth--; this.line('}'); }
  toString() { return this.out.join('\n') + '\n'; }
}

function materialKey(m) {
  const c = m.color || new THREE.Color(1, 1, 1);
  const e = m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
  return [c.r, c.g, c.b, m.metalness ?? 0, m.roughness ?? 0.5, m.opacity ?? 1, e.r, e.g, e.b].map((v) => v.toFixed(3)).join(',');
}

// Collects meshes under root grouped by material, in root's local frame.
function collect(root, skipInstanced = true) {
  const byMat = new Map();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh || (skipInstanced && o.isInstancedMesh)) return;
    if (!o.visible || !o.material || Array.isArray(o.material) || o.material.visible === false) return;
    if (o.userData.pick) return;
    if (o.material.blending === THREE.AdditiveBlending) return;
    const m = o.material;
    const key = materialKey(m);
    let g = o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(key)) byMat.set(key, { mat: m, geos: [] });
    byMat.get(key).geos.push(g);
  });
  return byMat;
}

function writeMesh(w, name, geos, matPath) {
  const pts = [], nrm = [], idx = [];
  let base = 0;
  for (let g of geos) {
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pts.push(`(${f(p.getX(i))}, ${f(p.getY(i))}, ${f(p.getZ(i))})`);
      nrm.push(`(${f(n.getX(i))}, ${f(n.getY(i))}, ${f(n.getZ(i))})`);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  if (!idx.length) return;
  w.open(`def Mesh "${safe(name)}"`);
  w.line(`int[] faceVertexCounts = [${new Array(idx.length / 3).fill(3).join(', ')}]`);
  w.line(`int[] faceVertexIndices = [${idx.join(', ')}]`);
  w.line(`point3f[] points = [${pts.join(', ')}]`);
  w.line(`normal3f[] normals = [${nrm.join(', ')}] (`);
  w.line('    interpolation = "vertex"');
  w.line(')');
  w.line('uniform token subdivisionScheme = "none"');
  w.line(`rel material:binding = <${matPath}>`);
  w.close();
}

export function exportUSDA(source, { plan, cooks = [] } = {}) {
  const w = new Writer();
  const root = '/TheFrenchLaundry';
  w.line('#usda 1.0');
  w.line('(');
  w.line('    defaultPrim = "TheFrenchLaundry"');
  w.line('    metersPerUnit = 1');
  w.line('    upAxis = "Y"');
  w.line('    doc = "Michelin Kitchen Twin: The French Laundry kitchen and annex, exported from the browser twin. Ids match /data (EQ-*, WC-*)."');
  w.line(')');
  w.line();

  // Materials: one UsdPreviewSurface per distinct look.
  const looks = new Map();
  const lookFor = (m) => {
    const key = materialKey(m);
    if (!looks.has(key)) looks.set(key, { name: `M_${looks.size}`, m });
    return `${root}/Looks/${looks.get(key).name}`;
  };

  const building = [], equipment = [];
  for (const child of source.children) {
    if (child.userData.equipment) equipment.push(child);
    else building.push(child);
  }
  // Pre-collect so materials are known before writing /Looks.
  const buildingMeshes = building.map((b) => collect(b));
  const equipMeshes = equipment.map((e) => collect(e));
  for (const set of [...buildingMeshes, ...equipMeshes]) for (const { mat } of set.values()) lookFor(mat);

  w.open(`def Xform "TheFrenchLaundry" (\n    kind = "assembly"\n)`);

  w.open('def Scope "Looks"');
  for (const { name, m } of looks.values()) {
    const c = m.color || new THREE.Color(1, 1, 1);
    const e = m.emissive ? m.emissive.clone().multiplyScalar(Math.min(4, m.emissiveIntensity ?? 1)) : new THREE.Color(0, 0, 0);
    w.open(`def Material "${name}"`);
    w.line(`token outputs:surface.connect = <${root}/Looks/${name}/PreviewSurface.outputs:surface>`);
    w.open('def Shader "PreviewSurface"');
    w.line('uniform token info:id = "UsdPreviewSurface"');
    w.line(`color3f inputs:diffuseColor = (${f(c.r)}, ${f(c.g)}, ${f(c.b)})`);
    w.line(`float inputs:metallic = ${f(m.metalness ?? 0)}`);
    w.line(`float inputs:roughness = ${f(m.roughness ?? 0.5)}`);
    w.line(`float inputs:clearcoat = ${f(m.clearcoat ?? 0)}`);
    w.line(`float inputs:opacity = ${f(m.transparent ? m.opacity ?? 1 : 1)}`);
    w.line(`color3f inputs:emissiveColor = (${f(e.r)}, ${f(e.g)}, ${f(e.b)})`);
    w.line('token outputs:surface');
    w.close();
    w.close();
  }
  w.close();

  // Building shell
  w.open('def Xform "Building"');
  buildingMeshes.forEach((set, bi) => {
    let k = 0;
    for (const { mat, geos } of set.values()) writeMesh(w, `Shell_${bi}_${k++}`, geos, lookFor(mat));
  });
  // collision floor for Isaac Sim
  w.open('def Cube "FloorCollider" (\n    prepend apiSchemas = ["PhysicsCollisionAPI"]\n)');
  w.line('double size = 1');
  w.line('uniform token purpose = "guide"');
  w.line('double3 xformOp:translate = (6, -0.05, -2.5)');
  w.line('float3 xformOp:scale = (30, 0.1, 30)');
  w.line('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]');
  w.close();
  w.close();

  // Equipment: one component per machine, carrying its master data.
  w.open('def Xform "Equipment"');
  equipment.forEach((grp, i) => {
    const eq = grp.userData.equipment;
    const p = grp.position;
    w.open(`def Xform "${safe(eq.id)}" (\n    kind = "component"\n)`);
    w.line(`double3 xformOp:translate = (${f(p.x)}, ${f(p.y)}, ${f(p.z)})`);
    w.line(`float xformOp:rotateY = ${f(THREE.MathUtils.radToDeg(grp.rotation.y))}`);
    w.line('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY"]');
    w.line(`custom string twin:equipmentId = ${str(eq.id)}`);
    w.line(`custom string twin:name = ${str(eq.name)}`);
    w.line(`custom string twin:type = ${str(eq.type)}`);
    if (eq.maker) w.line(`custom string twin:maker = ${str(eq.maker)}`);
    if (eq.energy) w.line(`custom string twin:energy = ${str(eq.energy)}`);
    if (eq.capacity?.slots != null) w.line(`custom int twin:slots = ${eq.capacity.slots}`);
    if (eq.tempC != null) w.line(`custom float twin:tempC = ${eq.tempC}`);
    let k = 0;
    for (const { mat, geos } of equipMeshes[i].values()) writeMesh(w, `Geom_${k++}`, geos, lookFor(mat));
    const [dw, dd, dh] = eq.dimsM || [0.6, 0.6, 0.9];
    w.open('def Cube "Collider" (\n    prepend apiSchemas = ["PhysicsCollisionAPI"]\n)');
    w.line('double size = 1');
    w.line('uniform token purpose = "guide"');
    w.line(`double3 xformOp:translate = (0, ${f(dh / 2)}, 0)`);
    w.line(`float3 xformOp:scale = (${f(dw)}, ${f(dh)}, ${f(dd)})`);
    w.line('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]');
    w.close();
    w.close();
  });
  w.close();

  // Work centers and the brigade
  if (plan) {
    w.open('def Xform "WorkCenters"');
    for (const wc of plan.workCenters) {
      w.open(`def Xform "${safe(wc.id)}"`);
      w.line(`custom string twin:workCenterId = ${str(wc.id)}`);
      w.line(`custom string twin:name = ${str(wc.name)}`);
      w.line(`custom string[] twin:equipment = [${wc.equipment.map(str).join(', ')}]`);
      wc.spots.forEach((s, i) => {
        w.open(`def Xform "Spot_${i}"`);
        w.line(`double3 xformOp:translate = (${f(s.x)}, 0, ${f(s.z)})`);
        w.line(`float xformOp:rotateY = ${f(THREE.MathUtils.radToDeg(s.face))}`);
        w.line('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY"]');
        w.close();
      });
      w.close();
    }
    w.close();
  }
  w.open('def Xform "Brigade"');
  for (const c of cooks) {
    w.open(`def Xform "${safe(c.id)}"`);
    w.line(`double3 xformOp:translate = (${f(c.x)}, 0, ${f(c.z)})`);
    w.line(`float xformOp:rotateY = ${f(THREE.MathUtils.radToDeg(c.yaw))}`);
    w.line('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY"]');
    w.line(`custom string twin:role = ${str(c.role)}`);
    w.line(`custom string twin:name = ${str(c.name)}`);
    w.open('def Capsule "Body"');
    w.line('uniform token axis = "Y"');
    w.line('double height = 1.2');
    w.line('double radius = 0.25');
    w.line('double3 xformOp:translate = (0, 0.85, 0)');
    w.line('uniform token[] xformOpOrder = ["xformOp:translate"]');
    w.close();
    w.close();
  }
  w.close();

  w.open('def PhysicsScene "PhysicsScene"');
  w.line('vector3f physics:gravityDirection = (0, -1, 0)');
  w.line('float physics:gravityMagnitude = 9.81');
  w.close();

  w.close();
  return w.toString();
}
