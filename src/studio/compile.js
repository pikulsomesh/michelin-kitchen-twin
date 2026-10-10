// Compile a studio configuration into what the simulation runs: a KitchenData object (the shape in
// src/sim/data/fallback.js) plus a config patch for createSim / Engine. Pure and deterministic, so the
// same studio link always produces the same service.
import { INGREDIENTS, COMPONENTS, PREP, DISHES, KITCHEN_MAP } from './catalog.js';
import { seatsOf } from './config.js';
import { explodeRequirements, dishDemand, unitCosts } from '../sim/mrp.js';

const OUT_OF_SEASON_COST = 1.8;   // greenhouse or air-freighted produce
const OUT_OF_SEASON_SUPPLY = 0.85; // deliveries of out-of-season produce arrive short more often
const IN_SEASON_COST = 0.85;       // peak-season market price (and the garden)

/** @returns {{ data, cfg, summary, warnings }} */
export function compileStudio(studio, base) {
  const warnings = [];
  const { dining, menu, season } = studio;
  // ---- courses -------------------------------------------------------------------------------
  let courses;
  if (menu.format === 'carte') {
    courses = menu.carte.filter((c) => c.enabled && c.items.some((i) => i.weight > 0)).map((c) => ({
      id: c.id, name: c.name, eatSec: Math.round(c.eatMin * 60),
      parts: [c.items.filter((i) => i.weight > 0).map((i) => ({ dish: i.dish, weight: i.weight }))],
    }));
  } else {
    courses = menu.tasting.filter((c) => c.enabled && c.parts.some((p) => p.length)).map((c, i) => ({
      id: `c${i + 1}`, name: c.name, eatSec: Math.round(c.eatMin * 60),
      parts: c.parts.filter((p) => p.length).map((p) => p.map((o) => ({ dish: o.dish, weight: Math.max(0.01, o.weight) }))),
    }));
  }
  if (!courses.length) {
    warnings.push('The menu has no courses, so the house menu runs instead.');
    courses = base.courses;
  }

  // ---- dishes, prep and ingredients actually used -----------------------------------------------
  const dishIds = new Set(courses.flatMap((c) => c.parts.flat().map((o) => o.dish)).filter((d) => d != null));
  const catalogDish = Object.fromEntries(DISHES.map((d) => [d.id, d]));
  const stationIds = new Set(base.stations.map((s) => s.id));
  const applTypes = new Set(base.appliances.map((a) => a.type));
  const roleHome = {};
  for (const s of base.staff) for (const r of s.roles) roleHome[r] ??= s.home;
  const roles = new Set(Object.keys(roleHome));
  const ingIds = new Set(base.ingredients.map((i) => i.id));
  // catalogue recipes name generic stations, roles, machines and staples; map them onto this kitchen
  const pick = (cands, ok) => cands.find((c) => c == null || ok(c)) ?? null;
  const fit = (st) => {
    const m = KITCHEN_MAP;
    const role = roles.has(st.role) ? st.role : pick(m.role[st.role] ?? [], (r) => roles.has(r)) ?? st.role;
    const station = stationIds.has(st.station) ? st.station : pick(m.station[st.station] ?? [], (x) => stationIds.has(x)) ?? roleHome[role] ?? base.stations[0].id;
    const appliance = !st.appliance ? null : applTypes.has(st.appliance) ? st.appliance : pick(m.appliance[st.appliance] ?? [], (a) => applTypes.has(a));
    const uses = {};
    for (const [k, q] of Object.entries(st.uses || {})) uses[ingIds.has(k) ? k : (m.ingredient[k] ?? []).find((a) => ingIds.has(a)) ?? k] = q;
    return { ...st, role, station, appliance, uses };
  };

  const dishes = base.dishes.filter((d) => dishIds.has(d.id));
  for (const id of dishIds) {
    if (dishes.some((d) => d.id === id)) continue;
    const d = catalogDish[id];
    if (!d) { warnings.push(`Unknown dish "${id}" was dropped.`); continue; }
    dishes.push({ id: d.id, name: d.name, holdSec: d.holdSec, steps: d.steps.map(fit) });
  }
  const known = new Set(dishes.map((d) => d.id));
  // a null dish is "no supplement": the guest skips that part
  for (const c of courses) c.parts = c.parts.map((p) => p.filter((o) => o.dish == null || known.has(o.dish))).filter((p) => p.some((o) => o.dish != null));

  // catalogue prep recipes whose outputs something needs (transitively)
  const baseIng = new Map(base.ingredients.map((i) => [i.id, i]));
  const catIng = new Map([...INGREDIENTS, ...COMPONENTS].map((i) => [i.id, i]));
  const needed = new Set();
  const visitUses = (uses) => { for (const k of Object.keys(uses || {})) needed.add(k); };
  for (const d of dishes) for (const st of d.steps) visitUses(st.uses);
  const prep = [...base.prep];
  const producedBy = new Map(PREP.flatMap((p) => Object.keys(p.yields).map((k) => [k, p])));
  const added = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...needed]) {
      if (baseIng.has(id) && base.prep.some((p) => p.yields[id] != null)) continue;
      const p = producedBy.get(id);
      if (p && !added.has(p.id)) { added.add(p.id); prep.push(fit(p)); visitUses(p.uses); grew = true; }
    }
  }

  const ingredients = base.ingredients.map((i) => ({ ...i }));
  for (const id of needed) {
    if (baseIng.has(id)) continue;
    const def = catIng.get(id);
    if (!def) { warnings.push(`Ingredient "${id}" has no definition.`); continue; }
    ingredients.push({ ...def });
  }
  // seasonality: market price and delivery reliability
  const supply = {};
  for (const i of ingredients) {
    const seasons = i.seasons ?? catIng.get(i.id)?.seasons;
    if (!seasons || i.kind === 'component') continue;
    if (seasons.includes(season)) i.cost = +(i.cost * IN_SEASON_COST).toFixed(5);
    else { i.cost = +(i.cost * OUT_OF_SEASON_COST).toFixed(5); supply[i.id] = OUT_OF_SEASON_SUPPLY; i.outOfSeason = true; }
  }

  // ---- dining room ---------------------------------------------------------------------------
  const tables = dining.tables.map((t) => ({ id: t.id, seats: t.seats }));
  const seats = seatsOf(tables);
  const biggest = Math.max(0, ...tables.map((t) => t.seats));
  if (biggest < 6) warnings.push(`No table seats more than ${biggest}: parties of ${biggest + 1} to 6 will wait all night. Add a six-top.`);
  if (!tables.length) warnings.push('The dining room has no tables.');

  const data = { ...base, meta: { ...base.meta, studio: true, season }, ingredients, prep, dishes, courses, dining: { ...base.dining, tables } };
  // starting stock for 'fixed' purchasing mirrors fallback.js: one plan for the covers plus 8%
  const { raw } = explodeRequirements(data, Math.max(1, dining.covers), 1.08);
  for (const i of ingredients) if (i.kind !== 'component' && !baseIng.has(i.id)) {
    const step = i.unit === 'ea' ? 1 : 100; const req = raw[i.id] || 0;
    i.onHand = Math.ceil(req / step) * step; i.par = Math.ceil((req * 0.15) / step) * step;
  }

  // seating: one scenario built from the studio's hours and curve, in the shape data/service.json uses
  const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  let d0 = dining.doorsOpen; let d1 = dining.lastSeating;
  if (d1 <= d0) { warnings.push('Last seating is before doors open; using doors open + 30 minutes.'); d1 = d0 + 0.5; }
  const seatingScenario = dining.seating === 'rush'
    ? { id: 'studio', name: 'Rush', waves: [{ at: hhmm(d0 + 0.5), share: 1, spreadMin: 30 }] }
    : dining.seating === 'twoTurn'
      ? { id: 'studio', name: 'Two turns', waves: [{ at: hhmm(d0 + 0.5), share: 0.5, spreadMin: 30 }, { at: hhmm(Math.max(d0 + 2, d1 - 0.5)), share: 0.5, spreadMin: 30 }] }
      : { id: 'studio', name: 'Staggered', firstSeating: hhmm(d0), lastSeating: hhmm(d1), intervalMin: 15 };
  data.seatingScenarios = [...(base.seatingScenarios || []).filter((x) => x.id !== 'studio'), seatingScenario];

  const cfg = { covers: dining.covers, seating: 'studio', seed: dining.seed ?? 1, noShowRate: dining.noShowRate, supply,
    eatScale: dining.pace, patienceMin: dining.patienceMin ?? 60,
    doorsOpen: Math.round(d0 * 3600), lastSeating: Math.round(d1 * 3600) };

  return { data, cfg, warnings, summary: summarize(studio, data, cfg, seats) };
}

