// "Service scenarios & optimizer" panel. Mounted by dashboard.js.
// The guest counts and the optimizer's ranked plans come precomputed with the site (src/sim/precomputed.js), so
// they show at once and load on the live twin without a forecast run. A plan that is not in the library can
// still be optimized live, on fewer seeds.
import { mmss } from './charts.js';
import { DEFAULT_CFG } from '../sim/engine.js';
import { optimize } from '../sim/optimize.js';
import { scenarioLibrary, configKey } from '../sim/precomputed.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const min = (s) => Math.round(s / 60);
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;
const LIVE_SEEDS = [1, 2];

export function mountOptimizer(el, sim, { onLoad } = {}) {
  const data = sim.data;
  const lib = scenarioLibrary(data);
  const state = { sel: null, live: null, running: false };
  // A scenario's night is its full precomputed config plus a plan's levers, never the leftovers of the current
  // config, so its key matches the precomputed run.
  const nightFor = (sc, patch = {}) => ({ ...sc.config, ...patch });
  const matches = (sc, patch) => configKey(nightFor(sc, patch)) === configKey(sim.config);
  const activeScenario = () => lib?.scenarios.find((sc) => matches(sc) || sc.candidates.some((c) => matches(sc, c.patch)));

  el.innerHTML = `<p class="muted lib-note" data-lnote></p><div class="lib-cards" data-lcards></div><div data-ldetail></div>
    <div class="tools lib-live"><button class="btn" data-lact="live">Optimize the current plan</button><span class="muted" data-llive></span></div>`;
  const q = (s) => el.querySelector(s);

  function render() {
    const act = activeScenario();
    if (!state.sel && lib) state.sel = (act ?? lib.scenarios.find((s) => s.isDefault) ?? lib.scenarios[0]).id;
    q('[data-lnote]').textContent = lib
      ? `Precomputed with the site: ${lib.scenarios.length} nights, each optimized over ${lib.scenarios[0].candidates.length} plans on ${lib.seeds.length} seeds. They open instantly instead of re-running the simulation.`
      : 'No precomputed scenarios for this menu. Optimize the current plan to search it live.';
    q('[data-lcards]').innerHTML = (lib?.scenarios || []).map((sc) => {
      const b = sc.base; const over = min(b.mealAvg) - min(sc.target);
      const cls = over > 10 ? 'crit' : over > 0 ? 'warn' : 'good';
      return `<button class="lib-card ${cls} ${state.sel === sc.id && !state.live ? 'on' : ''}" data-lsel="${sc.id}">
        <small>${sc.covers} guests${sc.isDefault ? ' · tonight' : ''}${act?.id === sc.id ? ' · on the twin' : ''}</small>
        <b>${min(b.mealAvg)}<small> min a table</small></b>
        <span class="st-${cls}">${over > 0 ? `${over} min over` : 'on'} the ${min(sc.target)} min target</span>
        <span>ticket p90 ${mmss(b.ticketP90)} · ${b.balked ? `${b.balked} walked away` : 'nobody walked away'}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-lsel]').forEach((b) => b.addEventListener('click', () => { state.sel = b.dataset.lsel; state.live = null; render(); }));
    const sc = state.live ?? lib?.scenarios.find((s) => s.id === state.sel);
    q('[data-ldetail]').innerHTML = sc ? detail(sc) : '';
    el.querySelectorAll('[data-lrun]').forEach((b) => b.addEventListener('click', () => load(sc, b.dataset.lrun)));
    q('[data-lact="live"]').disabled = state.running;
  }

  function detail(sc) {
    const b = sc.base, m = sc.baselineMean, target = min(sc.target);
    const rec = sc.candidates.find((c) => c.id === sc.recommended);
    const rows = sc.candidates.slice(0, 10);
    if (rec && !rows.includes(rec)) rows.push(rec);
    const replay = new Set(sc.replayable || []);
    const head = `<div class="scen-head"><b>${sc.live ? 'Your current plan' : `${sc.covers} guests`}</b>
      <span class="muted">seed ${sc.seed}${sc.live ? ` · optimized live on ${sc.seeds.length} seeds` : ''}</span>
      ${sc.live ? '' : `<button class="btn" data-lrun="">Load this night${lib && !sc.live ? ' (instant)' : ''}</button>`}
      ${rec ? `<button class="btn primary" data-lrun="${esc(rec.id)}">Load the recommended plan${replay.has(rec.id) ? ' (instant)' : ''}</button>` : ''}</div>`;
    const story = `<p class="why">Guests spend <b>${min(b.mealAvg)} min</b> at the table on seed ${sc.seed} (${min(m.mealAvg)} on average over ${sc.seeds?.length ?? lib.seeds.length} seeds) against a ${target} min target. ${esc(b.bottleneck)}<br>
      ${rec ? `Recommended: <b>${esc(rec.label)}</b>. ${esc(rec.detail)} Average meal ${min(rec.mean.mealAvg)} min (${signed(min(rec.mean.mealAvg) - min(m.mealAvg))}), ${min(rec.seed1.mealAvg)} min on seed ${sc.seed}${rec.meetsTarget ? ', inside the target' : ', still over the target'}.`
        : 'No plan beat tonight’s by more than half a minute without hurting yield, ticket times or the wait for a table.'}</p>`;
    const kind = { cook: 'Extra cook', fire: 'Re-sequenced fire', both: 'Both' };
    const table = `<div class="scroll"><table class="t cmp lib-t"><thead><tr><th>Plan</th><th>Avg meal</th><th>vs tonight</th><th>Seed ${sc.seed}</th><th>First-pass yield</th><th>Walked away</th><th>Waste</th><th></th></tr></thead><tbody>
      <tr class="flat"><td>Tonight’s plan <span class="muted">(fire ${DEFAULT_CFG.fireLead}× lead + ${DEFAULT_CFG.leadSec} s, no extra cook)</span></td><td>${min(m.mealAvg)} min</td><td>–</td><td>${min(b.mealAvg)} min</td><td>${(m.fpy * 100).toFixed(1)}%</td><td>${m.balked.toFixed(1)}</td><td>$${Math.round(m.wasteCost)}</td><td></td></tr>
      ${rows.map((c) => {
        const d = min(c.mean.mealAvg) - min(m.mealAvg);
        const note = c.flags.length ? `<div class="st-warn">${c.flags.map(esc).join('; ')}</div>` : '';
        return `<tr class="${c.ok ? '' : 'flag'} ${c.id === sc.recommended ? 'rec' : ''}"><td>${c.id === sc.recommended ? '★ ' : ''}<span class="kind k-${c.kind}">${kind[c.kind]}</span> ${esc(c.label)}${note}</td>
          <td>${min(c.mean.mealAvg)} min</td><td class="${d < 0 ? 'v-good' : d > 0 ? 'v-bad' : 'v-flat'}">${signed(d)} min</td><td>${min(c.seed1.mealAvg)} min</td>
          <td>${(c.mean.fpy * 100).toFixed(1)}%</td><td>${c.mean.balked.toFixed(1)}</td><td>$${Math.round(c.mean.wasteCost)}</td>
          <td><button class="btn small" data-lrun="${esc(c.id)}" title="${esc(c.detail)}">Run${replay.has(c.id) ? ' ⚡' : ''}</button></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="legend muted">Ranked by average time at the table over ${sc.seeds?.length ?? lib.seeds.length} seeds; yield, walk-aways and waste are averages too. ★ = the least invasive plan that meets the target (no extra labor before extra labor), or the biggest saving if none does. ⚡ = precomputed, loads instantly.</div>`;
    return head + story + table;
  }

  function load(sc, id) {
    const cand = id ? sc.candidates.find((c) => c.id === id) : null;
    const patch = nightFor(sc, cand?.patch);
    sim.reset(patch);
    onLoad?.({ scenario: sc.id, plan: id || null, cached: sim.cached });
    render();
  }

  q('[data-lact="live"]').addEventListener('click', async () => {
    if (state.running) return;
    state.running = true; render();
    const note = q('[data-llive]'); const cfg = { ...sim.config };
    const t0 = performance.now();
    const res = await optimize(data, cfg, { seeds: LIVE_SEEDS, onProgress: (d, n) => { note.textContent = `Running night ${d} of ${n}…`; } });
    const runs = res.baseline.runs;
    state.live = { id: 'live', live: true, config: cfg, covers: cfg.covers, seed: cfg.seed, seeds: res.seeds, target: res.target,
      base: runs[0], baselineMean: res.baseline.mean, recommended: res.recommended, replayable: [],
      candidates: res.candidates.map((c) => ({ ...c, seed1: c.runs[0] })) };
    state.running = false;
    note.textContent = `Searched ${res.candidates.length} plans on ${res.seeds.length} seeds in ${Math.round((performance.now() - t0) / 1000)} s.`;
    render();
  });

  sim.on('reset', () => { if (!state.running) render(); });
  render();
  return { render };
}
