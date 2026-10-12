// Glug — a sports water bottle with gloved arms and a blue flip cap. Arrives nearly empty (rolling in
// dizzy, or bouncing), unscrews its own cap to get a refill poured in, shakes itself up until the cap
// pops off in a fountain, then does bottle flips and rockets away on a water jet. Skip the water and
// it drains, crumples, tips over and rolls off.
//
// The water level is computed in world space, so it stays flat however the bottle tilts, flips or rolls.
//
// Classes: bounce, roll, popup, hello, waving, idle, refill, shake, flip, pose, rocket, crumple,
// tipover + mood happy/sad.
import * as THREE from 'three';
import {
  TAU, clamp, smooth, lerp, backOut, pulse, hash, outlined, Hose, bendPoint, makeGlove, placeGlove, FACE0, moodFace,
  faceCanvas, faceDecal, makeSun, placeSun, makeSteam, placeSteam, makeSparkles, placeSparkles, makeShadow, dropTexture,
  sprites, Stage,
} from '../toon.js';

const PIVOT_H = 0.65; // tumble pivot (bottle mid-height) when standing
const LIE_H = 0.38; // pivot height lying on its side
const R = 0.36; // bottle radius
const H_IN = 0.95; // height the water can fill to
const NECK = 1.14; // top of the neck (the cap sits on it)
const SHOULDER_Y = 0.62;
const FACE_Y = 0.5, FACE_H = 0.8, FACE_W = 1.1;

