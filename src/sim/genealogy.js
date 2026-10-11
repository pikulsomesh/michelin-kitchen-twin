// Plate genealogy: the traceability record for one dish on one ticket, read from the
// engine's own state. Which cooks and machines made it, when each routing step ran and
// how long it queued, which ingredients (and which prep batch, the "lot") went in, what it
// cost, and its lead time from fire to the table. Pure: reads the engine, changes nothing.
//
//   const g = plateGenealogy(sim.engine, 'K12', 'FG-C3-LOBSTER');

/**
 * @returns null when the ticket or dish is unknown, else
 *   { ticket, table, course, dish, qty, fireAt, platedAt, passAt, servedAt, leadTime, remakes,
 *     steps: [{ name, station, staff, appliance, start, end, wait, state }],
 *     materials: [{ id, name, qty, unit, kind, cost, lot }], cost }
 */
export function plateGenealogy(engine, ticketId, dishId) {
  const tk = engine.tickets.find((t) => t.id === ticketId);
  if (!tk) return null;
  const lines = tk.lines.filter((l) => l.dish.id === dishId);
  const line = lines.find((l) => !l.remake) || lines[0];
  if (!line) return null;
  const data = engine.data;
  const stationName = (id) => engine.stationDef[id]?.name ?? id;

  const steps = line.tasks.map((t) => ({
    name: t.step?.name ?? t.name.split(': ').pop(),
    station: t.station, stationName: stationName(t.station),
    staff: t.staff ? { id: t.staff.id, name: t.staff.def.title || t.staff.def.name } : null,
    appliance: t.appl ? { id: t.appl.id, name: t.appl.def.name } : null,
    start: t.state === 'running' || t.state === 'done' ? t.startAt : null,
    end: t.state === 'done' ? t.endAt : null,
    wait: t.waited ?? null,
    state: t.state === 'done' ? 'done' : t.state === 'running' ? 'running' : t.state === 'cancelled' ? 'cancelled' : 'waiting',
  }));
  if (tk.run) steps.push({
    name: `Run to table ${tk.table}`, station: tk.run.station, stationName: 'Dining room',
    staff: tk.run.staff ? { id: tk.run.staff.id, name: tk.run.staff.def.title || tk.run.staff.def.name } : null,
    appliance: null, start: tk.run.state === 'running' || tk.run.state === 'done' ? tk.run.startAt : null, end: tk.servedAt ?? null, wait: tk.run.waited ?? null,
    state: tk.servedAt != null ? 'done' : tk.run.state === 'running' ? 'running' : 'waiting',
  });

  // Bill of materials actually drawn, summed over the line's steps (already scaled by qty).
  const used = {};
  for (const t of line.tasks) for (const [id, q] of Object.entries(t.uses || {})) used[id] = (used[id] || 0) + q;
  const recipeOf = {};
  for (const r of data.prep || []) for (const k of Object.keys(r.yields || {})) recipeOf[k] = r;
  const firstStart = Math.min(engine.now, ...line.tasks.map((t) => t.startAt ?? Infinity));
  const materials = Object.entries(used).map(([id, qty]) => {
    const e = engine.inv.get(id); const def = e?.def ?? { name: id, unit: '' };
    return { id, name: def.name, qty, unit: def.unit, kind: def.kind ?? 'raw', storage: def.storage ?? null,
      cost: qty * (engine.costs[id] ?? 0), lot: lotFor(engine, recipeOf[id], def, firstStart) };
  }).sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));

  const cost = materials.reduce((s, m) => s + m.cost, 0);
  return {
    ticket: tk.id, table: tk.table, course: tk.courseName, dish: { id: line.dish.id, name: dishName(line.dish) }, qty: line.qty,
    fireAt: tk.fireAt, platedAt: line.platedAt, passAt: tk.passAt, servedAt: tk.servedAt,
    leadTime: tk.servedAt != null ? tk.servedAt - tk.fireAt : null,
    remakes: lines.filter((l) => l.remake).length,
    steps, materials, cost,
  };
}

// "Supplement: Royal Kaluga caviar" keeps what the supplement is; other dishes use their short name.
const dishName = (d) => (/^supplement:/i.test(d.fullName ?? '') ? d.fullName.split(',')[0] : d.name);

// The prep batch a component came from: the latest batch of its recipe that finished
// before the plate's first step started. Prep log names read "Recipe · Step #n/m", or "Recipe #n/m" for one-step recipes.
function lotFor(engine, recipe, def, before) {
  if (!recipe) return null;
  if (def.carryover) return { recipe: recipe.name, note: 'made the day before' };
  let last = null, maker = null;
  for (const l of engine.taskLog) {
    if (l.kind !== 'prep' || l.end > before) continue;
    const base = l.name.replace(/\s*#\d+\/\d+$/, '');
    if (base !== recipe.name && !base.startsWith(`${recipe.name} · `)) continue;
    if (!last || l.end >= last.end) last = l;
    if (l.staff && (!maker || l.end >= maker.end)) maker = l;
  }
  if (!last) return { recipe: recipe.name, note: def.onHand > 0 ? 'from opening stock' : 'batch still in progress' };
  const batch = last.name.match(/#(\d+)\/(\d+)$/);
  const who = maker && engine.staffBy[maker.staff];
  return { recipe: recipe.name, batch: batch ? +batch[1] : null, of: batch ? +batch[2] : null, at: last.end,
    by: who ? (who.def.title || who.def.name) : null };
}
