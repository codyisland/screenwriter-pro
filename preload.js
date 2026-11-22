const { contextBridge, ipcRenderer } = require('electron');

const nativeBridge = {
  isNative: true,
  call: (type, payload = {}) => ipcRenderer.invoke(`native:${type}`, payload),
  post: (type, payload = {}) => ipcRenderer.send(`native:${type}`, payload),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (_, id) => callback(id)),
  onBeforeQuit: (callback) => ipcRenderer.on('before-quit', callback),
  pushMenu: () => ipcRenderer.send('menu', []),
};

contextBridge.exposeInMainWorld('native', nativeBridge);

// Pre-load store
const store = {};
ipcRenderer.invoke('native:getStore', 'sp:').then(data => {
  if (data) Object.assign(store, data);
});
contextBridge.exposeInMainWorld('__SP_STORE', store);

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('native');
});