/* Screenwriter Pro — UI helpers and tools (dialogs, notes, tags, revisions, production, writing aids). */
'use strict';
(() => {
/* ================= UI helpers ================= */
const U = SP.ui;
U.modal = ({ title, body, buttons = [{ label: 'Close', primary: true }], wide, onOpen, cls = '' }) => {
  const root = document.createElement('div'); root.className = 'modal-back';
  root.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-label="${SP.esc(title)}">
    <div class="modal-head"><h2>${SP.esc(title)}</h2><button class="x" aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''} ${b.left ? 'left' : ''}">${SP.esc(b.label)}</button>`).join('')}</div></div>`;
  SP.$('#modal-root').appendChild(root);
  const close = () => { root.remove(); if (U.restoreFocus) setTimeout(() => { if (!SP.$('.modal-back')) SP.editor.root?.focus({ preventScroll: true }); }, 0); };
  root.close = close;
  SP.$('.x', root).onclick = close;
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { const p = buttons.findIndex(b => b.primary); if (p >= 0) { e.preventDefault(); SP.$(`.modal-foot [data-i="${p}"]`, root).click(); } } });
  SP.$$('.modal-foot button', root).forEach(btn => btn.onclick = async () => { const b = buttons[+btn.dataset.i]; const r = b.action ? await b.action(root) : undefined; if (r !== false) close(); });
  if (onOpen) onOpen(root);
  setTimeout(() => { const f = SP.$('input:not([type=checkbox]),textarea,select', root); if (f) f.focus(); else SP.$('.modal-foot .primary', root)?.focus(); }, 30);
  return root;
};
U.restoreFocus = true;
U.alert = (msg, title = 'Screenwriter Pro') => new Promise(r => U.modal({ title, body: `<p>${SP.esc(msg)}</p>`, buttons: [{ label: 'OK', primary: true, action: () => r() }] }));
U.confirm = (msg, title = 'Screenwriter Pro') => new Promise(r => { const m = U.modal({ title, body: `<p>${SP.esc(msg)}</p>`, buttons: [{ label: 'Cancel', action: () => r(false) }, { label: 'OK', primary: true, action: () => r(true) }] }); SP.$('.x', m).addEventListener('click', () => r(false)); });
U.prompt = (msg, val = '', title = 'Screenwriter Pro') => new Promise(r => { let done = false; U.modal({ title, body: `<label class="field">${SP.esc(msg)}<input class="pv" value="${SP.esc(val)}"></label>`, buttons: [{ label: 'Cancel', action: () => { done = true; r(null); } }, { label: 'OK', primary: true, action: m => { done = true; r(SP.$('.pv', m).value); } }] }); });
U.toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100); };
U.popupMenu = (x, y, items) => {
  const m = SP.$('#menu-popup');
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="sep"></div>' : `<div class="mi${it.disabled ? ' dis' : ''}" data-i="${i}">${it.swatch ? `<span class="sw" style="background:${it.swatch}"></span>` : ''}<span>${SP.esc(it.label)}</span>${it.hint ? `<small>${SP.esc(it.hint)}</small>` : ''}</div>`).join('');
  m.hidden = false;
  m.style.left = Math.min(x, innerWidth - 240) + 'px'; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + 'px';
  const close = () => { m.hidden = true; document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', key, true); };
  const out = e => { if (!m.contains(e.target)) close(); };
  let idx = -1;
  const key = e => {
    const els = SP.$$('.mi:not(.dis)', m);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length; els.forEach((x, i) => x.classList.toggle('on', i === idx)); }
    if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); e.stopPropagation(); els[idx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
  };
  m.onmousedown = e => { const it = e.target.closest('.mi'); if (!it || it.classList.contains('dis')) return; e.preventDefault(); close(); items[+it.dataset.i].action(); };
  setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
};
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${SP.esc(v)}"${v === sel ? ' selected' : ''}>${SP.esc(l)}</option>`).join('');
const elemOpts = (sel) => opts(Object.keys(SP.doc.settings.elements).map(k => [k, SP.el(k).name]), sel);
const colorOpts = (sel) => '<option value="">None</option>' + opts(Object.entries(SP.COLORS).map(([n, c]) => [c, n]), sel);
const afterChange = () => { SP.markDirty(); SP.renderAll(); };

const T = SP.tools = {};

/* ================= ScriptNotes ================= */
T.editNotes = (paraId) => {
  SP.editor.sync();
  const p = SP.para(paraId); if (!p) return;
  p.notes ||= [];
  const draw = (m) => {
    SP.$('.notes-list', m).innerHTML = p.notes.map((n, i) => `<div class="note-row"><select data-ncolor="${i}">${opts(Object.entries(SP.COLORS).map(([k, c]) => [c, k]), n.color)}</select>
      <textarea data-ntext="${i}" rows="3">${SP.esc(n.text)}</textarea><button data-ndel="${i}" title="Delete">✕</button></div>`).join('') || '<p class="muted">No notes on this element.</p>';
  };
  U.modal({
    title: 'ScriptNotes', body: `<p class="muted">On: “${SP.esc(SP.textOf(p.html).slice(0, 90))}”</p><div class="notes-list"></div><button class="add-note">+ Add Note</button>`,
    buttons: [{ label: 'Done', primary: true, action: () => { p.notes = p.notes.filter(n => n.text.trim()); if (!p.notes.length) delete p.notes; SP.markDirty(); SP.editor.decorate(); SP.emit('changed'); } }],
    onOpen: (m) => {
      draw(m);
      SP.$('.add-note', m).onclick = () => { p.notes.push({ id: SP.uid(), text: '', color: '#ffe066', date: Date.now() }); draw(m); SP.$$('textarea', m).pop().focus(); };
      m.addEventListener('input', e => { const i = e.target.dataset.ntext; if (i != null) p.notes[i].text = e.target.value; });
      m.addEventListener('change', e => { const i = e.target.dataset.ncolor; if (i != null) p.notes[i].color = e.target.value; });
      m.addEventListener('click', e => { const i = e.target.dataset.ndel; if (i != null) { p.notes.splice(+i, 1); draw(m); } });
      if (!p.notes.length) SP.$('.add-note', m).click();
    }
  });
};
T.generalNotes = () => {
  const d = SP.doc;
  U.modal({ title: 'General Notes', wide: true, body: `<p class="muted">Notes about the whole script (not attached to any element).</p><textarea class="gn" rows="16" style="width:100%">${SP.esc((d.generalNotes || []).join('\n\n'))}</textarea>`,
    buttons: [{ label: 'Save', primary: true, action: m => { d.generalNotes = SP.$('.gn', m).value.split(/\n{2,}/).filter(Boolean); SP.markDirty(); } }] });
};

