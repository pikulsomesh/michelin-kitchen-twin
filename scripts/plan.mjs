// npm run plan -- [covers]
// Prints the production plan for a dinner service: plates, sub-assemblies, raw materials, labor and machine load.
import { loadData } from './load-data.mjs';
import { buildIndex, demandForCovers, explode, loadSummary, leadTimeMinutes } from '../src/model/mrp.js';

const data = loadData();
const covers = Number(process.argv[2] ?? data.service.defaultCovers.value);
const index = buildIndex(data);
const demand = demandForCovers(data.menu, covers);
const plan = explode(index, demand, { stockFactor: 1 });
const load = loadSummary(index, plan);

const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const qty = (n, uom) => (uom === 'g' ? (n >= 1000 ? `${fmt(n / 1000, 2)} kg` : `${fmt(n)} g`) : `${fmt(n, n % 1 ? 1 : 0)} ${uom}`);
const h = (title) => console.log(`\n== ${title} ==`);

console.log(`${data.restaurant.name}: ${data.menu.name}, dinner for ${covers} covers`);

h('Finished plates (independent demand)');
for (const m of Object.values(plan.make).filter((m) => m.type === 'finished')) {
  console.log(`  ${String(m.produced).padStart(4)}  ${m.name}`);
}

h('Sub-assemblies to make during mise en place');
for (const m of Object.values(plan.make).filter((m) => m.type === 'intermediate')) {
  const lead = leadTimeMinutes(index, m.id) / 60;
  console.log(`  ${String(m.batches).padStart(3)} batch  ${qty(m.produced, m.uom).padStart(10)}  lead ${fmt(lead, 1).padStart(5)} h  ${m.name}`);
}

h('Raw materials (gross, after trim and yield loss)');
const raws = Object.values(plan.raw).sort((a, b) => a.category.localeCompare(b.category) || b.gross - a.gross);
for (const r of raws) console.log(`  ${r.category.padEnd(8)} ${qty(r.gross, r.uom).padStart(10)}  ${r.name}`);

h('Labor load by role (hours, utilization of rostered time)');
for (const l of Object.values(load.labor)) {
  const pct = (u) => (u == null ? '   -' : `${fmt(u * 100).padStart(3)}%`);
  console.log(`  ${l.role.padEnd(20)} prep ${fmt(l.prep / 60, 1).padStart(5)} h ${pct(l.utilization.prep)}   service ${fmt(l.service / 60, 1).padStart(5)} h ${pct(l.utilization.service)}`);
}

h('Machine load (hours)');
for (const m of Object.values(load.machine).sort((a, b) => b.prep + b.service - a.prep - a.service)) {
  console.log(`  ${index.equipment.get(m.equipment).name.padEnd(42)} prep ${fmt(m.prep / 60, 1).padStart(5)}   service ${fmt(m.service / 60, 1).padStart(5)}`);
}
