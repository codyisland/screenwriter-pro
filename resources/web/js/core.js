/* Screenwriter Pro — core: document model, settings, templates, undo, events. */
'use strict';
const SP = window.SP = {};

/* ---------- utilities ---------- */
SP.uid = () => Math.random().toString(36).slice(2, 10);
SP.$ = (s, r = document) => r.querySelector(s);
SP.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
SP.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
SP.clone = o => JSON.parse(JSON.stringify(o));
SP.textOf = html => { const d = document.createElement('div'); d.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n'); return d.textContent; };
SP.wordCount = s => (s.match(/[\w'’-]+/g) || []).length;
SP.today = () => new Date().toISOString().slice(0, 10);
SP.download = (name, data, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
SP.store = {
  get(k, d) { try { const v = localStorage.getItem('sp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sp:' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('sp:' + k); } catch {} }
};

/* ---------- events ---------- */
SP._handlers = {};
SP.on = (ev, fn) => (SP._handlers[ev] ||= []).push(fn);
SP.emit = (ev, data) => (SP._handlers[ev] || []).forEach(fn => fn(data));

/* ---------- element definitions ----------
   left/right are inches from the left edge of an 8.5in page. spaceBefore in lines. */
SP.ELEMENT_ORDER = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'castlist', 'outline1', 'outline2', 'outline3', 'outline4', 'newact', 'endact', 'lyrics', 'page', 'panel', 'caption', 'sfx'];
SP.BASE_ELEMENTS = {
  scene:        { name: 'Scene Heading', left: 1.5, right: 7.5, spaceBefore: 2, caps: true, bold: false, underline: false, italic: false, align: 'left', enter: 'action', tab: 'action', tabEmpty: 'action', shortcut: '1', sceneLike: true },
  action:       { name: 'Action', left: 1.5, right: 7.5, spaceBefore: 1, caps: false, align: 'left', enter: 'action', tab: 'character', tabEmpty: 'character', shortcut: '2' },
  character:    { name: 'Character', left: 3.7, right: 7.5, spaceBefore: 1, caps: true, align: 'left', enter: 'dialogue', tab: 'parenthetical', tabEmpty: 'transition', shortcut: '3' },
  parenthetical:{ name: 'Parenthetical', left: 3.1, right: 5.6, spaceBefore: 0, caps: false, align: 'left', enter: 'dialogue', tab: 'dialogue', tabEmpty: 'dialogue', shortcut: '4', paren: true },
  dialogue:     { name: 'Dialogue', left: 2.5, right: 6.0, spaceBefore: 0, caps: false, align: 'left', enter: 'action', tab: 'parenthetical', tabEmpty: 'parenthetical', shortcut: '5' },
  transition:   { name: 'Transition', left: 5.5, right: 7.1, spaceBefore: 1, caps: true, align: 'right', enter: 'scene', tab: 'scene', tabEmpty: 'scene', shortcut: '6' },
  shot:         { name: 'Shot', left: 1.5, right: 7.5, spaceBefore: 1, caps: true, align: 'left', enter: 'action', tab: 'action', tabEmpty: 'action', shortcut: '7', sceneLike: false },
  general:      { name: 'General', left: 1.5, right: 7.5, spaceBefore: 0, caps: false, align: 'left', enter: 'general', tab: 'general', tabEmpty: 'action', shortcut: '8' },
  castlist:     { name: 'Cast List', left: 1.5, right: 7.5, spaceBefore: 0, caps: true, align: 'left', enter: 'castlist', tab: 'action', tabEmpty: 'action', shortcut: '9' },
  outline1:     { name: 'Outline 1', left: 1.5, right: 7.5, spaceBefore: 2, caps: true, bold: true, align: 'left', enter: 'scene', tab: 'outline2', tabEmpty: 'outline2', outline: true, level: 1 },
  outline2:     { name: 'Outline 2', left: 1.5, right: 7.5, spaceBefore: 1, caps: false, align: 'left', enter: 'scene', tab: 'outline3', tabEmpty: 'outline3', outline: true, level: 2 },
  outline3:     { name: 'Outline 3', left: 1.5, right: 7.5, spaceBefore: 1, caps: false, align: 'left', enter: 'scene', tab: 'outline4', tabEmpty: 'outline4', outline: true, level: 3 },
  outline4:     { name: 'Outline 4', left: 1.5, right: 7.5, spaceBefore: 1, caps: false, align: 'left', enter: 'scene', tab: 'outline1', tabEmpty: 'outline1', outline: true, level: 4 },
  newact:       { name: 'New Act', left: 1.5, right: 7.5, spaceBefore: 2, caps: true, bold: true, underline: true, align: 'center', enter: 'scene', tab: 'scene', tabEmpty: 'scene', newPage: true },
  endact:       { name: 'End of Act', left: 1.5, right: 7.5, spaceBefore: 2, caps: true, bold: true, underline: true, align: 'center', enter: 'newact', tab: 'newact', tabEmpty: 'newact' },
  lyrics:       { name: 'Lyrics', left: 2.5, right: 6.0, spaceBefore: 0, caps: false, italic: true, align: 'left', enter: 'lyrics', tab: 'dialogue', tabEmpty: 'dialogue' },
  page:         { name: 'Page', left: 1.0, right: 7.5, spaceBefore: 2, caps: true, bold: true, underline: true, align: 'left', enter: 'panel', tab: 'panel', tabEmpty: 'panel', sceneLike: true },
  panel:        { name: 'Panel', left: 1.0, right: 7.5, spaceBefore: 1, caps: true, bold: true, align: 'left', enter: 'action', tab: 'action', tabEmpty: 'action' },
  caption:      { name: 'Caption', left: 3.0, right: 7.0, spaceBefore: 1, caps: false, align: 'left', enter: 'action', tab: 'action', tabEmpty: 'action' },
  sfx:          { name: 'SFX', left: 3.0, right: 7.0, spaceBefore: 1, caps: true, bold: true, align: 'left', enter: 'action', tab: 'action', tabEmpty: 'action' }
};

SP.REVISION_COLORS = [
  { name: 'White', color: '#ffffff' }, { name: 'Blue', color: '#9cc3ff' }, { name: 'Pink', color: '#ffb3cf' },
  { name: 'Yellow', color: '#fff27a' }, { name: 'Green', color: '#a6e3a1' }, { name: 'Goldenrod', color: '#e8c35a' },
  { name: 'Buff', color: '#f0dcb4' }, { name: 'Salmon', color: '#ffa38a' }, { name: 'Cherry', color: '#e35d6a' },
  { name: 'Tan', color: '#d2b48c' }
];
SP.COLORS = { Yellow: '#ffe066', Orange: '#ffa94d', Red: '#ff6b6b', Pink: '#f783ac', Violet: '#b197fc', Blue: '#74c0fc', Cyan: '#66d9e8', 'Light Green': '#b2f2bb', Green: '#51cf66', Brown: '#a0785a', 'Light Brown': '#d2b48c', 'Light Gray': '#ced4da', Granite: '#868e96', 'Dark Gray': '#495057', Black: '#212529', White: '#ffffff' };

SP.DEFAULT_TAG_CATS = [
  ['Cast Members', '#e03131'], ['Extras', '#f08c00'], ['Props', '#7048e8'], ['Wardrobe', '#1c7ed6'],
  ['Makeup/Hair', '#d6336c'], ['Vehicles', '#2b8a3e'], ['Animals', '#a0785a'], ['Special Effects', '#0c8599'],
  ['Visual Effects', '#5f3dc4'], ['Stunts', '#e8590c'], ['Sound', '#495057'], ['Music', '#9c36b5'],
  ['Set Dressing', '#5c940d'], ['Locations', '#1864ab'], ['Security', '#c92a2a'], ['Notes', '#868e96']
].map(([name, color]) => ({ name, color }));

SP.defaultSettings = () => ({
  elements: SP.clone(SP.BASE_ELEMENTS),
  paper: 'letter', linesPerPage: 54,
  sceneNumbers: 'none', sceneNumbersLocked: false, shooting: false,
  more: '(MORE)', contd: "(CONT'D)", useMore: true, useContd: true, autoCharContd: true, sceneContd: false,
  header: '{page}.', footer: '', headerFirstPage: false,
  watermark: '', revisionMode: false, revisionColor: 'Blue', revisionName: 'Blue Revision', revisionMark: '*',
  trackChanges: false, pagesLocked: false,
  highlightChars: {}, spellcheck: true, typewriter: false, theme: 'auto', zoom: 1,
  showSceneTitles: true, showNotes: true, showAlts: true, showStructure: true, showInvisibles: false, printOutline: false,
  targetPages: 110, dailyWordGoal: 500,
  smartType: {
    characters: [], extensions: ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'FILTERED', 'INTO PHONE', 'SUBTITLED'],
    transitions: ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'TIME CUT:', 'WIPE TO:', 'BACK TO:', 'INTERCUT WITH:'],
    locations: [], times: ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME', 'SAME TIME'],
    intros: ['INT. ', 'EXT. ', 'INT./EXT. ', 'EXT./INT. ', 'I/E. ']
  },
  macros: [
    { key: '1', text: "(CONT'D)", type: null }, { key: '2', text: 'INT. ', type: 'scene' }, { key: '3', text: 'EXT. ', type: 'scene' },
    { key: '4', text: 'CUT TO:', type: 'transition' }, { key: '5', text: '(beat)', type: 'parenthetical' }
  ],
  voices: {}, narratorVoice: '', readAction: true
});

SP.newDoc = (template) => {
  const doc = {
    format: 'screenwriter-pro', version: 1, id: SP.uid(), title: 'Untitled', created: Date.now(), modified: Date.now(),
    template: 'Screenplay',
    titlePage: { title: '', credit: 'Written by', author: '', source: '', draft: '', date: '', contact: '', copyright: '', notes: '' },
    settings: SP.defaultSettings(),
    paras: [{ id: SP.uid(), type: 'scene', html: '' }],
    beats: [], connections: [], structure: [], cast: {}, generalNotes: [],
    tagCats: SP.clone(SP.DEFAULT_TAG_CATS), revisions: [], deletions: [], lockedPages: null, stats: {}
  };
  if (template) SP.applyTemplate(doc, template);
  return doc;
};
SP.normalizeDoc = (d) => {
  const base = SP.newDoc();
  const doc = Object.assign(base, d);
  doc.settings = Object.assign(SP.defaultSettings(), d.settings || {});
  doc.settings.elements = Object.assign(SP.clone(SP.BASE_ELEMENTS), (d.settings || {}).elements || {});
  Object.keys(SP.BASE_ELEMENTS).filter(k => SP.BASE_ELEMENTS[k].outline).forEach(k => Object.assign(doc.settings.elements[k], { outline: true, level: SP.BASE_ELEMENTS[k].level }));
  doc.settings.smartType = Object.assign(SP.defaultSettings().smartType, (d.settings || {}).smartType || {});
  doc.titlePage = Object.assign(base.titlePage, d.titlePage || {});
  doc.paras = (doc.paras || []).map(p => Object.assign({ id: SP.uid(), type: 'action', html: '' }, p));
  if (!doc.paras.length) doc.paras.push({ id: SP.uid(), type: 'scene', html: '' });
  // older files kept structure points separately; they are Outline elements now
  (doc.structure || []).forEach(x => {
    const i = doc.paras.findIndex(p => p.id === x.anchor);
    doc.paras.splice(i < 0 ? 0 : i, 0, { id: SP.uid(), type: 'outline1', html: SP.esc(x.title), color: x.color });
  });
  doc.structure = [];
  return doc;
};
SP.isOutline = (p) => !!SP.el(p.type).outline;
SP.outlineLevel = (p) => SP.el(p.type).level || 1;

/* ---------- state ---------- */
SP.doc = null;
SP.ui = { view: 'script', split: null, mode: 'page', navTab: 'scenes', dirty: false, fileHandle: null, focus: false };
SP.el = (type) => SP.doc.settings.elements[type] || SP.BASE_ELEMENTS.action;
SP.para = (id) => SP.doc.paras.find(p => p.id === id);
SP.paraIndex = (id) => SP.doc.paras.findIndex(p => p.id === id);
SP.markDirty = () => { SP.ui.dirty = true; SP.doc.modified = Date.now(); SP.emit('dirty'); };

/* scenes = groups of paras starting at a sceneLike element */
SP.scenes = () => {
  const out = []; let cur = null; let n = 0;
  const s = SP.doc.settings; const locked = s.sceneNumbersLocked;
  let last = null, suffix = 0; const start = (s.sceneStart || 1) - 1;
  SP.doc.paras.forEach((p, i) => {
    if (p.type === 'scene' || (SP.el(p.type).sceneLike && p.type !== 'scene')) {
      n++;
      let num;
      if (locked) {
        if (p.sceneNum) { num = p.sceneNum; last = p.sceneNum; suffix = 0; }
        else { suffix++; num = last ? last + String.fromCharCode(64 + suffix) : 'A' + suffix; }
      } else num = p.sceneNumManual && p.sceneNum ? p.sceneNum : String(start + n);
      cur = { id: p.id, index: i, para: p, num, auto: n, heading: SP.textOf(p.html).toUpperCase(), paras: [p] };
      out.push(cur);
    } else if (cur) cur.paras.push(p);
  });
  return out;
};
SP.sceneOf = (paraId) => { const sc = SP.scenes(); let r = null; for (const s of sc) { if (s.paras.some(p => p.id === paraId)) { r = s; break; } } return r; };
SP.sceneNumber = (s) => s.num;

/* character name from a Character element (strip extensions) */
SP.charName = (text) => text.replace(/\(.*?\)/g, '').replace(/\^$/, '').trim().toUpperCase();
SP.characters = () => {
  const m = new Map();
  let curScene = null;
  SP.doc.paras.forEach((p, i) => {
    if (SP.el(p.type).sceneLike) curScene = p.id;
    if (p.type === 'character') {
      const n = SP.charName(SP.textOf(p.html)); if (!n) return;
      const c = m.get(n) || { name: n, speeches: 0, words: 0, scenes: new Set(), first: i };
      c.speeches++;
      for (let j = i + 1; j < SP.doc.paras.length; j++) {
        const q = SP.doc.paras[j];
        if (q.type === 'dialogue' || q.type === 'lyrics') c.words += SP.wordCount(SP.textOf(q.html));
        else if (q.type !== 'parenthetical') break;
      }
      if (curScene) c.scenes.add(curScene);
      m.set(n, c);
    }
  });
  Object.entries(SP.doc.cast || {}).forEach(([n, info]) => { if (info.nonSpeaking && !m.has(n)) m.set(n, { name: n, speeches: 0, words: 0, scenes: new Set(), first: 1e9, nonSpeaking: true }); });
  return [...m.values()];
};
SP.locations = () => {
  const m = new Map();
  SP.scenes().forEach(s => {
    const loc = SP.parseHeading(s.heading).location; if (!loc) return;
    const e = m.get(loc) || { name: loc, count: 0, scenes: [] };
    e.count++; e.scenes.push(s); m.set(loc, e);
  });
  return [...m.values()];
};
SP.parseHeading = (h) => {
  const t = (h || '').toUpperCase().trim();
  const m = t.match(/^((?:INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)\.?)\s*(.*)$/);
  let intro = '', rest = t;
  if (m) { intro = m[1]; rest = m[2]; }
  const dash = rest.lastIndexOf(' - ');
  const location = (dash >= 0 ? rest.slice(0, dash) : rest).trim();
  const time = dash >= 0 ? rest.slice(dash + 3).trim() : '';
  return { intro, location, time };
};

/* ---------- undo / redo ---------- */
SP.history = { undo: [], redo: [], last: null };
SP.snapshot = () => JSON.stringify({ paras: SP.doc.paras, beats: SP.doc.beats, connections: SP.doc.connections, structure: SP.doc.structure });
SP.pushUndo = (force) => {
  const s = SP.snapshot();
  if (!force && s === SP.history.last) return;
  if (SP.history.last != null) SP.history.undo.push({ snap: SP.history.last, caret: SP.history.lastCaret });
  if (SP.history.undo.length > 300) SP.history.undo.shift();
  SP.history.last = s; SP.history.lastCaret = SP.editor && SP.editor.getCaret();
  SP.history.redo = [];
};
SP.resetHistory = () => { SP.history = { undo: [], redo: [], last: SP.snapshot(), lastCaret: null }; };
SP.restore = (snap) => { const d = JSON.parse(snap); Object.assign(SP.doc, d); SP.history.last = snap; SP.markDirty(); SP.renderAll(); };
SP.undo = () => {
  SP.editor && SP.editor.sync();
  const cur = SP.snapshot();
  if (cur !== SP.history.last) { SP.history.undo.push({ snap: SP.history.last, caret: SP.history.lastCaret }); SP.history.last = cur; }
  const e = SP.history.undo.pop(); if (!e) return;
  SP.history.redo.push({ snap: SP.history.last, caret: SP.editor && SP.editor.getCaret() });
  SP.restore(e.snap); if (e.caret) SP.editor.setCaretById(e.caret.id, e.caret.offset);
};
SP.redo = () => {
  const e = SP.history.redo.pop(); if (!e) return;
  SP.history.undo.push({ snap: SP.history.last, caret: SP.editor && SP.editor.getCaret() });
  SP.restore(e.snap); if (e.caret) SP.editor.setCaretById(e.caret.id, e.caret.offset);
};

/* ---------- templates ---------- */
const P = (type, text) => ({ id: SP.uid(), type, html: SP.esc(text) });
SP.TEMPLATES = {
  'Screenplay': { group: 'Script', paras: () => [P('transition', 'FADE IN:'), P('scene', '')] },
  'Screenplay for Beginners': { group: 'Script', paras: () => [
    P('general', 'Welcome! Press Enter after a Scene Heading to write Action. Press Tab in empty Action to make a Character. Enter after Character gives Dialogue.'),
    P('transition', 'FADE IN:'), P('scene', 'INT. COFFEE SHOP - DAY'),
    P('action', 'Rain streaks the window. MAYA (30s), sharp-eyed, nurses a cold latte.'),
    P('character', 'MAYA'), P('parenthetical', '(to herself)'), P('dialogue', 'Five more minutes. Then I leave.'),
    P('transition', 'CUT TO:'), P('scene', '')] },
  'TV Single-Cam': { group: 'TV', paras: () => [P('newact', 'TEASER'), P('transition', 'FADE IN:'), P('scene', ''), P('action', ''), P('endact', 'END OF TEASER'), P('newact', 'ACT ONE'), P('scene', '')],
    elements: { newact: { newPage: true } } },
  'Multi-Cam Sitcom': { group: 'TV', paras: () => [P('newact', 'ACT ONE'), P('scene', 'SCENE A'), P('scene', 'INT. LIVING ROOM - NIGHT (DAY 1)'), P('action', '(MAYA, JONAH)'), P('scene', '')],
    elements: { scene: { underline: true, spaceBefore: 2 }, action: { caps: true }, dialogue: { lineSpacing: 2 }, character: { left: 3.5 }, parenthetical: { left: 3.0, right: 5.5 } } },
  'Stageplay': { group: 'Script', paras: () => [P('newact', 'ACT ONE'), P('scene', 'SCENE 1'), P('action', 'At rise: a bare stage, one chair.'), P('character', ''), P('dialogue', '')],
    elements: { character: { left: 4.0, spaceBefore: 1 }, dialogue: { left: 1.5, right: 7.5 }, parenthetical: { left: 3.0, right: 6.0 }, action: { left: 3.5, right: 7.5 }, scene: { align: 'center', underline: true } } },
  'Musical': { group: 'Script', paras: () => [P('newact', 'ACT ONE'), P('scene', 'SCENE 1'), P('character', ''), P('lyrics', '')],
    elements: { lyrics: { caps: true, italic: false } } },
  'Audio Drama / Podcast': { group: 'Script', paras: () => [P('scene', 'SCENE 1 - EXT. HARBOR - NIGHT'), P('sfx', 'GULLS. WAVES SLAP THE DOCK.'), P('character', ''), P('dialogue', '')],
    elements: { character: { left: 1.5 }, dialogue: { left: 3.0, right: 7.5 }, sfx: { left: 1.5, right: 7.5, underline: true } } },
  'Graphic Novel': { group: 'Graphic Novel', paras: () => [P('page', 'PAGE ONE'), P('panel', 'PANEL 1'), P('action', ''), P('caption', ''), P('character', ''), P('dialogue', '')],
    elements: { character: { left: 3.0 }, dialogue: { left: 3.0, right: 7.0 } } },
  'Treatment': { group: 'Text', settings: { printOutline: true }, paras: () => [P('outline1', 'TITLE'), P('general', 'Logline:'), P('outline1', 'ACT ONE'), P('general', '')] },
  'Text Document': { group: 'Text', paras: () => [P('general', '')] },
  'Outline': { group: 'Text', settings: { printOutline: true }, paras: () => [P('outline1', 'ACT ONE'), P('outline2', ''), P('outline1', 'ACT TWO'), P('outline2', ''), P('outline1', 'ACT THREE'), P('outline2', '')] },
  'Query Letter': { group: 'Text', paras: () => [P('general', 'Dear [Name],'), P('general', ''), P('general', 'Sincerely,')] },
  /* beat-board structures (public-domain story models, described in our own words) */
  'Three Acts': { group: 'Structure', beats: ['Act One: Setup', 'Inciting Incident', 'Break into Two', 'Act Two: Confrontation', 'Midpoint', 'Crisis', 'Act Three: Resolution', 'Climax'] },
  'Four Acts': { group: 'Structure', beats: ['Act One', 'Act Two A', 'Midpoint', 'Act Two B', 'Act Three', 'Resolution'] },
  'Five-Act Pyramid': { group: 'Structure', beats: ['Exposition', 'Rising Action', 'Climax', 'Falling Action', 'Denouement'] },
  "Hero's Journey": { group: 'Structure', beats: ['Ordinary World', 'Call to Adventure', 'Refusal of the Call', 'Meeting the Mentor', 'Crossing the Threshold', 'Tests, Allies, Enemies', 'Approach to the Inmost Cave', 'The Ordeal', 'Reward', 'The Road Back', 'Resurrection', 'Return with the Elixir'] },
  'Eight-Step Circle': { group: 'Structure', beats: ['Comfort', 'Want', 'Unfamiliar Situation', 'Adapt', 'Get What They Wanted', 'Pay a Price', 'Return', 'Changed'] },
  'Sequence Approach (8)': { group: 'Structure', beats: ['Seq 1: Status Quo', 'Seq 2: Predicament', 'Seq 3: First Attempt', 'Seq 4: Midpoint', 'Seq 5: Complications', 'Seq 6: Low Point', 'Seq 7: Final Push', 'Seq 8: Resolution'] }
};
SP.applyTemplate = (doc, name) => {
  const t = SP.TEMPLATES[name] || SP.store.get('userTemplates', {})[name];
  if (!t) return;
  doc.template = name;
  if (t.userDoc) {
    const d = SP.clone(t.userDoc);
    doc.settings = Object.assign(SP.defaultSettings(), d.settings);
    doc.settings.elements = Object.assign(SP.clone(SP.BASE_ELEMENTS), d.settings.elements);
    doc.paras = d.paras.map(p => ({ ...p, id: SP.uid() }));
    doc.beats = d.beats || []; doc.titlePage = d.titlePage || doc.titlePage;
    return;
  }
  if (t.settings) Object.assign(doc.settings, t.settings);
  if (t.elements) Object.entries(t.elements).forEach(([k, v]) => Object.assign(doc.settings.elements[k], v));
  if (t.paras) doc.paras = t.paras();
  if (t.beats) {
    doc.paras = [P('transition', 'FADE IN:'), P('scene', '')];
    const colors = Object.values(SP.COLORS);
    doc.beats = t.beats.map((title, i) => ({ id: SP.uid(), x: 40 + (i % 4) * 250, y: 40 + Math.floor(i / 4) * 190, w: 220, h: 150, title, body: '', color: colors[i % 9] }));
    doc.connections = doc.beats.slice(1).map((b, i) => ({ id: SP.uid(), from: doc.beats[i].id, to: b.id, style: 'arrow', color: '#888' }));
  }
};

/* ---------- CSS from element settings ---------- */
SP.applyElementStyles = () => {
  const els = SP.doc.settings.elements;
  let css = '';
  for (const [k, e] of Object.entries(els)) {
    const w = Math.max(0.5, e.right - e.left);
    css += `.script-page .p[data-type="${k}"]{--l:${e.left}in;margin-left:${e.left}in;width:${w}in;text-align:${e.align || 'left'};` +
      `text-transform:${e.caps ? 'uppercase' : 'none'};font-weight:${e.bold ? 700 : 400};font-style:${e.italic ? 'italic' : 'normal'};` +
      `text-decoration:${e.underline ? 'underline' : 'none'};margin-top:${(e.spaceBefore || 0) * 12}pt;line-height:${12 * (e.lineSpacing || 1)}pt}`;
    css += `.speed .script-page .p[data-type="${k}"]{margin-left:${Math.max(0, (e.left - 1.5) * 0.5)}in;width:auto;margin-top:${Math.min(1, e.spaceBefore || 0) * 6}pt}`;
    css += `.print-page .pp[data-type="${k}"]{margin-left:${e.left}in;width:${w}in;text-align:${e.align || 'left'};` +
      `text-transform:${e.caps ? 'uppercase' : 'none'};font-weight:${e.bold ? 700 : 400};font-style:${e.italic ? 'italic' : 'normal'};text-decoration:${e.underline ? 'underline' : 'none'};line-height:${12 * (e.lineSpacing || 1)}pt}`;
  }
  Object.entries(SP.doc.settings.highlightChars || {}).forEach(([name, color]) => {
    css += `.script-page .p[data-speaker="${CSS.escape(name)}"]{background:${color}55}`;
  });
  SP.$('#element-styles').textContent = css;
};

SP.renderAll = () => { SP.emit('render'); };
