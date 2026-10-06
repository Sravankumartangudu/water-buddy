const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  intervalMin: 30,
  snoozeMin: 10,
  activeHours: { enabled: true, start: '09:00', end: '21:00' },
  dailyGoal: 8,
  sound: true,
  paused: false,
  character: 'droppy', // 'droppy' (the water-drop mascot) or 'photo' (user's face on Droppy)
  head: null, // circular image data URL cropped from the user's photo
  log: { date: '', count: 0 },
};

const AUTO_SNOOZE_MS = 2 * 60 * 1000; // buddy gives up if ignored this long
const OVERLAY_MAX_MS = AUTO_SNOOZE_MS + 90 * 1000; // ...plus the longest goodbye; a stuck overlay is closed after this

let settings;
let tray;
let settingsWin = null;
let overlayWin = null;
let nextAt = 0;
let lastReason = 'interval';
let firstRun = false;
let shownDay = '';

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Keep a hand-edited or half-written file from breaking the timer.
function sanitize(s) {
  s.intervalMin = clampInt(s.intervalMin, 1, 600, DEFAULTS.intervalMin);
  s.snoozeMin = clampInt(s.snoozeMin, 1, 120, DEFAULTS.snoozeMin);
  s.dailyGoal = clampInt(s.dailyGoal, 1, 30, DEFAULTS.dailyGoal);
  if (!isTime(s.activeHours.start)) s.activeHours.start = DEFAULTS.activeHours.start;
  if (!isTime(s.activeHours.end)) s.activeHours.end = DEFAULTS.activeHours.end;
  s.log.count = clampInt(s.log.count, 0, 999, 0);
  delete s.colors; // left over from the human avatar
  return s;
}

