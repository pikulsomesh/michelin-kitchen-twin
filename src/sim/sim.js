// Public API. A Sim wraps the discrete-event Engine with a wall-clock player: play/pause/speed,
// deterministic seek (rewinds by replaying from the seed), event subscription and snapshots.
import { Engine, DEFAULT_CFG } from './engine.js';
import { mrpTable, explodeRequirements } from './mrp.js';
import { fmtClock } from './rng.js';

export { DEFAULT_CFG, fmtClock, mrpTable, explodeRequirements };

export function createSim({ data, ...cfg } = {}) {
  if (!data) throw new Error('createSim: data (KitchenData) is required');
  const listeners = new Map();
  let muted = false;
  const emit = (type, payload) => {
    if (muted) return;
    for (const cb of listeners.get(type) || []) cb(payload);
    for (const cb of listeners.get('*') || []) cb(type, payload);
  };
  let config = { ...DEFAULT_CFG, ...cfg };
  let eng = new Engine(data, config, emit);
  let forecast = null;

  const computeForecast = () => {
    const probe = new Engine(data, config, () => {});
    const limit = probe.cfg.prepStart + 22 * 3600;
    while (!probe.serviceDone && probe.now < limit) probe.advance(probe.now + 300);
    if (probe.endT) probe.advance(probe.endT);
    const snap = probe.snapshot();
    forecast = { endT: probe.endT ?? probe.now, snapshot: snap, series: probe.series };
  };
  computeForecast();

  const sim = {
    data,
    playing: false,
    speed: 60,
    get config() { return config; },
    get engine() { return eng; },
    get t() { return eng.now; },
    get start() { return eng.t0; },
    get end() { return forecast.endT; },
    get forecast() { return forecast; },
    get state() { return { ...eng.snapshot(), series: eng.series }; },
    snapshot() { return this.state; },
    on(type, cb) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(cb); return () => listeners.get(type).delete(cb); },
    off(type, cb) { listeners.get(type)?.delete(cb); },
    play() { this.playing = true; emit('control', { playing: true }); },
    pause() { this.playing = false; emit('control', { playing: false }); },
    setSpeed(x) { this.speed = x; emit('control', { speed: x }); },
    /** advance the simulation by dt simulated seconds */
    step(dt) { eng.advance(Math.min(eng.now + dt, forecast.endT)); emit('tick', { t: eng.now }); return eng.now; },
    /** advance by wall-clock seconds at the current speed (call from requestAnimationFrame) */
    tick(wallDt) { if (this.playing) this.step(wallDt * this.speed); if (eng.now >= forecast.endT) this.playing = false; },
    /** jump to an absolute time (seconds since midnight); backwards seeks replay from the seed deterministically */
    seek(t) {
      t = Math.max(eng.t0, Math.min(t, forecast.endT));
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
      config = { ...config, ...patch };
      muted = true; eng = new Engine(data, config, emit); muted = false;
      computeForecast();
      emit('reset', { config });
    },
    /** raw-material requirement vs stock for the current plan (the MRP table) */
    mrp(covers = config.covers) { return mrpTable(data, covers, null); },
  };
  return sim;
}
