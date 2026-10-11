// The site tour: a short guided story of the whole twin. Each chapter moves the camera, opens the
// operations dashboard in the layout it needs, flips an overlay or the factory vocabulary, and puts one
// caption card on screen. Chapters auto-advance; the viewer can pause, step or leave at any time.
import { TOUR_SHOTS, OVERVIEW } from './scene/tour.js';

const shot = (name) => TOUR_SHOTS.find((s) => s.name === name) ?? OVERVIEW;

// ctx: { twin, sim, ops(mode), dashPanel(term), terms(factory), overlay(v), labels(v) }
const CHAPTERS = [
  {
    kicker: 'The French Laundry · Yountville',
    title: 'A three-star kitchen, run like a plant',
    body: "Thomas Keller's kitchen, rebuilt from public sources as a digital twin: a brigade of 19, 32 machines, an 11-course tasting menu and 62 guests tonight. A discrete-event simulation cooks the whole night, and everything you see follows its clock.",
    hold: 11,
    enter(c) { c.ops('closed'); c.overlay('none'); c.labels('stations'); c.fly(OVERVIEW, 3); },
  },
  {
    kicker: 'Demand',
    title: 'Every table is a work order',
    body: 'The reservations are the build plan. Each course fires as a ticket, and the chef at the pass is the final inspection gate: no plate reaches the dining room until it has been checked here.',
    hold: 10,
    enter(c) { c.fly(shot('The pass')); },
  },
  {
    kicker: 'Workcells and operators',
    title: 'Stations are cells, cooks are operators',
    body: 'Fish, meat, garnish, garde manger and pastry are workcells. Each cook has a skills matrix and walks real paths between the range, the plancha and the pass, so travel time is part of every ticket.',
    hold: 11,
    enter(c) { c.labels('all'); c.fly(shot('Savory suite, fish side')); },
  },
  {
    kicker: 'Machines',
    title: 'The hearth has an OEE score',
    body: 'The wood-burning hearth, the Rotisol rotisserie and the combi ovens are constrained machines. Each is scored the way a plant scores a press: availability × performance × quality, with re-fires counted as scrap.',
    hold: 11,
    enter(c) { c.labels('stations'); c.overlay('utilization'); c.fly(shot('Wood-burning hearth')); },
  },
  {
    kicker: 'Lean',
    title: 'A spaghetti diagram, drawn live',
    body: 'Lean engineers map how far people walk. This floor heat map is that diagram, built from every step the brigade takes, with the hot spots where cooks cross paths.',
    hold: 10,
    enter(c) { c.overlay('traffic'); c.fly({ pos: [8.5, 24, 12], target: [8.5, 0, 4.2] }); },
  },
  {
    kicker: 'Operations',
    title: 'The twin and its numbers, side by side',
    body: 'The dashboard reads the same clock as the 3D scene: covers served, plates per hour, ticket times by course and the current bottleneck, with one sentence on why. Click any station or machine to fly the camera to it.',
    hold: 12,
    enter(c) { c.overlay('none'); c.ops('split'); c.dashPanel(null); c.fly(OVERVIEW, 2.5); },
  },
  {
    kicker: 'One switch',
    title: 'Kitchen terms or factory terms',
    body: "Recipes become bills of materials, tickets become work orders, an 86'd dish becomes a stockout. The station Gantt shows every cook and machine as a swimlane, idle gaps included.",
    hold: 12,
    enter(c) { c.ops('split'); c.terms(true); c.dashPanel('gantt'); },
  },
  {
    kicker: 'Inventory',
    title: 'Stock draining in real time',
    body: 'Every ingredient on hand, against its par level, with a projected time to run out. Click a line to see where it sits in the walk-in and which stations use it.',
    hold: 11,
    enter(c) { c.ops('split'); c.dashPanel('inventory'); },
  },
  {
    kicker: 'Traceability',
    title: 'Follow one plate to the table',
    body: 'The camera picks up the next plate as it leaves a station and rides with it through the pass and out to the guest, the way a plant traces a part through its routing.',
    hold: 15,
    enter(c) { c.terms(false); c.ops('closed'); c.twin.followNextPlate(); },
  },
  {
    kicker: 'What if',
    title: 'Break the night, then fix it',
    body: 'Precomputed nights from 40 to 120 guests show where the kitchen tips over. The optimizer then ranks plans, from another cook to a different seating curve, to bring the meal time back to target.',
    hold: 13,
    enter(c) { c.ops('full'); c.dashPanel('library'); },
  },
  {
    kicker: 'Your turn',
    title: 'Make it yours',
    body: 'Open the Studio to change the menu, the season, the dining room and the mood, then run the whole night on your version. Or read how the twin was researched and built.',
    hold: 0,
    ctas: [
      { label: 'Open the Studio', href: './studio.html', primary: true },
      { label: 'The research story', href: './wiki.html#research' },
      { label: 'Engineering wiki', href: './wiki.html' },
    ],
    enter(c) { c.ops('closed'); c.fly(OVERVIEW, 3); },
  },
];

