# From browser twin to NVIDIA Omniverse

This twin runs entirely in the browser on GitHub Pages: Three.js for rendering and a JavaScript discrete-event simulation for the dinner service. Nothing here runs on NVIDIA software. The model, though, is built from the same parts an industrial digital twin is built from (layout, equipment, routings, labor, demand), and each part has a direct counterpart in NVIDIA's physical-AI stack. This page explains how the kitchen would move into that stack, and is explicit about what exists today and what would need Omniverse.

## What runs where

| Capability | In this repo, in the browser | What NVIDIA tooling would add |
| --- | --- | --- |
| 3D scene | Three.js, physically based materials, real-time lighting | RTX path-traced rendering, physically accurate materials and sensor simulation in Omniverse |
| Scene format | Scene graph with USD-friendly prim names; `.usda` export from the 3D view (in progress) | Native OpenUSD stage, composed with layers, references and variants, shared live across tools |
| Process simulation | Seeded discrete-event simulation of tickets, cooks, machines and inventory | The same event model driving an Omniverse twin, plus physics for robots and material flow |
| Robotics | None | Isaac Sim for robot arms at a station, trained in Isaac Lab |
| Scheduling | Heuristic dispatching of operations to cooks and machines | cuOpt for GPU-accelerated optimization of the schedule and routing |
| Factory-scale orchestration | One kitchen | Mega blueprint for fleets of robots, sensors and AI agents in a facility twin |

## The pieces

### OpenUSD
[OpenUSD](https://openusd.org) is the scene description that Omniverse, Isaac Sim and most industrial 3D tools share. A `.usda` export of the kitchen is being added to the 3D view. The plan is to name prims after the ids in [`data/`](../data), so that `EQ-COMBI-KITCHEN` in the data becomes a prim like `/Kitchen/Equipment/EQ_COMBI_KITCHEN`, and a simulation event in the browser and a prim in Omniverse refer to the same thing. The export opens in usdview or Omniverse; in Omniverse, the rough Three.js materials would be swapped for MDL or OpenPBR materials.

### NVIDIA Omniverse
[Omniverse](https://www.nvidia.com/en-us/omniverse/) is NVIDIA's platform for building OpenUSD-based digital twins. Manufacturers such as Caterpillar and Lucid use it for factory twins ([source](https://roboticsandautomationnews.com/2025/10/29/nvidia-says-its-working-with-us-manufacturing-and-robotics-leaders-to-drive-americas-reindustrialization-with-physical-ai/96007/)). Brought into Omniverse, the kitchen would get path-traced lighting through the curved skylit ceiling, and a live connection where the simulation's event log moves cooks and plates in the USD stage.

### Isaac Sim and Isaac Lab
[Isaac Sim](https://developer.nvidia.com/isaac/sim) simulates robots in physically accurate OpenUSD scenes. [Isaac Lab](https://developer.nvidia.com/isaac/lab) trains their policies with reinforcement learning. The natural first robot in this kitchen is a repetitive, well-specified operation from [`products.json`](../data/products.json), such as:
- `Pipe onto trays` (gougères) or `Fill coffee cups, tap level` (semifreddo) at the pastry station;
- `Shuck, separate liquor, trim` (oysters) at the fish station;
- dish-pit loading at `WC-DISH`.

Each routing step already names its work center, equipment and cycle time. That is the specification an Isaac Sim robot cell would be built against, and the twin can show the effect on ticket times before any hardware exists.

### Mega blueprint
[Mega](https://manufacturingdigital.com/articles/mega-omniverse-blueprint-nvidias-ai-driven-digital-twins) is an Omniverse Blueprint for "the development, testing, and optimisation of physical AI" in a digital twin of a facility, coordinating robots, sensors, AI agents and equipment. A kitchen is a small instance of the same problem: shared machines, people and robots in one space, run against a production plan. This repo's data model (work centers, equipment, staff, routings, demand) has the same shape as the inputs a Mega-style twin needs.

### cuOpt
[cuOpt](https://blogs.nvidia.com/blog/cuopt-open-source) is NVIDIA's open-source, GPU-accelerated optimization engine for linear and mixed-integer programs and routing problems ([docs](https://docs.nvidia.com/cuopt/user-guide/latest/)). Firing a tasting menu for 62 covers is a scheduling problem. Hundreds of operations compete for 13 cooks and 32 machines under due dates set by course pacing. The browser simulation dispatches with simple rules. cuOpt is the tool you would use to find the optimal schedule at plant scale and feed it back into the twin.

### Cosmos and Metropolis
[Cosmos](https://www.nvidia.com/en-us/ai/cosmos/) world foundation models can generate synthetic training data from a twin like this one. [Metropolis](https://www.nvidia.com/en-us/autonomous-machines/intelligent-video-analytics-platform/) runs video analytics. Together they point to a real kitchen with cameras feeding live state (plates at the pass, a cook at a station) back into the twin. That is the "digital" in digital twin becoming bidirectional.

### Omniverse DSX
The [Omniverse DSX Blueprint](https://blogs.nvidia.com/blog/omniverse-dsx-blueprint) is "a comprehensive, open blueprint for designing and operating gigawatt-scale AI factories". It targets data centers, not kitchens. It is the same idea at the largest scale: plan, simulate and operate a facility from one twin.

## Honest limits

- No NVIDIA software runs on GitHub Pages, and this project does not use any NVIDIA service.
- The `.usda` export carries geometry, transforms and basic materials. It does not include physics, articulations or the simulation.
- The robot cells, the cuOpt schedule and the live camera feed above are a roadmap, not features.
- This is an independent project, not affiliated with or endorsed by NVIDIA.
