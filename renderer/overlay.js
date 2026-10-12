// Reminder scene. A character comes in from the left, hops, waves and asks. Then either "drink" (it
// drinks, celebrates and leaves happy to the right) or "later" (it dries up and leaves sad to the left).
// Each character has its own scene:
//   Droppy (water drop) — walks, crawls or dashes in; gulps a glass, splash dance, side hops, flexes;
//            skips, cartwheels or moonwalks off. Later: trudges back, throws a tantrum, or melts away.
//   Nimbus (cloud)  — floats in; inhales the glass, rains on a flower bed, rides a rainbow, zooms off.
//            Later: turns into a grumbling storm cloud and drifts off.
//   Glug (bottle)   — rolls or bounces in; gets refilled, shakes until the cap pops, bottle-flips and
//            rockets off on a water jet. Later: crumples, tips over and rolls away.
//   Finn (fish)     — flops in gasping; a ball of water drops on it, loop-the-loops, dolphin leaps,
//            a kiss, swims off in its bubble. Later: dries up in the sun and flops away.
// Each beat picks a variant at random, so reminders don't all look the same.
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const buddyEl = $('buddy');
const host = $('svg-host');
const bubble = $('bubble');
const BUDDY_W = 170;
const BEAT = 0.2; // seconds per dance step

let cfg;
let x = -BUDDY_W - 20;
let y = 0; // px, negative = up
let answered = false;

function setState(...states) {
  host.className = ['buddy-host', ...states].join(' ');
}

function setDir(d) {
  host.style.setProperty('--dir', d);
}

function play(name, ...args) {
  if (cfg.sound) Sounds[name](...args);
}

// One of `options` at random; `--variants=crawl,burp,…` (for testing) forces a choice.
function pick(...options) {
  return options.find((o) => cfg.variants.includes(o)) || options[Math.floor(Math.random() * options.length)];
}

function place(nx, ny) {
  x = nx;
  y = ny;
  buddyEl.style.transform = `translate(${x}px, ${y}px)`;
}

async function moveTo(tx, ty, pxPerSec, easing = 'linear') {
  const [fx, fy] = [x, y];
  x = tx;
  y = ty;
  if (tx !== fx) setDir(tx > fx ? 1 : -1);
  await buddyEl.animate(
    [{ transform: `translate(${fx}px, ${fy}px)` }, { transform: `translate(${tx}px, ${ty}px)` }],
    { duration: (Math.hypot(tx - fx, ty - fy) / pxPerSec) * 1000, easing, fill: 'forwards' }
  ).finished;
}

const walkTo = (tx, pxPerSec, easing) => moveTo(tx, y, pxPerSec, easing);

// a sound every `ms` until stopped (the first one after `first` ms)
function every(ms, fn, first = 0) {
  let iv;
  const to = setTimeout(() => { fn(); iv = setInterval(fn, ms); }, first);
  return () => { clearTimeout(to); clearInterval(iv); };
}

function say(msg, sub = '', withButtons = false) {
  $('msg').textContent = msg;
  $('sub').textContent = sub;
  $('btns').hidden = !withButtons;
  bubble.classList.remove('show');
  void bubble.offsetWidth; // restart the pop-in transition
  bubble.classList.add('show');
}

function hideBubble() {
  bubble.classList.remove('show');
  window.api.setInteractive(false);
}

function burst(emojis, count = 18, spread = 460) {
  const box = buddyEl.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.textContent = emojis[i % emojis.length];
    p.style.left = `${box.left + BUDDY_W / 2}px`;
    p.style.top = `${box.top + 100}px`;
    document.body.appendChild(p);
    const dx = (Math.random() - 0.5) * spread;
    const dy = -100 - Math.random() * 240;
    p.animate(
      [
        { transform: 'translate(0,0) scale(.5)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy}px) scale(1.2) rotate(${dx / 2}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy + 140}px) scale(1) rotate(${dx}deg)`, opacity: 0 },
      ],
      { duration: 1600 + Math.random() * 800, easing: 'cubic-bezier(.2,.7,.3,1)', delay: Math.random() * 250 }
    ).finished.then(() => p.remove());
  }
}

function dust() {
  const box = buddyEl.getBoundingClientRect();
  for (const side of [-1, 1]) {
    const p = document.createElement('span');
    p.className = 'dust';
    p.style.left = `${box.left + BUDDY_W / 2 + side * 26}px`;
    p.style.top = `${box.bottom - 16}px`;
    document.body.appendChild(p);
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.7 },
        { transform: `translate(calc(-50% + ${side * 30}px), -70%) scale(1.4)`, opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' }
    ).finished.then(() => p.remove());
  }
}

