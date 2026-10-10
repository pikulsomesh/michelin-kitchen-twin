// Side panel: covers slider driving the BOM explosion, plus details for the picked appliance.
import { demandForCovers, explode, loadSummary } from './model/mrp.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const qty = (n, uom) => (uom === 'g' ? (n >= 1000 ? `${fmt(n / 1000, 1)} kg` : `${fmt(n)} g`) : `${fmt(Math.ceil(n))}`);

let pickEl;

// "Supplement: Royal Kaluga caviar" stays whole; "Oysters and Pearls: pearl tapioca..." keeps the dish name.
const plateName = (name) => (name.startsWith('Supplement:') ? name.split(',')[0] : name.split(':')[0]);

export function renderPanel(index, el) {
  const { restaurant, menu, service } = index.data;
  const [min, max] = service.coversRange;
  el.innerHTML = `
    <h1>${esc(restaurant.name)} kitchen twin</h1>
    <p class="sub">${esc(menu.name)} · ${restaurant.kitchen.areaSqFt.value.toLocaleString()} sq ft kitchen · ${restaurant.diningSeats.value} seats</p>
    <label for="covers">Covers tonight <output id="covers-out"></output></label>
    <input id="covers" type="range" min="${min}" max="${max}" value="${service.defaultCovers.value}" />
    <div id="pick"></div>
    <h2>Plates to fire</h2><table id="plates"></table>
    <h2>Raw materials, gross</h2><table id="raw"></table>
    <h2>Service load by cook</h2><div id="labor"></div>
    <p class="note">Data: menu, recipes and equipment from published sources; layout and times partly estimated. See <a href="https://github.com/pikulsomesh/michelin-kitchen-twin/tree/main/docs">docs</a>.</p>`;
  pickEl = el.querySelector('#pick');
  const input = el.querySelector('#covers');
  const update = () => {
    const covers = Number(input.value);
    el.querySelector('#covers-out').textContent = covers;
    const plan = explode(index, demandForCovers(menu, covers));
    const load = loadSummary(index, plan);

    el.querySelector('#plates').innerHTML = Object.values(plan.make)
      .filter((m) => m.type === 'finished')
      .map((m) => `<tr><td>${esc(plateName(m.name))}</td><td class="n">${m.produced}</td></tr>`)
      .join('');

    el.querySelector('#raw').innerHTML = Object.values(plan.raw)
      .filter((r) => r.uom === 'ea' || r.gross >= 1)
      .sort((a, b) => (b.uom === 'ea') - (a.uom === 'ea') || b.gross - a.gross)
      .slice(0, 14)
      .map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${qty(r.gross, r.uom)}${r.uom === 'ea' ? ' ea' : ''}</td></tr>`)
      .join('');

    el.querySelector('#labor').innerHTML = Object.values(load.labor)
      .filter((l) => l.utilization.service != null)
      .sort((a, b) => b.utilization.service - a.utilization.service)
      .map((l) => {
        const u = l.utilization.service;
        const name = index.roles.get(l.role).name;
        return `<div>${esc(name)} <span class="note">${fmt(u * 100)}%</span>
          <div class="bar"><span class="${u > 0.85 ? 'hot' : ''}" style="width:${Math.min(100, u * 100)}%"></span></div></div>`;
      })
      .join('');
  };
  input.addEventListener('input', update);
  update();
}

export function showEquipment(index, id) {
  if (!pickEl) return;
  if (!id) { pickEl.innerHTML = ''; return; }
  const eq = index.equipment.get(id);
  const stations = [...index.workCenters.values()].filter((w) => w.equipment.includes(id)).map((w) => w.name);
  const srcs = eq.src.filter((s) => s !== 'est').map((s) => index.sources.get(s));
  pickEl.innerHTML = `<div class="pick">
    <strong>${esc(eq.name)}</strong>${eq.maker ? ` · ${esc(eq.maker)}` : ''}<br/>
    <span class="note">${esc(stations.join(', ') || 'Shared')} · ${eq.capacity?.slots ?? '-'} slots${eq.tempC != null ? ` · ${eq.tempC} °C` : ''}</span>
    ${eq.note ? `<p class="note">${esc(eq.note)}</p>` : ''}
    <p class="note">Source: ${srcs.map((s) => `<a href="${esc(s.url ?? '#')}" target="_blank" rel="noopener">${esc(s.publisher)}</a>`).join(', ') || 'estimate'}${eq.src.includes('est') ? ' (some values estimated)' : ''}</p>
  </div>`;
}
