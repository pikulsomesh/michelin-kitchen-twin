# Studio

`studio.html` (code in `src/studio/`) is where a viewer shapes the restaurant behind the twin and watches both the 3D scene and the dinner-service simulation follow. Everything runs in the browser; a setup is kept in the URL, so "62 seats, winter à la carte, candlelit" is a link.

## What can be changed

| Tab | Controls | Flows into |
|---|---|---|
| Dining room | Presets (House 62 seats, Intimate, Big room, Private event); counts and shapes of two-, four-, six- and eight-tops; covers booked; seating curve (staggered, two turns, rush); doors open and last seating; eating pace; guest patience for a table; no-shows; seed | 3D room layout, tables, chairs, place settings; the sim's tables, reservations, `eatScale`, `patienceMin`, `noShowRate` |
| Menu | Tasting or à la carte. Tasting: price, courses (rename, reorder, enable, minutes to eat), dishes per course with guest-choice shares, add any dish from the house or seasonal pool. À la carte: starter, main and dessert lists with prices and popularity (the order mix) | The sim's `courses` (BOM demand), `dishes`, `prep`, `ingredients`; check average, revenue, food cost |
| Season | Spring, summer, fall, winter | Out-of-season dishes swap for that season's dish in the same place on the menu; produce is repriced (in season −15%, out of season +80%) and delivered 15% short; sun position, sky, foliage, produce on the bench, flowers on the tables |
| Light and mood | Six moods (Full service, Golden hour, Candlelit dining, Morning prep, After hours, Editorial); time of day, kitchen colour temperature, brightness, warm accents, exposure, steam and haze, weather (clear, overcast, rain, valley fog, snow), candles | 3D light rig only |

Every non-lighting edit recompiles the KitchenData, re-runs the whole service headlessly (about 0.1 s), and shows the KPIs against the house setup for the same season: kitchen close, ticket time p90, course gap p90, table wait p90, guests who walked away and the revenue lost, line utilization, OEE, stockouts, revenue and food cost. The timeline plays or scrubs the service, seating guests at their tables in 3D; "Operations dashboard" opens the full dashboard on the same simulation.

## How it fits together

```
studio state (config.js) ──compileStudio()──▶ { data: KitchenData, cfg } ──▶ createSim / runHeadless (src/sim)
        │                                                                     └─▶ mountDashboard (src/dashboard)
        └──computeLook()──▶ look ──▶ createStage().applyLook() (3D)
```

- `catalog.js`: seasonal raw materials (with market seasons), prep recipes and 20 dishes (five per season) in the sim's KitchenData shape, plus `KITCHEN_MAP`, which maps the catalogue's generic stations, roles, machines and staples onto the sourced French Laundry model (`WC-*`, `EQ-*`, `cdp-*`, `RM-*`). Recipes, quantities and timings are estimates written in the style of a three-star California kitchen, not any restaurant's recipes.
- `config.js`: the studio state, dining presets and table layout, the dish pool (house dishes from `/data` plus the catalogue), seasonal swaps, and the share-link encoding.
- `compile.js`: pure function from studio state plus the adapted `/data` model to the simulation's data and config. Only dishes on the menu (and the prep and ingredients they need) are added.
- `look.js`: the lighting model. The sun is placed with the NOAA solar-position formulas for Yountville (38.40 N) on a mid-season day, so July is still light at the first seating and January is dark before doors open. Colour temperatures go through a black-body fit.
- `stage.js`: the studio's layer on the photoreal twin from `src/scene`. The twin renders the kitchen, brigade, garden, sky and sun, and is driven by `bindSim` (cooks, plates, machines, stock) and by its `setLook` and `setDining` hooks. The studio adds the dining room sized to the floor plan (floor, walls, pin spots), candlelight and seasonal flowers, guests seated from the sim's table state, and rain or snow.
- `ui.js`, `main.js`, `studio.css`: the editor panel and page.

### Look contract for the 3D scene

`computeLook(look, season)` returns a plain object any renderer can apply; `stage.js` maps it onto the twin's `setLook`:

```js
{ hour, season, weather, cloud, daylight,
  sun: { azimuthDeg, elevationDeg, color, intensity, kelvin }, moon: { color, intensity } | null,
  sky: { top, horizon, ground }, interior: { kelvin, color, intensity }, accent: { kelvin, color, intensity },
  candles, exposure, haze, precipitation, foliage, blossom, groundColor }
```

Azimuth is measured from north, clockwise; in the layout frame north is +z and east is +x. Colours are hex integers.

## Run it

```sh
npm run dev   # then open http://localhost:5173/studio.html
npm test      # tests/studio.test.mjs covers compile, seasons, determinism, the dining room, share links and the sun
```

Render quality uses the twin's tiers (Mobile, Balanced, High, Pro Max), picked from the menu in the top bar or with `?quality=mobile|balanced|high|ultra`; the default is detected from the device.