// Why bother? One of these rides along with every reminder.
const WHY = [
  'Your brain is about 75% water. Even a little dehydration makes it foggy 🧠',
  'Tired or headachy? Often it is just thirst ⚡',
  'Water cushions your joints and keeps muscles working 💪',
  'Your kidneys need water to flush out waste 🚽',
  'Sweat cools you down, and water refills the tank 🌡️',
  'Look at me: low water = wrinkly, sweaty, grumpy 🥵',
];
const BENEFITS = ['🧠 Sharper focus', '⚡ More energy', '✨ Fresher skin', '💪 Happy muscles'];

function chip(text) {
  const box = buddyEl.getBoundingClientRect();
  const c = document.createElement('span');
  c.className = 'chip';
  c.textContent = text;
  c.style.left = `${box.left + BUDDY_W / 2}px`;
  c.style.top = `${box.top + 60}px`;
  document.body.appendChild(c);
  c.animate(
    [
      { transform: 'translate(-50%, 0) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, -70px) scale(1.1)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -120px) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -160px) scale(.9)', opacity: 0 },
    ],
    { duration: 1500, easing: 'cubic-bezier(.2,.7,.3,1)' }
  ).finished.then(() => c.remove());
}

// four 0.8 s hops side to side, popping up a benefit tag on each
async function chipHops() {
  const home = x;
  for (const [i, dx] of [55, -55, -55, 55].entries()) {
    chip(BENEFITS[i]);
    await moveTo(x + dx, y, Math.abs(dx) / (BEAT * 4), 'ease-in-out');
  }
  x = home;
}

// the closing line, with confetti
async function cheer(res) {
  const goalHit = res.count >= res.goal;
  burst(['🎉', '💧', '🌼', '✨', '😄', '🏆'], 26, 600);
  say(goalHit ? `Goal reached! 🏆 ${res.count}/${res.goal}` : `Superb! 🎉 ${res.count} / ${res.goal} glasses`,
      goalHit ? "You're a hydration hero!" : 'Stay hydrated — see you next time!');
  await wait(2000);
  hideBubble();
}

const tally = (res) => `${res.count} / ${res.goal} glasses today`;
const offRight = () => window.innerWidth + 40;
const offLeft = -BUDDY_W - 60;

function questionText() {
  const sub = `${WHY[Math.floor(Math.random() * WHY.length)]}\nToday: ${cfg.count} / ${cfg.goal} glasses`;
  if (cfg.reason === 'snooze') return ["I'm back! 💧 Ready for that water now?", sub];
  if (cfg.reason === 'manual') return ['Hi! 💧 Time for a glass of water?', sub];
  return [`Hey! 💧 It's been ${cfg.intervalMin} min. Time to drink water!`, sub];
}

// ---------- Droppy ----------

