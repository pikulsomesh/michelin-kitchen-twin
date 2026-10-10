// Adapts the sourced `data/*.json` model (items, products with BOM + routing, resources, layout, service)
// into the KitchenData shape the simulation engine consumes. Pure function: no I/O, runs in Node and the browser.
//
//   const data = adaptKitchenData({ items, products, menu, resources, service, layout, restaurant });
//
// Modelling choices (all marked "est" in the engine docs):
//  - Routings are sequential chains ordered by `seq`; the last operation at the pass is the QC/plating gate.
//  - Intermediates are prepared in batches before service (BOM explosion), except those whose lead time cannot fit
//    the prep window (stocks, cures, torchon): those are "carry-over" stock made on a previous day.
//  - Operations with `role: null` are unattended (proofing, chilling): they occupy a machine, not a cook.
//  - Senior roles can cover any work centre in their `skills`; commis and prep cooks only their own role.
//  - The data has no food runners or dining-room geometry, so runners and a dining station are added (estimates).

const MIN = 60;
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h + (m || 0) / 60; };
const hh = (s) => hm(s) * 3600;

const COST_BY_CATEGORY = { dairy: 0.014, cheese: 0.07, seafood: 0.09, meat: 0.07, produce: 0.012, herb: 0.08, dry: 0.006, bakery: 0.01, bar: 0.03 };
const COST_OVERRIDES = [[/caviar/i, 6], [/truffle/i, 2.5], [/foie/i, 0.2], [/wagyu|beef|calotte/i, 0.06], [/lobster/i, 0.13], [/oyster/i, 2.4], [/yellowtail|hamachi/i, 0.1], [/duck/i, 0.04], [/veal/i, 0.04], [/gold|saffron/i, 3]];
const MTBF = { combi: 40, 'fry-kettle': 50, hearth: 90, rotisserie: 60, pacojet: 45, 'cooking-suite': 60, range: 70 };
const JUNIOR = /^(commis|prep-cook|dishwasher|butcher)/;

