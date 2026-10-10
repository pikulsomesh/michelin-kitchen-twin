// Studio page: shape the restaurant (dining room, menu, season, light) and watch the 3D stage and the
// dinner-service simulation follow. Every edit recompiles the KitchenData the sim runs, re-runs the
// service headlessly against the house baseline, and is kept in the URL so a setup is a shareable link.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { data as siteData } from '../data.js';
import { createSim } from '../sim/sim.js';
import { runHeadless, avgOee } from '../sim/scenarios.js';
import { adaptKitchenData } from '../sim/adapter.js';
import { mountDashboard } from '../dashboard/dashboard.js';
import { defaultStudio, seasonForDate, encodeStudio, decodeStudio, mixOf } from './config.js';
import { compileStudio } from './compile.js';
import { computeLook } from './look.js';
import { createStage } from './stage.js';
import { mountStudioPanel } from './ui.js';
import { SEASON_LABEL } from './catalog.js';

// The simulation's KitchenData: the sourced French Laundry model in /data, adapted for the engine.
const base = adaptKitchenData(siteData);

const hashState = () => { const m = /[#&]s=([^&]+)/.exec(location.hash); return m ? decodeStudio(m[1], base) : null; };
let state = hashState() ?? defaultStudio(base, { season: seasonForDate() });

// ------------------------------------------------------------------------------------------ 3D
const quality = new URLSearchParams(location.search).get('quality') ?? (matchMedia('(max-width: 720px)').matches ? 'mobile' : 'high');
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.25));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 2; controls.maxDistance = 70;

const equipment = new Map(siteData.resources.equipment.map((e) => [e.id, e]));
const stage = createStage({ renderer, scene, layout: siteData.layout, equipment, quality });

const VIEWS = {
  dining: () => { const f = stage.focus.dining(); return [new THREE.Vector3(f.x + 3, 6.5, f.z - 9), f]; },
  kitchen: () => { const f = stage.focus.kitchen(); return [new THREE.Vector3(f.x - 2, 13, f.z + 14), f]; },
  window: () => { const f = stage.focus.kitchen(); return [new THREE.Vector3(f.x + 3, 3.1, f.z + 11), new THREE.Vector3(f.x, 1.0, f.z - 1)]; },
  all: () => { const f = stage.focus.all(); return [new THREE.Vector3(f.x, 26, f.z + 22), f]; },
};
let fly = null;
function view(name, instant = false) {
  const [pos, target] = VIEWS[name]();
  if (instant) { camera.position.copy(pos); controls.target.copy(target); return; }
  fly = { start: performance.now(), p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target };
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}

// ---------------------------------------------------------------------------------- compile + sim
let compiled = compileStudio(state, base);
let sim = null;
let dash = null;
const baselineCache = new Map();

function baseline(season) {
  if (!baselineCache.has(season)) {
    const c = compileStudio(defaultStudio(base, { season }), base);
    baselineCache.set(season, runHeadless(c.data, c.cfg));
  }
  return baselineCache.get(season);
}

const baselineSummaries = new Map();
function baselineSummary(season) {
  if (!baselineSummaries.has(season)) baselineSummaries.set(season, compileStudio(defaultStudio(base, { season }), base).summary);
  return baselineSummaries.get(season);
}

function rebuildSim() {
  const wasPlaying = sim?.playing; const t = sim?.t;
  sim = createSim({ data: compiled.data, ...compiled.cfg });
  sim.setSpeed(+speedSel.value);
  sim.seek(t != null ? Math.min(Math.max(t, sim.start), sim.end) : compiled.cfg.doorsOpen + 2.5 * 3600);
  if (wasPlaying) sim.play();
  scrub.min = sim.start; scrub.max = sim.end;
  paintSim(true);
}

