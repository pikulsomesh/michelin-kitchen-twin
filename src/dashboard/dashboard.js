// Live operations dashboard for the kitchen digital twin. Pure DOM + canvas, no dependencies.
// Usage: const dash = mountDashboard(el, sim, { onSelect }); dash.start();   // or call dash.update() from your own loop
import { C, fit, lineChart, nearest, barRows, hhmm, mmss } from './charts.js';
import { TERMS } from './terms.js';
import { mountPlan, drawGuestLine } from './plan.js';
import { mountOptimizer } from './optimizer.js';
import { scenariosFor, runHeadless, compare, capacitySweep, shiftReportCSV, avgOee } from '../sim/scenarios.js';

const SPEEDS = [1, 10, 60, 300, 900, 2400];
const pctf = (v) => `${Math.round(v * 100)}%`;
const usd = (v) => `$${Math.round(v).toLocaleString()}`;
const FMT = { clock: (v) => hhmm(v), dur: (v) => mmss(v), pct: (v) => pctf(v), int: (v) => String(Math.round(v)), usd };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GROUP_COLOR = { start: C.blue, main: C.orange, finish: C.magenta, prep: C.aqua, wash: C.violet };

const TEMPLATE = `
<div class="dash">
  <header class="topbar">
    <div class="brand"><span class="mark">◆</span><div><b>Kitchen Twin</b><small data-sub>Dinner-service simulation</small></div></div>
    <div class="clockbox"><div class="clock" data-clock>--:--:--</div><span class="pill" data-phase>idle</span></div>
    <div class="transport">
      <button class="btn" data-act="doors" title="Jump to doors-open">⏮ doors</button>
      <button class="btn primary" data-act="play" aria-label="Play or pause">▶ Play</button>
      <button class="btn" data-act="step" title="Advance 5 minutes">+5 min</button>
      <label class="sel">Speed <select data-speed></select></label>
    </div>
    <div class="scrub"><input type="range" data-scrub min="0" max="1" step="30" aria-label="Timeline scrubber"><div class="phases" data-phases></div></div>
    <div class="plan">
      <label>Covers <input type="number" data-covers min="2" max="240" step="2"></label>
      <label>Seating <select data-seating><option value="twoTurn">Two turns</option><option value="bell">Single wave</option><option value="rush">Rush</option></select></label>
      <label>Seed <input type="number" data-seed min="1" max="9999"></label>
      <button class="btn" data-act="replan">Re-plan</button>
      <div class="seg" role="group" aria-label="Terminology"><button data-terms="0" class="on">Kitchen</button><button data-terms="1">Factory</button></div>
    </div>
  </header>

  <section class="kpis" data-kpis></section>
  <section class="banner" data-banner></section>

  <main class="grid">
    <article class="panel wide"><h2 data-term="floor">The kitchen, live</h2>
      <canvas class="floor" data-floor></canvas><div class="legend" data-floor-legend></div></article>

    <article class="panel"><h2 data-term="tickets">Ticket rail</h2><div class="rail" data-rail></div></article>

    <article class="panel"><h2 data-term="throughputChart">Plates out & tickets in flight</h2>
      <canvas class="ch" data-ch-thru></canvas><canvas class="ch" data-ch-wip></canvas>
      <div class="legend"><i style="background:${C.aqua}"></i>Plates / hour (15-min rolling) <i style="background:${C.blue}"></i>Open tickets <i style="background:${C.orange}"></i>Tasks queued</div></article>

    <article class="panel"><h2 data-term="ticketChart">Ticket time by course</h2><canvas class="ch tall" data-ch-course></canvas>
      <div class="legend"><i style="background:${C.blue}"></i>p50 <i style="background:${C.orange}"></i>p90 <span class="muted">dashed = 15 min target</span></div></article>

    <article class="panel wide"><h2><span data-term="gantt">Station Gantt</span>
      <span class="seg small" role="group"><button data-gantt="cooks" class="on">Cooks</button><button data-gantt="machines">Machines</button></span></h2>
      <canvas class="gantt" data-gantt-cv></canvas>
      <div class="legend"><i style="background:${C.blue}"></i>Courses 1–3 <i style="background:${C.orange}"></i>Courses 4–7 <i style="background:${C.magenta}"></i>Courses 8–10 <i style="background:${C.aqua}"></i>Prep <i style="background:${C.violet}"></i>Pot wash <span class="muted">last 75 min · hands-on time</span></div></article>

    <article class="panel"><h2 data-term="inventory">Inventory</h2>
      <div class="tools"><span class="seg small"><button data-inv="service" class="on">Service stock</button><button data-inv="raw">Pantry</button></span><span class="muted" data-inv-note></span></div>
      <div class="scroll tall"><table class="t" data-inv-table></table></div></article>

    <article class="panel"><h2 data-term="equipment">Appliances</h2>
      <div class="scroll tall"><table class="t" data-oee-table></table></div>
      <div class="legend muted">OEE = Availability × Performance × Quality · load = busy share, last 15 min</div></article>

    <article class="panel"><h2 data-term="labor">Brigade</h2><canvas class="ch tall" data-ch-labor></canvas>
      <div class="legend muted">Utilization by station, last 15 min (cooks on shift)</div></article>

    <article class="panel wide"><h2 data-term="plan">Plan the night</h2><div data-plan></div></article>

    <article class="panel wide"><h2 data-term="guestLine">Guests: the dining-room line</h2>
      <div class="mtiles" data-gl-tiles></div>
      <div class="two"><div><canvas class="ch tall" data-gl-flow></canvas><div class="legend"><i style="background:${C.blue}"></i>In the house <i style="background:${C.orange}"></i>Waiting for a table <i style="background:${C.crit}"></i>Walked away</div></div>
      <div><canvas class="ch tall" data-gl-gap></canvas><div class="legend"><i style="background:${C.blue}"></i>Average wait between courses <i style="background:${C.orange}"></i>p90 <span class="muted">dashed = target</span></div></div></div></article>

    <article class="panel wide" data-panel="library"><h2 data-term="library">Service scenarios & optimizer</h2><div data-library></div></article>

    <article class="panel wide"><h2 data-term="whatif">What if…</h2>
      <div class="scen" data-scen></div>
      <div class="scen-out" data-scen-out><p class="muted">Pick a scenario. It re-runs the whole service from the same seed and shows the before/after on every KPI.</p></div></article>

    <article class="panel"><h2 data-term="capacity">Rated capacity</h2>
      <div class="tools"><button class="btn" data-act="sweep">Sweep 20 → 200 covers</button><span class="muted" data-sweep-note></span></div>
      <canvas class="ch tall" data-ch-cap></canvas></article>

    <article class="panel"><h2 data-term="mrp">Mise en place & ordering</h2>
      <div class="scroll tall"><table class="t" data-mrp-table></table></div>
      <div class="tools"><button class="btn" data-act="report" data-term="report">Shift report (CSV)</button></div></article>

    <article class="panel wide"><h2 data-term="log">Kitchen log</h2><div class="log" data-log></div></article>
  </main>
  <div class="tip" data-tip hidden></div>
</div>`;