const droppy = {
  async enter(stopAt) {
    const entrance = pick('walk', 'crawl', 'dash');
    if (entrance === 'crawl') {
      setState('crawl');
      const stop = every(2200, () => play('croak'));
      await walkTo(stopAt, 170, 'ease-out');
      stop();
    } else if (entrance === 'dash') {
      setState('dash');
      play('whoosh');
      await walkTo(stopAt - 80, 800, 'ease-in');
      setState('skid');
      play('skid');
      const puffs = setInterval(dust, 100);
      await walkTo(stopAt, 160, 'ease-out');
      clearInterval(puffs);
      await wait(350);
    } else {
      setState('walking');
      await walkTo(stopAt, 240, 'cubic-bezier(.25,.1,.4,1)');
    }
  },

  async drink(res) {
    setState('happy');
    await wait(250);
    setState('drinking');
    play('gulp');
    await wait(2800);
    if (pick('aah', 'burp') === 'burp') {
      setState('happy', 'burp');
      play('burp');
      await wait(950);
      burst(['🫧'], 6, 160);
      say('*BURP* 😳 Oops, excuse me!', 'Gulped that one a bit fast…');
      await wait(1500);
    } else {
      setState('happy');
      play('aah');
      say('Aaah! 😌 So refreshing!');
      burst(['💧', '✨'], 8, 260);
      await wait(1200);
    }

    // dance — 32 beats: 16 of footwork, 16 of side hops, then a pose
    play('splash', 32, BEAT);
    const dustTimer = setInterval(dust, BEAT * 2000);
    setState('happy', 'dance');
    say('💧 Tank full! Splash dance!', tally(res));
    await wait(BEAT * 16 * 1000);
    setState('happy', 'dance', 'hop');
    burst(['🌼', '💧', '✨', '🎶'], 10);
    await chipHops();
    clearInterval(dustTimer);

    if (pick('flex', 'tada') === 'tada') {
      setState('happy', 'tada');
      play('tada');
    } else setState('happy', 'pose');
    await cheer(res);

    const off = offRight();
    const exit = pick('skip', 'cartwheel', 'moonwalk');
    if (exit === 'cartwheel') {
      const speed = 480;
      setState('happy', 'cartwheel');
      play('cartwheel', (off - x) / speed, 1.1);
      await walkTo(off, speed);
    } else if (exit === 'moonwalk') {
      const speed = Math.max(170, (off - x) / 4.5); // a gliding pace, but no more than ~4.5 s
      setState('happy', 'moonwalk');
      play('groove', Math.ceil((off - x) / speed / 0.3), 0.3);
      await walkTo(off, speed);
    } else {
      setState('happy', 'skip');
      await walkTo(off, 340);
    }
  },

  async later(res) {
    const style = pick('trudge', 'tantrum', 'melt');
    if (style === 'tantrum') {
      setState('sad', 'tantrum');
      play('stomp', 9, 0.26);
      say('Hmph! 😤 FINE!', `I'll be back in ${res.snoozeMin} min… still thirsty!`);
      const stomps = setInterval(dust, 260);
      await wait(2350);
      clearInterval(stomps);
      setState('sad');
      play('sniff');
      say('…but please drink soon? 🥺', 'Skipping water makes us both grumpy.');
      await wait(2000);
      hideBubble();
      setState('sad', 'walking');
      await walkTo(-BUDDY_W - 40, 130);
      return;
    }
    if (style === 'melt') {
      setState('sad');
      play('sad');
      say('Okay… 😢', `I'll come back in ${res.snoozeMin} min…`);
      await wait(1700);
      setState('sad', 'melt');
      play('melt');
      say("I'm… melting… 🫠", 'No water, no shape. Please drink soon!');
      await wait(3300);
      hideBubble();
      play('poof');
      await buddyEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1400, easing: 'ease-in', fill: 'forwards' }).finished; // evaporated
      return;
    }

    setState('sad');
    play('sad');
    say('Okay… 😢', `I'll come back in ${res.snoozeMin} min. Don't let us dry up! 🥵`);
    await wait(1700);
    play('sniff');
    await wait(1500);
    hideBubble();

    const exit = -BUDDY_W - 40;
    setState('sad', 'walking');
    await walkTo((x + exit) / 2 + 40, 110);
    setState('sad', 'lookback');
    play('sniff');
    say('…are you sure? 🥺');
    await wait(1500);
    hideBubble();
    setState('sad', 'walking');
    await walkTo(exit, 110);
  },
};

// ---------- Nimbus (cloud) ----------

const cloud = {
  async enter(stopAt) {
    place(x, -120);
    setState('float');
    play('breeze');
    await moveTo(stopAt, 0, 210, 'ease-out');
  },

  async drink(res) {
    setState('happy');
    await wait(250);
    setState('happy', 'drinking');
    play('slurp');
    await wait(2800);
    setState('happy');
    play('aah');
    say('Aaah! ☁️ All puffed up again!');
    burst(['💧', '✨'], 8, 260);
    await wait(1200);

    play('rainSong', 32, BEAT);
    setState('happy', 'rain');
    say('🌧️ Making it rain!', tally(res));
    await wait(BEAT * 16 * 1000);
    setState('happy', 'rainbow');
    burst(['🌈', '🌼', '💧', '✨'], 10);
    await chipHops();

    setState('happy');
    await cheer(res);
    setState('happy', 'zoom');
    play('whoosh');
    await moveTo(offRight(), -150, 650, 'ease-in');
  },

  async later(res) {
    setState('sad');
    play('sad');
    say('Okay… 😢', `I'll come back in ${res.snoozeMin} min…`);
    await wait(1700);
    setState('sad', 'storm');
    const rumbles = every(1200, () => play('thunder'), 300);
    say('Grrr… ⛈️ A thirsty cloud is a stormy cloud!', 'Please drink soon!');
    await wait(3300);
    rumbles();
    hideBubble();
    setState('sad', 'drift');
    play('breeze');
    await walkTo(offLeft, 120);
  },
};

// ---------- Glug (bottle) ----------

