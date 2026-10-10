// Material requirements planning for a dinner service.
// Pure functions over the JSON in /data, shared by the browser app and the Node scripts.

export const EST = 'est';

export function buildIndex(data) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const index = {
    data,
    sources: byId(data.sources.sources),
    items: byId(data.items.items),
    products: byId(data.products.products),
    workCenters: byId(data.resources.workCenters),
    equipment: byId(data.resources.equipment),
    roles: byId(data.resources.laborRoles),
    storage: byId(data.resources.storageLocations),
  };
  index.lowLevelCode = lowLevelCodes(index);
  return index;
}

/** Item (raw or make) by id. */
export function lookup(index, id) {
  return index.products.get(id) ?? index.items.get(id);
}

// Low-level code: the deepest level at which an item appears in any BOM.
// Processing items in increasing LLC guarantees all demand for an item is known before it is exploded.
function lowLevelCodes(index) {
  const llc = new Map();
  const visit = (id, level, path) => {
    if (path.has(id)) throw new Error(`BOM cycle through ${[...path, id].join(' > ')}`);
    if ((llc.get(id) ?? -1) >= level) return;
    llc.set(id, level);
    const p = index.products.get(id);
    if (!p) return;
    path.add(id);
    for (const c of p.bom) visit(c.item, level + 1, path);
    path.delete(id);
  };
  for (const p of index.products.values()) if (p.type === 'finished') visit(p.id, 0, new Set());
  for (const p of index.products.values()) if (!llc.has(p.id)) visit(p.id, 0, new Set());
  return llc;
}

/**
 * Independent demand (finished plates) for a number of covers.
 * Option shares and supplement uptake are applied as expected values and rounded up,
 * so 62 covers at a 0.7 / 0.3 split gives 44 beef and 19 veal.
 */
export function demandForCovers(menu, covers, overrides = {}) {
  const demand = {};
  const add = (id, qty) => { demand[id] = (demand[id] ?? 0) + qty; };
  for (const course of menu.courses) {
    for (const opt of course.options) {
      const share = overrides[opt.product] ?? opt.share;
      add(opt.product, Math.ceil(covers * share));
    }
    for (const inc of course.includes ?? []) add(inc.product, covers);
    for (const sup of course.supplements ?? []) {
      const uptake = overrides[sup.product] ?? sup.uptake;
      add(sup.product, Math.ceil(covers * uptake));
    }
  }
  return demand;
}

/**
 * Explode independent demand through the multi-level BOM.
 * Intermediates are made in whole batches (batchYield); raw materials are grossed up by yieldPct.
 * Returns requirements plus the operation load each make item puts on labor and machines.
 */
export function explode(index, demand, { stockFactor = 1 } = {}) {
  const required = new Map();
  for (const [id, qty] of Object.entries(demand)) required.set(id, (required.get(id) ?? 0) + qty * stockFactor);

  const order = [...index.products.keys()].sort((a, b) => index.lowLevelCode.get(a) - index.lowLevelCode.get(b));
  const make = {};
  for (const id of order) {
    const need = required.get(id) ?? 0;
    if (need <= 0) continue;
    const p = index.products.get(id);
    const isFinished = p.type === 'finished';
    const qty = isFinished ? Math.ceil(need) : need;
    const batches = isFinished ? qty / p.batchYield : Math.ceil(qty / p.batchYield - 1e-9);
    const produced = isFinished ? qty : batches * p.batchYield;
    make[id] = { id, name: p.name, type: p.type, uom: p.uom, required: need, batches, produced, phase: p.phase };
    for (const c of p.bom) required.set(c.item, (required.get(c.item) ?? 0) + c.qty * batches);
  }

  const raw = {};
  for (const [id, net] of required) {
    const item = index.items.get(id);
    if (!item) continue;
    const gross = net / (item.yieldPct || 1);
    raw[id] = { id, name: item.name, uom: item.uom, category: item.category, storage: item.storage, net, gross };
  }

  const operations = [];
  for (const m of Object.values(make)) {
    const p = index.products.get(m.id);
    for (const op of p.routing) {
      const units = m.produced;
      let runs;
      if (op.per === 'unit') runs = { count: 1, minutes: op.runMin * units };
      else if (p.type === 'finished') {
        const count = Math.ceil(units / (op.maxBatch ?? 1));
        runs = { count, minutes: op.runMin * count };
      } else runs = { count: m.batches, minutes: op.runMin * m.batches };
      const setup = op.setupMin * (p.type === 'finished' ? 1 : m.batches);
      const elapsed = setup + runs.minutes;
      operations.push({
        product: m.id,
        seq: op.seq,
        name: op.name,
        phase: p.phase,
        workCenter: op.workCenter,
        equipment: op.equipment,
        role: op.role,
        wait: Boolean(op.wait),
        runs: runs.count,
        elapsedMin: elapsed,
        laborMin: op.wait || !op.role ? 0 : setup + runs.minutes * (op.laborFraction ?? 1),
        machineMin: op.equipment ? elapsed : 0,
      });
    }
  }
  return { demand, make, raw, operations };
}

