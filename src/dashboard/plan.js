// "Plan the night" controls and the "Guest line" panel. Both are mounted by dashboard.js.
// The plan panel only builds a config patch; sim.reset(patch) re-runs the whole night from the seed.
import { C, lineChart, barRows, hhmm, mmss, nearest } from './charts.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hours = (s) => (s / 3600).toFixed(2).replace(/\.?0+$/, '');
const num = (v, d) => (Number.isFinite(+v) && v !== '' ? +v : d);

export const PLAN_DEFAULTS = {
  arrival: null, partyMix: null, mix: null, courseGapMin: null, eatScale: 1, paceCv: 0.25, patienceMin: 60,
  stockOverride: null, purchasing: 'plan', purchaseFactor: 1.15, noShowRate: 0.03,
};

/** Which dishes can a guest choose between (option parts) or add on (supplements)? */
export function menuChoices(data) {
  const dishName = Object.fromEntries((data.dishes || []).map((d) => [d.id, d.name]));
  const out = [];
  for (const c of data.courses) {
    for (const part of c.parts || []) {
      const real = part.filter((o) => o.dish);
      if (real.length > 1) out.push({ kind: 'choice', course: c.name, options: real.map((o) => ({ id: o.dish, name: dishName[o.dish] || o.dish, w: o.weight })) });
      else if (real.length === 1 && part.some((o) => !o.dish)) out.push({ kind: 'extra', course: c.name, options: [{ id: real[0].dish, name: dishName[real[0].dish] || real[0].dish, w: real[0].weight }] });
    }
  }
  return out;
}

