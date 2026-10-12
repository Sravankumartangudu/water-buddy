// Finn — a goldfish who's somehow ended up on your desk, out of water. Flops in gasping, then a big
// ball of water drops out of the sky onto it: it does loop-the-loops inside, leaps out and back in like
// a dolphin, blows you a kiss through the wall and swims off in its bubble. Skip the water and the sun
// comes out, it fades and dries up, and flops sadly away.
//
// Classes: flop, hello, waving, idle, splashdown, swim, leap, kiss, swimaway + mood happy/sad.
import * as THREE from 'three';
import {
  TAU, clamp, smooth, lerp, backOut, pulse, hash, outlined, FACE0, moodFace, faceCanvas, faceDecal, canvasTexture,
  makeSun, placeSun, makeSteam, placeSteam, makeSparkles, placeSparkles, makeShadow, dropTexture, bubbleTexture, sprites,
  Stage,
} from '../toon.js';

const PIVOT_H = 0.42; // body centre when lying on the desk
const BALL_Y = 0.98, BALL_R = 0.85; // the water ball's resting centre and radius
const DROP_Y = 4.4; // where the ball falls from
const BODY_R = 0.4, LONG = 1.3; // body sphere, stretched nose-to-tail
const FACE_W = 1.0;

function basePose() {
  return {
    x: 0, y: 0, yaw: 0.35, roll: 0, pitch: 0, sq: 1,
    tail: 0, f0: 0.2, f1: 0.2, fy0: 0, fy1: 0,
    ball: 0, ballY: 0, ballWob: 0, splash: -1, splashX: 0, bubbles: 0, heart: -1,
    sun: 0, steam: 0, sparkle: 0,
    face: { ...FACE0 },
  };
}

function skinTexture() {
  return canvasTexture(256, (ctx, S) => {
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#ff7a12');
    g.addColorStop(0.45, '#ff9a3a');
    g.addColorStop(0.62, '#ffd9a8');
    g.addColorStop(1, '#fff2df');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // a few scales along the back
    ctx.strokeStyle = 'rgba(200,70,0,.35)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 14; i++) {
        const x = (i + (row % 2) * 0.5) * (S / 14), y = 40 + row * 22;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    }
  });
}

function heartTexture() {
  return canvasTexture(128, (ctx) => {
    ctx.translate(64, 70);
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.bezierCurveTo(-70, -10, -30, -60, 0, -26);
    ctx.bezierCurveTo(30, -60, 70, -10, 0, 40);
    ctx.fillStyle = '#ff4f7a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#a3123c';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.ellipse(-20, -18, 9, 6, -0.6, 0, TAU);
    ctx.fill();
  });
}

