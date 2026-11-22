const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  isNative: true,
  call: (type, payload = {}) => ipcRenderer.invoke(`native:${type}`, payload),
  post: (type, payload = {}) => ipcRenderer.send(`native:${type}`, payload),
  on: (channel, listener) => {
    const validChannels = ['beforeQuit'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(`native:${channel}`, (event, ...args) => listener(...args));
    }
  },
  off: (channel, listener) => {
    const validChannels = ['beforeQuit'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(`native:${channel}`, listener);
    }
  }
});

contextBridge.exposeInMainWorld('store', {
  get: (key, defaultValue) => {
    return new Promise((resolve) => {
      ipcRenderer.invoke('native:getStore', key).then(value => {
        try { resolve(value ? JSON.parse(value) : defaultValue); } catch { resolve(defaultValue); }
      });
    });
  },
  set: (key, value) => ipcRenderer.invoke('native:store', { key: 'sp:' + key, value: JSON.stringify(value) }),
  del: (key) => ipcRenderer.invoke('native:store', { key: 'sp:' + key, value: null })
});

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.invoke('native:getAllStore').then(store => {
    window.__SP_STORE = store || {};
    const event = new CustomEvent('sp-native-ready');
    window.dispatchEvent(event);
  });
});