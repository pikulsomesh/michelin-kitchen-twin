// Brigade members: articulated figures in chef whites that walk the nav grid,
// face their work, and gesture while busy.
import * as THREE from 'three';
import { hash01, lerp, batchGroup } from './kit.js';

const SKIN = [0xf1c8a8, 0xe0ac86, 0xc68a62, 0x9c6a48, 0x6e4a33, 0xf6d4bc];
const HAIR = [0x1b1410, 0x3b2a1c, 0x6b4a2b, 0x2a2a2a, 0xb08850, 0x101010];

function capsule(r, len, mat, seg = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Limb hanging from a pivot: returns the pivot group, mesh offset downward.
function limb(r, len, mat) {
  const pivot = new THREE.Group();
  const m = capsule(r, len, mat);
  m.position.y = -len / 2 - r * 0.4;
  pivot.add(m);
  return pivot;
}

export class Cook {
  constructor(id, { name = id, role = 'cook', color } = {}, M) {
    this.id = id; this.name = name; this.role = role;
    const h = hash01(id);
    const skin = M.skin(SKIN[Math.floor(h * SKIN.length)]);
    const hair = new THREE.MeshStandardMaterial({ color: HAIR[Math.floor(hash01(id + 'h') * HAIR.length)], roughness: 0.7 });
    const isChef = role === 'chef' || role === 'chef de cuisine' || role === 'expediter';
    const isServer = role === 'server' || role === 'captain';
    const jacket = isServer ? new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.6, sheen: 0.4 }) : M.chefWhite;
    const pants = isServer ? new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 }) : M.trousers;
    const apronMat = isServer ? M.apronBlue : M.apron;

    const root = new THREE.Group();
    root.name = `cook:${id}`;
    const body = new THREE.Group();
    root.add(body);
    this.root = root; this.body = body;
    const scale = 0.94 + hash01(id + 's') * 0.12;
    body.scale.setScalar(scale);

    // legs
    this.legL = limb(0.065, 0.72, pants); this.legL.position.set(-0.09, 0.9, 0);
    this.legR = limb(0.065, 0.72, pants); this.legR.position.set(0.09, 0.9, 0);
    for (const leg of [this.legL, this.legR]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), M.shoes);
      shoe.geometry.translate(0, 0, 0.04);
      shoe.position.y = -0.86;
      shoe.castShadow = true;
      leg.add(shoe);
      body.add(leg);
    }
    // torso: tailored double-breasted jacket (hips, waist, chest, shoulders)
    const torso = new THREE.Mesh(new THREE.LatheGeometry([
      [0.0, 0.84], [0.15, 0.84], [0.158, 0.95], [0.15, 1.06], [0.163, 1.18], [0.178, 1.3], [0.183, 1.4], [0.168, 1.47], [0.11, 1.515], [0.05, 1.53], [0.0, 1.53],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 28), jacket);
    torso.scale.set(1.12, 1, 0.68);
    torso.castShadow = true;
    torso.receiveShadow = true;
    body.add(torso);
    this.torso = torso;
    // stand collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.045, 18, 1, true), jacket);
    collar.material = jacket;
    collar.position.y = 1.545;
    body.add(collar);
    // knotted buttons, two rows
    const btnMat = new THREE.MeshStandardMaterial({ color: isServer ? 0x222222 : 0xe8e6df, roughness: 0.35 });
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), btnMat);
      b.position.set(sx * 0.055, 1.42 - i * 0.075, 0.122 - i * 0.002);
      body.add(b);
    }
    // apron (bistro wrap) from waist down
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.24, 0.6, 22, 4, true, -Math.PI * 0.62, Math.PI * 1.24), apronMat.clone());
    apron.material.side = THREE.DoubleSide;
    apron.position.set(0, 0.66, 0);
    apron.scale.set(1.08, 1, 0.74);
    apron.castShadow = true;
    body.add(apron);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.008, 6, 32), apronMat);
    tie.rotation.x = Math.PI / 2;
    tie.scale.set(1.08, 0.74, 1);
    tie.position.y = 0.955;
    body.add(tie);
    // towel tucked in apron string
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.012), M.linen);
    towel.position.set(0.17, 0.83, 0.08);
    towel.rotation.y = 0.6;
    towel.castShadow = true;
    if (!isServer) body.add(towel);
    // neck and head
    const neck = capsule(0.045, 0.06, skin);
    neck.position.y = 1.56;
    body.add(neck);
    const head = new THREE.Group();
    head.position.y = 1.685;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.098, 28, 20), skin);
    skull.scale.set(0.9, 1.12, 1.0);
    skull.castShadow = true;
    head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), skin);
    jaw.scale.set(0.95, 0.75, 1.05);
    jaw.position.set(0, -0.05, 0.018);
    head.add(jaw);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
      ear.scale.set(0.45, 1, 0.8);
      ear.position.set(sx * 0.088, 0.0, 0.0);
      head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.036, 8), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.01, 0.103);
    head.add(nose);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.15 });
    const browMat = hair;
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), eyeMat);
      e.position.set(sx * 0.032, 0.018, 0.09);
      head.add(e);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.008), browMat);
      brow.position.set(sx * 0.032, 0.036, 0.092);
      brow.rotation.z = sx * -0.12;
      head.add(brow);
    }
    // hair: short crop on the back and sides
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    hairCap.scale.set(0.92, 1.12, 1.02);
    hairCap.position.set(0, 0.006, -0.006);
    hairCap.rotation.x = isServer ? -0.32 : -1.0; // under a cap only the nape shows
    head.add(hairCap);
    if (isChef) {
      // tall pleated toque: band, fluted crown, soft puffed top
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 28, 1, true), M.chefWhite);
      band.position.y = 0.085;
      head.add(band);
      const crown = new THREE.CylinderGeometry(0.122, 0.1, 0.2, 48, 4, true);
      const cp = crown.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), z = cp.getZ(i), a = Math.atan2(z, x);
        const k = 1 + 0.045 * Math.sin(a * 24) * (0.4 + (cp.getY(i) + 0.1) * 3);
        cp.setXYZ(i, x * k, cp.getY(i), z * k);
      }
      crown.computeVertexNormals();
      const c = new THREE.Mesh(crown, M.chefWhite);
      c.position.y = 0.21;
      c.castShadow = true;
      head.add(c);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.128, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.chefWhite);
      puff.scale.y = 0.42;
      puff.position.y = 0.305;
      head.add(puff);
    } else if (!isServer) {
      // fitted skull cap
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), M.chefWhite);
      cap.scale.set(0.93, 1.14, 1.03);
      cap.position.y = 0.012;
      cap.rotation.x = -0.18;
      head.add(cap);
    }
    body.add(head);
    this.head = head;
    // arms: shoulder pivot, upper arm, elbow pivot, forearm, cuff, hand
    const mkArm = (sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.205, 1.44, 0);
      const upper = capsule(0.05, 0.24, jacket);
      upper.position.y = -0.15;
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      sh.add(elbow);
      const fore = capsule(0.044, 0.2, jacket);
      fore.position.y = -0.13;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), skin);
      hand.position.y = -0.29;
      hand.scale.set(0.75, 1.15, 0.55);
      hand.castShadow = true;
      elbow.add(hand);
      body.add(sh);
      sh.elbow = elbow;
      return sh;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    // Carry anchor: in front of the chest at hand height.
    this.carry = new THREE.Object3D();
    this.carry.position.set(0, 1.08, 0.36);
    body.add(this.carry);

    // Invisible pick volume for hover/selection.
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = 0.95;
    pick.userData.pick = { type: 'cook', id };
    root.add(pick);
    this.pick = pick;
    // Merge each rigid part (body, head, limbs) by material: ~40 draws per cook become ~20.
    // The torso stays separate because it breathes.
    batchGroup(body, { keep: [torso] });
    for (const g of [head, this.legL, this.legR, this.armL, this.armR, this.armL.elbow, this.armR.elbow]) batchGroup(g);

    this.path = null;
    this.pathIndex = 0;
    this.speed = 1.3;
    this.phase = hash01(id + 'p') * 10;
    this.activity = null;
    this.busy = false;
    this.yaw = 0;
    this.targetYaw = 0;
    this.walkBlend = 0;
    this.carrying = new Set();
    this.onArrive = null;
    this.location = null;
  }

  setPosition(x, z) { this.root.position.set(x, 0, z); }
  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  walk(path, speed, faceAfter, onArrive) {
    if (this.onArrive) { const prev = this.onArrive; this.onArrive = null; prev(false); }
    this.path = path;
    this.pathIndex = 1;
    this.speed = speed;
    this.faceAfter = faceAfter;
    this.onArrive = onArrive;
  }

  update(dt, t) {
    let moving = false;
    if (this.path && this.pathIndex < this.path.length) {
      const [tx, tz] = this.path[this.pathIndex];
      const dx = tx - this.x, dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (dist <= step) {
        this.setPosition(tx, tz);
        this.pathIndex++;
      } else {
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        this.targetYaw = Math.atan2(dx, dz);
      }
      moving = true;
      this.phase += step * 4.2;
      if (this.pathIndex >= this.path.length) {
        this.path = null;
        if (this.faceAfter != null) this.targetYaw = this.faceAfter;
        const cb = this.onArrive; this.onArrive = null;
        if (cb) cb(true);
      }
    }
    // turn smoothly toward target heading
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;

    this.walkBlend = lerp(this.walkBlend, moving ? 1 : 0, Math.min(1, dt * 6));
    const sw = Math.sin(this.phase) * 0.55 * this.walkBlend;
    const carryingSomething = this.carrying.size > 0;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * this.walkBlend;
    const k = Math.min(1, dt * 8);
    if (carryingSomething) {
      this.armL.rotation.x = lerp(this.armL.rotation.x, -0.45, k);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -0.45, k);
      this.armL.elbow.rotation.x = lerp(this.armL.elbow.rotation.x, -1.15, k);
      this.armR.elbow.rotation.x = lerp(this.armR.elbow.rotation.x, -1.15, k);
    } else if (this.busy && !moving) {
      // working motion: alternating chop / stir gestures
      const w = t * 7 + this.phase;
      this.armR.rotation.x = -0.45 + Math.sin(w) * 0.12;
      this.armL.rotation.x = -0.35 + Math.sin(w * 0.5) * 0.06;
      this.armR.elbow.rotation.x = -1.0 + Math.sin(w) * 0.3;
      this.armL.elbow.rotation.x = lerp(this.armL.elbow.rotation.x, -0.95, k);
      this.armR.rotation.z = 0.15;
      this.head.rotation.x = 0.35;
    } else {
      this.armL.rotation.x = -sw * 0.7;
      this.armR.rotation.x = sw * 0.7;
      this.armL.elbow.rotation.x = lerp(this.armL.elbow.rotation.x, -0.12 - Math.max(0, sw) * 0.4, k);
      this.armR.elbow.rotation.x = lerp(this.armR.elbow.rotation.x, -0.12 - Math.max(0, -sw) * 0.4, k);
      this.armR.rotation.z = 0;
      this.head.rotation.x = lerp(this.head.rotation.x, 0, Math.min(1, dt * 4));
    }
    this.armL.rotation.z = -0.08;
    if (!this.busy) this.armR.rotation.z = 0.08;
    // idle breathing
    this.torso.scale.x = 1.12 * (1 + Math.sin(t * 1.6 + this.phase) * 0.008);
  }
}
