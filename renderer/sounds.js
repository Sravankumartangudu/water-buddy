// Synthesized sound effects — no audio files needed.
(function () {
  let ctx;
  let noiseBuf;
  const ac = () => (ctx ||= new AudioContext());

  function tone(freq, start, dur, { type = 'triangle', gain = 0.18, slideTo } = {}) {
    const a = ac();
    const t0 = a.currentTime + start;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(start, dur, { gain = 0.2, freq = 2000, q = 1, type = 'bandpass' } = {}) {
    const a = ac();
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = a.currentTime + start;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const kick = (t) => tone(150, t, 0.18, { type: 'sine', gain: 0.45, slideTo: 50 });
  const bloop = (t, f = 500) => tone(f, t, 0.09, { type: 'sine', gain: 0.16, slideTo: f * 2.6 }); // water drop: quick upward pitch
  const shaker = (t, gain = 0.05) => noise(t, 0.04, { gain, freq: 7000, type: 'highpass' });
  const splash = (t) => noise(t, 0.6, { gain: 0.22, freq: 1200, q: 0.5 });
  const marimba = (f, t, dur) => { tone(f, t, dur, { type: 'sine', gain: 0.13 }); tone(f * 4, t, 0.04, { type: 'sine', gain: 0.025 }); };

  const Sounds = {
    hello() {
      tone(587, 0, 0.1);
      tone(784, 0.1, 0.1);
      tone(988, 0.2, 0.2);
    },
    hop() {
      tone(300, 0, 0.15, { type: 'sine', gain: 0.15, slideTo: 700 });
    },
    gulp() {
      [0.75, 1.15, 1.55].forEach((t) => tone(380, t, 0.16, { type: 'sine', gain: 0.3, slideTo: 150 }));
    },
    aah() {
      tone(330, 0, 0.5, { type: 'sine', gain: 0.12, slideTo: 260 });
      [0, 0.08, 0.16].forEach((t, i) => tone(1318 + i * 300, 0.45 + t, 0.25, { type: 'sine', gain: 0.06 }));
    },
    // Bouncy marimba tune over C–Am–F–G with water-drop percussion, `beats` eighth-notes long at `beat` seconds each.
    splash(beats, beat) {
      const bass = [131, 110, 87, 98]; // C3 A2 F2 G2, one per 8-beat bar
      const tune = [
        659, 784, 1047, 784, 659, 784, 880, 784,
        659, 0, 659, 587, 523, 587, 659, 0,
        698, 880, 1047, 880, 698, 880, 1047, 1175,
        1175, 988, 784, 988, 1175, 0, 784, 0,
      ];
      for (let i = 0; i < beats; i++) {
        const t = i * beat;
        const root = bass[Math.floor(i / 8) % 4];
        if (i % 4 === 0) kick(t);
        if (i % 8 === 0 || i % 8 === 3 || i % 8 === 6) tone(root, t, beat * 1.4, { type: 'triangle', gain: 0.22 });
        if (i % 4 === 2) bloop(t, 450);
        shaker(t, i % 2 ? 0.05 : 0.025);
        if (i >= 8 && tune[i % 32]) marimba(tune[i % 32], t, beat * 1.6);
        if (i >= 16 && i % 2 === 1) bloop(t, 700 + ((i * 137) % 500)); // bubbles fizz in during the hops
      }
      // closing splash on a C chord
      const end = beats * beat;
      kick(end);
      splash(end);
      [523, 659, 784, 1047].forEach((f, k) => marimba(f, end + k * 0.06, 0.8));
      tone(131, end, 0.8, { type: 'triangle', gain: 0.22 });
    },
    sad() {
      tone(392, 0, 0.4, { type: 'sawtooth', gain: 0.07 });
      tone(370, 0.42, 0.4, { type: 'sawtooth', gain: 0.07 });
      tone(349, 0.84, 0.4, { type: 'sawtooth', gain: 0.07 });
      tone(330, 1.26, 1.1, { type: 'sawtooth', gain: 0.07, slideTo: 280 });
    },
    sniff() {
      noise(0, 0.12, { gain: 0.12, freq: 4000, q: 0.6 });
      noise(0.22, 0.18, { gain: 0.14, freq: 4500, q: 0.6 });
    },
    // parched "waaater…" while crawling in
    croak() {
      tone(240, 0, 0.75, { type: 'sawtooth', gain: 0.06, slideTo: 150 });
      noise(0, 0.6, { gain: 0.05, freq: 900, q: 0.7 });
    },
    whoosh() {
      noise(0, 0.35, { gain: 0.18, freq: 800, q: 0.5 });
      tone(200, 0, 0.3, { type: 'sine', gain: 0.08, slideTo: 600 });
    },
    // cartoon brakes
    skid() {
      tone(1500, 0, 0.5, { type: 'sawtooth', gain: 0.05, slideTo: 700 });
      tone(1530, 0, 0.5, { type: 'square', gain: 0.025, slideTo: 720 });
      noise(0, 0.55, { gain: 0.12, freq: 2500, q: 0.8 });
    },
    // timed to the burp pose: puff… BURP… "oops!"
    burp() {
      tone(110, 0.92, 0.45, { type: 'sawtooth', gain: 0.18, slideTo: 72 });
      tone(116, 0.94, 0.4, { type: 'square', gain: 0.06, slideTo: 80 });
      noise(0.92, 0.3, { gain: 0.1, freq: 300, q: 1.2 });
      tone(700, 1.5, 0.12, { type: 'sine', gain: 0.1, slideTo: 520 });
      tone(900, 1.64, 0.16, { type: 'sine', gain: 0.1, slideTo: 620 });
    },
    tada() {
      [523, 659, 784].forEach((f, i) => marimba(f, i * 0.08, 0.3));
      [523, 659, 784, 1047].forEach((f) => marimba(f, 0.28, 1.0));
      kick(0.28);
      splash(0.28);
    },
    // a whee! then a soft thump each time a hand or foot lands, every `rev / 2` seconds
    cartwheel(dur, rev) {
      tone(400, 0, 0.45, { type: 'sine', gain: 0.1, slideTo: 1100 });
      for (let t = rev / 4; t < dur; t += rev / 2) tone(140, t, 0.1, { type: 'sine', gain: 0.2, slideTo: 70 });
    },
    // funky bass + finger snaps for the moonwalk, `beats` steps of `beat` seconds
    groove(beats, beat) {
      const bass = [98, 0, 98, 117, 0, 131, 117, 0];
      for (let i = 0; i < beats; i++) {
        const t = i * beat;
        if (bass[i % 8]) tone(bass[i % 8], t, beat * 0.9, { type: 'triangle', gain: 0.22 });
        if (i % 2) noise(t, 0.05, { gain: 0.16, freq: 3500, q: 2 });
        shaker(t + beat / 2, 0.03);
      }
    },
    // tantrum stomps, `n` of them `beat` seconds apart, plus an angry "hmph!"
    stomp(n, beat) {
      for (let i = 0; i < n; i++) {
        kick(i * beat + beat * 0.74);
        noise(i * beat + beat * 0.74, 0.12, { gain: 0.12, freq: 250, q: 0.8 });
      }
      tone(320, 0, 0.14, { type: 'sawtooth', gain: 0.08, slideTo: 220 });
      tone(280, 0.18, 0.32, { type: 'sawtooth', gain: 0.08, slideTo: 180 });
    },
    // drip… drip… sinking into a puddle, with steam hissing off
    melt() {
      for (let i = 0; i < 7; i++) tone(620 - i * 60, i * 0.38, 0.22, { type: 'sine', gain: 0.12, slideTo: (620 - i * 60) * 0.5 });
      noise(0.5, 2.8, { gain: 0.04, freq: 5000, type: 'highpass' });
    },
    poof() {
      noise(0, 0.7, { gain: 0.12, freq: 3000, q: 0.5 });
      tone(800, 0, 0.6, { type: 'sine', gain: 0.06, slideTo: 2000 });
    },

    // ---- Nimbus (cloud) ----
    breeze() {
      noise(0, 1.6, { gain: 0.07, freq: 500, q: 0.4 });
      noise(0.5, 1.4, { gain: 0.05, freq: 900, q: 0.6 });
    },
    // breathing the glass in: rising sips
    slurp() {
      for (let i = 0; i < 5; i++) {
        noise(0.35 + i * 0.4, 0.3, { gain: 0.08, freq: 1200 + i * 200, q: 1.5 });
        tone(300 + i * 40, 0.35 + i * 0.4, 0.28, { type: 'sine', gain: 0.08, slideTo: 700 + i * 60 });
      }
    },
    // the splash-dance tune over pitter-patter rain instead of the kick drum
    rainSong(beats, beat) {
      const bass = [131, 110, 87, 98];
      const tune = [784, 0, 659, 784, 880, 0, 784, 659, 587, 659, 784, 0, 659, 587, 523, 0];
      for (let i = 0; i < beats; i++) {
        const t = i * beat;
        if (i % 8 === 0 || i % 8 === 4) tone(bass[Math.floor(i / 8) % 4], t, beat * 2, { type: 'triangle', gain: 0.2 });
        for (let k = 0; k < 3; k++) bloop(t + k * (beat / 3) + ((i * 7 + k * 3) % 5) * 0.01, 900 + ((i * 131 + k * 257) % 700));
        if (tune[i % 16]) marimba(tune[i % 16], t, beat * 1.6);
      }
      [523, 659, 784, 1047].forEach((f, k) => marimba(f, beats * beat + k * 0.06, 0.8));
    },
    thunder() {
      noise(0, 0.08, { gain: 0.3, freq: 3000, q: 0.4 }); // crack
      noise(0.05, 1.6, { gain: 0.35, freq: 120, type: 'lowpass' });
      tone(55, 0.05, 1.2, { type: 'sine', gain: 0.25, slideTo: 35 });
    },

    // ---- Glug (bottle) ----
    boing() {
      tone(180, 0, 0.35, { type: 'sine', gain: 0.2, slideTo: 620 });
      tone(620, 0.3, 0.3, { type: 'sine', gain: 0.1, slideTo: 380 });
    },
    // hollow plastic landing
    thunk() {
      tone(240, 0, 0.12, { type: 'sine', gain: 0.25, slideTo: 140 });
      noise(0, 0.08, { gain: 0.12, freq: 700, q: 2 });
    },
    // water glugging in from above
    pour() {
      noise(0.55, 1.7, { gain: 0.1, freq: 700, q: 0.7 });
      for (let i = 0; i < 9; i++) tone(260 + i * 45, 0.6 + i * 0.17, 0.12, { type: 'sine', gain: 0.12, slideTo: 420 + i * 50 });
      tone(500, 2.55, 0.08, { type: 'square', gain: 0.04 }); // cap clicks back on
    },
    pop() {
      noise(0, 0.05, { gain: 0.3, freq: 5000, q: 0.7 });
      tone(500, 0, 0.12, { type: 'sine', gain: 0.25, slideTo: 1400 });
    },
    spray() {
      noise(0, 1.0, { gain: 0.12, freq: 6000, type: 'highpass' });
    },
    crinkle() {
      for (let i = 0; i < 16; i++) noise(i * 0.05 + ((i * 37) % 7) * 0.006, 0.03, { gain: 0.12, freq: 4000 + ((i * 911) % 3000), q: 3 });
    },

    // ---- Finn (fish) ----
    flop() {
      noise(0, 0.07, { gain: 0.2, freq: 900, q: 1 });
      tone(170, 0, 0.1, { type: 'sine', gain: 0.15, slideTo: 90 });
    },
    sploosh() {
      noise(0, 1.0, { gain: 0.35, freq: 700, type: 'lowpass' });
      noise(0.02, 0.6, { gain: 0.15, freq: 2500, q: 0.6 });
      tone(320, 0, 0.4, { type: 'sine', gain: 0.2, slideTo: 60 });
    },
    plop() {
      noise(0, 0.25, { gain: 0.14, freq: 1500, q: 0.7 });
      bloop(0, 380);
    },
    bubbles() {
      for (let i = 0; i < 6; i++) bloop(i * 0.11 + (i % 2) * 0.03, 500 + ((i * 173) % 500));
    },
    kiss() {
      tone(900, 0, 0.12, { type: 'sine', gain: 0.12, slideTo: 1500 });
      noise(0.1, 0.05, { gain: 0.15, freq: 3000, q: 1 });
    },
    // the splash-dance tune with bubbling percussion
    bubbleTune(beats, beat) {
      const bass = [131, 110, 87, 98];
      const tune = [659, 784, 880, 784, 659, 0, 523, 587, 659, 0, 784, 0, 880, 784, 659, 587];
      for (let i = 0; i < beats; i++) {
        const t = i * beat;
        if (i % 4 === 0) tone(bass[Math.floor(i / 8) % 4], t, beat * 1.8, { type: 'triangle', gain: 0.22 });
        if (i % 2 === 1) bloop(t, 600 + ((i * 97) % 400));
        if (i % 4 === 2) noise(t, 0.08, { gain: 0.08, freq: 1500, q: 1 });
        if (tune[i % 16]) marimba(tune[i % 16] * (i >= 16 ? 1.5 : 1), t, beat * 1.6);
      }
      kick(beats * beat);
      splash(beats * beat);
      [523, 659, 784, 1047].forEach((f, k) => marimba(f, beats * beat + k * 0.06, 0.8));
    },
  };

  window.Sounds = Sounds;
})();