// ------------------------------------------------------------------------------------ impact
const impactEl = document.getElementById('impact');
const fmtClock = (s) => { const m = Math.round(s / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

function renderImpact() {
  const run = runHeadless(compiled.data, compiled.cfg);
  const b = baseline(state.season);
  const s = compiled.summary;
  const bs = baselineSummary(state.season);
  const card = (label, v, bv, fmt, better, hint = '') => {
    const d = v - bv; const flat = Math.abs(d) < 1e-6 || better === 0;
    const good = !flat && d * better > 0;
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    const delta = flat ? '' : `<span class="${good ? 'good' : 'bad'}">${sign}${fmt(Math.abs(d)).replace(/^\$/, '$')}</span>`;
    return `<div class="kpi"><small>${label}</small><b>${fmt(v)}</b>${delta}${hint ? `<em>${hint}</em>` : ''}</div>`;
  };
  const waiting = run.covers.booked - run.covers.finished - run.covers.noShows - (run.guests?.balked ?? 0);
  impactEl.innerHTML = `
    <header><b>Tonight's service</b><span>${run.covers.finished} of ${run.covers.booked} guests served · vs the house ${SEASON_LABEL[state.season].toLowerCase()} setup</span></header>
    <div class="kpis">
      ${card('Kitchen closes', run.endT, b.endT, fmtClock, -1)}
      ${card('Ticket time p90', run.kpis.ticketP90, b.kpis.ticketP90, mmss, -1, 'fire to pass')}
      ${card('Course gap p90', run.kpis.guestWaitP90, b.kpis.guestWaitP90, mmss, -1, 'guest waits between courses')}
      ${card('Table wait p90', run.guests?.tableWaitP90 ?? 0, b.guests?.tableWaitP90 ?? 0, mmss, -1, 'arrival to seat')}
      ${card('Walked away', run.guests?.balked ?? 0, b.guests?.balked ?? 0, (v) => String(Math.round(v)), -1, run.guests?.lostRevenue ? `${usd(run.guests.lostRevenue)} lost` : 'guests')}
      ${card('Line utilization', run.kpis.lineUtil, b.kpis.lineUtil, pct, 0)}
      ${card('Avg OEE', avgOee(run), avgOee(b), pct, 1)}
      ${card('Stockouts', run.kpis.stockoutCount, b.kpis.stockoutCount, (v) => String(Math.round(v)), -1, "86'd dishes")}
      ${card('Revenue', s.revenueUSD - (run.guests?.lostRevenue ?? 0), bs.revenueUSD - (b.guests?.lostRevenue ?? 0), usd, 1)}
      ${card('Food cost', s.foodCostPct, bs.foodCostPct, pct, -1, 'of the check')}
    </div>
    <p class="why">${run.guests?.balked ? `<b class="bad">${run.guests.balked} guests gave up waiting for a table.</b> ` : ''}${waiting > 0 ? `<b class="bad">${waiting} guests were still waiting at close.</b> ` : ''}${run.kpis.bottleneck?.text ? `Bottleneck: ${run.kpis.bottleneck.text}` : ''}</p>
    ${compiled.warnings.length ? `<p class="warn">${compiled.warnings.join(' ')}</p>` : ''}`;
}

// ------------------------------------------------------------------------------------ timeline
const clockEl = document.getElementById('clock');
const playBtn = document.getElementById('play');
const scrub = document.getElementById('scrub');
const speedSel = document.getElementById('speed');
const roomEl = document.getElementById('room');
let lastPaint = 0;
function paintSim(force = false) {
  const now = performance.now();
  if (!force && now - lastPaint < 120) return;
  lastPaint = now;
  const st = sim.state;
  stage.setGuests(st.tables);
  clockEl.textContent = fmtClock(sim.t);
  if (document.activeElement !== scrub) scrub.value = sim.t;
  playBtn.textContent = sim.playing ? 'Pause' : 'Play';
  const seated = st.tables.filter((t) => t.state === 'seated').reduce((s, t) => s + t.size, 0);
  roomEl.textContent = `${seated} guests seated · ${st.covers.finished} served · ${st.covers.waiting ?? 0} waiting`;
  dash?.update();
}
playBtn.onclick = () => { sim.playing ? sim.pause() : sim.play(); paintSim(true); };
scrub.oninput = () => { sim.seek(+scrub.value); paintSim(true); };
speedSel.onchange = () => sim.setSpeed(+speedSel.value);

// ----------------------------------------------------------------------------------- dashboard
const sheet = document.getElementById('sheet');
document.getElementById('open-dash').onclick = () => {
  sheet.hidden = false;
  dash = mountDashboard(sheet.querySelector('[data-dash]'), sim);
  dash.start();
};
document.getElementById('close-dash').onclick = () => { dash?.stop(); dash = null; sheet.hidden = true; sheet.querySelector('[data-dash]').innerHTML = ''; };

// --------------------------------------------------------------------------------------- panel
let diningSig = '';
const sigOf = (s) => JSON.stringify(s.dining.tables.map((t) => [t.seats, t.shape]));
function applyVisuals() {
  const sig = sigOf(state);
  if (sig !== diningSig) { stage.setDining(state.dining.tables); diningSig = sig; }
  stage.applyLook(computeLook(state.look, state.season));
  document.documentElement.dataset.season = state.season;
}

let recompileTimer = 0;
function scheduleRecompile() {
  clearTimeout(recompileTimer);
  recompileTimer = setTimeout(() => {
    compiled = compileStudio(state, base);
    panel.setSummary(compiled.summary);
    if (dash) { dash.stop(); sheet.querySelector('[data-dash]').innerHTML = ''; }
    rebuildSim();
    if (dash) { dash = mountDashboard(sheet.querySelector('[data-dash]'), sim); dash.start(); }
    renderImpact();
    history.replaceState(null, '', `#s=${encodeStudio(state)}`);
  }, 300);
}

const panel = mountStudioPanel(document.getElementById('panel'), {
  base, state,
  onChange(next, { what }) {
    state = next;
    applyVisuals();
    if (what !== 'look') scheduleRecompile();
    else history.replaceState(null, '', `#s=${encodeStudio(state)}`);
  },
});

document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => view(b.dataset.view); });
document.getElementById('share').onclick = async (e) => {
  try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Link copied'; } catch { e.target.textContent = 'Copy the address bar'; }
  setTimeout(() => { e.target.textContent = 'Share this setup'; }, 1800);
};
document.getElementById('reset').onclick = () => {
  state = defaultStudio(base, { season: state.season }); panel.setState(state); applyVisuals(); scheduleRecompile();
};
window.addEventListener('hashchange', () => { const s = hashState(); if (s) { state = s; panel.setState(s); applyVisuals(); scheduleRecompile(); } });

// ------------------------------------------------------------------------------------------ go
applyVisuals();
panel.setSummary(compiled.summary);
rebuildSim();
view('dining', true);
document.querySelector('[data-view="dining"]').classList.add('on');
setTimeout(renderImpact, 50);

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();

const clock = new THREE.Timer();
renderer.setAnimationLoop(() => {
  clock.update(); const dt = Math.min(0.1, clock.getDelta());
  if (fly) {
    const u = Math.min(1, (performance.now() - fly.start) / 1400); const k = u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k);
    if (u >= 1) fly = null;
  }
  if (!dash && sim.playing) sim.tick(dt); // the dashboard drives the clock while it is open
  if (sim.playing || dash) paintSim();
  stage.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

window.kitchenStudio = { get state() { return state; }, get compiled() { return compiled; }, get sim() { return sim; }, stage, renderer, scene, camera, mixOf };
