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
import { createSiteTour } from './site-tour.js';
import { mountTraceCard } from './trace.js';

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
const trace = mountTraceCard($('[data-trace]'), sim, { onFly: (id) => { twin.highlight([id]); twin.flyTo(id); } });
// Open the genealogy card for a 3D plate (the one being followed, or one that was clicked).
const tracePlate = (itemId) => { const m = binding.plateOf(itemId); if (m) trace.show(m.ticket, m.dish); };

// ------------------------------------------------------------ dashboard + plan
// The operations drawer is closed, split (beside the 3D twin) or full (metrics only).
let lastOpsMode = store.get('ops') === 'full' ? 'full' : 'split';
let drawerOpen = false;
const dash = mountDashboard($('#dashboard'), sim, {
  onSelect(sel) {
    if (!sel) { twin.highlight([]); return; }
    twin.highlight([sel.id]);
    if (sel.type !== 'ingredient') twin.flyTo(sel.id);
    if (sel.type === 'appliance') showEquipment(index, sel.id);
    if (sel.ticket && sel.dish) trace.show(sel.ticket, sel.dish);
    // From the metrics-only view, open the 3D twin beside it so the camera move is visible.
    if (sel.from === 'gantt' && $('#app').classList.contains('ops-full')) setOps('split', false);
  },
});
renderPanel(index, $('#panel'));

twin.on('select', (pick) => {
  if (!pick) { twin.highlight([]); showEquipment(index, null); return; }
  twin.highlight([pick.id]);
  if (pick.type === 'appliance') { showEquipment(index, pick.id); dash.select({ type: 'appliance', id: pick.id }); }
  if (pick.type === 'ingredient') dash.select({ type: 'ingredient', id: pick.id });
  if (pick.type === 'item' && binding.plateOf(pick.id)) { twin.follow(pick.id); tracePlate(pick.id); }
});

