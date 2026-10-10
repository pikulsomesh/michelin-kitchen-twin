# PR-FAQ: Michelin Kitchen Twin

*Working-backwards press release and FAQ. Written before the product exists so every build decision can be checked against it.*

---

## Press release

**A three-Michelin-star dinner service, simulated to the second, in your browser.**

*Michelin Kitchen Twin turns one of the most chaotic production environments on earth, a fine-dining kitchen at full service, into a photoreal, data-driven digital twin that anyone can open from a link.*

**The problem.** Manufacturing leaders are told digital twins can model their plants, but the demos they see are abstract dashboards or toy conveyor belts. They rarely see a twin handle what real operations look like: dozens of product variants, shared machines, skilled operators, perishable inventory, and a customer who will not wait. Meanwhile a modern kitchen solves exactly that problem every night with no software at all.

**The solution.** Michelin Kitchen Twin models a dinner service at a published three-star tasting-menu restaurant (The French Laundry, from its cookbooks and published menus). Pick the dishes, set the number of covers, and press Start Service. A realistic 3D kitchen comes alive: tickets print at the pass, cooks move between stations, combi ovens and plancha heat up, sauces reduce, plates are built and walked out. Every ingredient in the walk-in drains in real time. A live operations dashboard shows throughput, ticket times, bottlenecks and equipment utilization (OEE), exactly as a plant manager would read a production line.

Then the fun starts. Double the covers. Take a cook off the line. Fail an oven at 8:15 pm. Run out of lobster. Watch the bottleneck move, ticket times climb and the dashboard tell you why, then fix it and run the night again.

**How it works.** The menu is a product catalog, each recipe is a bill of materials, each preparation step is a routing operation on a specific workcell (station) and machine (appliance), and covers are the build plan. A deterministic discrete-event simulation schedules the whole service, and the 3D scene is a faithful view of that simulation, not an animation. The kitchen exports as OpenUSD, so the same twin can be opened in NVIDIA Omniverse.

**Quote (product lead).** "If a twin can run a Michelin kitchen, with 10-plus courses, shared ovens, perishable inventory and guests who expect perfection, it can run your plant. We wanted people to *feel* that in ten seconds, not read about it in a white paper."

**Quote (imagined customer, VP Manufacturing).** "I sent the link to my plant managers with one question: which of our lines looks like the fish station at 8:30? Everyone answered within an hour."

**Get started.** Open the GitHub Pages link. No install, no login, works on a laptop and a phone.

---

## External FAQ

**Who is this for?**
Manufacturing and operations leaders, industrial and process engineers, the NVIDIA / OpenUSD / 3D community, restaurateurs and chefs, and anyone evaluating what Claude can build.

**Is the restaurant data real?**
Dishes, techniques and the kitchen's brigade structure are drawn from published sources (cookbooks, published tasting menus, press coverage) and cited in `data/`. Exact timings, quantities and layout are informed estimates and are labeled as such. This is an independent portfolio project, not affiliated with or endorsed by the restaurant.

**Is it actually a simulation or a pre-baked animation?**
A real simulation. The same seed and inputs always give the same service, and changing any input changes the outcome. The 3D view, timeline and dashboard all read from the same event log.

**Why a kitchen, for manufacturing people?**
A tasting-menu kitchen is high-mix, low-volume, just-in-time production with hard due dates, shared constrained resources, skilled labor and perishable inputs. That is the hardest case for most plants. Every concept maps one to one (see the mapping table in the PRD).

**What does it run on?**
Any modern browser (WebGL2, WebGPU where available). Static files on GitHub Pages.

**Where does NVIDIA fit?**
The kitchen scene exports to OpenUSD so it can be opened in Omniverse. The README explains how the same model maps to Omniverse factory twins, Isaac Sim (robotic arms at a station), and cuOpt (schedule optimization), and is honest about what runs in the browser today versus what would need Omniverse.

## Internal FAQ

**What is the single most important thing to get right?**
The first ten seconds. If the opening shot does not look like a real kitchen and does not move, nothing else gets seen.

**What is the biggest risk?**
Realism on a browser budget. We mitigate with baked lighting where possible, PBR materials, instancing for repeated items (plates, hotel pans, ingredients), level of detail, and a quality toggle.

**Second biggest risk?**
Three parallel build threads drifting apart. We mitigate with one shared data contract (`data/`) and one event-log contract between `src/sim` and `src/scene` (see PRD, "Interfaces").

**How do we know it worked?**
A first-time viewer can answer "what is the bottleneck at 120 covers and how do I fix it?" within two minutes, without instructions.
