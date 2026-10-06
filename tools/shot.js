// Dev helper: renders frozen buddy poses into a PNG contact sheet.
//   npx electron tools/shot.js out.png "walking@0.1|happy dance@0.3" [cols]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const [out, shots, colsArg, vh = '', cy = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const count = shots.split('|').length;
const cols = Number(colsArg) || Math.min(count, 6);
const rows = Math.ceil(count / cols);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: cols * 260, height: rows * 440, show: false, webPreferences: { offscreen: true } });
  win.webContents.on('console-message', (e) => console.log('[page]', e.message));
  const page = process.env.PAGE || 'shot.html';
  await win.loadFile(path.join(__dirname, '..', 'renderer', page), { query: { shots, vh, cy, cols: String(cols), av: process.env.AV || '', hide: process.env.HIDE || '' } });
  await new Promise((r) => setTimeout(r, Number(process.env.WAIT) || 1200));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('wrote', out, img.getSize());
  app.quit();
});
