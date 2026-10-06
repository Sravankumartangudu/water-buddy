// Droppy — the WaterBuddy mascot: a squishy water drop on rubber-hose legs, white gloves and
// red sneakers. Its body doubles as a see-through hydration gauge: it shows up half-empty,
// pale, wrinkly and panting; drinking visibly fills it (and plumps it up); skipping water lets a
// smug sun dry it out until its tip wilts.
//
// Driven by the container's classes (walking, skip, hello, waving, idle, drinking, dance, hop,
// pose, lookback + mood happy/sad) and the CSS variable --dir (1 = moving right, -1 = left).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const VIEW_H = 4.2; // world units visible vertically (Droppy is ~1.9 tall)
const VIEW_CY = 2.0;
const BODY_H = 1.5; // drop height
const BODY_W = 0.78; // profile width factor (max radius ≈ 0.6)
const LEG = 0.36; // body bottom height above the ground when standing
const PIVOT = 0.6; // spin/roll pivot height inside the body
const FACE_Y = 0.55; // face centre on the body
const FACE_S = 0.62; // face half-size (face units → body units)
const TAU = Math.PI * 2;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, k) => a + (b - a) * k;
const backOut = (x) => {
  const c = 1.9;
  x = clamp(x) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const pulse = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

// drop profile: t = 0 at the tip, π at the bottom
const profile = (t) => ({ r: BODY_W * Math.sin(t) * Math.sin(t / 2), y: ((1 + Math.cos(t)) / 2) * BODY_H });
function radiusAt(y) {
  // invert the profile numerically (front of the widest part is all we need)
  let best = 0;
  for (let i = 0; i <= 64; i++) {
    const p = profile((i / 64) * Math.PI);
    if (Math.abs(p.y - y) < Math.abs(profile((best / 64) * Math.PI).y - y)) best = i;
  }
  return profile((best / 64) * Math.PI).r;
}

// ---------- materials ----------

const OUTLINE = new THREE.Color('#0b3a66');

function outlineMaterial(thickness) {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${thickness.toFixed(4)};`);
  };
  return m;
}

function outlined(geo, mat, thickness = 0.016) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, outlineMaterial(thickness));
  m.frustumCulled = o.frustumCulled = false;
  g.add(o, m);
  g.userData.mesh = m;
  return g;
}

function bodyMaterial(faceTex) {
  const lin = (hex) => new THREE.Color(hex);
  const u = {
    uLevel: { value: 0.35 },
    uDry: { value: 0.5 },
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uFace: { value: faceTex },
    uDeep: { value: lin('#0f6fd0') },
    uShallow: { value: lin('#44c2ff') },
    uEmpty: { value: lin('#d7eef8') },
    uParched: { value: lin('#c9cfc9') },
  };
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 faceUv;\nattribute vec3 rest;\nvarying vec2 vFaceUv;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceUv = faceUv;\nvRest = rest;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uLevel, uDry, uTime, uGlow;
        uniform sampler2D uFace;
        uniform vec3 uDeep, uShallow, uEmpty, uParched;
        varying vec2 vFaceUv;
        varying vec3 vRest;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float h = vRest.y / ${BODY_H.toFixed(3)};
        float ang = atan(vRest.x, vRest.z);
        float lvl = uLevel + 0.018 * sin(ang * 3.0 + uTime * 3.2) + 0.01 * sin(ang * 7.0 - uTime * 5.0);
        float filled = smoothstep(lvl + 0.008, lvl - 0.008, h);
        vec3 water = mix(uDeep, uShallow, smoothstep(0.0, max(lvl, 0.05), h));
        // rising bubbles in the water
        vec2 bc = vec2(ang * 2.2, h * 9.0 - uTime * 0.9);
        vec2 cell = floor(bc);
        vec2 f = fract(bc) - 0.5;
        float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float bub = (rnd > 0.72 ? 1.0 : 0.0) * smoothstep(0.17, 0.12, length(f + vec2(sin(uTime + rnd * 6.0) * 0.12, 0.0)));
        water += bub * 0.35 * filled;
        vec3 empty = mix(uEmpty, uParched, uDry * 0.75);
        vec3 col = mix(empty, water, filled);
        col += vec3(0.75) * smoothstep(0.016, 0.0, abs(h - lvl)) * step(lvl, 0.985); // foam line
        col = mix(col, col * vec3(0.92, 0.95, 0.9), uDry * 0.4);
        vec4 fc = texture2D(uFace, vFaceUv * 0.5 + 0.5);
        float inFace = step(abs(vFaceUv.x), 1.0) * step(abs(vFaceUv.y), 1.0);
        diffuseColor.rgb = mix(col, fc.rgb, fc.a * inFace);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uGlow * 0.18;`
      );
  };
  return { m, u };
}

// ---------- geometry helpers ----------