// bottom → neck, with a gentle grip waist
function profile() {
  const pts = [[0.001, 0], [0.26, 0], [0.33, 0.025], [0.355, 0.07]];
  for (let i = 0; i <= 12; i++) {
    const y = 0.08 + (i / 12) * 0.7;
    pts.push([R - 0.012 * Math.sin((Math.PI * (y - 0.08)) / 0.7), y]);
  }
  pts.push([0.345, 0.84], [0.31, 0.92], [0.25, 0.99], [0.18, 1.04], [0.155, 1.07], [0.15, NECK]);
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

function bottleMaterial() {
  const u = {
    uLevel: { value: 0.15 },
    uTime: { value: 0 },
    uSlosh: { value: 0 },
    uWater: { value: new THREE.Color('#38b6ff') },
    uDeep: { value: new THREE.Color('#0f6fd0') },
    uEmpty: { value: new THREE.Color('#dff2fb') },
  };
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uLevel, uTime, uSlosh;
        uniform vec3 uWater, uDeep, uEmpty;
        varying vec3 vWorld;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lvl = uLevel + uSlosh * (0.035 * sin(vWorld.x * 9.0 + uTime * 9.0) + 0.02 * sin(vWorld.z * 13.0 - uTime * 7.0));
        float filled = smoothstep(lvl + 0.008, lvl - 0.008, vWorld.y);
        vec3 water = mix(uDeep, uWater, smoothstep(lvl - 0.7, lvl, vWorld.y));
        vec2 bc = vec2(vWorld.x * 14.0, vWorld.y * 14.0 - uTime * 1.5);
        vec2 f = fract(bc) - 0.5;
        float rnd = fract(sin(dot(floor(bc), vec2(12.9898, 78.233))) * 43758.5453);
        water += step(0.8, rnd) * smoothstep(0.2, 0.14, length(f)) * 0.3;
        vec3 col = mix(uEmpty, water, filled);
        col += vec3(0.7) * smoothstep(0.014, 0.0, abs(vWorld.y - lvl)) * (1.0 - filled * 0.0);
        diffuseColor.rgb = col;`
      );
  };
  return { m, u };
}

function basePose() {
  return {
    x: 0, y: 0, yaw: 0.15, roll: 0, pitch: 0, spin: 0, lie: 0, sq: 1,
    h0: [-0.6, 0.3, 0.12], h1: [0.6, 0.3, 0.12], tw0: 0, tw1: 0,
    capOff: 0, capSpin: 0, capFly: 0, pour: 0, spray: 0, jet: 0, slosh: 0.2,
    sun: 0, steam: 0, sparkle: 0,
    face: { ...FACE0 },
  };
}

export class Bottle extends Stage {
  static moves = [
    ['bounce', '🦘', 'Bounce in'], ['roll', '🌀', 'Roll in'], ['popup', '⤴️', 'Pop up'], ['waving', '👋', 'Wave'],
    ['idle', '🥵', 'Thirsty'], ['happy refill', '🚰', 'Refill'], ['happy shake', '🍾', 'Shake + fountain'],
    ['happy flip', '🔄', 'Bottle flips'], ['happy pose', '👍', 'Thumbs up'], ['happy rocket', '🚀', 'Rocket off'],
    ['sad', '😢', 'Sad'], ['sad crumple', '😖', 'Crumple'], ['sad tipover', '🫨', 'Tip over'], ['sad roll', '🥀', 'Roll away'],
  ];

  build() {
    this.states = ['refill', 'shake', 'flip', 'pose', 'rocket', 'crumple', 'tipover', 'roll', 'bounce', 'popup', 'waving', 'hello', 'idle'];
    this.angles = ['roll', 'spin'];
    this.out = basePose();
    this.hyd = { fill: 0.15, crumple: 0 };
    this.crumpled = -1;

    const rig = (this.rig = new THREE.Group());
    this.scene.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);
    const tilt = (this.tilt = new THREE.Group());
    pivot.add(tilt);
    const body = (this.body = new THREE.Group());
    body.position.y = -PIVOT_H;
    tilt.add(body);

    const geo = (this.shellGeo = new THREE.LatheGeometry(profile(), 64));
    this.rest = Float32Array.from(geo.attributes.position.array);
    const { m, u } = bottleMaterial();
    this.u = u;
    body.add(outlined(geo, m, 0.02));

    this.face = faceCanvas(512);
    const decal = (this.decal = faceDecal(new THREE.CylinderGeometry(R + 0.008, R + 0.008, FACE_H, 40, 1, true, -FACE_W, 2 * FACE_W), this.face.tex));
    decal.position.y = FACE_Y;
    body.add(decal);

    // sports cap: blue screw cap, white neck ring and nozzle
    const blue = new THREE.MeshPhysicalMaterial({ color: '#2b7bff', roughness: 0.3, clearcoat: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    const cap = (this.cap = new THREE.Group());
    const lid = outlined(new THREE.CylinderGeometry(0.165, 0.17, 0.15, 32), blue, 0.016);
    lid.position.y = 0.075;
    const nozzle = outlined(new THREE.CylinderGeometry(0.05, 0.065, 0.08, 20), white, 0.012);
    nozzle.position.y = 0.19;
    cap.add(lid, nozzle);
    body.add(cap);
    const ring = outlined(new THREE.TorusGeometry(0.16, 0.022, 10, 28), white, 0.01);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.07;
    body.add((this.ring = ring));

    this.arms = [new Hose(0.042, blue), new Hose(0.042, blue)];
    for (const a of this.arms) body.add(a.obj);
    this.gloves = [0, 1].map((k) => {
      const g = makeGlove(white, k);
      body.add(g);
      return g;
    });

    // the refill stream from above
    this.stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 1, 14, 1, true),
      new THREE.MeshPhysicalMaterial({ color: '#46bcff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 })
    );
    this.stream.visible = false;
    this.scene.add(this.stream);
    this.drops = sprites(this.scene, dropTexture('#5cc8ff'), 18);

    this.sun = makeSun();
    this.scene.add(this.sun.group);
    this.steam = makeSteam(this.scene);
    this.sparkles = makeSparkles(this.scene);
    this.shadow = makeShadow();
    this.scene.add(this.shadow);
  }

  target(state, mood, t, T, dir) {
    const P = basePose();
    const f = P.face;
    moodFace(f, mood);
    const lookUser = () => (f.pupX = clamp(-Math.sin(P.yaw) * 1.4, -1, 1));
    const dizzy = (k) => Object.assign(f, { pupX: 0.8 * Math.sin(T * 9) * k, pupY: 0.8 * Math.cos(T * 9) * k, eyeOpen: 1 - 0.3 * k, wobble: k, mouthOpen: 0.4 * k, tongue: 0.6 * k });

    switch (state) {
      case 'bounce': {
        // hops in on its own bottom, sloshing the little water it has
        const u = (t / 0.45) % 1;
        const crouch = smooth(0, 0.12, u) * (1 - smooth(0.12, 0.2, u));
        const air = Math.sin(clamp((u - 0.15) / 0.7) * Math.PI);
        const land = pulse(u, 0.9, 0.05);
        P.y = 0.32 * air;
        P.sq = 1 - 0.2 * crouch + 0.1 * air - 0.18 * land;
        P.roll = -dir * 0.12 * air;
        P.yaw = dir * 0.4;
        P.h0 = [-0.66, 0.35 + 0.4 * air, 0.1];
        P.h1 = [0.66, 0.35 + 0.4 * air, 0.1];
        P.slosh = 1;
        lookUser();
        Object.assign(f, { mouthOpen: 0.45 + 0.15 * Math.sin(T * 14), tongue: 0.8 });
        break;
      }
      case 'roll': {
        // lying on its side, rolling (dizzily in, or sadly away)
        P.lie = 1;
        P.yaw = 1.0;
        P.roll = -dir * t * (mood === 'sad' ? 1.5 : 2.6) / LIE_H;
        P.h0 = [-0.6, 0.55 + 0.15 * Math.sin(T * 7), 0.15];
        P.h1 = [0.6, 0.55 + 0.15 * Math.cos(T * 7), 0.15];
        P.slosh = 1;
        dizzy(1);
        if (mood === 'sad') Object.assign(f, { smile: -0.8, tears: 0.8, browTilt: 1 });
        break;
      }
      case 'popup': {
        // springs upright, then shakes the dizziness off
        const up = backOut(clamp((t - 0.05) / 0.35));
        P.lie = 1 - up;
        P.y = 0.2 * Math.sin(clamp((t - 0.05) / 0.35) * Math.PI);
        const shake = smooth(0.4, 0.5, t) * (1 - smooth(0.85, 1.0, t));
        P.yaw = 0.4 * Math.sin(t * 26) * shake;
        P.h0 = [-0.7, 0.3 + 0.5 * pulse(t, 0.25, 0.1), 0.1];
        P.h1 = [0.7, 0.3 + 0.5 * pulse(t, 0.25, 0.1), 0.1];
        P.sparkle = 1 - smooth(0.6, 1, t);
        P.slosh = 1;
        dizzy(1 - smooth(0.7, 1.0, t));
        break;
      }
      case 'hello': {
        const crouch = smooth(0, 0.1, t) * (1 - smooth(0.1, 0.16, t));
        const air = Math.sin(clamp((t - 0.12) / 0.3) * Math.PI);
        P.y = 0.28 * air;
        P.sq = 1 - 0.18 * crouch + 0.1 * air - 0.15 * pulse(t, 0.44, 0.04);
        P.h0 = [-0.72, 0.3 + 0.8 * air, 0.1];
        P.h1 = [0.72, 0.3 + 0.8 * air, 0.1];
        P.yaw = 0;
        P.slosh = 1;
        Object.assign(f, { mouthOpen: 0.75, tongue: 0.2, pupS: 1.15, browY: 1 });
        break;
      }
      case 'waving': {
        const w = Math.sin(t * TAU * 2.6);
        P.h1 = [0.66 + 0.12 * w, 1.15, 0.25];
        P.tw1 = 0.5 * w;
        P.h0 = [-0.5, 0.42, 0.22];
        P.roll = -0.04 + 0.03 * w;
        P.yaw = 0.2;
        lookUser();
        const talk = 1 - smooth(1.6, 2.0, t);
        Object.assign(f, { browY: 0.8, smile: 0.7, tongue: 0.25 * (1 - talk), mouthOpen: lerp(0.3, 0.2 + 0.45 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)), talk) });
        break;
      }
      case 'refill': {
        // unscrews the cap, holds it aside while water pours in from above, screws it back on
        const grab = smooth(0, 0.15, t) * (1 - smooth(2.6, 2.8, t));
        const aside = smooth(0.35, 0.6, t) * (1 - smooth(2.15, 2.4, t));
        const top = [0.05, NECK + 0.12, 0.12], hold = [0.62, 1.0, 0.3];
        const h = basePose().h1.map((v, i) => lerp(lerp(v, top[i], grab), hold[i], aside));
        P.h1 = h;
        P.h0 = [-0.44, 0.5, 0.12];
        P.capOff = aside;
        P.capSpin = TAU * 1.5 * (smooth(0.05, 0.35, t) - smooth(2.4, 2.7, t));
        P.pour = smooth(0.55, 0.7, t) * (1 - smooth(2.0, 2.15, t));
        P.slosh = 0.3 + 0.7 * P.pour;
        P.yaw = 0;
        P.sq = 1 + 0.1 * pulse(t, 2.65, 0.08);
        Object.assign(f, {
          pupY: P.pour > 0.5 ? 1 : 0.3, mouthO: t < 2.4 ? 1 : 0, mouthOpen: t < 2.4 ? 0.5 : 0.6, tongue: 0,
          sweat: 1 - smooth(0.6, 1.8, t), cheek: 0.3 + 0.5 * smooth(0.6, 2.2, t), browY: 1, smile: 0.8, browTilt: 0,
        });
        if (t > 2.45) P.sparkle = 1;
        break;
      }
      case 'shake': {
        // shakes itself up like a soda… until the cap pops off on a fountain and lands back on
        const amp = smooth(0, 1.4, t) * (1 - smooth(1.55, 1.65, t));
        P.roll = 0.32 * amp * Math.sin(t * 30);
        P.y = 0.05 * amp * Math.abs(Math.sin(t * 30));
        P.h0 = [-0.62, 0.85 + 0.1 * Math.sin(t * 30), 0.2];
        P.h1 = [0.62, 0.85 - 0.1 * Math.sin(t * 30), 0.2];
        P.slosh = 1 + amp;
        P.yaw = 0;
        const fly = clamp((t - 1.6) / 1.1);
        P.capFly = t > 1.6 && t < 2.7 ? Math.sin(fly * Math.PI) * 1.5 : 0;
        P.capSpin = t > 1.6 ? fly * TAU * 3 : 0;
        P.spray = smooth(1.6, 1.65, t) * (1 - smooth(2.5, 2.7, t));
        P.sq = 1 - 0.12 * pulse(t, 1.62, 0.05) + 0.08 * pulse(t, 2.72, 0.05);
        P.sparkle = t > 1.6 ? 1 : 0;
        if (t < 1.6) Object.assign(f, { joy: 1, teeth: 1, mouthOpen: 0.5, smile: 0.6, cheek: 0.9 });
        else Object.assign(f, { mouthOpen: 0.9, teeth: 0.6, pupS: 1.2, browY: 1.3, smile: 1, joy: t > 2.2 ? 1 : 0 });
        break;
      }
      case 'flip': {
        // bottle flips! the last one is a double — and it sticks the landing every time
        const i = Math.floor(t / 0.8) % 4, u = (t % 0.8) / 0.8;
        const crouch = smooth(0, 0.12, u) * (1 - smooth(0.12, 0.2, u));
        const air = Math.sin(clamp((u - 0.17) / 0.6) * Math.PI) * (u > 0.17 && u < 0.77 ? 1 : 0);
        const land = pulse(u, 0.82, 0.06);
        P.y = 1.0 * air;
        P.sq = 1 - 0.22 * crouch + 0.1 * air - 0.22 * land;
        P.roll = -[1, -1, -1, 1][i] * smooth(0.17, 0.77, u) * TAU * (i === 3 ? 2 : 1);
        P.h0 = [-0.45, 0.6 + 0.3 * air, 0.3];
        P.h1 = [0.45, 0.6 + 0.3 * air, 0.3];
        P.yaw = 0;
        P.slosh = 1.2;
        P.sparkle = 1;
        Object.assign(f, { joy: air > 0.3 ? 0 : 1, mouthOpen: 0.8, teeth: 0.6, pupS: 1.1, browY: 1 });
        break;
      }
      case 'pose': {
        // thumbs up
        const pop = backOut(clamp(t / 0.35));
        P.h1 = [lerp(0.6, 0.55, pop), lerp(0.3, 1.05, pop), lerp(0.12, 0.35, pop)];
        P.tw1 = -1.2 * pop;
        P.h0 = [-0.42, 0.5, 0.15];
        P.sq = 1.03;
        P.yaw = 0.1;
        P.sparkle = 1;
        Object.assign(f, { wink: smooth(0.2, 0.35, t), mouthOpen: 0.35, teeth: 1, smile: 1, browY: 0.6, browTilt: -0.3 });
        break;
      }
      case 'rocket': {
        // blasts off on a jet of water from its bottom
        P.roll = -dir * 0.45;
        P.y = 0.15 + 0.02 * Math.sin(T * 50);
        P.jet = 1;
        P.sq = 1.06;
        P.h0 = [-0.55, 0.2, -0.2];
        P.h1 = [0.55, 0.2, -0.2];
        P.slosh = 1;
        P.sparkle = 1;
        Object.assign(f, { joy: 1, mouthOpen: 0.9, teeth: 0.6, browY: 1.2 });
        break;
      }
      case 'crumple': {
        // squeezed flat by its own emptiness
        P.sun = 1;
        P.steam = 1;
        P.sq = 1 - 0.08 * pulse(t, 0.15, 0.1);
        P.h0 = [-0.5, 0.18, 0.25];
        P.h1 = [0.5, 0.18, 0.25];
        P.yaw = 0;
        Object.assign(f, { eyeOpen: t < 0.6 ? 0.15 : 0.6, browTilt: 1, smile: -0.9, mouthOpen: 0.3, teeth: t < 0.6 ? 1 : 0, wobble: 1, tears: smooth(0.5, 1, t) });
        break;
      }
      case 'tipover': {
        // …and topples over backwards with a hollow thunk
        const fall = clamp(t / 0.35) ** 2;
        P.lie = fall - 0.06 * pulse(t, 0.45, 0.05);
        P.roll = 0.8 * fall; // rolls onto its side so the face still shows
        P.yaw = 1.0;
        P.h0 = [-0.7, 0.3 + 0.5 * fall, 0.1];
        P.h1 = [0.7, 0.3 + 0.5 * fall, 0.1];
        P.sun = 1;
        P.steam = 0.6;
        P.slosh = 1;
        Object.assign(f, { mouthO: 1, mouthOpen: 0.7, pupS: 0.7, browY: 1.2, tears: 0.7, browTilt: 1 });
        break;
      }
      case 'idle':
      case 'stand': {
        if (mood === 'happy') {
          P.h0 = [-0.32, 0.36 + 0.04 * Math.sin(t * 7), 0.45];
          P.h1 = [0.32, 0.36 + 0.04 * Math.sin(t * 7 + 1), 0.45];
          P.roll = 0.06 * Math.sin(t * 2);
          P.yaw = 0;
          P.sparkle = 1;
          Object.assign(f, { joy: 1, mouthOpen: 0.55, smile: 0.7 });
        } else if (mood === 'sad') {
          // the sun comes out and the last drops evaporate
          P.sun = 1;
          P.steam = smooth(0.5, 1.2, t);
          P.pitch = 0.12 * smooth(0.6, 2, t);
          P.sq = 1 - 0.04 * smooth(0.6, 2.5, t);
          P.yaw = 0;
          const shock = 1 - smooth(0.6, 1.0, t);
          P.h0 = [-0.55, 0.15, 0.2];
          P.h1 = [0.5 + 0.05 * Math.sin(t * 10), lerp(0.3, 0.75, smooth(1.2, 1.6, t)), 0.4];
          P.tw1 = 0.6 * Math.sin(t * 10);
          Object.assign(f, {
            pupY: lerp(0.9, -0.5, smooth(0.9, 1.4, t)), mouthO: shock > 0.5 ? 1 : 0, mouthOpen: shock > 0.5 ? 0.8 : 0,
            tears: smooth(1.2, 2.2, t), eyeOpen: lerp(1, 0.65, 1 - shock), browTilt: lerp(0.2, 1, 1 - shock),
          });
        } else {
          // thirsty: pant and fan, rattle the last drops, knock on its hollow top, then slump
          const c = t % 9;
          P.sq = 1 + 0.02 * Math.sin(t * TAU * 2.4);
          lookUser();
          if (c < 2.5) {
            P.h1 = [0.42 + 0.08 * Math.sin(t * 22), 0.85, 0.45];
            P.tw1 = 0.7 * Math.sin(t * 22);
            Object.assign(f, { mouthOpen: 0.45 + 0.12 * Math.sin(t * 15), tongue: 0.9 });
          } else if (c < 4.5) {
            const w = smooth(2.6, 2.9, c) * (1 - smooth(4.2, 4.5, c));
            P.roll = 0.14 * w * Math.sin(t * 34);
            P.slosh = 0.3 + 1.5 * w;
            P.h0 = [-0.55, 0.75, 0.25];
            P.h1 = [0.55, 0.75, 0.25];
            Object.assign(f, { eyeOpen: 0.3, teeth: 1, mouthOpen: 0.35, smile: 0.2, browTilt: -0.3, tongue: 0 });
          } else if (c < 6.5) {
            const knock = Math.max(0, Math.sin((c - 4.5) * TAU * 2.5));
            P.h1 = [0.3, 0.86 + 0.06 * knock, 0.42 - 0.05 * knock];
            P.tw1 = -0.8;
            Object.assign(f, { pupX: 0.7, pupY: 0.6, eyeOpen: 0.9, browTilt: 0.6, smile: -0.2, mouthOpen: 0.15, tongue: 0, mouthO: 1 });
          } else {
            const s = smooth(6.5, 7, c);
            P.sq = 1 - 0.05 * s;
            P.pitch = 0.08 * s;
            P.roll = 0.06 * s;
            P.h0 = [-0.55, lerp(0.3, 0.12, s), 0.15];
            P.h1 = [0.55, lerp(0.3, 0.12, s), 0.15];
            Object.assign(f, { eyeOpen: 0.5, browTilt: 0.8, smile: -0.4, mouthOpen: 0.1, tongue: 0, pupY: -0.5 });
          }
        }
        break;
      }
    }
    return P;
  }

  pose(P, { t, T, dt, dir, mood, state }) {
    const h = this.hyd;
    const toward = (key, v, rate) => (h[key] += clamp(v - h[key], -rate * dt, rate * dt));
    if (state === 'refill') { if (t > 0.6) toward('fill', 1, 0.55); }
    else if (mood === 'happy') toward('fill', 1, 1.5);
    else if (mood === 'sad') toward('fill', 0.03, t > 0.6 ? 0.1 : 0);
    else toward('fill', 0.15, 1);
    const crushed = mood === 'sad' && ['crumple', 'tipover', 'roll'].includes(state);
    toward('crumple', crushed ? 1 : 0, crushed ? 1.8 : 3);

    const { rig, pivot, tilt, body } = this;
    const c = h.crumple, shrink = 1 - 0.28 * c;
    rig.position.set(P.x, 0, 0);
    rig.rotation.set(0, P.yaw + P.spin, 0);
    pivot.position.set(0, lerp(PIVOT_H, LIE_H, P.lie) + P.y, 0);
    pivot.rotation.set(P.pitch, 0, P.roll, 'YXZ');
    tilt.rotation.x = (-P.lie * Math.PI) / 2;
    const q = 1 / Math.sqrt(Math.max(0.5, P.sq));
    body.scale.set(q, P.sq, q);

    // crumpling: dents and creases pressed into the shell
    if (Math.abs(c - this.crumpled) > 0.002) {
      this.crumpled = c;
      const pos = this.shellGeo.attributes.position, a = pos.array, r = this.rest;
      for (let i = 0; i < a.length; i += 3) {
        const x = r[i], y = r[i + 1], z = r[i + 2];
        const phi = Math.atan2(x, z), hy = y / NECK;
        const dent = c * (0.09 + 0.08 * Math.sin(phi * 5 + y * 13) * Math.sin(y * 7 + 1)) * smooth(0.02, 0.15, hy) * (1 - smooth(0.85, 0.95, hy));
        a[i] = x * (1 - dent);
        a[i + 1] = y * shrink + c * 0.025 * Math.sin(phi * 3 + y * 9) * smooth(0.05, 0.2, hy);
        a[i + 2] = z * (1 - dent);
      }
      pos.needsUpdate = true;
      this.shellGeo.computeVertexNormals();
    }
    this.decal.position.y = FACE_Y * shrink;
    this.decal.scale.y = shrink;
    this.ring.position.y = 1.07 * shrink;

    // the cap: screwed on, in the right glove, or flying off the top
    const capRest = new THREE.Vector3(0, NECK * shrink + P.capFly, 0);
    const inHand = new THREE.Vector3(...P.h1).add(new THREE.Vector3(0, 0.1, 0.02));
    this.cap.position.lerpVectors(capRest, inHand, P.capOff);
    this.cap.rotation.set(P.capFly ? P.capSpin * 0.3 : 0, P.capSpin, 0);
    rig.updateMatrixWorld(true);

    // world-space water level from the bottle's current orientation
    const bot = body.localToWorld(new THREE.Vector3(0, 0, 0));
    const top = body.localToWorld(new THREE.Vector3(0, H_IN * shrink, 0));
    const ax = top.clone().sub(bot).normalize();
    const side = R * Math.sqrt(Math.max(0, 1 - ax.y * ax.y));
    const lo = Math.min(bot.y, top.y) - side, hi = Math.max(bot.y, top.y) + side;
    this.u.uLevel.value = lerp(lo, hi, h.fill);
    this.u.uTime.value = T;
    this.u.uSlosh.value = P.slosh;

    // arms
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const sh = new THREE.Vector3(s * (R - 0.02), SHOULDER_Y * shrink, 0);
      const hand = new THREE.Vector3(...P[`h${k}`]);
      const elbow = bendPoint(sh, hand, 0.55, new THREE.Vector3(s * 0.4, -1, -0.3));
      this.arms[k].update(sh, elbow, hand);
      placeGlove(this.gloves[k], hand, elbow, P[`tw${k}`], k);
    }

    // refill stream, falling from the top of the view into the open neck
    const neck = body.localToWorld(new THREE.Vector3(0, NECK * shrink, 0));
    const st = this.stream;
    st.visible = P.pour > 0.01;
    const sTop = 4.4, len = Math.max(0.01, (sTop - neck.y) * P.pour);
    st.position.set(neck.x, sTop - len / 2, neck.z);
    st.scale.set(1 + 0.15 * Math.sin(T * 30), len, 1 + 0.15 * Math.sin(T * 30));

    // droplets: fountain out of the neck, or a jet out of the bottom
    const base = body.localToWorld(new THREE.Vector3(0, -0.05, 0));
    const down = bot.clone().sub(top).normalize();
    this.drops.forEach((sp, i) => {
      const ph = (T * 1.6 + hash(i)) % 1;
      const sx = (hash(i + 5) - 0.5) * 2;
      if (P.spray > 0.01) {
        sp.visible = true;
        sp.position.set(neck.x + sx * 0.9 * ph, neck.y + 2.4 * ph - 2.6 * ph * ph, neck.z + 0.3);
        sp.material.opacity = P.spray * (1 - smooth(0.8, 1, ph));
      } else if (P.jet > 0.01) {
        sp.visible = true;
        sp.position.copy(base).addScaledVector(down, ph * 1.4).add(new THREE.Vector3(sx * 0.18 * ph, 0, 0.2));
        sp.material.opacity = P.jet * (1 - ph);
      } else if (P.pour > 0.01) {
        sp.visible = i < 6;
        sp.position.set(neck.x + sx * 0.25 * ph, neck.y + 0.25 * Math.sin(ph * Math.PI), neck.z + 0.2);
        sp.material.opacity = P.pour * (1 - ph);
      } else sp.visible = false;
      sp.scale.set(0.09, 0.13, 1);
    });

    const sc = 1 / (1 + Math.max(0, P.y) * 1.2);
    this.shadow.scale.set(sc * 0.8, sc * 0.8, 1);
    this.shadow.material.opacity = sc;
    this.shadow.position.x = P.x;
    placeSun(this.sun, P.sun, dir, T);
    placeSteam(this.steam, neck, P.steam, T);
    placeSparkles(this.sparkles, body.localToWorld(new THREE.Vector3(0, 0.6, 0)), P.sparkle, T);
  }
}
