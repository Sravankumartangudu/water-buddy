const $ = (id) => document.getElementById(id);
const RING = 251.33; // circumference of the progress ring (r = 40)
const PRESETS = [15, 30, 45, 60, 90];
const EYE_LINE = 0.45; // fraction of head height — must match the overlays in character.js
const MOUTH_LINE = 0.72;

const CASTS = [['droppy', '💧', 'Droppy'], ['cloud', '☁️', 'Nimbus'], ['bottle', '🧴', 'Glug'], ['fish', '🐠', 'Finn']];

let state;
let previewMood = '';
let previewCast = null; // which character the preview shows; starts as the one picked to visit

// ---------- rendering ----------

/* fleet-styles:begin js */
/* Fleet styles kit v1 (script half). Copy kept in Nexus/styles. Only the Settings page needs it; the pages that
   wear a style get <html data-style> from Swift (FleetStyles.wear) and need only the CSS half.
   FleetStyles.picker(box, styles, current, onPick)   draws the Style cards (radios, name=uiStyle) into box the first
       time and ticks `current` every time; styles = [{ id, name, blurb }] from the app (FleetStyles.list in Swift).
       onPick(id) runs when the user picks one: post it to the app the way the page posts its other settings.
   FleetStyles.picked(box)   the ticked style's id */
window.FleetStyles = window.FleetStyles || (function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  function picker(box, styles, current, onPick) {
    if (!box) return;
    box.classList.add("st-grid");
    if (!box.childElementCount) {
      for (const { id, name, blurb } of styles || []) {
        const input = el("input"); input.type = "radio"; input.name = "uiStyle"; input.value = id;
        input.addEventListener("change", e => { e.stopPropagation(); if (input.checked && onPick) onPick(id); });
        const pv = el("div", "st-pv st-" + id), card = el("b", "c");
        card.append(el("i"), el("i"));
        pv.append(el("b", "h"), card, el("b", "k"), el("b", "p"));
        const label = el("label"); label.title = blurb || "";
        label.append(input, pv, el("span", "st-n", name), el("span", "st-d", blurb));
        box.append(label);
      }
    }
    for (const i of box.querySelectorAll("input[name=uiStyle]")) i.checked = i.value === current;
  }
  const picked = box => ((box || document).querySelector("input[name=uiStyle]:checked") || {}).value;
  return { picker, picked };
})();
/* fleet-styles:end js */

// Style: the design this window wears (the main process puts it on <html data-style>).
function renderStyle() {
  window.FleetStyles.picker($('styles'), state.styles, state.settings.uiStyle, (id) => save({ uiStyle: id }));
  $('style-fleet').hidden = !state.styleFleet;
}

function renderToday() {
  const s = state.settings;
  const count = s.log.count;
  $('count').textContent = count;
  $('goal-label').textContent = s.dailyGoal;
  const frac = Math.min(1, count / s.dailyGoal);
  $('ring-fill').style.strokeDashoffset = RING * (1 - frac);
  $('ring').classList.toggle('done', count >= s.dailyGoal);
  $('ring').setAttribute('aria-label', `Today's water intake: ${count} of ${s.dailyGoal} glasses`);
  $('pause').textContent = s.paused ? '▶ Resume' : '⏸ Pause';
  const pauseLabel = s.paused ? 'Resume reminders' : 'Pause reminders';
  $('pause').title = pauseLabel;
  $('pause').setAttribute('aria-label', pauseLabel);
  const time = new Date(state.nextAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('status').textContent = s.paused ? 'Reminders paused' : state.reminding ? 'Buddy is on screen now 👋' : `Next reminder at ${time}`;
}

function renderInterval() {
  const iv = state.settings.intervalMin;
  const chips = PRESETS.map((m) => {
    const b = document.createElement('button');
    b.className = `chip${m === iv ? ' active' : ''}`;
    b.textContent = m < 60 ? `${m} min` : m === 60 ? '1 hour' : `${m / 60} hours`;
    b.onclick = () => save({ intervalMin: m }).then(renderInterval);
    return b;
  });
  $('chips').replaceChildren(...chips);
  $('custom').value = iv;
}

function renderPreview() {
  const s = state.settings;
  previewCast ||= s.cast === 'rotate' ? 'droppy' : s.cast;
  window.Buddy.render($('preview'), { ...s, cast: previewCast });
  $('preview').className = `buddy-host ${previewMood}`;
  const isPhoto = s.character === 'photo' && !!s.head;
  document.querySelectorAll('input[name=character]').forEach((r) => (r.checked = r.value === (isPhoto ? 'photo' : 'droppy')));
  document.querySelectorAll('input[name=cast]').forEach((r) => (r.checked = r.value === s.cast));
  document.querySelectorAll('input[name=appearance]').forEach((r) => (r.checked = r.value === s.appearance));
  $('char-photo').disabled = !s.head;
  renderCasts();
}

function renderCasts() {
  $('casts').replaceChildren(...CASTS.map(([kind, emoji, name]) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.title = `Preview ${name}`;
    b.classList.toggle('on', kind === previewCast);
    b.onclick = () => {
      if (kind === previewCast) return;
      previewCast = kind;
      previewMood = '';
      renderPreview();
    };
    return b;
  }));
  // each character has its own moves
  $('moods').replaceChildren(...window.Buddy.moves(previewCast).map(([mood, emoji, title]) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.title = title;
    b.classList.toggle('on', mood === previewMood);
    b.onclick = () => {
      previewMood = previewMood === mood ? '' : mood;
      $('moods').querySelectorAll('button').forEach((o) => o.classList.toggle('on', o === b && !!previewMood));
      // clear first so one-shot animations (drinking) replay
      $('preview').className = 'buddy-host';
      requestAnimationFrame(() => ($('preview').className = `buddy-host ${previewMood}`));
    };
    return b;
  }));
}