/** Sum labor minutes per role and machine minutes per equipment, split by phase (prep / service). */
export function loadSummary(index, plan) {
  const labor = {};
  const machine = {};
  for (const o of plan.operations) {
    if (o.role && o.laborMin) {
      labor[o.role] ??= { role: o.role, prep: 0, service: 0 };
      labor[o.role][o.phase] += o.laborMin;
    }
    if (o.equipment && o.machineMin && !isStorage(index, o.equipment)) {
      machine[o.equipment] ??= { equipment: o.equipment, prep: 0, service: 0 };
      machine[o.equipment][o.phase] += o.machineMin;
    }
  }
  const shiftMinutes = Object.fromEntries(
    index.data.resources.shifts.map((s) => [s.id, minutesBetween(s.start, s.end)]),
  );
  for (const l of Object.values(labor)) {
    const role = index.roles.get(l.role);
    const onShift = (phase) => (role.shift.includes(phase) ? role.headcount * shiftMinutes[phase] : 0);
    l.available = { prep: onShift('prep'), service: onShift('service') };
    l.utilization = {
      prep: l.available.prep ? l.prep / l.available.prep : null,
      service: l.available.service ? l.service / l.available.service : null,
    };
  }
  return { labor, machine, shiftMinutes };
}

function isStorage(index, equipmentId) {
  const t = index.equipment.get(equipmentId)?.type;
  return t === 'reach-in' || t === 'freezer' || t === 'aging-cooler' || t === 'humidor';
}

export function minutesBetween(start, end) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let d = toMin(end) - toMin(start);
  if (d <= 0) d += 24 * 60;
  return d;
}

/** Critical-path lead time (minutes) to have one batch of an item ready, including waits like curing and freezing. */
export function leadTimeMinutes(index, id, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const p = index.products.get(id);
  if (!p) return 0;
  const own = p.routing.reduce((t, op) => t + op.setupMin + op.runMin * (op.per === 'unit' ? p.batchYield : 1), 0);
  const inputs = Math.max(0, ...p.bom.map((c) => leadTimeMinutes(index, c.item, memo)));
  const total = own + inputs;
  memo.set(id, total);
  return total;
}

/**
 * Start-of-service stock: the plan for `covers` times the par factor in service.json.
 * Raw materials are on hand at gross quantity; sub-assemblies are made in whole batches during prep.
 * Returns { raw: {id: qty}, intermediates: {id: qty} } in each item's uom.
 */
export function startingInventory(index, covers) {
  const { menu, service } = index.data;
  const parFactor = service.inventoryPolicy?.parFactor ?? 1;
  const plan = explode(index, demandForCovers(menu, covers), { stockFactor: parFactor });
  const raw = Object.fromEntries(Object.values(plan.raw).map((r) => [r.id, r.gross]));
  const intermediates = Object.fromEntries(
    Object.values(plan.make).filter((m) => m.type === 'intermediate').map((m) => [m.id, m.produced]),
  );
  return { raw, intermediates };
}