// a wobbly ball of water: clear in the middle, blue and bright at the rim
function ballMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec3 p = position * (1.0 + 0.025 * sin(position.y * 6.0 + uTime * 4.0) * sin(position.x * 5.0 - uTime * 3.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity, uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float caustic = 0.5 + 0.5 * sin(vP.x * 11.0 + uTime * 2.0) * sin(vP.y * 13.0 - uTime * 2.6);
        vec3 col = mix(vec3(0.3, 0.72, 1.0), vec3(0.85, 0.97, 1.0), rim);
        float a = 0.1 + 0.07 * caustic + 0.8 * rim;
        // a glossy highlight up and to the left
        float hl = smoothstep(0.93, 0.99, dot(vN, normalize(vec3(-0.45, 0.6, 0.66))));
        col += hl;
        a = max(a, hl * 0.9);
        gl_FragColor = vec4(col, a * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

export class Fish extends Stage {
  static moves = [
    ['flop', '🐟', 'Flop in'], ['waving', '👋', 'Wave'], ['idle', '🥵', 'Gasping'], ['happy splashdown', '🌊', 'Splashdown'],
    ['happy swim', '🔁', 'Loop-the-loops'], ['happy leap', '🐬', 'Dolphin leaps'], ['happy kiss', '😘', 'Blow a kiss'],
    ['happy swimaway', '🫧', 'Swim off'], ['sad', '😢', 'Drying up'], ['sad flop', '🥀', 'Flop away'],
  ];

  build() {
    this.states = ['splashdown', 'swim', 'leap', 'kiss', 'swimaway', 'flop', 'waving', 'hello', 'idle'];
    this.angles = ['roll', 'pitch', 'yaw'];
    this.out = basePose();
    this.hyd = { wet: 0.35 };

    const rig = (this.rig = new THREE.Group());
    this.scene.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);
    const body = (this.body = new THREE.Group());
    pivot.add(body);

    this.skin = new THREE.MeshPhysicalMaterial({ map: skinTexture(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
    this.finMat = new THREE.MeshPhysicalMaterial({ color: '#ff8c2a', roughness: 0.4, clearcoat: 0.6, emissive: '#ff5a00', emissiveIntensity: 0.08 });
    this.vivid = new THREE.Color('#ffffff');
    this.dull = new THREE.Color('#c9c1b9');
    this.finVivid = new THREE.Color('#ff8c2a');
    this.finDull = new THREE.Color('#c49a78');

    const torso = outlined(new THREE.SphereGeometry(BODY_R, 40, 28), this.skin, 0.02);
    const shell = new THREE.Group();
    shell.scale.set(1, 0.95, LONG);
    shell.add(torso);
    this.face = faceCanvas(512);
    const decal = faceDecal(new THREE.SphereGeometry(BODY_R + 0.006, 40, 30, Math.PI / 2 - FACE_W, 2 * FACE_W, Math.PI / 2 - FACE_W, 2 * FACE_W), this.face.tex);
    shell.add(decal);
    body.add(shell);

    // tail: two lobes on a hinge at the back
    const tail = (this.tail = new THREE.Group());
    tail.position.z = -BODY_R * LONG + 0.05;
    for (const s of [-1, 1]) {
      const lobe = outlined(new THREE.SphereGeometry(0.2, 20, 14), this.finMat, 0.014);
      lobe.scale.set(0.22, 1, 0.75);
      lobe.position.set(0, s * 0.13, -0.15);
      lobe.rotation.x = s * 0.7;
      tail.add(lobe);
    }
    body.add(tail);

    const dorsal = outlined(new THREE.SphereGeometry(0.2, 20, 14), this.finMat, 0.014);
    dorsal.scale.set(0.2, 0.8, 1.1);
    dorsal.position.set(0, BODY_R * 0.88, -0.08);
    dorsal.rotation.x = -0.35;
    body.add(dorsal);

    // pectoral fins do the waving
    this.fins = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * BODY_R * 0.9, -0.08, 0.12);
      const fin = outlined(new THREE.SphereGeometry(0.13, 18, 12), this.finMat, 0.012);
      fin.scale.set(1.1, 0.28, 0.7);
      fin.position.x = s * 0.11;
      g.add(fin);
      body.add(g);
      return g;
    });

    this.ballMat = ballMaterial();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 32), this.ballMat);
    this.ball.renderOrder = 2;
    this.ball.visible = false;
    this.scene.add(this.ball);

    this.bubbles = sprites(this.scene, bubbleTexture(), 10);
    this.drops = sprites(this.scene, dropTexture('#5cc8ff'), 16);
    this.heart = sprites(this.scene, heartTexture(), 1)[0];

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
    const gasp = (k) => Object.assign(f, { mouthO: 1, mouthOpen: k * (0.35 + 0.35 * Math.max(0, Math.sin(T * 7))), tongue: 0 });
    const inBall = (wob = 0) => {
      P.ball = 1;
      P.y = BALL_Y - PIVOT_H;
      P.ballWob = wob;
      P.bubbles = 1;
    };
    P.tail = 0.25 * Math.sin(T * 4);

    switch (state) {
      case 'flop': {
        // flip-flopping across the desk, gasping
        const sad = mood === 'sad';
        const per = sad ? 0.75 : 0.6, u = (t / per) % 1;
        const air = Math.sin(clamp((u - 0.1) / 0.6) * Math.PI) * (u > 0.1 && u < 0.7 ? 1 : 0);
        const land = pulse(u, 0.74, 0.05);
        P.y = (sad ? 0.16 : 0.28) * air;
        P.yaw = dir * 1.25;
        P.pitch = -0.45 * Math.sin(u * TAU) * (sad ? 0.6 : 1);
        P.roll = 0.25 * Math.sin(u * TAU + 1);
        P.sq = 1 + 0.08 * air - 0.18 * land;
        P.tail = 0.9 * Math.sin(u * TAU * 2);
        P.f0 = P.f1 = 0.6 * Math.sin(u * TAU * 2);
        gasp(1);
        if (sad) Object.assign(f, { tears: 0.8, browTilt: 1, eyeOpen: 0.6 });
        else Object.assign(f, { pupS: 1.15, browY: 0.8 });
        break;
      }
      case 'hello': {
        const air = Math.sin(clamp((t - 0.1) / 0.32) * Math.PI);
        P.y = 0.3 * air;
        P.sq = 1 + 0.1 * air - 0.15 * pulse(t, 0.44, 0.04);
        P.yaw = 0.15;
        P.pitch = -0.2 * air;
        P.f0 = P.f1 = 1.0 * air;
        P.tail = 0.8 * Math.sin(T * 14);
        Object.assign(f, { mouthOpen: 0.75, tongue: 0, pupS: 1.15, browY: 1 });
        break;
      }
      case 'waving': {
        const w = Math.sin(t * TAU * 2.6);
        P.yaw = 0.35;
        P.f1 = 1.1 + 0.4 * w;
        P.fy1 = 0.4;
        P.roll = -0.12 + 0.04 * w;
        P.tail = 0.4 * Math.sin(T * 6);
        lookUser();
        const talk = 1 - smooth(1.6, 2.0, t);
        Object.assign(f, { browY: 0.8, smile: 0.6, sweat: 0.6, mouthOpen: lerp(0.3, 0.2 + 0.45 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)), talk), tongue: 0 });
        break;
      }
      case 'splashdown': {
        // a ball of water drops out of the sky onto it — SPLOOSH — and it bobs up inside
        const fall = clamp(t / 0.6);
        P.ball = 1;
        P.ballY = (DROP_Y - BALL_Y) * (1 - fall * fall);
        const lift = backOut(clamp((t - 0.6) / 0.6));
        P.y = (BALL_Y - PIVOT_H) * lift;
        P.ballWob = pulse(t, 0.7, 0.2) * 3;
        P.splash = t > 0.6 ? t - 0.6 : -1;
        P.bubbles = smooth(0.6, 1, t);
        P.yaw = lerp(0.35, 0.1, lift);
        P.sq = 1 - 0.25 * pulse(t, 0.62, 0.05);
        P.tail = lerp(0.25, 0.7, lift) * Math.sin(T * 10);
        P.f0 = P.f1 = 0.4 + 0.4 * Math.sin(T * 10) * lift;
        if (t < 0.6) Object.assign(f, { pupY: 1, pupS: 0.7, browY: 1.3, mouthO: 1, mouthOpen: 0.5, tongue: 0 });
        else Object.assign(f, { eyeOpen: t < 1.2 ? 0.2 : 1, joy: t > 1.6 ? 1 : 0, mouthOpen: 0.7, teeth: 0.4, cheek: 0.8, sweat: 0, tongue: 0 });
        if (t > 1.3) P.sparkle = 1;
        break;
      }
      case 'swim': {
        // loop-the-loops round the inside of the ball
        inBall(0.6);
        const a = t * 3.6, r = 0.2;
        P.x = r * Math.cos(a);
        P.y += r * Math.sin(a);
        P.yaw = Math.PI / 2;
        P.pitch = -(a + Math.PI / 2);
        P.tail = 0.7 * Math.sin(T * 16);
        P.f0 = P.f1 = 0.5 + 0.4 * Math.sin(T * 16);
        P.sparkle = 0.6;
        Object.assign(f, { joy: 1, mouthOpen: 0.7, teeth: 0.4, tongue: 0 });
        break;
      }
      case 'leap': {
        // dolphin jumps: out of the top of the ball, over, and back in — four times, side to side
        inBall(0.4);
        const i = Math.floor(t / 0.8) % 4, u = (t % 0.8) / 0.8, s = i % 2 ? -1 : 1;
        const h = 1.25 * Math.sin(u * Math.PI);
        P.x = s * lerp(-0.4, 0.4, u);
        P.y += h - 0.2;
        P.yaw = (s * Math.PI) / 2;
        P.pitch = -Math.atan2(1.25 * Math.PI * Math.cos(u * Math.PI), 0.8 * 1.25) * 0.9;
        P.roll = i === 3 ? s * TAU * smooth(0.25, 0.75, u) : 0;
        P.tail = 0.6 * Math.sin(T * 18);
        P.f0 = P.f1 = 0.8;
        const exit = Math.abs(u - 0.18) < 0.12 || Math.abs(u - 0.82) < 0.12;
        P.splash = u > 0.12 && u < 0.45 ? u - 0.12 : u > 0.8 ? u - 0.8 : -1;
        P.splashX = s * (u < 0.5 ? -0.3 : 0.3); // where it breaks the surface
        P.sparkle = 1;
        Object.assign(f, { joy: 1, mouthOpen: 0.85, teeth: 0.5, browY: 1, tongue: 0 });
        break;
      }
      case 'kiss': {
        // presses up to the glassy wall and blows you a kiss
        inBall(0.3);
        const near = smooth(0, 0.4, t);
        P.yaw = 0;
        P.pitch = -0.1;
        P.y += 0.05;
        P.sq = 1 + 0.06 * pulse(t, 0.7, 0.08);
        P.f1 = lerp(0.2, 1.4, pulse(t, 0.8, 0.2));
        P.fy1 = 0.9 * pulse(t, 0.8, 0.2);
        P.tail = 0.5 * Math.sin(T * 8);
        P.heart = t > 0.75 ? t - 0.75 : -1;
        Object.assign(f, {
          mouthO: 1, mouthOpen: lerp(0, 0.3, near) * (1 - 0.6 * pulse(t, 0.75, 0.1)), mouthW: 0.12, tongue: 0,
          wink: smooth(0.5, 0.7, t), cheek: 1, smile: 1, browY: 0.6,
        });
        P.sparkle = 1;
        break;
      }
      case 'swimaway': {
        inBall(0.5);
        P.yaw = dir * (Math.PI / 2);
        P.y += 0.06 * Math.sin(T * 5);
        P.pitch = -0.1;
        P.tail = 0.8 * Math.sin(T * 20);
        P.f0 = P.f1 = 0.6 + 0.4 * Math.sin(T * 20);
        P.sparkle = 1;
        Object.assign(f, { joy: 1, mouthOpen: 0.6, tongue: 0 });
        break;
      }
      case 'idle':
      case 'stand': {
        if (mood === 'happy') {
          inBall(0.3);
          P.yaw = 0.15 * Math.sin(t * 2);
          P.tail = 0.5 * Math.sin(T * 8);
          P.f0 = P.f1 = 0.4 + 0.3 * Math.sin(T * 8);
          P.sparkle = 1;
          Object.assign(f, { joy: 1, mouthOpen: 0.55, smile: 0.8, tongue: 0 });
        } else if (mood === 'sad') {
          // the sun comes out: it fades, dries and wilts
          P.sun = 1;
          P.steam = smooth(0.4, 1.2, t);
          const wilt = smooth(0.6, 2, t);
          P.pitch = 0.3 * wilt;
          P.roll = -0.35 * wilt;
          P.sq = 1 - 0.06 * wilt;
          P.f0 = P.f1 = lerp(0.2, -0.5, wilt);
          P.tail = -0.4 * wilt + 0.1 * Math.sin(T * 2);
          const shock = 1 - smooth(0.6, 1.0, t);
          Object.assign(f, {
            pupY: lerp(0.9, -0.5, smooth(0.9, 1.4, t)), mouthO: 1, mouthOpen: shock > 0.5 ? 0.8 : 0.2, tongue: 0,
            tears: smooth(1.2, 2.2, t), eyeOpen: lerp(1, 0.6, 1 - shock), browTilt: lerp(0.2, 1, 1 - shock),
          });
        } else {
          // out of water: gasp, twitch-flop, fan itself with a fin, then go limp
          const c = t % 8;
          P.yaw = 0.35;
          lookUser();
          P.tail = 0.15 * Math.sin(T * 3);
          if (c < 3) {
            P.sq = 1 + 0.04 * Math.max(0, Math.sin(T * 7));
            P.f0 = P.f1 = 0.2 + 0.25 * Math.max(0, Math.sin(T * 7));
            gasp(1);
          } else if (c < 4.5) {
            const k = c - 3, flip = Math.sin(clamp(k / 0.35) * Math.PI) + Math.sin(clamp((k - 0.5) / 0.35) * Math.PI);
            P.y = 0.12 * flip;
            P.pitch = -0.35 * flip;
            P.tail = 1.0 * Math.sin(T * 30) * flip;
            P.sq = 1 - 0.12 * pulse(k, 0.38, 0.05) - 0.12 * pulse(k, 0.88, 0.05);
            Object.assign(f, { eyeOpen: 0.3, mouthOpen: 0.5, mouthO: 1, tongue: 0, browTilt: -0.4 });
          } else if (c < 6.5) {
            P.f1 = 0.8 + 0.6 * Math.sin(T * 24);
            P.fy1 = 0.7;
            P.roll = -0.1;
            gasp(0.6);
          } else {
            const s = smooth(6.5, 6.9, c);
            P.roll = 0.5 * s;
            P.pitch = 0.1 * s;
            P.f0 = P.f1 = lerp(0.2, -0.4, s);
            P.tail = 0;
            Object.assign(f, { eyeOpen: 0.45, browTilt: 0.8, smile: -0.4, mouthO: 1, mouthOpen: 0.25, tongue: 0, pupY: -0.5 });
          }
        }
        break;
      }
    }
    return P;
  }

  pose(P, { t, T, dt, dir, mood, state }) {
    const h = this.hyd;
    const toward = (v, rate) => (h.wet += clamp(v - h.wet, -rate * dt, rate * dt));
    if (P.ball > 0.5 && P.y > 0.2) toward(1, 1.2);
    else if (mood === 'sad') toward(0, t > 0.5 ? 0.3 : 0);
    else if (state !== 'splashdown') toward(0.35, 1);

    const { rig, pivot, body } = this;
    rig.position.set(P.x, 0, 0);
    rig.rotation.set(0, P.yaw, 0);
    pivot.position.set(0, PIVOT_H + P.y, 0);
    pivot.rotation.set(P.pitch, 0, P.roll, 'XYZ');
    const q = 1 / Math.sqrt(Math.max(0.5, P.sq));
    body.scale.set(q, P.sq, q);
    this.tail.rotation.y = P.tail;
    this.fins.forEach((g, k) => {
      const s = k ? 1 : -1;
      g.rotation.set(0, s * P[`fy${k}`], s * P[`f${k}`]);
    });
    this.skin.color.copy(this.dull).lerp(this.vivid, h.wet);
    this.finMat.color.copy(this.finDull).lerp(this.finVivid, h.wet);
    this.skin.clearcoat = h.wet;
    this.skin.emissive.setRGB(0.55, 0.52, 0.5);
    this.skin.emissiveIntensity = 0.5 * (1 - h.wet) ** 2;

    // the water ball
    const bx = 0, by = BALL_Y + P.ballY;
    this.ball.visible = P.ball > 0.01;
    this.ball.position.set(bx, by, 0);
    const wob = Math.sin(T * 9) * 0.03 * P.ballWob;
    this.ball.scale.set(1 + wob, 1 - wob, 1 + wob);
    this.ballMat.uniforms.uOpacity.value = P.ball;
    this.ballMat.uniforms.uTime.value = T;

    // bubbles drifting up from its mouth inside the ball
    rig.updateMatrixWorld(true);
    const mouth = body.localToWorld(new THREE.Vector3(0, -0.05, BODY_R * LONG));
    this.bubbles.forEach((sp, i) => {
      const ph = (T * 0.6 + hash(i)) % 1;
      sp.visible = P.bubbles > 0.01 && P.ball > 0.5 && Math.hypot(mouth.x - bx, mouth.y - by) < BALL_R - 0.1;
      const top = by + Math.sqrt(Math.max(0, BALL_R * BALL_R - (mouth.x - bx) ** 2)) - 0.12;
      sp.position.set(mouth.x + 0.08 * Math.sin(T * 3 + i * 2), lerp(mouth.y, top, ph), 0.3 + 0.2 * hash(i + 4));
      sp.scale.setScalar((0.05 + 0.05 * hash(i + 7)) * P.bubbles);
      sp.material.opacity = P.bubbles * (1 - smooth(0.85, 1, ph));
    });

    // splashes: a ring of drops thrown out on impact (or where the fish breaks the surface)
    const sp0 = P.splash;
    const at = state === 'leap' ? new THREE.Vector3(P.splashX, by + BALL_R * 0.85, -0.55) : new THREE.Vector3(0, 0.15, 0.3);
    this.drops.forEach((sp, i) => {
      const a = i % 2 ? lerp(0.05, 0.4, hash(i)) * Math.PI : lerp(0.6, 0.95, hash(i)) * Math.PI; // two fans, clear of the fish
      const v = 1.6 + 1.4 * hash(i + 2), tt = sp0;
      sp.visible = tt >= 0 && tt < 0.8;
      if (!sp.visible) return;
      sp.position.set(at.x + Math.cos(a) * v * 0.9 * tt, at.y + Math.sin(a) * v * tt - 4.5 * tt * tt, at.z + 0.2 * hash(i + 5));
      sp.scale.set(0.09, 0.13, 1);
      sp.material.opacity = 1 - smooth(0.5, 0.8, tt);
    });

    // the kiss: a heart floats out through the wall
    const hk = P.heart;
    this.heart.visible = hk >= 0 && hk < 1.6;
    if (this.heart.visible) {
      this.heart.position.set(mouth.x + 0.15 + 0.08 * Math.sin(hk * 6), mouth.y + 0.15 + 0.7 * hk, 1.3);
      this.heart.scale.setScalar(0.32 * backOut(clamp(hk / 0.3)));
      this.heart.material.opacity = 1 - smooth(1.2, 1.6, hk);
    }

    const ground = P.ball > 0.5 && P.ballY < 1 ? 1.1 : 0.75 / (1 + Math.max(0, P.y) * 1.5);
    this.shadow.scale.set(ground, ground, 1);
    this.shadow.material.opacity = 0.9;
    this.shadow.position.x = P.ball > 0.5 ? 0 : P.x;
    placeSun(this.sun, P.sun, dir, T);
    placeSteam(this.steam, mouth.clone().setY(PIVOT_H + 0.45), P.steam, T);
    placeSparkles(this.sparkles, new THREE.Vector3(0, P.ball > 0.5 ? BALL_Y + 0.1 : 0.6, 0), P.sparkle, T, P.ball > 0.5 ? 1.0 : 0.8, 0.8);
  }
}
