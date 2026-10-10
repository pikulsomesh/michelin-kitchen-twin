// The studio's editable state: one plain JSON object a viewer shapes, shares as a link and runs.
//   dining   tables and their floor positions, covers, seating curve, hours, eating pace, no-shows
//   menu     tasting (ordered courses, each a list of dish options with guest-choice weights)
//            or à la carte (dishes per course with popularity weights and prices)
//   season   spring | summer | fall | winter (seasonal dishes, produce costs, daylight)
//   look     lighting and mood (time of day, colour temperature, brightness, haze, weather)
import { SEASONS, DISHES, BASE_META, CARTE_COURSES } from './catalog.js';
import { MOODS } from './look.js';
import { unitCosts } from '../sim/mrp.js';

export const VERSION = 1;

// ------------------------------------------------------------------------------------- dining
export const TABLE_TYPES = {
  2: { label: 'Two-top', shape: 'square', w: 0.8, d: 0.8, cell: [2.0, 2.0] },
  4: { label: 'Four-top', shape: 'round', w: 1.2, d: 1.2, cell: [2.5, 2.5] },
  6: { label: 'Six-top', shape: 'round', w: 1.6, d: 1.6, cell: [3.0, 3.0] },
  8: { label: 'Eight-top', shape: 'rect', w: 2.4, d: 1.0, cell: [3.6, 2.4] },
};

export const DINING_PRESETS = {
  'french-laundry': { label: 'House (62 seats)', mix: { 2: 10, 4: 7, 6: 1, 8: 1 }, blurb: 'Two-tops and four-tops in two rooms, one large table: one turn of 62 seats.' },
  intimate: { label: 'Intimate (36 seats)', mix: { 2: 12, 4: 3, 6: 0, 8: 0 }, blurb: 'Mostly couples; parties of 5 or 6 must wait for a table that never comes.' },
  'big-room': { label: 'Big room (96 seats)', mix: { 2: 16, 4: 10, 6: 4, 8: 0 }, blurb: 'The kitchen\'s full rated room: what happens when the dining room outgrows the line.' },
  banquet: { label: 'Private event (48 seats)', mix: { 2: 0, 4: 0, 6: 0, 8: 6 }, blurb: 'Long tables of eight: every course fires as large batches.' },
};

// The dining room sits west of the kitchen (x < 0) in layout.json's metre frame; the kitchen's
// dining-room door is on its west wall at z = 5.4.
export const ROOM = { x1: -0.4, z0: 0.3, z1: 10.5, minDepth: 11.5, door: { z: 5.4, aisle: 1.5 } };

/** Expand a { seats: count } mix into tables and place them on a grid, biggest first. */
export function tablesFromMix(mix, shapes = {}) {
  const out = []; let n = 0;
  for (const seats of [8, 6, 4, 2]) for (let i = 0; i < (mix[seats] || 0); i++) {
    const t = TABLE_TYPES[seats];
    out.push({ id: `T${++n}`, seats, shape: shapes[seats] || t.shape, x: 0, z: 0, rotY: 0 });
  }
  return layoutTables(out);
}

/** Shelf-pack tables into the dining room, rows along z, keeping an aisle in front of the kitchen door. */
export function layoutTables(tables) {
  const rows = [];
  const zSpan = ROOM.z1 - ROOM.z0;
  let x = ROOM.x1; let colW = 0; let z = ROOM.z0;
  const aisle = [ROOM.door.z - ROOM.door.aisle / 2, ROOM.door.z + ROOM.door.aisle / 2];
  for (const t of tables) {
    const [cw, cd] = TABLE_TYPES[t.seats]?.cell ?? [2.4, 2.4];
    if (z + cd > ROOM.z0 + zSpan + 1e-6) { x -= colW; colW = 0; z = ROOM.z0; }
    // the first column stays clear of the door aisle so runners can reach the pass
    if (x === ROOM.x1 && z < aisle[1] && z + cd > aisle[0]) z = aisle[1];
    if (z + cd > ROOM.z0 + zSpan + 1e-6) { x -= colW; colW = 0; z = ROOM.z0; }
    t.x = +(x - cw / 2).toFixed(2); t.z = +(z + cd / 2).toFixed(2); t.rotY = t.seats === 8 ? 90 : 0;
    colW = Math.max(colW, cw); z += cd;
    rows.push(t);
  }
  return rows;
}

