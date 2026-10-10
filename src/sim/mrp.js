// Material requirements planning: explode the tasting menu into raw materials and prep batches,
// exactly like a factory BOM explosion. Used for prep planning, purchasing and the MRP table.

/** Share of guests choosing each dish (every guest eats every course). */
export function dishDemand(data, covers) {
  const out = {};
  for (const c of data.courses) {
    for (const part of c.parts) {
      const total = part.reduce((s, o) => s + (o.weight ?? 1), 0);
      for (const o of part) if (o.dish) out[o.dish] = (out[o.dish] || 0) + (covers * (o.weight ?? 1)) / total;
    }
  }
  return out;
}

export function explodeRequirements(data, covers, safety = 1) {
  const ing = Object.fromEntries(data.ingredients.map((i) => [i.id, i]));
  const recipeOf = {}; // component id -> recipe
  for (const r of data.prep) for (const k of Object.keys(r.yields)) recipeOf[k] = r;
  const demand = dishDemand(data, covers);
  const need = {}; // item id -> qty required (gross, with safety applied to every dish-level use)
  const add = (id, q) => { need[id] = (need[id] || 0) + q; };
  const dishById = Object.fromEntries(data.dishes.map((d) => [d.id, d]));
  for (const [dishId, qty] of Object.entries(demand)) {
    for (const st of dishById[dishId].steps) for (const [id, q] of Object.entries(st.uses || {})) add(id, q * qty * safety);
  }
  // topological order: consumers before producers
  const order = []; const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return; seen.add(id);
    const r = recipeOf[id];
    if (r) for (const u of Object.keys(r.uses || {})) if (recipeOf[u]) visit(u);
    order.push(id);
  };
  for (const id of Object.keys(recipeOf)) visit(id);
  order.reverse();
  const batches = {};
  for (const cid of order) {
    const r = recipeOf[cid]; const q = need[cid] || 0;
    if (!q) continue;
    const n = Math.max(batches[r.id] || 0, Math.ceil(q / r.yields[cid] - 1e-9));
    batches[r.id] = n;
    for (const [u, uq] of Object.entries(r.uses || {})) add(u, uq * n);
  }
  const raw = {};
  for (const [id, q] of Object.entries(need)) if (ing[id] && ing[id].kind !== 'component') raw[id] = q;
  return { demand, need, raw, batches };
}

/** Raw-material availability vs requirement for a given cover count (the "MRP table"). */
export function mrpTable(data, covers, onHand, safety = 1.05) {
  const { raw } = explodeRequirements(data, covers, safety);
  return data.ingredients
    .filter((i) => i.kind !== 'component')
    .map((i) => {
      const required = raw[i.id] || 0;
      const have = onHand ? onHand[i.id] : i.onHand;
      return { id: i.id, name: i.name, unit: i.unit, required, onHand: have, shortfall: Math.max(0, required - have), cost: i.cost, storage: i.storage };
    });
}

/** Roll raw-material cost up through the prep recipes: cost per unit of every ingredient/component. */
export function unitCosts(data) {
  const cost = {}; const ing = Object.fromEntries(data.ingredients.map((i) => [i.id, i]));
  const recipeOf = {};
  for (const r of data.prep) for (const k of Object.keys(r.yields)) recipeOf[k] = r;
  const get = (id) => {
    if (cost[id] !== undefined) return cost[id];
    const r = recipeOf[id];
    if (!r) return (cost[id] = ing[id]?.cost ?? 0);
    cost[id] = 0; // cycle guard
    let total = 0;
    for (const [u, q] of Object.entries(r.uses || {})) total += q * get(u);
    const outQty = Object.values(r.yields).reduce((s, v) => s + v, 0);
    return (cost[id] = total / outQty);
  };
  for (const i of data.ingredients) get(i.id);
  return cost;
}
