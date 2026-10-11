// Plate genealogy card: the traceability record for the plate being followed. Ticket (work
// order), routing steps with cook (operator), machine and queue time, the bill of materials
// drawn with the prep batch (lot) each component came from, food cost and lead time. It
// refreshes live while the plate is cooked and run, and stays up once it is served.
import { plateGenealogy } from './sim/genealogy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hhmm = (t) => { const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const dur = (s) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`);
const qty = (n, unit) => (unit === 'g' ? (n >= 1000 ? `${(n / 1000).toFixed(1)} kg` : `${Math.round(n)} g`) : `${+n.toFixed(1)} ${unit === 'ea' ? '' : unit || ''}`.trim());
const usd = (v) => `$${v.toFixed(2)}`;

export function mountTraceCard(el, sim, { onFly } = {}) {
  let cur = null, timer = 0;

  function render() {
    if (!cur) return;
    const g = plateGenealogy(sim.engine, cur.ticket, cur.dish);
    if (!g) { hide(); return; }
    const served = g.servedAt != null;
    const milestones = [['Fired', g.fireAt], ['Plated', g.platedAt], ['Served', g.servedAt]]
      .map(([l, t]) => `<span class="${t != null ? 'ok' : ''}"><small>${l}</small>${t != null ? hhmm(t) : '–'}</span>`).join('<i>→</i>');
    const lead = served ? dur(g.leadTime) : `${dur(sim.t - g.fireAt)} so far`;
    const html = `
      <header>
        <div><small>Plate genealogy · ticket ${esc(g.ticket)} (work order)</small>
          <b>${esc(g.dish.name)}${g.qty > 1 ? ` <span class="muted">×${g.qty}</span>` : ''}</b>
          <span class="muted">${esc(g.course)} · table ${esc(g.table)}${g.remakes ? ` · ${g.remakes} remake${g.remakes > 1 ? 's' : ''} (rework)` : ''}</span></div>
        <button class="close" data-trace-close aria-label="Close the genealogy card">✕</button>
      </header>
      <div class="tr-miles">${milestones}<span class="lead"><small>Lead time</small>${lead}</span></div>
      <h4>Routing</h4>
      <ol class="tr-steps">${g.steps.map((s, i) => `
        <li class="${s.state}" ${s.appliance || s.station ? `data-fly="${esc(s.appliance?.id || s.station)}"` : ''} title="Show this in the kitchen">
          <span class="n">${i + 1}</span>
          <div><b>${esc(s.name)}</b>
            <small>${esc(s.stationName)}${s.appliance ? ` · ${esc(s.appliance.name)}` : ''} · ${esc(s.staff?.name ?? 'unattended')}</small></div>
          <span class="t">${s.start != null ? `${hhmm(s.start)}${s.end != null ? `–${hhmm(s.end)}` : '…'}` : 'queued'}${s.wait > 30 ? `<small>waited ${dur(s.wait)}</small>` : ''}</span>
        </li>`).join('')}</ol>
      <h4>Bill of materials <span class="muted">· food cost ${usd(g.cost)}${g.qty > 1 ? ` (${usd(g.cost / g.qty)} a plate)` : ''}</span></h4>
      <table class="tr-bom">${g.materials.map((m) => `
        <tr><td>${esc(m.name)}${m.lot ? `<small>${m.lot.note ? esc(m.lot.note) : `lot: batch ${m.lot.batch ?? '?'}${m.lot.of ? `/${m.lot.of}` : ''}${m.lot.by ? ` by ${esc(m.lot.by)}` : ''} at ${hhmm(m.lot.at)}`}</small>` : ''}</td>
          <td class="n">${qty(m.qty, m.unit)}</td><td class="n">${m.cost >= 0.005 ? usd(m.cost) : ''}</td></tr>`).join('')}</table>`;
    if (html === el.__html) return;
    el.innerHTML = el.__html = html;
    el.querySelector('[data-trace-close]').onclick = hide;
    el.querySelectorAll('[data-fly]').forEach((li) => { li.onclick = () => onFly?.(li.dataset.fly); });
  }

  function show(ticket, dish) {
    cur = { ticket, dish };
    el.hidden = false;
    render();
  }
  function hide() { cur = null; el.hidden = true; el.innerHTML = el.__html = ''; }

  sim.on('reset', hide);
  return {
    show, hide,
    get open() { return !!cur; },
    /** call per frame; re-renders a couple of times a second while open */
    tick(dt) { if (!cur) return; timer += dt; if (timer > 0.5) { timer = 0; render(); } },
  };
}