/* ================= scene properties / cast ================= */
T.sceneProps = (id) => {
  SP.editor.sync(); const p = SP.para(id); if (!p) return;
  const sc = SP.scenes().find(s => s.id === id);
  U.modal({ title: 'Scene Properties', body: `
    <label class="field">Heading<input class="sp-h" value="${SP.esc(SP.textOf(p.html))}"></label>
    <label class="field">Scene title / label<input class="sp-l" value="${SP.esc(p.label || '')}"></label>
    <label class="field">Summary<textarea class="sp-s" rows="4">${SP.esc(p.summary || '')}</textarea></label>
    <div class="row"><label class="field">Color<select class="sp-c">${colorOpts(p.color)}</select></label>
    <label class="field">Scene number<input class="sp-n" value="${SP.esc(sc ? sc.num : '')}"></label></div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, action: m => {
      SP.pushUndo(true);
      p.html = SP.esc(SP.$('.sp-h', m).value); p.label = SP.$('.sp-l', m).value || undefined; p.summary = SP.$('.sp-s', m).value || undefined; p.color = SP.$('.sp-c', m).value || undefined;
      const n = SP.$('.sp-n', m).value.trim(); if (sc && n && n !== sc.num) { p.sceneNum = n; p.sceneNumManual = true; }
      afterChange();
    } }] });
};
T.editCast = (name) => {
  const info = SP.doc.cast[name] || {};
  U.modal({ title: 'Cast: ' + name, body: `
    <label class="field">Description<textarea class="c-desc" rows="3">${SP.esc(info.desc || '')}</textarea></label>
    <div class="row"><label class="field">Age<input class="c-age" value="${SP.esc(info.age || '')}"></label>
    <label class="field">Gender<input class="c-gender" value="${SP.esc(info.gender || '')}" list="dl-gender"></label></div>
    <div class="row"><label class="field">Race / Ethnicity<input class="c-eth" value="${SP.esc(info.ethnicity || '')}"></label>
    <label class="field">Disability<input class="c-dis" value="${SP.esc(info.disability || '')}"></label></div>
    <div class="row"><label class="field">LGBTQIA+<input class="c-lgbt" value="${SP.esc(info.lgbt || '')}"></label>
    <label class="field">Actor<input class="c-actor" value="${SP.esc(info.actor || '')}"></label></div>
    <label><input type="checkbox" class="c-ns" ${info.nonSpeaking ? 'checked' : ''}> Non-speaking character</label>
    <datalist id="dl-gender"><option>Female</option><option>Male</option><option>Non-binary</option><option>Unspecified</option></datalist>`,
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, action: m => {
      SP.doc.cast[name] = { desc: SP.$('.c-desc', m).value, age: SP.$('.c-age', m).value, gender: SP.$('.c-gender', m).value, ethnicity: SP.$('.c-eth', m).value, disability: SP.$('.c-dis', m).value, lgbt: SP.$('.c-lgbt', m).value, actor: SP.$('.c-actor', m).value, nonSpeaking: SP.$('.c-ns', m).checked };
      SP.markDirty(); SP.views.navigator();
    } }] });
};
T.nonSpeaking = async () => { const n = await U.prompt('Non-speaking character name'); if (!n) return; const k = n.trim().toUpperCase(); SP.doc.cast[k] = { ...(SP.doc.cast[k] || {}), nonSpeaking: true }; SP.markDirty(); SP.views.navigator(); };

/* ================= tags ================= */
T.collectTags = () => {
  const out = []; const d = document.createElement('div');
  SP.doc.paras.forEach(p => { if (!p.html.includes('tag')) return; d.innerHTML = p.html; SP.$$('span.tag', d).forEach(s => out.push({ cat: s.dataset.cat, text: s.textContent.trim(), paraId: p.id })); });
  return out;
};
T.tagSelection = () => {
  const sel = getSelection(); if (sel.isCollapsed || !SP.editor.curPara()) return U.alert('Select some text in the script to tag (e.g. a prop or costume).');
  const r = sel.getRangeAt(0).getBoundingClientRect();
  U.popupMenu(r.left, r.bottom + 4, SP.doc.tagCats.map(c => ({ label: c.name, swatch: c.color, action: () => { SP.editor.wrapSelection('span', 'tag', { 'data-cat': c.name, style: `--tc:${c.color}` }); T.tagStyles(); SP.views.navigator(); } })).concat([{ sep: true }, { label: 'Remove tags from selection', action: () => SP.editor.unwrapSelection('span.tag') }]));
};
T.tagStyles = () => {
  let st = SP.$('#tag-styles'); if (!st) { st = document.createElement('style'); st.id = 'tag-styles'; document.head.appendChild(st); }
  st.textContent = SP.doc.tagCats.map(c => `.tags-mode .script span.tag[data-cat="${CSS.escape(c.name)}"]{background:${c.color}33;border-bottom:2px solid ${c.color}}`).join('');
};
T.tagCategories = () => {
  const draw = m => SP.$('.tc-list', m).innerHTML = SP.doc.tagCats.map((c, i) => `<div class="row"><input type="color" data-tcc="${i}" value="${c.color}"><input data-tcn="${i}" value="${SP.esc(c.name)}"><button data-tcd="${i}">✕</button></div>`).join('');
  U.modal({ title: 'Tag Categories', body: '<div class="tc-list"></div><button class="tc-add">+ Category</button>', buttons: [{ label: 'Done', primary: true, action: () => { SP.markDirty(); T.tagStyles(); SP.views.navigator(); } }],
    onOpen: m => { draw(m);
      SP.$('.tc-add', m).onclick = () => { SP.doc.tagCats.push({ name: 'New Category', color: '#888888' }); draw(m); };
      m.addEventListener('input', e => { const ds = e.target.dataset; if (ds.tcc) SP.doc.tagCats[ds.tcc].color = e.target.value; if (ds.tcn) SP.doc.tagCats[ds.tcn].name = e.target.value; });
      m.addEventListener('click', e => { if (e.target.dataset.tcd) { SP.doc.tagCats.splice(+e.target.dataset.tcd, 1); draw(m); } }); } });
};
T.toggleTagsMode = () => { document.body.classList.toggle('tags-mode'); T.tagStyles(); U.toast(document.body.classList.contains('tags-mode') ? 'Tags Mode on — tagged items are highlighted.' : 'Tags Mode off.'); };

/* ================= track changes ================= */
T.toggleTracking = () => { SP.editor.sync(); SP.doc.settings.trackChanges = !SP.doc.settings.trackChanges; SP.markDirty(); SP.emit('settings'); U.toast('Track Changes ' + (SP.doc.settings.trackChanges ? 'on' : 'off')); SP.views.navigator(); };
T.acceptChange = id => { const p = SP.para(id); if (p) { delete p.orig; afterChange(); } };
T.rejectChange = id => { SP.pushUndo(true); const p = SP.para(id); if (!p) return; if (p.orig === '') SP.doc.paras.splice(SP.paraIndex(id), 1); else { p.html = p.orig; delete p.orig; } if (!SP.doc.paras.length) SP.doc.paras.push({ id: SP.uid(), type: 'scene', html: '' }); afterChange(); };
T.acceptDeletion = id => { SP.doc.deletions = SP.doc.deletions.filter(d => d.id !== id); afterChange(); };
T.rejectDeletion = id => {
  const d = SP.doc.deletions.find(x => x.id === id); if (!d) return; SP.pushUndo(true);
  const at = d.after ? SP.paraIndex(d.after) + 1 : 0; SP.doc.paras.splice(Math.max(0, at), 0, { ...d.para, id: SP.uid() });
  SP.doc.deletions = SP.doc.deletions.filter(x => x.id !== id); afterChange();
};
T.acceptAll = () => { SP.editor.sync(); SP.doc.paras.forEach(p => delete p.orig); SP.doc.deletions = []; afterChange(); };
T.rejectAll = () => { SP.editor.sync(); SP.pushUndo(true); [...SP.doc.deletions].reverse().forEach(d => T.rejectDeletion(d.id)); SP.doc.paras = SP.doc.paras.filter(p => p.orig !== ''); SP.doc.paras.forEach(p => { if (p.orig !== undefined) { p.html = p.orig; delete p.orig; } }); if (!SP.doc.paras.length) SP.doc.paras.push({ id: SP.uid(), type: 'scene', html: '' }); afterChange(); };
T.nextChange = (dir = 1) => {
  SP.editor.sync(); const ch = SP.doc.paras.filter(p => p.orig !== undefined); if (!ch.length) return U.toast('No tracked changes.');
  const cur = SP.editor.getCaret(); const ci = cur ? SP.paraIndex(cur.id) : -1;
  const list = dir > 0 ? ch.find(p => SP.paraIndex(p.id) > ci) || ch[0] : [...ch].reverse().find(p => SP.paraIndex(p.id) < ci) || ch[ch.length - 1];
  SP.editor.goTo(list.id);
};

/* ================= find / replace / go to ================= */
T.find = (replace) => {
  if (SP.$('.find-panel')) { SP.$('.find-panel .f-q').focus(); return; }
  const panel = document.createElement('div'); panel.className = 'find-panel';
  const selText = getSelection().toString();
  panel.innerHTML = `<div class="fp-row"><input class="f-q" placeholder="Find" value="${SP.esc(selText.length < 80 ? selText : '')}"><button class="f-prev" title="Previous">↑</button><button class="f-next" title="Next">↓</button><span class="f-count"></span><button class="f-close">✕</button></div>
   <div class="fp-row"><input class="f-r" placeholder="Replace with"><button class="f-rep">Replace</button><button class="f-all">Replace All</button></div>
   <div class="fp-row small"><label><input type="checkbox" class="f-case"> Match case</label><label><input type="checkbox" class="f-word"> Whole word</label>
   <label>In <select class="f-el"><option value="">All elements</option>${elemOpts('')}</select></label></div>`;
  document.body.appendChild(panel);
  const q = SP.$('.f-q', panel);
  let idx = -1;
  const re = () => { const v = q.value; if (!v) return null; let s = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (SP.$('.f-word', panel).checked) s = `\\b${s}\\b`; return new RegExp(s, SP.$('.f-case', panel).checked ? 'g' : 'gi'); };
  const matches = () => {
    const r = re(); if (!r) return []; const el = SP.$('.f-el', panel).value; const out = [];
    SP.$$('.p', SP.editor.root).forEach(d => { if (el && d.dataset.type !== el) return; const t = d.textContent; let m; r.lastIndex = 0; while ((m = r.exec(t))) { out.push({ d, start: m.index, end: m.index + m[0].length }); if (!m[0].length) r.lastIndex++; } });
    return out;
  };
  const selectRange = (d, start, end) => {
    const pos = (off) => { const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n, left = off; while ((n = tw.nextNode())) { if (left <= n.length) return [n, left]; left -= n.length; } return [d, d.childNodes.length]; };
    const r = document.createRange(); r.setStart(...pos(start)); r.setEnd(...pos(end));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); SP.editor.scrollIntoView(d);
  };
  const go = (dir) => {
    if (SP.ui.view !== 'script' && SP.ui.split !== 'script') SP.setView('script');
    const ms = matches(); SP.$('.f-count', panel).textContent = ms.length ? `${Math.max(1, idx + 1)}/${ms.length}` : 'No matches';
    if (!ms.length) return;
    idx = (idx + dir + ms.length) % ms.length; const m = ms[idx];
    selectRange(m.d, m.start, m.end); SP.$('.f-count', panel).textContent = `${idx + 1}/${ms.length}`;
  };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') panel.remove(); });
  q.addEventListener('input', () => { idx = -1; const n = matches().length; SP.$('.f-count', panel).textContent = q.value ? (n ? `${n} found` : 'No matches') : ''; });
  SP.$('.f-next', panel).onclick = () => go(1); SP.$('.f-prev', panel).onclick = () => go(-1);
  SP.$('.f-close', panel).onclick = () => panel.remove();
  SP.$('.f-rep', panel).onclick = () => {
    const sel = getSelection(); const r = re();
    if (r && !sel.isCollapsed && new RegExp('^(?:' + r.source + ')$', r.flags.replace('g', '')).test(sel.toString())) { SP.pushUndo(true); document.execCommand('insertText', false, SP.$('.f-r', panel).value); SP.editor.sync(); SP.markDirty(); idx--; }
    go(1);
  };
  SP.$('.f-all', panel).onclick = () => {
    const r = re(); if (!r) return; SP.editor.sync(); SP.pushUndo(true); let count = 0; const rep = SP.$('.f-r', panel).value; const el = SP.$('.f-el', panel).value;
    const d = document.createElement('div');
    SP.doc.paras.forEach(p => {
      if (el && p.type !== el) return;
      d.innerHTML = p.html; let changed = false;
      const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) { const v = n.textContent.replace(r, () => { count++; changed = true; return rep; }); if (changed) n.textContent = v; }
      if (changed) { p.html = d.innerHTML; if (SP.doc.settings.revisionMode) p.rev = SP.doc.settings.revisionColor; }
    });
    afterChange(); U.toast(`Replaced ${count} occurrence(s).`);
  };
  if (replace) setTimeout(() => SP.$('.f-r', panel).focus(), 10); else { q.focus(); q.select(); }
};
T.findSelection = () => { const s = getSelection().toString(); if (!s) return; SP.$('.find-panel')?.remove(); T.find(); setTimeout(() => SP.$('.find-panel .f-next').click(), 20); };
T.goTo = () => {
  const sc = SP.scenes(); const bm = SP.doc.paras.filter(p => p.bookmark);
  U.modal({ title: 'Go To', body: `<div class="row"><label class="field">Page<input class="g-page" type="text" placeholder="e.g. 12"></label><label class="field">Scene<select class="g-scene"><option value="">—</option>${sc.map(s => `<option value="${s.id}">${SP.esc(s.num + '. ' + s.heading.slice(0, 50))}</option>`).join('')}</select></label></div>
    ${bm.length ? `<label class="field">Bookmark<select class="g-bm"><option value="">—</option>${bm.map(p => `<option value="${p.id}">${SP.esc(p.bookmark)}</option>`).join('')}</select></label>` : ''}`,
    buttons: [{ label: 'Cancel' }, { label: 'Go', primary: true, action: m => {
      const pg = SP.$('.g-page', m).value.trim(), s = SP.$('.g-scene', m).value, b = SP.$('.g-bm', m)?.value;
      if (b) return SP.editor.goTo(b);
      if (s) return SP.editor.goTo(s);
      if (pg) { const pages = SP.paginate(SP.doc.paras); const p = pages.find(x => x.label.toUpperCase() === pg.toUpperCase()) || pages[Math.min(pages.length, Math.max(1, +pg || 1)) - 1]; if (p) SP.editor.goTo(p.items[0].para.id); }
    } }] });
};
T.selectScene = () => {
  const c = SP.editor.getCaret(); if (!c) return; SP.editor.sync(); const s = SP.sceneOf(c.id); if (!s) return;
  const first = SP.editor.paraEl(s.paras[0].id), last = SP.editor.paraEl(s.paras[s.paras.length - 1].id);
  const r = document.createRange(); r.setStartBefore(first.firstChild || first); r.setEnd(last, last.childNodes.length);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
};

/* ================= formatting documents ================= */
T.titlePage = () => {
  const t = SP.doc.titlePage;
  U.modal({ title: 'Title Page', wide: true, body: `
    <label class="field">Title<input class="t-title" value="${SP.esc(t.title)}"></label>
    <div class="row"><label class="field">Credit<input class="t-credit" value="${SP.esc(t.credit)}"></label><label class="field">Author(s)<input class="t-author" value="${SP.esc(t.author)}"></label></div>
    <label class="field">Source / Based on<textarea class="t-source" rows="2">${SP.esc(t.source)}</textarea></label>
    <div class="row"><label class="field">Draft<input class="t-draft" value="${SP.esc(t.draft)}" placeholder="First Draft"></label><label class="field">Date<input class="t-date" value="${SP.esc(t.date)}"></label></div>
    <label class="field">Contact (bottom left)<textarea class="t-contact" rows="4">${SP.esc(t.contact)}</textarea></label>
    <label class="field">Copyright / WGA registration<input class="t-copy" value="${SP.esc(t.copyright)}"></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Preview', action: m => { save(m); T.printPreview(); } }, { label: 'Save', primary: true, action: m => save(m) }] });
  function save(m) { Object.assign(t, { title: SP.$('.t-title', m).value, credit: SP.$('.t-credit', m).value, author: SP.$('.t-author', m).value, source: SP.$('.t-source', m).value, draft: SP.$('.t-draft', m).value, date: SP.$('.t-date', m).value, contact: SP.$('.t-contact', m).value, copyright: SP.$('.t-copy', m).value }); if (t.title && SP.doc.title === 'Untitled') SP.doc.title = t.title; SP.markDirty(); SP.emit('settings'); }
};
T.headerFooter = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Header and Footer', body: `<p class="muted">Tokens: {page} {pages} {title} {date} {rev}</p>
    <label class="field">Header (right-aligned)<input class="h-h" value="${SP.esc(s.header)}"></label>
    <label class="field">Footer<input class="h-f" value="${SP.esc(s.footer)}"></label>
    <label><input type="checkbox" class="h-first" ${s.headerFirstPage ? 'checked' : ''}> Show header on first page</label>`,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: m => { s.header = SP.$('.h-h', m).value; s.footer = SP.$('.h-f', m).value; s.headerFirstPage = SP.$('.h-first', m).checked; afterChange(); } }] });
};
T.moresContinueds = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Mores and Continueds', body: `
    <label><input type="checkbox" class="m-more" ${s.useMore ? 'checked' : ''}> Dialogue breaks across pages: bottom of page</label> <input class="m-moret" value="${SP.esc(s.more)}" size="10">
    <br><label><input type="checkbox" class="m-contd" ${s.useContd ? 'checked' : ''}> Top of next page: character name +</label> <input class="m-contdt" value="${SP.esc(s.contd)}" size="10">
    <br><label><input type="checkbox" class="m-auto" ${s.autoCharContd ? 'checked' : ''}> Automatic character continueds (same speaker after action)</label>
    <br><label><input type="checkbox" class="m-scene" ${s.sceneContd ? 'checked' : ''}> Scene continueds (CONTINUED: at page bottom)</label>`,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: m => { Object.assign(s, { useMore: SP.$('.m-more', m).checked, more: SP.$('.m-moret', m).value, useContd: SP.$('.m-contd', m).checked, contd: SP.$('.m-contdt', m).value, autoCharContd: SP.$('.m-auto', m).checked, sceneContd: SP.$('.m-scene', m).checked }); afterChange(); } }] });
};
T.watermark = async () => { const w = await U.prompt('Watermark text for printing/PDF (blank for none)', SP.doc.settings.watermark); if (w == null) return; SP.doc.settings.watermark = w; SP.markDirty(); };
T.pageLayout = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Page Layout', body: `
    <div class="row"><label class="field">Paper<select class="pl-paper">${opts([['letter', 'US Letter (8.5 × 11 in)'], ['a4', 'A4 (210 × 297 mm)']], s.paper)}</select></label>
    <label class="field">Lines per page<input type="number" class="pl-lines" min="30" max="70" value="${s.linesPerPage}"></label></div>
    <label class="field">Revision mark character<input class="pl-mark" value="${SP.esc(s.revisionMark)}" maxlength="2" size="3"></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: m => { s.paper = SP.$('.pl-paper', m).value; s.linesPerPage = +SP.$('.pl-lines', m).value || 54; s.revisionMark = SP.$('.pl-mark', m).value || '*'; document.body.dataset.paper = s.paper; afterChange(); } }] });
};
T.elements = (focusType) => {
  const els = SP.doc.settings.elements; let cur = focusType || (SP.editor.curPara()?.dataset.type) || 'scene';
  const form = (k) => { const e = els[k]; return `
    <div class="row"><label class="field">Name<input data-f="name" value="${SP.esc(e.name)}"></label><label class="field">Shortcut (Alt+)<input data-f="shortcut" value="${SP.esc(e.shortcut || '')}" maxlength="1" size="2"></label></div>
    <div class="row"><label class="field">Left indent (in)<input type="number" step="0.1" data-f="left" value="${e.left}"></label><label class="field">Right indent (in)<input type="number" step="0.1" data-f="right" value="${e.right}"></label>
    <label class="field">Space before (lines)<input type="number" min="0" max="4" data-f="spaceBefore" value="${e.spaceBefore || 0}"></label><label class="field">Line spacing<input type="number" min="1" max="2" step="0.5" data-f="lineSpacing" value="${e.lineSpacing || 1}"></label></div>
    <div class="row"><label class="field">Alignment<select data-f="align">${opts([['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justified']], e.align)}</select></label>
    <label class="field">Next on Enter<select data-f="enter">${elemOpts(e.enter)}</select></label><label class="field">Next on Tab<select data-f="tab">${elemOpts(e.tab)}</select></label><label class="field">Tab when empty<select data-f="tabEmpty">${elemOpts(e.tabEmpty)}</select></label></div>
    <div class="row checks"><label><input type="checkbox" data-f="caps" ${e.caps ? 'checked' : ''}> ALL CAPS</label><label><input type="checkbox" data-f="bold" ${e.bold ? 'checked' : ''}> Bold</label><label><input type="checkbox" data-f="italic" ${e.italic ? 'checked' : ''}> Italic</label><label><input type="checkbox" data-f="underline" ${e.underline ? 'checked' : ''}> Underline</label><label><input type="checkbox" data-f="sceneLike" ${e.sceneLike ? 'checked' : ''}> Starts a scene</label><label><input type="checkbox" data-f="newPage" ${e.newPage ? 'checked' : ''}> Starts new page</label></div>`; };
  U.modal({ title: 'Elements', wide: true, body: `<div class="el-layout"><div class="el-list"></div><div class="el-form"></div></div><button class="el-add">+ New Element</button>`,
    buttons: [{ label: 'Reset to Defaults', left: true, action: () => { SP.doc.settings.elements = SP.clone(SP.BASE_ELEMENTS); SP.applyElementStyles(); afterChange(); } }, { label: 'Done', primary: true, action: () => { SP.applyElementStyles(); afterChange(); } }],
    onOpen: m => {
      const draw = () => { SP.$('.el-list', m).innerHTML = Object.keys(els).map(k => `<div class="el-item${k === cur ? ' on' : ''}" data-k="${k}">${SP.esc(els[k].name)}</div>`).join(''); SP.$('.el-form', m).innerHTML = form(cur); };
      draw();
      SP.$('.el-list', m).onclick = e => { const it = e.target.closest('.el-item'); if (it) { cur = it.dataset.k; draw(); } };
      SP.$('.el-form', m).addEventListener('input', e => { const f = e.target.dataset.f; if (!f) return; const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value; els[cur][f] = v; SP.applyElementStyles(); if (f === 'name') SP.$(`.el-item[data-k="${cur}"]`, m).textContent = v; });
      SP.$('.el-add', m).onclick = async () => { const n = await U.prompt('New element name'); if (!n) return; const k = 'custom_' + SP.uid(); els[k] = { ...SP.clone(SP.BASE_ELEMENTS.general), name: n, enter: k }; cur = k; draw(); };
    } });
};
T.reformat = () => {
  U.modal({ title: 'Reformat', body: `<p class="muted">Change element types in bulk.</p><div class="row"><label class="field">From<select class="rf-from">${elemOpts('action')}</select></label><label class="field">To<select class="rf-to">${elemOpts('general')}</select></label></div>
    <label><input type="radio" name="rf-scope" value="sel" checked> Selection</label> <label><input type="radio" name="rf-scope" value="all"> Entire script</label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Reformat', primary: true, action: m => {
      SP.editor.sync(); SP.pushUndo(true);
      const from = SP.$('.rf-from', m).value, to = SP.$('.rf-to', m).value; const scope = SP.$('input[name=rf-scope]:checked', m).value;
      const ids = scope === 'sel' ? new Set(SP.editor.selectedParas().map(d => d.dataset.id)) : null; let n = 0;
      SP.doc.paras.forEach(p => { if (p.type === from && (!ids || ids.has(p.id))) { p.type = to; n++; } });
      afterChange(); U.toast(`Reformatted ${n} element(s).`);
    } }] });
};
T.smartType = () => {
  const st = SP.doc.settings.smartType;
  const ta = (k, l) => `<label class="field">${l}<textarea data-k="${k}" rows="6">${SP.esc(st[k].join('\n'))}</textarea></label>`;
  const auto = { characters: SP.characters().map(c => c.name), locations: SP.locations().map(l => l.name) };
  U.modal({ title: 'SmartType', wide: true, body: `<p class="muted">SmartType suggests entries while you type. Characters and locations already in the script are learned automatically (${auto.characters.length} characters, ${auto.locations.length} locations).</p>
    <div class="grid2">${ta('characters', 'Extra Characters')}${ta('extensions', 'Character Extensions')}${ta('intros', 'Scene Intros')}${ta('locations', 'Extra Locations')}${ta('times', 'Times of Day')}${ta('transitions', 'Transitions')}</div>`,
    buttons: [{ label: 'Rebuild from Script', left: true, action: m => { SP.$('[data-k=characters]', m).value = auto.characters.join('\n'); SP.$('[data-k=locations]', m).value = auto.locations.join('\n'); return false; } }, { label: 'Cancel' }, { label: 'Save', primary: true, action: m => { SP.$$('textarea', m).forEach(t => st[t.dataset.k] = t.value.split('\n').map(x => x.trim() ? (t.dataset.k === 'intros' ? x.replace(/\s*$/, ' ') : x.trim()) : '').filter(Boolean)); SP.markDirty(); } }] });
};
T.macros = () => {
  const ms = SP.doc.settings.macros;
  const draw = m => SP.$('.mc-list', m).innerHTML = ms.map((x, i) => `<div class="row"><label class="field">Alt+Shift+<input data-mk="${i}" value="${SP.esc(x.key)}" maxlength="1" size="2"></label><label class="field" style="flex:3">Text<input data-mt="${i}" value="${SP.esc(x.text)}"></label><label class="field">Element (if empty)<select data-me="${i}"><option value="">Keep</option>${elemOpts(x.type)}</select></label><button data-md="${i}">✕</button></div>`).join('');
  U.modal({ title: 'Macros', wide: true, body: '<p class="muted">Press Alt+Shift+key in the script to insert the text.</p><div class="mc-list"></div><button class="mc-add">+ Macro</button>', buttons: [{ label: 'Done', primary: true, action: () => SP.markDirty() }],
    onOpen: m => { draw(m);
      SP.$('.mc-add', m).onclick = () => { ms.push({ key: String(ms.length + 1).slice(-1), text: '', type: null }); draw(m); };
      m.addEventListener('input', e => { const d = e.target.dataset; if (d.mk) ms[d.mk].key = e.target.value; if (d.mt) ms[d.mt].text = e.target.value; if (d.me) ms[d.me].type = e.target.value || null; });
      m.addEventListener('click', e => { if (e.target.dataset.md) { ms.splice(+e.target.dataset.md, 1); draw(m); } }); } });
};

/* ================= production ================= */
T.sceneNumbers = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Scene Numbers', body: `
    <label class="field">Show scene numbers<select class="sn-pos">${opts([['none', 'Off'], ['left', 'Left'], ['right', 'Right'], ['both', 'Left and Right']], s.sceneNumbers)}</select></label>
    <label class="field">Start at<input type="number" class="sn-start" value="${s.sceneStart || 1}" min="1"></label>
    <label><input type="radio" name="sn-mode" value="renumber" ${!s.sceneNumbersLocked ? 'checked' : ''}> Renumber all scenes automatically</label><br>
    <label><input type="radio" name="sn-mode" value="keep" ${s.sceneNumbersLocked ? 'checked' : ''}> Keep (lock) existing numbers — new scenes get A, B suffixes</label>`,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: m => {
      SP.editor.sync(); SP.pushUndo(true);
      s.sceneNumbers = SP.$('.sn-pos', m).value; s.sceneStart = +SP.$('.sn-start', m).value || 1;
      const keep = SP.$('input[name=sn-mode]:checked', m).value === 'keep';
      if (keep && !s.sceneNumbersLocked) { SP.scenes().forEach(sc => { sc.para.sceneNum = sc.num; }); }
      if (!keep) SP.doc.paras.forEach(p => { delete p.sceneNum; delete p.sceneNumManual; });
      s.sceneNumbersLocked = keep;
      afterChange();
    } }] });
};
T.editSceneNumber = async () => {
  SP.editor.sync(); const c = SP.editor.getCaret(); const sc = c && SP.sceneOf(c.id); if (!sc) return U.alert('Place the cursor in a scene.');
  const n = await U.prompt('Scene number', sc.num); if (!n) return;
  sc.para.sceneNum = n.trim(); sc.para.sceneNumManual = true; if (SP.doc.settings.sceneNumbers === 'none') SP.doc.settings.sceneNumbers = 'both'; afterChange();
};
T.omitScene = () => {
  SP.editor.sync(); const c = SP.editor.getCaret(); const sc = c && SP.sceneOf(c.id); if (!sc) return U.alert('Place the cursor in a scene.');
  SP.pushUndo(true); const p = sc.para;
  if (p.omitted) {
    const at = SP.paraIndex(p.id); p.html = p.omitted.html; SP.doc.paras.splice(at + 1, 0, ...p.omitted.paras); delete p.omitted; U.toast('Scene restored.');
  } else {
    if (!SP.doc.settings.sceneNumbersLocked) { SP.scenes().forEach(x => x.para.sceneNum = x.num); SP.doc.settings.sceneNumbersLocked = true; }
    p.omitted = { html: p.html, paras: sc.paras.slice(1) };
    const ids = new Set(sc.paras.slice(1).map(x => x.id)); SP.doc.paras = SP.doc.paras.filter(x => !ids.has(x.id)); p.html = 'OMITTED';
    if (SP.doc.settings.sceneNumbers === 'none') SP.doc.settings.sceneNumbers = 'both';
    U.toast('Scene omitted (scene numbers locked). Omit again to restore.');
  }
  afterChange();
};
T.revisions = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Revisions', body: `
    <div class="row"><label class="field">Current revision color<select class="rv-c">${opts(SP.REVISION_COLORS.map(r => [r.name, r.name]), s.revisionColor)}</select></label>
    <label class="field">Revision name (header {rev})<input class="rv-n" value="${SP.esc(s.revisionName)}"></label></div>
    <label><input type="checkbox" class="rv-mode" ${s.revisionMode ? 'checked' : ''}> Revision Mode (mark every edit as revised)</label>
    <p class="muted">Revised elements show a ${SP.esc(s.revisionMark)} in the right margin and print with it.</p>
    <table class="tbl"><tr><th>Revision</th><th>Elements</th></tr>${SP.REVISION_COLORS.map(r => { const n = SP.doc.paras.filter(p => p.rev === r.name).length; return n ? `<tr><td><span class="dot" style="background:${r.color}"></span> ${r.name}</td><td>${n}</td></tr>` : ''; }).join('')}</table>`,
    buttons: [{ label: 'Clear All Revisions', left: true, action: () => { SP.editor.sync(); SP.pushUndo(true); SP.doc.paras.forEach(p => delete p.rev); afterChange(); } }, { label: 'Cancel' }, { label: 'OK', primary: true, action: m => { s.revisionColor = SP.$('.rv-c', m).value; s.revisionName = SP.$('.rv-n', m).value; s.revisionMode = SP.$('.rv-mode', m).checked; SP.markDirty(); SP.emit('settings'); } }] });
};
T.toggleRevisionMode = () => { SP.doc.settings.revisionMode = !SP.doc.settings.revisionMode; SP.markDirty(); SP.emit('settings'); U.toast('Revision Mode ' + (SP.doc.settings.revisionMode ? `on (${SP.doc.settings.revisionColor})` : 'off')); };
T.markRevised = (clear) => {
  SP.editor.sync(); SP.pushUndo(true);
  const sel = SP.editor.selectedParas(); const ids = new Set(sel.map(d => d.dataset.id));
  if (!ids.size && clear) { SP.doc.paras.forEach(p => delete p.rev); }
  SP.doc.paras.forEach(p => { if (ids.has(p.id)) { if (clear) delete p.rev; else p.rev = SP.doc.settings.revisionColor; } });
  afterChange();
};
T.lockPages = (lock) => {
  SP.editor.sync(); const s = SP.doc.settings;
  if (lock) {
    const pages = SP.paginate(SP.doc.paras);
    SP.doc.lockedPages = pages.map(pg => ({ id: (pg.items.find(it => !it.cont) || pg.items[0]).para.id, label: pg.label }));
    s.pagesLocked = true; U.toast(`Locked ${pages.length} pages. New material flows onto A/B pages.`);
  } else { s.pagesLocked = false; U.toast('Pages unlocked.'); }
  afterChange();
};
T.shootingScript = () => {
  const s = SP.doc.settings; s.shooting = !s.shooting;
  if (s.shooting) { s.sceneNumbers = 'both'; s.sceneContd = true; } else { s.sceneContd = false; }
  afterChange(); U.toast('Shooting script ' + (s.shooting ? 'on (scene numbers + CONTINUEDs)' : 'off'));
};

/* ================= characters ================= */
T.renameCharacter = () => {
  const cs = SP.characters().map(c => c.name);
  U.modal({ title: 'Rename Character', body: `<div class="row"><label class="field">Character<select class="rn-from">${opts(cs.map(c => [c, c]))}</select></label><label class="field">New name<input class="rn-to"></label></div>
    <label><input type="checkbox" class="rn-text" checked> Also replace the name in Action and Dialogue (whole word, matching case)</label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Rename', primary: true, action: m => {
      const from = SP.$('.rn-from', m).value, to = SP.$('.rn-to', m).value.trim(); if (!from || !to) return false;
      SP.editor.sync(); SP.pushUndo(true); let n = 0; const all = SP.$('.rn-text', m).checked;
      const cap = w => w.charAt(0) + w.slice(1).toLowerCase();
      const pairs = [[from, to.toUpperCase()], [cap(from), cap(to.toUpperCase())]];
      const d = document.createElement('div');
      SP.doc.paras.forEach(p => {
        if (p.type !== 'character' && !(all && ['action', 'dialogue', 'parenthetical', 'general', 'scene'].includes(p.type))) return;
        d.innerHTML = p.html; let ch = false;
        const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let t;
        while ((t = tw.nextNode())) { let v = t.textContent; pairs.forEach(([a, b]) => { v = v.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, p.type === 'character' ? 'gi' : 'g'), () => { n++; ch = true; return b; }); }); if (ch) t.textContent = v; }
        if (ch) p.html = d.innerHTML;
      });
      if (SP.doc.cast[from]) { SP.doc.cast[to.toUpperCase()] = SP.doc.cast[from]; delete SP.doc.cast[from]; }
      afterChange(); U.toast(`Renamed ${n} occurrence(s).`);
    } }] });
};
T.highlightCharacters = () => {
  const hl = SP.doc.settings.highlightChars; const cs = SP.characters().filter(c => !c.nonSpeaking);
  U.modal({ title: 'Highlight Characters', body: `<p class="muted">Highlight each character's dialogue in the script.</p><div class="hl-list">${cs.map(c => `<div class="row"><span style="flex:2">${SP.esc(c.name)}</span><select data-hl="${SP.esc(c.name)}">${colorOpts(hl[c.name])}</select></div>`).join('')}</div>`,
    buttons: [{ label: 'Clear All', left: true, action: () => { SP.doc.settings.highlightChars = {}; SP.applyElementStyles(); SP.editor.decorate(); } }, { label: 'Done', primary: true, action: m => { SP.$$('[data-hl]', m).forEach(s => { if (s.value) hl[s.dataset.hl] = s.value; else delete hl[s.dataset.hl]; }); SP.applyElementStyles(); SP.editor.decorate(); SP.markDirty(); SP.views.navigator(); } }] });
};

