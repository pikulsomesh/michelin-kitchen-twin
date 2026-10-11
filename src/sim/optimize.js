// Service optimizer: searches two levers that cut the meal-time overrun (guests at the table longer than
// the menu's target) and ranks them on the average of several seeds, so one lucky night does not win.
//   1. an extra cook, cloned from one of the brigade (same roles, station and shift)
//   2. a re-sequenced fire: expo calls each course earlier, by a larger share of its slowest dish's
//      lead time (fireLead) and a longer fixed lead (leadSec), so plates reach the pass as guests are ready
// Every candidate re-runs the whole night headlessly (src/sim/scenarios.js) from the same seeds.
import { runHeadless } from './scenarios.js';
import { DEFAULT_CFG } from './engine.js';

export const SEEDS = [1, 2, 3, 4, 5];
const FIRE_LEADS = [1, 1.15, 1.3, 1.5];
const LEAD_SECS = [75, 150, 225];
// guards: a candidate that wins on meal time by hurting something else is flagged, not recommended
const GUARD = { fpyPts: 1, ticketP90Sec: 120, tableWaitP90Sec: 120 };

/** The candidate plans for a dataset: one extra cook per line role, a grid of fire re-sequences, and nothing else. */
export function candidatesFor(data) {
  const seen = new Set(); const cooks = [];
  for (const s of data.staff) {
    if (seen.has(s.role) || /runner|prep|butcher/.test(s.role)) continue;
    seen.add(s.role); cooks.push(s);
  }
  const station = (id) => (data.stations.find((x) => x.id === id)?.name ?? id).replace(/ \(.*\)$/, '').toLowerCase().replace(/^the /, '');
  const out = cooks.map((s) => ({
    id: `cook:${s.id}`, kind: 'cook', label: `Add a ${(s.title || s.name).replace(/ \(.*\)$/, '').toLowerCase()}`,
    detail: `One more ${(s.title || s.name).replace(/ \(.*\)$/, '').toLowerCase()} on the same shift (${shiftText(s.shift)}), working ${s.roles.length} role${s.roles.length > 1 ? 's' : ''} from the ${station(s.home)} station.`,
    patch: { extraStaff: [{ like: s.id }] },
  }));
  for (const fireLead of FIRE_LEADS) for (const leadSec of LEAD_SECS) {
    if (fireLead === DEFAULT_CFG.fireLead && leadSec === DEFAULT_CFG.leadSec) continue;
    out.push({ id: `fire:${fireLead}:${leadSec}`, kind: 'fire', label: `Re-sequence the fire: ${fireLead}× lead, ${leadSec} s buffer`,
      detail: `Expo calls each course ${Math.round(fireLead * 100)}% of its slowest dish's lead time plus ${leadSec} s before the table is ready (today: ${Math.round(DEFAULT_CFG.fireLead * 100)}% + ${DEFAULT_CFG.leadSec} s).`,
      patch: { fireLead, leadSec } });
  }
  return out;
}

