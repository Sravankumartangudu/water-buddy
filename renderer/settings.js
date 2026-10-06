const $ = (id) => document.getElementById(id);
const PRESETS = [15, 30, 45, 60, 90];
const EYE_LINE = 0.45; // fraction of head height — must match the overlays in character.js
const MOUTH_LINE = 0.72;

let state;
let previewMood = '';

// ---------- rendering ----------

function renderToday() {
  const s = state.settings;
  const count = s.log.count;
  $('count').textContent = count;
  $('goal-label').textContent = s.dailyGoal;
  $('bar').style.width = `${Math.min(100, (count / s.dailyGoal) * 100)}%`;
  $('pause').textContent = s.paused ? '▶ Resume' : '⏸ Pause';
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
  window.Buddy.render($('preview'), s);
  $('preview').className = `buddy-host ${previewMood}`;
  const isPhoto = s.character === 'photo' && !!s.head;
  document.querySelectorAll('input[name=character]').forEach((r) => (r.checked = r.value === (isPhoto ? 'photo' : 'droppy')));
  $('char-photo').disabled = !s.head;
  $('colors').classList.add('hidden'); // Droppy has no skin/shirt/pants to recolor
  document.querySelectorAll('[data-color]').forEach((el) => (el.value = s.colors[el.dataset.color]));
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
}

async function save(patch) {
  state = await window.api.save(patch);
  renderToday();
  return state;
}

// ---------- controls ----------

$('plus').onclick = () => save({ log: { count: state.settings.log.count + 1 } });
$('minus').onclick = () => save({ log: { count: state.settings.log.count - 1 } });
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
$('login').onchange = (e) => save({ openAtLogin: e.target.checked });

document.querySelectorAll('[data-mood]').forEach((b) => {
  b.onclick = () => {
    previewMood = previewMood === b.dataset.mood ? '' : b.dataset.mood;
    // clear first so one-shot animations (drinking) replay
    $('preview').className = 'buddy-host';
    requestAnimationFrame(() => ($('preview').className = `buddy-host ${previewMood}`));
  };
});

document.querySelectorAll('input[name=character]').forEach((r) => {
  r.onchange = async () => {
    await save({ character: r.value });
    renderPreview();
  };
});

document.querySelectorAll('[data-color]').forEach((el) => {
  el.oninput = () => {
    state.settings.colors = { ...state.settings.colors, [el.dataset.color]: el.value };
    window.Buddy.render($('preview'), state.settings);
  };
  el.onchange = () => save({ colors: state.settings.colors });
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
$('file').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => startCrop(img);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
};

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

// Average colour of a square patch given in crop-canvas coordinates; null if off the photo.
function samplePatch(src, x, y, half) {
  const { img, ox, oy, scale } = crop;
  const sx = Math.round((x - half - ox) / scale);
  const sy = Math.round((y - half - oy) / scale);
  const size = Math.max(2, Math.round((2 * half) / scale));
  if (sx < 0 || sy < 0 || sx + size > img.naturalWidth || sy + size > img.naturalHeight) return null;
  const data = src.getImageData(sx, sy, size, size).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  return '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
}

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
  const head = out.toDataURL('image/png');

  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  const f = full.getContext('2d', { willReadFrequently: true });
  f.drawImage(img, 0, 0);
  const colors = { ...state.settings.colors };
  const skin = samplePatch(f, cx - r * 0.38, cy + r * 0.2, r * 0.08) || samplePatch(f, cx, cy - r * 0.35, r * 0.08);
  const shirt = samplePatch(f, cx, cy + r * 2.0, r * 0.3);
  const pants = samplePatch(f, cx, cy + r * 6.2, r * 0.25);
  if (skin) colors.skin = skin;
  if (shirt) colors.shirt = shirt;
  if (pants) colors.pants = pants;

  await save({ head, colors, character: 'photo' });
  $('crop-wrap').classList.add('hidden');
  previewMood = 'happy dance';
  renderPreview();
};

// ---------- boot ----------

window.api.onState((s) => {
  state = s;
  renderToday();
});

(async () => {
  state = await window.api.getState();
  $('login').checked = await window.api.getOpenAtLogin();
  renderAll();
})();
