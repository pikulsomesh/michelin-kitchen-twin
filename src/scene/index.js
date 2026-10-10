// Kitchen digital twin: a photoreal Three.js model of The French Laundry's
// kitchen built from /data, plus the control surface the simulation drives.
//
//   import { createKitchenScene } from './scene/index.js';
//   const twin = await createKitchenScene(document.getElementById('app'));
//   twin.setApplianceState('EQ-HEARTH', 'busy', { tempC: 420, slotsBusy: 3, label: 'Wagyu calotte' });
//   twin.addCook('cdp-meat-1', { name: 'Ana', role: 'cdp-meat', stationId: 'WC-MEAT' });
//   await twin.moveCook('cdp-meat-1', 'WC-PASS');
//   twin.setInventoryLevel('RM-LOBSTER', 0.4);
//
// Ids are the data model's: WC-* work centers, EQ-* equipment, SL-* storage,
// RM-* raw materials, INT-* intermediates, FG-* finished plates.
// See src/scene/README.md for the full API.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { data as DEFAULT_DATA } from '../data.js';
import { createMaterials } from './materials.js';
import { STATE_COLORS } from './appliances.js';
import { buildEquipment } from './equipment.js';
import { buildSite, diningTable } from './room.js';
import { buildPlan, SITE } from './plan.js';
import { NavGrid } from './nav.js';
import { Cook } from './cooks.js';
import { Item } from './items.js';
import { buildClock, buildPerSeScreen } from './clock.js';
import { buildContainer } from './ingredients.js';
import { smooth, lerp, batchGroup } from './kit.js';
import { injectStyles } from './styles.js';
import { TOUR_SHOTS, OVERVIEW, stationShot } from './tour.js';
import { exportUSDA } from './usd.js';
import { buildSky } from './sky.js';
import { TIERS, tierName, detectQuality, AccumulatePass, Jitter } from './quality.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

export { STATE_COLORS };

const BOUNDS = { x0: -7, x1: 19.5, z0: -16.5, z1: 11.5 };

