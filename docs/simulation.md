# Simulation engine and dashboard

`src/sim/` is a dependency-free, deterministic discrete-event simulation of a dinner service. `src/dashboard/` is the live operations dashboard that drives and visualises it. See `docs/product/PRD.md` §5–6 for the KPI definitions and thread interfaces.

## Model (factory vocabulary in brackets)

- **Reservations** [demand / build plan]: `covers` split into parties (1–6), arrival curve `twoTurn | bell | rush`, no-shows, a finite set of tables with a wait list.
- **Tickets** [work orders]: one per table per course. Expo fires each ticket early by the planned lead time of its slowest dish (JIT offset scheduling), and staggers dish lines so they finish together.
- **Dishes** [BOM + routing]: each dish is a DAG of steps with station, appliance type, role, duration, hands-on time (so appliances stay busy after a cook walks away), batching factor and ingredient draw.
- **Resources**: cooks (roles, skill factor, shifts, walking time between stations), appliance slots (capacity, MTBF/MTTR breakdowns), station positions.
- **Prep** [pre-production]: MRP explosion of the menu into prep batches with a safety factor; prep tasks consume raw stock and produce components, which service tasks consume.
- **Quality gate** [final inspection]: QC rejects and hold-time rejects at the pass trigger re-fires; waste and food cost are tracked.
- **Stockouts**: a dish whose input is gone is 86'd, swapped to another option in the same course part if possible, else comped.
- **KPIs**: ticket time p50/p90/p95 per course, guest wait, throughput, WIP, utilization (cooks, stations, appliances, 15-min rolling), OEE = A × P × Q per appliance, first-pass yield, food cost, energy, and a theory-of-constraints bottleneck read-out that names the resource and why.

## API (`src/sim/sim.js`)

```js
import { createSim } from './src/sim/sim.js';
import { buildFallbackData } from './src/sim/data/fallback.js';
const sim = createSim({ data, covers: 60, seed: 1, seating: 'twoTurn' });
sim.play(); sim.setSpeed(60);
function frame(dt) { sim.tick(dt); render(sim.state); }   // sim owns the clock
sim.seek(t); sim.stateAt(t); sim.reset({ covers: 120 });   // backwards seeks replay deterministically
sim.on('ticket.fired' | 'op.start' | 'op.end' | 'staff.move' | 'machine.state' | 'inventory.change' | 'plate.passed' | 'plate.refire', cb);
sim.events; sim.taskLog; sim.forecast;                      // ordered event log, Gantt intervals, full-run result
```

Use `loadKitchenData(fetchReader('./data/'))` (browser) or `loadKitchenData(readerFn)` (Node) from `src/sim/data/load.js` to turn the sourced `data/*.json` into sim input via `src/sim/adapter.js`: routings become task chains, `role: null` operations are unattended machine time, intermediates whose lead time cannot fit the prep window (veal stock, corned tongue, foie torchon) are carry-over stock from a previous day, and the data's own seating scenarios and what-ifs are used. Food runners and the dining room are added as estimates, and ingredient costs are category estimates (`meta.estimatedCosts`).

`data` is plain JSON: `ingredients[], prep[], dishes[], courses[], appliances[], stations[], staff[], dining.tables[]` (see `src/sim/data/fallback.js` for the exact shape; the research thread's data can replace it).

Scenarios, comparisons, capacity sweeps and the shift-report CSV are in `src/sim/scenarios.js`. Mount the dashboard with `mountDashboard(el, sim, { onSelect })`; `onSelect` receives `{ type: 'station' | 'ingredient' | 'appliance', id }` so the 3D scene can highlight it.

Run the demo with any static server: `python3 -m http.server` and open `dashboard-demo.html` (query: `covers`, `seed`, `seating`, `speed`, `t`, `play`). Tests: `npm test`; terminal KPI report: `npm run sim:report -- 124` (add `1 fallback` for the built-in menu).

## Guest-side controls and the guest line

The dining room is modelled like a second production line: parties arrive, queue for a table, are seated, eat each course at their own pace, and leave. Every stage has a queue and a KPI.

Config fields (all optional, pass to `createSim` or `sim.reset(patch)`):

| Field | Meaning |
|---|---|
| `covers`, `noShowRate` | Guests booked and share who never arrive |
| `arrival` | `{ start, end, shape }` seconds since midnight, shape `uniform`, `bell` or `waves`. Overrides the seating scenario |
| `partyMix` | `[{ size, share }]` party sizes |
| `patienceMin` | A party that waits longer than this for a table walks away (balks) |
| `mix` | `{ weights: { dishId: share }, planFollows }`. Option shares and supplement uptake. Unless `planFollows`, the kitchen preps to the original forecast, so a skewed order can run an item out |
| `eatScale`, `paceCv` | Eating pace multiplier and per-party variation |
| `courseGapMin` | Minutes from a course being cleared to the next being called. Defaults to the menu's own pacing |
| `purchasing`, `purchaseFactor`, `stockOverride` | Stock policy and explicit starting stock per raw item |

`state.guests` reports: guests in house, waiting, balked and lost revenue, seat occupancy, table wait (avg, p90), first-course wait, course gap by course against target, eating time, total time at the table against target, and value-added ratio (eating time over time at the table). The series also carries `inHouse`, `waiting` and `balked` for charting.

In the dashboard, the "Plan the night" panel builds a patch from the Guests, Orders, Stock and Timing tabs and re-runs the night from the same seed. "Reset to defaults" restores the dataset's own values.
