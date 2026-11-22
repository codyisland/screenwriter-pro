/* Screenwriter Pro — views: layout/split, navigator, index cards, scene view, beat board, outline bar. */
'use strict';
(() => {
const V = SP.views = {};

/* ---------- layout ---------- */
SP.setView = (view, opts = {}) => {
  SP.editor.sync();
  SP.ui.view = view;
  if (opts.split !== undefined) SP.ui.split = opts.split;
  V.layout();
};
SP.setMode = (mode) => { SP.ui.mode = mode; SP.store.set('mode', mode); if (SP.ui.view !== 'script' && SP.ui.split !== 'script') SP.ui.view = 'script'; V.layout(); };
V.layout = () => {
  const a = SP.$('#pane-a'), b = SP.$('#pane-b');
  const primary = SP.ui.view; const second = SP.ui.split && SP.ui.split !== primary ? SP.ui.split : null;
  b.hidden = !second;
  SP.$('#panes').className = second ? (SP.ui.splitDir === 'h' ? 'split-h' : 'split-v') : '';
  V.renderInto(a, primary);
  if (second) V.renderInto(b, second);
  SP.$$('#view-seg button').forEach(x => x.classList.toggle('on', x.dataset.view === primary));
  SP.$$('#mode-seg button').forEach(x => x.classList.toggle('on', x.dataset.mode === SP.ui.mode));
  SP.emit('layout');
};
V.renderInto = (pane, view) => {
  pane.dataset.view = view;
  if (view === 'script') {
    Array.from(pane.children).forEach(c => { if (!c.classList.contains('script-wrap')) c.remove(); });
    if (!SP.editor.root) SP.editor.mount(pane); else SP.editor.detachTo(pane);
    SP.editor.render();
    return;
  }
  if (SP.editor.wrap && SP.editor.wrap.parentNode === pane) SP.editor.wrap.remove();
  pane.innerHTML = '';
  if (view === 'cards') V.cards(pane);
  if (view === 'sceneview') V.sceneView(pane);
  if (view === 'beatboard') V.beatBoard(pane);
};
V.refreshNonScript = () => {
  ['#pane-a', '#pane-b'].forEach(sel => {
    const pane = SP.$(sel); if (pane.hidden) return;
    const v = pane.dataset.view;
    if (v === 'cards' || v === 'sceneview') V.renderInto(pane, v);
  });
};

/* ---------- scene reordering ---------- */
SP.moveScene = (fromId, beforeId) => {
  SP.editor.sync(); SP.pushUndo(true);
  const sc = SP.scenes(); const from = sc.find(s => s.id === fromId); if (!from || fromId === beforeId) return;
  const ids = new Set(from.paras.map(p => p.id));
  const block = SP.doc.paras.filter(p => ids.has(p.id));
  SP.doc.paras = SP.doc.paras.filter(p => !ids.has(p.id));
  let at = beforeId ? SP.paraIndex(beforeId) : SP.doc.paras.length;
  if (at < 0) at = SP.doc.paras.length;
  SP.doc.paras.splice(at, 0, ...block);
  SP.markDirty(); SP.renderAll();
};
const sceneText = (s, n = 260) => s.paras.slice(1).map(p => SP.textOf(p.html)).join(' ').slice(0, n);
const scenePage = (() => { let cache = null, key = ''; return (id) => {
  const k = SP.doc.modified; if (k !== key) { key = k; cache = new Map(); SP.paginate(SP.doc.paras).forEach(pg => pg.items.forEach(it => { if (!cache.has(it.para.id)) cache.set(it.para.id, pg.label); })); }
  return cache.get(id) || '';
}; })();
SP.pageOf = scenePage;

function colorMenu(x, y, cb) {
  SP.ui.popupMenu(x, y, [{ label: 'None', action: () => cb(null) }, ...Object.entries(SP.COLORS).map(([n, c]) => ({ label: n, swatch: c, action: () => cb(c) }))]);
}
function dragList(container, itemSel, onDrop) {
  let dragId = null;
  container.addEventListener('dragstart', e => { const it = e.target.closest(itemSel); if (!it) return; dragId = it.dataset.id; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
  container.addEventListener('dragend', e => { SP.$$('.dragging,.drop-before', container).forEach(x => x.classList.remove('dragging', 'drop-before')); });
  container.addEventListener('dragover', e => { const it = e.target.closest(itemSel); if (!dragId) return; e.preventDefault(); SP.$$('.drop-before', container).forEach(x => x.classList.remove('drop-before')); if (it) it.classList.add('drop-before'); });
  container.addEventListener('drop', e => { e.preventDefault(); const it = e.target.closest(itemSel); const id = dragId; dragId = null; onDrop(id, it ? it.dataset.id : null); });
}

/* ---------- index cards ---------- */
V.cardOpts = { across: 4, content: 'summary' };
V.cards = (pane) => {
  const o = V.cardOpts;
  pane.innerHTML = `<div class="view-toolbar">
    <span>Index Cards</span>
    <label>Show <select class="cd-content"><option value="summary">Summary</option><option value="script">Script text</option></select></label>
    <label>Cards across <input type="number" class="cd-across" min="1" max="8" value="${o.across}"></label>
    <button class="cd-print">Print Cards…</button>
    <button class="cd-new">+ New Scene</button></div>
    <div class="cards-grid" style="grid-template-columns:repeat(${o.across},minmax(0,1fr))"></div>`;
  SP.$('.cd-content', pane).value = o.content;
  const grid = SP.$('.cards-grid', pane);
  const sc = SP.scenes();
  grid.innerHTML = sc.map(s => `<div class="card" draggable="true" data-id="${s.id}" style="--c:${s.para.color || 'transparent'}">
      <div class="card-head"><span class="card-num">${SP.esc(SP.sceneNumber(s))}</span><span class="card-title">${SP.esc(s.heading || '(untitled scene)')}</span><button class="card-color" title="Color">●</button></div>
      ${s.para.label ? `<div class="card-label">${SP.esc(s.para.label)}</div>` : ''}
      ${o.content === 'summary'
        ? `<div class="card-body" contenteditable="true" data-ph="Write a summary…">${SP.esc(s.para.summary || '')}</div>`
        : `<div class="card-body ro">${SP.esc(sceneText(s, 400))}</div>`}
      <div class="card-foot">p. ${scenePage(s.id)} · ${s.paras.length - 1} elements${s.para.omitted ? ' · OMITTED' : ''}</div></div>`).join('') || '<div class="empty">No scenes yet. Add Scene Headings in the script.</div>';
  grid.addEventListener('input', e => { const c = e.target.closest('.card'); if (c && e.target.classList.contains('card-body')) { const p = SP.para(c.dataset.id); p.summary = e.target.textContent; SP.markDirty(); } });
  grid.addEventListener('dblclick', e => { const c = e.target.closest('.card'); if (c && !e.target.isContentEditable) SP.editor.goTo(c.dataset.id); });
  grid.addEventListener('click', e => { if (e.target.classList.contains('card-color')) { const c = e.target.closest('.card'); const r = e.target.getBoundingClientRect(); colorMenu(r.left, r.bottom, col => { SP.para(c.dataset.id).color = col; SP.markDirty(); V.renderInto(pane, 'cards'); SP.editor.decorateSoon(); }); } });
  dragList(grid, '.card', (from, before) => SP.moveScene(from, before));
  SP.$('.cd-content', pane).onchange = e => { o.content = e.target.value; V.cards(pane); };
  SP.$('.cd-across', pane).onchange = e => { o.across = +e.target.value || 4; V.cards(pane); };
  SP.$('.cd-new', pane).onclick = () => { SP.editor.sync(); SP.pushUndo(true); const p = { id: SP.uid(), type: 'scene', html: 'INT. NEW SCENE - DAY' }; SP.doc.paras.push(p, { id: SP.uid(), type: 'action', html: '' }); SP.markDirty(); SP.renderAll(); };
  SP.$('.cd-print', pane).onclick = () => SP.tools.printCards();
};

/* ---------- scene view (list) ---------- */
V.sceneOpts = { showAction: true, showSummary: true };
V.sceneView = (pane) => {
  const o = V.sceneOpts;
  pane.innerHTML = `<div class="view-toolbar"><span>Scene View</span>
    <label><input type="checkbox" class="sv-act" ${o.showAction ? 'checked' : ''}> Show Action</label>
    <label><input type="checkbox" class="sv-sum" ${o.showSummary ? 'checked' : ''}> Show Summary</label></div><div class="scene-list"></div>`;
  const list = SP.$('.scene-list', pane);
  list.innerHTML = SP.scenes().map(s => `<div class="scene-row" draggable="true" data-id="${s.id}" style="--c:${s.para.color || 'var(--line)'}">
    <div class="sr-num">${SP.esc(SP.sceneNumber(s))}</div>
    <div class="sr-main"><div class="sr-head">${SP.esc(s.heading || '(untitled)')}</div>
      ${o.showSummary && s.para.summary ? `<div class="sr-sum">${SP.esc(s.para.summary)}</div>` : ''}
      ${o.showAction ? `<div class="sr-act">${SP.esc(sceneText(s))}</div>` : ''}</div>
    <div class="sr-page">p. ${scenePage(s.id)}</div></div>`).join('') || '<div class="empty">No scenes yet.</div>';
  list.addEventListener('click', e => { const r = e.target.closest('.scene-row'); if (r) SP.editor.goTo(r.dataset.id); });
  dragList(list, '.scene-row', (from, before) => SP.moveScene(from, before));
  SP.$('.sv-act', pane).onchange = e => { o.showAction = e.target.checked; V.sceneView(pane); };
  SP.$('.sv-sum', pane).onchange = e => { o.showSummary = e.target.checked; V.sceneView(pane); };
};

/* ---------- beat board ---------- */
const BB = V.bb = { zoom: 1, panX: 0, panY: 0, sel: new Set(), snap: true, connectMode: null };
V.beatBoard = (pane) => {
  pane.innerHTML = `<div class="view-toolbar bb-toolbar">
    <span>Beat Board</span>
    <button data-bb="new">+ Beat</button>
    <button data-bb="image">+ Image</button>
    <button data-bb="color">Color</button>
    <button data-bb="row">Make Row</button><button data-bb="col">Make Column</button><button data-bb="grid">To Grid</button>
    <button data-bb="connect" title="Select two beats">Connect →</button><button data-bb="connect2">⇄</button><button data-bb="connectR">←</button><button data-bb="connectL">—</button><button data-bb="disconnect">Disconnect</button>
    <label><input type="checkbox" data-bb="snap" ${BB.snap ? 'checked' : ''}> Grid Snapping</label>
    <button data-bb="send" title="Send selected beats to the script at the cursor">Send to Script</button>
    <button data-bb="storymap" title="Add selected beats to the Story Map at the cursor">Send to Story Map</button>
    <button data-bb="delete">Delete</button>
    <span class="bb-zoom"><button data-bb="zout">−</button><span class="bb-z">${Math.round(BB.zoom * 100)}%</span><button data-bb="zin">+</button><button data-bb="fit">Fit</button></span>
  </div>
  <div class="bb"><div class="bb-canvas"><svg class="bb-svg"><defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker>
  </defs><g class="bb-lines"></g></svg><div class="bb-beats"></div></div>
  <div class="bb-hint">Double-click empty space to add a beat · drag the top strip to move · Shift-click to multi-select · Delete to remove</div></div>`;
  const board = SP.$('.bb', pane), canvas = SP.$('.bb-canvas', pane);
  V.bbDraw(pane);
  const toBoard = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - BB.panX) / BB.zoom, y: (cy - r.top - BB.panY) / BB.zoom }; };
  board.addEventListener('dblclick', e => { if (e.target.closest('.beat')) return; const pt = toBoard(e.clientX, e.clientY); V.addBeat(pt.x - 110, pt.y - 20); V.bbDraw(pane); });
  // pan
  board.addEventListener('pointerdown', e => {
    if (e.target.closest('.beat') || e.button !== 0) return;
    BB.sel.clear(); V.bbDraw(pane);
    const sx = e.clientX, sy = e.clientY, px = BB.panX, py = BB.panY;
    const mv = ev => { BB.panX = px + ev.clientX - sx; BB.panY = py + ev.clientY - sy; canvas.style.transform = `translate(${BB.panX}px,${BB.panY}px) scale(${BB.zoom})`; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  board.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) { BB.panX -= e.deltaX; BB.panY -= e.deltaY; } else { BB.zoom = Math.min(2.5, Math.max(0.25, BB.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); } e.preventDefault(); canvas.style.transform = `translate(${BB.panX}px,${BB.panY}px) scale(${BB.zoom})`; SP.$('.bb-z', pane).textContent = Math.round(BB.zoom * 100) + '%'; }, { passive: false });
  // beats: select, drag, resize, edit
  const beats = SP.$('.bb-beats', pane);
  beats.addEventListener('pointerdown', e => {
    const el = e.target.closest('.beat'); if (!el) return;
    const id = el.dataset.id;
    if (e.shiftKey) { BB.sel.has(id) ? BB.sel.delete(id) : BB.sel.add(id); } else if (!BB.sel.has(id)) { BB.sel.clear(); BB.sel.add(id); }
    SP.$$('.beat', beats).forEach(b => b.classList.toggle('sel', BB.sel.has(b.dataset.id)));
    const handle = e.target.closest('.beat-strip'); const rs = e.target.closest('.beat-resize');
    if (!handle && !rs) return;
    e.preventDefault(); SP.pushUndo(true);
    const start = { x: e.clientX, y: e.clientY };
    const moving = [...BB.sel].map(i => SP.doc.beats.find(b => b.id === i)).filter(Boolean);
    const orig = moving.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    const mv = ev => {
      const dx = (ev.clientX - start.x) / BB.zoom, dy = (ev.clientY - start.y) / BB.zoom;
      const snap = v => BB.snap ? Math.round(v / 20) * 20 : v;
      moving.forEach((b, i) => {
        if (rs) { b.w = Math.max(120, snap(orig[i].w + dx)); b.h = Math.max(80, snap(orig[i].h + dy)); }
        else { b.x = snap(orig[i].x + dx); b.y = snap(orig[i].y + dy); }
        const node = SP.$(`.beat[data-id="${b.id}"]`, beats); if (node) Object.assign(node.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      });
      V.bbLines(pane);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); SP.markDirty(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  beats.addEventListener('input', e => {
    const el = e.target.closest('.beat'); if (!el) return; const b = SP.doc.beats.find(x => x.id === el.dataset.id);
    if (e.target.classList.contains('beat-title')) b.title = e.target.textContent; else if (e.target.classList.contains('beat-body')) b.body = e.target.innerText;
    SP.markDirty();
  });
  pane.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.isContentEditable && BB.sel.size) { V.bbAction('delete', pane); } });
  pane.tabIndex = 0;
  SP.$('.bb-toolbar', pane).addEventListener('click', e => { const b = e.target.closest('[data-bb]'); if (b && b.tagName === 'BUTTON') V.bbAction(b.dataset.bb, pane, b); });
  SP.$('[data-bb="snap"]', pane).onchange = e => { BB.snap = e.target.checked; };
};
V.addBeat = (x, y, title = '', body = '') => {
  SP.pushUndo(true);
  const b = { id: SP.uid(), x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20, w: 220, h: 150, title, body, color: '#ffe066' };
  SP.doc.beats.push(b); BB.sel = new Set([b.id]); SP.markDirty(); return b;
};
V.bbDraw = (pane) => {
  const beats = SP.$('.bb-beats', pane); if (!beats) return;
  SP.$('.bb-canvas', pane).style.transform = `translate(${BB.panX}px,${BB.panY}px) scale(${BB.zoom})`;
  beats.innerHTML = SP.doc.beats.map(b => `<div class="beat${BB.sel.has(b.id) ? ' sel' : ''}" data-id="${b.id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--c:${b.color || '#ffe066'}">
    <div class="beat-strip"></div>
    ${b.image ? `<img class="beat-img" src="${b.image}" alt="">` : ''}
    <div class="beat-title" contenteditable="true" data-ph="Beat title">${SP.esc(b.title)}</div>
    <div class="beat-body" contenteditable="true" data-ph="Notes, ideas, images…">${SP.esc(b.body).replace(/\n/g, '<br>')}</div>
    <div class="beat-resize"></div></div>`).join('');
  V.bbLines(pane);
};
V.bbLines = (pane) => {
  const g = SP.$('.bb-lines', pane); if (!g) return;
  const by = new Map(SP.doc.beats.map(b => [b.id, b]));
  const edge = (a, b) => { // point on a's border toward b's center
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by2 = b.y + b.h / 2;
    const dx = bx - ax, dy = by2 - ay; const sx = (a.w / 2) / Math.abs(dx || 1e-6), sy = (a.h / 2) / Math.abs(dy || 1e-6); const s = Math.min(sx, sy);
    return [ax + dx * s, ay + dy * s];
  };
  g.innerHTML = SP.doc.connections.map(c => {
    const a = by.get(c.from), b = by.get(c.to); if (!a || !b) return '';
    const [x1, y1] = edge(a, b), [x2, y2] = edge(b, a);
    const ms = c.style === 'double' || c.style === 'reverse' ? 'marker-start="url(#arrow)"' : '';
    const me = c.style === 'arrow' || c.style === 'double' ? 'marker-end="url(#arrow)"' : '';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c.color || '#888'}" stroke-width="2.5" ${ms} ${me}/>`;
  }).join('');
};
V.bbAction = async (act, pane, btn) => {
  const sel = [...BB.sel].map(i => SP.doc.beats.find(b => b.id === i)).filter(Boolean);
  const redraw = () => { SP.markDirty(); V.bbDraw(pane); };
  switch (act) {
    case 'new': { const r = SP.$('.bb', pane).getBoundingClientRect(); V.addBeat((r.width / 2 - BB.panX) / BB.zoom - 110, (r.height / 2 - BB.panY) / BB.zoom - 75); redraw(); break; }
    case 'image': {
      const inp = SP.$('#file-input'); inp.accept = 'image/*'; inp.multiple = false; inp.value = '';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { const b = V.addBeat(60 - BB.panX, 60 - BB.panY, f.name.replace(/\.\w+$/, '')); b.image = fr.result; b.h = 240; redraw(); }; fr.readAsDataURL(f); };
      inp.click(); break;
    }
    case 'color': { if (!sel.length) return SP.ui.toast('Select beats first.'); const r = btn.getBoundingClientRect(); colorMenu(r.left, r.bottom, c => { SP.pushUndo(true); sel.forEach(b => b.color = c || '#ffe066'); redraw(); }); break; }
    case 'row': case 'col': {
      if (sel.length < 2) return SP.ui.toast('Select two or more beats.');
      SP.pushUndo(true); const s2 = sel.sort((a, b) => act === 'row' ? a.x - b.x : a.y - b.y);
      let pos = act === 'row' ? s2[0].x : s2[0].y;
      s2.forEach(b => { if (act === 'row') { b.y = s2[0].y; b.x = pos; pos += b.w + 20; } else { b.x = s2[0].x; b.y = pos; pos += b.h + 20; } });
      redraw(); break;
    }
    case 'grid': { SP.pushUndo(true); const list = sel.length ? sel : SP.doc.beats; const cols = Math.ceil(Math.sqrt(list.length)); list.forEach((b, i) => { b.x = 40 + (i % cols) * 260; b.y = 40 + Math.floor(i / cols) * 200; }); redraw(); break; }
    case 'connect': case 'connect2': case 'connectR': case 'connectL': {
      if (sel.length !== 2) return SP.ui.toast('Select exactly two beats (Shift-click).');
      SP.pushUndo(true);
      SP.doc.connections.push({ id: SP.uid(), from: sel[0].id, to: sel[1].id, style: { connect: 'arrow', connect2: 'double', connectR: 'reverse', connectL: 'line' }[act], color: '#888' });
      redraw(); break;
    }
    case 'disconnect': { SP.pushUndo(true); const ids = new Set(sel.map(b => b.id)); SP.doc.connections = SP.doc.connections.filter(c => !(ids.has(c.from) && ids.has(c.to))); redraw(); break; }
    case 'delete': { if (!sel.length) return; SP.pushUndo(true); const ids = new Set(sel.map(b => b.id)); SP.doc.beats = SP.doc.beats.filter(b => !ids.has(b.id)); SP.doc.connections = SP.doc.connections.filter(c => !ids.has(c.from) && !ids.has(c.to)); BB.sel.clear(); redraw(); break; }
    case 'send': V.sendToScript(sel); break;
    case 'storymap': SP.storyMap.fromBeats(sel); break;
    case 'zin': case 'zout': BB.zoom = Math.min(2.5, Math.max(0.25, BB.zoom * (act === 'zin' ? 1.2 : 1 / 1.2))); SP.$('.bb-z', pane).textContent = Math.round(BB.zoom * 100) + '%'; V.bbDraw(pane); break;
    case 'fit': {
      if (!SP.doc.beats.length) return;
      const r = SP.$('.bb', pane).getBoundingClientRect();
      const minX = Math.min(...SP.doc.beats.map(b => b.x)), minY = Math.min(...SP.doc.beats.map(b => b.y));
      const maxX = Math.max(...SP.doc.beats.map(b => b.x + b.w)), maxY = Math.max(...SP.doc.beats.map(b => b.y + b.h));
      BB.zoom = Math.min(1.5, Math.max(0.25, Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80))));
      BB.panX = -minX * BB.zoom + 40; BB.panY = -minY * BB.zoom + 40; SP.$('.bb-z', pane).textContent = Math.round(BB.zoom * 100) + '%'; V.bbDraw(pane); break;
    }
  }
};
V.sendToScript = (beats) => {
  if (!beats.length) return SP.ui.toast('Select beats to send.');
  SP.editor.sync(); SP.pushUndo(true);
  const cur = SP.editor.getCaret();
  let at = cur ? SP.paraIndex(cur.id) + 1 : SP.doc.paras.length;
  const ordered = [...beats].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  ordered.forEach(b => {
    const isHeading = /^(INT|EXT|I\/E|EST)/i.test(b.title.trim());
    const items = [];
    if (isHeading) items.push({ id: SP.uid(), type: 'scene', html: SP.esc(b.title.trim()), summary: b.body.slice(0, 300), color: b.color });
    else items.push({ id: SP.uid(), type: 'scene', html: '', label: b.title, summary: b.body.slice(0, 300), color: b.color });
    if (b.body) items.push({ id: SP.uid(), type: 'action', html: SP.esc(b.body).replace(/\n/g, '<br>') });
    SP.doc.paras.splice(at, 0, ...items); at += items.length;
  });
  SP.markDirty(); SP.renderAll(); SP.ui.toast(`Sent ${beats.length} beat(s) to the script.`);
};
V.paraToBeat = () => { // Script › New Beat from selection
  const sel = getSelection().toString().trim();
  const b = V.addBeat(40 + Math.random() * 200, 40 + Math.random() * 200, sel.slice(0, 60), sel.length > 60 ? sel : '');
  SP.ui.toast('Beat added to the Beat Board.'); return b;
};

