// Public API. A Sim wraps the discrete-event Engine with a wall-clock player: play/pause/speed,
// deterministic seek (rewinds by replaying from the seed), event subscription and snapshots.
import { Engine, DEFAULT_CFG } from './engine.js';
import { mrpTable, explodeRequirements } from './mrp.js';
import { fmtClock } from './rng.js';
import { seatingWindow } from './adapter.js';

export { DEFAULT_CFG, fmtClock, mrpTable, explodeRequirements };

/**
 * cache (optional): (resolvedConfig) => endT | null. A precomputed run (src/sim/precomputed.js) knows when the
 * night ends, so the full-night forecast is skipped until something asks for it and the twin starts at once.
 */
export function createSim({ data, cache = null, ...cfg } = {}) {
  if (!data) throw new Error('createSim: data (KitchenData) is required');
  const listeners = new Map();
  let muted = false;
  // PRD event names (dotted) alongside the colon-style ones
  const ALIAS = { 'ticket:fired': 'ticket.fired', 'task:start': 'op.start', 'task:end': 'op.end', 'staff:move': 'staff.move',
    'appliance:down': 'machine.state', 'appliance:up': 'machine.state', 'inventory:change': 'inventory.change',
    'course:served': 'plate.passed', 'qc:reject': 'plate.refire', 'plate:ready': 'plate.ready' };
  const emit = (type, payload) => {
    if (muted) return;
    if (ALIAS[type]) { const p = { ...payload, state: type === 'appliance:down' ? 'down' : type === 'appliance:up' ? 'up' : undefined, t: eng?.now };
      for (const cb of listeners.get(ALIAS[type]) || []) cb(p); }
    for (const cb of listeners.get(type) || []) cb(payload);
    for (const cb of listeners.get('*') || []) cb(type, payload);
  };
  /** defaults < data.sim.times/defaultSeating < caller config; times follow the chosen seating scenario */
  const resolve = (patch, prev = {}) => {
    const c = { ...DEFAULT_CFG, ...(data.sim ? { covers: data.sim.defaultCovers, seating: data.sim.defaultSeating, prepStart: data.sim.times.prepStart } : {}), ...prev, ...patch };
    const sc = (data.seatingScenarios || []).find((s) => s.id === c.seating);
    if (sc) { const [a, b] = seatingWindow(sc); c.doorsOpen = a; c.lastSeating = b; }
    if (c.arrival && c.arrival.start != null) { c.doorsOpen = c.arrival.start; c.lastSeating = Math.max(c.arrival.end ?? c.lastSeating, c.arrival.start + 900); }
    return c;
  };
  let config = resolve(cfg);
  let eng = null; // set below (emit may fire during construction)
  eng = new Engine(data, config, emit);
  let forecast = null, cachedEnd = null;

  const computeForecast = () => {
    const probe = new Engine(data, config, () => {});
    const limit = probe.cfg.prepStart + 22 * 3600;
    while (!probe.serviceDone && probe.now < limit) probe.advance(probe.now + 300);
    if (probe.endT) probe.advance(probe.endT);
    const snap = probe.snapshot();
    forecast = { endT: probe.endT ?? probe.now, snapshot: snap, series: probe.series };
  };
  const plan = () => { forecast = null; cachedEnd = cache?.(config) ?? null; if (cachedEnd == null) computeForecast(); };
  plan();
  const endT = () => cachedEnd ?? forecast.endT;

  const sim = {
    data,
    playing: false,
    speed: 60,
    get config() { return config; },
    get engine() { return eng; },
    get t() { return eng.now; },
    get start() { return eng.t0; },
    get end() { return endT(); },
    get forecast() { if (!forecast) computeForecast(); return forecast; },
    /** true when this night's end came from the precomputed cache instead of a full forecast run */
    get cached() { return cachedEnd != null; },
    get state() { return { ...eng.snapshot(), series: eng.series }; },
    snapshot() { return this.state; },
    on(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); return () => listeners.get(type).delete(cb); },
    off(type, cb) { listeners.get(type)?.delete(cb); },
    play() { this.playing = true; emit('control', { playing: true }); },
    pause() { this.playing = false; emit('control', { playing: false }); },
    setSpeed(x) { this.speed = x; emit('control', { speed: x }); },
    /** advance the simulation by dt simulated seconds */
    step(dt) { eng.advance(Math.min(eng.now + dt, endT())); emit('tick', { t: eng.now }); return eng.now; },
    /** advance by wall-clock seconds at the current speed (call from requestAnimationFrame) */
    tick(wallDt) { if (this.playing) this.step(wallDt * this.speed); if (eng.now >= endT()) this.playing = false; },
    /** PRD query: state of the whole twin at time t (seeks, then returns the snapshot) */
    stateAt(t) { this.seek(t); return this.state; },
    /** ordered event log so far: [{ t, type, ...payload }] */
    get events() { return eng.events; },
    /** task intervals for Gantt views */
    get taskLog() { return eng.taskLog; },
    /** jump to an absolute time (seconds since midnight); backwards seeks replay from the seed deterministically */
    seek(t) {
      t = Math.max(eng.t0, Math.min(t, endT()));
      if (t < eng.now) {
        muted = true;
        eng = new Engine(data, config, emit);
        eng.advance(t);
        muted = false;
      } else {
        muted = true; eng.advance(t); muted = false;
      }
      emit('seek', { t });
      return eng.now;
    },
    /** re-plan: new cover count / seed / knobs; restarts the service from prep */
    reset(patch = {}) {
      config = resolve(patch, config);
      muted = true; eng = new Engine(data, config, emit); muted = false;
      plan();
      emit('reset', { config });
    },
    /** raw-material requirement vs stock for the current plan (the MRP table) */
    mrp(covers = config.covers) { return mrpTable(data, covers, null); },
  };
  return sim;
}
