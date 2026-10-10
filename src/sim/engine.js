// Discrete-event simulation of a three-star dinner service, modelled as a job shop:
//   reservations -> tickets (per table, per course) -> dish lines -> routed tasks (BOM + routing)
//   competing for finite resources (cooks, appliance slots, station positions) and inventory.
// Fully deterministic for a given (data, cfg.seed, cfg.covers).
import { makeRng, Heap, pct, fmtClock } from './rng.js';
import { explodeRequirements, unitCosts } from './mrp.js';

export const DEFAULT_CFG = {
  covers: 60,
  seating: 'twoTurn',   // 'twoTurn' (5:30 + 8:00) | 'bell' | 'rush' (everyone within 30 min)
  staffOut: [],         // staff ids removed from the schedule (short-staffed what-if)
  faults: [],           // [{ appliance: id|type, at: seconds, durationSec }] forced breakdowns
  // ---- guest-side controls (all optional; null = take the dataset's own value)
  arrival: null,        // { start, end, shape: 'uniform' | 'bell' | 'waves' } seconds since midnight; overrides the seating scenario
  partyMix: null,       // [{ size, share }]
  mix: null,            // { weights: { productId: weight | uptake }, planFollows: false } what guests order
  courseGapMin: null,   // minutes from one course being cleared to the next being called (eat + talk), overrides the data
  eatScale: 1,          // diner pace multiplier (1.2 = 20% slower eaters)
  paceCv: 0.25,         // course-to-course variation in eating time
  patienceMin: 60,      // a party that waits longer than this for a table walks away
  stockOverride: null,  // { itemId: quantity } starting stock for raw items, overrides the purchasing plan
  purchasing: 'plan',   // 'plan': stock bought for booked covers x purchaseFactor | 'fixed': use data on-hand as delivered
  purchaseFactor: 1.15,
  supply: {},           // { ingredientId: factor } scales starting stock (supply shock what-if)
  seed: 1,
  prepStart: 8 * 3600,
  doorsOpen: 17.5 * 3600,
  lastSeating: 21 * 3600,
  noShowRate: 0.03,
  failures: true,
  prepSafety: 1.2,       // prep-to-forecast safety factor
  leadSec: 75,           // kitchen fires this long before guests are ready
  settleSec: 300,        // time from seating to first course call
  clearSec: 75,          // plate clearing between courses
  resetSec: 540,         // table turn-over after guests leave
  defectRate: 0.012,     // QC reject probability per plated dish
  sampleSec: 60,
  staffScale: 1,         // 0..1 fraction of line staff on the schedule (experiment knob)
};

const CLASS = { remake: 0, service: 1, prep: 2, wash: 3 };
const key = (...a) => a.join(':');

export class Engine {
  constructor(data, cfgIn = {}, emit = () => {}) {
    this.data = data;
    this.cfg = { ...DEFAULT_CFG, ...cfgIn };
    if (cfgIn.defectRate === undefined && data.quality?.refireRate !== undefined) this.cfg.defectRate = data.quality.refireRate;
    const sx = data.sim || {};
    this.sx = { pass: sx.passStation ?? 'pass', wash: sx.washStation ?? 'dish', runRole: sx.runnerRole ?? 'runner', washRole: sx.washRole ?? 'plonge',
      cvManual: data.variability?.manualCv ?? 0.12, cvMachine: data.variability?.machineCv ?? 0.04, cvWait: data.variability?.waitCv ?? 0.04 };
    this.events = [];
    this.taskLog = [];
    this.blockLog = [];
    this.emit = (type, payload) => { if (this.events.length < 250000) this.events.push({ t: this.now, type, ...payload }); emit(type, payload); };
    const c = this.cfg;
    this.rngRes = makeRng(c.seed);
    this.rng = makeRng((c.seed ^ 0x9e3779b9) >>> 0);
    this.rngFail = makeRng((c.seed ^ 0x85ebca6b) >>> 0);
    this.heap = new Heap();
    this.now = c.prepStart - 1800;
    this.t0 = this.now;
    this.log = [];
    this.nextId = 1;
    this.costs = unitCosts(data);
    this.walkSpeed = data.dining?.walkSpeed ?? 1.2;
    this.dishById = Object.fromEntries(data.dishes.map((d) => [d.id, d]));
    // what guests actually order (cfg.mix) vs what the kitchen forecast (data weights) are separate: forecast error is real
    this.courses = applyMix(data.courses, c.mix?.weights);
    const planData = c.mix?.planFollows ? { ...data, courses: this.courses } : data;
    this.stationDef = Object.fromEntries(data.stations.map((s) => [s.id, s]));

    // ---- resources -------------------------------------------------------------------------
    const planRaw = c.purchasing === 'plan' ? explodeRequirements(planData, c.covers * c.purchaseFactor, 1.08).raw : null;
    const carryNeed = data.prep.some((r) => r.carryover) ? explodeRequirements(planData, c.covers * (1 - c.noShowRate * 0.5), c.prepSafety).need : {};
    const yieldOf = {}; for (const r of data.prep) for (const [k, v] of Object.entries(r.yields)) yieldOf[k] = v;
    const stockOf = (i) => {
      let q = i.onHand ?? 0;
      if (i.carryover) q = Math.ceil((carryNeed[i.id] || 0) / yieldOf[i.id]) * yieldOf[i.id]; // pre-made on a previous day
      if (c.stockOverride && i.kind !== 'component' && c.stockOverride[i.id] !== undefined) return c.stockOverride[i.id] * (c.supply[i.id] ?? 1);
      if (planRaw && i.kind !== 'component') { const step = i.unit === 'ea' ? 1 : 100; q = Math.ceil((planRaw[i.id] || 0) / step) * step; }
      return q * (c.supply[i.id] ?? 1);
    };
    this.inv = new Map(data.ingredients.map((i) => { const q = stockOf(i); return [i.id, {
      def: i, onHand: q, start: q, used: 0, produced: 0, wasted: 0, stockouts: 0, minOnHand: q,
    }]; }));
    this.pendingProd = {}; // component -> number of unfinished prep tasks that yield it
    this.staff = data.staff.filter((d) => !c.staffOut.includes(d.id)).map((d, idx) => ({
      id: d.id, def: d, station: d.home, state: 'off', onShift: false, leaving: false, task: null,
      busy: 0, svcBusy: 0, walk: 0, done: 0, busyAtOpen: 0, walkAtOpen: 0, ord: idx,
    }));
    this.staffBy = Object.fromEntries(this.staff.map((s) => [s.id, s]));
    this.appl = data.appliances.map((d) => ({
      id: d.id, def: d, up: true, slots: 0, slotSec: 0, down: 0, downSince: null, done: 0, ideal: 0, actual: 0,
      defects: 0, units: 0, failures: 0, slotAtOpen: 0, downAtOpen: 0, running: [],
    }));
    this.applBy = Object.fromEntries(this.appl.map((a) => [a.id, a]));
    this.stations = data.stations.map((d) => ({ id: d.id, def: d, active: 0, done: 0, waitSum: 0, busy: 0, busyAtOpen: 0 }));
    this.stationBy = Object.fromEntries(this.stations.map((s) => [s.id, s]));

    // ---- demand: reservations ------------------------------------------------------------------
    this.parties = this.#buildReservations();
    this.tables = data.dining.tables.map((t) => ({ ...t, state: 'free', party: null, readyAt: 0 }));
    this.waitlist = [];
    this.tickets = []; this.openTickets = new Set();
    this.ready = []; // ready-to-run tasks
    this.tasks = 0;

    // ---- metrics -------------------------------------------------------------------------------
    this.m = {
      ticketTimes: Object.fromEntries(data.courses.map((cc) => [cc.id, []])),
      guestWaits: [], passHold: [], tableTurn: [], washTimes: [], tableWaits: [], courseGaps: [], gapByCourse: this.data.courses.map(() => []), eatTimes: [], firstCourse: [], valueAdded: [], balkedGuests: 0,
      served: 0,            // dish portions delivered to the table
      coursesServed: 0,     // table-courses delivered
      guestCourses: 0,      // guest-courses delivered
      defects: 0, holdRejects: 0, remakes: 0, subs: 0, comps: 0,
      wasteCost: 0, platesPlated: 0,
      stockouts: [], blockedWait: {}, blockedCount: {},
      seatedGuests: 0, finishedGuests: 0, noShowGuests: 0, waitlisted: 0, peakWip: 0,
      prepDone: 0, prepTotal: 0, prepSkipped: 0, prepFinishedAt: null,
      lastServedAt: null,
    };
    this.series = [];
    this.hist = [];
    this.phase = 'init';
    this.serviceDone = false;
    this.endT = null;
    this.openBase = null;

    this.#schedule();
  }