/* ================= names database ================= */
const NAMES = {
  Female: 'Abigail Ada Aisha Alejandra Amara Amelia Ana Anjali Aria Astrid Ava Beatriz Bianca Camila Carmen Chiara Chloe Daisy Dalia Elena Eliza Emma Esme Eva Fatima Freya Gabriela Grace Hana Harper Imani Ines Ingrid Isla Ivy Jade Jasmine Julia Kaia Keiko Lara Layla Leah Lena Lila Lucia Luna Maeve Maya Mei Mila Nadia Naomi Nia Noor Olivia Paloma Priya Quinn Rana Rosa Ruby Sakura Sara Selin Sofia Talia Tamar Thea Uma Valentina Vera Willa Ximena Yara Yuki Zara Zoe'.split(' '),
  Male: 'Aaron Adrian Ahmed Alejandro Ali Amir Andre Arjun Asher Ben Caleb Carlos Cyrus Dante Darius Diego Elias Emeka Ethan Felix Finn Gabriel Hassan Henry Hiro Hugo Ian Idris Isaac Ivan Jamal James Javier Jonah Kai Kenji Kofi Leo Liam Luca Malik Marco Mateo Max Miles Nico Noah Omar Oscar Pablo Rafael Ravi Remy Rohan Sami Santiago Sean Silas Tariq Theo Tomas Viktor Wes Xavier Yusuf Zane'.split(' '),
  Neutral: 'Alex Avery Blake Cameron Casey Charlie Dakota Drew Eden Emerson Finley Frankie Hayden Jamie Jordan Jules Kendall Logan Morgan Parker Peyton Quinn Reese Riley Robin Rowan Sage Sam Skyler Taylor'.split(' '),
  Surname: 'Abara Adams Ahmed Alvarez Anand Bauer Bennett Brooks Castillo Chen Cohen Costa Diaz Dubois Edwards Evans Fischer Flores Garcia Greene Gupta Hall Haddad Hughes Ibrahim Ito Jensen Johansson Kaur Khan Kim Kowalski Lee Lopez Martin Mendoza Moreau Murphy Nakamura Nguyen Novak Okafor Okoye Olsen Park Patel Perez Petrov Quinn Rahman Ramos Reyes Rossi Sato Schmidt Silva Singh Sokolov Suzuki Tanaka Torres Vargas Wagner Walsh Wang Williams Wong Yilmaz Zhang'.split(' ')
};
T.namesDatabase = () => {
  U.modal({ title: 'Names Database', wide: true, body: `<div class="row"><label class="field">Search<input class="nd-q" placeholder="Starts with…"></label><label class="field">Type<select class="nd-t">${opts([['all', 'All first names'], ['Female', 'Female'], ['Male', 'Male'], ['Neutral', 'Gender-neutral'], ['Surname', 'Surnames']], 'all')}</select></label><button class="nd-rand">Random Full Name</button></div><div class="nd-list"></div>`,
    buttons: [{ label: 'Close', primary: true }],
    onOpen: m => {
      const draw = () => { const q = SP.$('.nd-q', m).value.toLowerCase(), t = SP.$('.nd-t', m).value; const list = (t === 'all' ? [...NAMES.Female, ...NAMES.Male, ...NAMES.Neutral] : NAMES[t]).filter(n => n.toLowerCase().startsWith(q)).sort(); SP.$('.nd-list', m).innerHTML = list.map(n => `<button class="chip" data-n="${n}">${n}</button>`).join('') || '<p class="muted">No matches.</p>'; };
      draw(); SP.$('.nd-q', m).oninput = draw; SP.$('.nd-t', m).onchange = draw;
      SP.$('.nd-rand', m).onclick = () => { const pool = [...NAMES.Female, ...NAMES.Male, ...NAMES.Neutral]; const n = pool[Math.floor(Math.random() * pool.length)] + ' ' + NAMES.Surname[Math.floor(Math.random() * NAMES.Surname.length)]; SP.$('.nd-list', m).innerHTML = `<button class="chip big" data-n="${n}">${n}</button>`; };
      SP.$('.nd-list', m).onclick = e => { const n = e.target.dataset.n; if (!n) return; m.close(); SP.editor.root.focus(); document.execCommand('insertText', false, n); SP.editor.sync(); SP.markDirty(); };
    } });
};

