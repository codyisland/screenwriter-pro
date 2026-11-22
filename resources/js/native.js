/* Screenwriter Pro — Electron bridge (Windows/Linux/macOS) */
'use strict';
(() => {
  const bridge = window.native;
  const N = SP.native = { isNative: !!bridge };
  if (!bridge) return;
  document.documentElement.classList.add('native');

  let seq = 0; const waiting = new Map();
  N.call = (type, payload = {}) => new Promise(res => {
    const id = ++seq;
    waiting.set(id, res);
    bridge.call(type, { ...payload, __seq: id });
  });
  N.post = (type, payload = {}) => bridge.post(type, payload);
  N._reply = (id, result) => {
    const r = waiting.get(id);
    waiting.delete(id);
    if (r) r(result);
  };

  // Handle replies from main process
  bridge.onReply = (id, result) => N._reply(id, result);

  /* storage lives in main process (pre-loaded into window.__SP_STORE) */
  const mem = window.__SP_STORE || {};
  SP.store = {
    get(k, d) {
      const v = mem['sp:' + k];
      if (v == null) return d;
      try { return JSON.parse(v); } catch { return d; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      mem['sp:' + k] = s;
      N.post('store', { key: 'sp:' + k, value: s });
      return true;
    },
    del(k) {
      delete mem['sp:' + k];
      N.post('store', { key: 'sp:' + k, value: null });
    }
  };

  /* files: native open/save panels */
  SP.download = (name, data) => {
    N.call('saveAs', { name, data: String(data) }).then(r => {
      if (r && r.path) SP.ui.toast('Saved ' + r.name);
    });
  };

  SP.on('ready', () => {
    const IO = SP.io;
    IO.open = async () => {
      if (!(await IO.confirmDiscard())) return;
      const r = await N.call('open', { types: ['spro', 'fdx', 'fountain', 'txt', 'json'] });
      if (!r) return;
      try {
        IO.loadDoc(IO.openText(r.text, r.name), r.name);
        SP.ui.filePath = /\.spro$/i.test(r.name) ? r.path : null;
      } catch (e) {
        SP.ui.alert('Could not open: ' + e.message);
      }
    };
    IO.save = async (as) => {
      const data = IO.serialize();
      const r = await N.call('save', {
        name: (SP.doc.title || 'Untitled') + '.spro',
        data,
        path: as ? null : (SP.ui.filePath || null)
      });
      if (!r) return;
      SP.ui.filePath = r.path;
      SP.doc.title = r.name.replace(/\.spro$/i, '');
      IO.savedOk();
    };
    IO.pickFiles = async (accept, multiple) => {
      const r = await N.call('openMany', {
        types: accept.split(',').map(x => x.replace('.', '').trim()).filter(Boolean),
        multiple: !!multiple
      });
      return r || [];
    };
    const loadDoc = IO.loadDoc;
    IO.loadDoc = (doc, name) => { SP.ui.filePath = null; loadDoc(doc, name); };
  });

  SP.printDocument = (opts = {}) => {
    const { html } = SP.renderPrint(opts);
    const pr = SP.$('#print-root');
    pr.innerHTML = html;
    document.body.classList.add('printing');
    N.call('print', { title: SP.doc.title }).then(() => {
      document.body.classList.remove('printing');
      pr.innerHTML = '';
    });
  };

  N.printHTML = (html) => {
    const pr = SP.$('#print-root');
    pr.innerHTML = html;
    document.body.classList.add('printing');
    N.call('print', { title: SP.doc.title }).then(() => {
      document.body.classList.remove('printing');
      pr.innerHTML = '';
    });
  };

  window.print = () => {
    document.body.classList.add('printing');
    N.call('print', { title: SP.doc.title }).then(() => document.body.classList.remove('printing'));
  };

  /* native menu bar built from the same menu definitions as the web menu bar */
  const KEYMAP = { '⌘': 'cmd', '⇧': 'shift', '⌥': 'alt', '⌃': 'ctrl' };
  const parseKey = (k) => {
    if (!k) return null;
    const mods = []; let key = '';
    for (const ch of k) { if (KEYMAP[ch]) mods.push(KEYMAP[ch]); else key += ch; }
    if (!mods.length) return null;
    key = key === '−' ? '-' : key.toLowerCase();
    return { key, mods };
  };
  let runs = [];
  const serialize = (items) => items.map(raw => {
    const it = SP.menus.norm(raw);
    if (it.sep) return { sep: true };
    const sub = typeof it.sub === 'function' ? it.sub() : it.sub;
    const o = { title: it.label, checked: !!(it.check && it.check()), disabled: !!it.disabled, key: parseKey(it.key || it.hint) };
    if (sub) o.sub = serialize(sub);
    else if (it.run) { o.id = 'r' + runs.length; runs.push(it.run); }
    else if (it.cmd) o.id = 'c:' + it.cmd;
    return o;
  });
  N.pushMenu = () => {
    runs = [];
    N.post('menu', { menus: SP.menus.list().map(([title, items]) => ({ title, items: serialize(items) })) });
  };
  N.menu = (id) => {
    if (id.startsWith('c:')) { const c = SP.commands[id.slice(2)]; if (c) c(); }
    else if (id.startsWith('r')) { const f = runs[+id.slice(1)]; if (f) f(); }
    setTimeout(N.pushMenu, 50);
  };
  let mt = 0; const soon = () => { clearTimeout(mt); mt = setTimeout(N.pushMenu, 250); };
  ['render', 'settings', 'layout', 'loaded', 'saved'].forEach(e => SP.on(e, soon));
  SP.on('dirty', () => {
    clearTimeout(N._dt);
    N._dt = setTimeout(() => N.post('title', { title: SP.doc.title, edited: !!SP.ui.dirty, path: SP.ui.filePath || null }), 200);
  });
  SP.on('saved', () => N.post('title', { title: SP.doc.title, edited: false, path: SP.ui.filePath || null }));
  SP.on('loaded', () => N.post('title', { title: SP.doc.title, edited: false, path: null }));
  N.beforeQuit = () => { try { SP.io.autosave(); } catch {} return true; };

  // Listen for menu actions from main process
  bridge.onMenuAction((id) => N.menu(id));
  // Listen for before-quit
  bridge.onBeforeQuit(() => { try { SP.io.autosave(); } catch {} });
})();