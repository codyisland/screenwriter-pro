/* Screenwriter Pro — script editor (contenteditable, one div per element). */
'use strict';
(() => {
const E = SP.editor = {};
let root, page, deco, wrap;
let syncTimer = 0, decoTimer = 0, undoTimer = 0;
let st = { open: false, items: [], index: 0, kind: '', paraId: null };

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUP', 'SUB', 'SPAN', 'BR']);
const SPAN_CLASSES = ['tag', 'hl', 'caps', 'smallcaps', 'dul', 'dotul', 'wul', 'fc'];

E.mount = (container) => {
  wrap = document.createElement('div'); wrap.className = 'script-wrap';
  wrap.innerHTML = '<div class="script-page"><div class="deco"></div><div class="script" contenteditable="true" spellcheck="true"></div></div>';
  container.appendChild(wrap);
  page = wrap.querySelector('.script-page');
  deco = wrap.querySelector('.deco');
  root = wrap.querySelector('.script');
  E.root = root; E.wrap = wrap;
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('input', onInput);
  root.addEventListener('paste', onPaste);
  root.addEventListener('copy', onCopy);
  root.addEventListener('cut', e => { onCopy(e); setTimeout(() => { E.sync(); }, 0); });
  root.addEventListener('blur', () => setTimeout(hideSmart, 150));
  document.addEventListener('selectionchange', () => { if (root.contains(document.activeElement) || document.activeElement === root) SP.emit('caret'); });
  deco.addEventListener('click', onDecoClick);
  new ResizeObserver(() => E.decorateSoon()).observe(root);
};
E.detachTo = (container) => { if (wrap && container && wrap.parentNode !== container) container.appendChild(wrap); };

/* ---------- render model -> DOM ---------- */
E.render = () => {
  if (!root) return;
  const caret = E.getCaret();
  const s = SP.doc.settings;
  root.spellcheck = !!s.spellcheck;
  wrap.classList.toggle('speed', SP.ui.mode === 'speed');
  wrap.classList.toggle('page-mode', SP.ui.mode === 'page');
  wrap.classList.toggle('normal-mode', SP.ui.mode === 'normal');
  wrap.classList.toggle('invisibles', !!s.showInvisibles);
  wrap.style.zoom = s.zoom || 1;
  root.innerHTML = SP.doc.paras.map(p => `<div class="p" data-id="${p.id}" data-type="${p.type}"${SP.isOutline(p) ? ` style="--oc:${p.color || '#9aa0a6'}"` : ''}>${p.html || '<br>'}</div>`).join('');
  document.body.classList.toggle('print-outline', !!s.printOutline);
  document.body.classList.toggle('outline-hidden', !s.showStructure);
  if (caret) E.setCaretById(caret.id, caret.offset, true);
  E.decorate();
};

/* ---------- DOM -> model ---------- */
function sanitize(node) {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === 3) continue;
    if (c.nodeType !== 1) { c.remove(); continue; }
    sanitize(c);
    if (c.tagName === 'DIV' || c.tagName === 'P') { // nested blocks: flatten
      c.replaceWith(...c.childNodes); continue;
    }
    if (!ALLOWED.has(c.tagName) || (c.tagName === 'SPAN' && !SPAN_CLASSES.some(k => c.classList.contains(k)))) {
      c.replaceWith(...c.childNodes); continue;
    }
    if (c.tagName !== 'SPAN') { for (const a of Array.from(c.attributes)) c.removeAttribute(a.name); }
    else if (!c.classList.contains('fc') && !c.classList.contains('hl')) c.removeAttribute('style');
  }
}
E.sync = () => {
  if (!root) return;
  clearTimeout(syncTimer);
  // normalize stray nodes into paragraphs
  let prevType = 'action';
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 1 && n.classList && n.classList.contains('p')) { prevType = n.dataset.type || prevType; continue; }
    if (n.nodeType === 3 && !n.textContent.trim()) { n.remove(); continue; }
    if (n.nodeType === 1 && n.tagName === 'BR') { n.remove(); continue; }
    const d = document.createElement('div'); d.className = 'p'; d.dataset.type = prevType;
    n.replaceWith(d); if (n.nodeType === 1 && (n.tagName === 'DIV' || n.tagName === 'P')) d.append(...n.childNodes); else d.append(n);
  }
  if (!root.children.length) root.innerHTML = `<div class="p" data-type="${SP.doc.paras[0]?.type || 'scene'}"><br></div>`;
  const old = new Map(SP.doc.paras.map(p => [p.id, p]));
  const seen = new Set();
  const out = [];
  for (const d of root.children) {
    let id = d.dataset.id;
    if (!id || seen.has(id)) { id = SP.uid(); d.dataset.id = id; }
    seen.add(id);
    if (!d.dataset.type) d.dataset.type = 'action';
    if (d.querySelector('div,p,font,[style]:not(.fc):not(.hl)') || /<span(?![^>]*class=)/.test(d.innerHTML)) sanitize(d);
    let html = d.innerHTML.replace(/^<br>$/, '').replace(/<br>$/, '');
    if (!SP.textOf(html).trim() && !/<br>/.test(html)) html = '';
    const prev = old.get(id);
    const p = prev ? prev : { id, type: d.dataset.type, html: '' };
    if (!prev && SP.doc.settings.trackChanges) p.orig = '';
    if (!prev && SP.doc.settings.revisionMode) p.rev = SP.doc.settings.revisionColor;
    p.type = d.dataset.type;
    p.html = html;
    out.push(p);
  }
  if (SP.doc.settings.trackChanges) {
    const prevOrder = SP.doc.paras.map(p => p.id);
    prevOrder.forEach((id, i) => {
      if (!seen.has(id)) {
        const p = old.get(id);
        if (p.orig === '') return; // inserted then deleted: no record
        SP.doc.deletions.push({ id: SP.uid(), after: prevOrder.slice(0, i).reverse().find(x => seen.has(x)) || null, para: { ...p, html: p.orig ?? p.html, orig: undefined }, date: Date.now() });
      }
    });
  }
  SP.doc.paras = out;
};
E.syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => { E.sync(); SP.emit('changed'); }, 250); };