export function roomExtent(tables) {
  const minX = Math.min(ROOM.x1 - ROOM.minDepth, ...tables.map((t) => t.x - (TABLE_TYPES[t.seats]?.cell[0] ?? 2.4) / 2 - 0.6));
  return { x0: minX, x1: ROOM.x1 + 0.4, z0: 0, z1: 10.8, area: (ROOM.x1 + 0.4 - minX) * 10.8 };
}

export const seatsOf = (tables) => tables.reduce((s, t) => s + t.seats, 0);
export const mixOf = (tables) => tables.reduce((m, t) => ({ ...m, [t.seats]: (m[t.seats] || 0) + 1 }), { 2: 0, 4: 0, 6: 0, 8: 0 });

// --------------------------------------------------------------------------------------- menu
/** Dish pool: base dishes (with BASE_META, or inferred) plus the seasonal catalogue. */
export function dishPool(base) {
  const pool = new Map();
  const unit = unitCosts(base);
  base.courses.forEach((c, ci) => c.parts.forEach((p) => p.forEach((o) => {
    const d = o.dish && base.dishes.find((x) => x.id === o.dish); if (!d || pool.has(d.id)) return;
    const supplement = /^supplement/i.test(d.name) || p.some((x) => x.dish == null);
    const name = /^supplement$/i.test(d.name.trim()) ? `${c.name} supplement` : d.name;
    // house dishes without a list price are priced at a 28% food cost, rounded to $2
    const cost = d.steps.reduce((s, st) => s + Object.entries(st.uses || {}).reduce((a, [k, q]) => a + q * (unit[k] || 0), 0), 0);
    const meta = BASE_META[d.id] ?? { section: inferSection(c, ci, base.courses.length), priceUSD: Math.min(95, Math.max(18, Math.round(cost / 0.28 / 2) * 2)), eatMin: Math.round(c.eatSec / 60), signature: supplement || SIGNATURE.test(`${c.name} ${d.name}`), supplement };
    pool.set(d.id, { id: d.id, name, seasons: SEASONS, origin: 'house', ...meta });
  })));
  for (const d of DISHES) pool.set(d.id, { id: d.id, name: d.name, section: d.section, seasons: d.seasons, priceUSD: d.priceUSD, eatMin: d.eatMin, origin: 'seasonal', note: d.note });
  return pool;
}

// house dishes that stay on every season's menu
const SIGNATURE = /oysters and pearls|coffee and doughnuts|lobster|canap|bread|mignard|supplement|caviar/i;

function inferSection(course, i, n) {
  const s = course.name.toLowerCase();
  for (const [k, words] of Object.entries({ amuse: ['amuse', 'canap'], cheese: ['cheese', 'fromage'], mignardise: ['mignard', 'petit'], dessert: ['dessert', 'sweet', 'doughnut'], fish: ['fish', 'lobster', 'poisson'], meat: ['meat', 'beef', 'lamb', 'duck', 'poultry'], cold: ['salad', 'oyster', 'garden'] }))
    if (words.some((w) => s.includes(w))) return k;
  const f = i / Math.max(1, n - 1);
  return f < 0.15 ? 'amuse' : f < 0.4 ? 'cold' : f < 0.55 ? 'warm' : f < 0.7 ? 'fish' : f < 0.8 ? 'meat' : 'dessert';
}

/** Tasting menu from the base data's courses, with the season's dishes swapped in. */
export function seasonalTasting(base, season) {
  const courses = base.courses.map((c) => ({
    id: c.id, name: c.name, enabled: true, eatMin: Math.round(c.eatSec / 60),
    parts: c.parts.map((p) => p.map((o) => ({ dish: o.dish, weight: o.weight ?? 1 }))),
  }));
  return applySeason(courses, base, season, { fill: true });
}

/**
 * Swap dishes that are out of season for the season's dish in the same section. With `fill`,
 * also put each seasonal dish on the menu once, replacing the most-chosen non-signature option
 * in the first course whose section matches.
 */
