const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(__dirname, 'resources', 'AppIcon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#ffffff',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // electron-builder copies resources/* to app root (alongside main.js)
    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window title updates
  ipcMain.on('title', (event, { title, edited, path: filePath }) => {
    const displayTitle = title ? `${title}${edited ? ' ●' : ''} - Screenwriter Pro` : 'Screenwriter Pro';
    mainWindow.setTitle(displayTitle);
    if (filePath) {
      mainWindow.setRepresentedFilename(filePath);
      mainWindow.setDocumentEdited(edited);
    }
  });

  // Handle menu actions from renderer
  ipcMain.on('menu', (event, menus) => {
    // Menu is built in preload, this is for updates
  });

  // Handle menu commands from native
  ipcMain.on('menu-action', (event, id) => {
    mainWindow.webContents.send('menu-action', id);
  });

  // Handle window close with unsaved changes
  mainWindow.on('close', async (e) => {
    if (mainWindow.webContents) {
      const canClose = await new Promise(resolve => {
        mainWindow.webContents.send('before-quit');
        // Give renderer time to respond
        setTimeout(() => resolve(true), 100);
      });
      if (!canClose) e.preventDefault();
    }
  });
}

// Native bridge handlers
ipcMain.handle('native:saveAs', async (event, { name, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Script',
    defaultPath: name,
    filters: [
      { name: 'Screenwriter Pro', extensions: ['spro'] },
      { name: 'Final Draft', extensions: ['fdx'] },
      { name: 'Fountain', extensions: ['fountain', 'txt'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, data);
    return { path: filePath, name: path.basename(filePath) };
  }
  return null;
});

ipcMain.handle('native:open', async (event, { types }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Script',
    properties: ['openFile'],
    filters: [
      { name: 'Scripts', extensions: types },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!canceled && filePaths[0]) {
    const text = fs.readFileSync(filePaths[0], 'utf-8');
    return { text, name: path.basename(filePaths[0]), path: filePaths[0] };
  }
  return null;
});

ipcMain.handle('native:openMany', async (event, { types, multiple }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Files',
    properties: ['openFile', multiple ? 'multiSelections' : ''].filter(Boolean),
    filters: [
      { name: 'Scripts', extensions: types },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!canceled) return filePaths.map(p => ({ path: p, name: path.basename(p), text: fs.readFileSync(p, 'utf-8') }));
  return [];
});

ipcMain.handle('native:save', async (event, { name, data, path: existingPath }) => {
  let filePath = existingPath;
  if (!filePath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Script',
      defaultPath: name,
      filters: [
        { name: 'Screenwriter Pro', extensions: ['spro'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled) return null;
    filePath = newPath;
  }
  fs.writeFileSync(filePath, data);
  return { path: filePath, name: path.basename(filePath) };
});

ipcMain.handle('native:print', async (event, { title }) => {
  if (mainWindow) {
    mainWindow.webContents.print({ silent: false, printBackground: true });
  }
  return true;
});

ipcMain.handle('native:store', async (event, { key, value }) => {
  // Store in userData
  const storePath = path.join(app.getPath('userData'), 'store.json');
  let store = {};
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf-8')); } catch {}
  if (value === null) delete store[key];
  else store[key] = value;
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  return true;
});

ipcMain.handle('native:getStore', async (event, key) => {
  const storePath = path.join(app.getPath('userData'), 'store.json');
  try {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    return store[key] || null;
  } catch {
    return null;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  // Ask renderer to autosave
  if (mainWindow) {
    mainWindow.webContents.send('before-quit');
    event.preventDefault();
    // Give time for autosave
    setTimeout(() => app.exit(0), 500);
  }
});