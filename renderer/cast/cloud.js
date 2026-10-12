// Nimbus — a little rain cloud with puffy hands. A thirsty cloud is small and wispy (nothing left to
// rain), so it inhales the glass in a spiral and puffs up big, then rains on a flower bed and rides a
// rainbow. Skip the water and it turns into a grumpy grey storm cloud and drifts off drizzling.
//
// Classes: float, hello, waving, idle, drinking, rain, rainbow, zoom, storm, drift + mood happy/sad.
import * as THREE from 'three';
import {
  TAU, clamp, smooth, lerp, backOut, pulse, hash, outlined, Hose, bendPoint, FACE0, moodFace, faceCanvas, faceDecal,
  canvasTexture, makeGlass, makeShadow, makeSparkles, placeSparkles, dropTexture, sprites, Stage,
} from '../toon.js';

const CY = 1.45; // hover height of the cloud's centre
const BASE = 0.85; // body scale at fluff 1
// puffs: x, y, z, r (the big middle one carries the face)
const PUFFS = [
  [0, 0.05, 0, 0.5], [-0.45, -0.1, -0.05, 0.36], [0.47, -0.08, -0.05, 0.37], [-0.25, 0.32, -0.1, 0.33],
  [0.24, 0.36, -0.1, 0.34], [-0.72, -0.2, -0.1, 0.24], [0.74, -0.18, -0.1, 0.25], [0, -0.25, -0.18, 0.36],
];
const FACE_R = 0.51, FACE_W = 1.1; // decal radius and angular half-width
const SHOULDER = [0.6, -0.14, 0.08];
const GLASS_AT = [0, -0.95, 0.4]; // under the cloud, in front (pivot space)

function basePose() {
  return {
    x: 0, y: 0, yaw: 0, roll: 0, pitch: 0, spin: 0, sq: 1, sx: 1,
    h0: [-0.68, -0.2, 0.15], h1: [0.68, -0.2, 0.15],
    glass: 0, glassLevel: 1, trail: 0, rain: 0, rainbow: 0, bolt: 0, flowers: 0, sparkle: 0, drip: 0,
    face: { ...FACE0 },
  };
}

function boltTexture() {
  return canvasTexture(128, (ctx) => {
    ctx.beginPath();
    for (const [x, y] of [[70, 0], [34, 58], [60, 60], [30, 128], [96, 46], [68, 44], [96, 0]]) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = '#ffe14d';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#b07800';
    ctx.stroke();
  });
}

function rainbowTexture() {
  return canvasTexture(256, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    const bands = ['#8f5bff', '#3d7bff', '#2ec4ff', '#4fd36b', '#ffd23f', '#ff9a2e', '#ff4d5e'];
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.66, 'rgba(255,255,255,0)');
    bands.forEach((c, i) => {
      g.addColorStop(0.68 + (i / bands.length) * 0.3, c);
      g.addColorStop(0.68 + ((i + 0.9) / bands.length) * 0.3, c);
    });
    g.addColorStop(0.99, '#ff4d5e');
    g.addColorStop(1, 'rgba(255,77,94,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });
}

function makeFlower(petal, stemMat, centreMat) {
  const g = new THREE.Group();
  const stem = outlined(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 8), stemMat, 0.01);
  stem.position.y = 0.16;
  const leaf = outlined(new THREE.SphereGeometry(0.05, 12, 8), stemMat, 0.01);
  leaf.scale.set(1.4, 0.5, 0.7);
  leaf.position.set(0.05, 0.12, 0);
  leaf.rotation.z = 0.5;
  const head = new THREE.Group();
  head.position.y = 0.34;
  head.add(outlined(new THREE.SphereGeometry(0.045, 14, 10), centreMat, 0.01));
  for (let i = 0; i < 5; i++) {
    const p = outlined(new THREE.SphereGeometry(0.045, 12, 10), petal, 0.01);
    const a = (i / 5) * TAU;
    p.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.01);
    p.scale.set(1, 1, 0.5);
    head.add(p);
  }
  g.add(stem, leaf, head);
  g.userData.head = head;
  return g;
}

