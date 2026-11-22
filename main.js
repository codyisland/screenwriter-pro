const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
const userDataPath = app.getPath('userData');
const storePath = path.join(userDataPath, 'store.json');

function loadStore() {
  try {
    if (fs.existsSync(storePath)) {
      return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function saveStore(store) {
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  } catch (e) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Screenwriter Pro',
    icon: path.join(__dirname, 'resources/web/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ececec',
      symbolColor: '#4d4d4d',
      height: 26
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'resources/web/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for native functionality
ipcMain.handle('native:open', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Screenwriter Pro', extensions: ['spro'] },
      { name: 'Final Draft', extensions: ['fdx'] },
      { name: 'Fountain', extensions: ['fountain', 'txt'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const text = fs.readFileSync(filePath, 'utf-8');
  return { path: filePath, text, name: path.basename(filePath) };
});

ipcMain.handle('native:openMany', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported', extensions: options.types || ['spro', 'fdx', 'fountain', 'txt', 'json'] }
    ]
  });
  return result.canceled ? [] : result.filePaths.map(p => ({ path: p, name: path.basename(p), text: fs.readFileSync(p, 'utf-8') }));
});

ipcMain.handle('native:save', async (event, options) => {
  const defaultName = options.name || 'Untitled.spro';
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Screenwriter Pro', extensions: ['spro'] }]
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, options.data);
  return { path: result.filePath, name: path.basename(result.filePath) };
});

ipcMain.handle('native:saveAs', async (event, options) => {
  return ipcMain.handle('native:save', event, options);
});

ipcMain.handle('native:print', async (event, options) => {
  if (mainWindow) {
    await mainWindow.webContents.print({ silent: false, printBackground: true });
  }
  return true;
});

ipcMain.handle('native:store', async (event, data) => {
  const store = loadStore();
  if (data.value === null) {
    delete store[data.key];
  } else {
    store[data.key] = data.value;
  }
  saveStore(store);
  return true;
});

ipcMain.handle('native:getStore', async (event, key) => {
  const store = loadStore();
  return store[key] || null;
});

ipcMain.handle('native:getAllStore', async () => {
  return loadStore();
});

ipcMain.handle('native:setTitle', async (event, data) => {
  if (mainWindow) {
    const title = data.edited ? `• ${data.title} — Screenwriter Pro` : `${data.title} — Screenwriter Pro`;
    mainWindow.setTitle(title);
  }
});

app.on('before-quit', (event) => {
  if (mainWindow) {
    mainWindow.webContents.send('native:beforeQuit');
    event.preventDefault();
    setTimeout(() => app.exit(0), 500);
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});