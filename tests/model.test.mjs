import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../scripts/load-data.mjs';
import { validate } from '../src/model/validate.js';
import { buildIndex, demandForCovers, explode, loadSummary } from '../src/model/mrp.js';

const data = loadData();
const index = buildIndex(data);

test('data model has no broken references', () => {
  const { errors } = validate(data);
  assert.deepEqual(errors, []);
});

test('every cover gets one plate per course option set', () => {
  const demand = demandForCovers(data.menu, 62);
  assert.equal(demand['FG-C1-OYSTERS-PEARLS'], 62);
  assert.equal(demand['FG-C6A-BEEF'] + demand['FG-C6B-VEAL-TONGUE'] >= 62, true);
});

test('Oysters and Pearls explodes to the published recipe quantities', () => {
  // The published recipe serves 4 with 8 oysters and 2 oz (57 g) caviar.
  const plan = explode(index, { 'FG-C1-OYSTERS-PEARLS': 4 });
  assert.equal(plan.raw['RM-CAVIAR-STURGEON'].net, 56);
  assert.equal(plan.make['INT-OYSTER-SHUCKED'].required, 8);
});

test('intermediates are made in whole batches and raw materials grossed up by yield', () => {
  const plan = explode(index, { 'FG-C3-YELLOWTAIL': 31 });
  assert.equal(plan.make['INT-YELLOWTAIL-PORTION'].batches, 2);
  assert.ok(Math.abs(plan.raw['RM-YELLOWTAIL'].gross - 3000 / 0.85) < 1e-6);
});

test('requirements scale with covers', () => {
  const a = explode(index, demandForCovers(data.menu, 62));
  const b = explode(index, demandForCovers(data.menu, 124));
  assert.ok(b.raw['RM-LOBSTER'].gross > a.raw['RM-LOBSTER'].gross);
  const load = loadSummary(index, b);
  assert.ok(load.labor['cdp-fish'].service > 0);
});
