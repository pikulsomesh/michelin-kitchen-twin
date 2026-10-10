# Data model

The twin treats a three-Michelin-star dinner service as a make-to-order factory. Every file in [`/data`](../data) maps to a standard manufacturing master-data object, so the 3D scene and the service simulation can read it the way an MES or ERP would.

| Kitchen concept | Manufacturing concept | File |
| --- | --- | --- |
| The restaurant and its kitchen | Plant | [`restaurant.json`](../data/restaurant.json) |
| Tasting menu, course choices, supplements | Product catalogue, configure-to-order options | [`menu.json`](../data/menu.json) |
| Covers booked tonight | Master production schedule (the build plan) | [`service.json`](../data/service.json) |
| Ingredients | Item master: purchased raw materials | [`items.json`](../data/items.json) |
| Mise en place (stocks, sauces, doughs, portioned fish) | Sub-assemblies / work in process | [`products.json`](../data/products.json), `type: intermediate` |
| Plated courses | Finished goods | [`products.json`](../data/products.json), `type: finished` |
| Recipe quantities | Bill of materials (`bom`) | inside each product |
| Recipe method, station, appliance, timings | Routing (`routing`): operations with setup and run times | inside each product |
| Stations (fish, meat, garde manger, pastry…) | Work centers | [`resources.json`](../data/resources.json) `workCenters` |
| Ranges, combi ovens, hearth, PacoJet… | Machines, with parallel capacity (`slots`) | `resources.json` `equipment` |
| Reach-ins, freezer, humidor, aging cooler | Storage locations | `resources.json` `storageLocations` |
| The brigade | Labor pool by skill, with shifts | `resources.json` `laborRoles`, `shifts` |
| Kitchen and annex floor plan | Plant layout | [`layout.json`](../data/layout.json) |
| Bibliography | Traceability | [`sources.json`](../data/sources.json) |

## How a service is planned

`src/model/mrp.js` runs a classic MRP explosion, the same code in the browser and in Node:

1. **Demand.** `demandForCovers(menu, covers)` turns covers into plates. Option shares (70% beef, 30% veal tongue) and supplement uptake (20% Kaluga caviar, 25% foie gras) are applied as expected values and rounded up.
2. **Explosion.** `explode()` walks the BOM in low-level-code order. Sub-assemblies are made in whole batches (`batchYield`), so 31 lobsters' worth of demand blanches two batches of 20. Raw materials are grossed up by `yieldPct` for trim, shelling and peeling: 900 g of shelled corn needs 2 kg on the cob.
3. **Load.** Every routing operation becomes labor minutes for a role (scaled by `laborFraction`, since a cook is not hands-on while the combi runs) and machine minutes for a piece of equipment. Operations are split by `phase`: `prep` is mise en place before service, `service` is à la minute work fired by tickets.
4. **Capacity.** `loadSummary()` compares labor minutes with rostered minutes per role and shift.

Run it from the command line:

```sh
npm run plan -- 62    # one full turn of the dining room
npm run plan -- 120   # a double turn
```

At 62 covers every station has headroom. At 120 covers the fish commis needs more prep time than the shift allows (105%), and the fish and meat chefs de partie run at 90 to 93% during service. Those are the bottlenecks step 3's simulation will show live. The stock pot ranges carry about 20 hours of simmering, which is why a real kitchen makes veal stock and corned tongue days ahead; `leadTimeMinutes()` reports those lead times (corned tongue is about 76 hours, foie gras torchon about 49).

## What is published and what is estimated

Every record has a `src` list pointing at [`sources.json`](../data/sources.json). `est` marks a modelling estimate.

**From published sources**
- Kitchen size (1,980 sq ft), annex size (2,450 sq ft), 62 seats, open plan with two Bonnet island suites (savory; pastry and garde manger), no walk-in coolers, curved ventilated ceiling, fritted ribbon window to the garden, terrazzo floor, LED lighting matched to the dining room.
- The equipment schedule: Bonnet suites, Hestan range, Imperial stock pot ranges, RATIONAL combis, Rotisol rotisserie, Sodir salamanders, wood-burning hearth, stone hearth oven, Traulsen reach-ins and meat aging cooler, PacoJet, Robot Coupe, Vitamix, KitchenAid, Koch vacuum sealer, Berkel slicer, Omcan grinder, Scotsman ice, cheese humidor.
- The courses and their components, from two course-by-course reviews and the restaurant's signature dishes.
- Full recipe quantities and method timings for Oysters and Pearls, the salmon cornet batter, Coffee and Doughnuts, and butter-poached lobster in beurre monté, all from reproductions of Thomas Keller's published recipes.

**Estimated**
- The menu is a composite. The real Chef's Tasting Menu changes daily, so this one combines documented courses rather than reproducing a single night.
- Quantities for courses with no published recipe (yellowtail, duck, beef, veal tongue, cheese, pre-dessert, mignardises) are typical fine-dining portions.
- Operation times not stated in a recipe come from professional practice.
- Brigade size and shifts. The restaurant does not publish them; 15 people at service (13 cooks, 2 dishwashers) matches a diner's count of "at least a dozen" in the kitchen.
- Equipment positions and slot counts. The layout follows the published concept but is a reconstruction, not a survey.
- Reservation pattern, party sizes, course pacing within the published 3 to 3.5 hour meal, and option and supplement mixes.
- Labor load counts only routed operations. Tasting, cleaning down, family meal and the chef's walkthrough are not modelled, so real utilization is higher.

## Conventions

- Mass in grams; liquids also in grams (density taken as 1). Countable items are `ea`; plated sub-assemblies are `portion`.
- BOM quantities are per `batchYield` of the parent and are net (usable) amounts.
- Operation `per: "unit"` means `runMin` per unit; `per: "batch"` means per batch, capped at `maxBatch` units during service.
- `wait: true` marks passive time (proofing, curing, freezing, resting) that holds material but no cook.
- Temperatures are in °C. Recipe temperatures given in °F were converted.

`npm run validate` checks every reference (items, work centers, equipment, roles, storage, sources, layout) and that option shares sum to 1. `npm test` checks that the explosion reproduces the published Oysters and Pearls quantities.
