// The cast. Droppy lives here; Nimbus (cloud), Glug (bottle) and Finn (fish) are in cast/. render() puts
// whichever one settings.cast names into a container.
//
// Droppy — the WaterBuddy mascot: a squishy water drop on rubber-hose legs, white gloves and
// red sneakers. Its body doubles as a see-through hydration gauge: it shows up half-empty,
// pale, wrinkly and panting; drinking visibly fills it (and plumps it up); skipping water lets a
// smug sun dry it out until its tip wilts.
//
// Driven by the container's classes (walking, crawl, dash, skid, skip, cartwheel, moonwalk, hello,
// waving, idle, drinking, burp, dance, hop, pose, tada, lookback, tantrum, melt + mood happy/sad)
// and the CSS variable --dir (1 = moving right, -1 = left).
import * as THREE from 'three';
import {
  TAU, clamp, smooth, lerp, backOut, pulse, OUTLINE, outlined, Hose, bendPoint, makeGlove, placeGlove, makeShoe,
  FACE0, moodFace as paintMood, drawFace, faceCanvas, lerpPose, wrapAngle, makeSun, placeSun, makeSteam, placeSteam,
  makeSparkles, placeSparkles, makeGlass, makeShadow, Stage,
} from './toon.js';
import { Cloud } from './cast/cloud.js';
import { Bottle } from './cast/bottle.js';
import { Fish } from './cast/fish.js';

const BODY_H = 1.5; // drop height
const BODY_W = 0.78; // profile width factor (max radius ≈ 0.6)
const LEG = 0.36; // body bottom height above the ground when standing
const PIVOT = 0.6; // spin/roll pivot height inside the body
const FACE_Y = 0.55; // face centre on the body
const FACE_S = 0.62; // face half-size (face units → body units)

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

// ---------- poses ----------

function basePose() {
  return {
    x: 0, y: 0, yaw: 0.15, roll: 0, pitch: 0, spin: 0,
    sq: 1, shearX: 0, shearZ: 0, tip: 0.28, tipF: 0, wob: 0.3, plump: 1, bulge: 0,
    h0: [-0.68, 0.2, 0.1], h1: [0.68, 0.2, 0.1], tw0: 0, tw1: 0,
    f0: [-0.2, 0, 0.04], f1: [0.2, 0, 0.04], fp0: 0, fp1: 0, fr0: 0, fr1: 0,
    glass: 0, glassLevel: 1, sun: 0, steam: 0, sparkle: 0, puddle: 0,
    face: { ...FACE0 },
  };
}