export function applySeason(courses, base, season, { fill = false } = {}) {
  const pool = dishPool(base);
  const seasonal = DISHES.filter((d) => d.seasons.includes(season));
  const used = new Set(courses.flatMap((c) => c.parts.flat().map((o) => o.dish)));
  const take = (section) => {
    const d = seasonal.find((x) => x.section === section && !used.has(x.id));
    if (d) used.add(d.id);
    return d;
  };
  const out = courses.map((c) => ({ ...c, parts: c.parts.map((p) => p.map((o) => ({ ...o }))) }));
  for (const c of out) c.parts = c.parts.map((p) => {
    const kept = [];
    for (const o of p) {
      const meta = pool.get(o.dish);
      if (!meta || meta.seasons.includes(season)) { kept.push(o); continue; }
      const sub = take(meta.section);
      if (sub) kept.push({ dish: sub.id, weight: o.weight });
    }
    return kept.length ? kept : p.slice(0, 1);
  });
  if (fill) for (const c of out) for (const p of c.parts) {
    const ranked = p.map((o, i) => ({ o, i, m: pool.get(o.dish) })).filter((x) => x.m && !x.m.signature && x.m.origin === 'house').sort((a, b) => b.o.weight - a.o.weight);
    for (const r of ranked) {
      const sub = take(r.m.section);
      if (sub) { p[r.i] = { dish: sub.id, weight: r.o.weight }; break; }
    }
  }
  return out;
}

/** À la carte: three courses, each listing the in-season dishes of its sections with popularity weights. */
export function seasonalCarte(base, season) {
  const pool = dishPool(base);
  return CARTE_COURSES.map((cc) => ({
    id: cc.id, name: cc.name, eatMin: cc.eatMin, enabled: true,
    items: [...pool.values()].filter((d) => cc.sections.includes(d.section) && d.seasons.includes(season) && !d.supplement)
      .map((d) => ({ dish: d.id, weight: d.origin === 'seasonal' ? 3 : d.signature ? 2 : 1, priceUSD: d.priceUSD })),
  }));
}

// --------------------------------------------------------------------------------------- whole
export function seasonForDate(date = new Date()) {
  const m = date.getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'fall' : 'winter';
}

export function defaultStudio(base, { season = 'fall' } = {}) {
  const tables = tablesFromMix(DINING_PRESETS['french-laundry'].mix);
  return {
    v: VERSION,
    dining: { preset: 'french-laundry', tables, covers: seatsOf(tables), seating: 'staggered', doorsOpen: 17, lastSeating: 21.5, pace: 1, noShowRate: 0.03, patienceMin: 60, seed: 1 },
    menu: { format: 'tasting', tastingPriceUSD: base.meta?.menuPricePerCover ?? 390, tasting: seasonalTasting(base, season), carte: seasonalCarte(base, season) },
    season,
    look: { ...MOODS.service.look, mood: 'service', weather: 'auto' },
  };
}

/** Change season: menus follow (out-of-season dishes swap), the look keeps its mood. */
export function withSeason(studio, base, season) {
  const carteOld = studio.menu.carte;
  const carteNew = seasonalCarte(base, season).map((c) => {
    const prev = carteOld.find((x) => x.id === c.id);
    return prev ? { ...c, enabled: prev.enabled, eatMin: prev.eatMin } : c;
  });
  return { ...studio, season, menu: { ...studio.menu, tasting: applySeason(studio.menu.tasting, base, season), carte: carteNew } };
}

// ----------------------------------------------------------------------------- share as a link
// Tables are stored as a mix (positions are re-derived) to keep links short.
export function encodeStudio(s) {
  const slim = { ...s, dining: { ...s.dining, tables: undefined, mix: mixOf(s.dining.tables), shapes: Object.fromEntries(s.dining.tables.map((t) => [t.seats, t.shape])) } };
  const json = JSON.stringify(slim);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeStudio(str, base) {
  try {
    const json = decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
    const s = JSON.parse(json);
    if (s.v !== VERSION) return null;
    const def = defaultStudio(base, { season: SEASONS.includes(s.season) ? s.season : 'fall' });
    const tables = tablesFromMix(s.dining?.mix ?? mixOf(def.dining.tables), s.dining?.shapes);
    const { mix, shapes, ...dining } = s.dining ?? {};
    return { ...def, ...s, dining: { ...def.dining, ...dining, tables }, menu: { ...def.menu, ...s.menu }, look: { ...def.look, ...s.look } };
  } catch { return null; }
}
