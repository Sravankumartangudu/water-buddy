// Reminder scene. The buddy walks in from the left, hops, waves and asks. Then either:
//   drink → drinks, fills up, "aah", splash dance + benefit tags, flexes, skips off to the right
//   later → a smug sun dries the buddy out, sniffles, trudges back left, looks back once, leaves
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const buddyEl = $('buddy');
const host = $('svg-host');
const bubble = $('bubble');
const BUDDY_W = 170;
const BEAT = 0.2; // seconds per dance step

let cfg;
let x = -BUDDY_W - 20;
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

async function walkTo(target, pxPerSec, easing = 'linear') {
  const from = x;
  x = target;
  setDir(target >= from ? 1 : -1);
  await buddyEl.animate(
    [{ transform: `translateX(${from}px)` }, { transform: `translateX(${target}px)` }],
    { duration: (Math.abs(target - from) / pxPerSec) * 1000, easing, fill: 'forwards' }
  ).finished;
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

function questionText() {
  const sub = `${WHY[Math.floor(Math.random() * WHY.length)]}\nToday: ${cfg.count} / ${cfg.goal} glasses`;
  if (cfg.reason === 'snooze') return ["I'm back! 💧 Ready for that water now?", sub];
  if (cfg.reason === 'manual') return ['Hi! 💧 Time for a glass of water?', sub];
  return [`Hey! 💧 It's been ${cfg.intervalMin} min. Time to drink water!`, sub];
}

async function onDrink() {
  if (answered) return;
  answered = true;
  hideBubble();
  const res = await window.api.choose('drink');

  // drink
  setState('happy');
  await wait(250);
  setState('drinking');
  play('gulp');
  await wait(2800);
  setState('happy');
  play('aah');
  say('Aaah! 😌 So refreshing!');
  burst(['💧', '✨'], 8, 260);
  await wait(1200);

  // dance — 32 beats: 16 of footwork, 16 of side hops, then a pose
  const goalHit = res.count >= res.goal;
  play('splash', 32, BEAT);
  const dustTimer = setInterval(dust, BEAT * 2000);
  setState('happy', 'dance');
  say('💧 Tank full! Splash dance!', `${res.count} / ${res.goal} glasses today`);
  await wait(BEAT * 16 * 1000);

  setState('happy', 'dance', 'hop');
  burst(['🌼', '💧', '✨', '🎶'], 10);
  const hop = BEAT * 4 * 1000;
  const home = x;
  for (const [i, dx] of [55, -55, -55, 55].entries()) {
    chip(BENEFITS[i]);
    const target = x + dx;
    x = target;
    await buddyEl.animate([{ transform: `translateX(${target - dx}px)` }, { transform: `translateX(${target}px)` }],
      { duration: hop, easing: 'ease-in-out', fill: 'forwards' }).finished;
  }
  x = home;
  clearInterval(dustTimer);

  setState('happy', 'pose');
  burst(['🎉', '💧', '🌼', '✨', '😄', '🏆'], 26, 600);
  say(goalHit ? `Goal reached! 🏆 ${res.count}/${res.goal}` : `Superb! 🎉 ${res.count} / ${res.goal} glasses`,
      goalHit ? "You're a hydration hero!" : 'Stay hydrated — see you next time!');
  await wait(2000);

  hideBubble();
  setState('happy', 'skip');
  await walkTo(window.innerWidth + 40, 340);
  window.api.done();
}

async function onLater() {
  if (answered) return;
  answered = true;
  hideBubble();
  const res = await window.api.choose('later');

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
  await window.Buddy.render(host, cfg);
  buddyEl.style.transform = `translateX(${x}px)`;

  bubble.addEventListener('mouseenter', () => window.api.setInteractive(true));
  bubble.addEventListener('mouseleave', () => window.api.setInteractive(false));
  $('drink').addEventListener('click', safely(onDrink));
  $('later').addEventListener('click', safely(onLater));

  setState('walking');
  const stopAt = Math.max(20, window.innerWidth / 2 - BUDDY_W / 2 - 150); // centre buddy + bubble
  await walkTo(stopAt, 240, 'cubic-bezier(.25,.1,.4,1)');

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
