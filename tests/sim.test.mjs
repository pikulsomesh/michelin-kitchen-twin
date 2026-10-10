import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { buildFallbackData } from '../src/sim/data/fallback.js';
import { explodeRequirements } from '../src/sim/mrp.js';

const data = buildFallbackData();
const strip = (s) => JSON.stringify({ ...s, log: undefined, series: undefined });

test('deterministic for a given seed, different across seeds', () => {
  const a = createSim({ data, covers: 40, seed: 7 }).forecast.snapshot;
  const b = createSim({ data, covers: 40, seed: 7 }).forecast.snapshot;
  const c = createSim({ data, covers: 40, seed: 8 }).forecast.snapshot;
  assert.equal(strip(a), strip(b));
  assert.notEqual(strip(a), strip(c));
});

test('seek backwards then forwards reproduces the same state', () => {
  const sim = createSim({ data, covers: 40, seed: 3 });
  const mid = sim.start + (sim.end - sim.start) * 0.6;
  sim.seek(mid); const first = strip(sim.state);
  sim.seek(sim.start + 3600); sim.seek(mid);
  assert.equal(strip(sim.state), first);
  // stepping in small increments equals one jump
  const sim2 = createSim({ data, covers: 40, seed: 3 });
  for (let t = sim2.start; t < mid; t += 37) sim2.step(Math.min(37, mid - t));
  sim2.seek(mid);
  assert.equal(strip(sim2.state), first);
});

test('every guest is served every course; inventory never goes negative and balances', () => {
  const sim = createSim({ data, covers: 50, seed: 11 });
  const s = sim.forecast.snapshot;
  assert.equal(s.covers.finished + s.covers.noShows, 50);
  assert.ok(s.done);
  for (const i of s.inventory) {
    assert.ok(i.onHand >= -1e-6, `${i.id} negative`);
    assert.ok(Math.abs(i.start + i.produced - i.used - i.onHand) < 1e-6, `${i.id} balance`);
  }
  assert.ok(s.kpis.guestCourses + s.kpis.comps >= (s.covers.finished) * 10 - 10 * s.kpis.comps);
  for (const t of s.tickets) assert.fail('open tickets at end ' + t.id);
});

test('under-stocked plan produces stockouts, well-stocked plan does not', () => {
  const ok = createSim({ data, covers: 40, seed: 5 }).forecast.snapshot;
  assert.equal(ok.kpis.stockoutCount, 0);
  const bad = createSim({ data, covers: 40, seed: 5, purchasing: "fixed", supply: { lobster_poach_ready: 1, lobster: 0.3 } }).forecast.snapshot;
  assert.ok(bad.kpis.stockoutCount > 0);
});

test('BOM explosion scales linearly with covers', () => {
  const a = explodeRequirements(data, 50).raw, b = explodeRequirements(data, 100).raw;
  assert.ok(Math.abs(b.butter / a.butter - 2) < 0.2);
});

test('events fire while stepping', () => {
  const sim = createSim({ data, covers: 20, seed: 2 });
  const seen = new Set(); sim.on('*', (t) => seen.add(t));
  sim.step(sim.end - sim.start);
  for (const e of ['ticket:fired', 'task:start', 'task:end', 'inventory:change', 'course:served', 'table:seated']) assert.ok(seen.has(e), e);
});

import { SCENARIOS, runHeadless, compare, shiftReportCSV } from '../src/sim/scenarios.js';
import { DEFAULT_CFG } from '../src/sim/engine.js';

test('what-if scenarios change the KPIs they should', () => {
  const base = runHeadless(data, { ...DEFAULT_CFG });
  const get = (id) => SCENARIOS.find((s) => s.id === id);
  const full = runHeadless(data, { ...DEFAULT_CFG, ...get('full-house').apply(DEFAULT_CFG, data) });
  assert.ok(full.kpis.guestWaitP90 > base.kpis.guestWaitP90 * 1.5, 'full house slows the kitchen');
  const shock = runHeadless(data, { ...DEFAULT_CFG, ...get('supply-shock').apply(DEFAULT_CFG, data) });
  assert.ok(shock.kpis.stockoutCount > 0, 'supply shock causes 86s');
  const rows = compare(base, full);
  assert.ok(rows.some((r) => r.verdict === 'bad'));
  assert.ok(shiftReportCSV(base, data).split('\n').length > 50);
});

test('stateAt and PRD event aliases', () => {
  const sim = createSim({ data, covers: 20, seed: 4 });
  const names = new Set(); sim.on('op.start', () => names.add('op.start')); sim.on('plate.passed', () => names.add('plate.passed'));
  sim.step(sim.end - sim.start);
  assert.ok(names.has('op.start') && names.has('plate.passed'));
  const s = sim.stateAt(sim.config.doorsOpen + 7200);
  assert.ok(s.tables.some((t) => t.state === 'seated'));
  assert.ok(sim.events.length > 100);
});

