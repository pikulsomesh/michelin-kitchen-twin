// The kitchen clock with the "Sense of Urgency" plaque that hangs above
// The French Laundry's pass. Its hands follow the simulation clock.
import * as THREE from 'three';
import { cyl, rbox } from './kit.js';

export function buildClock(M) {
  const g = new THREE.Group();
  const R = 0.2;
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 512;
  const ctx = faceCanvas.getContext('2d');
  ctx.fillStyle = '#f7f5ef';
  ctx.beginPath(); ctx.arc(256, 256, 250, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    ctx.save();
    ctx.translate(256, 256);
    ctx.rotate(a);
    ctx.fillRect(-(long ? 5 : 2), -238, long ? 10 : 4, long ? 36 : 16);
    ctx.restore();
  }
  ctx.font = 'bold 54px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(String(i), 256 + Math.sin(a) * 168, 256 - Math.cos(a) * 168);
  }
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }));
  face.position.z = 0.031;
  const bezel = cyl(R + 0.015, R + 0.015, 0.03, M.polished, { seg: 48 });
  bezel.rotation.x = Math.PI / 2;
  bezel.position.z = 0.015;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.08, clearcoat: 1 }));
  glass.position.z = 0.04;
  g.add(bezel, face, glass);

  const handMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const mkHand = (len, w, mat = handMat) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), mat);
    m.position.y = len / 2 - 0.02;
    p.add(m);
    p.position.z = 0.034;
    p.userData.dynamic = true;
    g.add(p);
    return p;
  };
  const hour = mkHand(R * 0.55, 0.014);
  const minute = mkHand(R * 0.82, 0.01);
  const second = mkHand(R * 0.88, 0.003, new THREE.MeshStandardMaterial({ color: 0xc0201a }));

  // plaque
  const pc = document.createElement('canvas');
  pc.width = 1024; pc.height = 160;
  const p = pc.getContext('2d');
  p.fillStyle = '#121212'; p.fillRect(0, 0, 1024, 160);
  p.fillStyle = '#f4f1e8';
  p.font = '600 88px Georgia, serif';
  p.textAlign = 'center'; p.textBaseline = 'middle';
  p.fillText('SENSE OF URGENCY', 512, 84);
  const plaqueTex = new THREE.CanvasTexture(pc);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.1), new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.4, metalness: 0.2 }));
  plaque.position.set(0, -R - 0.09, 0.02);
  const plaqueBack = rbox(0.66, 0.12, 0.015, M.polished, { r: 0.003 });
  plaqueBack.position.set(0, -R - 0.15, 0.005);
  g.add(plaque, plaqueBack);

  const set = (date) => {
    const h = date.getHours() % 12, m = date.getMinutes(), s = date.getSeconds() + date.getMilliseconds() / 1000;
    hour.rotation.z = -((h + m / 60) / 12) * Math.PI * 2;
    minute.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    second.rotation.z = -(s / 60) * Math.PI * 2;
  };
  set(new Date());
  return { group: g, set };
}

// The wall screen that shows a live feed of Per Se's kitchen in New York,
// as in the real kitchen. Here it is a still illustration of that feed.
export function buildPerSeScreen(M) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 360);
  sky.addColorStop(0, '#1d2a35'); sky.addColorStop(1, '#0b0f14');
  x.fillStyle = sky; x.fillRect(0, 0, 640, 360);
  // stylised kitchen line seen from above the pass
  x.fillStyle = '#4b5560'; x.fillRect(40, 200, 560, 70);
  x.fillStyle = '#9aa6b0'; x.fillRect(40, 195, 560, 8);
  for (let i = 0; i < 7; i++) {
    x.fillStyle = '#e9e6dc';
    x.beginPath(); x.arc(90 + i * 78, 175, 14, 0, Math.PI * 2); x.fill();
    x.fillRect(80 + i * 78, 186, 20, 30);
  }
  x.fillStyle = 'rgba(255,180,90,0.25)'; x.fillRect(40, 120, 560, 40);
  x.fillStyle = '#d9342b'; x.beginPath(); x.arc(30, 30, 8, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f4f1e8'; x.font = '600 22px Inter, sans-serif';
  x.fillText('LIVE · PER SE · NEW YORK', 48, 38);
  x.font = '500 18px Inter, sans-serif';
  x.fillText('Kitchen camera 1', 48, 330);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const bezel = rbox(1.0, 0.6, 0.04, M.plasticBlack, { r: 0.01 });
  bezel.position.y = -0.3;
  g.add(bezel);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.54), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, color: new THREE.Color(1.4, 1.4, 1.4) }));
  panel.position.z = 0.021;
  g.add(panel);
  return g;
}