function renderAll() {
  const s = state.settings;
  renderToday();
  renderInterval();
  $('snooze').value = s.snoozeMin;
  $('ah-on').checked = s.activeHours.enabled;
  $('ah-start').value = s.activeHours.start;
  $('ah-end').value = s.activeHours.end;
  $('goal').value = s.dailyGoal;
  $('sound').checked = s.sound;
  renderPreview();
  renderStyle();
}

let toastTimer;
function saved() {
  const t = $('toast');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

async function save(patch) {
  state = await window.api.save(patch);
  renderToday();
  if (patch.logDelta === undefined) saved(); // the ring already shows glass changes
  return state;
}

// ---------- controls ----------

// relative, so a window left open overnight can't write yesterday's count back
$('plus').onclick = () => save({ logDelta: 1 });
$('minus').onclick = () => save({ logDelta: -1 });
$('pause').onclick = () => save({ paused: !state.settings.paused });
$('now').onclick = () => window.api.remindNow();

$('custom').onchange = (e) => {
  const v = Math.round(Number(e.target.value));
  if (v >= 1 && v <= 600) save({ intervalMin: v }).then(renderInterval);
  else e.target.value = state.settings.intervalMin;
};
$('snooze').onchange = (e) => save({ snoozeMin: Number(e.target.value) });

const saveHours = () =>
  save({ activeHours: { enabled: $('ah-on').checked, start: $('ah-start').value || '09:00', end: $('ah-end').value || '21:00' } });
$('ah-on').onchange = saveHours;
$('ah-start').onchange = saveHours;
$('ah-end').onchange = saveHours;

$('goal').onchange = (e) => {
  const v = Math.round(Number(e.target.value));
  if (v >= 1 && v <= 30) save({ dailyGoal: v });
  else e.target.value = state.settings.dailyGoal;
};
$('sound').onchange = (e) => save({ sound: e.target.checked });
$('login').onchange = async (e) => {
  await save({ openAtLogin: e.target.checked });
  e.target.checked = await window.api.getOpenAtLogin(); // macOS may refuse
};

document.querySelectorAll('input[name=appearance]').forEach((r) => {
  r.onchange = () => save({ appearance: r.value });
});

document.querySelectorAll('input[name=cast]').forEach((r) => {
  r.onchange = async () => {
    await save({ cast: r.value });
    if (r.value !== 'rotate') previewCast = r.value;
    previewMood = '';
    renderPreview();
  };
});

document.querySelectorAll('input[name=character]').forEach((r) => {
  r.onchange = async () => {
    await save({ character: r.value });
    previewCast = 'droppy'; // the face only goes on Droppy
    renderPreview();
  };
});

// ---------- photo cropper ----------

const canvas = $('crop');
const ctx = canvas.getContext('2d');
const SIZE = 320;
const dpr = window.devicePixelRatio || 1;
canvas.width = SIZE * dpr;
canvas.height = SIZE * dpr;

const crop = { img: null, scale: 1, ox: 0, oy: 0, cx: 160, cy: 80, r: 40, drag: null };

$('upload').onclick = () => $('file').click();
function loadPhoto(file) {
  if (!file) return;
  $('photo-error').classList.add('hidden');
  const img = new Image();
  img.onload = () => startCrop(img);
  img.onerror = () => $('photo-error').classList.remove('hidden'); // e.g. HEIC
  const reader = new FileReader();
  reader.onload = () => (img.src = reader.result);
  reader.onerror = img.onerror;
  reader.readAsDataURL(file);
}
$('file').onchange = (e) => {
  loadPhoto(e.target.files[0]);
  e.target.value = '';
};
// dropping a photo anywhere on the window crops it instead of navigating to it
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  loadPhoto(file);
});

