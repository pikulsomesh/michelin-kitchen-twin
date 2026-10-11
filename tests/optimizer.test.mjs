import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSim } from '../src/sim/sim.js';
import { buildFallbackData } from '../src/sim/data/fallback.js';
import { loadKitchenData } from '../src/sim/data/load.js';
import { runHeadless } from '../src/sim/scenarios.js';
import { optimize, summarize, candidatesFor, leversFromQuery, leversToQuery } from '../src/sim/optimize.js';
import { scenarioLibrary, forecastCache, configKey, fingerprint } from '../src/sim/precomputed.js';

const data = await loadKitchenData((n) => readFile(new URL(`../data/${n}.json`, import.meta.url), 'utf8').then(JSON.parse));
const STALE = 'src/sim/precomputed.data.js is stale: run `npm run precompute` and commit the result';

test('the precomputed library matches the data and the simulation', () => {
  const lib = scenarioLibrary(data);
  assert.ok(lib, `${STALE} (data fingerprint ${fingerprint(data)})`);
  assert.deepEqual(lib.scenarios.map((s) => s.covers), [40, 62, 90, 120]);
  for (const sc of lib.scenarios) {
    const fresh = summarize(runHeadless(data, sc.config));
    assert.equal(lib.forecasts[configKey(sc.config)], fresh.endT, `${STALE} (${sc.covers} guests)`);
    assert.ok(Math.abs(fresh.mealAvg - sc.base.mealAvg) < 0.01, `${STALE} (${sc.covers} guests meal time)`);
    const rec = sc.candidates.find((c) => c.id === sc.recommended);
    assert.ok(rec, `${sc.covers} guests has a recommended plan`);
    const alt = summarize(runHeadless(data, { ...sc.config, ...rec.patch }));
    assert.equal(lib.forecasts[configKey({ ...sc.config, ...rec.patch })], alt.endT, STALE);
    assert.ok(Math.abs(alt.mealAvg - rec.seed1.mealAvg) < 0.01, STALE);
    assert.ok(rec.ok && rec.mean.mealAvg < sc.baselineMean.mealAvg, 'the recommended plan helps and passes the guards');
  }
});

test('a cached night skips the forecast run and still ends where the forecast says', () => {
  const cache = forecastCache(data);
  const sim = createSim({ data, cache });
  assert.equal(sim.config.covers, data.sim.defaultCovers);
  assert.ok(sim.cached, 'the default night is in the library');
  const end = sim.end;
  assert.equal(sim.forecast.endT, end);
  sim.reset({ covers: 77 });
  assert.ok(!sim.cached, 'an uncached night falls back to a forecast run');
  // loading a scenario from a messy config lands exactly on its cached run
  const sc = scenarioLibrary(data).scenarios.find((s) => s.covers === 90);
  sim.reset({ eatScale: 1.3, extraStaff: [{ like: 'ST-CDP-FISH-1' }] });
  sim.reset({ ...sc.config, ...sc.candidates[0].patch });
  assert.ok(sim.cached);
});

test('an extra cook joins the brigade and the default fire is unchanged', () => {
  const fb = buildFallbackData();
  const base = createSim({ data: fb, covers: 30, seed: 2 }).forecast.snapshot;
  const same = createSim({ data: fb, covers: 30, seed: 2, fireLead: 0.9, leadSec: 75, extraStaff: [] }).forecast.snapshot;
  assert.equal(same.endT, base.endT);
  assert.equal(same.guests.mealAvg, base.guests.mealAvg);
  const like = fb.staff.find((s) => s.roles.length > 1).id;
  const more = createSim({ data: fb, covers: 30, seed: 2, extraStaff: [{ like }] }).forecast.snapshot;
  assert.equal(more.staff.length, base.staff.length + 1);
  assert.ok(more.staff.some((s) => s.id === `${like}-EXTRA-1`));
});

test('the optimizer ranks plans by average meal time and only recommends ones that pass the guards', async () => {
  const fb = buildFallbackData();
  const cfg = createSim({ data: fb, covers: 60, seed: 1 }).config;
  let calls = 0;
  const res = await optimize(fb, cfg, { seeds: [1], onProgress: () => { calls++; } });
  const singles = candidatesFor(fb);
  const combos = Math.min(2, singles.filter((c) => c.kind === 'cook').length) * Math.min(2, singles.filter((c) => c.kind === 'fire').length);
  assert.equal(res.candidates.length, singles.length + combos);
  assert.equal(calls, res.candidates.length + 1);
  for (let i = 1; i < res.candidates.length; i++) assert.ok(res.candidates[i - 1].mean.mealAvg <= res.candidates[i].mean.mealAvg);
  const rec = res.candidates.find((c) => c.id === res.recommended);
  if (rec) assert.ok(rec.ok && rec.saved > 30);
  assert.ok(res.candidates.some((c) => c.kind === 'cook') && res.candidates.some((c) => c.kind === 'fire'));
});

test('share links carry the optimizer levers', () => {
  const cfg = { extraStaff: [{ like: 'ST-SOUS-CHEF-1' }], fireLead: 1.5, leadSec: 225 };
  const p = leversToQuery(cfg, new URLSearchParams('covers=90'));
  assert.equal(p.toString(), 'covers=90&cook=ST-SOUS-CHEF-1&fire=1.5&lead=225');
  assert.deepEqual(leversFromQuery(p), cfg);
  assert.equal(leversToQuery({ extraStaff: [], fireLead: 0.9, leadSec: 75 }, p).toString(), 'covers=90');
});
