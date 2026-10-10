// Studio page: shape the restaurant (dining room, menu, season, light) and watch the 3D stage and the
// dinner-service simulation follow. Every edit recompiles the KitchenData the sim runs, re-runs the
// service headlessly against the house baseline, and is kept in the URL so a setup is a shareable link.
import { data as siteData } from '../data.js';
import { createSim } from '../sim/sim.js';
import { runHeadless, avgOee } from '../sim/scenarios.js';
import { adaptKitchenData } from '../sim/adapter.js';
import { mountDashboard } from '../dashboard/dashboard.js';
import { defaultStudio, seasonForDate, encodeStudio, decodeStudio, mixOf } from './config.js';
import { compileStudio } from './compile.js';
import { computeLook } from './look.js';
import { createKitchenScene } from '../scene/index.js';
import { bindSim } from '../scene/bind.js';
import { createStage } from './stage.js';
import { mountStudioPanel } from './ui.js';
import { SEASON_LABEL } from './catalog.js';

// The simulation's KitchenData: the sourced French Laundry model in /data, adapted for the engine.
const base = adaptKitchenData(siteData);

const hashState = () => { const m = /[#&]s=([^&]+)/.exec(location.hash); return m ? decodeStudio(m[1], base) : null; };
let state = hashState() ?? defaultStudio(base, { season: seasonForDate() });

// ------------------------------------------------------------------------------------------ 3D
// The photoreal twin from src/scene renders the kitchen, garden and sky; the studio stage adds the
// dining room the viewer lays out, candlelight, guests and weather on top of it.
const params = new URLSearchParams(location.search);
const twin = await createKitchenScene(document.getElementById('stage'), { data: siteData, quality: params.get('quality') || 'auto', labels: 'none' });
const stage = createStage({ twin, layout: siteData.layout, quality: twin.quality });

const qualitySel = document.getElementById('quality');
const qualityLabel = Object.fromEntries(twin.qualityTiers.map((t) => [t.id, t.label]));
const paintQuality = () => {
  qualitySel.innerHTML = `<option value="auto">Auto${twin.autoQuality ? ` (${qualityLabel[twin.quality]})` : ''}</option>`
    + twin.qualityTiers.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  qualitySel.value = twin.autoQuality ? 'auto' : twin.quality;
};
paintQuality();
qualitySel.onchange = () => twin.setQuality(qualitySel.value);
twin.on('quality', paintQuality);

const v3 = (v) => [v.x, v.y, v.z];
const VIEWS = {
  dining: () => { const f = stage.focus.dining(); const w = -stage.extent.x0; return [[f.x + 3, 4 + 0.45 * w, f.z - 5 - 0.5 * w], [f.x, 0.6, f.z]]; },
  kitchen: () => { const f = stage.focus.kitchen(); return [[f.x - 2, 11, f.z + 12], [f.x, 0.8, f.z]]; },
  window: () => { const f = stage.focus.kitchen(); return [[f.x + 3, 2.6, f.z + 11], [f.x, 1.0, f.z - 1]]; },
  all: () => { const f = stage.focus.all(); const span = 17 - stage.extent.x0; return [[f.x, 6 + 0.75 * span, f.z + 6 + 0.7 * span], v3(f)]; },
};
function view(name, instant = false) {
  const [pos, target] = VIEWS[name]();
  twin.flyTo(pos, target, instant ? 0.01 : 1.4);
  twin.setLabels(name === 'kitchen' ? 'stations' : 'none');
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

let binding = null;
function rebuildSim() {
  const wasPlaying = sim?.playing; const t = sim?.t;
  binding?.dispose();
  sim = createSim({ data: compiled.data, ...compiled.cfg });
  binding = bindSim(twin, sim);
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

twin.onFrame((dt) => {
  dt = Math.min(0.1, dt);
  if (!dash && sim.playing) sim.tick(dt); // the dashboard drives the clock while it is open
  binding.update(dt);
  if (sim.playing || dash) paintSim();
  stage.update(dt);
});

window.kitchenStudio = { get state() { return state; }, get compiled() { return compiled; }, get sim() { return sim; }, twin, stage, mixOf };
