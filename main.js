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
  head: null, // circular PNG data URL cropped from the user's photo
  colors: { skin: '#f1c27d', shirt: '#3b82f6', pants: '#1f2937', shoes: '#111827' },
  log: { date: '', count: 0 },
};

const AUTO_SNOOZE_MS = 2 * 60 * 1000; // buddy gives up if ignored this long

let settings;
let tray;
let settingsWin = null;
let overlayWin = null;
let nextAt = 0;
let lastReason = 'interval';

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = {
      ...DEFAULTS,
      ...saved,
      activeHours: { ...DEFAULTS.activeHours, ...saved.activeHours },
      colors: { ...DEFAULTS.colors, ...saved.colors },
      log: { ...DEFAULTS.log, ...saved.log },
    };
  } catch {
    settings = structuredClone(DEFAULTS);
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
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
  if (!inActiveHours(new Date(nextAt))) nextAt = nextActiveStart(nextAt);
  refreshUi();
}

function tick() {
  if (settings.paused || overlayWin || Date.now() < nextAt) return;
  if (inActiveHours(new Date())) showReminder();
  else {
    nextAt = nextActiveStart(Date.now());
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
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.once('ready-to-show', () => overlayWin.showInactive());
  overlayWin.on('closed', () => {
    overlayWin = null;
    if (Date.now() >= nextAt) schedule(settings.snoozeMin, 'snooze'); // closed without an answer
    refreshUi();
  });
  refreshUi();
}

ipcMain.handle('overlay:init', () => ({
  character: settings.character,
  head: settings.head,
  colors: settings.colors,
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
    saveSettings();
    schedule(settings.intervalMin, 'interval');
  } else {
    schedule(settings.snoozeMin, 'snooze');
  }
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
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 820,
    title: 'Water Buddy',
    resizable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  // menu-bar app: show Droppy in the Dock only while Settings is open
  if (app.dock) app.dock.show().then(() => app.dock.setIcon(ICON));
  settingsWin.on('closed', () => {
    settingsWin = null;
    if (app.dock) app.dock.hide();
  });
}

ipcMain.handle('state:get', () => stateSnapshot());

ipcMain.handle('settings:save', (_e, patch) => {
  const intervalChanged = patch.intervalMin !== undefined && patch.intervalMin !== settings.intervalMin;
  const hoursChanged = patch.activeHours !== undefined;
  const resumed = patch.paused === false && settings.paused;
  settings = { ...settings, ...patch };
  if (patch.log) settings.log = { date: todayKey(), count: Math.max(0, patch.log.count) };
  if (patch.openAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin });
    delete settings.openAtLogin;
  }
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

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', openSettings);

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadSettings();
  if (app.dock) app.dock.setIcon(ICON);
  tray = new Tray(path.join(__dirname, 'assets', 'trayTemplate.png')); // @2x is picked up automatically
  tray.setToolTip('Water Buddy');
  schedule(settings.intervalMin);
  setInterval(tick, 10 * 1000);
  openSettings();
  app.on('activate', openSettings); // re-opened from Finder/Spotlight while already running
  if (process.argv.some((a) => a.startsWith('--demo'))) setTimeout(() => { lastReason = 'manual'; showReminder(); }, 1500);
});

app.on('window-all-closed', () => {}); // keep running in the menu bar