/* ---------- caret helpers ---------- */
E.curPara = () => {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  let n = sel.anchorNode; if (!n || !root.contains(n)) return null;
  while (n && n !== root && !(n.nodeType === 1 && n.classList.contains('p'))) n = n.parentNode;
  return n === root ? null : n;
};
E.paraEl = (id) => root && root.querySelector(`.p[data-id="${id}"]`);
const offsetIn = (p, node, off) => { const r = document.createRange(); r.selectNodeContents(p); r.setEnd(node, off); return r.toString().length; };
E.getCaret = () => {
  const p = E.curPara(); if (!p) return null;
  const sel = getSelection();
  return { id: p.dataset.id, offset: offsetIn(p, sel.anchorNode, sel.anchorOffset) };
};
E.setCaret = (p, offset, noScroll) => {
  if (!p) return;
  const sel = getSelection(); const r = document.createRange();
  const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let n, left = offset, placed = false;
  while ((n = tw.nextNode())) {
    if (left <= n.length) { r.setStart(n, left); placed = true; break; }
    left -= n.length;
  }
  if (!placed) { r.selectNodeContents(p); r.collapse(offset <= 0); }
  r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  if (!noScroll) E.scrollIntoView(p);
};
E.setCaretById = (id, off, noScroll) => { const p = E.paraEl(id); if (p) { root.focus({ preventScroll: true }); E.setCaret(p, off ?? 0, noScroll); } };
E.scrollIntoView = (p) => {
  const sc = wrap.closest('.pane') || wrap; const r = p.getBoundingClientRect(); const sr = sc.getBoundingClientRect();
  if (SP.doc.settings.typewriter) { sc.scrollTop += r.top - (sr.top + sr.height / 2); return; }
  if (r.top < sr.top + 20 || r.bottom > sr.bottom - 20) sc.scrollTop += r.top - sr.top - sr.height / 3;
};
E.goTo = (id) => { SP.setView && SP.ui.view !== 'script' && !SP.ui.split && SP.setView('script'); setTimeout(() => { E.setCaretById(id, 0); const p = E.paraEl(id); if (p) { p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 1200); } }, 30); };
const caretAtEnd = (p) => { const c = E.getCaret(); return c && c.offset >= p.textContent.length; };
const caretAtStart = (p) => { const sel = getSelection(); return sel.isCollapsed && offsetIn(p, sel.anchorNode, sel.anchorOffset) === 0; };
E.selectedParas = () => {
  const sel = getSelection(); if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  return Array.from(root.children).filter(d => r.intersectsNode(d));
};