/** A rubber-hose limb: a tube along a quadratic bezier, rebuilt in place each frame. */
class Hose {
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
        idx.push(a, b, a + 1, b, b + 1, a + 1);
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
function bendPoint(a, c, len, bend) {
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const seg = c.clone().sub(a);
  const d = seg.length();
  seg.normalize();
  const dir = bend.clone().addScaledVector(seg, -bend.dot(seg)).normalize();
  return mid.addScaledVector(dir, Math.sqrt(Math.max(0, (len / 2) ** 2 - (d / 2) ** 2)) * 1.3 + 0.02);
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- the face (painted every frame onto a canvas mapped across the body's front) ----------

const INK = '#0b2545';

function drawFace(ctx, S, f, T, photo) {
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

// ---------- poses ----------

const FACE0 = {
  eyeOpen: 1, joy: 0, pupX: 0, pupY: 0, pupS: 1, shine: 0, browY: 0, browTilt: 0,
  mouthW: 0.22, mouthOpen: 0, smile: 0.5, mouthO: 0, tongue: 0, teeth: 0, wobble: 0,
  cheek: 0.3, tears: 0, sweat: 0, wink: 0,
};

function basePose() {
  return {
    x: 0, y: 0, yaw: 0.15, roll: 0, pitch: 0, spin: 0,
    sq: 1, shearX: 0, shearZ: 0, tip: 0.28, tipF: 0, wob: 0.3, plump: 1, bulge: 0,
    h0: [-0.68, 0.2, 0.1], h1: [0.68, 0.2, 0.1], tw0: 0, tw1: 0,
    f0: [-0.2, 0, 0.04], f1: [0.2, 0, 0.04], fp0: 0, fp1: 0,
    glass: 0, glassLevel: 1, sun: 0, steam: 0, sparkle: 0,
    face: { ...FACE0 },
  };
}

function lerpPose(a, b, k) {
  if (typeof a === 'number') return lerp(a, b, k);
  if (Array.isArray(a)) return a.map((v, i) => lerp(v, b[i], k));
  const o = {};
  for (const key in b) o[key] = key in a ? lerpPose(a[key], b[key], k) : b[key];
  return o;
}

const moodFace = (P, mood) => {
  const f = P.face;
  if (mood === 'happy') Object.assign(f, { smile: 1, cheek: 0.75, mouthW: 0.26, shine: 1 });
  else if (mood === 'sad') Object.assign(f, { smile: -0.85, browTilt: 1, eyeOpen: 0.7, cheek: 0.15, wobble: 0.6, mouthW: 0.17 });
  else Object.assign(f, { sweat: 1, smile: 0.35, mouthOpen: 0.35, tongue: 0.7, browTilt: 0.35, eyeOpen: 0.85 });
};

// Rubber-hose walk: feet planted while the body moves at `speed` units/s, facing `yaw`.
function walkCycle(P, t, { speed, yaw, stride, lift, bob }) {
  const u = speed / Math.max(0.3, Math.abs(Math.sin(yaw))); // foot speed along the facing axis
  const cycle = (2 * stride) / u;
  const ph = (t / cycle) % 1;
  for (const [k, off] of [[0, 0], [1, 0.5]]) {
    const p = (ph + off) % 1;
    let z, y;
    if (p < 0.5) {
      z = stride / 2 - (p / 0.5) * stride; // stance: slides back under the body
      y = 0;
    } else {
      const s = (p - 0.5) / 0.5;
      z = -stride / 2 + smooth(0, 1, s) * stride;
      y = lift * Math.sin(Math.PI * s);
    }
    P[`f${k}`] = [k ? 0.19 : -0.19, y, z];
    P[`fp${k}`] = p < 0.5 ? 0 : -0.5 * Math.sin(Math.PI * (p - 0.5) * 2);
  }
  const s2 = Math.cos(ph * 2 * TAU);
  P.y = bob * (0.5 + 0.5 * s2) - 0.02;
  P.sq = 1 + 0.035 * s2;
  P.roll = 0.07 * Math.sin(ph * TAU);
  P.yaw = yaw;
  return ph;
}

function stateOf(has) {
  for (const s of ['drinking', 'dance', 'pose', 'skip', 'walking', 'lookback', 'waving', 'hello', 'idle']) if (has(s)) return s;
  return 'stand';
}

function targetPose(state, mood, t, T, dir, has) {
  const P = basePose();
  const f = P.face;
  moodFace(P, mood);
  const lookUser = (yaw) => (f.pupX = clamp(-Math.sin(yaw) * 1.4, -1, 1));

  switch (state) {
    case 'walking': {
      if (mood === 'sad') {
        const ph = walkCycle(P, t, { speed: 1.1, yaw: dir * 1.15, stride: 0.38, lift: 0.06, bob: 0.025 });
        P.shearZ = 0.14;
        P.sq = 0.95 + 0.02 * Math.cos(ph * 2 * TAU);
        P.h0 = [-0.6, 0.02, 0.05 + 0.06 * Math.cos(ph * TAU)];
        P.h1 = [0.6, 0.02, 0.05 - 0.06 * Math.cos(ph * TAU)];
        P.tip = -dir * 0.85;
        P.sun = 1;
        P.steam = 0.6;
        Object.assign(f, { pupY: -0.8, eyeOpen: 0.55, tears: 0.7 });
      } else {
        const ph = walkCycle(P, t, { speed: 2.4, yaw: dir * 0.85, stride: 0.6, lift: 0.14, bob: 0.06 });
        P.shearZ = 0.1;
        const sw = Math.cos(ph * TAU);
        P.h0 = [-0.66, 0.32, 0.25 * sw];
        P.h1 = [0.66, 0.32, -0.25 * sw];
        P.tip = 0.3 - dir * 0.25 + 0.12 * Math.sin(ph * 2 * TAU);
        lookUser(P.yaw);
        Object.assign(f, { mouthOpen: 0.45 + 0.15 * Math.sin(T * 14), tongue: 0.8 });
      }
      break;
    }
    case 'skip': {
      const cyc = 0.46, ph = (t / cyc) % 1, hopY = Math.abs(Math.sin(ph * Math.PI));
      P.yaw = dir * 0.75;
      P.y = 0.26 * hopY;
      P.sq = 1 + 0.12 * (hopY - 0.5);
      const lead = Math.floor(t / cyc) % 2;
      P[`f${lead}`] = [lead ? 0.2 : -0.2, 0.22 + 0.15 * hopY, 0.2];
      P[`f${1 - lead}`] = [lead ? -0.2 : 0.2, P.y * 0.6, -0.15];
      P.fp0 = P.fp1 = -0.2;
      const sw = lead ? 1 : -1;
      P.h0 = [-0.7, 0.75 + 0.3 * sw, 0.25 * sw];
      P.h1 = [0.7, 0.75 - 0.3 * sw, -0.25 * sw];
      P.tip = 0.2 - 0.3 * Math.sin(ph * TAU);
      P.sparkle = 1;
      lookUser(P.yaw);
      Object.assign(f, { joy: 1, mouthOpen: 0.7, teeth: 0.5 });
      break;
    }
    case 'hello': {
      const crouch = smooth(0, 0.1, t) * (1 - smooth(0.1, 0.16, t));
      const air = smooth(0.12, 0.2, t) * (1 - smooth(0.34, 0.42, t));
      const land = pulse(t, 0.44, 0.04);
      P.y = -0.08 * crouch + 0.32 * Math.sin(clamp((t - 0.12) / 0.3) * Math.PI) - 0.07 * land;
      P.sq = 1 - 0.2 * crouch + 0.14 * air - 0.18 * land;
      P.h0 = [-0.75, 0.2 + 1.0 * air, 0.1];
      P.h1 = [0.75, 0.2 + 1.0 * air, 0.1];
      P.f0 = [-0.24, Math.max(0, P.y) * 0.8, 0.04];
      P.f1 = [0.24, Math.max(0, P.y) * 0.8, 0.04];
      P.yaw = 0;
      Object.assign(f, { mouthO: 0, mouthOpen: 0.75, tongue: 0.2, pupS: 1.15, browY: 1, eyeOpen: 1 });
      break;
    }
    case 'waving': {
      const w = Math.sin(t * TAU * 2.6);
      P.h1 = [0.72 + 0.12 * w, 1.3, 0.25];
      P.tw1 = 0.5 * w;
      P.h0 = [-0.58, 0.38, 0.22];
      P.roll = -0.05 + 0.03 * w;
      P.tip = 0.3 + 0.15 * w;
      P.yaw = 0.2;
      lookUser(P.yaw);
      // chatting: mouth flaps for the first couple of seconds
      const talk = 1 - smooth(1.6, 2.0, t);
      Object.assign(f, { browY: 0.8, smile: 0.7, tongue: 0.25 * (1 - talk), mouthOpen: lerp(0.3, 0.2 + 0.45 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)), talk) });
      break;
    }
    case 'drinking': {
      // glass with a straw: watch the glass empty while Droppy fills up
      const inn = backOut(t / 0.35), out = smooth(2.5, 2.75, t);
      P.glass = inn * (1 - out);
      P.glassLevel = 1 - smooth(0.4, 2.45, t);
      P.h0 = [-0.25, 0.14, 0.72];
      P.h1 = [0.25, 0.14, 0.72];
      P.yaw = 0;
      P.shearZ = 0.05;
      const gulps = [0.75, 1.15, 1.55, 1.95];
      let g = 0;
      for (const gt of gulps) g = Math.max(g, pulse(t, gt, 0.07));
      P.sq = 1 + 0.03 * g + 0.12 * pulse(t, 2.65, 0.08);
      P.plump = 0.97 + 0.08 * smooth(0.4, 2.4, t) + 0.04 * g;
      P.tip = lerp(0.5, 0.1, smooth(0.4, 2.4, t));
      P.wob = 0.5 + g;
      Object.assign(f, {
        mouthO: t < 2.55 ? 1 : 0,
        mouthOpen: t < 2.55 ? 0.05 + 0.25 * g : 0.6,
        tongue: 0, sweat: 1 - smooth(0.4, 1.8, t),
        eyeOpen: t < 2.5 ? lerp(1, 0.55, smooth(0.6, 1.2, t)) : 1,
        pupS: t < 2.5 ? 1.1 : 0.65, pupY: t < 2.5 ? -0.4 : 0,
        browY: t < 2.5 ? 0.3 : 1.3, cheek: 0.3 + 0.5 * smooth(0.5, 2.4, t), smile: 0.8, browTilt: 0,
      });
      if (t > 2.5) P.sparkle = 1;
      break;
    }
    case 'dance': {
      if (has('hop')) {
        // four big hops (0.8 s each, matching overlay.js's sideways moves): star jump, spin, star jump, roll
        const i = Math.floor(t / 0.8) % 4, u = (t % 0.8) / 0.8;
        const crouch = smooth(0, 0.12, u) * (1 - smooth(0.12, 0.2, u));
        const airU = clamp((u - 0.17) / 0.6);
        const air = Math.sin(airU * Math.PI) * (u > 0.17 && u < 0.77 ? 1 : 0);
        const land = pulse(u, 0.82, 0.06);
        P.y = -0.09 * crouch + 0.7 * air - 0.08 * land;
        P.sq = 1 - 0.22 * crouch + 0.16 * pulse(u, 0.25, 0.08) - 0.22 * land;
        P.yaw = 0;
        const star = i % 2 === 0 ? air : 0;
        P.h0 = [-0.7 - 0.3 * star, 0.3 + 1.0 * air, 0.1];
        P.h1 = [0.7 + 0.3 * star, 0.3 + 1.0 * air, 0.1];
        const tuck = P.y > 0 ? P.y : 0;
        P.f0 = [-0.22 - 0.25 * star, tuck + 0.12 * air * (1 - star), 0.04];
        P.f1 = [0.22 + 0.25 * star, tuck + 0.12 * air * (1 - star), 0.04];
        if (i === 1) P.spin = smooth(0.17, 0.77, u) * TAU;
        if (i === 3) P.roll = -smooth(0.17, 0.77, u) * TAU;
        P.sparkle = 1;
        Object.assign(f, { joy: air > 0.3 ? 0 : 1, mouthOpen: 0.85, teeth: 0.6, pupS: 1.1, browY: 1 });
      } else {
        // the splash dance: stomps on every beat, jelly hips, pumping arms
        const b = t / 0.2;
        const k = Math.floor(b) % 2, fr = b % 1;
        P.yaw = 0.25 * Math.sin(Math.PI * b * 0.5);
        P.y = 0.07 * Math.abs(Math.sin(Math.PI * b));
        P.sq = 1 - 0.07 * Math.cos(TAU * b);
        P.shearX = 0.14 * Math.sin(Math.PI * b);
        P.roll = -0.08 * Math.sin(Math.PI * b);
        P[`f${k}`] = [k ? 0.28 : -0.28, 0.13 * Math.sin(Math.PI * fr), 0.08];
        P[`f${1 - k}`] = [k ? -0.2 : 0.2, 0, 0.04];
        P.fp0 = P.fp1 = 0;
        const roof = b >= 8; // second half: raise-the-roof
        const a = Math.sin(Math.PI * b);
        P.h0 = roof ? [-0.55, 1.45 + 0.15 * Math.abs(a), 0.15] : [-0.78, 0.7 + 0.4 * a, 0.2];
        P.h1 = roof ? [0.55, 1.45 + 0.15 * Math.abs(a), 0.15] : [0.78, 0.7 - 0.4 * a, 0.2];
        P.tw0 = P.tw1 = roof ? 1.2 * a : 0;
        P.tip = 0.3 - 0.4 * Math.sin(Math.PI * b);
        P.wob = 1;
        P.sparkle = 1;
        Object.assign(f, { joy: fr < 0.5 ? 1 : 0, mouthOpen: 0.8, teeth: 0.6, pupX: 0.6 * Math.sin(Math.PI * b * 0.5), browY: 0.8 });
      }
      break;
    }
    case 'pose': {
      // double-bicep flex — water powers your muscles
      const flex = 0.75 + 0.25 * Math.sin(t * 9);
      P.h0 = [-0.62, 0.95, 0.22];
      P.h1 = [0.62, 0.95, 0.22];
      P.bulge = smooth(0, 0.25, t) * flex;
      P.f0 = [-0.32, 0, 0.06];
      P.f1 = [0.32, 0, 0.06];
      P.plump = 1.06;
      P.sq = 1.04;
      P.yaw = 0.12;
      P.tip = 0.15;
      P.sparkle = 1;
      Object.assign(f, { wink: smooth(0.2, 0.35, t), mouthOpen: 0.35, teeth: 1, smile: 1, browY: 0.6, browTilt: -0.3 });
      break;
    }
    case 'lookback': {
      const turn = smooth(0, 0.35, t);
      P.yaw = dir * lerp(1.15, 0.3, turn);
      P.sq = 0.95 - 0.03 * pulse(t % 0.6, 0.1, 0.05);
      P.tip = -dir * 0.8;
      P.h0 = [-0.55, 0.15, 0.25];
      P.h1 = [0.55, 0.15, 0.25];
      P.sun = 1;
      P.steam = 0.6;
      Object.assign(f, { pupS: 1.5, shine: 1, pupX: -dir * 0.3, pupY: 0.2, eyeOpen: 1, tears: 0.9, wobble: 1 });
      break;
    }
    case 'idle':
    case 'stand': {
      if (mood === 'happy') {
        // "Aaah": blissed out, patting a full belly
        P.h0 = [-0.32, 0.22 + 0.04 * Math.sin(t * 7), 0.66];
        P.h1 = [0.32, 0.22 + 0.04 * Math.sin(t * 7 + 1), 0.66];
        P.roll = 0.08 * Math.sin(t * 2);
        P.yaw = 0;
        P.sparkle = 1;
        P.plump = 1.04;
        Object.assign(f, { joy: 1, mouthOpen: 0.55, smile: 0.7 });
      } else if (mood === 'sad') {
        // a smug sun shows up and Droppy starts drying out
        P.sun = 1;
        P.steam = smooth(0.5, 1.2, t);
        P.sq = lerp(1, 0.94, smooth(0.6, 2.5, t)) - 0.03 * pulse(t % 0.7, 0.1, 0.05) * smooth(1, 1.5, t);
        P.tip = lerp(0.3, 0.9, smooth(0.6, 2.6, t));
        P.shearX = -0.06 * smooth(1, 2.5, t);
        P.yaw = 0;
        const shock = 1 - smooth(0.6, 1.0, t);
        P.h0 = [-0.6, lerp(0.2, 0.05, 1 - shock), 0.15];
        P.h1 = [0.55 + 0.05 * Math.sin(t * 10), lerp(0.2, 0.7, smooth(1.2, 1.6, t)), 0.45]; // weak fanning
        P.tw1 = 0.6 * Math.sin(t * 10);
        Object.assign(f, {
          pupY: lerp(0.9, -0.5, smooth(0.9, 1.4, t)), pupX: lerp(-0.5, 0, smooth(0.9, 1.4, t)),
          mouthO: shock > 0.5 ? 1 : 0, mouthOpen: shock > 0.5 ? 0.8 : 0,
          tears: smooth(1.2, 2.2, t), eyeOpen: lerp(1, 0.65, 1 - shock), browTilt: lerp(0.2, 1, 1 - shock),
        });
      } else {
        // thirsty idle: pant and fan, wipe the forehead, then point at the low water level
        const c = t % 6;
        P.sq = 1 + 0.025 * Math.sin(t * TAU * 2.4);
        P.tip = 0.45 + 0.05 * Math.sin(t * 3);
        lookUser(P.yaw);
        if (c < 2.5) {
          P.h1 = [0.5 + 0.08 * Math.sin(t * 22), 0.78, 0.48];
          P.tw1 = 0.7 * Math.sin(t * 22);
          Object.assign(f, { mouthOpen: 0.45 + 0.12 * Math.sin(t * 15), tongue: 0.9 });
        } else if (c < 4) {
          const s = smooth(2.6, 3.6, c);
          P.h0 = [lerp(-0.4, 0.35, s), 1.02 - 0.05 * Math.sin(s * Math.PI), 0.42];
          Object.assign(f, { eyeOpen: 0.5, mouthOpen: 0.2, tongue: 0.3, smile: 0, browTilt: 0.6 });
        } else {
          const s = smooth(4, 4.3, c);
          P.h0 = [lerp(-0.68, -0.3, s), lerp(0.2, 0.18, s), lerp(0.1, 0.66, s)];
          const back = smooth(4.8, 5.1, c);
          Object.assign(f, { pupY: lerp(-1, 0.2, back), pupX: lerp(-0.4, 0, back), pupS: lerp(1, 1.35, back), shine: back, browTilt: 0.9, smile: -0.2, mouthOpen: 0.15, tongue: 0 });
        }
      }
      break;
    }
  }
  return P;
}

// ---------- the buddy ----------

class Buddy {
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
    this.look = null;
    this.cls = null;
    this.t0 = 0;
    this.T = 0;
    this.from = null;
    this.out = basePose();
    this.hyd = { level: 0.35, dry: 0.5 };
    this.tip = { a: 0.3, v: 0 };
    this.jig = { x: 0, v: 0, lastY: 0, lastV: 0 };

    this.build();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
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

  build() {
    const rig = (this.rig = new THREE.Group());
    this.scene.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);
    const body = (this.body = new THREE.Group());
    body.position.y = -PIVOT;
    pivot.add(body);

    // body: lathe of the drop profile, seam at the back
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const t = Math.PI * (1 - (i / 90) ** 1.15); // bottom → tip, denser near the tip
      const p = profile(t);
      pts.push(new THREE.Vector2(Math.max(p.r, 1e-4), p.y));
    }
    const geo = (this.bodyGeo = new THREE.LatheGeometry(pts, 96, Math.PI));
    const pos = geo.attributes.position;
    this.rest = Float32Array.from(pos.array);
    const faceUv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const front = z > 0.02;
      faceUv[i * 2] = front ? x / FACE_S : 9;
      faceUv[i * 2 + 1] = front ? (y - FACE_Y) / FACE_S : 9;
    }
    geo.setAttribute('faceUv', new THREE.BufferAttribute(faceUv, 2));
    geo.setAttribute('rest', new THREE.BufferAttribute(Float32Array.from(pos.array), 3));

