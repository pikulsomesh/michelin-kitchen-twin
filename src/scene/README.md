# src/scene: the 3D kitchen twin

A photoreal, browser-only Three.js model of The French Laundry's kitchen (the 2017 skylit vault), its support annex, the garden and a glimpse of the dining room. Everything is generated from `/data` at load time: no binary assets, so it ships on GitHub Pages as plain JS.

```js
import { createKitchenScene } from './scene/index.js';
import { bindSim } from './scene/bind.js';

const twin = await createKitchenScene(el, { quality: 'auto' });   // 'mobile' | 'balanced' | 'high' | 'ultra' (Pro Max)
const binding = bindSim(twin, sim);                                // src/sim drives it; the sim owns the clock
twin.onFrame((dt) => { sim.tick(dt); binding.update(dt); });
```

## Ids

The scene uses the data ids directly, so the sim, the dashboard and the OpenUSD export all agree:

| Kind | Ids |
| --- | --- |
| Work centers | `WC-*` from `layout.json`, plus `dining` and `server` (the runners' side of the pass) |
| Equipment | `EQ-*` from `resources.json` |
| Storage | `SL-*` (cabinets resolve to their `EQ-*`; `SL-DRY`, `SL-LIVE-TANK` are shelving and the shellfish cart) |
| Ingredients | `RM-*` and `INT-*` from `items.json` / `products.json` |
| Staff | any id; `bindSim` uses the sim's `ST-*` and `FOH-RUNNER-*` |

## API

**Equipment**: `setApplianceState(id, 'off'|'preheating'|'idle'|'busy'|'fault', { tempC, progress, label, slotsBusy, load })`, `getApplianceState(id)`. Burners, flames, ovens, LEDs, steam and heat haze follow the state.

**Brigade**: `addCook(id, { name, role, stationId })`, `moveCook(id, target, { seconds, speed })` (walks the aisles on a nav grid, returns a Promise), `placeCook(id, target)`, `setCookActivity(id, label, { busy })`, `removeCook(id)`, `follow(id)`.

**Work in progress**: `addItem(id, { kind: 'plate'|'pan'|'tray'|'pot', dishId, label }, at)`, `moveItem(id, to, { seconds, carriedBy })`, `pickUpItem(id, cookId)`, `removeItem(id)`, `setTickets(n)`, `followNextPlate()`.

**Inventory**: `setInventoryLevel(id, fraction, { qty })`: the containers on the shelves empty as stock is drawn.

**Overlays**: `setOverlay('none'|'utilization'|'traffic'|'both')`, `setUtilization({ id: 0..1 })`, `resetTraffic()`, `highlight(ids)`, `setLabels('stations'|'all'|'none')`.

**Camera**: `flyTo(id)` or `flyTo(pos, target, seconds)`, `focus(id)`, `overview()`, `intro()`, `startTour()`, `stopTour()`.

**Look** (for the studio): `setLook({ sun: { azimuthDeg, elevationDeg, color, intensity }, sky: { top, horizon }, interior: { kelvin, intensity }, accent: { kelvin, intensity }, exposure, haze, season, foliage })`, `setDining([{ id, seats, shape: 'round'|'rect', x, z, rotY }])` (x < 0 is the dining room). Azimuth 0° looks from the garden side (+z), 90° from the east (+x).

**Render**: `setQuality(tier)`, `quality`, `qualityTiers`, `renderOnce()`, `exportUSD()` (OpenUSD `.usda` for NVIDIA Omniverse and Isaac Sim), `on('select'|'appliance'|'inventory'|'tour'|'follow'|'quality', fn)`, `dispose()`. The container also fires a `twin:ready` DOM event with the API as `detail`; `scene`, `camera`, `renderer` and `controls` are exposed for add-ons.

## Quality tiers

| Tier | What it does |
| --- | --- |
| Mobile | 1× pixels, no MSAA or bloom, 1K shadows (default on phones and software GPUs) |
| Balanced | up to 1.25×, MSAA, bloom, 2K shadows |
| High | up to 2×, ground-truth AO, 4K shadows |
| Pro Max | native pixels and progressive accumulation: while the camera rests, jittered frames converge into a supersampled image with soft area shadows from a jittered sun and key light, plus depth of field |

Steel reflects the kitchen itself: an in-scene reflection probe is captured from the aisle after the scene is built.

## Files

`index.js` scene, API and render loop · `bind.js` sim binding · `quality.js` tiers and the Pro Max accumulator · `plan.js` layout from `/data` · `room.js` building, vault, annex, dining room, garden · `equipment.js` / `appliances.js` machines · `ingredients.js` containers and contents · `cooks.js` brigade figures · `items.js` plates and pans · `materials.js` procedural PBR materials · `sky.js` dusk sky · `nav.js` A* nav grid · `tour.js` camera shots · `clock.js` the "Sense of Urgency" clock and the Per Se screen · `usd.js` OpenUSD export.