const moodFace = (P, mood) => paintMood(P.face, mood);

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
  for (const s of ['drinking', 'burp', 'dance', 'pose', 'tada', 'skip', 'cartwheel', 'moonwalk', 'crawl', 'dash', 'skid',
    'tantrum', 'melt', 'walking', 'lookback', 'waving', 'hello', 'idle']) if (has(s)) return s;
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
    case 'crawl': {
      // too parched to walk: drags itself in on its belly, one glove reaching ahead for water
      const cyc = 0.9, k = Math.floor(t / cyc) % 2, u = (t / cyc) % 1;
      const reach = Math.sin(u * Math.PI);
      P.yaw = dir * 0.7;
      P.pitch = 0.5;
      P.y = -0.26 + 0.03 * reach;
      P.roll = 0.05 * (k ? 1 : -1) * reach;
      // hands are placed in ground space ahead of the body, then mapped into the tilted body
      const py = LEG + PIVOT + P.y, c = Math.cos(P.pitch), s = Math.sin(P.pitch);
      const toBody = (x, wy, wz) => [x, PIVOT + (wy - py) * c + wz * s, -(wy - py) * s + wz * c];
      P[`h${k}`] = toBody(k ? 0.38 : -0.38, 0.08 + 0.38 * reach, lerp(0.3, 0.95, u));
      P[`h${1 - k}`] = toBody(k ? -0.38 : 0.38, 0.05, lerp(0.95, 0.3, u));
      P.f0 = [-0.2, 0.12, -0.62 + 0.06 * (k ? reach : -reach)];
      P.f1 = [0.2, 0.12, -0.62 - 0.06 * (k ? reach : -reach)];
      P.fp0 = P.fp1 = 1.1;
      P.tipF = 0.45;
      P.tip = 0.1;
      Object.assign(f, { pupY: 0.7, pupX: -dir * 0.5, eyeOpen: 0.55, mouthOpen: 0.4 + 0.15 * Math.sin(T * 9), tongue: 1, browTilt: 0.8, smile: -0.1 });
      break;
    }
    case 'dash': {
      // late for the reminder: sprints in, leaning into it, arms pumping
      const ph = walkCycle(P, t, { speed: 6, yaw: dir * 1.15, stride: 0.75, lift: 0.26, bob: 0.1 });
      P.pitch = 0.3;
      const sw = Math.cos(ph * TAU);
      P.h0 = [-0.6, 0.5 + 0.25 * sw, 0.45 * sw];
      P.h1 = [0.6, 0.5 - 0.25 * sw, -0.45 * sw];
      P.tipF = -0.55; // streams back in the wind
      P.tip = 0;
      Object.assign(f, { mouthOpen: 0.6, tongue: 0.7, browTilt: -0.5, sweat: 1, pupX: dir * 0.4 });
      break;
    }
    case 'skid': {
      // brakes! leans back on one heel with arms windmilling, then wobbles upright
      const brake = smooth(0, 0.1, t), up = smooth(0.45, 0.75, t);
      P.yaw = dir * lerp(1.15, 0.35, smooth(0.25, 0.7, t));
      P.pitch = -0.38 * brake * (1 - up) + 0.12 * pulse(t, 0.78, 0.08);
      P.y = -0.1 * brake * (1 - up);
      P.f0 = [-0.2, 0, lerp(-0.12, 0.04, up)];
      P.f1 = [0.2, 0, lerp(0.38, 0.04, up)];
      P.fp1 = -0.55 * (1 - up); // toe up, riding the heel
      const a = t * 18, spin = 1 - up;
      P.h0 = [-0.72, lerp(0.2, 0.85 + 0.4 * Math.sin(a), spin), lerp(0.1, 0.4 * Math.cos(a), spin)];
      P.h1 = [0.72, lerp(0.2, 0.85 - 0.4 * Math.sin(a), spin), lerp(0.1, -0.4 * Math.cos(a), spin)];
      P.tipF = 0.5 * brake * (1 - up) - 0.2 * pulse(t, 0.8, 0.08);
      Object.assign(f, { mouthO: up < 0.5 ? 1 : 0, mouthOpen: 0.8, pupS: 0.7, browY: 1.3, eyeOpen: 1, sweat: 1, tongue: 0 });
      break;
    }
    case 'cartwheel': {
      // cartwheels away: hands and feet take turns on the ground
      const r = -dir * (t / 1.1) * TAU, c = Math.cos(r), s = Math.sin(r);
      P.roll = r;
      P.yaw = 0;
      P.h0 = [-0.62, 1.38, 0.05];
      P.h1 = [0.62, 1.38, 0.05];
      // limb ends around the pivot: the lowest one touches the ground
      const ends = [[-0.62, 0.78], [0.62, 0.78], [-0.42, -0.92], [0.42, -0.92]];
      const py = 0.02 - Math.min(...ends.map(([x, y]) => x * s + y * c));
      P.y = py - (LEG + PIVOT);
      for (const k of [0, 1]) {
        const [x, y] = ends[2 + k];
        P[`f${k}`] = [x * c - y * s, py + x * s + y * c, 0.04];
        P[`fr${k}`] = r;
      }
      P.tip = 0.2;
      P.sparkle = 1;
      Object.assign(f, { joy: 1, mouthOpen: 0.8, teeth: 0.6, browY: 1 });
      break;
    }
    case 'moonwalk': {
      // glides backwards: one foot flat and sliding, the other up on its toes, swapping every step
      const h = 0.3, s = 0.5, k = Math.floor(t / h) % 2, u = (t % h) / h;
      P.yaw = -dir * 0.75; // faces away from where it's going
      const toe = smooth(0, 0.2, u);
      for (const [n, z, up] of [[k, -s / 2 + u * s, toe], [1 - k, s / 2 - u * s, 1 - toe]]) {
        P[`f${n}`] = [n ? 0.19 : -0.19, 0.07 * up, z];
        P[`fp${n}`] = 0.55 * up;
      }
      P.y = 0.025 * Math.sin(u * Math.PI);
      P.roll = 0.04 * (k ? 1 : -1);
      const bob = Math.sin((t / h) * Math.PI);
      P.h0 = [-0.62, 0.32 + 0.06 * bob, 0.2];
      P.h1 = [0.88, 1.0 + 0.05 * bob, -0.1]; // the other glove snaps to the beat
      P.tw1 = 0.4 * bob;
      P.tip = 0.25 + 0.1 * bob;
      P.sparkle = 1;
      lookUser(P.yaw);
      Object.assign(f, { eyeOpen: 0.55, smile: 1, mouthOpen: 0.15, browY: 0.3, browTilt: -0.25 });
      break;
    }
    case 'tada': {
      // ta-da! jazz hands with a heel kicked up behind
      const crouch = smooth(0, 0.12, t) * (1 - smooth(0.12, 0.25, t));
      const pop = backOut(clamp((t - 0.15) / 0.35));
      P.y = -0.08 * crouch + 0.05 * pop;
      P.sq = 1 - 0.15 * crouch + 0.05 * pop;
      P.h0 = [lerp(-0.68, -1.05, pop), lerp(0.2, 1.25, pop), 0.3];
      P.h1 = [lerp(0.68, 1.05, pop), lerp(0.2, 1.25, pop), 0.3];
      P.tw0 = P.tw1 = 0.6 * Math.sin(t * 40) * pop; // shimmy
      P.f0 = [-0.18, 0, 0.06];
      P.f1 = [0.26, 0.3 * pop, -0.28 * pop];
      P.fp1 = 0.9 * pop;
      P.roll = 0.12 * pop;
      P.yaw = 0.1;
      P.tip = 0.1;
      P.plump = 1.05;
      P.sparkle = 1;
      Object.assign(f, { mouthOpen: 0.9, teeth: 0.8, smile: 1, browY: 1.2, pupS: 1.1, shine: 1 });
      break;
    }
    case 'burp': {
      // drank too fast: cheeks puff up… BURP… "excuse me!"
      const hold = smooth(0, 0.35, t) * (1 - smooth(0.85, 0.92, t));
      const b = pulse(t, 0.97, 0.12);
      const after = smooth(1.1, 1.4, t);
      P.plump = 1.04 + 0.06 * hold + 0.04 * b;
      P.sq = 1 + 0.05 * hold - 0.12 * pulse(t, 0.9, 0.04) + 0.1 * b;
      P.y = 0.1 * b;
      P.tip = 0.2 + 0.5 * b;
      P.wob = 0.5 + 2 * b;
      P.yaw = lerp(0, 0.35, after); // turns away, embarrassed
      P.h0 = [-0.35, 0.24, 0.62];
      P.h1 = [lerp(0.35, 0.1, after), lerp(0.24, 0.38, after), lerp(0.62, 0.72, after)]; // covers its mouth
      P.sparkle = 1;
      Object.assign(f, {
        cheek: 0.75 + 0.5 * Math.max(hold, after), smile: lerp(0.1, 0.6, after), mouthW: hold > 0.5 ? 0.12 : 0.22,
        mouthO: b > 0.3 ? 1 : 0, mouthOpen: b > 0.3 ? 1 : 0, eyeOpen: b > 0.3 ? 0.35 : 1, pupS: 1 + 0.2 * hold,
        pupX: lerp(0, -0.8, after), browTilt: 0.6 * after, browY: 0.6 * b, shine: 1, tongue: 0, teeth: 0, joy: 0,
      });
      break;
    }
    case 'tantrum': {
      // FINE! stomping, fists pumping, steaming mad (and drying out all the faster)
      const beat = 0.26, k = Math.floor(t / beat) % 2, u = (t % beat) / beat;
      const lift = Math.sin(clamp(u / 0.72) * Math.PI);
      const slam = pulse(u, 0.74, 0.06);
      P[`f${k}`] = [k ? 0.24 : -0.24, 0.22 * lift, 0.08];
      P[`f${1 - k}`] = [k ? -0.22 : 0.22, 0, 0.04];
      P.y = -0.05 * slam;
      P.sq = 1 - 0.12 * slam;
      P.x = 0.03 * Math.sin(T * 60) * slam;
      P.roll = 0.1 * (k ? -1 : 1) * lift;
      P.h0 = [-0.72, 0.4 + 0.55 * lift, 0.3];
      P.h1 = [0.72, 0.4 + 0.55 * lift, 0.3];
      P.tw0 = P.tw1 = 0.4 * lift;
      P.tip = 0.35 * (k ? 1 : -1) * lift;
      P.yaw = 0.05;
      P.sun = 1;
      P.steam = 1;
      Object.assign(f, { browTilt: -1, eyeOpen: 0.7, mouthOpen: 0.75 + 0.25 * lift, mouthW: 0.3, teeth: 1, smile: -0.5, cheek: 1, tears: 0, wobble: 0, pupS: 0.8, pupX: 0, pupY: 0 });
      break;
    }
    case 'melt': {
      // no water left to hold its shape: sits down in a puddle and melts
      const sit = smooth(0, 0.5, t), m = smooth(0.6, 3.0, t);
      P.y = -0.3 * sit - 0.02 * m;
      P.sq = lerp(1, 0.56, m) * (1 - 0.06 * sit);
      P.plump = lerp(1, 1.22, m);
      P.tip = 0.3 + 0.8 * m;
      P.shearX = 0.05 * Math.sin(T * 2) * m;
      P.wob = 0.3 + 0.9 * m;
      P.yaw = 0;
      P.f0 = [-0.3, 0, lerp(0.04, 0.42, sit)];
      P.f1 = [0.3, 0, lerp(0.04, 0.42, sit)];
      P.fp0 = P.fp1 = -0.6 * sit;
      P.h0 = [-lerp(0.68, 0.95, m), lerp(0.2, 0.03, sit), 0.25];
      P.h1 = [lerp(0.68, 0.95, m), lerp(0.2, 0.03, sit), 0.25];
      P.puddle = smooth(0.4, 2.8, t);
      P.sun = 1;
      P.steam = 1;
      Object.assign(f, { eyeOpen: lerp(0.7, 0.35, m), tears: 0.8, wobble: 1, smile: -0.9, pupY: -0.5, browTilt: 1 });
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
        // thirsty idle: pant and fan, wipe the forehead, point at the low water level, then wait impatiently
        const c = t % 8.5;
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
        } else if (c >= 6) {
          // arms crossed, side-eye, tapping a foot
          const arms = smooth(6, 6.3, c);
          P.h0 = [lerp(-0.68, 0.24, arms), lerp(0.2, 0.16, arms), lerp(0.1, 0.62, arms)];
          P.h1 = [lerp(0.68, -0.24, arms), lerp(0.2, 0.22, arms), lerp(0.1, 0.66, arms)];
          P.f1 = [0.22, 0, 0.06];
          P.fp1 = -0.35 * Math.max(0, Math.sin(t * TAU * 3));
          P.yaw = 0.05;
          Object.assign(f, { pupX: -0.75, eyeOpen: 0.6, browTilt: -0.4, smile: -0.3, mouthOpen: 0, mouthW: 0.15, tongue: 0 });
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

class Droppy extends Stage {
  build() {
    this.look = null;
    this.out = basePose();
    this.hyd = { level: 0.35, dry: 0.5 };
    this.tip = { a: 0.3, v: 0 };
    this.jig = { x: 0, v: 0, lastY: 0, lastV: 0 };

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

    this.face = faceCanvas(512);
    this.faceTex = this.face.tex;
    const { m, u } = bodyMaterial(this.faceTex);
    this.bodyU = u;
    body.add(outlined(geo, m, 0.02));

    // limbs
    const limbMat = new THREE.MeshPhysicalMaterial({ color: '#0d3f70', roughness: 0.3, clearcoat: 0.6 });
    this.arms = [new Hose(0.045, limbMat), new Hose(0.045, limbMat)];
    this.legs = [new Hose(0.05, limbMat), new Hose(0.05, limbMat)];
    for (const a of this.arms) body.add(a.obj);
    for (const l of this.legs) rig.add(l.obj);

    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    this.gloves = [0, 1].map((k) => {
      const g = makeGlove(white, k);
      body.add(g);
      return g;
    });

    const red = new THREE.MeshPhysicalMaterial({ color: '#ef3b3b', roughness: 0.35, clearcoat: 0.5 });
    this.shoeMat = red;
    this.shoes = [0, 1].map(() => {
      const g = makeShoe(red, white);
      rig.add(g);
      return g;
    });

    this.buildGlass();
    this.buildSun();
    this.buildFx();

    this.shadow = makeShadow();
    this.scene.add(this.shadow);

    // what's left after melting
    const puddle = (this.puddle = new THREE.Group());
    const water = new THREE.MeshPhysicalMaterial({ color: '#3fb4ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), water);
    const rimDisc = new THREE.Mesh(new THREE.CircleGeometry(0.66, 48), new THREE.MeshBasicMaterial({ color: OUTLINE }));
    rimDisc.position.z = -0.002;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    glint.scale.set(1.8, 0.6, 1);
    glint.position.set(-0.25, 0.22, 0.002);
    puddle.add(rimDisc, disc, glint);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, 0.006, 0.12);
    puddle.visible = false;
    this.scene.add(puddle);
  }

  buildGlass() {
    const { group: g, waterPivot, H } = makeGlass();
    this.glass = g;
    this.waterPivot = waterPivot;
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
    g.add(straw);
    g.position.copy(this.glassAt);
    this.body.add(g);
  }

  buildSun() {
    this.sun = makeSun();
    this.scene.add(this.sun.group);
  }

  buildFx() {
    this.steam = makeSteam(this.scene);
    this.sparkles = makeSparkles(this.scene);
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

  step(dt) {
    this.T += dt;
    const T = this.T;
    const cls = this.container.className;
    if (cls !== this.cls) {
      this.cls = cls;
      this.t0 = T;
      this.from = { ...this.out, face: { ...this.out.face } };
      this.from.spin = 0;
      this.from.roll = wrapAngle(this.out.roll);
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
    drawFace(this.face.ctx, this.face.canvas.width, P.face, T, this.look?.photo ? this.photoImg : null);
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
      placeGlove(this.gloves[k], hand, elbow, P[`tw${k}`], k);
    }

    // legs: hip under the body (world → rig space) → shoe on the ground
    const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(body.matrixWorld);
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const hip = def(s * 0.19, 0.07, 0, new THREE.Vector3()).applyMatrix4(toRig);
      const foot = new THREE.Vector3(...P[`f${k}`]);
      const fr = P[`fr${k}`]; // foot roll, e.g. upside down mid-cartwheel
      const ankle = foot.clone().add(new THREE.Vector3(-0.08 * Math.sin(fr), 0.08 * Math.cos(fr), 0));
      const knee = bendPoint(hip, ankle, 0.46, new THREE.Vector3(s * 0.25, 0, 1));
      this.legs[k].update(hip, knee, ankle);
      const sh = this.shoes[k];
      sh.position.copy(foot);
      sh.rotation.set(P[`fp${k}`], s * 0.12, fr);
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
    this.puddle.visible = P.puddle > 0.01;
    this.puddle.scale.set(2.1 * P.puddle, 1.2 * P.puddle, 1);
    this.puddle.position.x = P.x;

    // sun + steam + sparkles live in screen-aligned scene space
    placeSun(this.sun, P.sun, dir, T);
    placeSteam(this.steam, def(0, BODY_H, 0, new THREE.Vector3()).applyMatrix4(body.matrixWorld), P.steam, T);
    placeSparkles(this.sparkles, new THREE.Vector3(0, 0.6, 0).applyMatrix4(body.matrixWorld), P.sparkle, T);
  }
}

// ---------- the cast ----------

const CAST = { droppy: Droppy, cloud: Cloud, bottle: Bottle, fish: Fish };

// What each character can do, for the Settings preview buttons: [classes, emoji, title].
const MOVES = {
  droppy: [
    ['walking', '🚶', 'Walk'], ['crawl', '🏜️', 'Desert crawl'], ['dash', '💨', 'Dash'], ['waving', '👋', 'Wave'],
    ['happy drinking', '🥤', 'Drink'], ['happy burp', '🫧', 'Burp'], ['happy dance', '🕺', 'Splash dance'],
    ['happy dance hop', '🎶', 'Side hops'], ['happy pose', '💪', 'Flex'], ['happy tada', '🙌', 'Ta-da!'],
    ['happy cartwheel', '🤸', 'Cartwheel'], ['happy moonwalk', '🌙', 'Moonwalk'], ['sad', '😢', 'Sad'],
    ['sad tantrum', '😤', 'Tantrum'], ['sad melt', '🫠', 'Melt'],
  ],
  cloud: Cloud.moves,
  bottle: Bottle.moves,
  fish: Fish.moves,
};

// settings.cast picks the character (default Droppy); a different one replaces the old scene.
function render(container, settings, opts) {
  const kind = CAST[settings.cast] ? settings.cast : 'droppy';
  if (container._buddy && container._kind !== kind) {
    container._buddy.dispose();
    container._buddy = null;
  }
  if (!container._buddy) {
    container._buddy = new CAST[kind](container, opts);
    container._kind = kind;
  }
  container._buddy.setLook(settings);
  return container._buddy.ready;
}

window.Buddy = { render, moves: (kind) => MOVES[kind] || MOVES.droppy };
export { render };
