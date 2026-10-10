// Binds the 3D kitchen to the running simulation: appliances glow while they cook (red when down),
// and each member of the brigade is a figure that walks to the station of their current task.
// Scene-agnostic: it needs only THREE, a scene, equipment meshes by EQ id, and the sim.
import * as THREE from 'three';

const ROLE_COLOR = [
  [/chef-de-cuisine|sous/, 0xf2efe8],
  [/fish/, 0x5b8fb9],
  [/meat|butcher/, 0xc4644c],
  [/garde|garnish|prep/, 0x86b06f],
  [/pastry/, 0xd6a2c4],
  [/plonge|dish/, 0x8a9096],
  [/runner/, 0xd6b46a],
];
const colorFor = (role) => ROLE_COLOR.find(([re]) => re.test(role))?.[1] ?? 0xcfcac0;

const COOKING = new THREE.Color(0xff8a2a);
const DOWN = new THREE.Color(0xe0302a);

export function bindLive({ scene, sim, equipmentMeshes }) {
  const group = new THREE.Group();
  group.name = 'Brigade';
  scene.add(group);

  // One figure per person: a whites-coloured body with an apron band in their station colour.
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 1.05, 4, 10);
  const headGeo = new THREE.SphereGeometry(0.13, 16, 12);
  const ringGeo = new THREE.RingGeometry(0.3, 0.38, 32);
  const figures = new Map();
  function figure(st) {
    const c = colorFor(st.role);
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    body.position.y = 0.73;
    body.castShadow = true;
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xd9b59a, roughness: 0.6 }));
    head.position.y = 1.5;
    head.castShadow = true;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(body, head, ring);
    g.userData = { staff: st.id, ring, target: new THREE.Vector3(), seen: false };
    group.add(g);
    return g;
  }

  // Station positions from the sim; staff at the same station spread around it on a small circle.
  const stationPos = new Map();
  const refreshStations = () => {
    stationPos.clear();
    for (const s of sim.state.stations) stationPos.set(s.id, new THREE.Vector3(s.x, 0, s.y));
  };
  refreshStations();
  sim.on('reset', () => { refreshStations(); for (const f of figures.values()) f.userData.seen = false; });

  const glow = new Map(); // mesh -> current emissive intensity, eased
  let last = 0;
  let state = null;

  function read() {
    state = sim.state;
    const byStation = new Map();
    for (const st of state.staff) {
      const onShift = st.state !== 'off';
      let f = figures.get(st.id);
      if (!f) { f = figure(st); figures.set(st.id, f); }
      f.visible = onShift;
      const at = stationPos.get(st.station) ?? stationPos.get(st.home);
      if (!at) { f.visible = false; continue; }
      const k = byStation.get(st.station) ?? 0;
      byStation.set(st.station, k + 1);
      const a = k * 2.4 + 0.6;
      const r = k === 0 ? 0.55 : 0.75 + 0.15 * Math.floor(k / 4);
      f.userData.target.set(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r);
      if (!f.userData.seen) { f.position.copy(f.userData.target); f.userData.seen = true; }
      f.userData.working = st.state === 'working';
    }
    for (const ap of state.appliances) {
      const mesh = equipmentMeshes.get(ap.id);
      if (!mesh) continue;
      mesh.userData.live = { up: ap.up, load: ap.capacity ? ap.inUse / ap.capacity : 0, util: ap.util, oee: ap.oee, running: ap.running?.length ?? 0 };
    }
  }

  return {
    get state() { return state; },
    update(now, dt) {
      if (!state || now - last > 100) { last = now; read(); }
      const t = now / 1000;
      for (const f of figures.values()) {
        if (!f.visible) continue;
        const d = f.userData.target.clone().sub(f.position);
        const dist = d.length();
        if (dist > 0.02) {
          f.position.addScaledVector(d, Math.min(1, dt * 3.5));
          f.rotation.y = Math.atan2(d.x, d.z);
        }
        const ring = f.userData.ring;
        ring.material.opacity += ((f.userData.working ? 0.55 + 0.25 * Math.sin(t * 5 + f.id) : 0) - ring.material.opacity) * Math.min(1, dt * 6);
      }
      for (const mesh of equipmentMeshes.values()) {
        const live = mesh.userData.live;
        if (!live || mesh.userData.selected) continue;
        const target = !live.up ? 0.9 : live.load > 0 ? 0.12 + 0.3 * Math.min(1, live.load) : 0;
        const cur = glow.get(mesh) ?? 0;
        const next = cur + (target - cur) * Math.min(1, dt * 4);
        glow.set(mesh, next);
        mesh.material.emissive.copy(live.up ? COOKING : DOWN);
        mesh.material.emissiveIntensity = next * (live.up ? 1 : 0.7 + 0.3 * Math.sin(t * 8));
      }
    },
  };
}
