/* Screenwriter Pro — startup, toolbar, status bar, autosave. */
'use strict';
(() => {
SP.applyTheme = () => {
  const t = SP.store.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
};
let autosaveTimer = 0;
SP.startAutosave = () => { clearInterval(autosaveTimer); autosaveTimer = setInterval(() => { if (SP.ui.dirty) { SP.io.autosave(); } }, SP.store.get('autosaveSec', 30) * 1000); };

SP.sampleDoc = () => {
  const d = SP.newDoc();
  const P = (type, text, extra = {}) => ({ id: SP.uid(), type, html: text, ...extra });
  d.title = 'The Lighthouse Keeper';
  Object.assign(d.titlePage, { title: 'The Lighthouse Keeper', credit: 'Written by', author: 'Your Name', draft: 'First Draft', date: new Date().toLocaleDateString(), contact: 'you@example.com' });
  d.paras = [
    P('transition', 'FADE IN:'),
    P('scene', 'EXT. ROCKY COASTLINE - NIGHT', { summary: 'A storm rolls in; the lighthouse beam stutters.', color: '#74c0fc' }),
    P('action', 'Waves hammer black rocks. Above them, a LIGHTHOUSE stands against the storm, its beam sweeping the water — then <b>flickering</b>.'),
    P('scene', 'INT. LIGHTHOUSE - LAMP ROOM - CONTINUOUS', { summary: 'Edda fights to keep the lamp alive; Theo arrives uninvited.' }),
    P('action', 'EDDA VOSS (60s), weathered hands and a stubborn jaw, wrenches at a rusted gear. The great lens groans.'),
    P('character', 'EDDA'), P('parenthetical', '(through gritted teeth)'), P('dialogue', 'Not tonight. Not on my watch.'),
    P('action', 'Footsteps on the spiral stairs. THEO MARSH (20s), soaked, clutching a clipboard, emerges from the dark.'),
    P('character', 'THEO'), P('dialogue', 'Ms. Voss? Coastal Authority. We sent letters. Several letters.'),
    P('character', 'EDDA'), P('dialogue', 'I used them to start the stove.'),
    P('action', 'The beam dies. Total darkness. A beat — then a distant ship\'s HORN.'),
    P('character', 'THEO'), P('dialogue', 'Is that—'),
    P('character', 'EDDA', { dual: false }), P('dialogue', 'A trawler. Twelve souls aboard. Hand me that wrench.'),
    P('transition', 'CUT TO:'),
    P('scene', 'EXT. NORTH SEA - TRAWLER DECK - NIGHT', { summary: 'The crew sees the light return.' }),
    P('action', 'Rain lashes the deck. CAPTAIN RUIZ (50s) squints into the void. Nothing. Then — the beam blazes back to life.'),
    P('character', 'CAPTAIN RUIZ'), P('dialogue', 'There she is. Hard to port!'),
    P('transition', 'FADE OUT.')
  ];
  d.beats = [
    { id: SP.uid(), x: 40, y: 40, w: 220, h: 150, title: 'The storm', body: 'Lighthouse fails as a storm hits.', color: '#74c0fc' },
    { id: SP.uid(), x: 300, y: 40, w: 220, h: 150, title: 'The inspector', body: 'Theo arrives to shut the lighthouse down.', color: '#ffe066' },
    { id: SP.uid(), x: 560, y: 40, w: 220, h: 150, title: 'The rescue', body: 'Together they relight the lamp in time.', color: '#51cf66' }
  ];
  d.connections = [{ id: SP.uid(), from: d.beats[0].id, to: d.beats[1].id, style: 'arrow', color: '#888' }, { id: SP.uid(), from: d.beats[1].id, to: d.beats[2].id, style: 'arrow', color: '#888' }];
  d.paras[7].notes = [{ id: SP.uid(), text: 'Should this line be quieter? Try an alt.', color: '#ffe066', date: Date.now() }];
  const O = (lvl, t, c) => P('outline' + lvl, t, { color: c });
  d.paras.splice(19, 0, O(1, 'Act Two: The Rescue', '#b197fc'), O(2, 'Out at sea', '#ffa94d'));
  d.paras.splice(8, 0, O(2, 'The inspector arrives', '#d2b48c'));
  d.paras.splice(1, 0, O(1, 'Act One: The Storm', '#74c0fc'), O(2, 'Lights out', '#ffa94d'));
  d.cast = { EDDA: { desc: 'Veteran lighthouse keeper', age: '60s', gender: 'Female' }, THEO: { desc: 'Coastal Authority inspector', age: '20s', gender: 'Male' } };
  return d;
};

function updateStatus() {
  if (!SP.doc) return;
  const c = SP.editor.getCaret(); const p = c && SP.para(c.id);
  const type = p ? p.type : (SP.editor.curPara()?.dataset.type);
  if (type) SP.$('#element-select').value = type;
  SP.$('#st-element').textContent = type ? SP.el(type).name : '';
  const sc = c && SP.sceneOf(c.id);
  SP.$('#st-scene').textContent = sc ? `Scene ${sc.num}` : '';
  const pages = SP.editor.pages || null;
  const total = pages ? pages.length : (SP._pageCount || 1);
  const pg = c && SP.pageOf(c.id);
  SP.$('#st-page').textContent = `Page ${pg || 1} of ${total}`;
  SP.$('#st-words').textContent = `${SP.tools.totalWords()} words`;
  const tgt = SP.doc.settings.targetPages; SP.$('#st-target').textContent = tgt ? `Target ${tgt} pp` : '';
  const ri = SP.$('#rev-indicator'); ri.hidden = !SP.doc.settings.revisionMode;
  if (SP.doc.settings.revisionMode) { const rc = SP.REVISION_COLORS.find(r => r.name === SP.doc.settings.revisionColor); ri.textContent = 'REVISION: ' + SP.doc.settings.revisionColor; ri.style.background = rc ? rc.color : '#ccc'; }
  SP.$('#track-indicator').hidden = !SP.doc.settings.trackChanges;
  document.title = `${SP.ui.dirty ? '• ' : ''}${SP.doc.title} — Screenwriter Pro`;
  SP.$('#st-saved').textContent = SP.ui.dirty ? 'Edited' : 'Saved';
}
let navTimer = 0, statusTimer = 0, cardTimer = 0;
const soon = (fn, ms, key) => { clearTimeout(key); return setTimeout(fn, ms); };

function init() {
  SP.applyTheme();
  document.body.classList.toggle('nav-hidden', SP.store.get('navHidden', false));
  SP.ui.mode = SP.store.get('mode', 'page');
  SP.ui.storyMap = SP.store.get('storyMap', true);
  SP.menus.render();
  SP.emit('ready');
  SP.views.bindNavigator();
  // element select
  const es = SP.$('#element-select');
  const fillSelect = () => { es.innerHTML = Object.keys(SP.doc.settings.elements).map(k => `<option value="${k}">${SP.esc(SP.el(k).name)}</option>`).join(''); };
  es.addEventListener('mousedown', () => { SP._savedCaret = SP.editor.getCaret(); });
  es.addEventListener('change', () => { const c = SP._savedCaret; if (c) SP.editor.setCaretById(c.id, c.offset, true); SP.editor.setType(es.value, SP.editor.paraEl(c ? c.id : '') || SP.editor.curPara()); SP.editor.root.focus(); });
  SP.$('#toolbar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // keep the script caret
  SP.$('#toolbar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) return SP.commands[b.dataset.cmd]();
    const r = b.getBoundingClientRect(); const C = SP.commands; const s = SP.doc.settings;
    const ck = (on, label) => (on ? '✓ ' : '   ') + label;
    const menus = {
      split: [{ label: 'Script + Beat Board', action: C.splitBeat }, { label: 'Script + Index Cards', action: C.splitCards }, { label: 'Script + Scene View', action: C.splitScenes }, { sep: true },
        { label: ck(SP.ui.splitDir !== 'h', 'Split Vertically'), action: () => { SP.ui.splitDir = 'v'; SP.views.layout(); } }, { label: ck(SP.ui.splitDir === 'h', 'Split Horizontally'), action: () => { SP.ui.splitDir = 'h'; SP.views.layout(); } },
        { label: 'Swap Panels', action: C.swap }, { label: 'Unsplit', action: C.unsplit }],
      views: [['Script – Normal View', 'viewNormal', SP.ui.view === 'script' && SP.ui.mode === 'normal'], ['Script – Page View', 'viewPage', SP.ui.view === 'script' && SP.ui.mode === 'page'], ['Script – Speed View', 'viewSpeed', SP.ui.view === 'script' && SP.ui.mode === 'speed'],
        ['Index Cards', 'viewCards', SP.ui.view === 'cards'], ['Scene View', 'viewScenes', SP.ui.view === 'sceneview'], ['Beat Board', 'viewBeat', SP.ui.view === 'beatboard']].map(([l, c, on]) => ({ label: ck(on, l), action: C[c] })),
      showhide: [['Story Map', 'toggleStoryMap', SP.ui.storyMap], ['Outline in Script', 'showStructure', s.showStructure], ['ScriptNotes', 'showNotes', s.showNotes], ['Alts', 'showAlts', s.showAlts], ['Scene Titles & Summaries', 'showSceneTitles', s.showSceneTitles], ['Invisibles', 'showInvisibles', s.showInvisibles], ['Tags', 'tagsMode', document.body.classList.contains('tags-mode')], ['Navigator', 'navigator', !document.body.classList.contains('nav-hidden')]].map(([l, c, on]) => ({ label: ck(on, l), action: C[c] }))
    };
    if (menus[b.dataset.drop]) SP.ui.popupMenu(r.left, r.bottom + 2, menus[b.dataset.drop]);
  });
  document.addEventListener('keydown', SP.menus.keys);

  SP.on('render', () => { fillSelect(); SP.applyElementStyles(); SP.views.layout(); SP.views.navigator(); SP.views.outlineBar(); updateStatus(); });
  SP.on('loaded', () => { fillSelect(); SP.tools.tagStyles(); document.body.dataset.paper = SP.doc.settings.paper; });
  SP.on('changed', () => {
    navTimer = soon(() => { SP.views.navigator(); SP.views.outlineBar(); }, 400, navTimer);
    cardTimer = soon(() => SP.views.refreshNonScript(), 600, cardTimer);
    SP.tools.trackDaily();
  });
  SP.on('caret', () => { SP.storyMap.playhead(); statusTimer = soon(() => { updateStatus(); if (SP.ui.navTab === 'scenes') { const on = SP.$('#nav-body .nav-item.on'); const c = SP.editor.getCaret(); const sc = c && SP.sceneOf(c.id); if (!on || !sc || on.dataset.go !== sc.id) SP.views.navigator(); } }, 120, statusTimer); });
  SP.on('decorated', updateStatus);
  SP.on('dirty', () => { statusTimer = soon(updateStatus, 300, statusTimer); });
  SP.on('saved', updateStatus); SP.on('autosaved', updateStatus);
  SP.on('settings', () => { updateStatus(); SP.editor.decorate(); });
  addEventListener('beforeunload', () => { if (SP.doc) SP.io.autosave(); });

  const restored = SP.io.restoreCurrent();
  if (!restored) { SP.io.loadDoc(SP.sampleDoc()); setTimeout(() => SP.tools.newDialog(true), 300); }
  SP.startAutosave();
  setTimeout(() => { const first = SP.doc.paras[SP.doc.paras.length - 1]; if (first) SP.editor.setCaretById(first.id, 9999, true); }, 50);
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
