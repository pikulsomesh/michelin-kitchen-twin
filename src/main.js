// The site: a photoreal 3D twin of The French Laundry's kitchen (src/scene)
// driven by the dinner-service simulation (src/sim), with the live
// operations dashboard (src/dashboard) and the production plan (src/panel.js)
// in a drawer. The sim owns the clock; the scene mirrors it every frame.
import { data } from './data.js';
import { buildIndex } from './model/mrp.js';
import { renderPanel, showEquipment } from './panel.js';
import { adaptKitchenData } from './sim/adapter.js';
import { createSim } from './sim/sim.js';
import { forecastCache } from './sim/precomputed.js';
import { leversFromQuery, leversToQuery } from './sim/optimize.js';
import { mountDashboard } from './dashboard/dashboard.js';
import { createKitchenScene } from './scene/index.js';
import { bindSim } from './scene/bind.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const q = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem(`twin.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`twin.${k}`, v); } catch { /* private mode */ } },
};
const SPEEDS = [1, 5, 15, 30, 60, 120, 300];

// ------------------------------------------------------------ simulation
const index = buildIndex(data);
const simData = adaptKitchenData(data);
const sim = createSim({ data: simData, cache: forecastCache(simData), ...(q.get('covers') ? { covers: +q.get('covers') } : {}), ...(q.get('seating') ? { seating: q.get('seating') } : {}), seed: +q.get('seed') || 1, ...leversFromQuery(q) });
sim.setSpeed(+q.get('speed') || 30);
sim.seek(q.get('t') ? sim.config.doorsOpen + 3600 * +q.get('t') : sim.config.doorsOpen - 600);

// ------------------------------------------------------------ 3D twin
const twin = await createKitchenScene($('#twin'), {
  data,
  quality: q.get('quality') || store.get('quality') || 'auto',
  labels: 'stations',
});
window.kitchenTwin = { twin, sim };
const binding = bindSim(twin, sim);

// ------------------------------------------------------------ dashboard + plan
let drawerOpen = false;
const dash = mountDashboard($('#dashboard'), sim, {
  onSelect(sel) {
    if (!sel) { twin.highlight([]); return; }
    twin.highlight([sel.id]);
    if (sel.type !== 'ingredient') twin.flyTo(sel.id);
    if (sel.type === 'appliance') showEquipment(index, sel.id);
  },
});
renderPanel(index, $('#panel'));

twin.on('select', (pick) => {
  if (!pick) { twin.highlight([]); showEquipment(index, null); return; }
  twin.highlight([pick.id]);
  if (pick.type === 'appliance') { showEquipment(index, pick.id); dash.select({ type: 'appliance', id: pick.id }); }
  if (pick.type === 'ingredient') dash.select({ type: 'ingredient', id: pick.id });
});

// ------------------------------------------------------------ frame loop: the sim owns the clock
let hudT = 0, dashT = 0;
twin.onFrame((dt) => {
  sim.tick(dt);
  binding.update(dt);
  hudT += dt; dashT += dt;
  if (hudT > 0.25) { hudT = 0; renderHud(); }
  if (drawerOpen && dashT > 0.1) { dashT = 0; dash.update(); }
});