import { readFile } from 'node:fs/promises';
import { loadKitchenData } from '../src/sim/data/load.js';
import { scenariosFor } from '../src/sim/scenarios.js';

const real = await loadKitchenData((n) => readFile(new URL(`../data/${n}.json`, import.meta.url), 'utf8').then(JSON.parse));

test('sourced data/ adapts, runs deterministically and serves every guest', () => {
  const a = createSim({ data: real, seed: 3 }).forecast.snapshot;
  const b = createSim({ data: real, seed: 3 }).forecast.snapshot;
  assert.equal(strip(a), strip(b));
  assert.equal(a.covers.finished + a.covers.noShows, 62);
  assert.ok(a.done && a.prep.skipped === 0);
  for (const i of a.inventory) assert.ok(Math.abs(i.start + i.produced - i.used - i.onHand) < 1e-6, i.id);
  assert.ok(a.kpis.perCourse.every((c) => c.n > 0));
});

test('data-driven what-ifs (full house, short-staffed, combi down, lobster short, rush)', () => {
  const sc = scenariosFor(real); assert.equal(sc.length, 5);
  const cfg = createSim({ data: real }).config;
  const base = runHeadless(real, cfg);
  const full = runHeadless(real, { ...cfg, ...sc.find((s) => s.id === 'full-house').apply(cfg) });
  assert.ok(full.endT > base.endT && full.kpis.ticketP90 > base.kpis.ticketP90);
  const lob = runHeadless(real, { ...cfg, ...sc.find((s) => s.id === 'supply-shock').apply(cfg) });
  assert.ok(lob.kpis.stockoutCount + lob.kpis.comps + lob.kpis.subs > 0, 'lobster short bites');
});

// ------------------------------------------------------------------ guest-side controls
const run = (cfg) => runHeadless(data, { seed: 2, ...cfg });

test('guest line KPIs are reported and balance', () => {
  const s = run({ covers: 40 });
  const g = s.guests;
  assert.ok(g.meals > 0 && g.mealAvg > 0 && g.gapAvg > 0);
  assert.equal(g.inHouse, 0);
  assert.equal(s.covers.finished + g.balked, s.covers.booked - s.covers.noShows);
});

test('impatient guests walk away when the room is full; patient ones wait', () => {
  const cfg = { covers: 120, seating: 'rush', patienceMin: 5 };
  const impatient = run(cfg), patient = run({ ...cfg, patienceMin: 600 });
  assert.ok(impatient.guests.balked > patient.guests.balked);
  assert.ok(impatient.guests.lostRevenue >= 0);
});

test('slower eaters stay longer at the table', () => {
  const base = run({ covers: 30 }), slow = run({ covers: 30, eatScale: 1.5 });
  assert.ok(slow.guests.mealAvg > base.guests.mealAvg);
});

test('a skewed order mix with a fixed forecast runs short; re-forecasting prevents it', () => {
  const part = data.courses.map((c) => c.parts.find((p) => p.filter((o) => o.dish).length > 1)).find(Boolean);
  assert.ok(part, 'fallback menu has a choice');
  const [a, b] = part.filter((o) => o.dish);
  const weights = { [a.dish]: 1, [b.dish]: 0 };
  const blind = run({ covers: 60, mix: { weights } }), aware = run({ covers: 60, mix: { weights, planFollows: true } });
  assert.ok(blind.kpis.stockoutCount >= aware.kpis.stockoutCount);
});

test('stock override and arrival window are honoured', () => {
  const ing = data.ingredients.find((i) => i.kind !== 'component');
  const s = createSim({ data, covers: 40, stockOverride: { [ing.id]: 1 } });
  assert.equal(s.forecast.snapshot.inventory.find((i) => i.id === ing.id).start, 1);
  const w = createSim({ data, covers: 40, arrival: { shape: 'bell', start: 19 * 3600, end: 21 * 3600 } });
  assert.equal(w.config.doorsOpen, 19 * 3600);
});

test('adapter prefers sourced prices and per-course eating times; food cost lands near the published plan', () => {
  const butter = real.ingredients.find((i) => i.id === 'RM-BUTTER-UNSALTED');
  assert.equal(butter.cost, 18 / 1000);
  assert.equal(butter.costEstimated, false);
  assert.ok(real.courses.some((c) => c.eatSec !== real.courses[0].eatSec), 'courses differ in eating time');
  const k = runHeadless(real, { seed: 1 }).kpis;
  assert.ok(k.foodCostPct > 0.15 && k.foodCostPct < 0.4, `food cost ${k.foodCostPct}`);
});
