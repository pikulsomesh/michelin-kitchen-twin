// Studio: configuration -> compiled KitchenData -> simulation, plus the lighting model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptKitchenData } from '../src/sim/adapter.js';
import { runHeadless } from '../src/sim/scenarios.js';
import { defaultStudio, withSeason, encodeStudio, decodeStudio, tablesFromMix, seatsOf, DINING_PRESETS, dishPool } from '../src/studio/config.js';
import { compileStudio } from '../src/studio/compile.js';
import { computeLook, sunPosition, kelvinToHex, MOODS } from '../src/studio/look.js';
import { SEASONS, DISHES } from '../src/studio/catalog.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const base = adaptKitchenData(Object.fromEntries(['items', 'products', 'menu', 'resources', 'service', 'layout', 'restaurant'].map((n) => [n, read(n)])));
const run = (s) => { const c = compileStudio(s, base); return { c, r: runHeadless(c.data, c.cfg) }; };

test('every season and format compiles and serves every guest', () => {
  let s = defaultStudio(base, { season: 'spring' });
  for (const season of SEASONS) for (const format of ['tasting', 'carte']) {
    s = { ...withSeason(s, base, season), menu: { ...withSeason(s, base, season).menu, format } };
    const { c, r } = run(s);
    assert.deepEqual(c.warnings, [], `${season} ${format}`);
    assert.equal(r.covers.finished + r.covers.noShows, r.covers.booked, `${season} ${format}: everyone booked is served or a no-show`);
    // every dish on the menu is in the compiled data, with a routing that names real stations
    const stations = new Set(c.data.stations.map((x) => x.id));
    for (const d of c.data.dishes) for (const st of d.steps) assert.ok(stations.has(st.station), `${d.id} ${st.station}`);
  }
});

test('changing season swaps seasonal dishes and keeps the signatures', () => {
  const fall = defaultStudio(base, { season: 'fall' });
  const winter = withSeason(fall, base, 'winter');
  const dishes = (s) => s.menu.tasting.flatMap((c) => c.parts.flat().map((o) => o.dish));
  const seasonalIn = (s, season) => dishes(s).filter((id) => DISHES.find((d) => d.id === id)?.seasons.includes(season));
  assert.ok(seasonalIn(fall, 'fall').length >= 4, 'fall menu carries fall dishes');
  assert.equal(seasonalIn(winter, 'fall').filter((id) => !DISHES.find((d) => d.id === id).seasons.includes('winter')).length, 0, 'no fall-only dish left in winter');
  assert.ok(seasonalIn(winter, 'winter').length >= 4);
  for (const sig of ['FG-C1-OYSTERS-PEARLS', 'FG-C9-COFFEE-DOUGHNUTS', 'FG-C4-LOBSTER']) assert.ok(dishes(winter).includes(sig), sig);
});

test('à la carte never lists a supplement as a dish', () => {
  const pool = dishPool(base);
  const s = defaultStudio(base, { season: 'summer' });
  for (const c of s.menu.carte) for (const i of c.items) assert.ok(!pool.get(i.dish).supplement, i.dish);
});

test('same studio, same service (deterministic)', () => {
  const s = defaultStudio(base, { season: 'winter' });
  assert.deepEqual(run(s).r.kpis, run(s).r.kpis);
});

test('a smaller room with the same bookings makes guests wait for tables, and some walk away', () => {
  const house = defaultStudio(base, { season: 'fall' });
  const small = { ...house, dining: { ...house.dining, tables: tablesFromMix({ 2: 8, 4: 4, 6: 1, 8: 0 }) } };
  const a = run(house).r; const b = run(small).r;
  assert.ok(seatsOf(small.dining.tables) < seatsOf(house.dining.tables));
  assert.ok(b.guests.tableWaitP90 > a.guests.tableWaitP90, 'longer waits for a table');
  assert.ok(b.guests.balked > 0 && b.guests.lostRevenue > 0, 'impatient parties leave');
  // more patience keeps them in the queue
  const patient = run({ ...small, dining: { ...small.dining, patienceMin: 240 } }).r;
  assert.ok(patient.guests.balked < b.guests.balked);
});

test('a room with no six-top warns that large parties cannot be seated', () => {
  const s = defaultStudio(base, { season: 'fall' });
  s.dining.tables = tablesFromMix(DINING_PRESETS.intimate.mix);
  assert.match(compileStudio(s, base).warnings.join(' '), /six-top/);
});

test('a studio survives the share link', () => {
  const s = withSeason(defaultStudio(base, { season: 'fall' }), base, 'spring');
  s.menu.format = 'carte'; s.look.kelvin = 3100; s.dining.covers = 80;
  const back = decodeStudio(encodeStudio(s), base);
  assert.equal(back.season, 'spring'); assert.equal(back.menu.format, 'carte'); assert.equal(back.look.kelvin, 3100); assert.equal(back.dining.covers, 80);
  assert.deepEqual(back.dining.tables.map((t) => t.seats), s.dining.tables.map((t) => t.seats));
  assert.equal(decodeStudio('not-a-link', base), null);
});

test('sun follows the season in Yountville', () => {
  const noon = (season) => sunPosition(13.2, season).elevationDeg;
  assert.ok(noon('summer') > 70 && noon('winter') < 33, 'high summer sun, low winter sun');
  assert.ok(sunPosition(19.5, 'summer').elevationDeg > 0, 'still light at 7:30 pm in July');
  assert.ok(sunPosition(19.5, 'winter').elevationDeg < -15, 'dark at 7:30 pm in January');
  const set = sunPosition(20.4, 'summer');
  assert.ok(set.azimuthDeg > 280 && set.azimuthDeg < 310, 'summer sun sets in the north-west');
});

test('moods change the light', () => {
  assert.equal(kelvinToHex(6600) >> 16, 255);
  assert.ok((kelvinToHex(2700) & 255) < (kelvinToHex(5000) & 255), 'warm light has less blue');
  const candle = computeLook({ ...MOODS.candlelit.look }, 'winter');
  const day = computeLook({ ...MOODS.editorial.look }, 'summer');
  assert.equal(candle.sun.intensity, 0);
  assert.ok(day.sun.intensity > 1 && day.daylight === 1);
  assert.ok(candle.interior.intensity < day.interior.intensity);
  assert.equal(computeLook({ ...MOODS.service.look, weather: 'snow' }, 'winter').precipitation, 1);
});
