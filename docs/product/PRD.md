# PRD: Michelin Kitchen Twin

Companion to [PR-FAQ.md](PR-FAQ.md). This is the build contract for the three build threads: data and integration, 3D scene (`src/scene`), and simulation plus dashboard (`src/sim`, `src/dashboard`).

## 1. Audiences and jobs-to-be-done

| Audience | Job to be done | Their wow moment | What breaks trust |
|---|---|---|---|
| **Manufacturing leaders** (VP Ops, plant managers) | "Show me a twin can handle *my* complexity, and tell me what it would answer for me." | Doubling covers and watching the bottleneck move from fish to pastry, with OEE and ticket-time KPIs they already use. | KPIs that are just decoration; numbers that don't respond to inputs. |
| **Industrial / process engineers** | "Is the model real? Can I see the routing, the constraints, the schedule?" | A Gantt of every station and machine, clickable down to one plate's genealogy (which cook, which oven, which lot of butter). | Hidden logic. Non-deterministic runs. |
| **NVIDIA / OpenUSD / 3D community** | "Is the 3D genuinely good, and does it speak USD?" | Photoreal stainless steel, steam, flame and plating in a browser tab; one click to download the scene as `.usda`. | Plastic-looking materials; claims of Omniverse integration that aren't real. |
| **Chefs and restaurateurs** | "Does this understand a real service?" | Correct brigade, real dishes, pacing between courses, the expo calling "fire table 12". | Wrong dish names, impossible techniques, cooks teleporting. |
| **Portfolio viewers / recruiters** | "What can Claude build, and how fast?" | A polished, coherent product with a clear story and a "how it was built" page (parallel Claude threads). | Bugs, slow load, broken mobile. |

**Primary persona:** the manufacturing leader. Every default, label and narrative choice serves them first; the others are served by depth on demand.

## 2. Manufacturing mapping (shown in-product, not just in docs)

| Kitchen | Factory |
|---|---|
| Tasting menu | Product catalog / mix |
| Recipe | Bill of materials (BOM) |
| Prep and cook steps | Routing operations |
| Station (fish, meat, garde manger, pastry, sauce) | Workcell |
| Range, combi oven, plancha, circulator, salamander, fryer, blast chiller | Machines / constrained resources |
| Cook, chef de partie, commis | Operator, with skills matrix |
| Mise en place | Kitting / WIP buffer |
| Walk-in and dry store | Warehouse / raw-material inventory |
| Ticket | Work order |
| Covers booked across seatings | Demand / master production schedule (the "build plan") |
| Course firing and pacing | Takt time and sequencing |
| Chef at the pass (expo) | Final inspection / QA gate |
| Re-fire | Scrap and rework |
| "86" an item | Stockout |
| Ticket time | Lead time |

A toggle in the UI ("Kitchen terms / Factory terms") swaps every label in the dashboard between these two vocabularies. This is the single cheapest feature with the biggest payoff for the primary persona.

## 3. Feature set (prioritized)

### P0: must ship for the first public link
1. **Cinematic opening (first 10 seconds).** Page loads straight into a slow dolly shot across the live kitchen mid-service: steam, flame, cooks moving, tickets on the rail. One overlay line ("A three-Michelin-star dinner service, simulated as a factory.") and one button: **Run tonight's service**. Loader shows progress and lands on the shot, not a menu screen.
2. **Realistic kitchen scene.** Line, pass, walk-in, pastry corner, dish pit. PBR stainless, tile, wood, copper; HDRI or baked lighting; contact shadows; steam/flame particles; ingredients visible at stations (hotel pans of mise en place). Quality toggle (High / Balanced / Mobile).
3. **Menu and covers selector.** Pick courses from the published tasting menu (default: the full menu), set covers (default 60; range 1 to 200), set seating curve (default: two turns, 5:30 and 8:00 pm).
4. **Deterministic discrete-event simulation.** Tickets, course firing, cook and machine scheduling, travel time between stations, inventory draw-down. Seeded; same inputs, same result. Runs faster than real time (1x to 60x, pause, step).
5. **Live operations dashboard.** Covers served, plates/hour, average and p90 ticket time per course, station and machine utilization, OEE per machine (availability x performance x quality), current bottleneck with a one-sentence reason, labor utilization.
6. **Real-time inventory.** Every ingredient's on-hand quantity draining live, with par levels, projected stockout time, and an "86" warning. Click an ingredient to see it highlighted in the walk-in and at the stations using it.
7. **Timeline scrubber.** Scrub the whole service; the 3D scene, dashboard and inventory all jump to that moment.
8. **What-if scenarios (one click each).** Each runs instantly and shows a before/after delta on the KPIs:
   - **Full house:** covers 60 -> 120.
   - **Short-staffed:** remove one cook (choose station).
   - **Oven down:** a combi oven fails at 8:15 pm for 30 minutes.
   - **Supply shock:** lobster delivery short by 40%.
   - **Rush seating:** all covers seated within 30 minutes.
9. **Kitchen / Factory terms toggle** (see section 2).
10. **Runs on GitHub Pages**, loads under 5 s on broadband, 60 fps on a recent laptop, usable at 30 fps on a recent phone.