export async function createKitchenScene(container, options = {}) {
  const opts = {
    data: options.data || DEFAULT_DATA,
    quality: options.quality || 'auto',
    labels: options.labels || 'stations',
    autoTour: options.autoTour ?? false,
  };
  injectStyles();
  container.classList.add('kt-root');
  const plan = buildPlan(opts.data);

  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!options.preserveDrawingBuffer });
  opts.quality = opts.quality === 'auto' ? detectQuality(renderer) : tierName(opts.quality);
  let tier = TIERS[opts.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.className = 'kt-labels';
  container.appendChild(labelRenderer.domElement);

  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.name = 'TheFrenchLaundry';
  const dusk = new THREE.Color(0x1a2130);
  scene.background = dusk;
  scene.fog = new THREE.Fog(new THREE.Color(0.42, 0.36, 0.36), 50, 140);
  const sky = buildSky();
  scene.add(sky.mesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.05, 220);
  camera.position.set(...OVERVIEW.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...OVERVIEW.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.6;
  controls.maxDistance = 70;
  controls.update();

  // ------------------------------------------------------------ lighting
  scene.add(new THREE.HemisphereLight(0xfff1e2, 0x3a3029, 0.32));
  // Late-evening sun low over the garden, raking through the ribbon window.
  const sun = new THREE.DirectionalLight(0xffd2a0, 1.5);
  sun.position.set(22, 16, 26);
  sun.target.position.set(8.5, 0, 2);
  sun.castShadow = true;
  sun.userData.softness = 0.9;
  sun.shadow.mapSize.set(tier.shadow, tier.shadow);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 5, far: 70 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  sky.uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  // Overhead key from the vault LEDs: soft shadows straight down.
  const key = new THREE.DirectionalLight(0xfff0dc, 0.9);
  key.position.set(8.5, 20, 5.4);
  key.target.position.set(8.5, 0, 5.4);
  key.castShadow = true;
  key.userData.softness = 1.6;
  key.shadow.mapSize.set(tier.shadow / 2, tier.shadow / 2);
  key.castShadow = tier.keyShadow;
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 7, bottom: -7, near: 10, far: 25 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  const interiorLights = [{ light: key, base: key.intensity }];
  for (const x of [2.3, 13.7]) {
    const rl = new THREE.RectAreaLight(0xffe9d2, 2.4, 3.5, 7);
    rl.position.set(x, 3.25, 5.4);
    rl.lookAt(x, 0, 5.4);
    scene.add(rl);
    interiorLights.push({ light: rl, base: rl.intensity });
  }
  // Colour temperature (K) to linear RGB (Tanner Helland's fit).
  const kelvin = (K) => {
    const t = K / 100;
    const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    const c = (v) => Math.max(0, Math.min(255, v)) / 255;
    return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
  };
  let probeTimer = 0;

  // ------------------------------------------------------------ world
  const M = createMaterials();
  const nav = new NavGrid(BOUNDS);
  const world = new THREE.Group();
  world.name = 'World';
  scene.add(world);

  const site = buildSite(M, plan, nav);
  world.add(site.group);
  // The canopies and the dining room stay separate objects (hidden from
  // above, replaceable from Studio) but each draws in a few merged calls.
  for (const c of site.canopies) if (c.isGroup) batchGroup(c, { deep: true });
  batchGroup(site.dining, { deep: true });

  // Equipment from the layout
  const appliances = new Map();
  const pickables = [];
  const addPick = (obj, w, h, d, pick, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.y = y + h / 2;
    m.userData.pick = pick;
    obj.add(m);
    pickables.push(m);
    return m;
  };
  const equipGroup = new THREE.Group();
  equipGroup.name = 'Equipment';
  world.add(equipGroup);
  for (const p of plan.placements) {
    const app = buildEquipment(p.eq, p, M);
    app.placement = p;
    app.stationIds = plan.workCenters.filter((wc) => wc.equipment.includes(p.eq.id)).map((wc) => wc.id);
    app.stationId = app.stationIds[0] || null;
    const y = p.y || app.mountY || 0;
    app.mountY = y;
    app.group.position.set(p.x, y, p.z);
    app.group.rotation.y = p.rot;
    equipGroup.add(app.group);
    appliances.set(p.eq.id, app);
    const { w, d, h } = app.size;
    app.pickBox = addPick(app.group, w + 0.02, h + 0.02, d + 0.02, { type: 'appliance', id: p.eq.id });
    if (y < 0.5 && !p.embeddedIn) nav.addBox(p.x, p.z, w, d, p.rot, 'equipment');
  }

  // The kitchen clock with its plaque, and the live screen to Per Se.
  const clock = buildClock(M);
  clock.group.position.set(0.06, 2.95, 5.4);
  clock.group.rotation.y = Math.PI / 2;
  world.add(clock.group);
  const screen = buildPerSeScreen(M);
  screen.position.set(0.05, 1.95, 7.3);
  screen.rotation.y = Math.PI / 2;
  world.add(screen);

  // Work centers
  const stations = new Map();
  for (const wc of plan.workCenters) {
    stations.set(wc.id, { ...wc, slotUse: 0, occupancy: new Map() });
    for (const s of wc.spots) nav.carve(s.x, s.z, 0.3);
  }
  for (const s of [SITE.dining.spot, SITE.dining.server, SITE.dryStore.spot, SITE.liveTank.spot]) nav.carve(s[0], s[1], 0.3);
  // the doorways themselves
  nav.carveLine(-0.6, 5.4, 0.8, 5.4, 0.35);
  nav.carveLine(SITE.annexDoor.at, 0.6, SITE.annexDoor.at, -4.8, 0.35);

  // ------------------------------------------------------------ inventory
  const ingredients = new Map();
  const slotCursor = new Map();
  const takeSlots = (key, slots, n = 1) => {
    const i = slotCursor.get(key) || 0;
    slotCursor.set(key, i + n);
    return i < slots.length ? slots[i] : null;
  };
  const invGroup = new THREE.Group();
  invGroup.name = 'Inventory';
  world.add(invGroup);
  const holdCursor = { i: 0 };

  function registerIngredient(def) {
    if (ingredients.has(def.id)) return ingredients.get(def.id);
    const c = buildContainer(def, M);
    const entry = { def: c.def, level: 1, container: c, where: null };
    const sl = plan.storage.find((s) => s.id === def.storage);
    let placed = false;
    if (sl?.equipment && appliances.get(sl.equipment)) {
      const cab = appliances.get(sl.equipment);
      if (c.kind === 'hanging') {
        c.group.position.set(-0.05 + (slotCursor.get(sl.id) || 0) * 0.1, cab.size.h - 0.35, 0);
        slotCursor.set(sl.id, (slotCursor.get(sl.id) || 0) + 1);
        cab.group.add(c.group);
        placed = true;
      } else if (cab.storeSlots) {
        const skip = c.kind === 'board' ? Math.ceil(0.42 / 0.13) : 1;
        const local = takeSlots(sl.id, cab.storeSlots, skip);
        if (local) {
          c.group.position.copy(local);
          if (c.kind === 'board') c.group.position.x = Math.max(-cab.size.w / 2 + 0.22, Math.min(cab.size.w / 2 - 0.22, local.x));
          cab.group.add(c.group);
          placed = true;
        }
      }
      entry.where = sl.equipment;
    } else if (site.storeSlots[def.storage]) {
      const p = takeSlots(def.storage, site.storeSlots[def.storage]);
      if (p) {
        c.group.position.copy(p);
        if (def.storage === 'SL-DRY') c.group.rotation.y = site.dryRot || 0;
        invGroup.add(c.group);
        placed = true;
        entry.where = def.storage;
      }
    } else if (!def.storage) {
      // Held à la minute sauces sit in the bain wells of the savory suite.
      const suite = [...appliances.values()].find((a) => a.holdSlots?.length && (!def.workCenter || a.stationIds.includes(def.workCenter)))
        || [...appliances.values()].find((a) => a.holdSlots?.length);
      if (suite) {
        const local = suite.holdSlots[holdCursor.i++ % suite.holdSlots.length];
        c.group.position.copy(local);
        suite.group.add(c.group);
        placed = true;
        entry.where = suite.id;
      }
    }
    if (!placed) return entry;
    const pk = addPick(c.group, 0.16, 0.12, 0.18, { type: 'ingredient', id: def.id });
    pk.userData.pick = { type: 'ingredient', id: def.id };
    ingredients.set(def.id, entry);
    return entry;
  }
  for (const def of plan.ingredients) registerIngredient(def);

  // ------------------------------------------------------------ static batching
  // Merge every static mesh by material: thousands of draw calls become ~100.
  function bakeStatic(root) {
    const buckets = new Map();
    root.updateMatrixWorld(true);
    const visit = (o) => {
      if (o.userData.dynamic) return;
      for (const c of [...o.children]) visit(c);
      if (!o.isMesh || o.isInstancedMesh || !o.material || Array.isArray(o.material)) return;
      if (o.userData.pick || o.material.visible === false) return;
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}`;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
      buckets.get(key).geos.push(g);
      o.parent.remove(o);
    };
    visit(root);
    const baked = new THREE.Group();
    baked.name = 'BakedStatic';
    for (const { mat, cast, geos } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      baked.add(mesh);
    }
    return baked;
  }
  // USD export rebuilds clean, un-merged geometry on demand.
  const usdSource = () => {
    const g = new THREE.Group();
    const s2 = buildSite(createMaterials(), plan, new NavGrid(BOUNDS));
    g.add(s2.group);
    for (const p of plan.placements) {
      const app = buildEquipment(p.eq, p, M);
      app.group.position.set(p.x, p.y || app.mountY || 0, p.z);
      app.group.rotation.y = p.rot;
      app.group.name = p.eq.id;
      app.group.userData.equipment = p.eq;
      g.add(app.group);
    }
    return g;
  };
  scene.add(bakeStatic(world));

  // In-scene reflection probe: the steel reflects this kitchen, not a
  // generic studio. Captured once from the aisle behind the line.
  // The cube is re-projected to an equirect through a shader that drops
  // NaN/Inf texels and clamps hot spots, so one bad pixel can't poison the
  // prefiltered environment.
  const captureProbe = ({ hideSky = false } = {}) => {
    const crt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cube = new THREE.CubeCamera(0.05, 80, crt);
    cube.position.set(8.5, 2.0, 7.9);
    const hidden = [];
    scene.traverse((o) => { if ((o.isCSS2DObject || (hideSky && o === sky.mesh)) && o.visible) { o.visible = false; hidden.push(o); } });
    cube.update(renderer, scene);
    hidden.forEach((o) => { o.visible = true; });
    const eq = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { cube: { value: crt.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform samplerCube cube; varying vec2 vUv;
        void main() {
          float phi = (vUv.x - 0.5) * 6.2831853, th = (vUv.y - 0.5) * 3.1415927;
          vec3 d = vec3(sin(phi) * cos(th), sin(th), -cos(phi) * cos(th));
          vec3 c = textureCube(cube, vec3(-d.x, d.y, d.z)).rgb;
          if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
          gl_FragColor = vec4(min(c, vec3(48.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    const qs = new THREE.Scene(); qs.add(quad);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(eq);
    renderer.render(qs, new THREE.Camera());
    renderer.setRenderTarget(prev);
    eq.texture.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(eq.texture).texture;
    crt.dispose(); eq.dispose(); quad.geometry.dispose(); quad.material.dispose();
    return env;
  };
  // Compile every shader up front, in parallel where the browser supports it
  // (KHR_parallel_shader_compile), instead of linking them one by one inside
  // the first renders. Programs depend on the target's colour space and tone
  // mapping, so compile against an offscreen target like the composer's.
  const warmTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const precompile = () => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(warmTarget);
    const ready = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(prev);
    return ready;
  };
  const studioEnv = scene.environment;
  await precompile();
  scene.environment = captureProbe();
  scene.environmentIntensity = 0.85;
  // the probe's environment map has a different size, which is a different program
  await precompile();

  // ------------------------------------------------------------ overlays
  // Utilization aura under each machine (OEE-style heat colouring).
  const auraGeo = new THREE.CircleGeometry(1, 48);
  const auras = new Map();
  for (const [id, app] of appliances) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2fd16b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(auraGeo, mat);
    m.rotation.x = -Math.PI / 2;
    const p = new THREE.Vector3();
    app.group.getWorldPosition(p);
    m.position.set(p.x, 0.012, p.z);
    m.scale.setScalar(Math.max(0.4, Math.max(app.size.w, app.size.d) * 0.7));
    m.visible = false;
    scene.add(m);
    auras.set(id, { mesh: m, value: 0 });
  }
  let overlay = 'none';
  const utilColor = (v) => new THREE.Color().setHSL(0.33 * (1 - Math.min(1, v)), 0.9, 0.5);

  // Floor traffic heatmap from cook movement (a live spaghetti diagram).
  const heatW = Math.round((BOUNDS.x1 - BOUNDS.x0) * 8), heatH = Math.round((BOUNDS.z1 - BOUNDS.z0) * 8);
  const heat = new Float32Array(heatW * heatH);
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = heatW; heatCanvas.height = heatH;
  const heatCtx = heatCanvas.getContext('2d');
  const heatImg = heatCtx.createImageData(heatW, heatH);
  const heatTex = new THREE.CanvasTexture(heatCanvas);
  heatTex.colorSpace = THREE.SRGBColorSpace;
  const heatMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: heatTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  heatMesh.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, 0.015, (BOUNDS.z0 + BOUNDS.z1) / 2);
  heatMesh.visible = false;
  scene.add(heatMesh);
  const stampHeat = (x, z, amount) => {
    const cx = Math.floor(((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * heatW);
    const cz = Math.floor(((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * heatH);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const px = cx + dx, pz = cz + dz;
      if (px < 0 || pz < 0 || px >= heatW || pz >= heatH) continue;
      heat[pz * heatW + px] += amount * Math.exp(-(dx * dx + dz * dz) / 4);
    }
  };
  const repaintHeat = () => {
    let max = 0.001;
    for (let i = 0; i < heat.length; i++) if (heat[i] > max) max = heat[i];
    const d = heatImg.data;
    for (let i = 0; i < heat.length; i++) {
      const v = Math.min(1, heat[i] / max);
      const c = v < 0.5 ? [0, v * 2 * 180, 255 * (1 - v)] : [255 * (v - 0.5) * 2, 180 * (1 - (v - 0.5) * 2) + 40, 0];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = v > 0.02 ? 255 * Math.min(1, v * 1.5) : 0;
    }
    heatCtx.putImageData(heatImg, 0, 0);
    heatTex.needsUpdate = true;
  };

  // ------------------------------------------------------------ labels
  const mkLabel = (cls, html) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return new CSS2DObject(el);
  };
  const stationLabels = [];
  for (const st of stations.values()) {
    const z = st.zone;
    const l = mkLabel('kt-station', `<span class="dot" style="background:${st.color}"></span>${st.name}`);
    const p = z ? [z.x + z.width / 2, z.z + z.depth / 2] : [st.spots[0].x, st.spots[0].z];
    l.position.set(p[0], 2.3, p[1]);
    l.element.addEventListener('click', () => api.focus(st.id));
    scene.add(l);
    stationLabels.push(l);
  }
  const chipFor = new Map();
  for (const [id, app] of appliances) {
    const chip = mkLabel('kt-chip', '');
    chip.position.set(0, app.size.h + 0.2, 0);
    app.group.add(chip);
    chip.visible = false;
    chipFor.set(id, chip);
  }
  const fmtChip = (app) => {
    const i = app.info || {};
    const parts = [`<b>${app.name}</b>`, `<span class="st st-${app.state}">${app.state}</span>`];
    if (i.tempC != null) parts.push(`${Math.round(i.tempC)}°C`);
    if (i.slotsBusy != null && app.placement?.eq.capacity?.slots) parts.push(`${i.slotsBusy}/${app.placement.eq.capacity.slots} slots`);
    if (i.label) parts.push(i.label);
    const prog = i.progress != null ? `<div class="bar"><i style="width:${Math.round(i.progress * 100)}%"></i></div>` : '';
    return parts.join(' · ') + prog;
  };
  let labelMode = opts.labels;
  const refreshLabelVisibility = () => {
    for (const l of stationLabels) l.visible = labelMode !== 'none';
    for (const [id, chip] of chipFor) {
      chip.visible = labelMode === 'all' ? appliances.get(id).state !== 'off' : (id === hoverId || id === selectedId);
    }
  };

  // ------------------------------------------------------------ cooks & items
  const cooks = new Map();
  const items = new Map();
  let timeScale = 1;

  const spotFor = (st, cookId) => {
    // least-occupied spot at the work center
    let best = st.spots[0], bestN = Infinity;
    for (const s of st.spots) {
      const n = [...st.occupancy.values()].filter((v) => v === s).length;
      if (n < bestN) { best = s; bestN = n; }
    }
    if (cookId) st.occupancy.set(cookId, best);
    if (bestN === 0 || bestN === Infinity) return best;
    // spot taken: stand beside and a little behind whoever is there
    const side = bestN % 2 ? 1 : -1, k = Math.ceil(bestN / 2);
    const fx = Math.sin(best.face), fz = Math.cos(best.face);
    const x = best.x + fz * side * 0.55 * k - fx * 0.3 * k, z = best.z - fx * side * 0.55 * k - fz * 0.3 * k;
    const [px, pz] = nav.center(...nav.nearestFree(nav.col(x), nav.row(z)));
    return { x: px, z: pz, face: best.face };
  };
  const serverUse = new Map();
  const resolveTarget = (target, cookId) => {
    if (Array.isArray(target)) return { x: target[0], z: target[1], face: target[2] ?? null };
    if (target && typeof target === 'object' && 'x' in target) return { x: target.x, z: target.z, face: target.face ?? null };
    if (target === 'dining' || target === 'dining-room') return { x: SITE.dining.spot[0], z: SITE.dining.spot[1], face: -Math.PI / 2 };
    if (target === 'server' || target === 'pass-server') {
      // runners line up along the dining side of the pass
      let i = cookId != null ? serverUse.get(cookId) : 0;
      if (i == null) { const used = new Set(serverUse.values()); i = 0; while (used.has(i)) i++; serverUse.set(cookId, i); }
      const off = ((i % 4) - 1.5) * 0.7, back = Math.floor(i / 4) * 0.6;
      return { x: SITE.dining.server[0] - back, z: SITE.dining.server[1] + off, face: SITE.dining.server[2] };
    }
    if (target === 'SL-DRY') return { x: SITE.dryStore.spot[0], z: SITE.dryStore.spot[1], face: SITE.dryStore.spot[2] };
    if (target === 'SL-LIVE-TANK') return { x: SITE.liveTank.spot[0], z: SITE.liveTank.spot[1], face: SITE.liveTank.spot[2] };
    const st = stations.get(target);
    if (st) { const s = spotFor(st, cookId); return { x: s.x, z: s.z, face: s.face, station: st }; }
    const sl = plan.storage.find((s) => s.id === target);
    if (sl?.equipment) return resolveTarget(sl.equipment, cookId);
    const app = appliances.get(target);
    if (app) {
      // stand in front of the machine, facing it
      const p = new THREE.Vector3();
      app.group.getWorldPosition(p);
      const yaw = app.group.rotation.y;
      const off = app.size.d / 2 + 0.45;
      return { x: p.x + Math.sin(yaw) * off, z: p.z + Math.cos(yaw) * off, face: yaw + Math.PI, app };
    }
    throw new Error(`Unknown work center, equipment or storage id: ${target}`);
  };

  const anchorFor = (target) => {
    if (target === 'dining' || target === 'dining-room') return new THREE.Vector3(SITE.dining.spot[0] - 0.6, 1.0, SITE.dining.spot[1]);
    const app = appliances.get(target);
    if (app) return app.group.localToWorld(app.nextSlot());
    const st = stations.get(target);
    if (st) {
      if (st.id === 'WC-PASS' && appliances.get('EQ-PASS-TABLE')) return anchorFor('EQ-PASS-TABLE');
      const s = st.spots[0];
      const i = st.slotUse++ % 5;
      const fx = Math.sin(s.face), fz = Math.cos(s.face);
      const off = (i - 2) * 0.32;
      return new THREE.Vector3(s.x + fx * 0.62 + fz * off, 0.935, s.z + fz * 0.62 - fx * off);
    }
    throw new Error(`Unknown work center or equipment id: ${target}`);
  };

  // ------------------------------------------------------------ picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverId = null, selectedId = null;
  const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.9 }));
  highlight.visible = false;
  scene.add(highlight);
  const tooltip = document.createElement('div');
  tooltip.className = 'kt-tooltip';
  container.appendChild(tooltip);
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] || []).forEach((f) => f(d));

  const pickAt = (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [...pickables, ...[...cooks.values()].map((c) => c.pick), ...[...items.values()].map((i) => i.pick)];
    const hits = raycaster.intersectObjects(targets, false);
    // prefer the smallest thing under the cursor (an ingredient inside a fridge)
    hits.sort((a, b) => (a.distance - b.distance) || 0);
    const ing = hits.find((h) => h.object.userData.pick.type !== 'appliance' && h.distance < (hits[0]?.distance ?? 0) + 1.2);
    return (ing || hits[0])?.object || null;
  };
  const describe = (pick) => {
    if (pick.type === 'appliance') {
      const a = appliances.get(pick.id);
      const eq = a.placement?.eq;
      const maker = eq?.maker ? `<div class="sub">${eq.maker}${eq.capacity?.slots ? ` · ${eq.capacity.slots} slots` : ''}${eq.tempC != null ? ` · ${eq.tempC}°C` : ''}</div>` : '';
      return fmtChip(a) + maker;
    }
    if (pick.type === 'cook') { const c = cooks.get(pick.id); return `<b>${c.name}</b> · ${c.role}${c.activity ? ' · ' + c.activity : ''}`; }
    if (pick.type === 'ingredient') {
      const e = ingredients.get(pick.id);
      return `<b>${e.def.name}</b> · ${Math.round(e.level * 100)}% on hand${e.qty != null ? ` · ${e.qty}` : ''}<div class="sub">${e.def.id}${e.def.origin ? ' · ' + e.def.origin : ''}</div>`;
    }
    if (pick.type === 'item') { const it = items.get(pick.id); return `<b>${it.label || it.dishId || it.kind}</b>`; }
    return '';
  };
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return;
    const obj = pickAt(ev);
    if (!obj) { hoverId = null; highlight.visible = false; tooltip.style.opacity = 0; refreshLabelVisibility(); return; }
    const pick = obj.userData.pick;
    hoverId = pick.id;
    obj.updateMatrixWorld();
    const bb = new THREE.Box3().setFromObject(obj, true);
    bb.getCenter(highlight.position);
    bb.getSize(highlight.scale);
    highlight.visible = true;
    tooltip.innerHTML = describe(pick);
    const r = container.getBoundingClientRect();
    tooltip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 260)}px`;
    tooltip.style.top = `${ev.clientY - r.top + 14}px`;
    tooltip.style.opacity = 1;
    refreshLabelVisibility();
  });
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
    const obj = pickAt(ev);
    selectedId = obj ? obj.userData.pick.id : null;
    emit('select', obj ? { ...obj.userData.pick } : null);
    refreshLabelVisibility();
  });
  renderer.domElement.addEventListener('dblclick', (ev) => {
    const obj = pickAt(ev);
    if (!obj) return;
    const p = obj.userData.pick;
    if (p.type === 'appliance') api.focus(p.id);
    else if (p.type === 'cook') api.follow(p.id);
  });

  // ------------------------------------------------------------ highlights
  const hiMat = new THREE.LineBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.9, depthTest: false });
  const hiGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const hiBoxes = [];
  const mkHiBox = () => { const b = new THREE.LineSegments(hiGeo, hiMat); b.renderOrder = 10; b.visible = false; scene.add(b); return b; };
  const boxFor = (id) => {
    const box = new THREE.Box3();
    if (appliances.has(id)) return box.setFromObject(appliances.get(id).pickBox, true);
    if (ingredients.has(id)) {
      const e = ingredients.get(id);
      e.container.group.updateMatrixWorld(true);
      box.setFromObject(e.container.group);
      if (box.isEmpty()) { const p = e.container.group.getWorldPosition(new THREE.Vector3()); box.setFromCenterAndSize(p.add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(0.2, 0.12, 0.2)); }
      return box;
    }
    if (cooks.has(id)) return box.setFromObject(cooks.get(id).pick, true);
    if (items.has(id)) return box.setFromObject(items.get(id).object);
    const st = stations.get(id);
    if (st) {
      const z = st.zone;
      if (z) return box.set(new THREE.Vector3(z.x, 0, z.z), new THREE.Vector3(z.x + z.width, 1.1, z.z + z.depth));
      for (const s of st.spots) box.expandByPoint(new THREE.Vector3(s.x, 0, s.z)).expandByPoint(new THREE.Vector3(s.x, 1.1, s.z));
      return box.expandByScalar(0.4);
    }
    return null;
  };

  // ------------------------------------------------------------ camera moves
  let flight = null;
  let tourOn = false, tourIndex = 0, tourHold = 0;
  let followId = null;
  const flyTo = (pos, target, seconds = 2.8) => new Promise((resolve) => {
    if (flight) flight.resolve(false);
    flight = { fromP: camera.position.clone(), fromT: controls.target.clone(), toP: new THREE.Vector3(...pos), toT: new THREE.Vector3(...target), t: 0, dur: seconds, resolve };
  });
  let intro = null, followNext = false;
  const stopAuto = () => {
    tourOn = false; followId = null; followNext = false;
    if (intro) { intro.resolve(false); intro = null; }
  };
  controls.addEventListener('start', () => {
    if (flight) { flight.resolve(false); flight = null; }
    if (tourOn || followId || intro || followNext) { stopAuto(); emit('tour', { playing: false }); }
  });

  // ------------------------------------------------------------ post-processing
  let composer = null, gtao = null, accum = null, bokeh = null, jitter = null;
  const setupComposer = () => {
    const w = container.clientWidth, h = container.clientHeight;
    composer?.dispose?.();
    accum?.dispose();
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: tier.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = null; accum = null; bokeh = null;
    if (tier.ao) {
      gtao = new GTAOPass(scene, camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.8;
      gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1, scale: 1, samples: tier.accumulate ? 24 : 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      composer.addPass(gtao);
    }
    if (tier.accumulate) {
      accum = new AccumulatePass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
      composer.addPass(accum);
      jitter ||= new Jitter(camera, [sun, key]);
    }
    if (tier.dof) {
      bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.00035, maxblur: 0.0045 });
      composer.addPass(bokeh);
    }
    if (tier.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.16, 0.35, 4.0));
    composer.addPass(new OutputPass());
  };
  const applyTier = (q) => {
    opts.quality = tierName(q);
    tier = TIERS[opts.quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatio));
    for (const l of [sun, key]) { l.shadow.map?.dispose(); l.shadow.map = null; }
    sun.shadow.mapSize.set(tier.shadow, tier.shadow);
    key.shadow.mapSize.set(tier.shadow / 2, tier.shadow / 2);
    key.castShadow = tier.keyShadow;
    jitter?.clear();
    setupComposer();
    resize();
  };
  setupComposer();

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setSize(w, h);
    gtao?.setSize(w, h);
    accum?.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ------------------------------------------------------------ loop
  const clockT = new THREE.Clock();
  let simClock = null;
  let running = true;
  let heatTimer = 0, labelTimer = 1;
  const lastView = new THREE.Matrix4();
  let frameHook = null;
  const tick = () => {
    if (!running) return;
    const rawDt = Math.min(0.1, clockT.getDelta());
    const t = clockT.elapsedTime;
    const dt = rawDt * timeScale;
    for (const app of appliances.values()) app.update(rawDt, t);
    for (const c of cooks.values()) {
      c.update(dt, t);
      if (c.path) stampHeat(c.x, c.z, dt);
    }
    for (const it of items.values()) it.update(dt);
    heatTimer += rawDt;
    if (heatMesh.visible && heatTimer > 0.5) { heatTimer = 0; repaintHeat(); }
    clock.set(simClock || new Date());
    hiMat.opacity = 0.55 + 0.4 * Math.sin(t * 5);

    // Bird's-eye cutaway: lift the canopies away so the line shows, and fade
    // station labels that are far from a low camera.
    const high = camera.position.y > 6.5;
    for (const c of site.canopies) c.visible = !high;
    labelTimer += rawDt;
    if (labelTimer > 0.15) {
      labelTimer = 0;
      for (const l of stationLabels) {
        const d = camera.position.distanceTo(l.position);
        const op = high ? 1 : Math.max(0, Math.min(1, (15 - d) / 4));
        l.element.style.opacity = op;
        l.element.style.pointerEvents = op > 0.2 ? '' : 'none';
      }
      // name tags only on nearby cooks (or the one being followed)
      for (const c of cooks.values()) {
        const d = camera.position.distanceTo(c.root.position);
        c.bubble.element.style.opacity = c.id === followId || c.id === hoverId ? 1 : Math.max(0, Math.min(1, (9 - d) / 3));
      }
    }

    if (overlay === 'utilization') {
      for (const a of auras.values()) {
        a.mesh.visible = true;
        a.mesh.material.opacity = lerp(a.mesh.material.opacity, 0.2 + a.value * 0.55, Math.min(1, rawDt * 4));
        a.mesh.material.color.copy(utilColor(a.value));
      }
    } else for (const a of auras.values()) a.mesh.visible = false;

    if (flight) {
      flight.t += rawDt / flight.dur;
      const k = smooth(Math.min(1, flight.t));
      camera.position.lerpVectors(flight.fromP, flight.toP, k);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      if (flight.t >= 1) { const f = flight; flight = null; f.resolve(true); }
    } else if (tourOn) {
      tourHold -= rawDt;
      const off = camera.position.clone().sub(controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rawDt * 0.025);
      camera.position.copy(controls.target).add(off);
      if (tourHold <= 0) nextShot();
    } else if (intro) {
      intro.t += rawDt / intro.dur;
      const k = smooth(Math.min(1, intro.t));
      intro.pos.getPoint(k, camera.position);
      intro.tgt.getPoint(k, controls.target);
      if (intro.t >= 1) { const f = intro; intro = null; f.resolve(true); }
    } else if (followId && cooks.has(followId)) {
      const c = cooks.get(followId);
      const tgt = new THREE.Vector3(c.x, 1.2, c.z);
      controls.target.lerp(tgt, Math.min(1, rawDt * 3));
      const want = tgt.clone().add(new THREE.Vector3(-Math.sin(c.yaw) * 3.2, 2.2, -Math.cos(c.yaw) * 3.2));
      camera.position.lerp(want, Math.min(1, rawDt * 1.2));
    } else if (followId && items.has(followId)) {
      // follow a plate: a low chase camera that keeps it centred
      const it = items.get(followId);
      const tgt = it.object.getWorldPosition(new THREE.Vector3());
      controls.target.lerp(tgt, Math.min(1, rawDt * 4));
      const off = camera.position.clone().sub(controls.target).setY(0);
      if (off.lengthSq() < 0.01) off.set(1, 0, 1);
      off.setLength(2.4);
      const want = tgt.clone().add(off).setY(tgt.y + 1.25);
      camera.position.lerp(want, Math.min(1, rawDt * 1.6));
    } else if (followId) {
      emit('follow', { id: followId, done: true });
      followId = null;
    }
    controls.update();
    frameHook?.(rawDt, t);
    if (accum) {
      // Pro Max: restart accumulation whenever the view changes.
      camera.updateMatrixWorld();
      if (!lastView.equals(camera.matrixWorld) || flight || tourOn || followId || intro) accum.reset();
      lastView.copy(camera.matrixWorld);
      if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      jitter.apply(sz.x, sz.y);
      composer.render();
      jitter.clear();
    } else composer.render();
    labelRenderer.render(scene, camera);
    requestAnimationFrame(tick);
  };

  const nextShot = () => {
    const shot = TOUR_SHOTS[tourIndex % TOUR_SHOTS.length];
    tourIndex++;
    emit('tour', { playing: true, shot: shot.name, index: tourIndex });
    tourHold = Infinity;
    flyTo(shot.pos, shot.target, shot.fly ?? 3.5).then((ok) => { if (ok) tourHold = shot.hold ?? 4; });
  };

  // ------------------------------------------------------------ public API
  const api = {
    scene, camera, renderer, controls, THREE, plan,
    stations: plan.workCenters.map((wc) => ({ id: wc.id, name: wc.name, color: wc.color, area: wc.area, equipment: wc.equipment, spots: wc.spots })),
    appliances: [...appliances.values()].map((a) => ({ id: a.id, type: a.placement.eq.type, name: a.name, stationIds: a.stationIds, slots: a.placement.eq.capacity?.slots ?? null })),
    get ingredients() { return [...ingredients.values()].map((e) => ({ id: e.def.id, name: e.def.name, storage: e.def.storage, where: e.where, level: e.level })); },
    get cooks() { return [...cooks.values()].map((c) => ({ id: c.id, name: c.name, role: c.role, x: c.x, z: c.z, activity: c.activity, location: c.location })); },

    // Equipment. state: off | preheating | idle | busy | fault.
    // info: { tempC, progress 0..1, label, slotsBusy, load 0..1 }
    setApplianceState(id, state, info = {}) {
      const app = appliances.get(id);
      if (!app) throw new Error(`Unknown equipment ${id}`);
      app.setState(state, info);
      chipFor.get(id).element.innerHTML = fmtChip(app);
      refreshLabelVisibility();
      emit('appliance', { id, state, info: app.info });
    },
    getApplianceState(id) { const a = appliances.get(id); return a ? { state: a.state, ...a.info } : null; },

    // Brigade
    addCook(id, spec = {}) {
      if (cooks.has(id)) return api;
      const c = new Cook(id, spec, M);
      const tgt = resolveTarget(spec.stationId || spec.at || 'WC-PASS', id);
      c.setPosition(tgt.x, tgt.z);
      c.yaw = c.targetYaw = tgt.face ?? 0;
      c.location = spec.stationId || spec.at || 'WC-PASS';
      const bubble = mkLabel('kt-cook', `<b>${c.name}</b><span></span>`);
      bubble.position.set(0, 2.05, 0);
      c.root.add(bubble);
      c.bubble = bubble;
      scene.add(c.root);
      cooks.set(id, c);
      return api;
    },
    removeCook(id) {
      const c = cooks.get(id);
      if (!c) return;
      for (const st of stations.values()) st.occupancy.delete(id);
      serverUse.delete(id);
      c.bubble.element.remove();
      scene.remove(c.root);
      cooks.delete(id);
    },
    // Walks a cook along the aisles to a work center, equipment, storage
    // location, 'dining', 'server' or [x, z]. Resolves true on arrival,
    // false if interrupted by another move. seconds are sim seconds.
    moveCook(id, target, { seconds, speed } = {}) {
      const c = cooks.get(id);
      if (!c) return Promise.reject(new Error(`Unknown cook ${id}`));
      for (const st of stations.values()) st.occupancy.delete(id);
      if (target !== 'server') serverUse.delete(id);
      const tgt = resolveTarget(target, id);
      const path = nav.findPath(c.x, c.z, tgt.x, tgt.z);
      let len = 0;
      for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const v = seconds ? Math.max(0.2, len / seconds) : (speed || 1.35);
      c.busy = false;
      return new Promise((resolve) => c.walk(path, v, tgt.face, (ok) => {
        if (ok) c.location = typeof target === 'string' ? target : null;
        resolve(ok);
      }));
    },
    setCookActivity(id, label, { busy } = {}) {
      const c = cooks.get(id);
      if (!c) return;
      c.activity = label || null;
      c.busy = busy ?? !!label;
      c.bubble.element.querySelector('span').textContent = label || '';
      c.bubble.element.classList.toggle('active', !!label);
    },
    follow(id) { stopAuto(); followId = id; },
    // Chase the next plate that is plated, all the way to the dining room.
    followNextPlate() { stopAuto(); followNext = true; },
    get following() { return followId || (followNext ? 'next-plate' : null); },
    // Teleport a cook (used after a timeline seek).
    placeCook(id, target) {
      const c = cooks.get(id);
      if (!c) return;
      for (const st of stations.values()) st.occupancy.delete(id);
      if (target !== 'server') serverUse.delete(id);
      const tgt = resolveTarget(target, id);
      if (c.onArrive) { const f = c.onArrive; c.onArrive = null; f(false); }
      c.path = null;
      c.setPosition(tgt.x, tgt.z);
      if (tgt.face != null) c.yaw = c.targetYaw = tgt.face;
      c.location = typeof target === 'string' ? target : null;
    },
    get itemCount() { return items.size; },

    // Work in progress: plates (dishId = FG-*), pans, pots, trays, portions.
    addItem(id, spec = {}, at = 'WC-PASS') {
      if (items.has(id)) api.removeItem(id);
      const it = new Item(id, spec, M);
      it.pick = it.object.children[1];
      if (at && cooks.has(at)) {
        it.carrier = cooks.get(at);
        it.carrier.carrying.add(id);
      } else {
        it.object.position.copy(anchorFor(at));
        it.at = at;
      }
      scene.add(it.object);
      items.set(id, it);
      if (followNext && (spec.kind || 'plate') === 'plate') { followNext = false; followId = id; emit('follow', { id }); }
      return api;
    },
    // Moves an item to a work center or machine. With carriedBy, the cook
    // fetches it and walks it there; otherwise it slides (seconds, sim time).
    async moveItem(id, to, { seconds = 1.2, carriedBy } = {}) {
      const it = items.get(id);
      if (!it) throw new Error(`Unknown item ${id}`);
      if (carriedBy) {
        const c = cooks.get(carriedBy);
        if (it.carrier !== c) {
          if (it.at) await api.moveCook(carriedBy, it.at);
          it.carrier?.carrying.delete(id);
          it.carrier = c;
          c.carrying.add(id);
          it.tween = null;
        }
        await api.moveCook(carriedBy, to === 'dining' ? 'dining' : to);
        c.carrying.delete(id);
        it.carrier = null;
      }
      if (it.carrier) { it.carrier.carrying.delete(id); it.carrier = null; }
      const dest = anchorFor(to);
      it.at = to;
      return new Promise((resolve) => it.moveTo(dest, seconds / Math.max(0.01, timeScale), resolve));
    },
    pickUpItem(id, cookId) {
      const it = items.get(id), c = cooks.get(cookId);
      if (!it || !c) return;
      it.carrier?.carrying.delete(id);
      it.carrier = c; c.carrying.add(id); it.tween = null;
    },
    removeItem(id) {
      const it = items.get(id);
      if (!it) return;
      it.carrier?.carrying.delete(id);
      scene.remove(it.object);
      items.delete(id);
    },
    setTickets(n) {
      const pass = appliances.get('EQ-PASS-TABLE');
      pass?.tickets?.forEach((t, i) => { t.visible = i < n; });
    },

    // Inventory (RM-* / INT-* ids). fraction is on-hand / par level.
    registerIngredient(def) { registerIngredient(def); return api; },
    setInventoryLevel(id, fraction, { qty, silent } = {}) {
      const e = ingredients.get(id);
      if (!e) return;
      const f = Math.max(0, Math.min(1, fraction));
      e.level = f;
      if (qty != null) e.qty = qty;
      e.container.setLevel(f);
      if (!silent) emit('inventory', { id, level: f, qty });
    },

    // Overlays: 'none' | 'utilization' | 'traffic' | 'both'
    setOverlay(mode) {
      overlay = mode === 'both' ? 'utilization' : mode;
      heatMesh.visible = mode === 'traffic' || mode === 'both';
      if (heatMesh.visible) repaintHeat();
    },
    setUtilization(map) {
      for (const [id, v] of Object.entries(map)) { const a = auras.get(id); if (a) a.value = v; }
    },
    resetTraffic() { heat.fill(0); repaintHeat(); },
    setLabels(mode) { labelMode = mode; refreshLabelVisibility(); },

    // Time
    setTimeScale(x) { timeScale = Math.max(0, x); },
    get timeScale() { return timeScale; },
    setClock(date) { simClock = date ? new Date(date) : null; },

    // Camera
    focus(id) {
      stopAuto();
      const shot = stationShot(id, stations, appliances);
      return shot ? flyTo(shot.pos, shot.target, 2.2) : Promise.resolve(false);
    },
    // flyTo('EQ-HEARTH') / flyTo('WC-FISH') or flyTo([x,y,z], [tx,ty,tz], seconds)
    flyTo(pos, target, seconds) {
      if (typeof pos === 'string') return api.focus(pos);
      stopAuto();
      return flyTo(pos, target, seconds);
    },
    // Opening shot: a slow crane from the garden over the roof and down
    // into the line, ending on the pass.
    intro({ seconds = 11 } = {}) {
      stopAuto();
      return new Promise((resolve) => {
        const P = (a) => new THREE.Vector3(...a);
        intro = {
          t: 0, dur: seconds, resolve,
          pos: new THREE.CatmullRomCurve3([P([30, 4, 30]), P([22, 9, 22]), P([14, 8.5, 13]), P([10.5, 3.2, 8.6]), P([6.2, 2.1, 7.2])], false, 'centripetal'),
          tgt: new THREE.CatmullRomCurve3([P([10, 1.5, 9]), P([9, 1.2, 6]), P([8, 1, 5]), P([6.5, 1, 5.2]), P([2.6, 1.1, 5.4])], false, 'centripetal'),
        };
      });
    },
    // Outline ids (EQ-*, WC-*, RM-*/INT-*, cook ids, item ids); [] clears.
    highlight(ids = []) {
      for (const b of hiBoxes) b.visible = false;
      [].concat(ids || []).forEach((id, i) => {
        const box = boxFor(id);
        if (!box || box.isEmpty()) return;
        const h = hiBoxes[i] || (hiBoxes[i] = mkHiBox());
        box.getCenter(h.position);
        box.getSize(h.scale).addScalar(0.04);
        h.visible = true;
      });
    },
    overview() { stopAuto(); return flyTo(OVERVIEW.pos, OVERVIEW.target, 2.5); },
    startTour() { stopAuto(); tourOn = true; nextShot(); },
    stopTour() { tourOn = false; emit('tour', { playing: false }); },
    get touring() { return tourOn; },
    tourShots: TOUR_SHOTS.map((s) => s.name),

    // Art direction hooks (sun, sky, interior light, exposure, haze, season).
    setLook(look = {}) {
      if (look.sun) {
        const s = look.sun;
        if (s.azimuthDeg != null || s.elevationDeg != null) {
          const off = sun.position.clone().sub(sun.target.position);
          const r = off.length();
          const az = THREE.MathUtils.degToRad(s.azimuthDeg ?? THREE.MathUtils.radToDeg(Math.atan2(off.x, off.z)));
          const el = THREE.MathUtils.degToRad(s.elevationDeg ?? THREE.MathUtils.radToDeg(Math.asin(off.y / r)));
          sun.position.set(sun.target.position.x + r * Math.cos(el) * Math.sin(az), r * Math.sin(el), sun.target.position.z + r * Math.cos(el) * Math.cos(az));
          sky.uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
        }
        if (s.color != null) { sun.color.set(s.color); sky.uniforms.sunColor.value.set(s.color).multiplyScalar(4); }
        if (s.intensity != null) sun.intensity = s.intensity;
      }
      if (look.sky) {
        if (look.sky.top != null) sky.uniforms.top.value.set(look.sky.top);
        if (look.sky.horizon != null) { sky.uniforms.horizon.value.set(look.sky.horizon); scene.fog.color.set(look.sky.horizon).multiplyScalar(0.55); }
      }
      if (look.interior) {
        const k = look.interior.kelvin != null ? kelvin(look.interior.kelvin) : null;
        const m = look.interior.intensity ?? 1;
        for (const l of interiorLights) { if (k) l.light.color.copy(k); l.light.intensity = l.base * m; }
      }
      if (look.accent) {
        const k = look.accent.kelvin != null ? kelvin(look.accent.kelvin) : null;
        for (const l of site.lights) { if (k) l.color.copy(k); if (look.accent.intensity != null) l.intensity = look.accent.intensity; }
      }
      if (look.exposure != null) renderer.toneMappingExposure = look.exposure;
      if (look.haze != null) {
        const h = Math.max(0, Math.min(1, look.haze));
        scene.fog.near = 70 - h * 50; scene.fog.far = 200 - h * 130;
        sky.uniforms.haze.value = 0.2 + h * 1.2;
      }
      if (look.season || look.foliage != null) {
        const tint = { spring: [0.95, 1.08, 0.85], summer: [1, 1, 1], autumn: [1.15, 0.85, 0.55], fall: [1.15, 0.85, 0.55], winter: [0.78, 0.8, 0.76] }[look.season] || [1, 1, 1];
        const f = look.foliage ?? 1;
        M.grass.color.setRGB(tint[0], tint[1], tint[2]);
        if (site.leafMat) site.leafMat.color.setRGB(tint[0] * f + (1 - f) * 0.6, tint[1] * f + (1 - f) * 0.5, tint[2] * f + (1 - f) * 0.35);
      }
      jitter?.rebase();
      accum?.reset();
      clearTimeout(probeTimer);
      probeTimer = setTimeout(() => { scene.environment = captureProbe(); }, 250);
      return api;
    },
    // Replace the dining-room glimpse: [{ id, seats, shape: 'round'|'rect', x, z, rotY (deg) }], x < 0.
    setDining(tables = []) {
      const g = site.dining;
      for (const c of [...g.children]) { g.remove(c); if (c.userData.batched) c.geometry.dispose(); }
      for (const t of tables) {
        const m = diningTable(M, t);
        m.position.set(t.x, 0, t.z);
        m.rotation.y = THREE.MathUtils.degToRad(t.rotY || 0);
        m.userData.table = t.id;
        g.add(m);
      }
      batchGroup(g, { deep: true });
      return api;
    },

    // OpenUSD export of the plant for NVIDIA Omniverse / Isaac Sim.
    _probe(o) { scene.environment = captureProbe(o); },
    exportUSD() { return exportUSDA(usdSource(), { plan, cooks: [...cooks.values()] }); },

    // Rendering
    setQuality(q) { applyTier(q); emit('quality', { quality: opts.quality }); },
    get quality() { return opts.quality; },
    qualityTiers: Object.entries(TIERS).map(([id, t]) => ({ id, label: t.label })),
    onFrame(fn) { frameHook = fn; },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
    renderOnce() { composer.render(); labelRenderer.render(scene, camera); },
    dispose() {
      running = false;
      ro.disconnect();
      renderer.dispose();
      container.innerHTML = '';
    },
  };

  // Before service: refrigeration running, pass lamps warm, hearth lit.
  for (const [id, app] of appliances) {
    const eq = app.placement.eq;
    if (eq.tempC != null) api.setApplianceState(id, 'idle', { tempC: eq.tempC });
  }
  refreshLabelVisibility();
  resize();
  requestAnimationFrame(tick);
  if (opts.autoTour) api.startTour();
  const ready = new CustomEvent('twin:ready', { detail: api, bubbles: true });
  container.dispatchEvent(ready);
  window.dispatchEvent(new CustomEvent('twin:ready', { detail: api }));
  return api;
}
