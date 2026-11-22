/*
 * Screenwriter Pro — Windows shell preload.
 *
 * The web app (resources/web/js/native.js) talks to its host through the same
 * protocol the macOS WKWebView shell uses:
 *   window.webkit.messageHandlers.native.postMessage({ type, id?, ...payload })
 * and expects replies via SP.native._reply(id, result) and a pre-loaded
 * window.__SP_STORE object. This preload recreates that environment.
 *
 * contextIsolation is off so these globals land in the page's own world; the
 * window only ever loads the bundled local files (see main.js).
 */
const { ipcRenderer } = require('electron');

// Persistent key/value store, loaded synchronously before any page script runs.
try {
  window.__SP_STORE = ipcRenderer.sendSync('native:store-all') || {};
} catch (e) {
  window.__SP_STORE = {};
}

window.webkit = {
  messageHandlers: {
    native: {
      postMessage: (msg) => {
        // Clone through JSON so only plain data crosses the IPC boundary.
        ipcRenderer.send('native:message', JSON.parse(JSON.stringify(msg || {})));
      }
    }
  }
};