    const FS = 512;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = this.faceCanvas.height = FS;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    const { m, u } = bodyMaterial(this.faceTex);
    this.bodyU = u;
    body.add(outlined(geo, m, 0.02));

    // limbs
    const limbMat = new THREE.MeshPhysicalMaterial({ color: '#1f86e0', roughness: 0.3, clearcoat: 0.6 });
    this.arms = [new Hose(0.045, limbMat), new Hose(0.045, limbMat)];
    this.legs = [new Hose(0.05, limbMat), new Hose(0.05, limbMat)];
    for (const a of this.arms) body.add(a.obj);
    for (const l of this.legs) rig.add(l.obj);

    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    this.gloves = [0, 1].map((k) => {
      const g = new THREE.Group();
      const palm = outlined(new THREE.SphereGeometry(0.085, 20, 14), white, 0.014);
      palm.scale.set(1, 1.05, 0.8);
      palm.position.y = 0.05;
      const thumb = outlined(new THREE.SphereGeometry(0.035, 12, 10), white, 0.012);
      thumb.position.set(k ? -0.07 : 0.07, 0.04, 0.03);
      const cuff = outlined(new THREE.TorusGeometry(0.055, 0.024, 10, 20), white, 0.012);
      cuff.rotation.x = Math.PI / 2;
      g.add(palm, thumb, cuff);
      body.add(g);
      return g;
    });