// ------------------------------------------------------------ HUD
const fmtClock = (t) => { const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const speedSel = $('[data-speed]');
speedSel.innerHTML = SPEEDS.map((s) => `<option value="${s}">${s}×</option>`).join('');
speedSel.value = String(SPEEDS.includes(sim.speed) ? sim.speed : 30);
speedSel.onchange = () => sim.setSpeed(+speedSel.value);
function renderHud() {
  const st = sim.state;
  $('[data-clock]').textContent = fmtClock(st.t);
  const ph = $('[data-phase]');
  ph.textContent = st.phase;
  ph.className = `pill ${st.phase}${sim.playing ? ' live' : ''}`;
  const k = st.kpis || {};
  const open = st.tickets.filter((x) => !x.passed).length;
  $('[data-stats]').innerHTML = [
    ['Covers', `${st.covers.seated}<small>/${st.covers.booked}</small>`],
    ['On the rail', open],
    ['Ticket p90', k.ticketP90 ? `${Math.round(k.ticketP90 / 60)}<small>m</small>` : '–'],
    ['Constraint', k.bottleneck?.key ? esc(constraintName(k.bottleneck.key)) : 'none'],
  ].map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('');
  $('[data-act="play"]').textContent = sim.playing ? '❚❚' : '▶';
}
// Bottleneck keys look like "role:cdp-garde-manger" or "appliance:EQ-COMBI-KITCHEN"; show the data's own name.
const constraintName = (key) => {
  const id = key.replace(/^\w+:/, '');
  const hit = index.roles.get(id) ?? index.equipment.get(id) ?? index.workCenters.get(id);
  return hit?.name ?? id.replace(/^(EQ|WC|ST)-/, '').toLowerCase().replace(/-/g, ' ');
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------ dock
let labels = 'stations';
const caption = $('[data-caption]');
let captionTimer = 0;
const say = (text, ms = 3200) => {
  caption.textContent = text; caption.hidden = false;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => { caption.hidden = true; }, ms);
};
const actions = {
  play() { sim.playing ? sim.pause() : sim.play(); renderHud(); },
  tour() { twin.touring ? twin.stopTour() : twin.startTour(); },
  overview() { twin.overview(); },
  plate() { twin.followNextPlate(); say('Waiting for the next plate to leave a station…'); },
  labels() {
    labels = { stations: 'all', all: 'none', none: 'stations' }[labels];
    twin.setLabels(labels);
    say({ stations: 'Station labels', all: 'Station and machine labels', none: 'Labels off' }[labels], 1400);
  },
  usd() {
    const text = twin.exportUSD();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'model/vnd.usda' }));
    a.download = 'the-french-laundry-kitchen.usda';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say(`OpenUSD stage exported (${(text.length / 1e6).toFixed(1)} MB). Opens in NVIDIA Omniverse, Isaac Sim and usdview.`, 5000);
  },
  async share() {
    // ?covers&seating&seed&t (hours after doors open) reproduce this exact moment: the sim is deterministic.
    const c = sim.config;
    const p = leversToQuery(c, new URLSearchParams({ covers: c.covers, seating: c.seating, seed: c.seed, t: ((sim.t - c.doorsOpen) / 3600).toFixed(2), intro: 0 }));
    const url = `${location.origin}${location.pathname}?${p}`;
    try { await navigator.clipboard.writeText(url); say('Link to this moment copied. It replays the same service, to the second.', 3000); }
    catch { prompt('Link to this moment', url); }
  },
  scenarios() {
    if (!drawerOpen) actions.drawer();
    $('[data-tab="ops"]').click();
    $('[data-panel="library"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  drawer() {
    drawerOpen = !drawerOpen;
    $('[data-drawer]').hidden = !drawerOpen;
    $('#app').classList.toggle('with-drawer', drawerOpen);
    if (drawerOpen) dash.update(true);
  },
};
$$('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));
$('[data-overlay]').onchange = (e) => twin.setOverlay(e.target.value);
const qualSel = $('[data-quality]');
const qualLabel = Object.fromEntries(twin.qualityTiers.map((t) => [t.id, t.label]));
const paintQuality = () => {
  qualSel.innerHTML = `<option value="auto">Auto${twin.autoQuality ? ` (${qualLabel[twin.quality]})` : ''}</option>`
    + twin.qualityTiers.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  qualSel.value = twin.autoQuality ? 'auto' : twin.quality;
};
paintQuality();
qualSel.onchange = () => {
  twin.setQuality(qualSel.value);
  store.set('quality', qualSel.value);
  if (qualSel.value === 'ultra') say('Pro Max is for stills: hold the camera still and the frame refines into a soft-shadowed, supersampled image. Use High or lower to move around.', 5000);
  if (qualSel.value === 'mobile') say('Low: for phones and older laptops. Same look, fewer pixels, so it stays smooth.', 3200);
};
twin.on('quality', (e) => {
  paintQuality();
  if (e.steppedDown) say(`Running slow here, so Auto switched to ${qualLabel[e.quality]}. Pick a level in the quality menu to keep one.`, 4500);
});
twin.on('tour', (e) => {
  $('[data-act="tour"]').classList.toggle('on', !!e.playing);
  if (e.shot) say(e.shot, 2600);
});
twin.on('follow', (e) => {
  if (e.done) say('Served.', 1600);
  else say('Following a plate to the pass and out to the dining room.', 2600);
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); actions.play(); }
  if (e.key === 't') actions.tour();
  if (e.key === 'o') actions.overview();
  if (e.key === 'f') actions.plate();
});

// A re-plan from the dashboard (covers, seating, seed) is kept in the address bar.
sim.on('reset', ({ config }) => {
  const p = new URLSearchParams(location.search);
  p.set('covers', config.covers); p.set('seating', config.seating); p.set('seed', config.seed); p.delete('t'); leversToQuery(config, p);
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
});

// ------------------------------------------------------------ opening
if (q.get('play') !== '0') sim.play();
renderHud();
$('[data-loading]').classList.add('done');
setTimeout(() => $('[data-loading]').remove(), 900);
if (q.get('intro') !== '0') twin.intro({ seconds: 11 }).then((ok) => { if (ok) say('Dinner service · The French Laundry, Yountville', 3500); });