/* ================= writing aids ================= */
T.thesaurus = () => {
  const w = getSelection().toString().trim().split(/\s+/)[0] || '';
  U.modal({ title: 'Thesaurus', body: `<div class="row"><input class="th-q" value="${SP.esc(w)}" placeholder="Word"><button class="th-go">Look up</button></div><p class="muted small">Uses the free Datamuse word service online; only the word you look up is sent.</p><div class="th-res"></div>`,
    buttons: [{ label: 'Close', primary: true }],
    onOpen: m => {
      const go = async () => { const q = SP.$('.th-q', m).value.trim(); if (!q) return; const res = SP.$('.th-res', m); res.textContent = 'Looking up…';
        try { const [syn, rel] = await Promise.all(['rel_syn', 'ml'].map(k => fetch(`https://api.datamuse.com/words?${k}=${encodeURIComponent(q)}&max=30`).then(r => r.json())));
          const words = [...new Set([...syn, ...rel].map(x => x.word))].slice(0, 40);
          res.innerHTML = words.length ? words.map(x => `<button class="chip" data-w="${SP.esc(x)}">${SP.esc(x)}</button>`).join('') : '<p class="muted">No results.</p>';
        } catch { res.innerHTML = '<p class="muted">Could not reach the thesaurus service (offline?).</p>'; } };
      SP.$('.th-go', m).onclick = go; SP.$('.th-q', m).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
      SP.$('.th-res', m).onclick = e => { const x = e.target.dataset.w; if (!x) return; m.close(); SP.editor.root.focus(); if (!getSelection().isCollapsed) { document.execCommand('insertText', false, x); SP.editor.sync(); SP.markDirty(); } };
      if (w) go();
    } });
};
let recog = null;
T.dictation = () => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return U.alert('Dictation needs a browser with speech recognition (Chrome, Edge or Safari).');
  if (recog) { recog.stop(); recog = null; U.toast('Dictation stopped.'); SP.$('#st-sprint').classList.remove('rec'); return; }
  recog = new R(); recog.continuous = true; recog.interimResults = false; recog.lang = navigator.language || 'en-US';
  recog.onresult = e => { const t = Array.from(e.results).slice(e.resultIndex).filter(r => r.isFinal).map(r => r[0].transcript).join(' '); if (t) { SP.editor.root.focus(); document.execCommand('insertText', false, t.trim() + ' '); SP.editor.sync(); SP.markDirty(); } };
  recog.onend = () => { if (recog) recog.start(); };
  recog.start(); U.toast('Dictation on — speak; choose Tools › Dictation again to stop.');
};
let sprint = null;
T.sprint = () => {
  if (sprint) { return U.confirm('Stop the current sprint?').then(ok => { if (ok) endSprint(true); }); }
  U.modal({ title: 'Sprint Timer', body: `<p>Write without stopping. Words written are counted when the sprint ends.</p><label class="field">Minutes<input type="number" class="sp-min" value="15" min="1" max="180"></label><label class="field">Word goal (optional)<input type="number" class="sp-goal" placeholder="e.g. 300"></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Start Sprint', primary: true, action: m => {
      const min = +SP.$('.sp-min', m).value || 15; sprint = { end: Date.now() + min * 60000, start: T.totalWords(), goal: +SP.$('.sp-goal', m).value || 0, min };
      sprint.timer = setInterval(() => { const left = sprint.end - Date.now(); if (left <= 0) return endSprint(); const words = T.totalWords() - sprint.start; SP.$('#st-sprint').textContent = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} · ${words}${sprint.goal ? '/' + sprint.goal : ''} words`; }, 1000);
      SP.editor.root.focus();
    } }] });
};
function endSprint(cancel) {
  clearInterval(sprint.timer); const words = Math.max(0, T.totalWords() - sprint.start); const s = sprint; sprint = null; SP.$('#st-sprint').textContent = '';
  if (!cancel) { const log = SP.store.get('sprints', []); log.push({ t: Date.now(), min: s.min, words }); SP.store.set('sprints', log.slice(-100)); U.alert(`Sprint complete! You wrote ${words} words in ${s.min} minutes${s.goal ? (words >= s.goal ? ' — goal reached 🎉' : ` (goal ${s.goal})`) : ''}.`, 'Sprint Timer'); }
}
T.totalWords = () => SP.doc.paras.reduce((n, p) => n + SP.wordCount(SP.textOf(p.html)), 0);
T.trackDaily = () => {
  const d = SP.today(); const all = SP.store.get('daily', {}); const w = T.totalWords();
  const e = all[d] || { start: w, written: 0, last: w };
  if (w > e.last) e.written += w - e.last; e.last = w; all[d] = e; SP.store.set('daily', all);
};
T.writingStats = () => {
  const all = SP.store.get('daily', {}); const goal = SP.doc.settings.dailyWordGoal;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { d, w: (all[d] || {}).written || 0 }; });
  const max = Math.max(goal, ...days.map(x => x.w), 1);
  const sprints = SP.store.get('sprints', []);
  const streak = (() => { let n = 0; for (let i = days.length - 1; i >= 0; i--) { if (days[i].w >= goal) n++; else if (i < days.length - 1) break; } return n; })();
  U.modal({ title: 'Writing Stats & Goals', wide: true, body: `
    <div class="stat-tiles"><div><b>${days[13].w}</b><small>words today</small></div><div><b>${goal}</b><small>daily goal</small></div><div><b>${streak}</b><small>day streak</small></div><div><b>${sprints.length}</b><small>sprints</small></div><div><b>${T.totalWords()}</b><small>words in script</small></div></div>
    <div class="bars">${days.map(x => `<div class="bar-col" title="${x.d}: ${x.w} words"><div class="bar${x.w >= goal ? ' met' : ''}" style="height:${x.w / max * 100}%"></div><small>${x.d.slice(8)}</small></div>`).join('')}<div class="goal-line" style="bottom:${goal / max * 100}%"></div></div>
    <div class="row"><label class="field">Daily word goal<input type="number" class="ws-goal" value="${goal}"></label><label class="field">Target script length (pages)<input type="number" class="ws-target" value="${SP.doc.settings.targetPages}"></label></div>`,
    buttons: [{ label: 'Close' }, { label: 'Save Goals', primary: true, action: m => { SP.doc.settings.dailyWordGoal = +SP.$('.ws-goal', m).value || 500; SP.doc.settings.targetPages = +SP.$('.ws-target', m).value || 110; SP.markDirty(); SP.emit('settings'); } }] });
};
T.targetLength = async () => { const v = await U.prompt('Target script length (pages)', SP.doc.settings.targetPages); if (v == null) return; SP.doc.settings.targetPages = +v || 110; SP.markDirty(); SP.emit('settings'); SP.views.outlineBar(); };

