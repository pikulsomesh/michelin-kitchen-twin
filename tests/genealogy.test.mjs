import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { buildFallbackData } from '../src/sim/data/fallback.js';
import { plateGenealogy } from '../src/sim/genealogy.js';

const data = buildFallbackData();

test('a served plate has a complete genealogy: routing, materials, lead time', () => {
  const sim = createSim({ data, covers: 30, seed: 4 });
  sim.seek(sim.end);
  const tk = sim.engine.tickets.find((t) => t.status === 'served' && t.lines.length);
  const g = plateGenealogy(sim.engine, tk.id, tk.lines[0].dish.id);
  assert.equal(g.ticket, tk.id);
  assert.equal(g.leadTime, tk.servedAt - tk.fireAt);
  assert.ok(g.steps.length >= 2);
  assert.ok(g.steps.every((s) => s.state === 'done' && s.start <= s.end));
  assert.ok(g.steps.some((s) => s.staff), 'some step names its cook');
  assert.match(g.steps.at(-1).name, /^Run to table/);
  assert.ok(g.materials.length > 0 && g.cost >= 0);
});

test('a plate mid-service shows queued steps, and unknown plates return null', () => {
  const sim = createSim({ data, covers: 30, seed: 4 });
  sim.seek(sim.config.doorsOpen + 3600);
  const tk = sim.engine.tickets.find((t) => t.status !== 'served' && t.lines.length);
  if (tk) {
    const g = plateGenealogy(sim.engine, tk.id, tk.lines[0].dish.id);
    assert.equal(g.servedAt, null);
    assert.equal(g.leadTime, null);
    assert.ok(g.steps.some((s) => s.state !== 'done'));
  }
  assert.equal(plateGenealogy(sim.engine, 'nope', 'x'), null);
});
