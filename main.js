/*
 * Screenwriter Pro — Windows shell (Electron).
 * Hosts the same web app bundled in the macOS app and implements its native
 * bridge: open/save dialogs, printing, persistent store, menu bar, window title.
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'Screenwriter Pro';
const WEB_ROOT = path.join(__dirname, 'resources', 'web');

let mainWindow = null;
let quitting = false;
let openFileOnStart = process.argv.slice(app.isPackaged ? 1 : 2).find(a => /\.(spro|fdx|fountain)$/i.test(a)) || null;

/* ---------- persistent store (mirrors Application Support/Store on macOS) ---------- */
const storePath = () => path.join(app.getPath('userData'), 'store.json');
let store = null;
let storeTimer = null;

function loadStore() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(storePath(), 'utf-8')) || {}; } catch { store = {}; }
  return store;
}
function flushStore() {
  clearTimeout(storeTimer); storeTimer = null;
  if (!store) return;
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    const tmp = storePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, storePath());
  } catch (e) { console.error('store write failed', e); }
}
function scheduleFlush() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(flushStore, 400);
}

ipcMain.on('native:store-all', (e) => { e.returnValue = loadStore(); });

/* ---------- reply helper ---------- */
function reply(wc, id, result) {
  if (id == null || wc.isDestroyed()) return;
  wc.executeJavaScript(`SP.native._reply(${JSON.stringify(id)}, ${JSON.stringify(result === undefined ? null : result)})`).catch(() => {});
}

const FILTERS = {
  spro: { name: 'Screenwriter Pro', extensions: ['spro'] },
  fdx: { name: 'Final Draft', extensions: ['fdx'] },
  fountain: { name: 'Fountain', extensions: ['fountain'] },
  txt: { name: 'Text', extensions: ['txt'] },
  json: { name: 'JSON', extensions: ['json'] }
};
function filtersFor(types) {
  const list = (types && types.length ? types : ['spro', 'fdx', 'fountain', 'txt', 'json']).map(t => String(t).toLowerCase());
  return [{ name: 'Supported Files', extensions: list }, ...list.map(t => FILTERS[t]).filter(Boolean), { name: 'All Files', extensions: ['*'] }];
}
const readEntry = (p) => ({ path: p, name: path.basename(p), text: fs.readFileSync(p, 'utf-8') });

/* ---------- message handlers ---------- */
const handlers = {
  async open(msg) {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filtersFor(msg.types) });
    if (r.canceled || !r.filePaths.length) return null;
    return readEntry(r.filePaths[0]);
  },
  async openMany(msg) {
    const props = ['openFile']; if (msg.multiple) props.push('multiSelections');
    const r = await dialog.showOpenDialog(mainWindow, { properties: props, filters: filtersFor(msg.types) });
    if (r.canceled) return [];
    return r.filePaths.map(readEntry);
  },
  async save(msg) {
    let file = msg.path;
    if (!file) {
      const r = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(app.getPath('documents'), msg.name || 'Untitled.spro'),
        filters: [FILTERS.spro]
      });
      if (r.canceled || !r.filePath) return null;
      file = r.filePath;
    }
    fs.writeFileSync(file, String(msg.data ?? ''), 'utf-8');
    app.addRecentDocument(file);
    return { path: file, name: path.basename(file) };
  },
  async saveAs(msg) {
    const name = msg.name || 'Untitled.txt';
    const ext = path.extname(name).slice(1).toLowerCase();
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), name),
      filters: ext ? [FILTERS[ext] || { name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }] : undefined
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(msg.data ?? ''), 'utf-8');
    return { path: r.filePath, name: path.basename(r.filePath) };
  },
  async print(msg, wc) {
    // Let the page apply its print layout before the dialog snapshots it.
    await new Promise(res => setTimeout(res, 150));
    return new Promise(res => wc.print({ silent: false, printBackground: true }, (ok) => res(!!ok)));
  },
  store(msg) {
    loadStore();
    if (msg.value == null) delete store[msg.key]; else store[msg.key] = msg.value;
    scheduleFlush();
  },
  title(msg) {
    if (!mainWindow) return;
    const t = msg.title || 'Untitled';
    mainWindow.setTitle(`${msg.edited ? '• ' : ''}${t} — ${APP_NAME}`);
    mainWindow.setDocumentEdited && mainWindow.setDocumentEdited(!!msg.edited);
    if (msg.path) mainWindow.setRepresentedFilename && mainWindow.setRepresentedFilename(msg.path);
  },
  menu(msg, wc) {
    buildMenu(msg.menus || [], wc);
  }
};