// ------------------------------------------------------------ frame loop: the sim owns the clock
let hudT = 0, dashT = 0;
twin.onFrame((dt) => {
  sim.tick(dt);
  binding.update(dt);
  hudT += dt; dashT += dt;
  if (hudT > 0.25) { hudT = 0; renderHud(); }
  if (drawerOpen && dashT > 0.1) { dashT = 0; dash.update(); }
  story.tick();
  trace.tick(dt);
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

// ------------------------------------------------------------ dock, sidebar and operations layout
let labels = 'stations';
const labelSel = $('[data-labels]');
const setLabels = (v) => { labels = v; labelSel.value = v; twin.setLabels(v); };
const overlaySel = $('[data-overlay]');
const setOverlay = (v) => { overlaySel.value = v; twin.setOverlay(v); };
function setOps(mode, remember = true) {
  if (mode !== 'closed' && remember) { lastOpsMode = mode; store.set('ops', mode); }
  const was = drawerOpen;
  drawerOpen = mode !== 'closed';
  $('[data-drawer]').hidden = !drawerOpen;
  $('#app').classList.toggle('with-drawer', mode === 'split');
  $('#app').classList.toggle('ops-full', mode === 'full');
  $$('[data-opsview]').forEach((b) => b.classList.toggle('on', b.dataset.opsview === mode));
  $$('[data-act="drawer"]').forEach((b) => b.classList.toggle('on', drawerOpen));
  if (drawerOpen && !was) { hideHero(); dash.update(true); }
}
// Factory vocabulary in the dashboard, flipped by the site tour.
const setTerms = (factory) => $(`#dashboard [data-terms="${factory ? 1 : 0}"]`)?.click();
// Scroll the drawer to a dashboard panel (by its data-term), below the dashboard's sticky top bar.
const dashPanel = (term) => {
  const body = $('.drawer-body');
  const el = term && $(`#dashboard [data-term="${term}"]`)?.closest('.panel');
  const bar = $('#dashboard .topbar')?.offsetHeight ?? 0;
  const top = el ? el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - bar - 8 : 0;
  // An eased scroll of our own: native smooth scrolling can stall while the 3D scene keeps the main thread busy.
  const from = body.scrollTop, t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 700);
    body.scrollTop = from + (top - from) * (1 - (1 - k) ** 3);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const side = $('[data-side]');
const setMenu = (open) => {
  side.hidden = !open;
  $('#app').classList.toggle('with-side', open);
  $('[data-act="menu"]').setAttribute('aria-expanded', String(open));
};
const hero = $('[data-hero]');
const hideHero = () => { if (!hero.hidden) { hero.hidden = true; store.set('hero', '1'); } };
const story = createSiteTour($('[data-story]'), { twin, sim, ops: (m) => setOps(m, false), dashPanel, terms: setTerms, overlay: setOverlay, labels: setLabels });
story.onChange((on) => { $$('[data-act="site"]').forEach((b) => b.classList.toggle('on', on)); if (!on) setOps('closed'); });
const caption = $('[data-caption]');
let captionTimer = 0;
const say = (text, ms = 3200) => {
  caption.textContent = text; caption.hidden = false;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => { caption.hidden = true; }, ms);
};
const actions = {
  play() { sim.playing ? sim.pause() : sim.play(); renderHud(); },
  menu() { hideHero(); setMenu(side.hidden); },
  site() { hideHero(); setMenu(false); story.active ? story.stop() : story.start(); },
  tour() { hideHero(); setMenu(false); story.stop(); twin.touring ? twin.stopTour() : twin.startTour(); },
  overview() { setMenu(false); story.stop(); twin.overview(); },
  plate() { hideHero(); setMenu(false); story.stop(); twin.followNextPlate(); say('Waiting for the next plate to leave a station…'); },
  'hero-close'() { hideHero(); },
  labels() {
    setLabels({ stations: 'all', all: 'none', none: 'stations' }[labels]);
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
    setMenu(false); story.stop();
    if (!drawerOpen) setOps(lastOpsMode);
    $('[data-tab="ops"]').click();
    dashPanel('library');
  },
  drawer() { const open = drawerOpen; story.stop(); setOps(open ? 'closed' : lastOpsMode); },
  'ops-split'() { setMenu(false); story.stop(); setOps('split'); $('[data-tab="ops"]').click(); },
  'ops-full'() { setMenu(false); story.stop(); setOps('full'); $('[data-tab="ops"]').click(); },
};
// The dashboard binds its own [data-act] buttons; only the site chrome's are ours.
$$('[data-act]').filter((b) => !b.closest('#dashboard')).forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]?.()));
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));
overlaySel.onchange = () => setOverlay(overlaySel.value);
labelSel.onchange = () => setLabels(labelSel.value);
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
  $$('[data-act="tour"]').forEach((b) => b.classList.toggle('on', !!e.playing));
  if (e.shot && !story.active) say(e.shot, 2600);
});
twin.on('follow', (e) => {
  if (e.done) say('Served.', 1600);
  else { tracePlate(e.id); if (!story.active) say('Following a plate to the pass and out to the dining room.', 2600); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); story.active ? story.togglePause() : actions.play(); }
  if (e.key === 'Escape') { if (!side.hidden) setMenu(false); else if (story.active) story.stop(); else if (trace.open) trace.hide(); else if (drawerOpen) setOps('closed'); }
  if (story.active && e.key === 'ArrowRight') story.next();
  if (story.active && e.key === 'ArrowLeft') story.prev();
  if (e.key === 's') actions.site();
  if (e.key === 'm') actions.menu();
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
// ?ops=split|full opens the dashboard; ?tour=site starts the site tour. A first visit lands on the opening
// shot and then offers the site tour.
if (q.get('ops') === 'split' || q.get('ops') === 'full') setOps(q.get('ops'));
if (q.get('tour') === 'site') story.start();
else if (q.get('intro') !== '0') {
  twin.intro({ seconds: 11 }).then((ok) => {
    if (!ok) return;
    if (store.get('hero') || story.active || drawerOpen) say('Dinner service · The French Laundry, Yountville', 3500);
    else hero.hidden = false;
  });
}
