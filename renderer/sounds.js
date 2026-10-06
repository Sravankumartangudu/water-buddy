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
  };

  window.Sounds = Sounds;
})();
