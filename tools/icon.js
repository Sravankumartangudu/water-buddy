// Builds the app icons from Droppy:
//   assets/icon.png (1024), assets/icon.icns, assets/trayTemplate.png + @2x (menu-bar drop)
//   npm run icons [-- state time]   e.g. npm run icons -- "happy waving" 0.5
const { app, BrowserWindow, nativeImage } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [state = 'happy', t = '0.6'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = path.join(__dirname, '..', 'assets');

// Menu-bar template image: a solid drop with a highlight cut out (macOS tints it for light/dark).
function trayIcon(px) {
  const win = new BrowserWindow({ width: px, height: px, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<style>body{margin:0;background:transparent}canvas{display:block}</style><canvas id=c width=${px} height=${px}></canvas><script>
    const c = document.getElementById('c').getContext('2d'), s = ${px} / 18;
    c.scale(s, s);
    c.beginPath(); c.moveTo(9, 1.2);
    c.bezierCurveTo(9, 1.2, 3.2, 7.6, 3.2, 11.2); c.bezierCurveTo(3.2, 14.6, 5.8, 16.8, 9, 16.8);
    c.bezierCurveTo(12.2, 16.8, 14.8, 14.6, 14.8, 11.2); c.bezierCurveTo(14.8, 7.6, 9, 1.2, 9, 1.2);
    c.fillStyle = '#000'; c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 1.5; c.lineCap = 'round';
    c.beginPath(); c.arc(9, 11.2, 3.4, Math.PI * 0.95, Math.PI * 1.35); c.stroke();
  </script>`;
  return win.loadURL(`data:text/html,${encodeURIComponent(html)}`).then(async () => {
    const img = await win.webContents.capturePage();
    win.destroy();
    return img.resize({ width: px, height: px }).toPNG();
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  win.webContents.on('console-message', (e) => console.log('[page]', e.message));
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'icon.html'), { query: { state, t } });
  await new Promise((r) => setTimeout(r, 1500));
  const big = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(path.join(out, 'icon.png'), big.toPNG());

  // .icns via iconutil
  const set = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-')) + '/icon.iconset';
  fs.mkdirSync(set);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const k of [1, 2]) {
      const px = size * k;
      fs.writeFileSync(`${set}/icon_${size}x${size}${k > 1 ? '@2x' : ''}.png`, big.resize({ width: px, height: px, quality: 'best' }).toPNG());
    }
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')]);

  fs.writeFileSync(path.join(out, 'trayTemplate.png'), await trayIcon(18));
  fs.writeFileSync(path.join(out, 'trayTemplate@2x.png'), await trayIcon(36));
  console.log('wrote', fs.readdirSync(out).join(', '));
  app.quit();
});