/* ---------- navigator ---------- */
const TABS = [['scenes', 'Scenes'], ['characters', 'Characters'], ['cast', 'Cast List'], ['notes', 'ScriptNotes'], ['tags', 'Tags'], ['bookmarks', 'Bookmarks'], ['structure', 'Outline'], ['changes', 'Changes']];
V.navigator = () => {
  const tabs = SP.$('#nav-tabs'), body = SP.$('#nav-body');
  tabs.innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${SP.ui.navTab === k ? 'on' : ''}">${l}</button>`).join('');
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) { SP.ui.navTab = b.dataset.tab; V.navigator(); } };
  const t = SP.ui.navTab; let h = '';
  if (t === 'scenes') {
    const sc = SP.scenes(); const cur = SP.editor.getCaret(); const curScene = cur && SP.sceneOf(cur.id);
    h = `<div class="nav-list">` + sc.map(s => `<div class="nav-item scene${curScene && curScene.id === s.id ? ' on' : ''}" data-go="${s.id}" style="--c:${s.para.color || 'transparent'}">
      <span class="ni-num">${SP.esc(SP.sceneNumber(s))}</span><span class="ni-main"><b>${SP.esc(s.heading || '(untitled)')}</b>${s.para.summary ? `<small>${SP.esc(s.para.summary)}</small>` : ''}</span><span class="ni-page">${scenePage(s.id)}</span>
      <button class="ni-edit" data-sceneprops="${s.id}" title="Scene properties">⋯</button></div>`).join('') + '</div>';
    if (!sc.length) h = '<div class="empty">No scenes.</div>';
  } else if (t === 'characters') {
    const cs = SP.characters().sort((a, b) => b.speeches - a.speeches);
    h = `<div class="nav-actions"><button data-act="rename">Rename…</button><button data-act="highlight">Highlight…</button><button data-act="nonspeaking">+ Non-speaking</button></div><div class="nav-list">` +
      cs.map(c => `<div class="nav-item" data-char="${SP.esc(c.name)}"><span class="ni-main"><b>${SP.esc(c.name)}</b><small>${c.nonSpeaking ? 'non-speaking' : `${c.speeches} speeches · ${c.words} words · ${c.scenes.size} scenes`}</small></span>${SP.doc.settings.highlightChars[c.name] ? `<span class="dot" style="background:${SP.doc.settings.highlightChars[c.name]}"></span>` : ''}</div>`).join('') + '</div>';
  } else if (t === 'cast') {
    const cs = SP.characters();
    h = `<div class="nav-actions"><button data-act="castreport">Cast Report</button><button data-act="inclusivity">Inclusivity Report</button></div><div class="nav-list">` + cs.map(c => {
      const info = SP.doc.cast[c.name] || {};
      return `<div class="nav-item cast" data-castedit="${SP.esc(c.name)}"><span class="ni-main"><b>${SP.esc(c.name)}</b><small>${SP.esc([info.age, info.gender, info.ethnicity, info.disability ? 'disability: ' + info.disability : ''].filter(Boolean).join(' · ') || 'Click to add description & attributes')}</small>${info.desc ? `<small>${SP.esc(info.desc)}</small>` : ''}</span></div>`;
    }).join('') + '</div>';
  } else if (t === 'notes') {
    const ns = SP.doc.paras.flatMap(p => (p.notes || []).map(n => ({ p, n })));
    h = `<div class="nav-actions"><button data-act="newnote">+ ScriptNote at cursor</button><button data-act="generalnote">General Notes</button><button data-act="notereport">Report</button></div><div class="nav-list">` +
      ns.map(({ p, n }) => `<div class="nav-item" data-go="${p.id}"><span class="dot" style="background:${n.color}"></span><span class="ni-main"><b>${SP.esc(n.text.slice(0, 80))}</b><small>${SP.esc(SP.textOf(p.html).slice(0, 50))}</small></span></div>`).join('') + '</div>';
    if (!ns.length) h += '<div class="empty">No ScriptNotes. Insert › ScriptNote to add one.</div>';
  } else if (t === 'tags') {
    const tags = SP.tools.collectTags();
    h = `<div class="nav-actions"><button data-act="tagsel">Tag Selection…</button><button data-act="tagcats">Categories…</button><button data-act="tagreport">Report</button></div>` +
      SP.doc.tagCats.map(c => { const items = tags.filter(x => x.cat === c.name); if (!items.length) return ''; const uniq = [...new Set(items.map(i => i.text.toUpperCase()))]; return `<div class="nav-group"><div class="ng-head"><span class="dot" style="background:${c.color}"></span>${SP.esc(c.name)} (${uniq.length})</div>${uniq.map(u => `<div class="nav-item small" data-go="${items.find(i => i.text.toUpperCase() === u).paraId}">${SP.esc(u)}</div>`).join('')}</div>`; }).join('') || '<div class="empty">No tags. Select text, then Tools › Tag Selection.</div>';
    if (!tags.length) h += '<div class="empty">No tags yet.</div>';
  } else if (t === 'bookmarks') {
    const bm = SP.doc.paras.filter(p => p.bookmark);
    h = `<div class="nav-actions"><button data-act="bookmark">+ Bookmark at cursor</button></div><div class="nav-list">` + bm.map(p => `<div class="nav-item" data-go="${p.id}"><span class="ni-main"><b>🔖 ${SP.esc(p.bookmark)}</b><small>${SP.esc(SP.textOf(p.html).slice(0, 60))}</small></span><button class="ni-edit" data-unbm="${p.id}" title="Remove">✕</button></div>`).join('') + '</div>';
    if (!bm.length) h += '<div class="empty">No bookmarks.</div>';
  } else if (t === 'structure') {
    const os = SP.doc.paras.filter(SP.isOutline); const { pos } = SP.positions();
    h = `<div class="nav-actions"><button data-act="structadd">+ Outline 1 at cursor</button><button data-act="outline2">+ Outline 2</button><button data-act="outlinebar">Story Map</button></div><div class="nav-list">` + os.map(x => `<div class="nav-item" data-go="${x.id}" style="padding-left:${6 + (SP.outlineLevel(x) - 1) * 14}px"><span class="dot" style="background:${x.color || '#9aa0a6'}"></span><span class="ni-main"><b>${SP.esc(SP.textOf(x.html) || 'Untitled')}</b><small>Outline ${SP.outlineLevel(x)} · p. ${Math.floor(pos.get(x.id) || 0) + 1}</small></span><button class="ni-edit" data-unstruct="${x.id}">✕</button></div>`).join('') + '</div>';
    if (!os.length) h += '<div class="empty">Outline elements mark acts, sequences and turning points. They appear on the Story Map, placed by page.</div>';
  } else if (t === 'changes') {
    const ch = SP.doc.paras.filter(p => p.orig !== undefined);
    h = `<div class="nav-actions"><button data-act="track">${SP.doc.settings.trackChanges ? 'Turn Off' : 'Turn On'} Tracking</button><button data-act="acceptall">Accept All</button><button data-act="rejectall">Reject All</button></div><div class="nav-list">` +
      ch.map(p => `<div class="nav-item" data-go="${p.id}"><span class="ni-main"><b>${p.orig === '' ? 'Inserted' : 'Changed'}: ${SP.esc(SP.textOf(p.html).slice(0, 60))}</b>${p.orig ? `<small><s>${SP.esc(SP.textOf(p.orig).slice(0, 60))}</s></small>` : ''}</span><button class="ni-edit" data-accept="${p.id}" title="Accept">✓</button><button class="ni-edit" data-reject="${p.id}" title="Reject">✕</button></div>`).join('') +
      SP.doc.deletions.map(d => `<div class="nav-item"><span class="ni-main"><b>Deleted:</b><small><s>${SP.esc(SP.textOf(d.para.html).slice(0, 70))}</s></small></span><button class="ni-edit" data-acceptdel="${d.id}" title="Accept">✓</button><button class="ni-edit" data-rejectdel="${d.id}" title="Restore">↺</button></div>`).join('') + '</div>';
    if (!ch.length && !SP.doc.deletions.length) h += '<div class="empty">No tracked changes.</div>';
  }
  body.innerHTML = h;
};
V.bindNavigator = () => {
  SP.$('#nav-body').addEventListener('click', e => {
    const T = SP.tools; const d = e.target.closest('[data-sceneprops],[data-unbm],[data-unstruct],[data-accept],[data-reject],[data-acceptdel],[data-rejectdel],[data-act],[data-castedit],[data-char],[data-go]');
    if (!d) return;
    const ds = d.dataset;
    if (ds.sceneprops) return T.sceneProps(ds.sceneprops);
    if (ds.unbm) { delete SP.para(ds.unbm).bookmark; SP.markDirty(); V.navigator(); SP.editor.decorateSoon(); return; }
    if (ds.unstruct) { SP.editor.sync(); SP.pushUndo(true); SP.doc.paras.splice(SP.paraIndex(ds.unstruct), 1); SP.markDirty(); SP.renderAll(); return; }
    if (ds.accept) return T.acceptChange(ds.accept);
    if (ds.reject) return T.rejectChange(ds.reject);
    if (ds.acceptdel) return T.acceptDeletion(ds.acceptdel);
    if (ds.rejectdel) return T.rejectDeletion(ds.rejectdel);
    if (ds.castedit) return T.editCast(ds.castedit);
    if (ds.char) return SP.reports.characterReport([ds.char]);
    if (ds.go) return SP.editor.goTo(ds.go);
    if (ds.act) SP.commands[{ rename: 'renameCharacter', highlight: 'highlightCharacters', nonspeaking: 'nonSpeaking', castreport: 'castReport', inclusivity: 'inclusivityReport', newnote: 'scriptNote', generalnote: 'generalNotes', notereport: 'scriptNoteReport', tagsel: 'tagSelection', tagcats: 'tagCategories', tagreport: 'tagsReport', bookmark: 'bookmark', structadd: 'outline1', outline2: 'outline2', outlinebar: 'toggleStoryMap', track: 'toggleTracking', acceptall: 'acceptAll', rejectall: 'rejectAll' }[ds.act]]();
  });
};

V.outlineBar = () => SP.storyMap.render();
})();