async function startCrop(img) {
  crop.img = img;
  crop.scale = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
  const dw = img.naturalWidth * crop.scale;
  const dh = img.naturalHeight * crop.scale;
  crop.ox = (SIZE - dw) / 2;
  crop.oy = (SIZE - dh) / 2;
  // Rough guess for a full-body photo: head near the top-centre.
  crop.r = Math.max(14, Math.min(dw, dh) * (dh > dw * 1.3 ? 0.16 : 0.3));
  crop.cx = SIZE / 2;
  crop.cy = crop.oy + crop.r * 1.3;

  // Use the built-in face detector when Chromium provides it.
  if ('FaceDetector' in window) {
    try {
      const [face] = await new window.FaceDetector({ maxDetectedFaces: 1 }).detect(img);
      if (face) {
        const b = face.boundingBox;
        crop.r = Math.max(b.width, b.height) * 0.78 * crop.scale;
        crop.cx = crop.ox + (b.x + b.width / 2) * crop.scale;
        crop.cy = crop.oy + (b.y + b.height * 0.42) * crop.scale;
      }
    } catch { /* fall back to the guess */ }
  }

  $('radius').value = crop.r;
  $('crop-wrap').classList.remove('hidden');
  drawCrop();
  $('crop-wrap').scrollIntoView({ behavior: 'smooth' });
}

function drawCrop() {
  const { img, ox, oy, scale, cx, cy, r } = crop;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, ox, oy, img.naturalWidth * scale, img.naturalHeight * scale);

  ctx.beginPath();
  ctx.rect(0, 0, SIZE, SIZE);
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.font = '10px -apple-system, sans-serif';
  for (const [frac, label, color] of [[EYE_LINE, 'eyes', '#38bdf8'], [MOUTH_LINE, 'mouth', '#f472b6']]) {
    const y = cy - r + 2 * r * frac;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx + half, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, cx + half + 4, y + 3);
  }
  ctx.setLineDash([]);
}

const pointerPos = (e) => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};
canvas.addEventListener('pointerdown', (e) => {
  const p = pointerPos(e);
  crop.drag = { dx: p.x - crop.cx, dy: p.y - crop.cy };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!crop.drag) return;
  const p = pointerPos(e);
  crop.cx = p.x - crop.drag.dx;
  crop.cy = p.y - crop.drag.dy;
  drawCrop();
});
canvas.addEventListener('pointerup', () => (crop.drag = null));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  crop.r = Math.min(160, Math.max(12, crop.r - e.deltaY * 0.1));
  $('radius').value = crop.r;
  drawCrop();
}, { passive: false });
$('radius').oninput = (e) => {
  crop.r = Number(e.target.value);
  drawCrop();
};
$('cancel-crop').onclick = () => $('crop-wrap').classList.add('hidden');

$('use-face').onclick = async () => {
  const { img, ox, oy, scale, cx, cy, r } = crop;

  const out = document.createElement('canvas');
  out.width = out.height = 256;
  const o = out.getContext('2d');
  o.beginPath();
  o.arc(128, 128, 128, 0, Math.PI * 2);
  o.clip();
  const s = (2 * r) / scale;
  o.drawImage(img, (cx - r - ox) / scale, (cy - r - oy) / scale, s, s, 0, 0, 256, 256);
  const head = out.toDataURL('image/webp', 0.85);

  await save({ head, character: 'photo' });
  $('crop-wrap').classList.add('hidden');
  previewCast = 'droppy';
  previewMood = 'happy dance';
  renderPreview();
};

// ---------- boot ----------

window.api.onState((s) => {
  state = s;
  renderToday();
  renderStyle(); // a pick made in the common settings
});

(async () => {
  state = await window.api.getState();
  $('login').checked = await window.api.getOpenAtLogin();
  renderAll();
})();
