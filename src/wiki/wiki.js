// The engineering wiki. The prose is static HTML in wiki.html; this script
// fills the numbers and the bibliography from the same /data the twin runs on,
// so the page cannot drift from the model, and drives the table of contents.
import { data } from '../data.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------ counts from /data
const { items, products, resources, menu, sources, service, layout } = data;
const prods = products.products;
const finished = prods.filter((p) => p.type === 'finished').length;
const ops = prods.reduce((n, p) => n + (p.routing?.length || 0), 0);
const bomLines = prods.reduce((n, p) => n + (p.bom?.length || 0), 0);
const cited = (rec) => (rec.src || []).some((s) => s !== 'est');
const allRecords = [...items.items, ...prods, ...resources.equipment, ...resources.workCenters];
const citedShare = allRecords.filter(cited).length / allRecords.length;

const counts = {
  courses: menu.courses.length,
  finished,
  intermediates: prods.length - finished,
  products: prods.length,
  items: items.items.length,
  equipment: resources.equipment.length,
  workCenters: resources.workCenters.length,
  storage: resources.storageLocations.length,
  roles: resources.laborRoles.length,
  staff: resources.staff.length,
  sources: sources.sources.length,
  ops,
  bomLines,
  scenarios: service.seatingScenarios.length,
  whatIf: service.whatIf.length,
  zones: layout.zones.length,
  cited: `${Math.round(citedShare * 100)}%`,
};
for (const el of $$('[data-count]')) el.textContent = counts[el.dataset.count] ?? '–';

// ------------------------------------------------------------ bibliography
const usedBy = new Map();
for (const rec of allRecords) for (const s of rec.src || []) usedBy.set(s, (usedBy.get(s) || 0) + 1);
$('[data-sources]').innerHTML = `<table><thead><tr><th>Source</th><th>Publisher</th><th>Records citing it</th></tr></thead><tbody>${
  sources.sources.map((s) => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</td><td class="muted">${esc(s.publisher || s.author || '')}</td><td>${usedBy.get(s.id) || 0}</td></tr>`).join('')
}</tbody></table>`;

// ------------------------------------------------------------ table of contents
const links = $$('.wk-toc a[href^="#"]');
const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    links.forEach((a) => a.classList.remove('on'));
    byId.get(e.target.id)?.classList.add('on');
  }
}, { rootMargin: '-70px 0px -70% 0px' });
for (const id of byId.keys()) { const s = document.getElementById(id); if (s) spy.observe(s); }

$('[data-menu]').addEventListener('click', () => document.body.classList.toggle('toc-open'));
links.forEach((a) => a.addEventListener('click', () => document.body.classList.remove('toc-open')));
