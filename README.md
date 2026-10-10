# Michelin Kitchen Twin

A browser-based 3D digital twin of **The French Laundry** (Yountville, California, three Michelin stars) running a full dinner service, modeled the way a manufacturing plant is.

The number of covers is the build plan. From it the twin works out every plate, every sub-assembly in the mise en place, every gram of ingredient, and the load on each cook and appliance. Later stages render the kitchen in realistic 3D and simulate the service minute by minute: tickets firing, stations working, food moving to the pass, inventory draining.

**Live site:** https://pikulsomesh.github.io/michelin-kitchen-twin/

Press **Run tonight's service** to watch the brigade work the line. Links carry the scenario and the moment, for example [`?covers=120&seating=rush&t=90`](https://pikulsomesh.github.io/michelin-kitchen-twin/?covers=120&seating=rush&t=90) opens a double-booked rush seating 90 minutes after the doors open.

## Status

| Stage | What it adds | State |
| --- | --- | --- |
| 1. Research and data model | Sourced data for the menu, recipes (BOM and routings), stations, equipment, brigade and layout; MRP explosion; site skeleton | Done |
| 2. Realistic 3D kitchen | Physically based models of the suites, hearth, combis and reach-ins; lighting and materials | In progress |
| 3. Dinner service simulation | Discrete-event simulation of N covers, live inventory, ticket times, OEE and bottlenecks, driving the 3D view and the operations dashboard | Done |
| 4. Polish and publish | Opening shot, shareable links, guided tour, build story | In progress |

## The data

| | |
| --- | --- |
| Menu | Chef's Tasting Menu, 11 courses incl. canapés and mignardises, with two course choices and two supplements |
| Recipes | 53 products: 38 sub-assemblies and 15 plated dishes, each with a bill of materials and a routing |
| Ingredients | 88 raw materials with yield, storage location and shelf life |
| Kitchen | 10 work centers, 32 pieces of equipment, 10 storage locations, 14 roles |
| Sources | 14 publications, cited on every record |

See [docs/data-model.md](docs/data-model.md) for how kitchen concepts map to manufacturing ones, and for what is published versus estimated.

## NVIDIA ecosystem

The twin runs in the browser on GitHub Pages, with no NVIDIA software. Its model has the same shape as an industrial twin, so [docs/nvidia.md](docs/nvidia.md) maps it to OpenUSD and Omniverse, Isaac Sim and Isaac Lab for robotic stations, the Mega blueprint for facility-scale twins, and cuOpt for schedule optimization. The page is explicit about what runs here today and what would need Omniverse.

## Run it

```sh
npm install
npm run dev              # 3D site at http://localhost:5173
npm run plan -- 62       # production plan for 62 covers in the terminal
npm run validate         # check every reference in /data
npm test
```

## Deploy

Pushing to `main` builds the site and publishes it to GitHub Pages via `.github/workflows/pages.yml`. The repository's Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment).

## Disclaimer

An independent, non-commercial portfolio project built from publicly available information. It is not affiliated with or endorsed by The French Laundry, Thomas Keller Restaurant Group or the Michelin Guide. Recipes are summarized from published sources for modelling; parts of the layout, staffing and timings are estimates and are marked as such in the data.
