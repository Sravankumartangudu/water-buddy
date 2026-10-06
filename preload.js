const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // overlay
  overlayInit: () => ipcRenderer.invoke('overlay:init'),
  choose: (choice) => ipcRenderer.invoke('overlay:choice', choice),
  setInteractive: (on) => ipcRenderer.send('overlay:mouse', on),
  done: () => ipcRenderer.send('overlay:done'),

  // settings
  getState: () => ipcRenderer.invoke('state:get'),
  save: (patch) => ipcRenderer.invoke('settings:save', patch),
  getOpenAtLogin: () => ipcRenderer.invoke('login:get'),
  remindNow: () => ipcRenderer.send('reminder:now'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
