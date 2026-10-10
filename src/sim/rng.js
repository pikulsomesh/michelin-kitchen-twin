// Deterministic PRNG (mulberry32) + helpers. Same seed => identical service.
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12), v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    normal,
    /** mean-preserving lognormal multiplier with coefficient of variation cv */
    jitter: (cv) => (cv ? Math.exp(normal() * cv - (cv * cv) / 2) : 1),
    exp: (mean) => -Math.log(Math.max(next(), 1e-12)) * mean,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick(items, weightOf = () => 1) {
      let total = 0;
      for (const it of items) total += weightOf(it);
      let r = next() * total;
      for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
      return items[items.length - 1];
    },
  };
}

/** Binary min-heap ordered by (time, seq) so ties resolve deterministically. */
export class Heap {
  constructor() { this.a = []; this.seq = 0; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(time, payload) {
    const n = { time, seq: this.seq++, payload };
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._lt(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break;
    }
    return n;
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && this._lt(a[l], a[m])) m = l;
        if (r < a.length && this._lt(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
  _lt(x, y) { return x.time < y.time || (x.time === y.time && x.seq < y.seq); }
}

export const fmtClock = (sec) => {
  const s = Math.floor(((sec % 86400) + 86400) % 86400);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
export const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
