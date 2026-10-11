// The end-of-service card: when the night finishes, the shift report's headline numbers appear over the
// twin, in Kitchen or Factory terms, with the full CSV a click away.
import { serviceSummary } from './sim/summary.js';
import { shiftReportCSV } from './sim/scenarios.js';
import { vocab } from './dashboard/terms.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountSummaryCard(el, { sim, onReplay, onOps }) {
  let shown = false; // shown once per finished night; re-armed when the sim rewinds or re-plans
  let snap = null;

  const render = () => {
    if (!snap) return;
    const s = serviceSummary(snap, sim.config, sim.end);
    el.innerHTML = `
      <div class="sum-head">
        <small>${esc(vocab.pick(['End of service', 'End of shift']))} · ${esc(vocab.pick(['shift report', 'production report']))}</small>
        <h2>${esc(vocab.pick(s.headline))}</h2>
        <button class="sum-x" data-sum="close" aria-label="Close">✕</button>
      </div>
      <div class="sum-grid">${s.tiles.map((t) => `<div class="sum-tile ${t.tone || ''}"><small>${esc(vocab.pick(t.label))}</small><b>${esc(t.value)}</b>${t.note ? `<span>${esc(t.note)}</span>` : ''}</div>`).join('')}</div>
      ${s.bottleneck ? `<p class="sum-bn"><b>${esc(vocab.pick(['Bottleneck', 'Constraint']))}:</b> ${esc(s.bottleneck)}</p>` : ''}
      <div class="sum-actions">
        <button class="cta" data-sum="csv">${esc(vocab.pick(['Download shift report (CSV)', 'Download production report (CSV)']))}</button>
        <button class="ghost" data-sum="ops">Open operations</button>
        <button class="ghost" data-sum="replay">Replay the night</button>
      </div>`;
  };
  const hide = () => { el.hidden = true; };
  const show = () => { snap = sim.state; render(); el.hidden = false; shown = true; };

  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-sum]')?.dataset.sum;
    if (act === 'close') hide();
    if (act === 'ops') { hide(); onOps?.(); }
    if (act === 'replay') { hide(); onReplay?.(); }
    if (act === 'csv') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([shiftReportCSV(snap, sim.data)], { type: 'text/csv' }));
      a.download = vocab.factory ? 'production-report.csv' : 'shift-report.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  });
  vocab.on(() => { if (!el.hidden) render(); });
  sim.on('reset', () => { shown = false; hide(); });
  sim.on('seek', ({ t }) => { if (t < sim.end) { shown = false; hide(); } });

  return {
    /** call a few times a second: opens the card the moment a playing service ends */
    check(st = sim.state) {
      if (!st.done) { shown = false; return; }
      if (!shown && sim.t >= sim.end) show();
    },
    show, hide,
    get open() { return !el.hidden; },
  };
}
