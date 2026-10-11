// Entry for the deployed operations dashboard (dashboard.html). Uses the bundled data/ so it works on GitHub Pages without fetches.
import { data as raw } from '../data.js';
import { adaptKitchenData } from '../sim/adapter.js';
import { createSim } from '../sim/sim.js';
import { forecastCache } from '../sim/precomputed.js';
import { leversFromQuery } from '../sim/optimize.js';
import { mountDashboard } from './dashboard.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.get(k) !== null && Number.isFinite(+q.get(k)) ? +q.get(k) : d);
const data = adaptKitchenData(raw);
const sim = createSim({
  data, cache: forecastCache(data), seed: num('seed', 1), ...leversFromQuery(q), ...(q.get('covers') ? { covers: num('covers') } : {}), ...(q.get('seating') ? { seating: q.get('seating') } : {}),
});
sim.setSpeed(num('speed', 60));
sim.seek(sim.config.doorsOpen - 600);
const dash = mountDashboard(document.getElementById('dashboard'), sim);
if (q.get('t')) sim.seek(sim.config.doorsOpen + 3600 * num('t', 0));
if (q.get('play') !== '0') sim.play();
dash.start();
window.kitchenTwin = { sim, dash, data };

// link back to the 3D site (same folder on Pages and in dev)
document.querySelector('.brand small')?.insertAdjacentHTML('afterend', ' <a href="./" style="color:#3987e5">3D kitchen →</a>');