export function createSiteTour(root, ctx) {
  const $ = (s) => root.querySelector(s);
  const ui = { kicker: $('[data-story-kicker]'), title: $('[data-story-title]'), body: $('[data-story-body]'), ctas: $('[data-story-ctas]'), dots: $('[data-story-dots]'), bar: $('[data-story-bar]'), pause: $('[data-story="pause"]') };
  let i = -1, playing = false, left = 0, hold = 0, active = false, lastTick = 0;
  const listeners = [];
  const c = {
    ...ctx,
    fly(s, seconds = 3.2) { ctx.twin.flyTo(s.pos, s.target, seconds); },
  };

  ui.dots.innerHTML = CHAPTERS.map((_, k) => `<button data-dot="${k}" aria-label="Chapter ${k + 1}"></button>`).join('');
  ui.dots.querySelectorAll('[data-dot]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.dot)));
  $('[data-story="prev"]').onclick = () => go(Math.max(0, i - 1));
  $('[data-story="next"]').onclick = () => (i >= CHAPTERS.length - 1 ? stop() : go(i + 1));
  $('[data-story="close"]').onclick = () => stop();
  ui.pause.onclick = () => { playing = !playing; paint(); };

  function paint() {
    ui.pause.textContent = playing ? '❚❚' : '▶';
    ui.pause.hidden = !hold;
    ui.dots.querySelectorAll('[data-dot]').forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('seen', k < i); });
  }

  function go(k) {
    i = k;
    const ch = CHAPTERS[i];
    ui.kicker.textContent = `${String(i + 1).padStart(2, '0')} / ${CHAPTERS.length} · ${ch.kicker}`;
    ui.title.textContent = ch.title;
    ui.body.textContent = ch.body;
    ui.ctas.innerHTML = (ch.ctas || []).map((a) => `<a class="${a.primary ? 'cta' : 'ghost'}" href="${a.href}">${a.label}</a>`).join('');
    ui.ctas.hidden = !ch.ctas;
    hold = ch.hold; left = hold; playing = hold > 0;
    root.classList.remove('turn'); void root.offsetWidth; root.classList.add('turn');
    ch.enter(c);
    paint();
    ui.bar.style.width = hold ? '0%' : '100%';
  }

  function start() {
    // Tell the story during the busy part of the night, so the line is full and plates are moving.
    const { sim } = ctx; const doors = sim.config.doorsOpen;
    if (sim.t < doors + 1.25 * 3600 || sim.t > doors + 4 * 3600) sim.seek(doors + 2 * 3600);
    if (!sim.playing) sim.play();
    active = true; root.hidden = false; document.body.classList.add('touring-site');
    listeners.forEach((f) => f(true));
    go(0);
  }

  function stop() {
    if (!active) return;
    active = false; playing = false; root.hidden = true; document.body.classList.remove('touring-site');
    ctx.terms(false); ctx.overlay('none'); ctx.labels('stations');
    listeners.forEach((f) => f(false));
  }

  return {
    start, stop,
    get active() { return active; },
    next() { if (active) $('[data-story="next"]').click(); },
    prev() { if (active) $('[data-story="prev"]').click(); },
    togglePause() { if (active && hold) ui.pause.click(); },
    onChange(f) { listeners.push(f); },
    // Called every frame from the site's loop. Chapters run on wall-clock time, not the scene's capped frame time.
    tick() {
      const now = performance.now(), dt = Math.min(0.5, (now - (lastTick || now)) / 1000);
      lastTick = now;
      if (!active || !playing || !hold) return;
      left -= dt;
      ui.bar.style.width = `${Math.min(100, 100 * (1 - left / hold))}%`;
      if (left <= 0) go(i + 1);
    },
  };
}