/* ================= table read ================= */
let reading = null;
T.assignVoices = () => {
  if (!('speechSynthesis' in window)) return U.alert('This browser has no speech synthesis.');
  const voices = speechSynthesis.getVoices(); const vs = SP.doc.settings.voices;
  if (!voices.length) { speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; T.assignVoices(); }; return U.toast('Loading voices…'); }
  const vo = (sel) => '<option value="">Default</option>' + voices.map(v => `<option value="${SP.esc(v.name)}"${v.name === sel ? ' selected' : ''}>${SP.esc(v.name)} (${v.lang})</option>`).join('');
  U.modal({ title: 'Assign Voices', wide: true, body: `<div class="row"><label class="field">Narrator (headings & action)<select class="av-n">${vo(SP.doc.settings.narratorVoice)}</select></label><label><input type="checkbox" class="av-a" ${SP.doc.settings.readAction ? 'checked' : ''}> Read action & headings</label></div>
    ${SP.characters().filter(c => !c.nonSpeaking).map(c => `<div class="row"><span style="flex:1">${SP.esc(c.name)}</span><select data-v="${SP.esc(c.name)}" style="flex:2">${vo(vs[c.name])}</select><button data-test="${SP.esc(c.name)}">▶</button></div>`).join('')}`,
    buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, action: m => { SP.doc.settings.narratorVoice = SP.$('.av-n', m).value; SP.doc.settings.readAction = SP.$('.av-a', m).checked; SP.$$('[data-v]', m).forEach(s => { if (s.value) vs[s.dataset.v] = s.value; else delete vs[s.dataset.v]; }); SP.markDirty(); } }],
    onOpen: m => m.addEventListener('click', e => { const n = e.target.dataset.test; if (!n) return; const u = new SpeechSynthesisUtterance(`Hi, I'm ${n}.`); const v = voices.find(x => x.name === SP.$(`[data-v="${CSS.escape(n)}"]`, m).value); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); }) });
};
T.tableRead = () => {
  if (!('speechSynthesis' in window)) return U.alert('This browser has no speech synthesis.');
  if (reading) { reading.stop(); return; }
  SP.editor.sync();
  const voices = speechSynthesis.getVoices(); const s = SP.doc.settings;
  const cur = SP.editor.getCaret(); let i = cur ? SP.paraIndex(cur.id) : 0; let speaker = null;
  const bar = document.createElement('div'); bar.className = 'tableread-bar'; bar.innerHTML = '<span>▶ Table Read</span><button class="tr-stop">Stop</button>'; document.body.appendChild(bar);
  reading = { stop: () => { reading = null; speechSynthesis.cancel(); bar.remove(); SP.$$('.reading', SP.editor.root).forEach(x => x.classList.remove('reading')); } };
  SP.$('.tr-stop', bar).onclick = () => reading && reading.stop();
  // set speaker context from before caret
  for (let k = i; k >= 0; k--) { const q = SP.doc.paras[k]; if (q.type === 'character') { speaker = SP.charName(SP.textOf(q.html)); break; } if (!['dialogue', 'parenthetical', 'lyrics'].includes(q.type)) break; }
  const next = () => {
    if (!reading) return;
    if (i >= SP.doc.paras.length) return reading.stop();
    const p = SP.doc.paras[i++]; const text = SP.textOf(p.html).trim();
    SP.$$('.reading', SP.editor.root).forEach(x => x.classList.remove('reading'));
    const el = SP.editor.paraEl(p.id); if (el) { el.classList.add('reading'); SP.editor.scrollIntoView(el); }
    let voiceName = null, say = text;
    if (p.type === 'character') { speaker = SP.charName(text); return next(); }
    if (p.type === 'parenthetical') return next();
    if (['dialogue', 'lyrics'].includes(p.type)) voiceName = s.voices[speaker];
    else { speaker = null; if (!s.readAction || !text) return next(); voiceName = s.narratorVoice; if (p.type === 'scene') say = text.replace(/^INT\.?\s*/i, 'Interior. ').replace(/^EXT\.?\s*/i, 'Exterior. ').replace(/ - /g, ', '); }
    if (!say) return next();
    const u = new SpeechSynthesisUtterance(say); const v = voices.find(x => x.name === voiceName); if (v) u.voice = v;
    u.onend = next; u.onerror = next; speechSynthesis.speak(u);
  };
  next();
};