/* ---------- element types ---------- */
E.setType = (type, p = E.curPara()) => {
  if (!p) return;
  SP.pushUndo();
  const targets = getSelection().isCollapsed ? [p] : E.selectedParas();
  targets.forEach(d => {
    d.dataset.type = type;
    const m = SP.para(d.dataset.id); if (m) { m.type = type; markEdited(m); }
    if (SP.el(type).paren && !d.textContent.trim()) { d.textContent = '()'; E.setCaret(d, 1); }
  });
  E.sync(); SP.markDirty(); SP.emit('changed'); SP.emit('caret');
};
function newParaAfter(p, type, html = '') {
  const d = document.createElement('div'); d.className = 'p'; d.dataset.type = type; d.dataset.id = SP.uid();
  d.innerHTML = html || '<br>';
  p.after(d);
  return d;
}
function markEdited(m) {
  const s = SP.doc.settings;
  if (s.revisionMode && m.rev !== s.revisionColor) { m.rev = s.revisionColor; }
  if (s.trackChanges && m.orig === undefined) m.orig = m.html;
}

/* ---------- keyboard ---------- */
function onKeyDown(e) {
  const p = E.curPara();
  const mod = e.metaKey || e.ctrlKey;
  // SmartType navigation
  if (st.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); st.index = (st.index + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % st.items.length; drawSmart(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptSmart(); return; }
    if (e.key === 'Escape') { e.preventDefault(); hideSmart(); return; }
  }
  // element shortcuts: Alt/Ctrl + 1..9, 0
  if ((e.altKey || e.ctrlKey) && !e.metaKey && /^Digit[0-9]$/.test(e.code)) {
    const k = e.code.slice(5);
    if (e.altKey && e.shiftKey) { const mac = SP.doc.settings.macros.find(m => m.key === k); if (mac) { e.preventDefault(); E.runMacro(mac); } return; }
    const type = Object.keys(SP.doc.settings.elements).find(t => SP.doc.settings.elements[t].shortcut === k);
    if (type) { e.preventDefault(); E.setType(type); }
    return;
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); SP.undo(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); SP.redo(); return; }
  if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase()) && !e.shiftKey) {
    e.preventDefault(); SP.pushUndo(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]); onInput(); return;
  }
  if (!p) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) { SP.pushUndo(); document.execCommand('insertLineBreak'); onInput(); return; }
    SP.pushUndo(true);
    if (!p.textContent.trim() && !SP.el(p.dataset.type).paren) { E.elementPopup(p); return; }
    const sel = getSelection(); if (!sel.isCollapsed) sel.deleteFromDocument();
    const type = p.dataset.type; const def = SP.el(type);
    let r = sel.getRangeAt(0);
    // in a parenthetical, Enter before closing ")" jumps past it
    if (def.paren && /\)\s*$/.test(p.textContent) && offsetIn(p, r.startContainer, r.startOffset) >= p.textContent.replace(/\)\s*$/, '').length) { E.setCaret(p, p.textContent.length, true); r = sel.getRangeAt(0); }
    const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(p, p.childNodes.length);
    const frag = tail.extractContents();
    const tmp = document.createElement('div'); tmp.appendChild(frag);
    const atStart = !p.textContent.length && tmp.textContent.length;
    const nextType = atStart ? type : def.enter;
    if (atStart) { // Enter at start: push empty para above, keep type
      p.innerHTML = tmp.innerHTML || '<br>';
      const d = document.createElement('div'); d.className = 'p'; d.dataset.type = type; d.dataset.id = SP.uid(); d.innerHTML = '<br>';
      p.before(d); E.setCaret(p, 0);
    } else {
      if (!p.textContent.length) p.innerHTML = '<br>';
      const d = newParaAfter(p, tmp.textContent.length ? type : nextType, tmp.textContent.length ? tmp.innerHTML : '');
      if (!tmp.textContent.length && SP.el(nextType).paren) { d.textContent = '()'; E.setCaret(d, 1); } else E.setCaret(d, 0);
    }
    autoFixParagraph(p);
    E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon(); maybeSmart();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault(); SP.pushUndo(true);
    const type = p.dataset.type; const def = SP.el(type);
    if (e.shiftKey) { // reverse: find element whose tabEmpty points here
      const back = Object.keys(SP.doc.settings.elements).find(t => SP.el(t).tabEmpty === type) || 'action';
      E.setType(back, p); maybeSmart(); return;
    }
    const empty = !p.textContent.trim() || (def.paren && p.textContent.trim() === '()');
    if (empty) {
      if (def.paren) p.innerHTML = '<br>';
      E.setType(def.tabEmpty, p);
    } else if (caretAtEnd(p) || def.paren) {
      const nt = def.tab; const d = newParaAfter(p, nt);
      if (SP.el(nt).paren) { d.textContent = '()'; E.setCaret(d, 1); } else E.setCaret(d, 0);
      E.sync(); SP.markDirty(); SP.emit('changed');
    } else {
      E.setType(def.tabEmpty, p);
    }
    maybeSmart(); E.decorateSoon();
    return;
  }
  if (e.key === 'Backspace' && getSelection().isCollapsed && caretAtStart(p)) {
    const prev = p.previousElementSibling;
    e.preventDefault(); SP.pushUndo(true);
    if (!prev) { if (!p.textContent.length) E.setType('scene', p); return; }
    if (!p.textContent.length) { p.remove(); E.setCaret(prev, prev.textContent.length); }
    else if (!prev.textContent.length) { prev.remove(); E.setCaret(p, 0); }
    else {
      const len = prev.textContent.length;
      if (prev.innerHTML === '<br>') prev.innerHTML = '';
      prev.insertAdjacentHTML('beforeend', p.innerHTML.replace(/<br>$/, '')); p.remove(); E.setCaret(prev, len);
    }
    E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon();
    return;
  }
  if (e.key === 'Delete' && getSelection().isCollapsed && caretAtEnd(p)) {
    const next = p.nextElementSibling; if (!next) return;
    e.preventDefault(); SP.pushUndo(true);
    const len = p.textContent.length;
    if (p.innerHTML === '<br>') p.innerHTML = '';
    p.insertAdjacentHTML('beforeend', next.innerHTML.replace(/<br>$/, '')); next.remove(); E.setCaret(p, len);
    E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon();
    return;
  }
  if (e.key === 'Escape') { hideSmart(); }
}

