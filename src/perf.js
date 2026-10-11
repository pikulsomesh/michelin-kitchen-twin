// Measured, not assumed: time to the first rendered 3D frame and the live frame rate (PRD section 10:
// 5 s to first frame, 60 fps on a laptop, 30 fps on a phone). Times are from the start of navigation.
// window.kitchenTwin.perf() returns these numbers; scripts/perf.mjs reads them at each quality level.
export function createPerfMeter({ window: span = 2000 } = {}) {
  let firstFrame = null, ready = null, frames = 0;
  const stamps = []; // frame timestamps inside the last `span` ms
  const gaps = []; // the matching frame-to-frame gaps, for the p95 frame time
  return {
    /** call once per rendered frame */
    frame(now = performance.now()) {
      frames++;
      if (firstFrame === null) firstFrame = now;
      if (stamps.length) gaps.push(now - stamps[stamps.length - 1]);
      stamps.push(now);
      while (stamps.length > 1 && now - stamps[0] > span) { stamps.shift(); gaps.shift(); }
    },
    /** the scene is built and the loading screen is gone */
    markReady(now = performance.now()) { if (ready === null) ready = now; },
    stats() {
      const n = stamps.length;
      const dur = n > 1 ? stamps[n - 1] - stamps[0] : 0;
      const sorted = [...gaps].sort((a, b) => a - b);
      return {
        firstFrameMs: firstFrame === null ? null : Math.round(firstFrame),
        readyMs: ready === null ? null : Math.round(ready),
        fps: dur > 0 ? Math.round(((n - 1) / dur) * 1000 * 10) / 10 : null,
        frames, // total rendered so far, for averaging over longer windows
        frameP95Ms: sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] * 10) / 10 : null,
      };
    },
  };
}