/* ================= format assistant ================= */
T.formatAssistant = () => {
  SP.editor.sync(); const issues = []; const ps = SP.doc.paras;
  ps.forEach((p, i) => {
    const t = SP.textOf(p.html).trim(); const prev = ps[i - 1], next = ps[i + 1];
    if (!t && p.type !== 'general' && i !== ps.length - 1) issues.push([p, 'Empty element']);
    if (p.type === 'scene' && t && !/^(INT|EXT|EST|I\/E|INT\.?\/EXT|SCENE|OMITTED)/i.test(t)) issues.push([p, 'Scene heading does not start with INT./EXT.']);
    if (p.type === 'scene' && t && /^(INT|EXT)/i.test(t) && !/ - /.test(t)) issues.push([p, 'Scene heading missing time of day (“ - DAY”)']);
    if (p.type === 'character' && (!next || !['dialogue', 'parenthetical', 'lyrics'].includes(next.type))) issues.push([p, 'Character without dialogue']);
    if (p.type === 'dialogue' && (!prev || !['character', 'parenthetical', 'dialogue', 'lyrics'].includes(prev.type))) issues.push([p, 'Dialogue without a character']);
    if (p.type === 'parenthetical' && (!next || next.type !== 'dialogue') && (!prev || prev.type !== 'dialogue')) issues.push([p, 'Orphaned parenthetical']);
    if (p.type === 'parenthetical' && t && !/^\(.*\)$/.test(t)) issues.push([p, 'Parenthetical missing parentheses']);
    if (p.type === 'transition' && next && !['scene', 'newact', 'endact', 'transition'].includes(next.type)) issues.push([p, 'Transition not followed by a scene heading']);
    if (p.type === 'action' && t && t === t.toUpperCase() && /[A-Z]{3}/.test(t) && t.length < 40 && next && next.type === 'dialogue') issues.push([p, 'Looks like a Character formatted as Action']);
    if (p.type === 'character' && t.length > 38) issues.push([p, 'Character name is very long']);
  });
  U.modal({ title: 'Format Assistant', wide: true, body: issues.length ? `<p>${issues.length} possible issue(s):</p><div class="fa-list">${issues.map(([p, m], k) => `<div class="fa-row"><span class="tag-pill">${SP.esc(SP.el(p.type).name)}</span><span style="flex:1">${SP.esc(m)} — <i>${SP.esc(SP.textOf(p.html).slice(0, 50) || '(empty)')}</i></span><button data-go="${p.id}">Go</button>${m === 'Empty element' ? `<button data-fix="${p.id}">Remove</button>` : ''}</div>`).join('')}</div>` : '<p>✔ No formatting problems found.</p>',
    buttons: [{ label: 'Close', primary: true }],
    onOpen: m => m.addEventListener('click', e => { if (e.target.dataset.go) { m.close(); SP.editor.goTo(e.target.dataset.go); } if (e.target.dataset.fix) { SP.pushUndo(true); SP.doc.paras.splice(SP.paraIndex(e.target.dataset.fix), 1); afterChange(); e.target.closest('.fa-row').remove(); } }) });
};