const bottle = {
  async enter(stopAt) {
    if (pick('roll', 'bounce') === 'roll') {
      setState('roll');
      play('whoosh');
      await walkTo(stopAt, 260); // matches its spin: no skidding
      setState('popup');
      play('boing');
      await wait(1000);
    } else {
      setState('bounce');
      const stop = every(450, () => play('thunk'), 400);
      await walkTo(stopAt, 220);
      stop();
    }
  },

  async drink(res) {
    setState('happy', 'refill');
    play('pour');
    await wait(2900);
    setState('happy');
    play('aah');
    say('Aaah! 🧴 Full to the brim!');
    burst(['💧', '✨'], 8, 260);
    await wait(1200);

    play('splash', 32, BEAT);
    setState('happy', 'shake');
    say('Shake it up! 🍾', tally(res));
    await wait(1600);
    play('pop');
    play('spray');
    burst(['💧', '💦'], 12, 300);
    await wait(BEAT * 16 * 1000 - 1600);
    setState('happy', 'flip');
    const thunks = every(800, () => play('thunk'), 650);
    await chipHops();
    thunks();

    setState('happy', 'pose');
    play('tada');
    await cheer(res);
    setState('happy', 'rocket');
    play('spray');
    play('whoosh');
    await moveTo(offRight(), -220, 600, 'ease-in');
  },

  async later(res) {
    setState('sad');
    play('sad');
    say('Okay… 😢', `I'll come back in ${res.snoozeMin} min…`);
    await wait(1700);
    setState('sad', 'crumple');
    play('crinkle');
    say("I'm all crumpled up… 😖", 'Empty bottles get squished!');
    await wait(1600);
    setState('sad', 'tipover');
    await wait(400);
    play('thunk');
    await wait(1000);
    hideBubble();
    setState('sad', 'roll');
    await walkTo(offLeft, 150);
  },
};

// ---------- Finn (fish) ----------

const fish = {
  async enter(stopAt) {
    setState('flop');
    const stop = every(600, () => play('flop'), 440);
    await walkTo(stopAt, 150);
    stop();
  },

  async drink(res) {
    setState('happy', 'splashdown');
    play('whoosh');
    await wait(600);
    play('sploosh');
    burst(['💦', '💧'], 10, 320);
    await wait(1400);
    setState('happy');
    play('aah');
    say('Aaah! 🐠 Back in the water!');
    burst(['🫧', '✨'], 8, 260);
    await wait(1200);

    play('bubbleTune', 32, BEAT);
    setState('happy', 'swim');
    say('🫧 Loop-the-loops!', tally(res));
    await wait(BEAT * 16 * 1000);
    setState('happy', 'leap');
    const plops = every(800, () => play('plop'), 100);
    await chipHops();
    plops();

    setState('happy', 'kiss');
    setTimeout(() => play('kiss'), 700);
    await cheer(res);
    setState('happy', 'swimaway');
    play('bubbles');
    await walkTo(offRight(), 300);
  },

  async later(res) {
    setState('sad');
    play('sad');
    say('Okay… 😢', `I'll come back in ${res.snoozeMin} min…`);
    await wait(1700);
    play('sniff');
    say('A fish out of water… 🥵', "I'm drying up here! Please drink soon.");
    await wait(1800);
    hideBubble();
    setState('sad', 'flop');
    const stop = every(750, () => play('flop'), 550);
    await walkTo(offLeft, 120);
    stop();
  },
};

const SCENES = { droppy, cloud, bottle, fish };
let scene = droppy;

async function onDrink() {
  if (answered) return;
  answered = true;
  hideBubble();
  await scene.drink(await window.api.choose('drink'));
  window.api.done();
}

async function onLater() {
  if (answered) return;
  answered = true;
  hideBubble();
  await scene.later(await window.api.choose('later'));
  window.api.done();
}

// If the scene breaks, leave the screen; main counts an unanswered close as "later".
const bail = (err) => {
  console.error(err);
  window.api.done();
};
const safely = (fn) => () => fn().catch(bail);

async function main() {
  cfg = await window.api.overlayInit();
  scene = SCENES[cfg.cast] || droppy;
  await window.Buddy.render(host, cfg);
  place(x, y);

  bubble.addEventListener('mouseenter', () => window.api.setInteractive(true));
  bubble.addEventListener('mouseleave', () => window.api.setInteractive(false));
  $('drink').addEventListener('click', safely(onDrink));
  $('later').addEventListener('click', safely(onLater));

  const stopAt = Math.max(20, window.innerWidth / 2 - BUDDY_W / 2 - 150); // centre buddy + bubble
  await scene.enter(stopAt);

  setState('hello');
  play('hop');
  await wait(500);
  setState('waving');
  play('hello');
  say(...questionText(), true);

  setTimeout(() => { if (!answered) setState('idle'); }, 2200);
  setTimeout(async () => {
    if (answered) return;
    setState('waving');
    $('sub').textContent = 'Pleeease? 🥺 Just one glass!';
    await wait(1600);
    if (!answered) setState('idle');
  }, 25000);
  setTimeout(() => { if (!answered) $('sub').textContent = 'Your body will thank you 💙'; }, 60000);
  setTimeout(() => { if (!answered) safely(onLater)(); }, cfg.autoSnoozeMs);
  if (cfg.demoChoice) setTimeout(safely(cfg.demoChoice === 'drink' ? onDrink : onLater), 1800);
}

main().catch(bail);
