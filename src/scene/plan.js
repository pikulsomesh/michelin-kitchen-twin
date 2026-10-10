// Turns the master data in /data into a scene plan: where every piece of
// equipment, work center, storage location and ingredient goes. The data is
// the single source of truth (EQ-*, WC-*, SL-*, RM-*, INT-* ids); this file
// only adds what the data leaves to the 3D layer, such as where a cook stands.

const DEG = Math.PI / 180;

// Where cooks stand at each work center ([x, z, facing yaw]). Several spots
// per center so a chef de partie and a commis don't stand on each other.
export const WORK_SPOTS = {
  'WC-PASS': [[3.45, 5.4, -Math.PI / 2], [3.45, 4.5, -Math.PI / 2]],
  'WC-FISH': [[6.4, 7.0, Math.PI], [8.6, 7.0, Math.PI], [5.2, 7.0, Math.PI]],
  'WC-MEAT': [[8.8, 3.75, 0], [10.0, 3.75, 0], [7.6, 1.5, Math.PI]],
  'WC-GARNISH': [[5.6, 3.75, 0], [4.6, 1.5, Math.PI]],
  'WC-STOCK': [[12.4, 1.45, Math.PI], [13.6, 1.5, Math.PI]],
  'WC-GM': [[12.0, 6.85, Math.PI], [13.6, 6.85, Math.PI], [11.8, 9.8, 0]],
  'WC-PASTRY': [[12.4, 3.95, 0], [14.0, 3.95, 0], [15.8, 7.4, Math.PI / 2]],
  'WC-DISH': [[1.35, 9.2, -Math.PI / 2], [1.35, 7.3, -Math.PI / 2]],
  'WC-ANNEX-BUTCHERY': [[2.6, -14.5, Math.PI], [4.4, -14.5, Math.PI]],
  'WC-ANNEX-PREP': [[8.4, -14.5, Math.PI], [10.6, -14.5, Math.PI], [12.6, -12.4, Math.PI]],
};

export const WC_COLORS = {
  'WC-PASS': '#d6b46a', 'WC-FISH': '#5b9fd9', 'WC-MEAT': '#d9705a', 'WC-GARNISH': '#8fc36b',
  'WC-STOCK': '#b88b5b', 'WC-GM': '#7fd0c0', 'WC-PASTRY': '#e0a0c8', 'WC-DISH': '#8d96a0',
  'WC-ANNEX-BUTCHERY': '#c0604a', 'WC-ANNEX-PREP': '#9fc37b',
};

// Places the data leaves open, chosen to fit the published concept.
export const SITE = {
  dining: { door: [0, 5.4], spot: [-1.4, 5.4], server: [1.75, 5.4, Math.PI / 2] },
  annexDoor: { wall: 'north', at: 1.6, width: 1.4 },
  // Dry store and the live shellfish well have no equipment in the data.
  dryStore: { x: 14.6, z: -4.55, len: 7.2, depth: 0.5, rot: Math.PI, spot: [14.6, -5.5, 0] },
  liveTank: { x: 3.95, z: 8.9, w: 1.0, d: 0.6, rot: 0, spot: [3.95, 8.2, 0] },
  garden: { x0: 4, x1: 17, z0: 12.2, z1: 20 },
};

export function buildPlan(data) {
  const { layout, resources, items, products } = data;
  const eqById = new Map(resources.equipment.map((e) => [e.id, e]));

  const placements = layout.placements
    .filter((p) => eqById.has(p.equipment))
    .map((p) => ({
      eq: eqById.get(p.equipment),
      x: p.x, z: p.z, y: p.y ?? 0,
      rot: (p.rotY ?? 0) * DEG,
      embeddedIn: p.embeddedIn || null,
      area: p.z < 0 ? 'annex' : 'kitchen',
    }));
  const placed = new Map(placements.map((p) => [p.eq.id, p]));

  const zones = new Map([...layout.zones, ...(layout.annex?.zones || [])].map((z) => [z.id, z]));
  const workCenters = resources.workCenters.map((wc) => {
    const zone = zones.get(wc.id);
    let spots = WORK_SPOTS[wc.id];
    if (!spots && zone) spots = [[zone.x + zone.width / 2, zone.z + zone.depth / 2, 0]];
    return { ...wc, zone, color: WC_COLORS[wc.id] || '#9aa4ad', spots: (spots || [[0, 0, 0]]).map(([x, z, face]) => ({ x, z, face })) };
  });

  // Storage: tie each location to the cabinet that holds it.
  const storage = resources.storageLocations.map((s) => ({ ...s, placement: s.equipment ? placed.get(s.equipment) : null }));

  // Ingredients: raw materials plus intermediates (mise en place / WIP).
  const lastWc = (p) => (p.routing && p.routing.length ? p.routing[p.routing.length - 1].workCenter : null);
  const ingredients = [
    ...items.items.map((it) => ({ id: it.id, name: it.name, category: it.category, uom: it.uom, storage: it.storage, kind: 'raw', origin: it.origin })),
    ...products.products.filter((p) => p.type === 'intermediate').map((p) => ({
      id: p.id, name: p.name, category: 'wip', uom: p.uom, storage: p.storage, kind: 'wip', workCenter: lastWc(p),
    })),
  ];

  // Countertop machines in the annex need a bench under them.
  const benches = [...layout.benches];
  for (const p of placements) {
    if (p.area !== 'annex' || p.y < 0.5) continue;
    const [w, d] = p.eq.dimsM;
    const onBench = benches.some((b) => Math.abs(b.x - p.x) < b.width / 2 && Math.abs(b.z - p.z) < b.depth / 2 + 0.2);
    if (!onBench) benches.push({ id: `bench-${p.eq.id}`, x: p.x, z: p.z - 0.05, width: Math.max(1.0, w * (p.eq.count || 1) + 0.3), depth: Math.max(0.75, d + 0.2), height: p.y });
  }

  return {
    kitchen: layout.kitchen,
    annex: layout.annex,
    placements, placed, workCenters, storage, ingredients, benches,
    zones: [...zones.values()],
    menu: data.menu,
    products: products.products,
  };
}