/* auto-uppercase-insensitive fixes: parentheses on parentheticals, character trims */
function autoFixParagraph(p) {
  const t = p.dataset.type;
  if (SP.el(t).paren) {
    const txt = p.textContent.trim();
    if (txt && !/^\(/.test(txt)) p.textContent = '(' + txt + (txt.endsWith(')') ? '' : ')');
  }
}

function onInput() {
  const p = E.curPara();
  if (p) {
    const m = SP.para(p.dataset.id);
    if (m) markEdited(m);
    if (!p.dataset.id) p.dataset.id = SP.uid();
  }
  SP.markDirty();
  E.syncSoon(); E.decorateSoon();
  clearTimeout(undoTimer); undoTimer = setTimeout(() => { E.sync(); SP.pushUndo(); }, 700);
  maybeSmart();
  if (SP.doc.settings.typewriter && p) E.scrollIntoView(p);
  SP.emit('typing');
}

/* ---------- clipboard ---------- */
function onCopy(e) {
  const sel = getSelection(); if (sel.isCollapsed) return;
  E.sync();
  const ps = E.selectedParas();
  const text = sel.toString();
  if (ps.length > 1) SP.clip = { text: text.replace(/\r/g, ''), paras: ps.map(d => ({ type: d.dataset.type })) };
  else SP.clip = null;
}
function onPaste(e) {
  e.preventDefault();
  let text = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  if (!text) return;
  SP.pushUndo(true);
  const lines = text.split('\n');
  if (lines.length === 1) { document.execCommand('insertText', false, text); onInput(); return; }
  let paras;
  if (SP.clip && SP.clip.text.replace(/\n+/g, '\n').trim() === text.replace(/\n+/g, '\n').trim()) {
    const ls = text.split(/\n+/);
    paras = ls.map((l, i) => ({ type: (SP.clip.paras[i] || {}).type || 'action', html: SP.esc(l) }));
  } else paras = SP.io.parseFountain(text).paras;
  const p = E.curPara(); if (!p) return;
  const sel = getSelection(); if (!sel.isCollapsed) sel.deleteFromDocument();
  const r = sel.getRangeAt(0);
  const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(p, p.childNodes.length);
  const tmp = document.createElement('div'); tmp.appendChild(tail.extractContents());
  let last = p;
  const first = paras.shift();
  if (first) {
    if (!p.textContent.trim()) { p.dataset.type = first.type; p.innerHTML = ''; }
    p.insertAdjacentHTML('beforeend', first.html);
  }
  paras.forEach(q => { last = newParaAfter(last, q.type, q.html); });
  const endLen = last.textContent.length;
  if (tmp.textContent.length) last.insertAdjacentHTML('beforeend', tmp.innerHTML);
  E.setCaret(last, endLen);
  E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon();
}

/* ---------- element chooser popup ---------- */
E.elementPopup = (p) => {
  const r = p.getBoundingClientRect();
  SP.ui.popupMenu(r.left + 20, r.bottom, Object.keys(SP.doc.settings.elements).map(t => ({
    label: SP.el(t).name, hint: SP.el(t).shortcut ? 'Alt+' + SP.el(t).shortcut : '', action: () => { E.setType(t, p); E.setCaret(p, p.textContent === '()' ? 1 : 0); maybeSmart(); }
  })));
};

/* ---------- formatting ---------- */
E.wrapSelection = (tag, cls, attrs = {}) => {
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
  SP.pushUndo(true);
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontName', false, 'sp-mark');
  SP.$$('font[face="sp-mark"]', root).forEach(f => {
    const el = document.createElement(tag); if (cls) el.className = cls;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    el.append(...f.childNodes); f.replaceWith(el);
  });
  SP.$$('[style]', root).forEach(n => { if (n.closest('.p') && !(n.classList.contains('fc') || n.classList.contains('hl'))) n.removeAttribute('style'); });
  E.sync(); SP.markDirty(); SP.emit('changed');
};
E.unwrapSelection = (selector) => {
  const ps = E.selectedParas(); SP.pushUndo(true);
  const sel = getSelection(); const r = sel.rangeCount ? sel.getRangeAt(0) : null;
  ps.forEach(d => SP.$$(selector, d).forEach(n => { if (!r || r.intersectsNode(n)) n.replaceWith(...n.childNodes); }));
  E.sync(); SP.markDirty(); SP.emit('changed');
};
E.exec = (cmd) => { SP.pushUndo(true); document.execCommand(cmd); E.sync(); SP.markDirty(); };
E.clearFormatting = () => { SP.pushUndo(true); document.execCommand('removeFormat'); E.unwrapSelection('span:not(.tag)'); };
E.runMacro = (m) => {
  const p = E.curPara(); if (!p) return;
  SP.pushUndo(true);
  if (m.type && !p.textContent.trim()) { p.dataset.type = m.type; }
  document.execCommand('insertText', false, m.text); onInput();
};
E.insertParaAfterCurrent = (type, html = '') => {
  E.sync(); SP.pushUndo(true);
  const p = E.curPara() || root.lastElementChild;
  const d = newParaAfter(p, type, html); E.setCaret(d, d.textContent.length);
  E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon();
  return d;
};

/* ---------- SmartType ---------- */
function smartContext(p) {
  const type = p.dataset.type; const text = p.textContent; const ST = SP.doc.settings.smartType;
  const c = E.getCaret(); if (!c || c.offset < text.length) return null;
  const uniq = a => [...new Set(a.filter(Boolean))];
  if (type === 'scene') {
    const up = text.toUpperCase();
    const intro = ST.intros.find(i => up.startsWith(i.trim()) && up.length >= i.trim().length && (up.length === i.trim().length ? false : true));
    if (!intro) return { kind: 'intro', frag: up, items: ST.intros.map(s => s.trim()), apply: v => v + ' ' };
    const after = text.slice(intro.length).replace(/^\s+/, '');
    const dash = after.lastIndexOf(' - ');
    if (dash < 0) {
      const locs = uniq([...SP.locations().map(l => l.name), ...ST.locations]);
      return { kind: 'location', frag: after.toUpperCase(), items: locs, apply: v => intro.trim() + ' ' + v + ' - ' };
    }
    const head = after.slice(0, dash);
    return { kind: 'time', frag: after.slice(dash + 3).toUpperCase(), items: ST.times, apply: v => intro.trim() + ' ' + head + ' - ' + v, allowEmpty: true };
  }
  if (type === 'character') {
    const i = text.indexOf('(');
    if (i >= 0) { const name = text.slice(0, i).trim(); return { kind: 'ext', frag: text.slice(i + 1).toUpperCase(), items: ST.extensions, apply: v => name + ' (' + v + ')', allowEmpty: true }; }
    const names = uniq([...SP.characters().sort((a, b) => b.speeches - a.speeches).map(c => c.name), ...ST.characters]);
    return { kind: 'char', frag: text.toUpperCase(), items: names, apply: v => v, allowEmpty: true };
  }
  if (type === 'transition') return { kind: 'trans', frag: text.toUpperCase(), items: ST.transitions, apply: v => v, allowEmpty: true };
  if (type === 'shot') return { kind: 'shot', frag: text.toUpperCase(), items: ['ANGLE ON', 'CLOSE ON', 'WIDE SHOT', 'POV', 'INSERT', 'BACK TO SCENE', 'AERIAL SHOT', 'TRACKING SHOT', 'TWO SHOT', 'OVER THE SHOULDER'], apply: v => v };
  return null;
}
function maybeSmart() {
  const p = E.curPara(); if (!p) return hideSmart();
  const ctx = smartContext(p);
  if (!ctx || (!ctx.frag && !ctx.allowEmpty && ctx.kind !== 'intro')) return hideSmart();
  const f = ctx.frag.trim();
  const items = ctx.items.filter(i => i && i.toUpperCase().startsWith(f) && i.toUpperCase() !== f).slice(0, 10);
  if (!items.length) return hideSmart();
  st = { open: true, items, index: 0, ctx, paraId: p.dataset.id };
  drawSmart();
}
function drawSmart() {
  const box = SP.$('#smarttype'); const p = E.paraEl(st.paraId); if (!p) return hideSmart();
  const sel = getSelection(); let rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
  if (!rect || (!rect.width && !rect.height && !rect.left)) rect = p.getBoundingClientRect();
  box.innerHTML = st.items.map((it, i) => `<div class="st-item${i === st.index ? ' on' : ''}" data-i="${i}">${SP.esc(it)}</div>`).join('');
  box.hidden = false;
  box.style.left = Math.min(innerWidth - 240, rect.left) + 'px';
  box.style.top = (rect.bottom + 4) + 'px';
  box.onmousedown = (ev) => { const it = ev.target.closest('.st-item'); if (it) { ev.preventDefault(); st.index = +it.dataset.i; acceptSmart(); } };
}
function acceptSmart() {
  const p = E.paraEl(st.paraId); const v = st.items[st.index];
  hideSmart(); if (!p || v == null) return;
  SP.pushUndo(true);
  p.textContent = st.ctx.apply(v);
  E.setCaret(p, p.textContent.length);
  E.sync(); SP.markDirty(); SP.emit('changed'); E.decorateSoon();
  if (st.ctx.kind === 'intro' || st.ctx.kind === 'location') setTimeout(maybeSmart, 0);
}
function hideSmart() { st.open = false; const b = SP.$('#smarttype'); if (b) b.hidden = true; }
E.hideSmart = hideSmart;

/* ---------- decorations (margins, page breaks, notes, revisions) ---------- */
E.decorateSoon = () => { clearTimeout(decoTimer); decoTimer = setTimeout(E.decorate, 120); };
E.decorate = () => {
  if (!root || !root.isConnected) return;
  const s = SP.doc.settings; const out = [];
  const pageMode = SP.ui.mode === 'page';
  // pagination: page-break markers in Page view
  let pages = null;
  if (pageMode) {
    pages = SP.paginate(SP.doc.paras);
    const starts = new Map();
    pages.forEach((pg, i) => {
      if (i === 0) return;
      const it = pg.items.find(x => !x.cont && x.para); if (!it) return;
      if (!starts.has(it.para.id)) starts.set(it.para.id, pg.label);
    });
    for (const d of root.children) { const l = starts.get(d.dataset.id); if (l) d.dataset.pb = l; else delete d.dataset.pb; }
  } else for (const d of root.children) delete d.dataset.pb;
  // speaker attributes for Highlight Characters
  let speaker = null;
  const hl = s.highlightChars || {};
  const hasHl = Object.keys(hl).length > 0;
  const scenes = SP.scenes(); const sceneById = new Map(scenes.map(sc => [sc.id, sc]));
  const showNum = s.sceneNumbers !== 'none';
  const PX = 96; // css px per inch
  for (const d of root.children) {
    const m = SP.para(d.dataset.id); if (!m) continue;
    const type = m.type; const def = SP.el(type);
    if (type === 'character') speaker = SP.charName(d.textContent);
    else if (!['dialogue', 'parenthetical', 'lyrics'].includes(type)) speaker = null;
    if (hasHl && speaker && hl[speaker]) d.dataset.speaker = speaker; else delete d.dataset.speaker;
    const top = d.offsetTop;
    const L = def.left * PX;
    if (d.dataset.pb) {
      out.push(`<div class="d-pagegap" style="top:${top - 2.4 * PX}px"></div>`);
    }
    const sc = sceneById.get(m.id);
    if (sc) {
      const num = SP.sceneNumber(sc);
      if (showNum) {
        if (s.sceneNumbers === 'left' || s.sceneNumbers === 'both') out.push(`<div class="d-scnum" style="top:${top}px;left:${L - 0.75 * PX}px">${SP.esc(num)}</div>`);
        if (s.sceneNumbers === 'right' || s.sceneNumbers === 'both') out.push(`<div class="d-scnum" style="top:${top}px;left:${7.6 * PX}px">${SP.esc(num)}</div>`);
      }
      if (m.color) out.push(`<div class="d-scolor" style="top:${top}px;background:${m.color}"></div>`);
      if (s.showSceneTitles && (m.label || m.summary)) out.push(`<div class="d-label" style="top:${top - 15}px;left:${L}px">${SP.esc(m.label || '')}${m.label && m.summary ? ' — ' : ''}<i>${SP.esc((m.summary || '').slice(0, 80))}</i></div>`);
    }
    if (m.rev) out.push(`<div class="d-rev" title="${SP.esc(m.rev)} revision" style="top:${top}px;height:${d.offsetHeight}px;color:${(SP.REVISION_COLORS.find(r => r.name === m.rev) || {}).color || '#888'}">${SP.esc(s.revisionMark)}</div>`);
    if (m.orig !== undefined) out.push(`<div class="d-track ${m.orig === '' ? 'ins' : 'chg'}" title="${m.orig === '' ? 'Inserted' : 'Changed'}" style="top:${top}px;height:${d.offsetHeight}px"></div>`);
    if (s.showNotes && m.notes && m.notes.length) out.push(`<div class="d-note" data-note="${m.id}" title="${SP.esc(m.notes.map(n => n.text).join('\n'))}" style="top:${top}px;background:${m.notes[0].color || '#ffe066'}">${m.notes.length}</div>`);
    if (m.bookmark) out.push(`<div class="d-bm" title="Bookmark: ${SP.esc(m.bookmark)}" style="top:${top}px">🔖</div>`);
    if (s.showAlts && m.alts && m.alts.length > 1) out.push(`<div class="d-alt" data-alt="${m.id}" title="Alternates — click to cycle" style="top:${top}px;left:${L - 34}px">${(m.altIndex || 0) + 1}/${m.alts.length}</div>`);
    if (m.dual) out.push(`<div class="d-dual" style="top:${top}px;left:${L - 46}px" title="Dual dialogue">DUAL</div>`);
  }
  if (pageMode && pages) {
    // header / page number at the top of each page
    const tops = [[-0.5 * PX, pages[0] ? pages[0].label : '1'], ...Array.from(root.children).filter(d => d.dataset.pb).map(d => [d.offsetTop - 0.5 * PX, d.dataset.pb])];
    tops.forEach(([t, label], i) => {
      if (i === 0 && !s.headerFirstPage) return;
      out.push(`<div class="d-pnum" style="top:${t}px">${SP.esc(SP.formatHF(s.header, label, pages.length))}</div>`);
    });
  }
  deco.style.top = root.offsetTop + 'px';
  deco.innerHTML = out.join('');
  E.pages = pages;
  SP.emit('decorated');
};
function onDecoClick(e) {
  const n = e.target.closest('[data-note]'); if (n) { SP.tools.editNotes(n.dataset.note); return; }
  const a = e.target.closest('[data-alt]'); if (a) { E.cycleAlt(a.dataset.alt, 1); }
}

/* ---------- alternates ---------- */
E.addAlt = () => {
  E.sync(); const p = E.curPara(); if (!p) return; const m = SP.para(p.dataset.id);
  SP.pushUndo(true);
  if (!m.alts || !m.alts.length) { m.alts = [m.html]; m.altIndex = 0; }
  m.alts[m.altIndex] = m.html; m.alts.push(m.html); m.altIndex = m.alts.length - 1;
  SP.markDirty(); E.render(); E.setCaretById(m.id, 9999);
  SP.ui.toast('Alt added — edit this version. Use Format › Next/Previous Alt to switch.');
};
E.cycleAlt = (id, dir) => {
  E.sync(); const m = SP.para(id || (E.curPara() || {}).dataset?.id); if (!m || !m.alts || m.alts.length < 2) return;
  SP.pushUndo(true);
  m.alts[m.altIndex || 0] = m.html;
  m.altIndex = ((m.altIndex || 0) + dir + m.alts.length) % m.alts.length;
  m.html = m.alts[m.altIndex]; SP.markDirty(); E.render();
};
E.removeAlt = () => {
  E.sync(); const p = E.curPara(); const m = p && SP.para(p.dataset.id); if (!m || !m.alts || m.alts.length < 2) return;
  SP.pushUndo(true);
  m.alts.splice(m.altIndex || 0, 1); m.altIndex = Math.max(0, (m.altIndex || 0) - 1); m.html = m.alts[m.altIndex];
  if (m.alts.length === 1) { delete m.alts; delete m.altIndex; }
  SP.markDirty(); E.render();
};
})();
