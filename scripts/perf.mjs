// Measures the PRD's speed targets (section 10) on the production build: time to the first 3D frame and
// the frame rate at each quality level, on a laptop-sized and a phone-sized viewport.
//
//   npm run build && npm run perf            (needs Playwright: npm i --no-save playwright)
//   PERF_SECONDS=8 PERF_URL=https://pikulsomesh.github.io/michelin-kitchen-twin/ npm run perf
//
// Writes docs/performance.json and prints a Markdown table. Numbers come from the page itself
// (window.kitchenTwin.perf(), src/perf.js), so they match the readout in the site's menu.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Playwright is not installed. Run: npm i --no-save playwright');
  process.exit(1);
}

const SECONDS = +process.env.PERF_SECONDS || 6;
const TIERS = (process.env.PERF_TIERS || 'mobile,balanced,high').split(',');
const VIEWPORTS = [
  { id: 'laptop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { id: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

let server = null;
let base = process.env.PERF_URL;
if (!base) {
  server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'ignore' });
  base = 'http://localhost:4179/michelin-kitchen-twin/';
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    if (i > 60) throw new Error('vite preview did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Default: headless software rendering (SwiftShader), the same on every machine and in CI, so it is a floor,
// not a forecast. PERF_GPU=1 runs a visible browser on this machine's GPU for real-hardware numbers.
const gpu = !!process.env.PERF_GPU;
const launchArgs = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: !gpu, args: launchArgs, ...(process.env.PERF_CHROMIUM ? { executablePath: process.env.PERF_CHROMIUM } : {}) });
const rows = [];
let renderer = '';
try {
  for (const vp of VIEWPORTS) {
    for (const tier of TIERS) {
      const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
      const page = await ctx.newPage();
      // intro=0 skips the opening dolly; the service plays at 30x so cooks walk and plates move while we sample.
      await page.goto(`${base}?quality=${tier}&intro=0&speed=30`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.kitchenTwin?.perf?.().firstFrameMs != null, null, { timeout: 120000 });
      renderer ||= await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || 'unknown';
      });
      // A slow orbit while sampling: the frame rate that matters is the one while the view moves.
      await page.evaluate((secs) => {
        const { twin } = window.kitchenTwin;
        const t0 = performance.now();
        const up = new twin.THREE.Vector3(0, 1, 0);
        const spin = () => {
          if (performance.now() - t0 > (secs + 2) * 1000) return;
          const off = twin.camera.position.clone().sub(twin.controls.target).applyAxisAngle(up, 0.004);
          twin.camera.position.copy(twin.controls.target).add(off);
          requestAnimationFrame(spin);
        };
        spin();
      }, SECONDS);
      await page.waitForTimeout(2000); // warm-up: shaders compile, shadows settle
      // Average over the whole sampling window from the frame counter, so even a very slow renderer
      // (fewer than one frame per second) gets a number.
      const sample = () => page.evaluate(() => ({ ...window.kitchenTwin.perf(), at: performance.now() }));
      const first = await sample();
      await page.waitForTimeout(SECONDS * 1000);
      const last = await sample();
      const fps = ((last.frames - first.frames) / (last.at - first.at)) * 1000;
      rows.push({ viewport: vp.id, quality: tier, firstFrameMs: last.firstFrameMs, readyMs: last.readyMs, fps: Math.round(fps * 10) / 10, frameP95Ms: last.frameP95Ms });
      console.error(`${vp.id} ${tier}: first frame ${last.firstFrameMs} ms, ${fps.toFixed(1)} fps`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server?.kill();
}

const out = { measuredAt: new Date().toISOString(), url: base, renderer, gpu, seconds: SECONDS, rows };
writeFileSync(new URL('../docs/performance.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
const LABEL = { mobile: 'Low', balanced: 'Medium', high: 'High', ultra: 'Pro Max' };
console.log(`Renderer: ${renderer}\n\n| Viewport | Quality | First frame | fps | p95 frame |\n|---|---|---|---|---|`);
for (const r of rows) console.log(`| ${r.viewport} | ${LABEL[r.quality] || r.quality} | ${(r.firstFrameMs / 1000).toFixed(1)} s | ${r.fps} | ${r.frameP95Ms == null ? '–' : `${r.frameP95Ms} ms`} |`);
