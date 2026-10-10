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