/* ================= script compare ================= */
T.scriptCompare = async () => {
  const [f] = await SP.io.pickFiles('.spro,.fdx,.fountain,.txt'); if (!f) return;
  let other; try { other = SP.io.openText(f.text, f.name); } catch (e) { return U.alert('Could not read file: ' + e.message); }
  SP.editor.sync();
  const A = (other.paras || []).map(p => ({ type: p.type, t: SP.textOf(p.html).trim() })).filter(x => x.t);
  const B = SP.doc.paras.map(p => ({ id: p.id, type: p.type, t: SP.textOf(p.html).trim() })).filter(x => x.t);
  const n = A.length, m2 = B.length;
  if (n * m2 > 25e6) return U.alert('Scripts are too large to compare in the browser.');
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m2 + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m2 - 1; j >= 0; j--) L[i][j] = A[i].t === B[j].t ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m2) { if (A[i].t === B[j].t) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ op: 'del', x: A[i++] }); else ops.push({ op: 'add', x: B[j++] }); }
  while (i < n) ops.push({ op: 'del', x: A[i++] }); while (j < m2) ops.push({ op: 'add', x: B[j++] });
  const adds = ops.filter(o => o.op === 'add').length, dels = ops.length - adds;
  const html = `<p>Comparing <b>${SP.esc(f.name)}</b> (older) with the current script: <span class="ins">${adds} added/changed</span>, <span class="del">${dels} removed/changed</span>.</p>
    <div class="cmp">${ops.map(o => `<div class="cmp-row ${o.op}"${o.x.id ? ` data-go="${o.x.id}"` : ''}><span class="tag-pill">${SP.esc(SP.el(o.x.type).name)}</span>${o.op === 'add' ? '+ ' : '− '}${SP.esc(o.x.t.slice(0, 200))}</div>`).join('') || '<p>No differences.</p>'}</div>`;
  U.modal({ title: 'ScriptCompare', wide: true, body: html, buttons: [{ label: 'Mark Added as Revised', left: true, action: () => { SP.pushUndo(true); ops.filter(o => o.op === 'add').forEach(o => { const p = SP.para(o.x.id); if (p) p.rev = SP.doc.settings.revisionColor; }); afterChange(); } }, { label: 'Close', primary: true }],
    onOpen: md => md.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { md.close(); SP.editor.goTo(g.dataset.go); } }) });
};

