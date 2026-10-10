// What-if scenarios, headless runs, run comparison, capacity sweep and the shift report.
import { Engine } from './engine.js';

const H = 3600;

export const SCENARIOS = [
  { id: 'full-house', label: 'Full house', blurb: 'Double tonight’s covers.', apply: (cfg) => ({ covers: cfg.covers * 2 }) },
  { id: 'short-staffed', label: 'Short-staffed', blurb: 'One cook calls in sick.', param: 'station',
    apply: (cfg, data, station = 'poisson') => {
      const cook = data.staff.find((s) => s.home === station && !cfg.staffOut.includes(s.id) && !['expo'].some((r) => s.roles.includes(r)));
      return cook ? { staffOut: [...cfg.staffOut, cook.id] } : {};
    } },
  { id: 'oven-down', label: 'Combi ovens down', blurb: 'The combi ovens fail at 8:15 pm for 30 min.',
    apply: (cfg) => ({ faults: [...cfg.faults, { appliance: 'combi_1', at: 20.25 * H, durationSec: 1800 }, { appliance: 'combi_2', at: 20.25 * H, durationSec: 1800 }] }) },
  { id: 'supply-shock', label: 'Supply shock', blurb: 'Lobster delivery arrives 40% short.', apply: (cfg) => ({ supply: { ...cfg.supply, lobster: 0.6 } }) },
  { id: 'rush', label: 'Rush seating', blurb: 'Everyone arrives within 30 minutes.', apply: () => ({ seating: 'rush' }) },
];

/** Run a full service headlessly and return its final snapshot (+ series). */
export function runHeadless(data, cfg) {
  const e = new Engine(data, cfg, () => {});
  const limit = e.cfg.prepStart + 22 * H;
  while (!e.serviceDone && e.now < limit) e.advance(e.now + 300);
  if (e.endT) e.advance(e.endT);
  return { ...e.snapshot(), series: e.series, endT: e.endT ?? e.now, engine: e };
}

export const KPI_COLUMNS = [
  { id: 'closeT', label: 'Kitchen closes', get: (s) => s.endT, fmt: 'clock', better: -1 },
  { id: 'ticketP90', label: 'Ticket time p90', get: (s) => s.kpis.ticketP90, fmt: 'dur', better: -1 },
  { id: 'guestWaitP90', label: 'Guest wait p90', get: (s) => s.kpis.guestWaitP90, fmt: 'dur', better: -1 },
  { id: 'lineUtil', label: 'Line utilization', get: (s) => s.kpis.lineUtil, fmt: 'pct', better: 0 },
  { id: 'oee', label: 'Avg OEE', get: (s) => avgOee(s), fmt: 'pct', better: 1 },
  { id: 'fpy', label: 'First-pass yield', get: (s) => s.kpis.firstPassYield, fmt: 'pct', better: 1 },
  { id: 'stockouts', label: 'Stockouts (86s)', get: (s) => s.kpis.stockoutCount, fmt: 'int', better: -1 },
  { id: 'comps', label: 'Comped portions', get: (s) => s.kpis.comps, fmt: 'int', better: -1 },
  { id: 'foodCost', label: 'Food cost %', get: (s) => s.kpis.foodCostPct, fmt: 'pct', better: -1 },
  { id: 'waste', label: 'Waste $', get: (s) => s.kpis.wasteCost, fmt: 'usd', better: -1 },
];

export const avgOee = (s) => {
  const used = s.appliances.filter((a) => a.tasks > 0);
  return used.length ? used.reduce((x, a) => x + a.oee, 0) / used.length : 0;
};

export function compare(base, alt) {
  return KPI_COLUMNS.map((c) => {
    const a = c.get(base), b = c.get(alt);
    return { ...c, base: a, alt: b, delta: b - a, rel: a ? (b - a) / Math.abs(a) : 0,
      verdict: c.better === 0 || Math.abs(b - a) < 1e-9 ? 'flat' : (b - a) * c.better > 0 ? 'good' : 'bad' };
  });
}

/** Rated-capacity curve: sweep covers and report ticket time, guest wait and close time. Calls onPoint per run. */
export async function capacitySweep(data, cfg, covers = [20, 40, 60, 80, 100, 120, 160, 200], onPoint = () => {}) {
  const out = [];
  for (const n of covers) {
    await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    const s = runHeadless(data, { ...cfg, covers: n });
    const p = { covers: n, ticketP90: s.kpis.ticketP90, guestWaitP90: s.kpis.guestWaitP90, closeT: s.endT, lineUtil: s.kpis.lineUtil,
      stockouts: s.kpis.stockoutCount, bottleneck: peakBottleneck(s.engine) };
    out.push(p); onPoint(p, out);
  }
  // knee: first point whose guest-wait p90 exceeds 10 minutes
  const knee = out.find((p) => p.guestWaitP90 > 600);
  return { points: out, knee: knee ? knee.covers : null };
}

function peakBottleneck(e) {
  const m = e.m.blockedWait; const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/** End-of-service shift report as CSV text. */
export function shiftReportCSV(s, data) {
  const rows = [['section', 'name', 'value', 'unit']];
  const k = s.kpis;
  const add = (sec, name, v, u = '') => rows.push([sec, name, typeof v === 'number' ? Number(v.toFixed(3)) : v, u]);
  add('summary', 'covers_booked', s.covers.booked); add('summary', 'covers_served', s.covers.finished); add('summary', 'no_shows', s.covers.noShows);
  add('summary', 'ticket_time_avg', k.ticketAvg, 's'); add('summary', 'ticket_time_p90', k.ticketP90, 's');
  add('summary', 'guest_wait_p90', k.guestWaitP90, 's'); add('summary', 'first_pass_yield', k.firstPassYield);
  add('summary', 'food_cost_pct', k.foodCostPct); add('summary', 'waste_cost', k.wasteCost, 'usd'); add('summary', 'stockouts', k.stockoutCount);
  add('summary', 'energy', k.kwh, 'kWh'); add('summary', 'bottleneck', k.bottleneck.text);
  for (const c of k.perCourse) { add('course_ticket_p50', c.name, c.p50, 's'); add('course_ticket_p90', c.name, c.p90, 's'); }
  for (const a of s.appliances) { add('oee', a.id, a.oee); add('utilization', a.id, a.util); }
  for (const x of s.staff) add('labor_utilization', x.id, x.util);
  for (const i of s.inventory) if (i.kind !== 'component') add('inventory', i.name, `${i.start} start / ${Math.round(i.used)} used / ${Math.round(i.onHand)} left`, i.unit);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