export function mountPlan(el, sim, { onApply } = {}) {
  const data = sim.data;
  const choices = menuChoices(data);
  const state = { tab: 'guests', stock: {}, mix: {}, partyMix: null };
  const cfg = () => sim.config;
  const defaultParty = () => (data.reservations?.partySizeMix || [{ size: 1, share: 0.03 }, { size: 2, share: 0.57 }, { size: 3, share: 0.08 }, { size: 4, share: 0.2 }, { size: 5, share: 0.04 }, { size: 6, share: 0.08 }]);

  const tabs = [['guests', 'Guests'], ['orders', 'Orders'], ['stock', 'Stock'], ['timing', 'Timing']];
  el.innerHTML = `<div class="tools"><span class="seg small" role="tablist">${tabs.map(([k, l]) => `<button data-ptab="${k}" class="${k === state.tab ? 'on' : ''}">${l}</button>`).join('')}</span>
      <span class="grow"></span><button class="btn" data-pact="reset">Reset to defaults</button><button class="btn primary" data-pact="apply">Apply and re-run</button></div>
    <div class="plan-body" data-pbody></div><p class="muted" data-pnote></p>`;
  const body = el.querySelector('[data-pbody]');
  const q = (s) => body.querySelector(s);

  const field = (label, input, hint = '') => `<label class="fld"><span>${label}</span>${input}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;

  const views = {
    guests() {
      const c = cfg(); const a = c.arrival;
      const pm = state.partyMix || c.partyMix || defaultParty();
      return `<div class="pgrid">
        ${field('Guests booked', `<input type="number" data-k="covers" min="2" max="400" step="2" value="${c.covers}">`, 'covers for the night')}
        ${field('No-show rate', `<input type="number" data-k="noShowRate" min="0" max="40" step="1" value="${Math.round(c.noShowRate * 100)}"> %`)}
        ${field('Arrival pattern', `<select data-k="shape"><option value="data">Reservation book (${esc(c.seating)})</option><option value="uniform">Even trickle</option><option value="bell">Single wave</option><option value="waves">Two waves</option></select>`)}
        ${field('First arrival', `<input type="number" data-k="from" step="0.25" min="10" max="23" value="${hours(a?.start ?? c.doorsOpen)}"> h`, 'hour of day')}
        ${field('Last arrival', `<input type="number" data-k="to" step="0.25" min="10" max="24" value="${hours(a?.end ?? c.lastSeating)}"> h`)}
        ${field('Patience for a table', `<input type="number" data-k="patienceMin" min="5" max="240" step="5" value="${c.patienceMin}"> min`, 'walks away after this')}
      </div>
      <div class="party"><span class="muted">Party sizes (relative share)</span>${pm.map((p) => `<label>${p.size}<input type="number" data-party="${p.size}" min="0" max="100" step="1" value="${Math.round(p.share * 100)}"></label>`).join('')}</div>`;
    },
    orders() {
      if (!choices.length) return '<p class="muted">This menu has no choices or supplements to adjust.</p>';
      const m = cfg().mix; const w = (id, d) => state.mix[id] ?? m?.weights?.[id] ?? d;
      return `<div class="pgrid orders">${choices.map((ch, gi) => `<div class="ch"><b>${esc(ch.course)}</b>${ch.kind === 'extra' ? ' <span class="muted">(supplement: share who add it)</span>' : ''}
        ${ch.options.map((o) => {
          const v = Math.round(w(o.id, o.w) * 100);
          return `<label class="rng"><span>${esc(o.name)}</span><input type="range" min="0" max="100" value="${v}" data-mix="${o.id}"><output>${v}%</output></label>`;
        }).join('')}</div>`).join('')}</div>
        <label class="chk"><input type="checkbox" data-k="planFollows" ${m?.planFollows ? 'checked' : ''}> The kitchen re-forecasts from these orders (otherwise it preps to the original menu forecast, so a rush on one dish can run out)</label>`;
    },
    stock() {
      const c = cfg(); const rows = sim.mrp().slice().sort((a, b) => b.required * b.cost - a.required * a.cost).slice(0, 14);
      const have = Object.fromEntries(sim.state.inventory.map((i) => [i.id, i.start]));
      return `<div class="pgrid">
        ${field('Buying policy', `<select data-k="purchasing"><option value="plan"${c.purchasing === 'plan' ? ' selected' : ''}>Buy to the booking</option><option value="fixed"${c.purchasing === 'fixed' ? ' selected' : ''}>Use the stock on hand</option></select>`)}
        ${field('Safety margin', `<input type="number" data-k="purchaseFactor" min="0.5" max="2" step="0.05" value="${c.purchaseFactor}"> ×`, 'only when buying to the booking')}
      </div>
      <p class="muted">Starting stock for the most expensive ingredients. Edit a number to override what is delivered.</p>
      <div class="scroll short"><table class="t"><thead><tr><th>Ingredient</th><th>Needed</th><th>Stock</th></tr></thead><tbody>${rows.map((r) => {
        const cur = state.stock[r.id] ?? c.stockOverride?.[r.id] ?? Math.round(have[r.id] ?? r.onHand ?? 0);
        return `<tr><td>${esc(r.name)}</td><td class="num">${Math.round(r.required)} ${esc(r.unit)}</td><td><input type="number" min="0" step="any" data-stock="${r.id}" value="${cur}"> <span class="muted">${esc(r.unit)}</span></td></tr>`;
      }).join('')}</tbody></table></div>`;
    },
    timing() {
      const c = cfg(); const target = data.pacing?.targetMealMinutes ?? 195;
      return `<div class="pgrid">
        ${field('Eating pace', `<input type="number" data-k="eatScale" min="0.5" max="2" step="0.05" value="${c.eatScale}"> ×`, '1.2 = guests eat 20% slower')}
        ${field('Minutes between courses', `<input type="number" data-k="courseGapMin" min="4" max="45" step="1" value="${c.courseGapMin ?? ''}" placeholder="${(target / data.courses.length).toFixed(1)}">`, 'blank = the menu\'s own pacing')}
        ${field('Pace variation', `<input type="number" data-k="paceCv" min="0" max="80" step="5" value="${Math.round(c.paceCv * 100)}"> %`, 'how much each party differs')}
      </div>`;
    },
  };

  function render() {
    body.innerHTML = views[state.tab]();
    el.querySelectorAll('[data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === state.tab));
    if (state.tab === 'guests') q('[data-k="shape"]').value = cfg().arrival?.shape ?? 'data';
    body.querySelectorAll('[data-mix]').forEach((r) => r.addEventListener('input', () => { state.mix[r.dataset.mix] = r.value / 100; r.nextElementSibling.textContent = `${r.value}%`; }));
    body.querySelectorAll('[data-stock]').forEach((r) => r.addEventListener('input', () => { state.stock[r.dataset.stock] = num(r.value, 0); }));
    body.querySelectorAll('[data-party]').forEach((r) => r.addEventListener('input', () => {
      state.partyMix = [...body.querySelectorAll('[data-party]')].map((x) => ({ size: +x.dataset.party, share: num(x.value, 0) / 100 }));
    }));
  }
  el.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { collectVisible(); state.tab = b.dataset.ptab; render(); }));

  // form values that live on the current tab are folded into `pending` before switching tabs or applying
  let pending = {};
  function collectVisible() {
    const g = (k) => q(`[data-k="${k}"]`);
    const set = (k, v) => { pending[k] = v; };
    if (state.tab === 'guests') {
      set('covers', num(g('covers').value, cfg().covers)); set('noShowRate', num(g('noShowRate').value, 3) / 100); set('patienceMin', num(g('patienceMin').value, 60));
      const shape = g('shape').value;
      set('arrival', shape === 'data' ? null : { shape, start: num(g('from').value, 17.5) * 3600, end: num(g('to').value, 21) * 3600 });
    } else if (state.tab === 'orders') {
      const ids = [...body.querySelectorAll('[data-mix]')].map((r) => r.dataset.mix);
      if (ids.length) set('mix', { weights: Object.fromEntries(ids.map((id) => [id, (state.mix[id] ?? +body.querySelector(`[data-mix="${id}"]`).value / 100)])), planFollows: !!g('planFollows')?.checked });
    } else if (state.tab === 'stock') {
      set('purchasing', g('purchasing').value); set('purchaseFactor', num(g('purchaseFactor').value, 1.15));
    } else if (state.tab === 'timing') {
      set('eatScale', num(g('eatScale').value, 1)); set('paceCv', num(g('paceCv').value, 25) / 100);
      set('courseGapMin', g('courseGapMin').value === '' ? null : num(g('courseGapMin').value, null));
    }
  }
  function patch() {
    collectVisible();
    const p = { ...pending };
    if (state.partyMix) p.partyMix = state.partyMix.filter((x) => x.share > 0);
    const edited = Object.entries(state.stock);
    if (edited.length) p.stockOverride = { ...(cfg().stockOverride || {}), ...Object.fromEntries(edited) };
    return p;
  }
  el.querySelector('[data-pact="apply"]').addEventListener('click', () => {
    const p = patch(); pending = {};
    sim.reset(p); el.querySelector('[data-pnote]').textContent = `Re-ran the night at ${sim.config.covers} guests.`;
    onApply?.(p); render();
  });
  el.querySelector('[data-pact="reset"]').addEventListener('click', () => {
    pending = {}; state.stock = {}; state.mix = {}; state.partyMix = null;
    sim.reset({ ...PLAN_DEFAULTS, covers: data.sim?.defaultCovers ?? 60, seating: data.sim?.defaultSeating ?? cfg().seating });
    el.querySelector('[data-pnote]').textContent = 'Back to the dataset defaults.'; onApply?.({}); render();
  });
  render();
  return { render };
}

/** Guest line panel: arrivals, queue, course gaps and how long people spend. Draws into canvases created by dashboard.js */
export function drawGuestLine(root, st, sim, hoverStore) {
  const g = st.guests; if (!g) return;
  const $ = (s) => root.querySelector(s);
  const tile = (label, val, sub, cls = '') => `<div class="mini-tile ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const over = g.balked > 0 ? 'crit' : g.waiting > 0 ? 'warn' : '';
  $('[data-gl-tiles]').innerHTML = [
    tile('In the house', `${g.inHouse}`, `${Math.round(g.occupancy * 100)}% of ${g.seats} seats`),
    tile('Waiting for a table', `${g.waiting}`, `${g.waitingParties} parties · avg wait ${mmss(g.tableWaitAvg)}`, g.waiting ? 'warn' : ''),
    tile('Walked away', `${g.balked}`, `$${Math.round(g.lostRevenue).toLocaleString()} lost`, over),
    tile('Time at the table', g.meals ? `${Math.round(g.mealAvg / 60)} min` : '–', `target ${Math.round(g.mealTarget / 60)} · p90 ${g.meals ? Math.round(g.mealP90 / 60) : '–'} min`, g.meals && g.mealAvg > g.mealTarget * 1.15 ? 'warn' : ''),
    tile('Between courses', g.gapAvg ? mmss(g.gapAvg) : '–', `target ${mmss(g.gapTarget)} · p90 ${g.gapP90 ? mmss(g.gapP90) : '–'}`),
    tile('Value-added time', g.meals ? `${Math.round(g.valueAdded * 100)}%` : '–', 'eating vs waiting'),
  ].join('');
  const s = sim.engine.series.filter((p) => p.inHouse !== undefined);
  const pts = (k) => s.map((p) => [p.t, p[k]]);
  hoverStore.guests = lineChart($('[data-gl-flow]'), [
    { name: 'Guests in the house', color: C.blue, points: pts('inHouse'), fill: true },
    { name: 'Waiting for a table', color: C.orange, points: pts('waiting') },
    { name: 'Walked away (cumulative)', color: C.crit, points: pts('balked') },
  ], { now: st.t, xmin: sim.config.doorsOpen - 1800, xmax: sim.config.doorsOpen + 7.5 * 3600, ymax: Math.max(20, ...s.map((p) => p.inHouse)) * 1.1 });
  barRows($('[data-gl-gap]'), g.gapByCourse.slice(1).map((c) => ({ label: c.name.slice(0, 18), values: [c.avg, c.p90], n: c.n })),
    { colors: [C.blue, C.orange], left: 130, band: g.gapTarget, bandLabel: 'target', fmt: (v) => mmss(v) });
}
