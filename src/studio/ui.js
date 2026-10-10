// Studio editor panel: four tabs (Dining, Menu, Season, Mood) over one studio state object.
// Pure DOM. Calls onChange(nextState, { what }) on every edit; the page decides what to recompute.
import { SEASONS, SEASON_LABEL, SECTIONS, SEASON_FACTS, DISHES } from './catalog.js';
import { DINING_PRESETS, TABLE_TYPES, tablesFromMix, mixOf, seatsOf, roomExtent, dishPool, withSeason, seasonalTasting, seasonalCarte } from './config.js';
import { MOODS, WEATHER, resolveHour, computeLook } from './look.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const clone = (o) => structuredClone(o);

export function mountStudioPanel(el, { base, state: initial, onChange }) {
  let state = initial;
  let tab = 'dining';
  let summary = null;
  const pool = dishPool(base);

  el.classList.add('studio-panel');
  el.innerHTML = `
    <div class="sp-tabs" role="tablist">
      ${[['dining', 'Dining room'], ['menu', 'Menu'], ['season', 'Season'], ['mood', 'Light and mood']].map(([id, l]) => `<button role="tab" data-tab="${id}">${l}</button>`).join('')}
    </div>
    <div class="sp-body" data-body></div>`;
  const body = el.querySelector('[data-body]');

  const commit = (next, what, rerender = true) => { state = next; onChange(state, { what }); if (rerender) render(); };

  // ---------------------------------------------------------------------------------- dining
  function diningTab() {
    const d = state.dining; const mix = mixOf(d.tables); const seats = seatsOf(d.tables); const ext = roomExtent(d.tables);
    const shapeOf = (n) => d.tables.find((t) => t.seats === +n)?.shape ?? TABLE_TYPES[n].shape;
    return `
      <section><h3>Room presets</h3><div class="sp-cards">
        ${Object.entries(DINING_PRESETS).map(([id, p]) => `<button class="sp-card ${d.preset === id ? 'on' : ''}" data-preset="${id}"><b>${esc(p.label)}</b><small>${esc(p.blurb)}</small></button>`).join('')}
      </div></section>
      <section><h3>Tables</h3>
        <table class="sp-table">${Object.entries(TABLE_TYPES).map(([n, t]) => `
          <tr><td>${t.label}</td>
            <td><div class="sp-step"><button data-mix="${n}" data-d="-1" aria-label="Fewer">−</button><output>${mix[n] || 0}</output><button data-mix="${n}" data-d="1" aria-label="More">+</button></div></td>
            <td><select data-shape="${n}">${(n === '8' ? ['rect'] : ['round', 'square']).map((s) => `<option ${shapeOf(n) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}
        </table>
        <p class="sp-note">${seats} seats at ${d.tables.length} tables · room ${ext.area.toFixed(0)} m² · ${(ext.area / Math.max(1, seats)).toFixed(1)} m² per seat</p>
      </section>
      <section><h3>Tonight</h3>
        ${range('covers', 'Covers booked', d.covers, 0, 300, 1, `${d.covers} <small>${seats ? (d.covers / seats).toFixed(2) : '–'} turns</small>`)}
        <label class="sp-row">Seating curve <span class="sp-seg">${[['staggered', 'Staggered'], ['twoTurn', 'Two turns'], ['rush', 'Rush']].map(([v, l]) => `<button data-seating="${v}" class="${d.seating === v ? 'on' : ''}">${l}</button>`).join('')}</span></label>
        ${range('doorsOpen', 'Doors open', d.doorsOpen, 16, 20, 0.25, hhmm(d.doorsOpen))}
        ${range('lastSeating', 'Last seating', d.lastSeating, 18, 23, 0.25, hhmm(d.lastSeating))}
        ${range('pace', 'Eating pace', d.pace, 0.6, 1.6, 0.05, paceLabel(d.pace))}
        ${range('patienceMin', 'Guest patience for a table', d.patienceMin ?? 60, 10, 120, 5, `${d.patienceMin ?? 60} min`)}
        ${range('noShowRate', 'No-shows', d.noShowRate, 0, 0.2, 0.01, `${Math.round(d.noShowRate * 100)}%`)}
        ${range('seed', 'Random seed', d.seed ?? 1, 1, 50, 1, d.seed ?? 1)}
      </section>`;
  }
  const paceLabel = (p) => `${p < 0.85 ? 'Brisk' : p > 1.15 ? 'Leisurely' : 'Standard'} <small>${summary ? `${summary.mealMin} min meal` : ''}</small>`;
  const range = (key, label, v, min, max, step, out) =>
    `<label class="sp-row">${label}<output data-out="${key}">${out}</output><input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;

  // ------------------------------------------------------------------------------------ menu
  function dishSelect(attrs, exclude = new Set()) {
    const bySec = {};
    for (const d of pool.values()) if (!exclude.has(d.id)) (bySec[d.section] ??= []).push(d);
    return `<select ${attrs}><option value="">+ Add a dish…</option>${Object.entries(SECTIONS).filter(([s]) => bySec[s]).map(([s, l]) => `<optgroup label="${l}">${bySec[s].map((d) => `<option value="${d.id}">${esc(d.name)}${d.seasons.includes(state.season) ? '' : ' (out of season)'}</option>`).join('')}</optgroup>`).join('')}</select>`;
  }
  const dishName = (id) => (id == null ? '<span class="sp-none">No supplement</span>' : esc(pool.get(id)?.name ?? id));
  const seasonTag = (id) => { const d = pool.get(id); if (!d) return ''; return d.origin === 'seasonal' ? `<i class="sp-tag ${d.seasons.includes(state.season) ? '' : 'warn'}">${d.seasons.map((s) => SEASON_LABEL[s]).join('/')}</i>` : d.signature ? '<i class="sp-tag sig">signature</i>' : ''; };

  function menuTab() {
    const m = state.menu;
    const fmt = `<div class="sp-seg wide">${[['tasting', 'Tasting menu'], ['carte', 'À la carte']].map(([v, l]) => `<button data-format="${v}" class="${m.format === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const totals = summary ? `<p class="sp-note" data-totals>${summary.courses} courses · ${summary.plates.toLocaleString()} plates tonight · average check ${usd(summary.checkUSD)} · food cost ${(summary.foodCostPct * 100).toFixed(0)}%</p>` : '';
    if (m.format === 'carte') {
      return `${fmt}${totals}
        ${m.carte.map((c, ci) => {
          const w = c.items.reduce((s, i) => s + i.weight, 0) || 1;
          return `<section class="sp-course ${c.enabled ? '' : 'off'}"><h3><label><input type="checkbox" data-carte-on="${ci}" ${c.enabled ? 'checked' : ''}> ${esc(c.name)}</label>
            <span class="sp-eat"><input type="number" min="3" max="60" value="${c.eatMin}" data-carte-eat="${ci}"> min to eat</span></h3>
            <table class="sp-table items">${c.items.map((it, ii) => `<tr>
              <td>${dishName(it.dish)} ${seasonTag(it.dish)}</td>
              <td class="n">$<input type="number" min="0" max="500" value="${it.priceUSD}" data-carte-price="${ci}:${ii}"></td>
              <td class="pop"><input type="range" min="0" max="5" step="0.5" value="${it.weight}" data-carte-w="${ci}:${ii}" aria-label="Popularity"><small>${Math.round((it.weight / w) * 100)}%</small></td>
              <td><button class="x" data-carte-del="${ci}:${ii}" aria-label="Remove">×</button></td></tr>`).join('')}</table>
            ${dishSelect(`data-carte-add="${ci}"`, new Set(c.items.map((i) => i.dish)))}</section>`;
        }).join('')}
        <p class="sp-note">Popularity is the share of guests ordering each dish: the order mix, like a product mix on a line.</p>`;
    }
    return `${fmt}
      <label class="sp-row">Price per guest <span>$<input type="number" min="0" max="2000" step="5" value="${m.tastingPriceUSD}" data-tasting-price></span></label>
      ${totals}
      ${m.tasting.map((c, ci) => `<section class="sp-course ${c.enabled ? '' : 'off'}">
        <h3><label><input type="checkbox" data-course-on="${ci}" ${c.enabled ? 'checked' : ''}><input class="sp-name" value="${esc(c.name)}" data-course-name="${ci}"></label>
          <span class="sp-eat"><input type="number" min="2" max="60" value="${c.eatMin}" data-course-eat="${ci}"> min</span>
          <span class="sp-move"><button data-course-mv="${ci}:-1" aria-label="Move up">↑</button><button data-course-mv="${ci}:1" aria-label="Move down">↓</button><button class="x" data-course-del="${ci}" aria-label="Remove course">×</button></span></h3>
        ${c.parts.map((p, pi) => {
          const w = p.reduce((s, o) => s + o.weight, 0) || 1;
          return `<div class="sp-part">${p.map((o, oi) => `<div class="sp-opt"><span>${dishName(o.dish)} ${seasonTag(o.dish)}</span>
            ${p.length > 1 ? `<input type="range" min="0.5" max="5" step="0.5" value="${o.weight}" data-opt-w="${ci}:${pi}:${oi}" aria-label="Guest choice"><small>${Math.round((o.weight / w) * 100)}%</small>` : '<small>every guest</small>'}
            <button class="x" data-opt-del="${ci}:${pi}:${oi}" aria-label="Remove">×</button></div>`).join('')}
            ${dishSelect(`data-opt-add="${ci}:${pi}"`, new Set(p.map((o) => o.dish)))}</div>`;
        }).join('')}
      </section>`).join('')}
      <div class="sp-actions"><button data-course-add>+ Add a course</button><button data-menu-reset>Reset to the ${SEASON_LABEL[state.season].toLowerCase()} menu</button></div>
      <p class="sp-note">Where a course offers a choice, the slider sets how many guests pick each dish.</p>`;
  }

  // ---------------------------------------------------------------------------------- season
  function seasonTab() {
    return `<div class="sp-seasons">${SEASONS.map((s) => {
      const f = SEASON_FACTS[s]; const dishes = DISHES.filter((d) => d.seasons.includes(s));
      return `<button class="sp-season ${state.season === s ? 'on' : ''}" data-season="${s}" style="--tint:#${f.foliage.toString(16).padStart(6, '0')}">
        <b>${SEASON_LABEL[s]}</b><small>Sunset ${f.sunset} · ${esc(f.note)}</small>
        <ul>${dishes.map((d) => `<li>${esc(d.name)}</li>`).join('')}</ul></button>`;
    }).join('')}</div>
    ${summary?.outOfSeason.length ? `<p class="sp-warn">Out of season on this menu, bought at a premium and delivered short more often: ${summary.outOfSeason.map(esc).join(', ')}.</p>` : '<p class="sp-note">Everything on the menu is in season.</p>'}
    <p class="sp-note">Changing season swaps each out-of-season dish for the new season's dish in the same place on the menu, reprices produce (in season −15%, out of season +80%) and moves the sun.</p>`;
  }

  // ------------------------------------------------------------------------------------ mood
  function moodTab() {
    const l = state.look; const look = computeLook(l, state.season); const hour = resolveHour(l.hour, state.season);
    return `<section><h3>Moods</h3><div class="sp-cards">
      ${Object.entries(MOODS).map(([id, m]) => `<button class="sp-card ${l.mood === id ? 'on' : ''}" data-mood="${id}"><b>${m.label}</b><small>${m.blurb}</small></button>`).join('')}</div></section>
      <section><h3>Light</h3>
        ${range('hour', 'Time of day', hour, 6, 24, 0.25, `${hhmm(hour)} <small>sun ${look.sun.elevationDeg.toFixed(0)}° up, bearing ${look.sun.azimuthDeg.toFixed(0)}°</small>`)}
        ${range('kelvin', 'Kitchen colour temperature', l.kelvin, 2400, 6500, 100, `${l.kelvin} K`)}
        ${range('brightness', 'Brightness', l.brightness, 0.1, 1.6, 0.05, `${Math.round(l.brightness * 100)}%`)}
        ${range('warmth', 'Warm accents (heat lamps, pin spots)', l.warmth, 0, 1, 0.05, `${look.accent.kelvin} K`)}
        ${range('exposure', 'Camera exposure', l.exposure, 0.5, 1.8, 0.05, l.exposure.toFixed(2))}
        ${range('haze', 'Steam and haze', l.haze, 0, 0.6, 0.02, `${Math.round(l.haze * 100)}%`)}
        <label class="sp-row">Weather <select data-weather>${Object.entries(WEATHER).map(([v, t]) => `<option value="${v}" ${l.weather === v ? 'selected' : ''}>${t}${v === 'auto' ? ` (${WEATHER[SEASON_FACTS[state.season].weather]})` : ''}</option>`).join('')}</select></label>
        <label class="sp-row">Candles on the tables <input type="checkbox" data-candles ${l.candles ? 'checked' : ''}></label>
      </section>`;
  }

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    body.innerHTML = { dining: diningTab, menu: menuTab, season: seasonTab, mood: moodTab }[tab]();
  }

  // ----------------------------------------------------------------------------------- events
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const ds = b.dataset; const s = clone(state);
    if (ds.tab) { tab = ds.tab; render(); return; }
    if (ds.preset) { const tables = tablesFromMix(DINING_PRESETS[ds.preset].mix); s.dining = { ...s.dining, preset: ds.preset, tables, covers: seatsOf(tables) }; return commit(s, 'dining'); }
    if (ds.mix) {
      const mix = mixOf(s.dining.tables); mix[ds.mix] = Math.max(0, Math.min(40, (mix[ds.mix] || 0) + +ds.d));
      const shapes = Object.fromEntries(s.dining.tables.map((t) => [t.seats, t.shape]));
      const before = seatsOf(s.dining.tables);
      s.dining.tables = tablesFromMix(mix, shapes); s.dining.preset = null;
      if (s.dining.covers === before) s.dining.covers = seatsOf(s.dining.tables); // keep "one turn" in step with the room
      return commit(s, 'dining');
    }
    if (ds.seating) { s.dining.seating = ds.seating; return commit(s, 'dining'); }
    if (ds.format) { s.menu.format = ds.format; return commit(s, 'menu'); }
    if (ds.season) return commit(withSeason(state, base, ds.season), 'season');
    if (ds.mood) { s.look = { ...s.look, ...MOODS[ds.mood].look, mood: ds.mood }; return commit(s, 'look'); }
    if (ds.menuReset) { s.menu.tasting = seasonalTasting(base, s.season); s.menu.carte = seasonalCarte(base, s.season); return commit(s, 'menu'); }
    if ('courseAdd' in ds) { s.menu.tasting.push({ id: `x${Date.now() % 1e6}`, name: 'New course', enabled: true, eatMin: 8, parts: [[{ dish: 'garden_salad', weight: 1 }]] }); return commit(s, 'menu'); }
    if (ds.courseDel) { s.menu.tasting.splice(+ds.courseDel, 1); return commit(s, 'menu'); }
    if (ds.courseMv) {
      const [i, d] = ds.courseMv.split(':').map(Number); const j = i + d; const t = s.menu.tasting;
      if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; return commit(s, 'menu');
    }
    if (ds.optDel) {
      const [c, p, o] = ds.optDel.split(':').map(Number); const part = s.menu.tasting[c].parts[p];
      part.splice(o, 1); if (!part.length) s.menu.tasting[c].parts.splice(p, 1);
      if (!s.menu.tasting[c].parts.length) s.menu.tasting.splice(c, 1);
      return commit(s, 'menu');
    }
    if (ds.carteDel) { const [c, i] = ds.carteDel.split(':').map(Number); s.menu.carte[c].items.splice(i, 1); return commit(s, 'menu'); }
  });

  el.addEventListener('input', (e) => {
    const t = e.target; const ds = t.dataset; const s = clone(state);
    if (ds.range) {
      const v = +t.value;
      if (['covers', 'doorsOpen', 'lastSeating', 'pace', 'noShowRate', 'patienceMin', 'seed'].includes(ds.range)) s.dining[ds.range] = v;
      else { s.look[ds.range] = v; s.look.mood = null; }
      commit(s, ['covers', 'doorsOpen', 'lastSeating', 'pace', 'noShowRate', 'patienceMin', 'seed'].includes(ds.range) ? 'dining' : 'look', false);
      refreshOutputs();
      return;
    }
    if (ds.optW) { const [c, p, o] = ds.optW.split(':').map(Number); s.menu.tasting[c].parts[p][o].weight = +t.value; commit(s, 'menu', false); refreshShares(t); return; }
    if (ds.carteW) { const [c, i] = ds.carteW.split(':').map(Number); s.menu.carte[c].items[i].weight = +t.value; commit(s, 'menu', false); refreshShares(t); }
  });

  el.addEventListener('change', (e) => {
    const t = e.target; const ds = t.dataset; const s = clone(state);
    if (ds.range || ds.optW || ds.carteW) { render(); return; }
    if (ds.shape) { s.dining.tables = s.dining.tables.map((x) => (x.seats === +ds.shape ? { ...x, shape: t.value } : x)); return commit(s, 'dining'); }
    if ('tastingPrice' in ds) { s.menu.tastingPriceUSD = Math.max(0, +t.value); return commit(s, 'menu'); }
    if (ds.courseOn) { s.menu.tasting[+ds.courseOn].enabled = t.checked; return commit(s, 'menu'); }
    if (ds.courseName) { s.menu.tasting[+ds.courseName].name = t.value.slice(0, 40) || 'Course'; return commit(s, 'menu'); }
    if (ds.courseEat) { s.menu.tasting[+ds.courseEat].eatMin = Math.max(1, +t.value || 1); return commit(s, 'menu'); }
    if (ds.optAdd && t.value) { const [c, p] = ds.optAdd.split(':').map(Number); s.menu.tasting[c].parts[p].push({ dish: t.value, weight: 1 }); return commit(s, 'menu'); }
    if (ds.carteOn) { s.menu.carte[+ds.carteOn].enabled = t.checked; return commit(s, 'menu'); }
    if (ds.carteEat) { s.menu.carte[+ds.carteEat].eatMin = Math.max(1, +t.value || 1); return commit(s, 'menu'); }
    if (ds.cartePrice) { const [c, i] = ds.cartePrice.split(':').map(Number); s.menu.carte[c].items[i].priceUSD = Math.max(0, +t.value); return commit(s, 'menu'); }
    if (ds.carteAdd && t.value) { s.menu.carte[+ds.carteAdd].items.push({ dish: t.value, weight: 1, priceUSD: pool.get(t.value)?.priceUSD ?? 30 }); return commit(s, 'menu'); }
    if ('weather' in ds) { s.look.weather = t.value; return commit(s, 'look'); }
    if ('candles' in ds) { s.look.candles = t.checked; return commit(s, 'look'); }
  });

  // live readouts while a slider is dragged, without re-rendering (which would drop the drag)
  function refreshOutputs() {
    const d = state.dining; const l = state.look; const seats = seatsOf(d.tables);
    const look = computeLook(l, state.season); const hour = resolveHour(l.hour, state.season);
    const out = {
      covers: `${d.covers} <small>${seats ? (d.covers / seats).toFixed(2) : '–'} turns</small>`, doorsOpen: hhmm(d.doorsOpen), lastSeating: hhmm(d.lastSeating),
      pace: paceLabel(d.pace), patienceMin: `${d.patienceMin ?? 60} min`, noShowRate: `${Math.round(d.noShowRate * 100)}%`, seed: d.seed,
      hour: `${hhmm(hour)} <small>sun ${look.sun.elevationDeg.toFixed(0)}° up, bearing ${look.sun.azimuthDeg.toFixed(0)}°</small>`,
      kelvin: `${l.kelvin} K`, brightness: `${Math.round(l.brightness * 100)}%`, warmth: `${look.accent.kelvin} K`, exposure: (+l.exposure).toFixed(2), haze: `${Math.round(l.haze * 100)}%`,
    };
    el.querySelectorAll('[data-out]').forEach((o) => { if (out[o.dataset.out] != null) o.innerHTML = out[o.dataset.out]; });
    el.querySelectorAll('.sp-card.on[data-mood]').forEach((c) => c.classList.toggle('on', !!state.look.mood));
  }
  function refreshShares(input) {
    const box = input.closest('.sp-part, table'); if (!box) return;
    const ranges = [...box.querySelectorAll('input[type=range]')]; const w = ranges.reduce((s, r) => s + +r.value, 0) || 1;
    ranges.forEach((r) => { const sm = r.nextElementSibling; if (sm) sm.textContent = `${Math.round((+r.value / w) * 100)}%`; });
  }

  render();
  return {
    setState(s) { state = s; render(); },
    setSummary(sum) {
      summary = sum;
      const a = document.activeElement;
      if (el.contains(a) && (a.type === 'range' || a.type === 'number' || a.tagName === 'SELECT' || a.classList.contains('sp-name'))) {
        // mid-edit: refresh the readouts only, so the control keeps focus
        const t = el.querySelector('[data-totals]');
        if (t) t.textContent = `${sum.courses} courses · ${sum.plates.toLocaleString()} plates tonight · average check ${usd(sum.checkUSD)} · food cost ${(sum.foodCostPct * 100).toFixed(0)}%`;
        refreshOutputs();
      } else if (tab === 'menu' || tab === 'season') render(); else refreshOutputs();
    },
    get state() { return state; },
  };
}