function loadSettings() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') firstRun = true;
    else {
      console.error('settings.json is unreadable, starting fresh:', err.message);
      try { fs.renameSync(settingsFile(), `${settingsFile()}.bad`); } catch { /* keep going */ }
    }
    saved = {};
  }
  settings = sanitize({
    ...structuredClone(DEFAULTS),
    ...saved,
    activeHours: { ...DEFAULTS.activeHours, ...saved.activeHours },
    log: { ...DEFAULTS.log, ...saved.log },
  });
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    const tmp = `${settingsFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, settingsFile()); // atomic: a crash mid-write can't leave half a file
  } catch (err) {
    console.error('Could not save settings:', err.message);
  }
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayCount() {
  if (settings.log.date !== todayKey()) settings.log = { date: todayKey(), count: 0 };
  return settings.log.count;
}

// ---------- active hours ----------

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function inActiveHours(date) {
  const ah = settings.activeHours;
  if (!ah.enabled) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(ah.start);
  const end = toMinutes(ah.end);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end; // overnight ranges
}

function nextActiveStart(from) {
  const [h, m] = settings.activeHours.start.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// ---------- scheduling ----------

function schedule(minutes, reason = 'interval') {
  lastReason = reason;
  nextAt = Date.now() + minutes * 60 * 1000;
  if (!inActiveHours(new Date(nextAt))) {
    nextAt = nextActiveStart(nextAt);
    lastReason = 'interval'; // a new day, not "I'm back"
  }
  refreshUi();
}

function tick() {
  if (todayKey() !== shownDay) refreshUi(); // midnight: show the reset count
  if (settings.paused || overlayWin || Date.now() < nextAt) return;
  if (inActiveHours(new Date())) showReminder();
  else {
    nextAt = nextActiveStart(Date.now());
    lastReason = 'interval';
    refreshUi();
  }
}

function stateSnapshot() {
  return {
    settings: { ...settings, log: { date: todayKey(), count: todayCount() } },
    nextAt,
    reminding: !!overlayWin,
  };
}

function refreshUi() {
  shownDay = todayKey();
  updateTray();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('state', stateSnapshot());
}

// ---------- overlay (the walking buddy) ----------

function showReminder() {
  if (overlayWin) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const h = Math.min(460, height);

  overlayWin = new BrowserWindow({
    x,
    y: y + height - h,
    width,
    height: h,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  // skipTransformProcessType: otherwise this hides the Dock icon while Settings is open
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.once('ready-to-show', () => overlayWin.showInactive());

  // A broken or hung overlay must not block reminders forever: close it, which snoozes.
  const win = overlayWin;
  const kill = () => { if (!win.isDestroyed()) win.destroy(); };
  const safety = setTimeout(kill, OVERLAY_MAX_MS);
  win.webContents.on('render-process-gone', kill);
  win.webContents.on('did-fail-load', kill);
  win.on('unresponsive', kill);

  overlayWin.on('closed', () => {
    clearTimeout(safety);
    overlayWin = null;
    if (Date.now() >= nextAt) schedule(settings.snoozeMin, 'snooze'); // closed without an answer
    refreshUi();
  });
  refreshUi();
}

ipcMain.handle('overlay:init', () => ({
  character: settings.character,
  head: settings.head,
  sound: settings.sound,
  count: todayCount(),
  goal: settings.dailyGoal,
  intervalMin: settings.intervalMin,
  snoozeMin: settings.snoozeMin,
  reason: lastReason,
  autoSnoozeMs: AUTO_SNOOZE_MS,
  demoChoice: (process.argv.find((a) => a.startsWith('--demo=')) || '').split('=')[1] || null,
}));

ipcMain.handle('overlay:choice', (_e, choice) => {
  if (choice === 'drink') {
    todayCount();
    settings.log.count += 1;
    schedule(settings.intervalMin, 'interval');
  } else {
    schedule(settings.snoozeMin, 'snooze');
  }
  saveSettings();
  return { count: todayCount(), goal: settings.dailyGoal, snoozeMin: settings.snoozeMin };
});

ipcMain.on('overlay:mouse', (_e, interactive) => {
  if (overlayWin) overlayWin.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('overlay:done', () => {
  if (overlayWin) overlayWin.close();
});

// ---------- settings window ----------

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    app.focus({ steal: true });
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 820,
    title: 'Water Buddy',
    resizable: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  const win = settingsWin;
  win.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  // Menu-bar app: show Droppy in the Dock only while Settings is open. Bring the window to the
  // front once both are ready; activating before the Dock switch finishes leaves it behind other apps.
  const docked = app.dock ? app.dock.show().then(() => app.dock.setIcon(ICON)) : Promise.resolve();
  Promise.all([docked, new Promise((r) => win.once('ready-to-show', r))]).then(() => {
    if (win.isDestroyed()) return;
    win.show();
    app.focus({ steal: true });
    win.focus();
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
    if (app.dock) app.dock.hide();
  });
}

ipcMain.handle('state:get', () => stateSnapshot());

ipcMain.handle('settings:save', (_e, patch) => {
  const { logDelta, openAtLogin, log: _log, ...rest } = patch;
  const intervalChanged = rest.intervalMin !== undefined && rest.intervalMin !== settings.intervalMin;
  const hoursChanged = rest.activeHours !== undefined;
  const resumed = rest.paused === false && settings.paused;
  settings = sanitize({ ...settings, ...rest, activeHours: { ...settings.activeHours, ...rest.activeHours } });
  if (logDelta) {
    todayCount();
    settings.log.count = Math.max(0, settings.log.count + Math.sign(logDelta));
  }
  // from `npm start` this would register the bare Electron binary as a login item
  if (openAtLogin !== undefined && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!openAtLogin });
  saveSettings();
  if (intervalChanged || hoursChanged || resumed) schedule(settings.intervalMin);
  else refreshUi();
  return stateSnapshot();
});

ipcMain.handle('login:get', () => app.getLoginItemSettings().openAtLogin);

ipcMain.on('reminder:now', () => {
  lastReason = 'manual';
  showReminder();
});

// ---------- tray ----------

const ICON = path.join(__dirname, 'assets', 'icon.png'); // regenerate with `npm run icons`

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateTray() {
  if (!tray) return;
  const count = todayCount();
  tray.setTitle(` ${count}/${settings.dailyGoal}`);
  const status = settings.paused
    ? 'Reminders paused'
    : overlayWin
      ? 'Buddy is on screen now'
      : `Next reminder at ${fmtTime(nextAt)}`;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { label: `Today: ${count} of ${settings.dailyGoal} glasses`, enabled: false },
      { type: 'separator' },
      { label: 'Remind me now', click: () => { lastReason = 'manual'; showReminder(); } },
      {
        label: settings.paused ? 'Resume reminders' : 'Pause reminders',
        click: () => {
          settings.paused = !settings.paused;
          saveSettings();
          if (!settings.paused) schedule(settings.intervalMin);
          else refreshUi();
        },
      },
      { label: 'Settings…', click: openSettings },
      { type: 'separator' },
      { label: 'Quit Water Buddy', click: () => app.quit() },
    ])
  );
}

// ---------- app lifecycle ----------

app.commandLine.appendSwitch('enable-experimental-web-platform-features'); // FaceDetector for auto-cropping

// Block navigation (e.g. a file dropped on a window) and pop-ups in every window.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', openSettings);
  app.whenReady().then(start);
}

function start() {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadSettings();
  if (app.dock) app.dock.setIcon(ICON);
  tray = new Tray(path.join(__dirname, 'assets', 'trayTemplate.png')); // @2x is picked up automatically
  tray.setToolTip('Water Buddy');
  schedule(settings.intervalMin);
  setInterval(tick, 10 * 1000);
  // Opened by hand: show Settings. Started at login: stay quietly in the menu bar.
  if (firstRun || !app.getLoginItemSettings().wasOpenedAtLogin) openSettings();
  app.on('activate', openSettings); // re-opened from Finder/Spotlight while already running
  if (process.argv.some((a) => a.startsWith('--demo'))) setTimeout(() => { lastReason = 'manual'; showReminder(); }, 1500);
}

app.on('window-all-closed', () => {}); // keep running in the menu bar