### P1: makes it memorable
11. **Guided tour.** Six camera stops with one caption each: the pass (work orders), the walk-in (inventory), the fish station (bottleneck), the combi ovens (OEE), pastry (parallel line), the dining room door (delivery). Auto-plays once; replayable.
12. **Follow a plate.** Click any plate to follow it from raw ingredients to the guest, with a genealogy card (BOM, routing steps, cook, machine, start/finish, lead time). This is "traceability" for the manufacturing audience.
13. **Station Gantt.** Swimlanes per cook and machine, colored by course, with idle gaps visible. Click a bar to fly the camera there.
14. **Heat map overlay.** Floor heat map of cook travel and congestion (spaghetti diagram for lean folks).
15. **Shareable scenarios.** All inputs in the URL, so "here's what 150 covers with one oven down looks like" is a link.
16. **Compare runs.** Pin a baseline; the dashboard shows deltas against it.
17. **OpenUSD export.** Download the kitchen as `.usda` to open in NVIDIA Omniverse / usdview.
18. **NVIDIA ecosystem page.** How this maps to Omniverse factory twins, Isaac Sim, OpenUSD and cuOpt, with a clear line between what runs here and what would need Omniverse.

### P2: depth for experts
19. **Optimizer.** "Suggest a fix": try adding a cook, moving a task, or re-sequencing fires and report the best KPI gain (a browser-side heuristic, framed as what cuOpt would do at scale).
20. **Capacity curve.** Sweep covers 20 to 200 and chart ticket time vs covers to find the kitchen's knee point ("rated capacity").
21. **Shift report.** End-of-service summary card: covers, KPIs, top bottleneck, waste, inventory used, exportable as CSV.
22. **"How it was built" page.** The parallel Claude threads, what each owned, and the timeline.

### Out of scope (for now)
Multiplayer, real POS integration, real-time sensor feeds, VR, sound design beyond a subtle ambient track (stretch).

## 4. Demo narrative (the 2-minute story)

1. **0 to 10 s: Hook.** Live cinematic shot of service in progress. One line of copy. One button.
2. **10 to 30 s: Orient.** Click Run. Camera settles over the pass. Tickets print; the dashboard slides in showing 0 covers served, ticket times empty, all stations green.
3. **30 to 60 s: It's a factory.** Guided tour hits the walk-in (inventory draining), the combi ovens (OEE ticking), the fish station. The "Factory terms" toggle is called out once.
4. **60 to 90 s: Break it.** Prompt: "What if you doubled tonight's covers?" Click Full house. The fish station turns red, ticket p90 jumps, the dashboard names the bottleneck and why.
5. **90 to 120 s: Fix it.** Add a cook to fish (or move the lobster to the second combi). KPIs recover; the before/after card shows the delta. Closing line: "If a twin can run this kitchen, it can run your plant."

## 5. KPI definitions (one source of truth for sim and dashboard)

- **Covers served:** guests whose final course has left the pass.
- **Ticket time (lead time):** from course fire to plate leaving the pass. Report mean and p90 per course.
- **Course gap:** time a table waits between consecutive courses. Target band shown on the chart.
- **Throughput:** plates leaving the pass per hour, rolling 15 min.
- **Utilization:** busy time / available time per cook and per machine.
- **OEE (per machine):** Availability (uptime / planned time) x Performance (ideal cycle / actual cycle) x Quality (first-pass plates / total plates, re-fires count against).
- **Bottleneck:** resource with the highest utilization and the longest queue in the current window, with a one-sentence explanation.
- **Inventory:** on hand, par, consumption rate, projected stockout time, waste.

## 6. Interfaces between threads

- **`data/` (owned by Research and data model):** menu, recipes (BOM), routings (operation, station, machine, duration distribution, skill), stations, appliances (with 3D anchor ids), staff (skills), inventory (starting quantity, par, unit), seating curve, and source citations.
- **Sim event log (owned by Simulation engine):** an ordered list of events `{ t, type, entityId, stationId?, machineId?, staffId?, orderId?, payload }` with types such as `ticket.fired`, `op.start`, `op.end`, `staff.move`, `machine.state`, `inventory.change`, `plate.passed`, `plate.refire`. Plus a `stateAt(t)` query used by the scrubber.
- **Scene API (owned by Realistic 3D kitchen):** consumes events and `stateAt(t)`; exposes anchors by the same station/machine/staff ids used in `data/`, `flyTo(id)`, `highlight(ids)`, `setQuality(level)`, and `exportUSD()`.
- **One clock.** The sim owns time; the scene and dashboard never advance time themselves.

## 7. Quality bar and success metrics

- **Realism:** a cook or chef shown a screenshot says "that's a real kitchen" before noticing it is rendered.
- **Correctness:** every number on screen changes when its inputs change, and re-running with the same seed reproduces it exactly.
- **Performance:** under 5 s to first frame on broadband; 60 fps laptop, 30 fps phone; total download under 25 MB.
- **Comprehension:** a first-time viewer finds and explains the bottleneck at 120 covers within two minutes, unaided.
- **Honesty:** sources cited in `data/`; estimates labeled; NVIDIA claims limited to what is actually exported or described.
