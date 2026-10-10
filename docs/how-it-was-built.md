# How it was built

This twin was built by Claude in a single day, by several Claude sessions working in parallel in one project, each in its own thread and each owning one part of the repository. A person set the goal and the bar ("as realistic as possible", hosted on GitHub Pages) and approved merging. The sessions wrote the code, the data and the docs, reviewed each other's interfaces, and merged their own pull requests once CI was green.

## Who did what

| Thread | Owned | Pull requests |
| --- | --- | --- |
| Product | The PR-FAQ and PRD: who the twin is for, the two-minute demo, what "realistic" means | #1, #6 |
| Research and data model | `data/`: the restaurant chosen for having the most published detail, 14 cited sources, menu, recipes as bills of materials and routings, equipment, brigade, layout; the MRP explosion; the site shell, Pages deploy and final integration | #2, #3, #5, #7, #11, #15 |
| Simulation (Sonnet) | `src/sim` and `src/dashboard`: the seeded discrete-event engine, guest line, what-if scenarios, capacity sweep and the operations dashboard | #4, #8, #9, #14 |
| Realistic 3D kitchen (Opus) | `src/scene`: procedural physically based materials, the vaulted kitchen and garden, articulated cooks on a navigation grid, quality tiers up to Pro Max, OpenUSD export | #13 |
| Studio | `src/studio`: dining room, tasting or à la carte menus, seasons, and lighting and mood, each re-running the whole service | #12 |

The threads agreed on contracts rather than sharing files. The data uses one set of ids (`EQ-*` equipment, `WC-*` work centers, `SL-*` storage, `RM-*` raw materials, `INT-*` and `FG-*` products) and every other part keys off them: the simulation's adapter reads `/data`, the scene places a model at each `EQ-*` id and exports a USD prim under the same name, and Studio compiles its edits back into the simulation's input. When one thread needed something from another, such as ingredient prices from the data or a hook from the scene, it asked in a message and the owning thread made the change.

## What makes it a twin rather than an animation

- **The data is sourced.** Every record cites a publication or is marked `est`. The kitchen is 1,980 sq ft with no walk-in coolers and no hoods under a ventilated vault, as published; the Oysters and Pearls recipe reproduces Thomas Keller's published quantities, and a test checks that it does.
- **The plan is computed, not scripted.** Covers explode through the bills of materials into plates, sub-assemblies and grams of raw material, and the routings turn into minutes of work for each cook and machine.
- **The service is simulated.** Tickets fire, cooks walk to stations, machines fill their slots, stock drains, and plates queue at the pass. What you see in 3D is the simulation's state, frame by frame.
- **It is deterministic.** The same covers, seating and seed replay the same night to the second, which is why a Share link opens the exact moment you were watching.

## Running on GitHub Pages

Everything runs in the browser. The scene uses no downloaded models or textures: geometry and materials are generated from `/data` at load, so the whole site is about 430 KB of compressed JavaScript and CSS. Quality tiers scale from phones up to Pro Max, which accumulates jittered frames into a supersampled, soft-shadowed still while the camera rests.

## Numbers

- 88 raw materials, 53 products (38 sub-assemblies, 15 plated dishes), 32 pieces of equipment, 10 work centers, 19 staff across 14 roles
- About 7,000 lines of data and 10,600 lines of JavaScript and CSS
- 15 pull requests, each built and tested by CI before merge
