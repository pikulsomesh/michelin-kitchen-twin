// Terminal KPI report for one simulated service.  npm run sim:report -- [covers] [seed] [fallback]
import { readFile } from 'node:fs/promises';
import { createSim } from '../src/sim/sim.js';
import { buildFallbackData } from '../src/sim/data/fallback.js';
import { loadKitchenData } from '../src/sim/data/load.js';

const [covers, seed, mode] = [+process.argv[2] || undefined, +process.argv[3] || 1, process.argv[4]];
const data = mode === 'fallback' ? buildFallbackData() : await loadKitchenData((n) => readFile(new URL(`../data/${n}.json`, import.meta.url), 'utf8').then(JSON.parse));
const sim = createSim({ data, seed, ...(covers ? { covers } : {}) });
const s = sim.forecast.snapshot; const k = s.kpis;
const mm = (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
console.log(`${data.meta.restaurant}: ${sim.config.covers} covers, seating ${sim.config.seating}, kitchen closes ${s.clock}`);
console.log(`served ${s.covers.finished}/${s.covers.booked}  ticket p90 ${mm(k.ticketP90)}  guest wait p90 ${mm(k.guestWaitP90)}  FPY ${(k.firstPassYield * 100).toFixed(1)}%  stockouts ${k.stockoutCount}  line util ${(k.lineUtil * 100).toFixed(0)}%`);
console.log(`bottleneck: ${k.bottleneck.text}`);
for (const c of k.perCourse) console.log(`  ${c.name.padEnd(28)} n=${String(c.n).padStart(3)} p50 ${mm(c.p50)} p90 ${mm(c.p90)}`);
console.log(`prep ${s.prep.done}/${s.prep.total} batches (${s.prep.skipped} skipped)`);
console.log('appliances:', s.appliances.filter((a) => a.tasks).map((a) => `${a.id} ${(a.util * 100) | 0}%`).join('  '));
console.log('cooks:', s.staff.filter((x) => x.util > 0).map((x) => `${x.id.replace('ST-', '')} ${(x.util * 100) | 0}%`).join('  '));
