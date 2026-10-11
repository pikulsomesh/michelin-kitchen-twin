# Performance: measured, not assumed

The PRD (section 10) sets three speed targets: under 5 s to the first 3D frame on broadband, 60 fps on a recent laptop and 30 fps on a recent phone. This page says how the twin measures them and what has been measured so far.

## How it is measured

- **In the site.** `src/perf.js` timestamps every rendered frame. Open the menu (☰) and the View section shows a live **Performance** line: frames per second over the last 2 s, and the time from opening the page to the first 3D frame. The same numbers are available from the console as `kitchenTwin.perf()` (`firstFrameMs`, `readyMs`, `fps`, `frameP95Ms`, `frames`, `quality`).
- **Scripted.** `scripts/perf.mjs` serves the production build, opens it at each quality level (Low, Medium, High) in a laptop viewport (1440×900, 2× pixels) and a phone viewport (390×844, 3× pixels), lets shaders warm up, slowly orbits the camera while the service plays at 30×, and reads the same `kitchenTwin.perf()` numbers. It writes `docs/performance.json` and prints a table.

```sh
npm run build
npm i --no-save playwright
npm run perf                 # headless, software rendering: the same on any machine
PERF_GPU=1 npm run perf      # a visible browser on this machine's GPU: real-hardware numbers
PERF_URL=https://pikulsomesh.github.io/michelin-kitchen-twin/ PERF_GPU=1 npm run perf   # the live site
```

## Results so far

Measured on 2026-10-11 in a 4-core cloud container with no GPU, so Chromium rendered with SwiftShader (WebGL on the CPU). This is a worst-case floor, not a forecast for real devices.

| Viewport | Quality | First frame | fps |
|---|---|---|---|
| Laptop | Low | 12.1 s | 0.3 |
| Laptop | Medium | 13.6 s | 0.1 |
| Laptop | High | 14.4 s | 0.0 |
| Phone | Low | 15.3 s | 0.4 |
| Phone | Medium | 14.0 s | 0.0 |
| Phone | High | 13.9 s | 0.1 |

What this does and doesn't show:

- **Frame rate:** nothing about real devices. Software WebGL draws one frame every few seconds whatever the scene, so the 60 fps and 30 fps targets are still **unverified on real hardware**. Auto quality already starts software renderers on Low and steps down when frames stay under 28 fps.
- **First frame:** an upper bound. On the CPU, 12 to 15 s goes mostly to compiling shaders and generating geometry and textures, which a GPU does far faster. The download itself is small: the build is 1.7 MB, about 0.5 MB gzipped, against the PRD's 25 MB cap.

To close the gap, run `PERF_GPU=1 npm run perf` on a laptop, or open the menu on the live site on a laptop and a phone and read the Performance line, then add the results to the table above.
