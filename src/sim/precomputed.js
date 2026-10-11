// Precomputed service scenarios and optimizer outcomes (written by `npm run precompute` into
// precomputed.data.js). The site reads them instead of running the simulation live:
//   scenarioLibrary(data)  the guest counts, their KPIs and the optimizer's ranked plans, or null if stale
//   forecastCache(data)    a createSim `cache` that knows when each precomputed night ends
// Entries are keyed by the dataset's fingerprint, so a change to /data falls back to live runs.
import LIBRARY from './precomputed.data.js';

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

/** Hash of the sim input, so cached runs are only used for the data they were made from. */
const prints = new WeakMap();
export const fingerprint = (data) => { if (!prints.has(data)) prints.set(data, fnv(JSON.stringify(data))); return prints.get(data); };

/** Stable key for a resolved sim config: a hash of it with keys sorted, so property order does not matter. */
export function configKey(cfg) {
  const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
  const s = JSON.stringify(norm(cfg));
  return fnv(s) + fnv(`${s.length}:${s}`);
}

const fresh = (data, lib = LIBRARY) => lib && lib.fingerprint === fingerprint(data);

export function scenarioLibrary(data, lib = LIBRARY) { return fresh(data, lib) ? lib : null; }

export function forecastCache(data, lib = LIBRARY) {
  if (!fresh(data, lib)) return null;
  const ends = new Map(Object.entries(lib.forecasts));
  return (cfg) => ends.get(configKey(cfg)) ?? null;
}