export function mountDashboard(root, sim, opts = {}) {
  root.innerHTML = TEMPLATE;
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  // view['[data-x]'] = markup: like innerHTML, but skipped when the markup is
  // the same as last time, which it mostly is between ~9 Hz live updates.
  const view = new Proxy({}, { set(_, sel, markup) { const el = $(sel); if (el.__markup !== markup) { el.innerHTML = markup; el.__markup = markup; } return true; } });
  const data = sim.data;
  const SCENARIOS = scenariosFor(data);
  const stationName = Object.fromEntries(data.stations.map((s) => [s.id, s.name.replace(/ \(.*\)/, '')]));
  const STATION_LABEL = new Proxy(stationName, { get: (o, k) => o[k] ?? String(k) });
  const ncourse = data.courses.length;
  const COURSE_GROUP = (idx) => { const f = (idx ?? 0) / ncourse; return f < 0.3 ? 'start' : f < 0.75 ? 'main' : 'finish'; };
  const washRole = data.sim?.washRole ?? 'plonge', runRole = data.sim?.runnerRole ?? 'runner';
  const state = { factory: false, gantt: 'cooks', inv: 'service', sel: null, scen: null, sweep: null, last: 0, tick: 0, hover: {}, ganttBars: [], floorHits: [] };
  const listeners = new Set();
  const emitSel = (s) => { state.sel = s; opts.onSelect?.(s); listeners.forEach((cb) => cb(s)); };

  // ---------------------------------------------------------------- controls
  const speedSel = $('[data-speed]');
  speedSel.innerHTML = SPEEDS.map((s) => `<option value="${s}">${s}×</option>`).join('');
  speedSel.value = String(sim.speed); if (!SPEEDS.includes(sim.speed)) { speedSel.insertAdjacentHTML('beforeend', `<option value="${sim.speed}">${sim.speed}×</option>`); speedSel.value = String(sim.speed); }
  speedSel.onchange = () => sim.setSpeed(+speedSel.value);
  const scrub = $('[data-scrub]');
  const syncRange = () => { scrub.min = sim.start; scrub.max = sim.end; };
  scrub.oninput = () => { sim.seek(+scrub.value); state.last = 0; update(true); };
  const doorsT = () => sim.config.doorsOpen - 600;
  const act = {
    play() { sim.playing ? sim.pause() : sim.play(); },
    doors() { sim.seek(doorsT()); update(true); },
    step() { sim.step(300); update(true); },
    replan() {
      sim.reset({ covers: +$('[data-covers]').value || 60, seating: $('[data-seating]').value, seed: +$('[data-seed]').value || 1 });
      syncRange(); sim.seek(doorsT()); state.scen = null; state.sweep = null; renderScen(); sim.play(); update(true);
    },
    report() {
      const csv = shiftReportCSV(sim.state, data); const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'shift-report.csv'; a.click();
    },
    async sweep() {
      const note = $('[data-sweep-note]'); note.textContent = 'running…';
      state.sweep = { points: [], knee: null };
      const res = await capacitySweep(data, sim.config, [20, 40, 60, 80, 100, 120, 160, 200], (p, all) => { state.sweep = { points: all, knee: null }; drawCap(); });
      state.sweep = res; note.textContent = res.knee ? `Rated capacity ≈ ${res.knee} covers` : 'No knee found up to 200 covers'; drawCap();
    },
  };
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act[b.dataset.act]()));
  $$('[data-terms]').forEach((b) => b.addEventListener('click', () => {
    state.factory = b.dataset.terms === '1'; $$('[data-terms]').forEach((x) => x.classList.toggle('on', x === b)); applyTerms(); update(true);
  }));
  $$('[data-gantt]').forEach((b) => b.addEventListener('click', () => { state.gantt = b.dataset.gantt; $$('[data-gantt]').forEach((x) => x.classList.toggle('on', x === b)); drawGantt(sim.state); }));
  $$('[data-inv]').forEach((b) => b.addEventListener('click', () => { state.inv = b.dataset.inv; $$('[data-inv]').forEach((x) => x.classList.toggle('on', x === b)); state.lastHeavy = 0; update(true); }));
  root.addEventListener('keydown', (e) => { if (e.target.matches('input,select')) return; if (e.code === 'Space') { e.preventDefault(); act.play(); } });
  function applyTerms() {
    $$('[data-term]').forEach((el) => { const t = TERMS[el.dataset.term]; if (t) el.textContent = t[state.factory ? 1 : 0]; });
    $('[data-sub]').textContent = state.factory ? 'Discrete-event production twin' : 'Dinner-service simulation';
  }
  const seatOpts = (data.seatingScenarios || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if (seatOpts) $('[data-seating]').innerHTML = seatOpts;
  const syncPlan = () => { $('[data-covers]').value = sim.config.covers; $('[data-seating]').value = sim.config.seating; $('[data-seed]').value = sim.config.seed; };

  // ---------------------------------------------------------------- tooltip
  const tip = $('[data-tip]');
  const showTip = (e, html) => { tip.hidden = false; tip.innerHTML = html; const r = root.getBoundingClientRect(); tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 260)}px`; tip.style.top = `${e.clientY - r.top + 14}px`; };
  const hideTip = () => { tip.hidden = true; };

  // ---------------------------------------------------------------- scenarios
  function renderScen() {
    const stations = data.stations.filter((x) => ['poisson', 'meat', 'saucier', 'garde_manger', 'pastry'].includes(x.id)).map((x) => x.id);
    $('[data-scen]').innerHTML = SCENARIOS.map((s) => `<button class="btn scn ${state.scen?.id === s.id ? 'on' : ''}" data-scn="${s.id}" title="${esc(s.blurb)}">${esc(s.label)}</button>`).join('')
      + (SCENARIOS.some((x) => x.param) ? `<label class="sel">Short-staffed at <select data-scn-station>${stations.map((s) => `<option value="${s}">${STATION_LABEL[s] || s}</option>`).join('')}</select></label>` : '');
    $$('[data-scn]').forEach((b) => b.addEventListener('click', () => runScenario(b.dataset.scn)));
  }
  function runScenario(id) {
    const sc = SCENARIOS.find((s) => s.id === id); const out = $('[data-scen-out]');
    out.innerHTML = `<p class="muted">Running “${esc(sc.label)}” from seed ${sim.config.seed}…</p>`;
    setTimeout(() => {
      const base = sim.forecast.snapshot; const station = $('[data-scn-station]')?.value;
      const patch = sc.apply(sim.config, data, station);
      const alt = runHeadless(data, { ...sim.config, ...patch });
      const rows = compare({ ...base, endT: sim.forecast.endT }, alt);
      state.scen = { id, patch, alt };
      renderScen();
      const glyph = { good: '▲ better', bad: '▼ worse', flat: '• same' };
      out.innerHTML = `<div class="scen-head"><b>${esc(sc.label)}</b> <span class="muted">${esc(sc.blurb)}</span> <button class="btn primary" data-apply>Run this on the live twin</button></div>
        <p class="why">${esc(alt.kpis.bottleneck.text)}</p>
        <table class="t cmp"><thead><tr><th>KPI</th><th>Baseline</th><th>Scenario</th><th>Change</th></tr></thead><tbody>${rows.map((r) => {
          const d = r.fmt === 'pct' ? `${r.delta >= 0 ? '+' : ''}${(r.delta * 100).toFixed(1)} pts` : r.fmt === 'clock' ? `${r.delta >= 0 ? '+' : '−'}${Math.floor(Math.abs(r.delta) / 3600)}h ${String(Math.round((Math.abs(r.delta) % 3600) / 60)).padStart(2, '0')}m` : r.fmt === 'dur' ? `${r.delta >= 0 ? '+' : '−'}${mmss(Math.abs(r.delta))}` : `${r.delta >= 0 ? '+' : ''}${FMT[r.fmt](r.delta)}`;
          return `<tr class="${r.verdict}"><td>${esc(r.label)}</td><td>${FMT[r.fmt](r.base)}</td><td>${FMT[r.fmt](r.alt)}</td><td class="v-${r.verdict}">${glyph[r.verdict].split(' ')[0]} ${d}</td></tr>`;
        }).join('')}</tbody></table>`;
      out.querySelector('[data-apply]').onclick = () => { sim.reset(patch); syncRange(); syncPlan(); sim.seek(doorsT()); sim.play(); update(true); };
    }, 20);
  }

  // ---------------------------------------------------------------- renderers
  function status(v, warn, crit, invert) {
    const bad = invert ? v < crit : v > crit, mid = invert ? v < warn : v > warn;
    return bad ? ['crit', '✕'] : mid ? ['warn', '▲'] : ['good', '✓'];
  }
  function renderKpis(st) {
    const k = st.kpis; const live = st.covers;
    const tiles = [
      ['covers', `${live.finished}<small>/${live.booked - live.noShows}</small>`, `${live.seated} seated · ${live.noShows} no-show${live.waiting ? ` · ${live.waiting} waiting for a table` : ''}`, ['good', '']],
      ['throughput', Math.round(k.throughputPortionsHr), `avg ${Math.round(k.avgPortionsHr)}/h · ${k.portionsServed} plates out`, ['good', '']],
      ['ticketTime', mmss(k.ticketP90), `avg ${mmss(k.ticketAvg)} · p95 ${mmss(k.ticketP95)}`, status(k.ticketP90, 900, 1500)],
      ['guestWait', mmss(k.guestWaitP90), `avg ${mmss(k.guestWaitAvg)} between courses`, status(k.guestWaitP90, 300, 600)],
      ['lineUtil', pctf(k.lineUtil), `${st.staff.filter((s) => s.state === 'working' || s.state === 'walking').length} of ${st.staff.filter((s) => s.state !== 'off').length} staff active`, status(k.lineUtil, 0.75, 0.9)],
      ['oee', pctf(avgOee(st)), `${st.appliances.filter((a) => !a.up).length} down · ${st.appliances.reduce((s, a) => s + a.failures, 0)} faults`, status(avgOee(st), 0.85, 0.7, true)],
      ['fpy', pctf(k.firstPassYield), `${k.defects} QC rejects · ${k.holdRejects} held too long`, status(k.firstPassYield, 0.97, 0.92, true)],
      ['foodCost', pctf(k.foodCostPct), `${usd(k.foodCost)} used · ${usd(k.wasteCost)} waste`, status(k.foodCostPct, 0.34, 0.42)],
      ['stockouts', k.stockoutCount, `${k.subs} swapped · ${k.comps} comped`, k.stockoutCount ? ['crit', '✕'] : ['good', '✓']],
      ['wip', k.wip, `${k.openTickets} tickets · ${k.queued} queued · peak ${k.peakWip}`, status(k.queued, 12, 30)],
    ];
    view['[data-kpis]'] = tiles.map(([key, val, sub, [lvl, glyph]]) =>
      `<div class="tile ${lvl}"><div class="lbl"><span data-term="${key}">${TERMS[key][state.factory ? 1 : 0]}</span><b class="g">${glyph}</b></div><div class="val">${val}</div><div class="sub">${sub}</div></div>`).join('');
  }
  function renderBanner(st) {
    const b = st.kpis.bottleneck;
    view['[data-banner]'] = `<span class="tag"><span data-term="bottleneck">${TERMS.bottleneck[state.factory ? 1 : 0]}</span></span><span class="txt">${esc(state.factory && b.factory && b.key ? b.text.replace(b.label, b.factory) : b.text)}</span>`
      + (st.prep.total && st.phase === 'prep' ? `<span class="prep">Prep ${st.prep.done}/${st.prep.total} batches</span>` : '');
  }

  function drawFloor(st) {
    const cv = $('[data-floor]'); const { ctx, w, h } = fit(cv);
    const stations = st.stations.filter((s) => s.id !== 'dining');
    const box = (s) => ({ w: s.w ? s.w * 0.86 : 2.7, d: s.d ? s.d * 0.86 : 1.95 });
    // world bounds: kitchen stations (map coordinates) + a dining room block to their west
    const minX = Math.min(...stations.map((s) => s.mapX - box(s).w / 2)), maxX = Math.max(...stations.map((s) => s.mapX + box(s).w / 2));
    const minY = Math.min(...stations.map((s) => s.mapY - box(s).d / 2)), maxY = Math.max(...stations.map((s) => s.mapY + box(s).d / 2));
    const dW = Math.max(12, (maxX - minX) * 0.8), dX0 = minX - dW - 1.2;
    const X0 = dX0 - 0.3, X1 = maxX + 0.3, Y0 = minY - 0.4, Y1 = maxY + 0.3;
    const sc = Math.min(w / (X1 - X0), h / (Y1 - Y0)); const ox = (w - sc * (X1 - X0)) / 2, oy = (h - sc * (Y1 - Y0)) / 2;
    const px = (x) => ox + (x - X0) * sc, py = (y) => oy + (y - Y0) * sc;
    state.floorHits = [];
    // dining room (left)
    ctx.fillStyle = '#141413'; ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px(dX0), py(Y0 + 0.1), sc * dW, sc * (Y1 - Y0 - 0.2), 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.fillText('DINING ROOM · GARDEN', px(dX0 + 0.3), py(Y0 + 0.6));
    const n = st.tables.length, aw = dW - 1.2, ah = Y1 - Y0 - 2.2;
    const cols = Math.max(3, Math.ceil(Math.sqrt((n * aw) / ah))), rows = Math.ceil(n / cols), cw = aw / cols, ch = ah / rows;
    st.tables.forEach((t, i) => {
      const cx = px(dX0 + 0.6 + cw * ((i % cols) + 0.5)), cy = py(Y0 + 1.5 + ch * (Math.floor(i / cols) + 0.5));
      const r = Math.min(cw, ch) * sc * (t.seats <= 2 ? 0.26 : t.seats <= 4 ? 0.34 : 0.42);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);
      ctx.fillStyle = t.state === 'seated' ? '#1d3a63' : t.state === 'dirty' ? '#4a3a0c' : '#202020'; ctx.fill();
      ctx.strokeStyle = t.state === 'seated' ? C.blue : t.state === 'dirty' ? C.yellow : C.axis; ctx.lineWidth = 1.5; ctx.stroke();
      if (t.state === 'seated' && t.course >= 0) { ctx.beginPath(); ctx.arc(cx, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + ((t.course + 1) / ncourse) * 6.283); ctx.strokeStyle = C.aqua; ctx.lineWidth = 2; ctx.stroke(); }
      if (r > 8) { ctx.fillStyle = C.ink2; ctx.textAlign = 'center'; ctx.font = '9px system-ui'; ctx.fillText(t.id.slice(1), cx, cy + 3); }
      state.floorHits.push({ x: cx, y: cy, r: r + 4, tip: `<b>${t.id}</b> · ${t.seats}-top<br>${t.state}${t.party ? ` · ${t.size} guests` : ''}${t.courseName ? `<br>Course ${t.course + 1}: ${esc(t.courseName)}` : ''}` });
    });
    // kitchen stations
    for (const s of stations) {
      const b = box(s); const bw = b.w * sc, bh = b.d * sc;
      const load = s.capacity ? s.active / s.capacity : 0; const cx = px(s.mapX), cy = py(s.mapY);
      ctx.fillStyle = '#171717'; ctx.strokeStyle = state.sel?.id === s.id ? C.ink : s.remote ? C.muted : C.axis; ctx.lineWidth = state.sel?.id === s.id ? 2 : 1;
      if (s.remote) ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 6); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.blue; ctx.globalAlpha = 0.18 + 0.6 * Math.min(1, load); ctx.fillRect(cx - bw / 2 + 2, cy + bh / 2 - 6, (bw - 4) * Math.min(1, load), 4); ctx.globalAlpha = 1;
      if (s.queue) { ctx.fillStyle = s.queue > 4 ? C.crit : C.warn; ctx.beginPath(); ctx.arc(cx + bw / 2 - 8, cy - bh / 2 + 8, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.queue, cx + bw / 2 - 8, cy - bh / 2 + 12); }
      ctx.fillStyle = C.ink2; ctx.font = '10px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${stationName[s.id] ?? s.name}${s.remote ? ' (annex)' : ''}`.slice(0, Math.max(6, Math.floor(bw / 6))), cx - bw / 2 + 5, cy - bh / 2 + 12);
      const ap = st.appliances.filter((a) => a.station === s.id && a.capacity < 99).slice(0, 10); const sz = Math.max(4, Math.min(11, (bw - 10) / Math.max(1, ap.length) - 2));
      ap.forEach((a, i) => { const ax = cx - bw / 2 + 5 + i * (sz + 2), ay = cy - 2; ctx.fillStyle = !a.up ? C.crit : a.inUse ? C.orange : '#2e2e2c'; ctx.fillRect(ax, ay, sz, sz); if (a.inUse && a.up) { ctx.fillStyle = C.yellow; ctx.fillRect(ax, ay + sz - 2, sz * Math.min(1, a.inUse / a.capacity), 2); } });
      const crew = st.staff.filter((x) => x.station === s.id && x.state !== 'off');
      crew.forEach((m, i) => {
        const per = Math.max(1, Math.floor((bw - 14) / 12)); const dx = cx - bw / 2 + 10 + (i % per) * 12, dy = cy + bh / 2 - 14 - Math.floor(i / per) * 11;
        ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fillStyle = m.state === 'working' ? C.aqua : m.state === 'walking' ? C.yellow : '#5d5c57'; ctx.fill();
      });
      state.floorHits.push({ x: cx, y: cy, r: Math.max(bw, bh) / 2, rect: [cx - bw / 2, cy - bh / 2, bw, bh], station: s,
        tip: `<b>${esc(s.name)}</b><br>${s.active}/${s.capacity} positions busy · ${s.queue} queued<br>avg wait ${Math.round(s.avgWait)} s · ${s.done} tasks done<br>cooks here: ${crew.map((m) => esc(m.name)).join(', ') || '—'}` });
    }
    view['[data-floor-legend]'] = `<i style="background:${C.aqua}"></i>cook working <i style="background:${C.yellow}"></i>walking <i style="background:#5d5c57"></i>idle <i style="background:${C.orange}"></i>appliance in use <i style="background:${C.crit}"></i>down <i style="background:${C.blue}"></i>table seated (ring = course progress) <span class="muted">badge = queued tasks</span>`;
  }

  function seriesPoints(st, f) { return st.series.map((p, i) => [p.t, f(p, i)]); }
  function drawCharts(st) {
    const x0 = sim.config.doorsOpen - 1200, x1 = sim.end;
    const s = st.series; const thru = [];
    for (let i = 0; i < s.length; i++) {
      let j = i; while (j > 0 && s[i].t - s[j].t < 900) j--;
      if (s[i].t >= x0 && s[i].t > s[j].t) thru.push([s[i].t, ((s[i].served - s[j].served) / (s[i].t - s[j].t)) * 3600]);
    }
    state.hover.thru = lineChart($('[data-ch-thru]'), [{ name: 'Plates/h', color: C.aqua, points: thru, fill: true }], { xmin: x0, xmax: x1, now: st.t });
    state.hover.wip = lineChart($('[data-ch-wip]'), [
      { name: 'Open tickets', color: C.blue, points: seriesPoints(st, (p) => p.openTickets).filter((p) => p[0] >= x0) },
      { name: 'Tasks queued', color: C.orange, points: seriesPoints(st, (p) => p.queued).filter((p) => p[0] >= x0) }], { xmin: x0, xmax: x1, now: st.t });
    const rows = st.kpis.perCourse.map((c) => ({ label: `${st.kpis.perCourse.indexOf(c) + 1}. ${c.name}`.slice(0, 24), values: [c.p50, c.p90], n: c.n }));
    barRows($('[data-ch-course]'), rows, { left: 150, colors: [C.blue, C.orange], max: Math.max(1800, ...rows.map((r) => r.values[1])), band: 900, bandLabel: '15 min', fmt: (v, r) => (r.n ? mmss(v) : '–') });
    // labor by station
    const groups = {};
    for (const m of st.staff) { if (m.state === 'off' || m.role === runRole || m.role === washRole || (st.phase !== 'prep' && !m.svc)) continue; (groups[m.home] ||= []).push(m.roll); }
    const lrows = Object.entries(groups).map(([k, v]) => ({ label: `${STATION_LABEL[k]} (${v.length})`.slice(0, 22), values: [v.reduce((a, b) => a + b, 0) / v.length] }));
    barRows($('[data-ch-labor]'), lrows, { left: 150, colors: [C.violet], max: 1, fmt: (v) => pctf(v), band: 0.85, bandLabel: '85%' });
    drawGantt(st); drawCap();
  }

  function drawCap() {
    const cv = $('[data-ch-cap]'); const sw = state.sweep;
    if (!sw || !sw.points.length) { const { ctx, w, h } = fit(cv); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText('Run the sweep to find the kitchen’s knee point', w / 2, h / 2); return; }
    const pts = sw.points; const m = (k) => pts.map((p) => [p.covers, p[k] / 60]);
    lineChart(cv, [{ name: 'Guest wait p90 (min)', color: C.orange, points: m('guestWaitP90') }, { name: 'Ticket time p90 (min)', color: C.blue, points: m('ticketP90') }],
      { xmin: 20, xmax: 200, xticks: [20, 60, 100, 140, 180], xfmt: (v) => `${v}`, ymax: Math.max(15, Math.min(60, Math.ceil(Math.max(...pts.map((p) => p.guestWaitP90 / 60)) / 5) * 5)), marks: sw.knee ? [{ x: sw.knee, color: C.crit, label: `knee ${sw.knee}` }] : [] });
  }

  function drawGantt(st) {
    const cv = $('[data-gantt-cv]'); const { ctx, w, h } = fit(cv);
    const win = 4500; const x0 = st.t - win, left = 112;
    const X = (t) => left + ((t - x0) / win) * (w - left - 6);
    const log = sim.engine.taskLog;
    let rows;
    if (state.gantt === 'cooks') rows = st.staff.filter((m) => m.state !== 'off' && m.role !== runRole && m.role !== washRole && (st.phase === 'prep' || m.svc)).map((m) => ({ id: m.id, label: m.name }));
    else rows = st.appliances.filter((a) => a.tasks > 0 && a.capacity < 99).map((a) => ({ id: a.id, label: a.name.replace(/ \(.*\)/, '').slice(0, 20) + (/_\d+$/.test(a.id) ? ` ·${a.id.split('_').pop()}` : '') }));
    const rh = Math.max(9, Math.min(17, (h - 18) / Math.max(1, rows.length)));
    ctx.font = '10px system-ui'; ctx.textBaseline = 'middle'; state.ganttBars = [];
    const idx = Object.fromEntries(rows.map((r, i) => [r.id, i]));
    ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    rows.forEach((r, i) => { const y = 14 + i * rh; if (i % 2) { ctx.fillStyle = '#1e1e1d'; ctx.fillRect(left, y, w - left, rh); } ctx.fillStyle = C.ink2; ctx.fillText(r.label.slice(0, 18), left - 6, y + rh / 2); });
    ctx.strokeStyle = C.grid; ctx.textAlign = 'center'; ctx.fillStyle = C.muted;
    for (let t = Math.ceil(x0 / 900) * 900; t <= st.t; t += 900) { const x = X(t); ctx.beginPath(); ctx.moveTo(x + 0.5, 12); ctx.lineTo(x + 0.5, h); ctx.stroke(); ctx.fillText(hhmm(t), x, 6); }
    for (let i = log.length - 1; i >= 0; i--) {
      const l = log[i]; if (l.start > st.t) continue; if (l.start < x0 - 3600) break;
      const r = idx[state.gantt === 'cooks' ? l.staff : l.appliance]; if (r === undefined) continue;
      const end = state.gantt === 'cooks' ? l.free : l.end; if (end < x0) continue;
      const a = X(Math.max(x0, l.start)), b = X(Math.min(st.t, end)); const y = 14 + r * rh + 1;
      const g = l.kind === 'prep' ? 'prep' : l.kind === 'wash' ? 'wash' : COURSE_GROUP(l.courseIdx);
      ctx.fillStyle = GROUP_COLOR[g]; ctx.globalAlpha = 0.95; ctx.fillRect(a, y, Math.max(2, b - a - 1), rh - 3); ctx.globalAlpha = 1;
      state.ganttBars.push({ x: a, y, w: Math.max(2, b - a), h: rh - 3, l });
    }
    ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(w - 6, 12); ctx.lineTo(w - 6, h); ctx.stroke();
  }

  function renderRail(st) {
    const list = st.tickets.slice(0, 16);
    view['[data-rail]'] = list.length ? list.map((t) => `<div class="tk ${t.late ? 'late' : t.age > 600 ? 'old' : ''}"><div class="h"><b>${esc(t.table)}</b><span>${esc(t.course)}</span><em>${mmss(t.age)}</em></div>
      <div class="ls">${t.lines.map((l) => `<span class="${l.done ? 'ok' : ''}">${l.done ? '✓' : '◦'} ${l.qty}× ${esc(l.dish)}</span>`).join('')}</div>${t.passed ? '<div class="st">at the pass → runner</div>' : ''}</div>`).join('')
      + (st.tickets.length > 16 ? `<div class="muted">+${st.tickets.length - 16} more</div>` : '') : `<p class="muted">No tickets on the rail.</p>`;
  }

  const serviceItems = new Set(data.dishes.flatMap((d) => d.steps.flatMap((s) => Object.keys(s.uses || {}))));
  function renderInv(st) {
    const svc = state.inv === 'service'; const open = sim.config.doorsOpen;
    let items = st.inventory.filter((i) => (svc ? serviceItems.has(i.id) : i.kind !== 'component'));
    items = items.map((i) => ({ ...i, frac: svc ? (i.atOpen > 0 && st.t >= open ? i.onHand / i.atOpen : (i.produced ? i.onHand / i.produced : 1)) : (i.start ? i.onHand / i.start : 0) }));
    items.sort((a, b) => a.frac - b.frac);
    const rate = (i) => (st.t > open + 600 ? Math.max(0, (i.atOpen - i.onHand) / (st.t - open)) : 0);
    view['[data-inv-table]'] = `<thead><tr><th>Item</th><th>On hand</th><th></th><th>Status</th></tr></thead><tbody>${items.slice(0, 70).map((i) => {
      const r = svc ? rate(i) : 0; const eta = r > 0 && i.onHand > 0 ? st.t + i.onHand / r : null; const out = i.onHand <= 0.001 && i.stockouts > 0;
      const used = !svc && i.onHand <= 0.001 && !i.stockouts;
      const lvl = out || i.stockouts ? 'crit' : used ? 'good' : i.frac < 0.2 ? 'warn' : 'good'; const word = i.stockouts ? (i.onHand > 0 ? '86 risk' : 'OUT') : used ? 'issued to prep' : i.frac < 0.2 ? 'LOW' : 'OK';
      const qty = i.unit === 'ea' ? Math.round(i.onHand) : i.onHand >= 1000 ? `${(i.onHand / 1000).toFixed(1)} k${i.unit}` : `${Math.round(i.onHand)} ${i.unit}`;
      return `<tr data-ing="${i.id}" class="${state.sel?.id === i.id ? 'sel' : ''}"><td>${esc(i.name)}</td><td class="num">${qty}</td><td class="barc"><span class="bar"><i style="width:${Math.max(0, Math.min(100, i.frac * 100))}%;background:${lvl === 'good' ? C.aqua : lvl === 'warn' ? C.warn : C.crit}"></i></span></td>
        <td class="st-${lvl}">${word}${eta && eta < sim.end && lvl !== 'good' ? ` · ~${hhmm(eta)}` : ''}</td></tr>`;
    }).join('')}</tbody>`;
    $('[data-inv-note]').textContent = svc ? 'at the stations & walk-in · vs. stock at doors-open' : 'raw pantry · vs. delivery';
  }

  function renderOee(st) {
    const rows = [...st.appliances].sort((a, b) => b.roll - a.roll || a.id.localeCompare(b.id));
    const mini = (v) => `<span class="mini"><i style="width:${Math.round(v * 100)}%"></i></span>`;
    view['[data-oee-table]'] = `<thead><tr><th>${state.factory ? 'Machine' : 'Appliance'}</th><th>Load</th><th>A</th><th>P</th><th>Q</th><th>OEE</th></tr></thead><tbody>${rows.map((a) => `<tr data-app="${a.id}" class="${a.up ? '' : 'down'} ${state.sel?.id === a.id ? 'sel' : ''}">
      <td>${esc(a.name.replace(/ \(.*\)/, ''))} <span class="muted">${a.id.split('_').pop()}</span>${a.up ? '' : ' <b class="st-crit">✕ DOWN</b>'}</td>
      <td>${mini(a.roll)}<span class="num">${a.inUse}/${a.capacity}</span></td><td class="num">${pctf(a.availability)}</td><td class="num">${pctf(a.performance)}</td><td class="num">${pctf(a.quality)}</td><td class="num"><b>${pctf(a.oee)}</b></td></tr>`).join('')}</tbody>`;
  }

  function renderMrp() {
    const t = sim.mrp(); const inv = sim.state.inventory; const by = Object.fromEntries(inv.map((i) => [i.id, i]));
    const rows = t.map((r) => ({ ...r, have: by[r.id]?.start ?? r.onHand })).sort((a, b) => (b.required - b.have > 0) - (a.required - a.have > 0) || b.required * b.cost - a.required * a.cost).slice(0, 40);
    view['[data-mrp-table]'] = `<thead><tr><th>Ingredient</th><th>Needed</th><th>Stocked</th><th>Status</th></tr></thead><tbody>${rows.map((r) => {
      const short = Math.max(0, r.required - r.have); const f = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v));
      return `<tr><td>${esc(r.name)}</td><td class="num">${f(r.required)} ${r.unit}</td><td class="num">${f(r.have)}</td><td class="${short > 0 ? 'st-crit' : 'st-good'}">${short > 0 ? `✕ short ${f(short)}` : '✓ covered'}</td></tr>`;
    }).join('')}</tbody>`;
  }

  function renderLog(st) {
    const COL = { fault: C.crit, stockout: C.crit, '86': C.crit, qc: C.warn, ticket: C.blue, served: C.aqua, service: C.violet, prep: C.aqua, seat: C.ink2, staff: C.muted, res: C.muted };
    view['[data-log]'] = st.log.slice(-60).reverse().map((e) => `<div><time>${hhmm(e.t)}</time><i style="background:${COL[e.type] || C.muted}"></i>${esc(e.msg)}</div>`).join('');
  }

  // ---------------------------------------------------------------- hover wiring
  function hoverCanvas(sel, fn) {
    const cv = $(sel);
    cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); const html = fn(e.clientX - r.left, e.clientY - r.top); html ? showTip(e, html) : hideTip(); });
    cv.addEventListener('mouseleave', hideTip);
    return cv;
  }
  const lineHover = (key, unit) => (x) => { const hit = state.hover[key]; if (!hit) return null; const n = nearest(hit, x); return n ? `<b>${hhmm(n.t)}</b><br>${n.rows.map((r) => `<i class="sw" style="background:${r.color}"></i>${esc(r.name)}: ${r.v == null ? '–' : Math.round(r.v)}${unit}`).join('<br>')}` : null; };
  hoverCanvas('[data-ch-thru]', lineHover('thru', '/h'));
  hoverCanvas('[data-ch-wip]', lineHover('wip', ''));
  hoverCanvas('[data-ch-course]', (x, y) => { const st = sim.state; const rh = ($('[data-ch-course]').getBoundingClientRect().height - 14) / 10; const c = st.kpis.perCourse[Math.floor((y - 4) / rh)]; return c ? `<b>${esc(c.name)}</b><br>${c.n} served<br>p50 ${mmss(c.p50)} · p90 ${mmss(c.p90)} · max ${mmss(c.max)}` : null; });
  hoverCanvas('[data-gantt-cv]', (x, y) => { const b = state.ganttBars.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); return b ? `<b>${esc(b.l.name)}</b><br>${hhmm(b.l.start)} → ${hhmm(b.l.end)}<br>${b.l.ticket ? `ticket ${b.l.ticket} · ` : ''}waited ${Math.round(b.l.wait)} s` : null; });
  const floor = hoverCanvas('[data-floor]', (x, y) => { const h = state.floorHits.find((q) => (q.rect ? x >= q.rect[0] && x <= q.rect[0] + q.rect[2] && y >= q.rect[1] && y <= q.rect[1] + q.rect[3] : Math.hypot(q.x - x, q.y - y) <= q.r)); return h?.tip || null; });
  floor.addEventListener('click', (e) => { const r = floor.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const h = state.floorHits.find((q) => q.rect && x >= q.rect[0] && x <= q.rect[0] + q.rect[2] && y >= q.rect[1] && y <= q.rect[1] + q.rect[3]); if (h) emitSel({ type: 'station', id: h.station.id }); });
  root.addEventListener('click', (e) => {
    const ing = e.target.closest('[data-ing]'); if (ing) { emitSel({ type: 'ingredient', id: ing.dataset.ing }); update(true); }
    const app = e.target.closest('[data-app]'); if (app) { emitSel({ type: 'appliance', id: app.dataset.app }); update(true); }
  });

  // ---------------------------------------------------------------- main update
  function update(force) {
    const now = performance.now();
    if (!force && now - state.last < 110) return; state.last = now; state.tick++;
    const st = sim.state;
    $('[data-clock]').textContent = st.clock;
    const pill = $('[data-phase]'); pill.textContent = st.done ? 'service complete' : sim.playing ? `${st.phase} · live` : `${st.phase} · paused`; pill.className = `pill ${st.phase} ${sim.playing ? 'live' : ''}`;
    $('[data-act="play"]').textContent = sim.playing ? '⏸ Pause' : '▶ Play';
    if (document.activeElement !== scrub) scrub.value = st.t;
    renderKpis(st); renderBanner(st); drawFloor(st); renderRail(st); renderOee(st); renderLog(st);
    if (force || state.tick % 4 === 0) { drawCharts(st); renderInv(st); drawGuestLine($('[data-guestline]') || root, st, sim, state.hover); }
    if (force || state.tick % 40 === 0) renderMrp();
  }

  function paintPhases() {
    const c = sim.config; const a = sim.start, b = sim.end; const pc = (t) => `${(((t - a) / (b - a)) * 100).toFixed(2)}%`;
    $('[data-phases]').innerHTML = [[c.prepStart, 'prep', C.aqua], [c.doorsOpen, 'doors', C.blue], [c.lastSeating, 'last seating', C.orange], [b - 600, 'close', C.violet]]
      .map(([t, l, col]) => `<span style="left:${pc(t)};--c:${col}">${l}</span>`).join('');
  }

  let raf = 0, prev = 0;
  const loop = (ts) => { const dt = Math.min(0.25, (ts - prev) / 1000 || 0); prev = ts; sim.tick(dt); update(); raf = requestAnimationFrame(loop); };
  sim.on('reset', () => { syncRange(); paintPhases(); syncPlan(); });
  new ResizeObserver(() => update(true)).observe(root);

  syncRange(); paintPhases(); syncPlan(); renderScen(); applyTerms();
  mountPlan($('[data-plan]'), sim, { onApply: () => { syncRange(); syncPlan(); state.scen = null; state.sweep = null; renderScen(); sim.seek(doorsT()); sim.play(); update(true); } });
  mountOptimizer($('[data-library]'), sim, { onLoad: () => { syncRange(); syncPlan(); state.scen = null; state.sweep = null; renderScen(); sim.seek(doorsT()); sim.play(); update(true); } });
  const api = {
    update, start() { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(loop); } update(true); },
    stop() { cancelAnimationFrame(raf); raf = 0; }, on: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    select: (s) => { state.sel = s; update(true); }, setFactoryTerms(v) { state.factory = !!v; applyTerms(); update(true); }, actions: act,
  };
  update(true);
  return api;
}