/** Menu engineering and floor numbers the studio shows before running the service. */
function summarize(studio, data, cfg, seats) {
  // standard cost: what each plate's ingredients cost, prep components costed through their recipes
  const unit = unitCosts(data);
  const dishCost = Object.fromEntries(data.dishes.map((d) => [d.id, d.steps.reduce((s, st) => s + Object.entries(st.uses || {}).reduce((a, [k, q]) => a + q * (unit[k] || 0), 0), 0)]));
  const covers = Math.max(1, cfg.covers);
  const rawCost = Object.entries(dishDemand(data, covers)).reduce((s, [id, q]) => s + q * (dishCost[id] || 0), 0);
  let check;
  if (studio.menu.format === 'carte') {
    check = studio.menu.carte.filter((c) => c.enabled).reduce((s, c) => {
      const items = c.items.filter((i) => i.weight > 0); const w = items.reduce((a, i) => a + i.weight, 0);
      return s + (w ? items.reduce((a, i) => a + i.priceUSD * i.weight, 0) / w : 0);
    }, 0);
  } else check = studio.menu.tastingPriceUSD;
  const mealMin = data.courses.reduce((s, c) => s + (c.eatSec / 60) * (cfg.eatScale ?? 1), 0) + data.courses.length * 4 + 5;
  const window = (cfg.lastSeating - cfg.doorsOpen) / 3600;
  const turns = seats ? covers / seats : 0;
  const outOfSeason = data.ingredients.filter((i) => i.outOfSeason).map((i) => i.name);
  return {
    seats, covers, turns, courses: data.courses.length, dishes: data.dishes.length,
    plates: data.courses.reduce((s, c) => s + c.parts.length, 0) * covers,
    mealMin: Math.round(mealMin), checkUSD: check, revenueUSD: check * covers, foodCostUSD: rawCost,
    foodCostPct: check ? rawCost / covers / check : 0, seatingWindowH: window,
    taktSec: covers ? (window * 3600) / covers : 0,
    outOfSeason, dishCost,
  };
}
