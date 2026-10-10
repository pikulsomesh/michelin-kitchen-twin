// Loads the sourced data/*.json files (browser: fetch, Node: pass your own reader) and adapts them for the sim.
import { adaptKitchenData } from '../adapter.js';

const FILES = ['items', 'products', 'menu', 'resources', 'service', 'layout', 'restaurant'];

/** @param {(name: string) => Promise<object>} read  resolves a data file by base name, e.g. 'items' */
export async function loadKitchenData(read) {
  const parts = await Promise.all(FILES.map((f) => read(f)));
  return adaptKitchenData(Object.fromEntries(FILES.map((f, i) => [f, parts[i]])));
}

export const fetchReader = (base = './data/') => (name) => fetch(`${base}${name}.json`).then((r) => {
  if (!r.ok) throw new Error(`failed to load ${name}.json: ${r.status}`);
  return r.json();
});
