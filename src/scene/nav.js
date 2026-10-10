// Walkable-floor grid and A* path finding so cooks walk around equipment
// instead of through it, the way an AGV moves on a factory floor.

const CELL = 0.15;
const CLEARANCE = 0.22;   // body radius kept clear of obstacles

export class NavGrid {
  // bounds: { x0, x1, z0, z1 } of the walkable site in metres
  constructor(bounds) {
    this.b = bounds;
    this.cols = Math.ceil((bounds.x1 - bounds.x0) / CELL);
    this.rows = Math.ceil((bounds.z1 - bounds.z0) / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.rects = [];
  }
  addRect(x0, x1, z0, z1, tag = '') {
    this.rects.push({ x0, x1, z0, z1, tag });
    const c0 = this.col(x0 - CLEARANCE), c1 = this.col(x1 + CLEARANCE);
    const r0 = this.row(z0 - CLEARANCE), r1 = this.row(z1 + CLEARANCE);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) this.blocked[r * this.cols + c] = 1;
    }
  }
  // Axis-aligned footprint of a w x d box rotated by a multiple of 90 degrees.
  addBox(x, z, w, d, rot = 0, tag = '') {
    const q = Math.round(rot / (Math.PI / 2)) % 2 !== 0;
    const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
    this.addRect(x - hw, x + hw, z - hd, z + hd, tag);
  }
  col(x) { return Math.floor((x - this.b.x0) / CELL); }
  row(z) { return Math.floor((z - this.b.z0) / CELL); }
  center(c, r) { return [this.b.x0 + (c + 0.5) * CELL, this.b.z0 + (r + 0.5) * CELL]; }
  free(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c]; }

  // Clear a disc so a cook's work spot is always reachable.
  carve(x, z, radius = 0.3) {
    const c0 = this.col(x - radius), c1 = this.col(x + radius);
    const r0 = this.row(z - radius), r1 = this.row(z + radius);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.blocked[r * this.cols + c] = 0;
    }
  }
  // Clear a straight corridor (e.g. through the walk-in doorway).
  carveLine(x0, z0, x1, z1, radius = 0.3) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.5));
    for (let i = 0; i <= n; i++) this.carve(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, radius);
  }

  nearestFree(c, r) {
    if (this.free(c, r)) return [c, r];
    for (let rad = 1; rad < 30; rad++) {
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) === rad && this.free(c + dc, r + dr)) return [c + dc, r + dr];
      }
    }
    return [c, r];
  }

  // Returns a smoothed list of [x, z] waypoints from a to b.
  findPath(ax, az, bx, bz) {
    const [sc, sr] = this.nearestFree(this.col(ax), this.row(az));
    const [ec, er] = this.nearestFree(this.col(bx), this.row(bz));
    const N = this.cols * this.rows;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const start = sr * this.cols + sc, goal = er * this.cols + ec;
    const h = (c, r) => Math.hypot(c - ec, r - er);
    g[start] = 0;
    heap.push(start, h(sc, sr));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols, cr = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (!this.free(nc, nr)) continue;
        if (dc && dr && (!this.free(cc + dc, cr) || !this.free(cc, cr + dr))) continue;
        const ni = nr * this.cols + nc;
        const ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + h(nc, nr)); }
      }
    }
    if (!found) return [[ax, az], [bx, bz]];
    const cells = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => this.center(i % this.cols, (i / this.cols) | 0));
    pts[0] = [ax, az];
    pts.push([bx, bz]);
    return this.smooth(pts);
  }

  // String-pull: drop waypoints that have clear line of sight.
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineClear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  lineClear(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5));
    for (let k = 1; k < n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      if (!this.free(this.col(x), this.row(z))) return false;
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]]; [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