export class Cloud extends Stage {
  static moves = [
    ['float', '☁️', 'Float in'], ['waving', '👋', 'Wave'], ['idle', '🥵', 'Thirsty'], ['happy drinking', '🌀', 'Inhale the glass'],
    ['happy rain', '🌧️', 'Rain dance'], ['happy rainbow', '🌈', 'Rainbow'], ['happy zoom', '💨', 'Zoom off'],
    ['sad', '😢', 'Sad'], ['sad storm', '⛈️', 'Storm'], ['sad drift', '🌫️', 'Drift away'],
  ];

  build() {
    this.states = ['drinking', 'rain', 'rainbow', 'zoom', 'storm', 'drift', 'float', 'waving', 'hello', 'idle'];
    this.angles = ['roll', 'spin'];
    this.out = basePose();
    this.hyd = { fluff: 0.8, grey: 0 };

    const rig = (this.rig = new THREE.Group());
    this.scene.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);
    const body = (this.body = new THREE.Group());
    pivot.add(body);

    this.mat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.12 });
    this.white = new THREE.Color('#f4f8ff');
    this.storm = new THREE.Color('#7d8799');
    this.puffs = PUFFS.map(([x, y, z, r]) => {
      const p = outlined(new THREE.SphereGeometry(r, 32, 22), this.mat, 0.022);
      p.position.set(x, y, z);
      body.add(p);
      return p;
    });

    this.face = faceCanvas(512);
    const decal = faceDecal(new THREE.SphereGeometry(FACE_R, 40, 30, Math.PI / 2 - FACE_W, 2 * FACE_W, Math.PI / 2 - FACE_W, 2 * FACE_W), this.face.tex);
    decal.position.set(0, 0.05, 0);
    body.add(decal);

    // arms + puffy hands live in the unscaled pivot so they don't shrink with the cloud
    this.arms = [new Hose(0.035, this.mat), new Hose(0.035, this.mat)];
    for (const a of this.arms) pivot.add(a.obj);
    this.hands = [0, 1].map(() => {
      const h = outlined(new THREE.SphereGeometry(0.09, 18, 14), this.mat, 0.016);
      pivot.add(h);
      return h;
    });

    const glass = makeGlass(0.14, 0.34);
    this.glass = glass.group;
    this.waterPivot = glass.waterPivot;
    this.glass.position.set(...GLASS_AT);
    pivot.add(this.glass);

    // world-space effects
    const blue = dropTexture('#5cc8ff');
    this.rain = sprites(this.scene, blue, 18);
    this.trail = sprites(this.scene, blue, 12);
    this.drip = sprites(this.scene, blue, 1)[0];
    this.bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: boltTexture(), transparent: true, depthWrite: false }));
    this.bolt.scale.set(0.55, 1.1, 1);
    this.bolt.visible = false;
    this.scene.add(this.bolt);

    this.rainbow = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1.12, 64, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({ map: rainbowTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    this.rainbow.position.set(0, 0.02, -0.6);
    this.rainbow.visible = false;
    this.scene.add(this.rainbow);

    const stem = new THREE.MeshStandardMaterial({ color: '#3fae4a', roughness: 0.6 });
    const centre = new THREE.MeshStandardMaterial({ color: '#ffcf33', roughness: 0.5 });
    this.flowers = ['#ff6fa8', '#ff9a3c', '#a56bff', '#ff5a5a'].map((c, i) => {
      const fl = makeFlower(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), stem, centre);
      fl.position.set([-0.8, -0.3, 0.25, 0.75][i], 0, 0.35 + 0.1 * (i % 2));
      fl.visible = false;
      this.scene.add(fl);
      return fl;
    });

    this.sparkles = makeSparkles(this.scene);
    this.shadow = makeShadow();
    this.scene.add(this.shadow);
  }

  target(state, mood, t, T, dir) {
    const P = basePose();
    const f = P.face;
    moodFace(f, mood);
    const lookUser = () => (f.pupX = clamp(-Math.sin(P.yaw) * 1.4, -1, 1));
    P.y = 0.05 * Math.sin(T * 1.8);
    P.roll = 0.03 * Math.sin(T * 1.3);

    switch (state) {
      case 'float': {
        // drifting in, paddling the air with its little hands
        P.yaw = dir * 0.35;
        P.roll = -dir * 0.12 + 0.04 * Math.sin(T * 2.2);
        P.sx = 1.06;
        P.sq = 0.97;
        for (const k of [0, 1]) {
          const s = k ? 1 : -1, a = T * 5 + k * Math.PI;
          P[`h${k}`] = [s * (0.66 + 0.08 * Math.cos(a)), -0.22 + 0.12 * Math.sin(a), 0.1 + 0.1 * Math.cos(a)];
        }
        lookUser();
        Object.assign(f, { mouthOpen: 0.4 + 0.12 * Math.sin(T * 12), tongue: 0.7, pupX: dir * 0.5 });
        break;
      }
      case 'hello': {
        const crouch = smooth(0, 0.1, t) * (1 - smooth(0.1, 0.18, t));
        const air = Math.sin(clamp((t - 0.12) / 0.32) * Math.PI);
        P.y += 0.22 * air - 0.06 * crouch;
        P.sq = 1 - 0.14 * crouch + 0.1 * air - 0.12 * pulse(t, 0.46, 0.04);
        P.h0 = [-0.75, -0.2 + 0.75 * air, 0.15];
        P.h1 = [0.75, -0.2 + 0.75 * air, 0.15];
        Object.assign(f, { mouthOpen: 0.75, tongue: 0.2, pupS: 1.15, browY: 1 });
        break;
      }
      case 'waving': {
        const w = Math.sin(t * TAU * 2.6);
        P.h1 = [0.78 + 0.1 * w, 0.45, 0.25];
        P.h0 = [-0.66, -0.25, 0.2];
        P.roll = -0.05 + 0.03 * w;
        P.yaw = 0.15;
        lookUser();
        const talk = 1 - smooth(1.6, 2.0, t);
        Object.assign(f, { browY: 0.8, smile: 0.7, tongue: 0.25 * (1 - talk), mouthOpen: lerp(0.3, 0.2 + 0.45 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)), talk) });
        break;
      }
      case 'drinking': {
        // breathes the glass in: the water spirals up into its mouth and the cloud puffs up
        const inn = backOut(t / 0.35), out = smooth(2.5, 2.75, t);
        P.glass = inn * (1 - out);
        P.glassLevel = 1 - smooth(0.4, 2.4, t);
        P.trail = smooth(0.35, 0.5, t) * (1 - smooth(2.3, 2.45, t));
        const hold = 1 - out;
        P.h0 = [lerp(-0.68, -0.2, hold), lerp(-0.2, GLASS_AT[1] + 0.02, hold), lerp(0.15, GLASS_AT[2], hold)];
        P.h1 = [lerp(0.68, 0.2, hold), lerp(-0.2, GLASS_AT[1] + 0.02, hold), lerp(0.15, GLASS_AT[2], hold)];
        P.yaw = 0;
        P.sq = 1 + 0.04 * Math.sin(t * 9) * P.trail + 0.12 * pulse(t, 2.6, 0.08);
        P.pitch = 0.12 * P.trail;
        Object.assign(f, {
          mouthO: t < 2.5 ? 1 : 0, mouthOpen: t < 2.5 ? 0.6 + 0.2 * Math.sin(t * 9) : 0.6, tongue: 0,
          sweat: 1 - smooth(0.4, 1.8, t), cheek: 0.3 + 0.6 * smooth(0.5, 2.4, t), pupY: t < 2.5 ? -0.6 : 0,
          eyeOpen: t < 2.5 ? lerp(1, 0.5, smooth(0.5, 1.0, t)) : 1, browY: t < 2.5 ? 0.3 : 1.3, smile: 0.8, browTilt: 0,
        });
        if (t > 2.5) P.sparkle = 1;
        break;
      }
      case 'rain': {
        // happy rain dance: sways to the beat, rains on the flowers and makes them grow
        const b = t / 0.2;
        P.y += 0.18 + 0.05 * Math.abs(Math.sin(Math.PI * b));
        P.roll = 0.14 * Math.sin(Math.PI * b * 0.5);
        P.x = 0.12 * Math.sin(Math.PI * b * 0.25);
        P.sq = 1 - 0.05 * Math.cos(TAU * b);
        const a = Math.sin(Math.PI * b);
        P.h0 = [-0.72, 0.25 + 0.3 * a, 0.2];
        P.h1 = [0.72, 0.25 - 0.3 * a, 0.2];
        P.rain = smooth(0, 0.3, t);
        P.flowers = smooth(0.4, 3, t);
        P.sparkle = 0.6;
        Object.assign(f, { joy: (b % 1) < 0.5 ? 1 : 0, mouthOpen: 0.8, teeth: 0.6, pupX: 0.5 * Math.sin(Math.PI * b * 0.5), browY: 0.8 });
        break;
      }
      case 'rainbow': {
        // a rainbow pops out underneath; swoops on each hop and barrel-rolls on the 2nd and 4th
        const i = Math.floor(t / 0.8) % 4, u = (t % 0.8) / 0.8;
        P.rainbow = 1;
        P.flowers = 1;
        P.y += 0.22 + 0.25 * Math.sin(u * Math.PI);
        if (i % 2) P.roll = -smooth(0.1, 0.85, u) * TAU * (i === 1 ? 1 : -1);
        P.sq = 1 + 0.08 * Math.sin(u * Math.PI);
        P.h0 = [-0.85, 0.35, 0.15];
        P.h1 = [0.85, 0.35, 0.15];
        P.sparkle = 1;
        Object.assign(f, { joy: 1, mouthOpen: 0.85, teeth: 0.6, browY: 1 });
        break;
      }
      case 'zoom': {
        // streaks off up and away, stretched out by the speed
        P.yaw = dir * 0.5;
        P.roll = -dir * 0.3;
        P.sx = 1.3;
        P.sq = 0.85;
        P.h0 = [-0.8, 0.05, -0.2];
        P.h1 = [0.8, 0.05, -0.2];
        P.sparkle = 1;
        Object.assign(f, { joy: 1, mouthOpen: 0.7, teeth: 0.5, browY: 1 });
        break;
      }
      case 'storm': {
        // turns grey and grumbles: lightning cracks, it shakes with thunder, and drizzles its tears
        const c = t % 1.2, flash = c < 0.08 || (c > 0.16 && c < 0.22);
        P.bolt = flash && t > 0.3 ? 1 : 0;
        const shake = pulse(c, 0.1, 0.12) * smooth(0.2, 0.4, t);
        P.x = 0.04 * Math.sin(T * 70) * shake;
        P.sq = 0.96 - 0.06 * shake;
        P.rain = 0.6;
        P.h0 = [-0.62, 0.05 + 0.25 * shake, 0.3];
        P.h1 = [0.62, 0.05 + 0.25 * shake, 0.3];
        Object.assign(f, { browTilt: -0.8, eyeOpen: 0.65, smile: -0.6, mouthOpen: 0.3 + 0.4 * shake, teeth: 0.8, tears: 0.6, wobble: 0.5, cheek: 0.1 });
        break;
      }
      case 'drift': {
        P.yaw = dir * 0.4;
        P.roll = -dir * 0.06;
        P.y -= 0.12;
        P.sq = 0.94;
        P.rain = 0.35;
        P.h0 = [-0.6, -0.42, 0.1];
        P.h1 = [0.6, -0.42, 0.1];
        Object.assign(f, { pupY: -0.8, eyeOpen: 0.55, tears: 0.7 });
        break;
      }
      case 'idle':
      case 'stand': {
        if (mood === 'happy') {
          // "aah": a big, satisfied cloud
          P.h0 = [-0.32, -0.42 + 0.03 * Math.sin(t * 7), 0.45];
          P.h1 = [0.32, -0.42 + 0.03 * Math.sin(t * 7 + 1), 0.45];
          P.roll = 0.08 * Math.sin(t * 2);
          P.sparkle = 1;
          Object.assign(f, { joy: 1, mouthOpen: 0.55, smile: 0.7 });
        } else if (mood === 'sad') {
          // clouding over: greying, sniffling, a first drizzle
          P.rain = 0.25 * smooth(0.8, 1.6, t);
          P.y -= 0.1 * smooth(0, 1, t);
          P.sq = 0.96;
          const shock = 1 - smooth(0.6, 1.0, t);
          P.h0 = [-0.58, -0.4, 0.25];
          P.h1 = [0.58, -0.4, 0.25];
          Object.assign(f, {
            mouthO: shock > 0.5 ? 1 : 0, mouthOpen: shock > 0.5 ? 0.8 : 0, tears: smooth(1.2, 2.2, t),
            eyeOpen: lerp(1, 0.65, 1 - shock), browTilt: lerp(0.2, 1, 1 - shock), pupY: -0.4,
          });
        } else {
          // thirsty: pant and fan, wring itself out for one measly drop, then wait with arms crossed
          const c = t % 8;
          lookUser();
          if (c < 2.5) {
            P.h1 = [0.5 + 0.06 * Math.sin(t * 22), 0.25, 0.48];
            Object.assign(f, { mouthOpen: 0.45 + 0.12 * Math.sin(t * 15), tongue: 0.9 });
          } else if (c < 5) {
            const w = smooth(2.6, 3.0, c) * (1 - smooth(4.6, 4.9, c));
            P.h0 = [lerp(-0.68, -0.5, w), lerp(-0.2, 0.05, w), lerp(0.15, 0.3, w)];
            P.h1 = [lerp(0.68, 0.5, w), lerp(-0.2, -0.25, w), lerp(0.15, 0.3, w)];
            P.sq = 1 - 0.1 * w;
            P.sx = 1 - 0.08 * w;
            P.roll = 0.15 * w * Math.sin(c * 6);
            P.drip = smooth(3.4, 3.5, c) * (1 - smooth(4.4, 4.5, c));
            Object.assign(f, { eyeOpen: 0.3 + 0.7 * (1 - w), mouthOpen: 0.3 * w, teeth: w, browTilt: -0.5 * w, pupY: c > 3.5 ? -1 : 0 });
          } else {
            const arms = smooth(5, 5.3, c);
            P.h0 = [lerp(-0.68, 0.22, arms), -0.38, lerp(0.15, 0.5, arms)];
            P.h1 = [lerp(0.68, -0.22, arms), -0.32, lerp(0.15, 0.52, arms)];
            P.yaw = 0.05;
            Object.assign(f, { pupX: -0.75, eyeOpen: 0.6, browTilt: -0.4, smile: -0.3, mouthOpen: 0, mouthW: 0.15, tongue: 0 });
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
    if (state === 'drinking') { if (t > 0.4) toward('fluff', 1.12, 0.17); }
    else if (mood === 'happy') toward('fluff', 1.12, 1.5);
    else if (mood === 'sad') toward('fluff', 0.85, 0.06);
    else toward('fluff', 0.8, 1);
    toward('grey', mood === 'sad' && t > 0.3 ? 1 : 0, mood === 'sad' ? 0.9 : 2);

    const { rig, pivot, body } = this;
    rig.position.set(P.x, 0, 0);
    rig.rotation.set(0, P.yaw + P.spin, 0);
    pivot.position.set(0, CY + P.y, 0);
    pivot.rotation.set(P.pitch, 0, P.roll, 'YXZ');
    const s = BASE * h.fluff, q = Math.sqrt(Math.max(0.5, P.sq));
    body.scale.set((s * P.sx) / q, s * P.sq, s / q);
    this.puffs.forEach((p, i) => p.scale.setScalar(1 + 0.035 * Math.sin(T * 2.3 + i * 1.7)));
    this.mat.color.copy(this.white).lerp(this.storm, h.grey);
    this.mat.emissiveIntensity = 0.12 * (1 - h.grey) + 0.9 * P.bolt;
    rig.updateMatrixWorld(true);

    // arms
    for (let k = 0; k < 2; k++) {
      const sg = k ? 1 : -1;
      const sh = new THREE.Vector3(sg * SHOULDER[0], SHOULDER[1], SHOULDER[2]).multiply(body.scale);
      const hand = new THREE.Vector3(...P[`h${k}`]);
      const elbow = bendPoint(sh, hand, 0.5, new THREE.Vector3(sg * 0.4, -1, 0.2));
      this.arms[k].update(sh, elbow, hand);
      this.hands[k].position.copy(hand);
    }

    this.glass.visible = P.glass > 0.01;
    this.glass.scale.setScalar(Math.max(0.01, P.glass));
    this.waterPivot.scale.y = Math.max(0.001, P.glassLevel);
    this.waterPivot.visible = P.glassLevel > 0.01;

    // water spiralling from the glass up into the mouth
    const from = pivot.localToWorld(new THREE.Vector3(GLASS_AT[0], GLASS_AT[1] + 0.15, GLASS_AT[2]));
    const mouth = body.localToWorld(new THREE.Vector3(0, -0.12, 0.48));
    this.trail.forEach((sp, i) => {
      const ph = (T * 1.3 + i / this.trail.length) % 1, a = ph * TAU * 2 + i;
      sp.visible = P.trail > 0.01;
      sp.position.lerpVectors(from, mouth, ph).add(new THREE.Vector3(0.13 * (1 - ph) * Math.cos(a), 0, 0.13 * (1 - ph) * Math.sin(a)));
      sp.scale.setScalar(0.08 * (1 - 0.5 * ph) * P.trail);
    });

    // rain falls straight down from the cloud's underside, wherever it is
    const bottom = pivot.position.y - 0.45 * s;
    const grey = h.grey;
    this.rain.forEach((sp, i) => {
      const ph = (T * 1.7 + hash(i)) % 1;
      sp.visible = P.rain > 0.01;
      sp.position.set(P.x + (hash(i + 9) - 0.5) * 1.2 * s, lerp(bottom, 0.05, ph), 0.3 + 0.3 * hash(i + 3));
      sp.scale.set(0.09, 0.13, 1);
      sp.material.opacity = P.rain * (1 - smooth(0.85, 1, ph));
      sp.material.color.setRGB(1 - 0.35 * grey, 1 - 0.3 * grey, 1 - 0.2 * grey);
    });
    // the one sad drop it manages to wring out
    this.drip.visible = P.drip > 0.01;
    this.drip.position.set(P.x - 0.05, bottom - ((T * 1.2) % 1) * 0.9, 0.5);
    this.drip.scale.set(0.07, 0.1, 1);
    this.drip.material.opacity = P.drip;

    this.bolt.visible = P.bolt > 0.5;
    this.bolt.position.set(P.x + 0.2, bottom - 0.5, 0.6);

    this.rainbow.visible = P.rainbow > 0.01;
    this.rainbow.scale.setScalar(Math.max(0.01, backOut(P.rainbow)));

    this.flowers.forEach((fl, i) => {
      const g = backOut(clamp(P.flowers * 1.6 - i * 0.2));
      fl.visible = g > 0.01;
      fl.scale.setScalar(Math.max(0.01, g));
      fl.rotation.z = 0.12 * Math.sin(T * 3 + i);
      fl.userData.head.rotation.z = T * 0.5 + i;
    });

    const sc = 0.75 * s;
    this.shadow.scale.set(sc, sc, 1);
    this.shadow.material.opacity = 0.55;
    this.shadow.position.x = P.x;
    placeSparkles(this.sparkles, pivot.position.clone().setX(P.x), P.sparkle, T, 1.0, 0.7);
  }
}