ipcMain.on('native:message', async (e, msg) => {
  const h = msg && handlers[msg.type];
  if (!h) return;
  try {
    const result = await h(msg, e.sender);
    reply(e.sender, msg.id, result);
  } catch (err) {
    console.error(msg.type, err);
    dialog.showErrorBox(APP_NAME, String(err && err.message || err));
    reply(e.sender, msg.id, null);
  }
});

/* ---------- menu bar built from the web app's menu definitions ---------- */
function accelerator(key) {
  if (!key || !key.key) return undefined;
  const map = { cmd: 'CmdOrCtrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };
  let k = key.key;
  const named = { '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right', '⏎': 'Enter', '↩': 'Enter', '⌫': 'Backspace', '⇥': 'Tab', ' ': 'Space', '+': 'Plus', '=': '=' };
  if (named[k]) k = named[k];
  else if (k.length === 1) k = k.toUpperCase();
  else if (k.length > 1 && !/^(f\d+|tab|space|enter|up|down|left|right|backspace|delete|home|end|pageup|pagedown|esc|escape)$/i.test(k)) return undefined;
  const mods = key.mods.map(m => map[m]).filter(Boolean);
  // ctrl+cmd both map to Ctrl on Windows; dedupe.
  return [...new Set(mods.map(m => (m === 'CmdOrCtrl' && mods.includes('Ctrl')) ? 'Ctrl' : m))].concat(k).join('+');
}

function toTemplate(items, wc) {
  return items.map(it => {
    if (it.sep) return { type: 'separator' };
    const o = { label: String(it.title || '').replace(/&/g, '&&'), enabled: !it.disabled };
    if (it.checked) { o.type = 'checkbox'; o.checked = true; }
    const acc = accelerator(it.key);
    if (acc) { o.accelerator = acc; o.registerAccelerator = false; } // the web app handles its own shortcuts
    if (it.sub) o.submenu = toTemplate(it.sub, wc);
    else if (it.id) o.click = () => { if (!wc.isDestroyed()) wc.executeJavaScript(`SP.native.menu(${JSON.stringify(it.id)})`).catch(() => {}); };
    return o;
  });
}

function buildMenu(menus, wc) {
  const template = menus.map(m => ({ label: m.title, submenu: toTemplate(m.items || [], wc) }));
  template.push({
    label: 'Window',
    submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' }
    ]
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- window ---------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(WEB_ROOT, 'icons', 'icon-512.png'),
    backgroundColor: '#ececec',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  // Minimal menu until the web app pushes its own.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }]));

  mainWindow.loadFile(path.join(WEB_ROOT, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.once('did-finish-load', () => {
    if (openFileOnStart) { openPath(openFileOnStart); openFileOnStart = null; }
  });

  // Never navigate away from the bundled app; send links to the browser.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Mic access for dictation.
  mainWindow.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));

  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    const wc = mainWindow.webContents;
    const done = () => { quitting = true; flushStore(); mainWindow.close(); };
    const t = setTimeout(done, 2000);
    wc.executeJavaScript('SP.native && SP.native.beforeQuit && SP.native.beforeQuit()')
      .catch(() => {})
      .finally(() => setTimeout(() => { clearTimeout(t); done(); }, 150)); // let autosave store messages arrive
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Open a file passed on the command line / via file association.
function openPath(p) {
  if (!mainWindow) return;
  try {
    const entry = readEntry(p);
    const js = `(() => { const IO = SP.io, r = ${JSON.stringify(entry)};
      IO.loadDoc(IO.openText(r.text, r.name), r.name);
      SP.ui.filePath = /\\.spro$/i.test(r.name) ? r.path : null; })()`;
    mainWindow.webContents.executeJavaScript(js).catch(err => dialog.showErrorBox(APP_NAME, 'Could not open: ' + err.message));
  } catch (err) {
    dialog.showErrorBox(APP_NAME, 'Could not open: ' + err.message);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const f = argv.find(a => /\.(spro|fdx|fountain)$/i.test(a));
    if (f) openPath(f);
  });

  app.setAppUserModelId('com.screenwriterpro.app');
  app.whenReady().then(createWindow);
  app.on('before-quit', flushStore);
  app.on('window-all-closed', () => app.quit());
}