    const red = new THREE.MeshPhysicalMaterial({ color: '#ef3b3b', roughness: 0.35, clearcoat: 0.5 });
    this.shoeMat = red;
    this.shoes = [0, 1].map(() => {
      const g = new THREE.Group();
      const upper = outlined(new THREE.SphereGeometry(0.1, 24, 16), red, 0.014);
      upper.scale.set(1.1, 0.85, 1.55);
      upper.position.set(0, 0.07, 0.05);
      const sole = outlined(new THREE.SphereGeometry(0.1, 24, 12), white, 0.012);
      sole.scale.set(1.2, 0.32, 1.7);
      sole.position.set(0, 0.025, 0.05);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), white);
      cap.scale.set(1.4, 0.8, 1);
      cap.position.set(0, 0.06, 0.17);
      g.add(upper, sole, cap);
      rig.add(g);
      return g;
    });

    this.buildGlass();
    this.buildSun();
    this.buildFx();

    const shadow = (this.shadow = new THREE.Mesh(
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
    ));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    this.scene.add(shadow);
  }

  buildGlass() {
    const g = (this.glass = new THREE.Group());
    const R = 0.15, H = 0.38;
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#e8f7ff', roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.85, H, 32, 1, true), glassMat);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.025, 32), glassMat);
    base.position.y = -H / 2;
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.008, 8, 32), new THREE.MeshBasicMaterial({ color: OUTLINE }));
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = H / 2;
    const wp = (this.waterPivot = new THREE.Group());
    wp.position.y = -H / 2 + 0.013;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.84, H * 0.85, 32), new THREE.MeshPhysicalMaterial({ color: '#2aa6ff', roughness: 0.1, transparent: true, opacity: 0.85 }));
    water.position.y = (H * 0.85) / 2;
    wp.add(water);
    // bendy straw up to the mouth
    const mouth = new THREE.Vector3(0, FACE_Y - 0.3 * FACE_S, radiusAt(FACE_Y - 0.3 * FACE_S) + 0.01);
    this.glassAt = new THREE.Vector3(0, 0.13, 0.78);
    const m = mouth.clone().sub(this.glassAt);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, -H / 2 + 0.05, 0),
      new THREE.Vector3(0.05, H / 2 + 0.04, 0),
      new THREE.Vector3(0.03, m.y - 0.02, m.z + 0.06),
      new THREE.Vector3(0, m.y, m.z),
    ]);
    const straw = outlined(new THREE.TubeGeometry(curve, 30, 0.02, 10), new THREE.MeshStandardMaterial({ color: '#ff5fa2', roughness: 0.4 }), 0.008);
    g.add(wp, wall, base, rimRing, straw);
    g.position.copy(this.glassAt);
    g.visible = false;
    this.body.add(g);
  }

  buildSun() {
    // a smug cartoon sun in shades — the reason Droppy dries out
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
    const s = (this.sun = new THREE.Group());
    this.sunRays = new THREE.Sprite(new THREE.SpriteMaterial({ map: rays, transparent: true, depthWrite: false }));
    this.sunRays.scale.setScalar(0.9);
    const sf = new THREE.Sprite(new THREE.SpriteMaterial({ map: face, transparent: true, depthWrite: false }));
    sf.scale.setScalar(0.9);
    sf.position.z = 0.01;
    s.add(this.sunRays, sf);
    s.visible = false;
    this.scene.add(s);
  }

  buildFx() {
    const steamTex = canvasTexture(64, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(32, 60);
      ctx.bezierCurveTo(10, 45, 54, 30, 32, 4);
      ctx.stroke();
    });
    this.steam = [0, 1, 2].map(() => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, color: '#dfe9f0' }));
      sp.scale.set(0.16, 0.26, 1);
      this.scene.add(sp);
      return sp;
    });
    const starTex = canvasTexture(64, (ctx) => {
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
    this.sparkles = Array.from({ length: 7 }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, color: i % 2 ? '#bff4ff' : '#fff7c2' }));
      sp.userData.phase = i * 0.37;
      this.scene.add(sp);
      return sp;
    });
  }

  setLook(settings) {
    const photo = settings.character === 'photo' && !!settings.head;
    this.look = { photo };
    if (photo && settings.head !== this.headUrl) {
      this.headUrl = settings.head;
      const img = new Image();
      img.onload = () => (this.photoImg = img);
      img.src = settings.head;
    }
  }

  // ---------- per-frame ----------

  simulate(time) {
    // Run the state machine from t=0 so blends and springs are where they'd be live.
    for (let t = 0; t <= time; t += 1 / 60) this.step(1 / 60);
    this.renderer.render(this.scene, this.camera);
  }

  frame(now) {
    if (!this.container.isConnected) return this.renderer.dispose();
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    this.T += dt;
    const T = this.T;
    const cls = this.container.className;
    if (cls !== this.cls) {
      this.cls = cls;
      this.t0 = T;
      this.from = { ...this.out, face: { ...this.out.face } };
      this.from.spin = 0;
      this.from.roll = Math.atan2(Math.sin(this.out.roll), Math.cos(this.out.roll));
    }
    const t = T - this.t0;
    const has = (c) => this.container.classList.contains(c);
    const dir = Number(this.container.style.getPropertyValue('--dir')) || 1;
    const mood = has('happy') ? 'happy' : has('sad') ? 'sad' : '';
    const state = stateOf(has);

    const target = targetPose(state, mood, t, T, dir, has);
    const k = this.from ? smooth(0, 0.22, t) : 1;
    const P = (this.out = k < 1 ? lerpPose(this.from, target, k) : target);

    // blinking
    const bl = T % 3.7;
    if (bl < 0.13) P.face.eyeOpen *= Math.abs(bl / 0.065 - 1);

    // hydration persists between states
    const h = this.hyd;
    const toward = (key, v, rate) => (h[key] += clamp(v - h[key], -rate * dt, rate * dt));
    if (state === 'drinking') {
      if (t > 0.4) toward('level', 1, 0.34), toward('dry', 0, 0.5);
    } else if (mood === 'happy') toward('level', 1, 1.5), toward('dry', 0, 1.5);
    else if (mood === 'sad') toward('level', 0.12, t > 0.6 ? 0.12 : 0), toward('dry', 1, t > 0.6 ? 0.35 : 0);
    else toward('level', 0.35, 1), toward('dry', 0.5, 1);

    // springs: tip follow-through and jelly jiggle on vertical jolts
    const tp = this.tip;
    tp.v += (220 * (P.tip - tp.a) - 2 * 0.22 * 15 * tp.v) * dt;
    tp.a += tp.v * dt;
    const jg = this.jig;
    const vy = (P.y - jg.lastY) / dt;
    const ay = (vy - jg.lastV) / dt;
    jg.lastY = P.y;
    jg.lastV = vy;
    jg.v += (-1200 * jg.x - 2 * 0.2 * 35 * jg.v - clamp(ay, -60, 60) * 0.02) * dt;
    jg.x += jg.v * dt;

    this.pose(P, T, dir);
    drawFace(this.faceCtx, this.faceCanvas.width, P.face, T, this.look?.photo ? this.photoImg : null);
    this.faceTex.needsUpdate = true;
  }

  // body deformation of one rest-space point (x, y, z)
  deformer(P, T) {
    const h = this.hyd;
    const sq = P.sq * (1 + this.jig.x) * (1 - 0.08 * h.dry);
    const sxz = 1 / Math.sqrt(Math.max(0.5, P.sq));
    const base = P.plump * (1 - 0.12 * h.dry);
    const tipA = this.tip.a, tipF = P.tipF;
    const yb = 0.55 * BODY_H * sq;
    return (x, y, z, out) => {
      const hh = y / BODY_H;
      const phi = Math.atan2(x, z);
      const crease = Math.pow(0.5 + 0.5 * Math.sin(phi * 11 + Math.sin(hh * 7) * 1.3), 3) * smooth(0.04, 0.25, hh) * (1 - smooth(0.75, 1, hh));
      const s = base * sxz * (1 + P.wob * 0.025 * Math.sin(hh * 10 - T * 11 + phi)) * (1 - h.dry * 0.08 * crease);
      let X = x * s, Y = y * sq, Z = z * s;
      const b = smooth(0.58, 1, hh) ** 2.2;
      if (b > 0) {
        const len = Y - yb;
        const a = tipA * b, af = tipF * b;
        X += len * Math.sin(a);
        Z += len * Math.sin(af);
        Y += len * (Math.cos(a) - 1) + len * (Math.cos(af) - 1);
      }
      X += P.shearX * hh;
      Z += P.shearZ * hh;
      return out.set(X, Y, Z);
    };
  }

  pose(P, T, dir) {
    const { rig, pivot, body } = this;
    const def = this.deformer(P, T);

    // deform the body
    const pos = this.bodyGeo.attributes.position;
    const arr = pos.array, rest = this.rest;
    const v = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      def(rest[i], rest[i + 1], rest[i + 2], v);
      arr[i] = v.x;
      arr[i + 1] = v.y;
      arr[i + 2] = v.z;
    }
    pos.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    const u = this.bodyU;
    u.uLevel.value = this.hyd.level;
    u.uDry.value = this.hyd.dry;
    u.uTime.value = T;
    u.uGlow.value = P.sparkle * this.hyd.level;

    rig.position.set(P.x, 0, 0);
    rig.rotation.set(0, P.yaw + P.spin, 0);
    pivot.position.set(0, LEG + PIVOT + P.y, 0);
    pivot.rotation.set(P.pitch, 0, P.roll, 'YXZ');
    rig.updateMatrixWorld(true);

    // arms: shoulder on the body surface → glove
    const sy = 0.5;
    const sr = radiusAt(sy) * 0.85;
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const sh = def(s * sr, sy, 0, new THREE.Vector3());
      const hand = new THREE.Vector3(...P[`h${k}`]);
      const elbow = bendPoint(sh, hand, 0.62, new THREE.Vector3(s * 0.4, -1, -0.35));
      this.arms[k].update(sh, elbow, hand, P.bulge);
      const g = this.gloves[k];
      g.position.copy(hand);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().sub(elbow).normalize());
      g.rotateY(P[`tw${k}`] + (k ? -0.4 : 0.4));
    }

    // legs: hip under the body (world → rig space) → shoe on the ground
    const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(body.matrixWorld);
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const hip = def(s * 0.19, 0.07, 0, new THREE.Vector3()).applyMatrix4(toRig);
      const foot = new THREE.Vector3(...P[`f${k}`]);
      const ankle = foot.clone().add(new THREE.Vector3(0, 0.08, 0));
      const knee = bendPoint(hip, ankle, 0.46, new THREE.Vector3(s * 0.25, 0, 1));
      this.legs[k].update(hip, knee, ankle);
      const sh = this.shoes[k];
      sh.position.copy(foot);
      sh.rotation.set(P[`fp${k}`], s * 0.12, 0);
    }

    // glass with straw
    this.glass.visible = P.glass > 0.01;
    this.glass.scale.setScalar(Math.max(0.01, P.glass));
    this.waterPivot.scale.y = Math.max(0.001, P.glassLevel);
    this.waterPivot.visible = P.glassLevel > 0.01;

    // shadow shrinks as Droppy leaves the ground
    const sc = 1 / (1 + Math.max(0, P.y) * 1.4);
    this.shadow.scale.set(sc, sc, 1);
    this.shadow.material.opacity = sc;
    this.shadow.position.x = P.x;

    // sun + steam + sparkles live in screen-aligned scene space
    const sun = this.sun;
    sun.visible = P.sun > 0.01;
    if (sun.visible) {
      sun.position.set(-0.75 * dir, 3.05 + 0.04 * Math.sin(T * 2), 0.5);
      sun.scale.setScalar(backOut(P.sun));
      this.sunRays.material.rotation = T * 0.6;
    }
    const top = def(0, BODY_H, 0, new THREE.Vector3()).applyMatrix4(body.matrixWorld);
    this.steam.forEach((sp, i) => {
      const ph = (T * 0.7 + i / 3) % 1;
      sp.visible = P.steam > 0.01;
      sp.position.set(top.x + (i - 1) * 0.22 + 0.05 * Math.sin(T * 3 + i), top.y - 0.15 + ph * 0.55, 1);
      sp.material.opacity = P.steam * Math.sin(ph * Math.PI) * 0.9;
    });
    const mid = new THREE.Vector3(0, 0.6, 0).applyMatrix4(body.matrixWorld);
    this.sparkles.forEach((sp, i) => {
      const ph = (T * 0.9 + sp.userData.phase) % 1;
      const a = i * 2.4 + Math.floor(T * 0.9 + sp.userData.phase) * 1.7;
      sp.visible = P.sparkle > 0.01;
      sp.position.set(mid.x + Math.cos(a) * 0.85, mid.y + Math.sin(a) * 0.75 + 0.2, 1.2);
      sp.scale.setScalar(0.17 * Math.sin(ph * Math.PI) * P.sparkle);
      sp.material.rotation = ph * 2;
    });
  }
}

function render(container, settings, opts) {
  if (!container._buddy) container._buddy = new Buddy(container, opts);
  container._buddy.setLook(settings);
  return container._buddy.ready;
}

window.Buddy = { render };
export { render };