  // ====================================================================================== setup
  #buildReservations() {
    const c = this.cfg; const r = this.rngRes; const out = [];
    const scen = (this.data.seatingScenarios || []).find((x) => x.id === c.seating);
    const interval = (scen?.intervalMin ?? 15) * 60;
    const slots = [];
    for (let t = c.doorsOpen; t <= c.lastSeating; t += interval) slots.push(t);
    const peak = (t, m, sd) => Math.exp(-0.5 * ((t - m) / sd) ** 2);
    const hm = (v) => (typeof v === 'string' ? (+v.split(':')[0] + (+v.split(':')[1] || 0) / 60) * 3600 : v);
    const shape = c.arrival ? c.arrival.shape || 'uniform' : null;
    const weight = shape === 'uniform' ? () => 1
      : shape === 'bell' ? (t) => peak(t, (c.doorsOpen + c.lastSeating) / 2, (c.lastSeating - c.doorsOpen) / 5) + 0.02
      : shape === 'waves' ? (t) => peak(t, c.doorsOpen + (c.lastSeating - c.doorsOpen) * 0.2, (c.lastSeating - c.doorsOpen) / 12) + 0.8 * peak(t, c.doorsOpen + (c.lastSeating - c.doorsOpen) * 0.8, (c.lastSeating - c.doorsOpen) / 12) + 0.02
      : scen?.waves
      ? (t) => scen.waves.reduce((a, w) => a + w.share * peak(t, hm(w.at), Math.max(300, (w.spreadMin ?? 30) * 30)), 0) + 1e-4
      : scen ? () => 1
        : {
          twoTurn: (t) => peak(t, c.doorsOpen + 900, 1500) + 0.85 * peak(t, c.doorsOpen + 9000, 1800) + 0.03,
          bell: (t) => peak(t, (c.doorsOpen + c.lastSeating) / 2 + 600, 3300) + 0.05,
          rush: (t) => (t <= c.doorsOpen + 1800 ? 1 : 0.0001),
        }[c.seating] || (() => 1);
    const sizes = (c.partyMix || this.data.reservations?.partySizeMix)?.map((x) => [x.size, x.share]) ?? [[1, 0.03], [2, 0.57], [3, 0.08], [4, 0.2], [5, 0.04], [6, 0.08]];
    let left = c.covers; let n = 0;
    while (left > 0) {
      let size = r.pick(sizes, (s) => s[1])[0]; size = Math.min(size, left);
      const slot = r.pick(slots, weight);
      const at = slot + (scen ? r.int(0, Math.max(0, interval / 300 - 1)) * 300 : r.int(0, 2) * 300) + Math.max(-120, Math.round(r.normal() * 150));
      out.push({ id: `R${++n}`, size, at, noShow: r.next() < c.noShowRate, status: 'booked', table: null, course: -1, pace: Math.max(0.75, Math.min(1.3, r.jitter(0.18))), eatSum: 0 });
      left -= size;
    }
    out.sort((a, b) => a.at - b.at);
    out.forEach((p, i) => { p.id = `R${i + 1}`; });
    return out;
  }

  #schedule() {
    const c = this.cfg; const d = this.data;
    this.at(c.prepStart, () => this.#startPrep());
    for (const s of this.staff) {
      const [from, to] = s.def.shift;
      this.at(from * 3600, () => { s.onShift = true; s.leaving = false; if (s.state === 'off') s.state = 'idle'; this.#log('staff', `${s.def.name} clocks in`); this.dirty = true; });
      const endShift = () => {
        if (!this.serviceDone && to >= 24) { this.at(this.now + 600, endShift); return; } // closing crew stays until the kitchen is clear
        if (s.state === 'idle' || s.state === 'off') { s.state = 'off'; s.onShift = false; } else s.leaving = true;
      };
      this.at(to * 3600, endShift);
    }
    this.at(c.doorsOpen - 1, () => this.#markOpen());
    for (const p of this.parties) {
      if (p.noShow) { this.at(p.at, () => { p.status = 'noshow'; this.m.noShowGuests += p.size; this.#log('res', `${p.id} (${p.size}) no-show`); }); continue; }
      this.at(p.at, () => this.#arrive(p));
    }
    if (c.failures) for (const a of this.appl) this.#scheduleFailure(a, c.prepStart);
    for (const f of c.faults) this.at(f.at, () => {
      const a = this.applBy[f.appliance] || this.appl.find((x) => x.def.type === f.appliance && x.up);
      if (a && a.up) this.#breakDown(a, f.durationSec, false);
    });
    this.at(c.prepStart, () => this.#sample());
  }

  at(time, fn) { this.heap.push(Math.max(time, this.now), fn); }

  // ====================================================================================== clock
  advance(until) {
    while (this.heap.size && this.heap.peek().time <= until) {
      const ev = this.heap.pop();
      this.now = ev.time;
      ev.payload();
      if (this.dirty || this.ready.length) { this.dirty = false; this.#dispatch(); }
    }
    if (until > this.now) this.now = until;
    return this.now;
  }

  #log(type, msg) {
    const e = { t: this.now, type, msg };
    this.log.push(e); if (this.log.length > 600) this.log.shift();
    this.emit('log', e);
  }

  // ====================================================================================== prep
  #startPrep() {
    this.phase = 'prep';
    const plan = explodeRequirements(this.cfg.mix?.planFollows ? { ...this.data, courses: this.courses } : this.data, this.cfg.covers * (1 - this.cfg.noShowRate * 0.5), this.cfg.prepSafety);
    this.prepPlan = plan;
    const byRecipe = {};
    for (const r of this.data.prep) {
      if (r.carryover) { byRecipe[r.id] = []; continue; } // made on a previous day: already in stock
      const n = plan.batches[r.id] || 0;
      byRecipe[r.id] = [];
      const steps = r.steps || [{ name: r.name, station: r.station, appliance: r.appliance, role: r.role, dur: r.dur, attend: r.attend }];
      for (let b = 0; b < n; b++) {
        const chain = []; let prev = null;
        steps.forEach((st, i) => {
          const last = i === steps.length - 1;
          const t = this.#task({ kind: 'prep', name: `${r.name}${steps.length > 1 ? ` · ${st.name}` : ''} #${b + 1}/${n}`, station: st.station, appliance: st.appliance, role: st.role,
            dur: st.dur, attend: st.attend, uses: i === 0 ? { ...r.uses } : {}, yields: last ? { ...r.yields } : null, cls: CLASS.prep, due: st.due ?? r.due, recipe: r.id, batch: b + 1, depsLeft: i ? 1 : 0 });
          t.chain = chain; t.last = last; chain.push(t); if (prev) prev.succ.push(t); prev = t;
        });
        byRecipe[r.id].push(chain[0]);
        for (const k of Object.keys(r.yields)) this.pendingProd[k] = (this.pendingProd[k] || 0) + 1;
        this.m.prepTotal++;
      }
    }
    // dependencies: a batch needs its input components produced (inventory-gated, not hard-linked)
    this.#log('prep', `Prep started for ${this.cfg.covers} covers: ${this.m.prepTotal} batches planned`);
    for (const list of Object.values(byRecipe)) for (const t of list) this.#makeReady(t);
    this.dirty = true;
    this.emit('phase', { phase: 'prep' });
  }

  #markOpen() {
    this.phase = 'service';
    this.#log('service', `Doors open — ${this.cfg.covers} covers booked`);
    this.openBase = {
      staff: Object.fromEntries(this.staff.map((s) => [s.id, [this.#staffBusy(s), s.walk]])),
      appl: Object.fromEntries(this.appl.map((a) => [a.id, [this.#applSlotSec(a), this.#applDown(a)]])),
      stations: Object.fromEntries(this.stations.map((s) => [s.id, this.#stationBusy(s)])),
    };
    for (const e of this.inv.values()) e.atOpen = e.onHand;
    for (const s of this.staff) { s.busyAtOpen = this.openBase.staff[s.id][0]; s.walkAtOpen = s.walk; }
    this.emit('phase', { phase: 'service' });
  }

  // ====================================================================================== guests
  #arrive(p) {
    const tbl = this.#findTable(p.size);
    if (!tbl) {
      this.waitlist.push(p); p.status = 'waiting'; this.m.waitlisted++; this.#log('res', `${p.id} (${p.size}) waits for a table`);
      this.at(this.now + this.cfg.patienceMin * 60, () => this.#balk(p));
      return;
    }
    this.#seat(p, tbl);
  }

  #balk(p) {
    if (p.status !== 'waiting') return;
    this.waitlist.splice(this.waitlist.indexOf(p), 1);
    p.status = 'balked'; this.m.balkedGuests += p.size; this.m.tableWaits.push(this.now - p.at);
    this.#log('res', `${p.id} (${p.size}) gave up waiting for a table after ${Math.round((this.now - p.at) / 60)} min`);
    this.emit('guest:balked', { party: p.id, size: p.size });
    this.#checkDone();
  }

  #findTable(size) {
    let best = null;
    for (const t of this.tables) if (t.state === 'free' && t.seats >= size && (!best || t.seats < best.seats)) best = t;
    return best;
  }

  #seat(p, tbl) {
    tbl.state = 'seated'; tbl.party = p; p.table = tbl.id; p.status = 'seated'; p.seatedAt = this.now; p.course = -1;
    this.m.seatedGuests += p.size; this.m.tableWaits.push(this.now - p.at);
    this.#log('seat', `${p.id} (${p.size}) seated at ${tbl.id}`);
    this.emit('table:seated', { table: tbl.id, party: p.id, size: p.size });
    const ready = this.now + this.cfg.settleSec * this.rng.jitter(0.2);
    this.#callCourse(p, 0, ready);
  }

  #callCourse(p, idx, readyAt) {
    p.nextReady = readyAt; p.course = idx;
    // expo fires early by the planned lead time of the slowest dish on this course (JIT / offset scheduling)
    const course = this.courses[idx]; let lead = 0;
    for (const part of course.parts) for (const o of part) if (o.dish) lead = Math.max(lead, this.#critical(this.dishById[o.dish], Math.max(1, Math.round(p.size / part.length))));
    this.at(Math.max(this.now, readyAt - lead * 0.9 - this.cfg.leadSec), () => this.#fireTicket(p, idx, readyAt));
  }

  #fireTicket(p, idx, readyAt) {
    const course = this.courses[idx];
    const tk = {
      id: `K${this.tickets.length + 1}`, party: p, table: p.table, course: idx, courseId: course.id, courseName: course.name,
      fireAt: this.now, readyAt, lines: [], pending: 0, status: 'open', servedAt: null, run: null, passAt: null,
    };
    this.tickets.push(tk); this.openTickets.add(tk);
    // every guest picks one dish in each part of the course
    const counts = new Map();
    for (const part of course.parts) for (let g = 0; g < p.size; g++) {
      const o = this.rng.pick(part, (x) => x.weight ?? 1);
      if (!o.dish) continue;
      counts.set(o.dish, (counts.get(o.dish) || 0) + 1);
    }
    const specs = [...counts].map(([dish, qty]) => ({ dish, qty, crit: this.#critical(this.dishById[dish], qty) }));
    const ticketCrit = Math.max(...specs.map((s) => s.crit));
    this.#log('ticket', `${tk.id} FIRE ${p.table} · ${course.name} · ${[...counts].map(([d, q]) => `${q}× ${this.dishById[d].name}`).join(', ')}`);
    this.emit('ticket:fired', { ticket: tk.id, table: p.table, course: course.id, lines: specs.map((s) => ({ dish: s.dish, qty: s.qty })) });
    for (const s of specs) {
      // JIT stagger: lines with short routings are released later so all dishes finish together
      const offset = Math.max(0, ticketCrit - s.crit) * 0.85;
      tk.pending++;
      const line = this.#newLine(tk, s.dish, s.qty, 'service');
      this.at(this.now + offset, () => this.#releaseLine(line));
    }
  }

  #critical(dish, qty) {
    const memo = {};
    const dur = (st) => st.dur * (1 + st.batch * (qty - 1));
    const f = (st) => memo[st.id] ??= dur(st) + Math.max(0, ...st.after.map((a) => f(dish.steps.find((s) => s.id === a))));
    return Math.max(...dish.steps.map(f));
  }

  #newLine(tk, dishId, qty, cls) {
    return { id: `${tk.id}.${tk.lines.length + 1}`, ticket: tk, dish: this.dishById[dishId], qty, cls, tasks: [], platedAt: null, good: 0, dead: false, remake: cls === 'remake' };
  }

  #releaseLine(line) {
    const tk = line.ticket; tk.lines.push(line);
    const dish = line.dish; const cls = line.remake ? CLASS.remake : CLASS.service;
    const byId = {};
    for (const st of dish.steps) {
      const f = 1 + st.batch * (line.qty - 1);
      const uses = {}; for (const [k, v] of Object.entries(st.uses || {})) uses[k] = v * line.qty;
      byId[st.id] = this.#task({ kind: 'step', name: `${dish.name}: ${st.name}`, station: st.station, appliance: st.appliance, role: st.role,
        dur: st.dur * f, attend: Math.min(st.dur, st.attend) * f, uses, cls, due: tk.readyAt, line, step: st, plate: !!st.plate, depsLeft: st.after.length });
      line.tasks.push(byId[st.id]);
    }
    for (const st of dish.steps) for (const a of st.after) byId[a].succ.push(byId[st.id]);
    for (const t of line.tasks) if (t.depsLeft === 0) this.#makeReady(t);
    this.emit('line:released', { ticket: tk.id, dish: dish.id, qty: line.qty });
    this.dirty = true;
  }

  // ====================================================================================== tasks
  #task(o) {
    return { id: ++this.tasks, kind: o.kind, name: o.name, station: o.station, appliance: o.appliance || null, role: o.role,
      dur: o.dur, attend: o.attend ?? o.dur, uses: o.uses || {}, yields: o.yields || null, cls: o.cls, due: o.due ?? 0,
      line: o.line || null, ticket: o.ticket || null, step: o.step || null, plate: !!o.plate, depsLeft: o.depsLeft || 0, succ: [],
      recipe: o.recipe || null, batch: o.batch || 0, state: 'new', readyAt: 0, blocker: null, cancelled: false };
  }

  #makeReady(t) {
    t.state = 'ready'; t.readyAt = this.now; this.ready.push(t); this.dirty = true;
  }

  #prio(a, b) {
    return a.cls - b.cls || (a.cls === CLASS.prep ? (a.due - a.dur) - (b.due - b.dur) : a.due - b.due) || a.id - b.id;
  }

  // inventory: 'ok' | 'wait' (component still being prepped) | 'out'
  #invCheck(t) {
    let status = 'ok';
    for (const [id, q] of Object.entries(t.uses)) {
      const e = this.inv.get(id);
      if (e.onHand + 1e-9 >= q) continue;
      if ((this.pendingProd[id] || 0) > 0 && t.kind === 'step') { t.blocker = key('input', id); status = 'wait'; continue; }
      if ((this.pendingProd[id] || 0) > 0 && t.kind === 'prep') { t.blocker = key('input', id); status = 'wait'; continue; }
      return { status: 'out', id };
    }
    return { status };
  }

  #dispatch() {
    if (!this.ready.length) return;
    this.ready.sort((a, b) => this.#prio(a, b));
    const remaining = [];
    for (const t of this.ready) {
      if (t.cancelled || t.state === 'cancelled') continue;
      if (t.kind === 'run' && !this.#runStillValid(t)) continue;
      const inv = this.#invCheck(t);
      if (inv.status === 'out') { this.#handleOut(t, inv.id); continue; }
      if (inv.status === 'wait') { remaining.push(t); continue; }
      const stn = this.stationBy[t.station];
      if (stn.active >= stn.def.capacity) { t.blocker = key('station', t.station); remaining.push(t); continue; }
      let appl = null;
      if (t.appliance) {
        appl = this.#pickAppliance(t.appliance);
        if (!appl) { t.blocker = key('appliance', t.appliance); remaining.push(t); continue; }
      }
      const staff = t.role ? this.#pickStaff(t) : null;
      if (t.role && !staff) { t.blocker = key('role', t.role); remaining.push(t); continue; }
      if (t.kind === 'run' && this.#holdCheck(t)) continue;
      this.#start(t, staff, appl);
    }
    this.ready = remaining;
    const wip = this.ready.length + this.staff.filter((s) => s.task).length;
    if (wip > this.m.peakWip) this.m.peakWip = wip;
  }

  #pickAppliance(type) {
    let best = null;
    for (const a of this.appl) {
      if (a.def.type !== type || !a.up || a.slots >= a.def.capacity) continue;
      if (!best || a.slots / a.def.capacity < best.slots / best.def.capacity) best = a;
    }
    return best;
  }

  #dist(a, b) {
    if (a === b) return 0;
    const A = this.stationDef[a], B = this.stationDef[b];
    if (!A || !B) return 6;
    return Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
  }

  #pickStaff(t) {
    let best = null; let bestScore = Infinity;
    for (const s of this.staff) {
      if (!s.onShift || s.state !== 'idle' || !s.def.roles.includes(t.role)) continue;
      const score = this.#dist(s.station, t.station) / this.walkSpeed + (s.def.role === t.role ? 0 : 6 + s.def.roles.length * 2) + (s.station === s.def.home ? 0 : 1) + s.ord * 1e-3;
      if (score < bestScore) { best = s; bestScore = score; }
    }
    return best;
  }

  #handleOut(t, id) {
    const e = this.inv.get(id); e.stockouts++;
    this.m.stockouts.push({ t: this.now, ingredient: id, task: t.name });
    this.#log('stockout', `STOCKOUT ${e.def.name} (needed for ${t.name})`);
    this.emit('inventory:stockout', { ingredient: id });
    if (t.kind === 'prep') {
      t.state = 'skipped'; this.m.prepSkipped++;
      for (const x of t.chain || []) if (x !== t) { x.cancelled = true; x.state = 'cancelled'; }
      this.#finishPrepBookkeeping(t, false); return;
    }
    if (t.kind === 'step') this.#eightySix(t.line);
  }

  #eightySix(line) {
    if (line.dead) return;
    line.dead = true;
    for (const x of line.tasks) if (x.state !== 'done' && x.state !== 'running') { x.cancelled = true; x.state = 'cancelled'; }
    const tk = line.ticket; const remade = line.qty - line.good;
    tk.pending--;
    // swap to another dish in the same course part that can still be built, else comp
    const part = this.courses[tk.course].parts.find((pt) => pt.some((o) => o.dish === line.dish.id));
    const alt = part?.filter((o) => o.dish).map((o) => this.dishById[o.dish]).find((d) => d.id !== line.dish.id && this.#feasible(d, remade));
    this.m.wasteCost += this.#lineCost(line) * 0.6;
    if (alt) {
      this.m.subs++;
      this.#log('86', `86'd ${line.dish.name} — swapping ${remade}× to ${alt.name}`);
      this.emit('dish:86', { dish: line.dish.id, replacement: alt.id });
      const nl = this.#newLine(tk, alt.id, remade, 'remake'); tk.pending++; this.#releaseLine(nl);
    } else {
      this.m.comps += remade;
      this.#log('86', `86'd ${line.dish.name} — ${remade} portion(s) comped`);
      this.emit('dish:86', { dish: line.dish.id, replacement: null });
    }
    this.#maybeRun(tk);
  }

  #feasible(dish, qty) {
    const need = {};
    for (const st of dish.steps) for (const [k, v] of Object.entries(st.uses || {})) need[k] = (need[k] || 0) + v * qty;
    return Object.entries(need).every(([k, v]) => this.inv.get(k).onHand >= v);
  }

  #lineCost(line) {
    let c = 0; for (const st of line.dish.steps) for (const [k, v] of Object.entries(st.uses || {})) c += v * (this.costs[k] || 0);
    return c * line.qty;
  }

  #start(t, staff, appl) {
    const rng = this.rng; const now = this.now;
    t.state = 'running';
    // inventory is consumed when the task begins (kitting)
    for (const [id, q] of Object.entries(t.uses)) {
      const e = this.inv.get(id); e.onHand -= q; e.used += q; if (e.onHand < e.minOnHand) e.minOnHand = e.onHand;
      this.emit('inventory:change', { ingredient: id, onHand: e.onHand, delta: -q });
    }
    // staff === null: an unattended operation (proofing, curing, resting): occupies the machine, not a cook
    const walk = staff ? this.#dist(staff.station, t.station) / this.walkSpeed : 0;
    if (staff && staff.station !== t.station) this.emit('staff:move', { staff: staff.id, from: staff.station, to: t.station, seconds: walk });
    if (staff) staff.station = t.station;
    const attendActual = staff ? t.attend * staff.def.skill * rng.jitter(this.sx.cvManual) : 0;
    const passive = Math.max(0, t.dur - (staff ? t.attend : 0)) * rng.jitter(appl ? this.sx.cvMachine : this.sx.cvWait);
    const durActual = attendActual + passive;
    const wait = now - t.readyAt;
    if (t.blocker && wait > 0.5 && t.cls <= CLASS.service) {
      this.m.blockedWait[t.blocker] = (this.m.blockedWait[t.blocker] || 0) + wait;
      this.m.blockedCount[t.blocker] = (this.m.blockedCount[t.blocker] || 0) + 1;
      this.blockLog.push({ t: now, key: t.blocker, wait });
      if (this.blockLog.length > 4000) this.blockLog.shift();
    }
    t.staff = staff; t.startAt = now + walk; t.endAt = now + walk + durActual; t.freeAt = now + walk + attendActual; t.waited = wait;
    const stn = this.stationBy[t.station]; stn.waitSum += wait;
    if (staff) { staff.state = walk > 0.05 ? 'walking' : 'working'; staff.task = t; staff.walk += walk; staff.busy += attendActual; if (t.cls <= CLASS.service && t.kind !== 'run') staff.svcBusy += attendActual; stn.active++; stn.busy += attendActual; }
    if (appl) {
      appl.slots++; appl.slotSec += durActual / appl.def.capacity; appl.ideal += t.dur / appl.def.capacity; appl.actual += durActual / appl.def.capacity;
      appl.running.push(t); t.appl = appl;
    }
    if (this.taskLog.length < 40000) this.taskLog.push({ id: t.id, kind: t.kind, name: t.name, staff: staff?.id || null, appliance: appl?.id || null, station: t.station,
      start: now + walk, end: now + walk + durActual, free: now + walk + attendActual, ticket: t.line?.ticket.id || null, course: t.line?.ticket.courseId || null,
      courseIdx: t.line?.ticket.course ?? null, dish: t.line?.dish.id || null, wait });
    this.emit('task:start', { task: t.id, name: t.name, kind: t.kind, station: t.station, appliance: appl?.id || null, staff: staff?.id || null,
      dish: t.line?.dish.id || null, ticket: t.line?.ticket.id || null, start: t.startAt, end: t.endAt });
    if (staff) {
      this.at(now + walk, () => { if (staff.task === t) staff.state = 'working'; });
      this.at(now + walk + attendActual, () => this.#freeStaff(staff, t));
    }
    this.at(t.endAt, () => this.#finish(t));
  }

  #freeStaff(staff, t) {
    if (staff.task !== t) return;
    staff.task = null; staff.done++; this.stationBy[t.station].active--;
    if (staff.leaving) { staff.state = 'off'; staff.onShift = false; staff.leaving = false; } else staff.state = 'idle';
    this.dirty = true;
  }

  #finish(t) {
    t.state = 'done';
    const stn = this.stationBy[t.station]; stn.done++;
    if (t.appl) {
      t.appl.slots--; t.appl.done++; t.appl.running = t.appl.running.filter((x) => x !== t);
    }
    this.emit('task:end', { task: t.id, kind: t.kind, station: t.station, appliance: t.appl?.id || null, staff: t.staff?.id || null, ticket: t.line?.ticket.id || null });
    if (t.kind === 'prep') {
      for (const s of t.succ) if (!s.cancelled && --s.depsLeft === 0) this.#makeReady(s);
      if (t.last !== false && t.yields) for (const [id, q] of Object.entries(t.yields)) {
        const e = this.inv.get(id); e.onHand += q; e.produced += q;
        this.emit('inventory:change', { ingredient: id, onHand: e.onHand, delta: q });
      }
      if (t.last !== false) this.#finishPrepBookkeeping(t, true);
    } else if (t.kind === 'step') {
      if (!t.line.dead) {
        for (const s of t.succ) if (!s.cancelled && --s.depsLeft === 0) this.#makeReady(s);
        if (t.plate) this.#plated(t.line);
      } else if (t.plate) { /* cancelled line finished a stray step */ }
    } else if (t.kind === 'run') {
      this.#served(t.ticket);
    } else if (t.kind === 'wash') {
      this.m.washTimes.push(this.now - t.readyAt);
    }
    this.dirty = true;
  }

  #finishPrepBookkeeping(t, ok) {
    const yields = t.yields || t.chain[t.chain.length - 1].yields;
    for (const k of Object.keys(yields)) this.pendingProd[k]--;
    if (ok) this.m.prepDone++;
    if (this.m.prepDone + this.m.prepSkipped >= this.m.prepTotal && this.m.prepFinishedAt === null) {
      this.m.prepFinishedAt = this.now;
      this.#log('prep', `Prep complete (${this.m.prepDone} batches, ${this.m.prepSkipped} skipped)`);
    }
  }

  // ====================================================================================== plating & service
  #plated(line) {
    const tk = line.ticket;
    this.m.platesPlated++;
    // QC check at the pass
    const pDef = Math.min(0.5, this.cfg.defectRate * Math.pow(line.qty, 0.8));
    line.good = line.qty; line.platedAt = this.now;
    this.emit('plate:ready', { ticket: tk.id, dish: line.dish.id, qty: line.qty });
    if (this.rng.next() < pDef) {
      this.m.defects++; this.m.remakes++; line.good = line.qty - 1;
      this.m.wasteCost += this.#lineCost(line) / line.qty;
      for (const st of line.dish.steps) if (st.uses) for (const [k, v] of Object.entries(st.uses)) this.inv.get(k).wasted += v;
      const stepAppl = line.tasks.filter((x) => x.appl).map((x) => x.appl);
      for (const a of stepAppl) a.defects++;
      this.#log('qc', `QC reject at pass — ${line.dish.name} (${tk.id}); remaking 1`);
      this.emit('qc:reject', { ticket: tk.id, dish: line.dish.id });
      tk.pending++;
      this.#releaseLine(this.#newLine(tk, line.dish.id, 1, 'remake'));
    }
    for (const a of line.tasks.filter((x) => x.appl)) a.appl.units += line.qty;
    tk.pending--;
    this.#maybeRun(tk);
  }

  #maybeRun(tk) {
    if (tk.pending > 0 || tk.run || tk.status === 'served') return;
    const liveLines = tk.lines.filter((l) => !l.dead && l.good > 0);
    if (!liveLines.length) { this.#served(tk, true); return; }
    tk.passAt = this.now;
    const durBase = 28 + 2 * liveLines.reduce((s, l) => s + l.qty, 0);
    tk.run = this.#task({ kind: 'run', name: `Run ${tk.id} to ${tk.table}`, station: this.sx.pass, role: this.sx.runRole, dur: durBase, attend: durBase,
      cls: CLASS.service, due: tk.readyAt - 1000, ticket: tk });
    this.#makeReady(tk.run);
  }

  #runStillValid(t) { return t.ticket.run === t; }

  // returns true if a hold-time reject re-opened the ticket (run aborted)
  #holdCheck(t) {
    const tk = t.ticket; let reopened = false;
    for (const l of tk.lines) {
      if (l.dead || l.good <= 0 || l.platedAt === null) continue;
      const hold = this.now - l.platedAt;
      const limit = l.dish.holdSec;
      if (hold > limit && !l.holdRejected && !tk.holdReopened) {
        const p = Math.min(0.85, ((hold - limit) / limit) * 0.55);
        if (this.rng.next() < p) {
          l.good--; l.holdRejected = true; tk.holdReopened = true; this.m.holdRejects++; this.m.remakes++;
          this.m.wasteCost += this.#lineCost(l) / l.qty;
          this.#log('qc', `Held too long (${Math.round(hold)}s) — ${l.dish.name} (${tk.id}) remade`);
          this.emit('qc:reject', { ticket: tk.id, dish: l.dish.id, hold: true });
          tk.pending++; reopened = true;
          this.#releaseLine(this.#newLine(tk, l.dish.id, 1, 'remake'));
          l.platedAt = this.now; // stale plate trashed, freshness restarts
        }
      }
    }
    if (reopened) { t.cancelled = true; tk.run = null; return true; }
    for (const l of tk.lines) if (!l.dead && l.good > 0 && l.platedAt !== null) this.m.passHold.push(this.now - l.platedAt);
    return false;
  }

  #served(tk, comped = false) {
    if (tk.status === 'served') return;
    tk.status = 'served'; tk.servedAt = this.now; this.openTickets.delete(tk);
    const p = tk.party;
    if (!comped) {
      const portions = tk.lines.filter((l) => !l.dead).reduce((s, l) => s + l.good, 0);
      this.m.served += portions; this.m.coursesServed++; this.m.guestCourses += p.size;
      this.m.ticketTimes[tk.courseId].push(this.now - tk.fireAt);
      this.m.guestWaits.push(Math.max(0, this.now - tk.readyAt));
      this.m.lastServedAt = this.now;
    }
    this.emit('course:served', { ticket: tk.id, table: tk.table, course: tk.courseId, seconds: this.now - tk.fireAt });
    this.#log('served', `${tk.id} served at ${tk.table} · ${tk.courseName} (${Math.round(this.now - tk.fireAt)}s from fire)`);
    // dish pit
    const w = this.#task({ kind: 'wash', name: `Wash service for ${tk.table}`, station: this.sx.wash, role: this.sx.washRole, dur: 90 + 20 * p.size, attend: 90 + 20 * p.size,
      cls: CLASS.wash, due: this.now, ticket: tk });
    this.#makeReady(w);
    // next course or leave
    if (!comped) {
      if (tk.course === 0) this.m.firstCourse.push(this.now - p.seatedAt);
      if (p.lastServed !== undefined) { const g = this.now - p.lastServed; this.m.courseGaps.push(g); this.m.gapByCourse[tk.course].push(g); }
      p.lastServed = this.now;
    }
    const gapSec = this.cfg.courseGapMin ? Math.max(120, this.cfg.courseGapMin * 60 - this.cfg.clearSec - 240) : this.courses[tk.course].eatSec;
    const eat = gapSec * (1 + 0.03 * (p.size - 1)) * p.pace * this.cfg.eatScale * this.rng.jitter(this.cfg.paceCv);
    p.eatSum += eat; this.m.eatTimes.push(eat);
    if (tk.course + 1 < this.courses.length) this.#callCourse(p, tk.course + 1, this.now + eat + this.cfg.clearSec);
    else this.at(this.now + eat, () => this.#leave(p));
  }

  #leave(p) {
    const tbl = this.tables.find((t) => t.id === p.table);
    p.status = 'left'; p.leftAt = this.now; tbl.state = 'dirty';
    this.m.finishedGuests += p.size; this.m.tableTurn.push(this.now - p.seatedAt);
    this.m.valueAdded.push(p.eatSum / Math.max(1, this.now - p.seatedAt));
    this.emit('table:left', { table: tbl.id });
    this.#log('seat', `${p.id} leaves ${tbl.id} after ${Math.round((this.now - p.seatedAt) / 60)} min`);
    this.at(this.now + this.cfg.resetSec, () => {
      tbl.state = 'free'; tbl.party = null;
      const i = this.waitlist.findIndex((w) => this.#findTable(w.size));
      if (i >= 0) { const w = this.waitlist.splice(i, 1)[0]; this.#seat(w, this.#findTable(w.size)); }
      this.#checkDone();
    });
  }

  #checkDone() {
    if (this.serviceDone) return;
    if (this.parties.every((p) => p.status === 'left' || p.status === 'noshow' || p.status === 'balked') && this.openTickets.size === 0) {
      this.serviceDone = true; this.endT = this.now + 600; this.phase = 'closed';
      this.#log('service', 'Service complete — kitchen closes');
      this.emit('phase', { phase: 'closed' });
    }
  }

  // ====================================================================================== reliability
  #scheduleFailure(a, from) {
    const t = from + this.rngFail.exp(a.def.mtbfH * 3600);
    this.at(t, () => {
      if (this.serviceDone) return;
      if (!a.up) { this.#scheduleFailure(a, this.now); return; }
      this.#breakDown(a, Math.max(300, this.rngFail.exp(a.def.mttrMin * 60)), true);
    });
  }

  #breakDown(a, repair, random) {
    a.up = false; a.downSince = this.now; a.failures++;
    this.#log('fault', `${a.def.name} (${a.id}) FAULT — repair ~${Math.round(repair / 60)} min`);
    this.emit('appliance:down', { appliance: a.id, repair });
    this.at(this.now + repair, () => {
      a.down += this.now - a.downSince; a.downSince = null; a.up = true;
      this.#log('fault', `${a.def.name} (${a.id}) back online`);
      this.emit('appliance:up', { appliance: a.id });
      this.dirty = true;
      if (random) this.#scheduleFailure(a, this.now);
    });
  }

  // ====================================================================================== sampling & KPIs
  #sample() {
    const s = this.#point();
    this.series.push(s);
    this.hist.push({ t: this.now, staff: this.staff.map((x) => this.#staffBusy(x)), appl: this.appl.map((a) => this.#applSlotSec(a)), stn: this.stations.map((x) => x.busy) });
    if (this.hist.length > 40) this.hist.shift();
    this.#checkDone();
    if (!this.serviceDone || this.now < this.endT) this.at(this.now + this.cfg.sampleSec, () => this.#sample());
  }

  #point() {
    const open = [...this.openTickets];
    const wip = this.ready.length + this.staff.filter((x) => x.task).length;
    return {
      t: this.now, seated: this.m.seatedGuests, finished: this.m.finishedGuests, served: this.m.served, courses: this.m.coursesServed,
      openTickets: open.length, wip, queued: this.ready.length, stockouts: this.m.stockouts.length,
      inHouse: this.m.seatedGuests - this.m.finishedGuests, waiting: this.waitlist.reduce((a, w) => a + w.size, 0), balked: this.m.balkedGuests,
      foodCost: this.#consumedCost(), wasteCost: this.m.wasteCost,
      utilLine: this.#lineUtil(),
      p90: pct(Object.values(this.m.ticketTimes).flat(), 90), avg: avg(Object.values(this.m.ticketTimes).flat()),
    };
  }

  #consumedCost() { let c = 0; for (const e of this.inv.values()) if (e.def.kind !== 'component') c += e.used * (e.def.cost || 0); return c; }

  #staffBusy(s) {
    const t = s.task;
    if (!t || t.freeAt === undefined) return s.busy;
    return s.busy - Math.max(0, t.freeAt - Math.max(this.now, t.startAt));
  }
  #stationBusy(st) { return st.busy; }
  #applSlotSec(a) {
    let v = a.slotSec;
    for (const t of a.running) v -= Math.max(0, t.endAt - Math.max(this.now, t.startAt)) / a.def.capacity;
    return v;
  }
  #applDown(a) { return a.down + (a.downSince !== null ? this.now - a.downSince : 0); }
  #lineUtil() {
    const win = this.now - this.cfg.doorsOpen;
    if (!this.openBase || win < 60) return 0;
    const line = this.staff.filter((s) => s.svcBusy > 0 && s.def.role !== this.sx.runRole);
    let b = 0, h = 0;
    for (const s of line) { b += this.#staffBusy(s) - s.busyAtOpen; h += win; }
    return h ? b / h : 0;
  }

  snapshot() {
    const now = this.now; const c = this.cfg;
    const win = Math.max(1, now - c.doorsOpen);
    const inService = this.openBase && now > c.doorsOpen;
    const base = this.openBase;
    const staff = this.staff.map((s) => {
      const busy = this.#staffBusy(s);
      const shiftStart = s.def.shift[0] * 3600;
      const svcBusy = base ? busy - base.staff[s.id][0] : 0;
      const svcWindow = inService ? Math.max(1, now - Math.max(shiftStart, c.doorsOpen)) : 1;
      const rIdx = this.staff.indexOf(s); const h0 = this.hist.find((h) => h.t >= now - 900) || this.hist[0];
      const roll = h0 && now - h0.t > 30 && s.onShift ? clamp01((busy - h0.staff[rIdx]) / (now - h0.t)) : 0;
      return { id: s.id, name: s.def.name, title: s.def.title, roles: s.def.roles, role: s.def.role ?? s.def.roles[0], home: s.def.home, svc: s.svcBusy > 0, station: s.station, state: s.state, task: s.task ? s.task.name : null, roll,
        taskStation: s.task?.station || null, util: inService ? clamp01(svcBusy / svcWindow) : 0,
        utilTotal: clamp01(busy / Math.max(1, now - shiftStart)), walk: s.walk, done: s.done, skill: s.def.skill };
    });
    const appliances = this.appl.map((a) => {
      const slotSec = this.#applSlotSec(a); const down = this.#applDown(a);
      const b = base ? base.appl[a.id] : [0, 0];
      const planned = inService ? win : 1;
      const util = inService ? clamp01((slotSec - b[0]) / planned) : 0;
      const downSvc = Math.max(0, down - b[1]);
      const availability = inService ? clamp01(1 - downSvc / planned) : 1;
      const performance = a.actual > 0 ? clamp01(a.ideal / a.actual) : 1;
      const quality = a.units > 0 ? clamp01(1 - a.defects / Math.max(1, a.units)) : 1;
      const aIdx = this.appl.indexOf(a); const h0 = this.hist.find((h) => h.t >= now - 900) || this.hist[0];
      const roll = h0 && now - h0.t > 30 ? clamp01((slotSec - h0.appl[aIdx]) / (now - h0.t)) : 0;
      return { id: a.id, name: a.def.name, type: a.def.type, station: a.def.station, capacity: a.def.capacity, inUse: a.slots, up: a.up, roll,
        util, availability, performance, quality, oee: availability * performance * quality, tasks: a.done, failures: a.failures, downSec: down,
        running: a.running.map((t) => ({ name: t.name, end: t.endAt })), kwh: slotSecToKwh(a, slotSec) };
    });
    const stations = this.stations.map((s) => ({ id: s.id, name: s.def.name, active: s.active, capacity: s.def.capacity, done: s.done,
      queue: this.ready.filter((t) => t.station === s.id).length, avgWait: s.done ? s.waitSum / s.done : 0,
      x: s.def.x, y: s.def.y, mapX: s.def.mapX ?? s.def.x, mapY: s.def.mapY ?? s.def.y, w: s.def.w, d: s.def.d, remote: !!s.def.remote }));
    const inventory = [...this.inv.values()].map((e) => {
      const rate = e.used / Math.max(1, (now - c.prepStart));
      return { id: e.def.id, name: e.def.name, unit: e.def.unit, kind: e.def.kind, storage: e.def.storage, onHand: e.onHand, start: e.start,
        atOpen: e.atOpen ?? e.onHand, used: e.used, produced: e.produced, wasted: e.wasted, par: e.def.par || 0, stockouts: e.stockouts,
        pct: e.start > 0 ? e.onHand / e.start : (e.def.kind === 'component' ? null : 0), cost: e.def.cost || 0 };
    });
    const tables = this.tables.map((t) => ({ id: t.id, seats: t.seats, state: t.state, party: t.party?.id || null, size: t.party?.size || 0,
      course: t.party ? t.party.course : -1, courseName: t.party && t.party.course >= 0 ? this.data.courses[t.party.course]?.name : null }));
    const open = [...this.openTickets].map((tk) => ({
      id: tk.id, table: tk.table, course: tk.courseName, fireAt: tk.fireAt, age: now - tk.fireAt, late: now > tk.readyAt + 120,
      lines: tk.lines.map((l) => ({ dish: l.dish.name, qty: l.qty, done: l.platedAt !== null && !l.dead })), pending: tk.pending, passed: !!tk.passAt,
    })).sort((a, b) => a.fireAt - b.fireAt);
    const kpis = this.#kpis(win, inService, staff, appliances);
    return {
      t: now, clock: fmtClock(now), phase: this.phase, done: this.serviceDone, endT: this.endT,
      covers: { booked: c.covers, seated: this.m.seatedGuests, finished: this.m.finishedGuests, noShows: this.m.noShowGuests,
        waiting: this.waitlist.reduce((s, w) => s + w.size, 0) },
      guests: this.#guestKpis(), tables, tickets: open, staff, appliances, stations, inventory, kpis, log: this.log.slice(-80), stockouts: this.m.stockouts,
      prep: { done: this.m.prepDone, total: this.m.prepTotal, skipped: this.m.prepSkipped, finishedAt: this.m.prepFinishedAt },
    };
  }

  /** Theory-of-constraints read-out: the resource that made work wait longest (last 30 min, or whole service once closed). */
  #bottleneck(staff, appliances) {
    const from = this.phase === 'closed' ? -Infinity : this.now - 1800; const agg = {};
    if (this.phase === 'closed') for (const [k, w] of Object.entries(this.m.blockedWait)) agg[k] = { key: k, wait: w, n: this.m.blockedCount[k] };
    else for (const b of this.blockLog) if (b.t >= from) { const a = (agg[b.key] ||= { key: b.key, wait: 0, n: 0 }); a.wait += b.wait; a.n++; }
    const top = Object.values(agg).sort((a, b) => b.wait - a.wait)[0];
    if (!top || top.wait < 120) return { key: null, text: this.phase === 'service' ? 'No constraint: work is flowing without queues.' : 'Waiting for service to start.', waitSec: 0, n: 0, util: 0, queue: 0 };
    const [kind, id] = top.key.split(':');
    const ROLE = { expo: 'the pass (expo)', saucier: 'the sauce station', poissonier: 'the fish station', rotisseur: 'the meat station', garde: 'garde manger', patissier: 'pastry', runner: 'food runners', plonge: 'the dish pit', prep: 'prep cooks' };
    const titled = (id) => { const d = this.data.staff.find((x) => (x.role ?? x.roles?.[0]) === id); return d ? `the ${(d.title || id).replace(/ \(.*\)/, '').toLowerCase()}` : id; };
    let label = id, util = 0, queue = 0, factory = id;
    if (kind === 'role') {
      label = ROLE[id] || titled(id); factory = `labor: ${id}`;
      const crew = staff.filter((x) => x.roles.includes(id) && x.roll > 0 || (x.roles.includes(id) && x.state !== 'off'));
      util = crew.length ? crew.reduce((a, x) => a + x.roll, 0) / crew.length : 0;
      queue = this.ready.filter((t) => t.role === id).length;
    } else if (kind === 'appliance') {
      const same = appliances.filter((a) => a.type === id);
      label = `${(this.data.appliances.find((a) => a.type === id)?.name || id).replace(/ \(.*\)/, '')}${same.length > 1 ? ` (${same.length} units)` : ''}`;
      factory = `machine: ${id}`;
      util = same.reduce((a, x) => a + x.roll, 0) / Math.max(1, same.length); queue = this.ready.filter((t) => t.appliance === id).length;
    } else if (kind === 'station') {
      const st = this.stationBy[id]; label = `${st?.def.name || id} station positions`; factory = `work centre: ${id}`;
      util = st ? st.active / st.def.capacity : 0; queue = this.ready.filter((t) => t.station === id).length;
    } else if (kind === 'input') {
      label = `${this.inv.get(id)?.def.name || id} (prep stock)`; factory = `material: ${id}`; queue = this.ready.filter((t) => t.blocker === top.key).length;
    }
    const mins = top.wait > 7200 ? `${(top.wait / 3600).toFixed(1)} h` : `${(top.wait / 60).toFixed(1)} min`;
    const text = kind === 'input'
      ? `${label} is the constraint: ${top.n} orders waited ${mins} ${this.phase === 'closed' ? 'over the service' : 'in the last 30 min'} for it to be prepped.`
      : `${label} ${kind === 'appliance' ? 'is' : 'is'} the constraint: ${top.n} tasks waited ${mins} ${this.phase === 'closed' ? 'over the service' : 'in the last 30 min'} (avg ${Math.round(top.wait / top.n)} s)${util ? `, ${Math.round(util * 100)}% busy` : ''}${queue ? `, ${queue} queued now` : ''}.`;
    const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
    return { key: top.key, kind, id, label: cap(label), factory, text: cap(text), waitSec: top.wait, n: top.n, util, queue };
  }

  /** the dining-room side of the line: arrivals, queue for a table, pacing between courses, eating time, meal cycle time */
  #guestKpis() {
    const m = this.m; const c = this.cfg; const price = this.data.meta?.menuPricePerCover ?? 0;
    const seats = this.tables.reduce((a, t) => a + t.seats, 0);
    const inHouse = m.seatedGuests - m.finishedGuests;
    const target = (this.data.pacing?.targetMealMinutes ?? 195) * 60;
    const gapTarget = c.courseGapMin ? c.courseGapMin * 60 : target / this.data.courses.length;
    const arrived = this.parties.filter((p) => p.at <= this.now && p.status !== 'noshow').reduce((a, p) => a + p.size, 0);
    const last = this.parties.filter((p) => p.at <= this.now && p.at > this.now - 3600 && p.status !== 'noshow').reduce((a, p) => a + p.size, 0);
    return {
      booked: c.covers, arrived, arrivalsPerHr: last, inHouse, waiting: this.waitlist.reduce((a, w) => a + w.size, 0), waitingParties: this.waitlist.length,
      balked: m.balkedGuests, lostRevenue: m.balkedGuests * price, noShows: m.noShowGuests, seats, occupancy: seats ? inHouse / seats : 0,
      tableWaitAvg: avg(m.tableWaits), tableWaitP90: pct(m.tableWaits, 90), tableWaitMax: m.tableWaits.length ? Math.max(...m.tableWaits) : 0,
      firstCourseAvg: avg(m.firstCourse), gapAvg: avg(m.courseGaps), gapP90: pct(m.courseGaps, 90), gapTarget,
      gapByCourse: this.data.courses.map((cc, i) => ({ id: cc.id, name: cc.name, avg: avg(m.gapByCourse[i]), p90: pct(m.gapByCourse[i], 90), n: m.gapByCourse[i].length })),
      eatAvg: avg(m.eatTimes), mealAvg: avg(m.tableTurn), mealP90: pct(m.tableTurn, 90), mealTarget: target,
      valueAdded: avg(m.valueAdded), guestWaitAvg: avg(m.guestWaits), guestWaitP90: pct(m.guestWaits, 90),
      overTarget: m.tableTurn.filter((x) => x > target * 1.15).length, meals: m.tableTurn.length,
    };
  }

  #kpis(win, inService, staff, appliances) {
    const m = this.m; const now = this.now;
    const all = Object.values(m.ticketTimes).flat();
    const perCourse = this.data.courses.map((cc) => {
      const a = m.ticketTimes[cc.id];
      return { id: cc.id, name: cc.name, n: a.length, avg: avg(a), p50: pct(a, 50), p90: pct(a, 90), max: a.length ? Math.max(...a) : 0 };
    });
    // theory-of-constraints: which resource made tickets wait the longest?
    const constraints = Object.entries(m.blockedWait).map(([k, s]) => ({ key: k, waitSec: s, count: m.blockedCount[k], avg: s / m.blockedCount[k] }))
      .sort((a, b) => b.waitSec - a.waitSec).slice(0, 8);
    const recent = this.series.filter((p) => p.t >= now - 900);
    const r0 = recent[0];
    const portionsPerHr = r0 && now > r0.t ? ((m.served - r0.served) / (now - r0.t)) * 3600 : 0;
    const covers = m.finishedGuests;
    const revenue = this.cfg.covers * (this.data.meta?.menuPricePerCover ?? 0); // planned revenue for the booked covers
    const foodCost = this.#consumedCost();
    const elapsedSvc = this.openBase && now > this.cfg.doorsOpen ? now - this.cfg.doorsOpen : 0;
    const svcSpan = Math.max(1, (m.lastServedAt ?? now) - this.cfg.doorsOpen);
    const kwh = this.appl.reduce((s, a) => s + slotSecToKwh(a, this.#applSlotSec(a)), 0);
    const fpy = m.platesPlated ? 1 - (m.defects + m.holdRejects) / m.platesPlated : 1;
    const bottleneck = this.#bottleneck(staff, appliances);
    return {
      bottleneck, ticketAvg: avg(all), ticketP50: pct(all, 50), ticketP90: pct(all, 90), ticketP95: pct(all, 95),
      guestWaitAvg: avg(m.guestWaits), guestWaitP90: pct(m.guestWaits, 90), passHoldAvg: avg(m.passHold), passHoldP90: pct(m.passHold, 90),
      perCourse, constraints, openTickets: this.openTickets.size, wip: this.ready.length + this.staff.filter((s) => s.task).length,
      queued: this.ready.length, peakWip: m.peakWip, throughputPortionsHr: portionsPerHr, avgPortionsHr: elapsedSvc ? (m.served / svcSpan) * 3600 : 0,
      coursesServed: m.coursesServed, portionsServed: m.served, guestCourses: m.guestCourses,
      takt: this.cfg.covers > 0 ? (this.cfg.lastSeating - this.cfg.doorsOpen) / this.cfg.covers : 0,
      defects: m.defects, holdRejects: m.holdRejects, remakes: m.remakes, firstPassYield: fpy, subs: m.subs, comps: m.comps,
      stockoutCount: m.stockouts.length, foodCost, wasteCost: m.wasteCost, revenue, foodCostPct: revenue ? foodCost / revenue : 0,
      tableTurnAvg: avg(m.tableTurn), kwh, lineUtil: this.#lineUtil(), lateTickets: [...this.openTickets].filter((tk) => now > tk.readyAt + 120).length,
    };
  }
}

/** order-mix overrides: weights replace shares; for supplement parts (an option plus a "no thanks" null) the value is the uptake probability */
function applyMix(courses, weights) {
  if (!weights) return courses;
  return courses.map((c) => ({ ...c, parts: c.parts.map((part) => {
    const out = part.map((o) => ({ ...o }));
    const hasNull = out.some((o) => !o.dish);
    for (const o of out) if (o.dish && weights[o.dish] !== undefined) {
      o.weight = weights[o.dish];
      if (hasNull) { const nul = out.find((x) => !x.dish); nul.weight = Math.max(0, 1 - Math.min(1, weights[o.dish])); }
    }
    return out;
  }) }));
}

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const slotSecToKwh = (a, slotSec) => (slotSec * (a.def.kw || 0) * 0.6) / 3600; // ~60 % average load while in use