export function adaptKitchenData({ items, products, menu, resources, service, layout, restaurant }) {
  const itemList = items.items ?? items; const prodList = products.products ?? products;
  const itemBy = Object.fromEntries(itemList.map((i) => [i.id, i]));
  const prodBy = Object.fromEntries(prodList.map((p) => [p.id, p]));
  const equipBy = Object.fromEntries(resources.equipment.map((e) => [e.id, e]));
  const walkSpeed = service.travel?.walkSpeedMps ?? 1.1;

  // ---- ingredients & components ------------------------------------------------------------------
  const ingredients = [];
  for (const i of itemList) {
    const over = COST_OVERRIDES.find(([re]) => re.test(i.id + i.name));
    ingredients.push({ id: i.id, name: i.name, unit: i.uom, storage: i.storage, kind: 'raw', yieldPct: i.yieldPct ?? 1, shelfLifeDays: i.shelfLifeDays,
      cost: over ? over[1] : COST_BY_CATEGORY[i.category] ?? 0.015, costEstimated: true, par: 0, onHand: 0 });
  }
  const grossUse = (bom) => {
    const uses = {};
    for (const b of bom || []) { const it = itemBy[b.item]; uses[b.item] = (uses[b.item] || 0) + b.qty / (it?.yieldPct || 1); }
    return uses;
  };

  // ---- operations -> engine steps ------------------------------------------------------------------
  const opToStep = (op, batchYield, perBatchUnits) => {
    const unitMode = op.per === 'unit';
    const base = (op.setupMin || 0) + (op.runMin || 0) * (perBatchUnits && unitMode ? batchYield : 1);
    const dur = Math.max(0, base * MIN);
    const attend = op.role ? Math.max(Math.min(dur, 3), dur * (op.laborFraction ?? 1)) : 0;
    const batch = !perBatchUnits && unitMode && base > 0 ? (op.runMin || 0) / base : 0;
    return { name: op.name, station: op.workCenter, appliance: op.equipment || null, role: op.role || null, dur, attend, batch: Math.max(0, Math.min(1, batch)), wait: !!op.wait };
  };

  // ---- prep recipes (intermediates) ----------------------------------------------------------------
  const intermediates = prodList.filter((p) => p.type === 'intermediate');
  const prepSteps = Object.fromEntries(intermediates.map((p) => [p.id, [...p.routing].sort((a, b) => a.seq - b.seq).map((o) => opToStep(o, p.batchYield, true))]));
  const own = (id) => prepSteps[id].reduce((a, s) => a + s.dur, 0);
  const inputsOf = (p) => (p.bom || []).map((b) => b.item).filter((id) => prodBy[id]?.type === 'intermediate');
  const leadMemo = {};
  const lead = (id) => (leadMemo[id] ??= own(id) + Math.max(0, ...inputsOf(prodBy[id]).map(lead)));
  const times = resolveTimes(service, resources);
  const prepWindow = times.firstSeating - times.prepStart - 3600;

  // when is each intermediate needed? (latest-start scheduling for priority)
  const needMemo = {};
  const consumers = {};
  for (const p of prodList) for (const id of inputsOf(p)) (consumers[id] ||= []).push(p);
  const need = (id) => (needMemo[id] ??= Math.min(...(consumers[id] || []).map((c) => (c.type === 'finished' ? times.firstSeating - 1200 : need(c.id) - own(c.id))), times.firstSeating - 1200));

  const prep = intermediates.map((p) => {
    const steps = prepSteps[p.id]; const n = steps.length; const n0 = need(p.id);
    let remaining = steps.reduce((a, s) => a + s.dur, 0);
    const withDue = steps.map((s) => { remaining -= s.dur; return { ...s, due: n0 - remaining }; });
    return { id: `P-${p.id}`, name: p.name, steps: withDue, station: steps[0].station, uses: grossUse(p.bom), yields: { [p.id]: p.batchYield }, due: n0,
      carryover: lead(p.id) > prepWindow, leadHours: lead(p.id) / 3600, phase: p.phase, n };
  });
  for (const p of intermediates) {
    const it = { id: p.id, name: p.name, unit: p.uom, storage: p.storage, cost: 0, kind: 'component', onHand: 0, shelfLifeHours: p.shelfLifeHours };
    it.carryover = prep.find((r) => r.id === `P-${p.id}`).carryover;
    ingredients.push(it);
  }

  // ---- dishes (finished goods) ---------------------------------------------------------------------
  const dishes = prodList.filter((p) => p.type === 'finished').map((p) => {
    const ops = [...p.routing].sort((a, b) => a.seq - b.seq).map((o) => opToStep(o, 1, false));
    const steps = ops.map((o, i) => ({ id: `s${i + 1}`, name: o.name, station: o.station, appliance: o.appliance, role: o.role, dur: o.dur, attend: o.attend, batch: o.batch,
      uses: i === 0 ? scaleUses(grossUse(p.bom)) : {}, after: i ? [`s${i}`] : [], plate: i === ops.length - 1 }));
    return { id: p.id, name: p.name.split(':')[0].trim(), fullName: p.name, holdSec: (p.holdMinutes ?? 5) * 60, steps };
  });
  function scaleUses(u) { return u; }

  // ---- menu -> courses -------------------------------------------------------------------------------
  const gap = service.pacing?.courseGapMinutes?.mean ?? 17;
  const courses = menu.courses.map((c) => {
    const parts = [c.options.map((o) => ({ dish: o.product, weight: o.share }))];
    for (const inc of c.includes || []) parts.push([{ dish: inc.product, weight: 1 }]);
    for (const sup of c.supplements || []) parts.push([{ dish: sup.product, weight: sup.uptake }, { dish: null, weight: 1 - sup.uptake }]);
    return { id: c.id, name: c.name, eatSec: Math.max(300, gap * MIN - 120), parts };
  });

  // ---- stations (work centres) with layout geometry -------------------------------------------------
  const zone = Object.fromEntries((layout.zones || []).map((z) => [z.id, z]));
  const staffByWc = {};
  for (const s of resources.staff) for (const wc of s.skills) staffByWc[wc] = (staffByWc[wc] || 0) + 1;
  const annexDist = (service.travel?.kitchenToAnnexMin ?? 1.5) * MIN * walkSpeed;
  const stations = resources.workCenters.map((w) => {
    const z = zone[w.id]; const remote = w.area === 'annex';
    const x = z ? z.x + z.width / 2 : 8; const y = z ? z.z + z.depth / 2 : 10;
    return { id: w.id, name: w.name, area: w.area, x: remote ? x : x, y: remote ? y + annexDist : y, mapX: x, mapY: remote ? 12.6 : y, w: z?.width, d: z?.depth, remote,
      capacity: Math.max(2, Math.min(7, (staffByWc[w.id] || 2) + 1)) };
  });
  stations.push({ id: 'dining', name: 'Dining room', area: 'dining', x: -7, y: 5.4, mapX: -7, mapY: 5.4, remote: false, capacity: 99 });

  // ---- appliances ---------------------------------------------------------------------------------------
  const wcOf = {};
  for (const w of resources.workCenters) for (const e of w.equipment || []) wcOf[e] ||= w.id;
  const appliances = resources.equipment.map((e) => ({
    id: e.id, type: e.id, name: e.name, station: wcOf[e.id] || 'WC-GM', capacity: e.capacity?.slots ?? 99, kind: e.type,
    mtbfH: MTBF[e.type] ?? 90, mttrMin: 25, kw: e.type === 'storage' ? 0.4 : 8, tracked: !!e.capacity?.slots,
  }));

  // ---- staff ---------------------------------------------------------------------------------------------
  const shiftWin = Object.fromEntries(resources.shifts.map((s) => [s.id, [hm(s.start), hm(s.end) <= hm(s.start) ? hm(s.end) + 24 : hm(s.end)]]));
  const sh = (id) => (id === 'prep+service' ? [shiftWin.prep[0], shiftWin.service[1]] : shiftWin[id]);
  const roleName = Object.fromEntries(resources.laborRoles.map((r) => [r.id, r.name]));
  const wcRoles = {};
  for (const p of prodList) for (const o of p.routing || []) if (o.role) (wcRoles[o.workCenter] ||= new Set()).add(o.role);
  const counter = {};
  const staff = resources.staff.map((s) => {
    const roles = new Set([s.role]);
    if (!JUNIOR.test(s.role)) for (const wc of s.skills) for (const r of wcRoles[wc] || []) if (!JUNIOR.test(r) || r === s.role) roles.add(r);
    if (!JUNIOR.test(s.role)) for (const wc of s.skills) for (const r of wcRoles[wc] || []) roles.add(r);
    counter[s.role] = (counter[s.role] || 0) + 1;
    const h = [...s.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return { id: s.id, name: `${(roleName[s.role] || s.role).replace(/ \(.*/, '').replace('Chef de partie, ', 'CdP ').replace('Commis, ', 'Commis ').replace('Chef de cuisine', 'Chef de cuisine')} ${resources.staff.filter((x) => x.role === s.role).length > 1 ? counter[s.role] : ''}`.trim(),
      title: roleName[s.role] || s.role, role: s.role, roles: [...roles], home: s.homeStation, shift: sh(s.shift), skill: 0.92 + (h % 17) / 100 };
  });
  for (let i = 1; i <= 4; i++) staff.push({ id: `FOH-RUNNER-${i}`, name: `Food Runner ${i}`, title: 'Food runner (est.)', role: 'runner', roles: ['runner'], home: 'WC-PASS', shift: shiftWin.service, skill: 1 + (i % 2) * 0.05 });

  // ---- scenarios, dining room, config ----------------------------------------------------------------------
  const seats = restaurant.diningSeats?.value ?? restaurant.diningSeats ?? 62;
  const total = Math.round(seats * 1.5); // dining room + garden + private room
  const tables = [];
  let left = total; let n = 0;
  for (const size of [6, 4, 2]) { const count = size === 6 ? Math.round(total * 0.1 / 6) : size === 4 ? Math.round(total * 0.35 / 4) : 0; for (let i = 0; i < count; i++) { tables.push({ id: `T${++n}`, seats: size }); left -= size; } }
  while (left > 0) { tables.push({ id: `T${++n}`, seats: 2 }); left -= 2; }
  tables.sort((a, b) => a.seats - b.seats);
  tables.forEach((t, i) => { t.id = `T${i + 1}`; });

  const scenarios = (service.whatIf || []).map((w) => {
    const c = w.changes; const patch = {};
    if (c.covers) patch.covers = c.covers;
    if (c.removeStaff) patch.staffOut = c.removeStaff;
    if (c.equipmentDown) patch.faults = c.equipmentDown.map((d) => ({ appliance: d.equipment, at: hh(d.from), durationSec: d.minutes * MIN }));
    if (c.supplyFactor) patch.supply = Object.fromEntries(Object.entries(c.supplyFactor));
    if (c.seatingScenario) patch.seating = c.seatingScenario === 'rush' ? 'rush' : c.seatingScenario;
    return { id: w.id, label: w.name, blurb: describe(w), patch };
  });

  return {
    meta: { restaurant: restaurant.name, menuPricePerCover: menu.priceUSD?.value ?? 390, source: 'data/', estimatedCosts: true },
    ingredients, prep, dishes, courses, appliances, stations, staff,
    dining: { tables, walkSpeed },
    reservations: service.reservations, seatingScenarios: normaliseScenarios(service.seatingScenarios),
    variability: service.variability, quality: service.quality, pacing: service.pacing,
    sim: { passStation: 'WC-PASS', washStation: 'WC-DISH', runnerRole: 'runner', washRole: 'dishwasher', times, defaultSeating: (service.seatingScenarios.find((s) => s.default) || service.seatingScenarios[0]).id,
      defaultCovers: service.defaultCovers?.value ?? 62, scenarios },
  };
}

function describe(w) {
  const c = w.changes;
  if (c.covers) return `Covers jump to ${c.covers}.`;
  if (c.removeStaff) return 'A cook calls in sick.';
  if (c.equipmentDown) return `${c.equipmentDown[0].equipment.replace('EQ-', '').replace(/-/g, ' ').toLowerCase()} fails at ${c.equipmentDown[0].from} for ${c.equipmentDown[0].minutes} min.`;
  if (c.supplyFactor) return `Delivery arrives ${Math.round((1 - Object.values(c.supplyFactor)[0]) * 100)}% short.`;
  return 'Everyone arrives within 30 minutes.';
}

function normaliseScenarios(list) {
  return list.map((s) => ({ ...s, first: s.firstSeating ? hh(s.firstSeating) : null, last: s.lastSeating ? hh(s.lastSeating) : null }));
}

function resolveTimes(service, resources) {
  const prep = resources.shifts.find((s) => s.id === 'prep');
  const def = service.seatingScenarios.find((s) => s.default) || service.seatingScenarios[0];
  const window = seatingWindow(def);
  return { prepStart: hh(prep.start), firstSeating: window[0], doorsOpen: window[0], lastSeating: window[1] };
}

/** [first, last] arrival time (seconds) of a seating scenario */
export function seatingWindow(s) {
  if (s.waves) {
    const lo = Math.min(...s.waves.map((w) => hh(w.at) - (w.spreadMin ?? 30) * 60)); const hi = Math.max(...s.waves.map((w) => hh(w.at) + (w.spreadMin ?? 30) * 60));
    return [lo, hi];
  }
  return [hh(s.firstSeating), hh(s.lastSeating)];
}