/* ================= printing ================= */
T.printPreview = () => {
  const o = { titlePage: true, revisionMarks: true, revColors: false };
  const m = U.modal({ title: 'Print Preview', wide: true, cls: 'preview-modal', body: `<div class="row small"><label><input type="checkbox" class="pv-tp" checked> Title page</label><label><input type="checkbox" class="pv-rm" checked> Revision marks</label><label><input type="checkbox" class="pv-rc"> Tint revised pages</label><span class="pv-count muted"></span></div><div class="preview-scroll"><div class="preview-pages"></div></div>`,
    buttons: [{ label: 'Close' }, { label: 'Print / Save as PDF…', primary: true, action: () => SP.printDocument(o) }],
    onOpen: md => {
      const draw = () => { const r = SP.renderPrint(o); SP.$('.preview-pages', md).innerHTML = r.html; SP.$('.pv-count', md).textContent = `${r.pages.length} pages`; };
      draw(); md.addEventListener('change', () => { o.titlePage = SP.$('.pv-tp', md).checked; o.revisionMarks = SP.$('.pv-rm', md).checked; o.revColors = SP.$('.pv-rc', md).checked; draw(); });
    } });
};
T.printCards = () => {
  SP.editor.sync();
  const cards = SP.scenes().map(s => `<div class="print-card"><div class="pc-head"><b>${SP.esc(s.num)}</b> ${SP.esc(s.heading)}</div><div class="pc-body">${SP.esc(s.para.summary || s.paras.slice(1).map(p => SP.textOf(p.html)).join(' ').slice(0, 500))}</div></div>`);
  const pages = []; for (let i = 0; i < cards.length; i += 3) pages.push(`<div class="print-page cards-page">${cards.slice(i, i + 3).join('')}</div>`);
  if (SP.native.isNative) return SP.native.printHTML(pages.join('') || '<div class="print-page">No scenes.</div>');
  const pr = SP.$('#print-root'); pr.innerHTML = pages.join('') || '<div class="print-page">No scenes.</div>';
  document.body.classList.add('printing'); setTimeout(() => { print(); setTimeout(() => { document.body.classList.remove('printing'); pr.innerHTML = ''; }, 500); }, 80);
};

/* ================= welcome / new ================= */
T.newDialog = (welcome) => {
  const user = SP.store.get('userTemplates', {});
  const all = { ...SP.TEMPLATES, ...user };
  const groups = {}; Object.entries(all).forEach(([n, t]) => (groups[t.group] ||= []).push(n));
  const recent = SP.store.get('recent', []);
  U.modal({ title: welcome ? 'Welcome to Screenwriter Pro' : 'New from Template', wide: true, cls: 'welcome', body: `
    <div class="welcome-grid"><div>${Object.entries(groups).map(([g, ns]) => `<h3>${SP.esc(g)}</h3><div class="tpl-grid">${ns.map(n => `<button class="tpl" data-t="${SP.esc(n)}"><span class="tpl-icon">${{ Script: '🎬', TV: '📺', 'Graphic Novel': '💬', Text: '📄', Structure: '🧩', 'My Templates': '⭐' }[g] || '📄'}</span>${SP.esc(n)}</button>`).join('')}</div>`).join('')}</div>
    <div class="recent"><h3>Recent</h3>${recent.length ? recent.map(r => `<button class="rec" data-r="${r.id}"><b>${SP.esc(r.title)}</b><small>${new Date(r.t).toLocaleString()}</small></button>`).join('') : '<p class="muted">No recent scripts.</p>'}
    <button class="open-file">Open File…</button><p class="muted small">Opens .spro, .fdx (Final Draft XML) and .fountain files.</p></div></div>`,
    buttons: [{ label: welcome ? 'Continue' : 'Cancel', primary: welcome }],
    onOpen: m => m.addEventListener('click', async e => {
      const t = e.target.closest('[data-t]'), r = e.target.closest('[data-r]');
      if (t) { m.close(); if (!welcome && !(await SP.io.confirmDiscard())) return; SP.io.loadDoc(SP.newDoc(t.dataset.t)); if (SP.TEMPLATES[t.dataset.t]?.group === 'Structure') SP.setView('beatboard', { split: 'script' }); }
      if (r) { m.close(); SP.io.openRecent(r.dataset.r); }
      if (e.target.classList.contains('open-file')) { m.close(); SP.io.open(); }
    }) });
};
T.shortcuts = () => {
  const els = SP.doc.settings.elements;
  U.modal({ title: 'Keyboard Shortcuts', wide: true, body: `<div class="grid2"><table class="tbl">
    <tr><th colspan="2">Writing</th></tr><tr><td>Enter</td><td>New element (smart next element); on empty element: element menu</td></tr><tr><td>Tab / Shift+Tab</td><td>Cycle element / insert next element</td></tr><tr><td>Shift+Enter</td><td>Line break inside element</td></tr>
    ${Object.entries(els).filter(([, e]) => e.shortcut).map(([, e]) => `<tr><td>Alt+${e.shortcut}</td><td>${SP.esc(e.name)}</td></tr>`).join('')}
    <tr><td>Alt+Shift+1…9</td><td>Macros</td></tr></table>
    <table class="tbl"><tr><th colspan="2">Commands</th></tr><tr><td>⌘/Ctrl+N</td><td>New</td></tr><tr><td>⌘/Ctrl+O</td><td>Open</td></tr><tr><td>⌘/Ctrl+S</td><td>Save</td></tr><tr><td>⌘/Ctrl+Shift+S</td><td>Save As</td></tr><tr><td>⌘/Ctrl+P</td><td>Print</td></tr><tr><td>⌘/Ctrl+F</td><td>Find</td></tr><tr><td>⌘/Ctrl+G</td><td>Go To</td></tr><tr><td>⌘/Ctrl+Z / Shift+Z</td><td>Undo / Redo</td></tr><tr><td>⌘/Ctrl+B I U</td><td>Bold Italic Underline</td></tr><tr><td>Alt+N</td><td>ScriptNote</td></tr><tr><td>Alt+K</td><td>Bookmark</td></tr><tr><td>F11 / Alt+F</td><td>Focus Mode</td></tr><tr><td>Alt+Shift+N</td><td>Navigator</td></tr></table></div>` });
};
T.preferences = () => {
  const s = SP.doc.settings;
  U.modal({ title: 'Preferences', body: `
    <label class="field">Appearance<select class="pf-theme">${opts([['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark'], ['sepia', 'Sepia'], ['midnight', 'Midnight blue']], SP.store.get('theme', 'auto'))}</select></label>
    <label><input type="checkbox" class="pf-spell" ${s.spellcheck ? 'checked' : ''}> Check spelling as you type</label><br>
    <label><input type="checkbox" class="pf-tw" ${s.typewriter ? 'checked' : ''}> Typewriter scrolling (keep the cursor line centered)</label><br>
    <label><input type="checkbox" class="pf-inv" ${s.showInvisibles ? 'checked' : ''}> Show invisibles (element boundaries)</label><br>
    <label class="field">Autosave every (seconds)<input type="number" class="pf-as" value="${SP.store.get('autosaveSec', 30)}" min="5"></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: m => {
      SP.store.set('theme', SP.$('.pf-theme', m).value); SP.applyTheme();
      s.spellcheck = SP.$('.pf-spell', m).checked; s.typewriter = SP.$('.pf-tw', m).checked; s.showInvisibles = SP.$('.pf-inv', m).checked;
      SP.store.set('autosaveSec', Math.max(5, +SP.$('.pf-as', m).value || 30)); SP.startAutosave(); afterChange();
    } }] });
};
T.about = () => U.modal({ title: 'About Screenwriter Pro', body: `<p><b>Screenwriter Pro</b> — a professional screenwriting app that runs in your browser.</p><p class="muted">Industry-standard formatting, Beat Board, Index Cards, Navigator, SmartType, revisions, locked pages, reports, table read, and FDX / Fountain import & export. Your scripts autosave in this browser; use File › Save to keep a .spro file.</p>` });
})();
