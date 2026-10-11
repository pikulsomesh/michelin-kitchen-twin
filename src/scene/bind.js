// Binds the 3D twin to the dinner-service simulation (src/sim). The sim owns
// the clock: the caller advances it (sim.tick) and this binder only mirrors
// sim.state into the scene and turns sim events into motion: cooks walking
// between stations, machines lighting up, plates carried to the pass and run
// to the dining room, stock draining from the shelves.
//
//   const binding = bindSim(twin, sim);
//   // per frame, after sim.tick(dt): binding.update()
//
// Ids are shared with /data: staff ST-* and FOH-RUNNER-*, stations WC-* and
// 'dining', appliances EQ-*, inventory RM-* / INT-*.

const LOOK = { 'chef-de-cuisine': 'chef', runner: 'server' };
// Runners wait on the dining-room side of the pass rather than in the line.
const placeFor = (s) => (s.role === 'runner' && s.station === 'WC-PASS' ? 'server' : s.station);
const MAX_PLATES = 48;

// "Panisse, cut · Cook chickpea batter, stirring #1/2" -> "Cook chickpea batter, stirring"
const shortTask = (name) => (name ? (name.split(' · ').pop() || name).replace(/\s*#\d+\/\d+$/, '') : null);

export function bindSim(twin, sim, { syncHz = 6 } = {}) {
  const has = { appliance: new Set(twin.appliances.map((a) => a.id)), ingredient: new Set(twin.ingredients.map((i) => i.id)) };
  const fridge = new Set(twin.plan.placements.filter((p) => p.eq.tempC != null).map((p) => p.eq.id));
  const want = new Map();     // cook id -> station the sim says they are at
  const errand = new Map();   // cook id -> true while carrying plates (sync leaves them alone)
  const applKey = new Map();  // appliance id -> last pushed state key
  const lastStep = new Map(); // ticket -> { station, staff } of its latest finished cooking step
  const plates = new Map();   // ticket -> [item ids]
  let plateSeq = 0, acc = 0, lastT = sim.t, stopped = false;

  const walkSpeed = () => Math.max(1.3, Math.min(5.5, 1.4 * Math.sqrt(Math.max(1, sim.speed) / 6)));
  const clockFor = (t) => { const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + t * 1000); };

  const dropPlates = () => {
    for (const ids of plates.values()) for (const id of ids) twin.removeItem(id);
    plates.clear();
    lastStep.clear();
    errand.clear();
  };

  // ------------------------------------------------------------ state mirror
  const sync = (jump) => {
    const st = sim.state;
    const speed = walkSpeed();
    for (const s of st.staff) {
      const onShift = s.state !== 'off';
      const known = twin.cooks.some((c) => c.id === s.id);
      if (!onShift) { if (known) { twin.removeCook(s.id); want.delete(s.id); } continue; }
      if (!known) {
        twin.addCook(s.id, { name: (s.title || s.name).replace(/ \(.*\)$/, ''), role: LOOK[s.role] || s.role, stationId: placeFor(s) });
        want.set(s.id, placeFor(s));
      }
      if (errand.get(s.id)) continue;
      const place = placeFor(s);
      if (want.get(s.id) !== place || jump) {
        want.set(s.id, place);
        if (jump) twin.placeCook(s.id, place);
        else twin.moveCook(s.id, place, { speed }).catch(() => {});
      }
      twin.setCookActivity(s.id, s.state === 'working' ? shortTask(s.task) : s.state === 'walking' ? `To ${s.taskStation || s.station}` : null, { busy: s.state === 'working' });
    }

    const util = {};
    for (const a of st.appliances) {
      if (!has.appliance.has(a.id)) continue;
      util[a.id] = a.roll ?? a.util ?? 0;
      const cold = fridge.has(a.id);
      const state = !a.up ? 'fault' : a.inUse > 0 && !cold ? 'busy' : st.phase === 'closed' && !cold ? 'off' : 'idle';
      const key = `${state}|${a.inUse}`;
      if (applKey.get(a.id) === key) continue;
      applKey.set(a.id, key);
      const label = a.running?.length ? shortTask(typeof a.running[0] === 'string' ? a.running[0] : a.running[0]?.name) : undefined;
      twin.setApplianceState(a.id, state, { slotsBusy: a.inUse, load: Math.min(1, a.inUse / Math.max(1, a.capacity)), label });
    }
    twin.setUtilization(util);

    for (const e of st.inventory) if (has.ingredient.has(e.id)) {
      const frac = e.start > 0 ? e.onHand / e.start : e.produced > 0 ? e.onHand / e.produced : e.onHand > 0 ? 1 : 0;
      twin.setInventoryLevel(e.id, frac, { qty: e.onHand, silent: true });
    }
    twin.setTickets(st.tickets.filter((k) => !k.passed).length);
    twin.setClock(clockFor(st.t));
  };

  // ------------------------------------------------------------ events
  const off = [];
  const on = (type, fn) => off.push(sim.on(type, (p) => { if (!stopped) fn(p); }));

  on('task:end', (p) => { if (p.ticket && p.kind === 'step') lastStep.set(p.ticket, { station: p.station, staff: p.staff }); });

  // A finished plate appears where it was plated and its cook carries it to the pass.
  on('plate:ready', async (p) => {
    if (twin.itemCount >= MAX_PLATES) return;
    const from = lastStep.get(p.ticket) || { station: 'WC-PASS' };
    const ids = [];
    for (let i = 0; i < Math.min(3, p.qty || 1); i++) {
      const id = `plate-${++plateSeq}`;
      twin.addItem(id, { kind: 'plate', dishId: p.dish, label: `${p.dish} · ${p.ticket}` }, from.station);
      ids.push(id);
    }
    plates.set(p.ticket, [...(plates.get(p.ticket) || []), ...ids]);
    const cook = from.staff && from.station !== 'WC-PASS' && twin.cooks.some((c) => c.id === from.staff) ? from.staff : null;
    if (cook && !errand.get(cook)) {
      errand.set(cook, true);
      try {
        await twin.moveItem(ids[0], 'WC-PASS', { carriedBy: cook });
        for (const id of ids.slice(1)) twin.moveItem(id, 'WC-PASS', { seconds: 0.4 });
      } finally {
        errand.delete(cook);
        want.delete(cook); // walk back on the next sync
      }
    } else for (const id of ids) twin.moveItem(id, 'WC-PASS', { seconds: 0.8 });
  });

  // A runner takes the course from the pass to the table.
  on('task:start', async (p) => {
    if (p.kind !== 'run' || !p.staff || !p.ticket) return;
    const ids = plates.get(p.ticket);
    if (!ids?.length || !twin.cooks.some((c) => c.id === p.staff)) return;
    plates.delete(p.ticket);
    errand.set(p.staff, true);
    try {
      for (const id of ids.slice(1)) twin.pickUpItem(id, p.staff);
      const to = p.table ? `table:${p.table}` : 'dining';
      await twin.moveItem(ids[0], to, { carriedBy: p.staff });
      for (const id of ids.slice(1)) twin.moveItem(id, to, { seconds: 0.5 });
      await new Promise((r) => setTimeout(r, 1500)); // leave the course on the table for a beat
    } catch { /* interrupted by a seek */ } finally {
      for (const id of ids) twin.removeItem(id);
      errand.delete(p.staff);
      want.delete(p.staff);
    }
  });

  on('qc:reject', (p) => twin.flash?.(lastStep.get(p.ticket)?.station || 'WC-PASS', 'reject'));
  on('reset', () => { dropPlates(); applKey.clear(); sync(true); });

  sync(true);

  return {
    // Call once per frame after sim.tick(); mirrors state at syncHz.
    update(dt = 1 / 60) {
      if (stopped) return;
      const jump = sim.t < lastT - 1 || sim.t - lastT > 900;
      if (jump) dropPlates();
      acc += dt;
      if (jump || acc >= 1 / syncHz) { acc = 0; sync(jump); }
      lastT = sim.t;
    },
    dispose() {
      stopped = true;
      off.forEach((f) => f?.());
      dropPlates();
      for (const id of want.keys()) twin.removeCook(id);
    },
  };
}
