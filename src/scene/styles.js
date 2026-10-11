// Scoped CSS for scene overlays (labels, chips, tooltip). Injected once.
const CSS = `
.kt-root { position: relative; overflow: hidden; isolation: isolate; }
.kt-root canvas { display: block; }
.kt-labels { position: absolute; inset: 0; pointer-events: none; }
.kt-station {
  pointer-events: auto; cursor: pointer;
  font: 600 11px/1 Inter, system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase;
  color: #f4f1e8; background: rgba(14,15,18,.72); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 5px 10px 5px 8px;
  white-space: nowrap; display: flex; align-items: center; gap: 6px;
  transition: background .2s;
}
.kt-station:hover { background: rgba(30,32,38,.92); }
.kt-station small, .kt-cook small, .kt-chip small { font-size: .82em; font-weight: 500; opacity: .62; letter-spacing: .02em; }
.kt-station .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.kt-cook {
  font: 500 10px/1.25 Inter, system-ui, sans-serif; color: #fff; text-align: center;
  background: rgba(14,15,18,.6); border-radius: 6px; padding: 3px 7px; white-space: nowrap;
  transform: translateY(-4px); opacity: .85;
}
.kt-cook b { font-weight: 650; display: block; }
.kt-cook span { display: none; color: #ffd38a; }
.kt-cook.active span { display: block; }
.kt-chip, .kt-tooltip {
  font: 500 11px/1.35 Inter, system-ui, sans-serif; color: #f4f1e8;
  background: rgba(14,15,18,.86); backdrop-filter: blur(6px);
  border: 1px solid rgba(95,212,255,.35); border-radius: 8px; padding: 6px 9px;
  white-space: nowrap; box-shadow: 0 6px 18px rgba(0,0,0,.35);
}
.kt-tooltip { position: absolute; pointer-events: none; opacity: 0; transition: opacity .12s; z-index: 5; }
.kt-chip .st, .kt-tooltip .st { text-transform: uppercase; font-weight: 700; letter-spacing: .05em; font-size: 10px; }
.st-off { color: #8a8f96; } .st-preheating { color: #ffa21f; } .st-idle { color: #2fd16b; }
.st-busy { color: #5fb8ff; } .st-fault { color: #ff3b30; }
.kt-chip .bar, .kt-tooltip .bar { height: 3px; background: rgba(255,255,255,.15); border-radius: 2px; margin-top: 5px; }
.kt-chip .sub, .kt-tooltip .sub { color: #a9b3bb; font-size: 10px; margin-top: 2px; }
.kt-chip .bar i, .kt-tooltip .bar i { display: block; height: 100%; background: #5fb8ff; border-radius: 2px; }
`;

let done = false;
export function injectStyles() {
  if (done) return;
  done = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}
