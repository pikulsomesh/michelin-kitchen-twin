// Heads-up display over the 3D view: the opening card with "Run tonight's service", then a live strip
// with the service clock, a few KPIs, play/speed and a shareable link to the exact moment.
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ?covers=120&seating=rush&seed=7&t=90&speed=300&play=1  (t = minutes after doors open)
export function readParams() {
  const q = new URLSearchParams(location.search);
  const num = (k) => (q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : null);
  return { covers: num('covers'), seed: num('seed'), seating: q.get('seating'), t: num('t'), speed: num('speed'), play: q.get('play') === '1' };
}

export function shareUrl(sim) {
  const c = sim.config;
  const q = new URLSearchParams({ covers: c.covers, seating: c.seating, seed: c.seed, t: Math.round((sim.t - c.doorsOpen) / 60) });
  return `${location.origin}${location.pathname}?${q}`;
}

let pending = 0;
export function writeParams(sim) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const c = sim.config;
    const q = new URLSearchParams(location.search);
    q.set('covers', c.covers);
    q.set('seating', c.seating);
    q.set('seed', c.seed);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }, 300);
}

export function mountHud(el, sim, { onRun }) {
  const booked = () => sim.config.covers;
  el.innerHTML = `
    <section class="intro" data-intro>
      <p class="eyebrow">Yountville, California · Three Michelin stars</p>
      <h1>Tonight's dinner service at The French Laundry, run like a factory.</h1>
      <p class="lede">The covers booked are the build plan. Watch the brigade, the machines and every gram of ingredient work through an eleven-course tasting menu, rebuilt from published sources.</p>
      <div class="cta">
        <button class="run" data-run>▶ Run tonight's service</button>
        <a href="#ops" class="more">Open the operations dashboard ↓</a>
      </div>
    </section>
    <section class="strip" data-strip>
      <div class="clockbox"><span class="clock" data-clock>--:--</span><span class="pill" data-phase></span></div>
      <div class="chips" data-chips></div>
      <div class="ctl">
        <button class="btn" data-play aria-label="Play or pause">❚❚</button>
        <div class="seg" role="group" aria-label="Speed">${[60, 300, 900].map((s) => `<button data-speed="${s}">${s}×</button>`).join('')}</div>
        <button class="btn" data-share title="Copy a link to this moment">Share</button>
      </div>
      <div class="bneck" data-bneck></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const intro = $('[data-intro]');
  const started = () => { intro.classList.add('gone'); el.classList.add('running'); };
  if (sim.playing || new URLSearchParams(location.search).has('t')) started();
  $('[data-run]').onclick = () => {
    started();
    sim.seek(sim.config.doorsOpen - 600);
    sim.setSpeed(60);
    sim.play();
    onRun?.();
  };
  $('[data-play]').onclick = () => (sim.playing ? sim.pause() : (started(), sim.play()));
  el.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => sim.setSpeed(+b.dataset.speed)));
  $('[data-share]').onclick = async (e) => {
    const url = shareUrl(sim);
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; } catch { prompt('Link to this moment', url); }
    setTimeout(() => (e.target.textContent = 'Share'), 1600);
  };

  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (now - last < 250) return;
    last = now;
    const s = sim.state;
    const k = s.kpis;
    $('[data-clock]').textContent = s.clock.slice(0, 5);
    $('[data-phase]').textContent = s.done ? 'service over' : s.phase === 'service' ? 'service' : 'mise en place';
    $('[data-phase]').classList.toggle('live', s.phase === 'service' && !s.done);
    $('[data-play]').textContent = sim.playing ? '❚❚' : '▶';
    el.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === sim.speed));
    const busy = s.staff.filter((x) => x.state === 'working' || x.state === 'walking').length;
    const onShift = s.staff.filter((x) => x.state !== 'off').length;
    const cooking = s.appliances.filter((a) => a.inUse > 0).length;
    $('[data-chips]').innerHTML = [
      ['Guests seated', `${s.covers.seated}<small>/${booked()}</small>`],
      ['Plates sent', k.portionsServed],
      ['Ticket time', k.ticketP50 ? mmss(k.ticketP50) : '–'],
      ['Cooks busy', `${busy}<small>/${onShift}</small>`],
      ['Machines on', `${cooking}<small>/${s.appliances.length}</small>`],
    ].map(([l, v]) => `<div class="chip"><b>${v}</b><span>${l}</span></div>`).join('');
    $('[data-bneck]').textContent = k.bottleneck?.key ? k.bottleneck.text : '';
  };
  requestAnimationFrame(loop);
  return { started };
}
