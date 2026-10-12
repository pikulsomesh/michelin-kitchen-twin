import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { buildFallbackData } from '../src/sim/data/fallback.js';
import { serviceSummary } from '../src/sim/summary.js';
import { vocab } from '../src/dashboard/terms.js';
import { createPerfMeter } from '../src/perf.js';

const data = buildFallbackData();

test('end-of-service summary carries the shift report numbers in both vocabularies', () => {
  const sim = createSim({ data, covers: 40, seed: 2 });
  sim.seek(sim.end);
  const st = sim.state;
  assert.ok(st.done);
  const s = serviceSummary(st, sim.config, sim.end);
  const tile = (id) => s.tiles.find((t) => t.id === id);
  assert.equal(tile('covers').value, `${st.covers.finished} / ${st.covers.booked - st.covers.noShows}`);
  assert.equal(tile('stockouts').value, String(st.kpis.stockoutCount));
  assert.equal(tile('ticket').value, `${Math.round(st.kpis.ticketP90 / 60)} min`);
  for (const t of s.tiles) { assert.equal(t.label.length, 2); assert.ok(t.value); }
  assert.match(s.headline[0], /^Service complete/);
  assert.match(s.headline[1], /^Shift complete/);
  assert.ok(s.bottleneck);
});

test('one vocabulary switch reaches every subscriber', () => {
  const seen = [];
  const off = vocab.on((on) => seen.push(on));
  vocab.set(true); vocab.set(true); vocab.set(false);
  off();
  assert.deepEqual(seen, [true, false]);
  assert.equal(vocab.pick(['Covers served', 'Units shipped']), 'Covers served');
});

test('perf meter reports first frame, fps and p95 frame time', () => {
  const m = createPerfMeter();
  assert.equal(m.stats().fps, null);
  // 15 ms frames with every tenth one a 40 ms hitch
  for (let i = 0, t = 1000; i <= 120; i++, t += i % 10 === 9 ? 40 : 15) m.frame(t);
  m.markReady(1200);
  const s = m.stats();
  assert.equal(s.firstFrameMs, 1000);
  assert.equal(s.readyMs, 1200);
  assert.ok(s.fps > 40 && s.fps < 70, `fps ${s.fps}`);
  assert.equal(s.frameP95Ms, 40);
});
