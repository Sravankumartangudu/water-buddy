// Shared cartoon kit for the cast: easing helpers, outlined meshes, rubber-hose limbs, the painted face,
// props (sun, steam, sparkles, glass, shadow) and Stage, the WebGL scene + loop every character runs on.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const TAU = Math.PI * 2;
export const VIEW_H = 4.2; // world units visible vertically (characters are ~1.9 tall)
export const VIEW_CY = 2.0;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, k) => a + (b - a) * k;
export const backOut = (x) => {
  const c = 1.9;
  x = clamp(x) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
export const pulse = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
export const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- materials ----------

export const OUTLINE = new THREE.Color('#0b3a66');

export function outlineMaterial(thickness) {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thickness.toFixed(4)};`);
  };
  return m;
}

export function outlined(geo, mat, thickness = 0.016) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, outlineMaterial(thickness));
  m.frustumCulled = o.frustumCulled = false;
  g.add(o, m);
  g.userData.mesh = m;
  return g;
}

// ---------- geometry helpers ----------

/** A rubber-hose limb: a tube along a quadratic bezier, rebuilt in place each frame. */
export class Hose {
  constructor(radius, material, segs = 22, radial = 12) {
    this.r = radius;
    this.segs = segs;
    this.radial = radial;
    const n = (segs + 1) * (radial + 1);
    const geo = (this.geo = new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    geo.setIndex(idx);
    this.obj = outlined(geo, material, 0.014);
    this.p = new THREE.Vector3();
    this.t = new THREE.Vector3();
    this.n = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }

  /** p0 → p2 with control p1; bulge puffs up the middle (a flexed bicep). */
  update(p0, p1, p2, bulge = 0) {
    const pos = this.geo.attributes.position.array;
    const nrm = this.geo.attributes.normal.array;
    const { p, t, n, b } = this;
    const ref = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= this.segs; i++) {
      const s = i / this.segs, k = 1 - s;
      p.set(0, 0, 0).addScaledVector(p0, k * k).addScaledVector(p1, 2 * k * s).addScaledVector(p2, s * s);
      t.set(0, 0, 0).addScaledVector(p0, -2 * k).addScaledVector(p1, 2 * (k - s)).addScaledVector(p2, 2 * s).normalize();
      if (Math.abs(t.dot(ref)) > 0.9) ref.set(1, 0, 0);
      n.crossVectors(t, ref).normalize();
      b.crossVectors(t, n);
      const r = this.r * (1 + bulge * 1.5 * pulse(s, 0.42, 0.14) - 0.12 * s);
      for (let j = 0; j <= this.radial; j++) {
        const a = (j / this.radial) * TAU;
        const c = Math.cos(a), sn = Math.sin(a);
        const o = (i * (this.radial + 1) + j) * 3;
        const nx = n.x * c + b.x * sn, ny = n.y * c + b.y * sn, nz = n.z * c + b.z * sn;
        pos[o] = p.x + nx * r;
        pos[o + 1] = p.y + ny * r;
        pos[o + 2] = p.z + nz * r;
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

// Control point for a limb of length `len` bending towards `bend`.
export function bendPoint(a, c, len, bend) {
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const seg = c.clone().sub(a);
  const d = seg.length();
  seg.normalize();
  const dir = bend.clone().addScaledVector(seg, -bend.dot(seg)).normalize();
  return mid.addScaledVector(dir, Math.sqrt(Math.max(0, (len / 2) ** 2 - (d / 2) ** 2)) * 1.3 + 0.02);
}

export function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A white cartoon glove (k = 0 left, 1 right).
export function makeGlove(white, k) {
  const g = new THREE.Group();
  const palm = outlined(new THREE.SphereGeometry(0.085, 20, 14), white, 0.014);
  palm.scale.set(1, 1.05, 0.8);
  palm.position.y = 0.05;
  const thumb = outlined(new THREE.SphereGeometry(0.035, 12, 10), white, 0.012);
  thumb.position.set(k ? -0.07 : 0.07, 0.04, 0.03);
  const cuff = outlined(new THREE.TorusGeometry(0.055, 0.024, 10, 20), white, 0.012);
  cuff.rotation.x = Math.PI / 2;
  g.add(palm, thumb, cuff);
  return g;
}

// Glove on the end of an arm: sits at `hand`, points away from `elbow`, twisted by `tw`.
export function placeGlove(g, hand, elbow, tw, k) {
  g.position.copy(hand);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().sub(elbow).normalize());
  g.rotateY(tw + (k ? -0.4 : 0.4));
}

// A sneaker: coloured upper, white sole and toe cap.
export function makeShoe(color, white) {
  const g = new THREE.Group();
  const upper = outlined(new THREE.SphereGeometry(0.1, 24, 16), color, 0.014);
  upper.scale.set(1.1, 0.85, 1.55);
  upper.position.set(0, 0.07, 0.05);
  const sole = outlined(new THREE.SphereGeometry(0.1, 24, 12), white, 0.012);
  sole.scale.set(1.2, 0.32, 1.7);
  sole.position.set(0, 0.025, 0.05);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), white);
  cap.scale.set(1.4, 0.8, 1);
  cap.position.set(0, 0.06, 0.17);
  g.add(upper, sole, cap);
  return g;
}

// ---------- the face (painted every frame onto a canvas) ----------

export const INK = '#0b2545';

export const FACE0 = {
  eyeOpen: 1, joy: 0, pupX: 0, pupY: 0, pupS: 1, shine: 0, browY: 0, browTilt: 0,
  mouthW: 0.22, mouthOpen: 0, smile: 0.5, mouthO: 0, tongue: 0, teeth: 0, wobble: 0,
  cheek: 0.3, tears: 0, sweat: 0, wink: 0,
};

// The face for each mood; '' is the thirsty look every character arrives with.
export function moodFace(f, mood) {
  if (mood === 'happy') Object.assign(f, { smile: 1, cheek: 0.75, mouthW: 0.26, shine: 1 });
  else if (mood === 'sad') Object.assign(f, { smile: -0.85, browTilt: 1, eyeOpen: 0.7, cheek: 0.15, wobble: 0.6, mouthW: 0.17 });
  else Object.assign(f, { sweat: 1, smile: 0.35, mouthOpen: 0.35, tongue: 0.7, browTilt: 0.35, eyeOpen: 0.85 });
}

export function drawFace(ctx, S, f, T, photo) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  // face units: x right, y up, ±1 across the canvas
  ctx.setTransform(S / 2, 0, 0, -S / 2, S / 2, S / 2);
  ctx.lineCap = ctx.lineJoin = 'round';

  // blush
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(s * 0.6, -0.12, 0, s * 0.6, -0.12, 0.2);
    g.addColorStop(0, `rgba(255,105,140,${0.55 * f.cheek})`);
    g.addColorStop(1, 'rgba(255,105,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s * 0.6 - 0.25, -0.4, 0.5, 0.5);
  }

  let eyeY = 0.2;
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.6, 0, TAU);
    ctx.clip();
    ctx.scale(1, -1);
    ctx.drawImage(photo, -0.6, -0.62, 1.2, 1.2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.6, 0, TAU);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    eyeY = 0.02 + 0.6 * 0.1;
  } else {
    drawEyes(ctx, f, T);
    drawMouth(ctx, f, T);
  }

  // tears: streams running down from the outer corners
  if (f.tears > 0.02) {
    for (const s of [-1, 1]) {
      const x0 = s * 0.5;
      ctx.strokeStyle = `rgba(120,200,255,${0.75 * f.tears})`;
      ctx.lineWidth = 0.055;
      ctx.beginPath();
      ctx.moveTo(x0, eyeY - 0.12);
      for (let y = 0; y <= 1; y += 0.1) ctx.lineTo(x0 + s * 0.04 * Math.sin(y * 9 + T * 6), eyeY - 0.12 - y * 0.75 * f.tears);
      ctx.stroke();
      const dy = ((T * 1.4 + (s > 0 ? 0.5 : 0)) % 1) * 0.8;
      ctx.fillStyle = `rgba(150,215,255,${f.tears})`;
      ctx.beginPath();
      ctx.ellipse(x0 + s * 0.02, eyeY - 0.2 - dy, 0.045, 0.06, 0, 0, TAU);
      ctx.fill();
    }
  }

  // anime sweat drop sliding down the forehead
  if (f.sweat > 0.02) {
    const y = 0.62 - ((T * 0.35) % 1) * 0.25;
    ctx.save();
    ctx.globalAlpha = f.sweat;
    ctx.translate(0.66, y);
    ctx.beginPath();
    ctx.moveTo(0, 0.13);
    ctx.bezierCurveTo(0.09, -0.02, 0.08, -0.1, 0, -0.1);
    ctx.bezierCurveTo(-0.08, -0.1, -0.09, -0.02, 0, 0.13);
    ctx.fillStyle = '#bfe9ff';
    ctx.fill();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-0.025, -0.03, 0.018, 0.03, 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawEyes(ctx, f, T) {
  for (const s of [-1, 1]) {
    const cx = s * 0.33, cy = 0.2, rx = 0.2, ry = 0.27;
    const wink = s > 0 ? f.wink : 0;
    const joy = Math.max(f.joy, wink);
    if (joy > 0.5) {
      // ^ ^ happy arcs
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.9, cy - 0.04);
      ctx.quadraticCurveTo(cx, cy + 0.2, cx + rx * 0.9, cy - 0.04);
      ctx.stroke();
      continue;
    }
    const open = clamp(f.eyeOpen);
    // the upper lid: tilts for sad (outer corner lower) / cross (inner lower)
    const lidY = cy + ry - (1 - open) * 2 * ry;
    const tilt = f.browTilt * 0.12 * open;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx - rx - 0.05, lidY + (s < 0 ? -tilt : tilt) * -1);
    ctx.lineTo(cx + rx + 0.05, lidY + (s < 0 ? tilt : -tilt) * -1);
    ctx.lineTo(cx + rx + 0.05, cy - ry - 0.1);
    ctx.lineTo(cx - rx - 0.05, cy - ry - 0.1);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    // pupil + shine
    const pr = 0.105 * f.pupS;
    const px = cx + f.pupX * 0.07, py = cy + f.pupY * 0.09 - 0.02;
    ctx.fillStyle = '#10223a';
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f6db5';
    ctx.beginPath();
    ctx.arc(px, py - pr * 0.25, pr * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#10223a';
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.42, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px + pr * 0.38, py + pr * 0.4, pr * (0.32 + 0.12 * f.shine), 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
    // outline + lid line
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.stroke();
    if (open < 0.97) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 0.02, ry + 0.02, 0, 0, TAU);
      ctx.clip();
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(cx - rx - 0.05, lidY + (s < 0 ? tilt : -tilt));
      ctx.lineTo(cx + rx + 0.05, lidY + (s < 0 ? -tilt : tilt));
      ctx.stroke();
      ctx.restore();
    }
  }
  // brows
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.065;
  for (const s of [-1, 1]) {
    const y = 0.56 + f.browY * 0.1;
    const inner = f.browTilt * 0.07, outer = -f.browTilt * 0.05;
    ctx.beginPath();
    ctx.moveTo(s * 0.17, y + inner);
    ctx.quadraticCurveTo(s * 0.33, y + 0.05 + (inner + outer) / 2, s * 0.48, y + outer);
    ctx.stroke();
  }
}

function drawMouth(ctx, f, T) {
  const cy = -0.3, w = f.mouthW;
  const o = clamp(f.mouthOpen);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.05;
  if (f.mouthO > 0.5) {
    // little "o" (sipping / surprised)
    const r = 0.05 + 0.08 * o;
    ctx.fillStyle = '#5a1222';
    ctx.beginPath();
    ctx.ellipse(0, cy - 0.02, r * 0.85, r, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const N = 24;
  const up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1, x = u * w;
    const base = cy + f.smile * 0.11 * (u * u - 0.35);
    const wob = f.wobble * 0.018 * Math.sin(u * 9 + T * 32);
    const bow = 1 - u * u;
    up.push([x, base + o * 0.03 * bow + wob * 0.5]);
    lo.push([x, base - o * 0.3 * Math.pow(bow, 0.7) + wob]);
  }
  if (o < 0.04) {
    ctx.beginPath();
    up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  } else {
    const path = () => {
      ctx.beginPath();
      up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = N; i >= 0; i--) ctx.lineTo(...lo[i]);
      ctx.closePath();
    };
    path();
    ctx.fillStyle = '#5a1222';
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    if (f.teeth > 0.05) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w, up[N / 2][1] - 0.07 * f.teeth, 2 * w, 0.2);
    }
    ctx.fillStyle = '#ff7a93';
    ctx.beginPath();
    ctx.ellipse(0, lo[N / 2][1] + 0.02, w * 0.55, 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    path();
    ctx.stroke();
  }
  // panting tongue hanging out
  if (f.tongue > 0.05) {
    const y0 = lo[N / 2][1] + 0.03;
    const len = 0.2 * f.tongue * (1 + 0.15 * Math.sin(T * 14));
    ctx.fillStyle = '#ff7a93';
    ctx.beginPath();
    ctx.moveTo(-0.09, y0);
    ctx.lineTo(-0.09, y0 - len + 0.08);
    ctx.quadraticCurveTo(-0.09, y0 - len, 0, y0 - len);
    ctx.quadraticCurveTo(0.09, y0 - len, 0.09, y0 - len + 0.08);
    ctx.lineTo(0.09, y0);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.035;
    ctx.stroke();
    ctx.strokeStyle = '#d94f6c';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(0, y0 - 0.02);
    ctx.lineTo(0, y0 - len + 0.07);
    ctx.stroke();
  }
}

// A canvas the face is painted on each frame, plus the texture that carries it.
export function faceCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

// A sticker for the face on a rigid body (Droppy paints his into the body shader instead).
export function faceDecal(geo, tex) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 1;
  return m;
}

// ---------- poses ----------

export function lerpPose(a, b, k) {
  if (typeof a === 'number') return lerp(a, b, k);
  if (Array.isArray(a)) return a.map((v, i) => lerp(v, b[i], k));
  const o = {};
  for (const key in b) o[key] = key in a ? lerpPose(a[key], b[key], k) : b[key];
  return o;
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- props ----------

// a smug cartoon sun in shades — the reason everyone dries out
export function makeSun() {
  const rays = canvasTexture(256, (ctx, S) => {
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#ffb21e';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath();
      ctx.moveTo(-14, 70);
      ctx.lineTo(0, 124);
      ctx.lineTo(14, 70);
      ctx.fill();
    }
  });
  const face = canvasTexture(256, (ctx, S) => {
    ctx.translate(S / 2, S / 2);
    const g = ctx.createRadialGradient(-20, -20, 10, 0, 0, 80);
    g.addColorStop(0, '#fff17a');
    g.addColorStop(1, '#ffb800');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 78, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#c47a00';
    ctx.stroke();
    // shades
    ctx.fillStyle = '#1a1a2e';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 28, -12, 26, 17, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(-10, -18, 20, 6);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 28 - 9, -18, 7, 4, -0.5, 0, TAU);
      ctx.fill();
    }
    // smirk
    ctx.strokeStyle = '#7a3b00';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-26, 30);
    ctx.quadraticCurveTo(10, 46, 34, 22);
    ctx.stroke();
  });
  const group = new THREE.Group();
  const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: rays, transparent: true, depthWrite: false }));
  r.scale.setScalar(0.9);
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: face, transparent: true, depthWrite: false }));
  f.scale.setScalar(0.9);
  f.position.z = 0.01;
  group.add(r, f);
  group.visible = false;
  return { group, rays: r };
}

export function placeSun(sun, amount, dir, T, y = 3.05) {
  sun.group.visible = amount > 0.01;
  if (!sun.group.visible) return;
  sun.group.position.set(-0.75 * dir, y + 0.04 * Math.sin(T * 2), 0.5);
  sun.group.scale.setScalar(backOut(amount));
  sun.rays.material.rotation = T * 0.6;
}

export function makeSteam(scene) {
  const tex = canvasTexture(64, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(32, 60);
    ctx.bezierCurveTo(10, 45, 54, 30, 32, 4);
    ctx.stroke();
  });
  return [0, 1, 2].map(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: '#dfe9f0' }));
    sp.scale.set(0.16, 0.26, 1);
    scene.add(sp);
    return sp;
  });
}

// wisps of steam rising off `top` (scene space)
export function placeSteam(steam, top, amount, T) {
  steam.forEach((sp, i) => {
    const ph = (T * 0.7 + i / 3) % 1;
    sp.visible = amount > 0.01;
    sp.position.set(top.x + (i - 1) * 0.22 + 0.05 * Math.sin(T * 3 + i), top.y - 0.15 + ph * 0.55, 1);
    sp.material.opacity = amount * Math.sin(ph * Math.PI) * 0.9;
  });
}

export function makeSparkles(scene) {
  const tex = canvasTexture(64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.translate(32, 32);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 6 : 30;
      const a = (i / 8) * TAU;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  });
  return Array.from({ length: 7 }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: i % 2 ? '#bff4ff' : '#fff7c2' }));
    sp.userData.phase = i * 0.37;
    scene.add(sp);
    return sp;
  });
}

// twinkling stars popping up around `mid` (scene space)
export function placeSparkles(sparkles, mid, amount, T, rx = 0.85, ry = 0.75) {
  sparkles.forEach((sp, i) => {
    const ph = (T * 0.9 + sp.userData.phase) % 1;
    const a = i * 2.4 + Math.floor(T * 0.9 + sp.userData.phase) * 1.7;
    sp.visible = amount > 0.01;
    sp.position.set(mid.x + Math.cos(a) * rx, mid.y + Math.sin(a) * ry + 0.2, 1.2);
    sp.scale.setScalar(0.17 * Math.sin(ph * Math.PI) * amount);
    sp.material.rotation = ph * 2;
  });
}

// a glass of water; scale `waterPivot.y` to empty it
export function makeGlass(R = 0.15, H = 0.38) {
  const group = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#e8f7ff', roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.85, H, 32, 1, true), glassMat);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.025, 32), glassMat);
  base.position.y = -H / 2;
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.008, 8, 32), new THREE.MeshBasicMaterial({ color: OUTLINE }));
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = H / 2;
  const waterPivot = new THREE.Group();
  waterPivot.position.y = -H / 2 + 0.013;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.84, H * 0.85, 32), new THREE.MeshPhysicalMaterial({ color: '#2aa6ff', roughness: 0.1, transparent: true, opacity: 0.85 }));
  water.position.y = (H * 0.85) / 2;
  waterPivot.add(water);
  group.add(waterPivot, wall, base, rimRing);
  group.visible = false;
  return { group, waterPivot, R, H };
}

export function makeShadow() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.7),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(128, (ctx, S) => {
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(0,20,50,.38)');
        g.addColorStop(1, 'rgba(0,20,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }),
      transparent: true,
      depthWrite: false,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

// little water drops, bubbles etc. as sprites
export function dropTexture(fill = '#5cc8ff') {
  return canvasTexture(64, (ctx) => {
    ctx.translate(32, 34);
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.bezierCurveTo(16, -4, 18, 8, 0, 22);
    ctx.bezierCurveTo(-18, 8, -16, -4, 0, -26);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0b3a66';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.ellipse(-5, 4, 3.5, 6, 0.3, 0, TAU);
    ctx.fill();
  });
}

export function bubbleTexture() {
  return canvasTexture(64, (ctx) => {
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, TAU);
    ctx.fillStyle = 'rgba(190,235,255,.35)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(22, 22, 6, 4, -0.7, 0, TAU);
    ctx.fill();
  });
}

export function sprites(scene, tex, n, color = '#ffffff') {
  return Array.from({ length: n }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color }));
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
}

// ---------- the stage ----------

/**
 * WebGL scene, camera, lights and the frame loop. A character subclasses it and implements build()
 * (meshes) plus either step(dt) or the pose pipeline: `states` (class names in priority order),
 * target(state, mood, t, T, dir, has) → pose, and pose(P, ctx) to apply it. Poses blend over 0.22 s
 * whenever the container's classes change.
 */
export class Stage {
  constructor(container, opts = {}) {
    this.container = container;
    this.freeze = opts.freeze ?? null; // fixed time (s) for screenshots
    this.view = { h: opts.viewH ? opts.viewH / 100 : VIEW_H, cy: opts.viewCY ? opts.viewCY / 100 : VIEW_CY };
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block';
    container.appendChild(this.canvas);

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: this.freeze !== null }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6080a0, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 5);
    const rim = new THREE.DirectionalLight(0xcfe8ff, 1.6);
    rim.position.set(-3, 2, -3);
    scene.add(key, rim);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.cls = null;
    this.t0 = 0;
    this.T = 0;
    this.from = null;
    this.out = null;

    this.build();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.frame = this.frame.bind(this);
    if (this.freeze !== null) this.simulate(this.freeze);
    else requestAnimationFrame(this.frame);
    this.ready = Promise.resolve(this);
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const c = this.camera, half = this.view.h / 2;
    c.left = (-half * w) / h;
    c.right = (half * w) / h;
    c.top = half;
    c.bottom = -half;
    c.position.set(0, this.view.cy + 1.1, 10);
    c.lookAt(0, this.view.cy, 0);
    c.updateProjectionMatrix();
  }

  setLook() {}

  simulate(time) {
    // Run the state machine from t=0 so blends and springs are where they'd be live.
    for (let t = 0; t <= time; t += 1 / 60) this.step(1 / 60);
    this.renderer.render(this.scene, this.camera);
  }

  frame(now) {
    if (this.dead) return;
    if (!this.container.isConnected) return this.dispose();
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.dead = true;
    this.ro.disconnect();
    this.renderer.dispose();
    this.canvas.remove();
  }

  step(dt) {
    this.T += dt;
    const T = this.T;
    const cls = this.container.className;
    if (cls !== this.cls) {
      this.cls = cls;
      this.t0 = T;
      if (this.out) {
        this.from = { ...this.out, face: { ...this.out.face } };
        for (const a of this.angles || []) this.from[a] = wrapAngle(this.out[a]); // don't unwind whole turns
      }
    }
    const t = T - this.t0;
    const has = (c) => this.container.classList.contains(c);
    const dir = Number(this.container.style.getPropertyValue('--dir')) || 1;
    const mood = has('happy') ? 'happy' : has('sad') ? 'sad' : '';
    const state = this.states.find(has) || 'stand';

    const target = this.target(state, mood, t, T, dir, has);
    const k = this.from ? smooth(0, 0.22, t) : 1;
    const P = (this.out = k < 1 ? lerpPose(this.from, target, k) : target);
    const bl = T % 3.7; // blink
    if (bl < 0.13) P.face.eyeOpen *= Math.abs(bl / 0.065 - 1);

    this.pose(P, { t, T, dt, dir, mood, state });
    drawFace(this.face.ctx, this.face.canvas.width, P.face, T, null);
    this.face.tex.needsUpdate = true;
  }
}
