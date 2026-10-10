// Camera shots for the guided tour and for focusing on a station/appliance.
import * as THREE from 'three';

export const OVERVIEW = { pos: [23, 15, 21], target: [8.5, 0.6, 4.2] };

export const TOUR_SHOTS = [
  { name: 'The French Laundry kitchen', ...OVERVIEW, hold: 4 },
  { name: 'Savory suite, fish side', pos: [7.5, 2.4, 9.4], target: [7.5, 0.95, 5.4], hold: 5 },
  { name: 'Wood-burning hearth', pos: [8.4, 1.9, 2.9], target: [7.4, 0.9, 0.3], hold: 4.5 },
  { name: 'Rotisol rotisserie', pos: [9.5, 1.55, 2.0], target: [9.1, 0.95, 0.35], hold: 4 },
  { name: 'Hestan range and salamander', pos: [5.2, 1.9, 2.6], target: [4.6, 1.1, 0.4], hold: 4 },
  { name: 'Stock pots and combi', pos: [13.1, 2.0, 2.7], target: [12.9, 0.9, 0.4], hold: 4 },
  { name: 'Glass reach-ins', pos: [10.8, 1.6, 2.6], target: [10.75, 1.3, 0.4], hold: 4 },
  { name: 'The pass', pos: [5.2, 2.2, 5.4], target: [2.4, 1.1, 5.4], hold: 5 },
  { name: 'Sense of urgency', pos: [4.2, 2.4, 5.6], target: [0, 2.85, 5.4], hold: 3.5 },
  { name: 'Pastry suite', pos: [13.2, 2.3, 2.3], target: [13.2, 0.9, 5.4], hold: 4.5 },
  { name: 'Garde manger and the garden window', pos: [12.4, 2.0, 7.6], target: [12.4, 1.2, 10.6], hold: 4.5 },
  { name: 'Under the vault', pos: [16.2, 1.7, 9.8], target: [5, 3.6, 3], hold: 4.5 },
  { name: 'From the garden', pos: [10, 2.6, 17.5], target: [10, 1.4, 9], hold: 4 },
  { name: 'Support annex', pos: [9.5, 10, -0.5], target: [9.5, 0, -10.5], hold: 4 },
  { name: 'Plant layout', pos: [8.5, 36, -1.0], target: [8.5, 0, -2.5], hold: 4 },
];

// A pose looking at a work center from behind its cook, or at the front of
// a piece of equipment.
export function stationShot(id, stations, appliances) {
  const st = stations.get(id);
  if (st) {
    const s = st.spots[0];
    const back = 2.6;
    const fx = Math.sin(s.face), fz = Math.cos(s.face);
    return { pos: [s.x - fx * back, 2.1, s.z - fz * back], target: [s.x + fx * 0.8, 0.95, s.z + fz * 0.8] };
  }
  const app = appliances.get(id);
  if (app) {
    const p = new THREE.Vector3();
    app.group.getWorldPosition(p);
    const yaw = app.group.rotation.y;
    const dist = Math.max(1.4, Math.max(app.size.w, app.size.h) * 1.3);
    const cy = (app.mountY ?? p.y) + app.size.h * 0.6;
    return {
      pos: [p.x + Math.sin(yaw) * dist + Math.cos(yaw) * 0.4, cy + 0.8, p.z + Math.cos(yaw) * dist - Math.sin(yaw) * 0.4],
      target: [p.x, cy, p.z],
    };
  }
  return null;
}