const shiftText = (sh) => (sh ? sh.map((h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`).join('–') : 'all day');

/** One headless night, reduced to the numbers the optimizer and the site show. */
export function summarize(s) {
  const g = s.guests, k = s.kpis;
  return {
    mealAvg: g.mealAvg, mealP90: g.mealP90, mealTarget: g.mealTarget, overrun: Math.max(0, g.mealAvg - g.mealTarget),
    gapAvg: g.gapAvg, tableWaitP90: g.tableWaitP90, balked: g.balked, served: s.covers.finished, booked: s.covers.booked,
    ticketP90: k.ticketP90, guestWaitP90: k.guestWaitP90, lineUtil: k.lineUtil, fpy: k.firstPassYield,
    wasteCost: k.wasteCost, stockouts: k.stockoutCount, comps: k.comps, endT: s.endT, bottleneck: k.bottleneck.text,
  };
}

const mean = (rows, f) => rows.reduce((a, r) => a + r[f], 0) / rows.length;
const MEAN_KEYS = ['mealAvg', 'mealP90', 'overrun', 'tableWaitP90', 'balked', 'ticketP90', 'fpy', 'wasteCost', 'lineUtil'];
const averaged = (rows) => Object.fromEntries(MEAN_KEYS.map((k) => [k, mean(rows, k)]));

/** Run one plan on every seed. */
export function evaluate(data, cfg, patch, seeds = SEEDS) {
  const runs = seeds.map((seed) => summarize(runHeadless(data, { ...cfg, ...patch, seed })));
  return { runs, mean: averaged(runs) };
}

/**
 * Search the candidates for cfg (a resolved sim config) and rank them.
 * Async so the browser stays responsive: onProgress(done, total) is called after every night.
 * Returns { target, baseline, candidates (best first), recommended }.
 */
export async function optimize(data, cfg, { seeds = SEEDS, onProgress = () => {}, yieldEvery = 1 } = {}) {
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const singles = candidatesFor(data);
  let total = (singles.length + 1 + 4) * seeds.length, done = 0;
  const run = async (patch) => {
    const runs = [];
    for (const seed of seeds) {
      runs.push(summarize(runHeadless(data, { ...cfg, ...patch, seed })));
      onProgress(++done, total);
      if (done % yieldEvery === 0) await pause();
    }
    return { runs, mean: averaged(runs) };
  };
  const base = await run({});
  const scored = [];
  for (const c of singles) scored.push({ ...c, ...(await run(c.patch)) });
  // the best cook and the best fire together: the two levers are independent, so they often stack
  const best = (kind) => scored.filter((c) => c.kind === kind).sort((a, b) => a.mean.mealAvg - b.mean.mealAvg).slice(0, 2);
  const cooks = best('cook'), fires = best('fire');
  total = (singles.length + 1 + cooks.length * fires.length) * seeds.length;
  for (const ck of cooks) for (const fr of fires) {
    const patch = { ...ck.patch, ...fr.patch };
    scored.push({ id: `${ck.id}+${fr.id}`, kind: 'both', label: `${ck.label}, and ${fr.label.charAt(0).toLowerCase()}${fr.label.slice(1)}`, detail: `${ck.detail} ${fr.detail}`, patch, ...(await run(patch)) });
  }
  const target = base.mean.mealAvg - base.mean.overrun; // = mealTarget
  for (const c of scored) {
    const m = c.mean, b = base.mean; const flags = [];
    if (b.fpy - m.fpy > GUARD.fpyPts / 100) flags.push(`first-pass yield drops ${((b.fpy - m.fpy) * 100).toFixed(1)} pts (more plates held too long at the pass)`);
    if (m.ticketP90 - b.ticketP90 > GUARD.ticketP90Sec) flags.push(`ticket time p90 rises ${Math.round((m.ticketP90 - b.ticketP90) / 60)} min`);
    if (m.tableWaitP90 - b.tableWaitP90 > GUARD.tableWaitP90Sec) flags.push(`guests wait ${Math.round((m.tableWaitP90 - b.tableWaitP90) / 60)} min longer for a table`);
    if (m.balked > b.balked + 0.5) flags.push(`${(m.balked - b.balked).toFixed(1)} more guests walk away`);
    c.flags = flags; c.ok = !flags.length;
    c.saved = b.mealAvg - m.mealAvg; c.meetsTarget = m.mealAvg <= target;
  }
  scored.sort((a, b) => a.mean.mealAvg - b.mean.mealAvg);
  // recommend the least invasive plan that meets the target (no extra labor before extra labor, smaller changes first);
  // if none does, the one that saves the most. Only plans that pass the guards and actually help qualify.
  const effort = (c) => (c.kind === 'fire' ? 0 : c.kind === 'cook' ? 1 : 2) + (c.patch.fireLead ?? 0) / 10 + (c.patch.leadSec ?? 0) / 10000;
  const good = scored.filter((c) => c.ok && c.saved > 30);
  const meeting = good.filter((c) => c.meetsTarget).sort((a, b) => effort(a) - effort(b) || a.mean.mealAvg - b.mean.mealAvg);
  const recommended = meeting[0] ?? good[0] ?? null;
  return { seeds, target, baseline: base, candidates: scored, recommended: recommended?.id ?? null };
}

/** The optimizer's levers in a share link: ?cook=<staff id>[,…]&fire=<fireLead>&lead=<leadSec>. */
export function leversFromQuery(q) {
  const out = {};
  if (q.get('cook')) out.extraStaff = q.get('cook').split(',').filter(Boolean).map((like) => ({ like }));
  if (Number.isFinite(parseFloat(q.get('fire')))) out.fireLead = parseFloat(q.get('fire'));
  if (Number.isFinite(parseFloat(q.get('lead')))) out.leadSec = parseFloat(q.get('lead'));
  return out;
}

export function leversToQuery(cfg, p) {
  const cooks = (cfg.extraStaff || []).map((x) => x.like);
  if (cooks.length) p.set('cook', cooks.join(',')); else p.delete('cook');
  if (cfg.fireLead !== DEFAULT_CFG.fireLead) p.set('fire', cfg.fireLead); else p.delete('fire');
  if (cfg.leadSec !== DEFAULT_CFG.leadSec) p.set('lead', cfg.leadSec); else p.delete('lead');
  return p;
}
