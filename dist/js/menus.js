/* Screenwriter Pro — commands and menu bar. */
'use strict';
(() => {
const T = () => SP.tools, R = () => SP.reports, E = () => SP.editor, IO = () => SP.io;
const s = () => SP.doc.settings;
const toggle = (k, after) => () => { s()[k] = !s()[k]; SP.markDirty(); SP.renderAll(); after && after(); };
const curPara = () => { E().sync(); const c = E().getCaret(); return c && SP.para(c.id); };
const needPara = (fn) => () => { const p = curPara(); if (!p) return SP.ui.toast('Click in the script first.'); fn(p); };

const C = SP.commands = {
  newDoc: () => T().newDialog(false),
  open: () => IO().open(), save: () => IO().save(false), saveAs: () => IO().save(true), saveTemplate: () => IO().saveAsTemplate(),
  exportFdx: () => IO().export('fdx'), exportFountain: () => IO().export('fountain'), exportTxt: () => IO().export('txt'), exportHtml: () => IO().export('html'), exportSpro: () => IO().export('spro'),
  pdf: () => SP.printDocument({}), print: () => SP.printDocument({}), printPreview: () => T().printPreview(), printCards: () => T().printCards(),
  combine: () => IO().combine(), backup: () => IO().backup(), revert: () => IO().revert(),
  undo: () => SP.undo(), redo: () => SP.redo(),
  cut: () => { E().root.focus(); document.execCommand('cut'); }, copy: () => { E().root.focus(); document.execCommand('copy'); },
  paste: () => SP.ui.toast('Use ⌘V / Ctrl+V to paste.'),
  selectAll: () => { E().root.focus(); document.execCommand('selectAll'); }, selectScene: () => T().selectScene(),
  find: () => T().find(false), replace: () => T().find(true), findSelection: () => T().findSelection(), goTo: () => T().goTo(),
  spelling: toggle('spellcheck', () => SP.ui.toast('Spell check ' + (s().spellcheck ? 'on' : 'off'))), thesaurus: () => T().thesaurus(),
  toggleTracking: () => T().toggleTracking(), nextChange: () => T().nextChange(1), prevChange: () => T().nextChange(-1), acceptAll: () => T().acceptAll(), rejectAll: () => T().rejectAll(),
  viewNormal: () => SP.setMode('normal'), viewPage: () => SP.setMode('page'), viewSpeed: () => SP.setMode('speed'),
  viewCards: () => SP.setView('cards'), viewScenes: () => SP.setView('sceneview'), viewBeat: () => SP.setView('beatboard'), viewScript: () => SP.setView('script'),
  splitBeat: () => SP.setView('script', { split: 'beatboard' }), splitCards: () => SP.setView('script', { split: 'cards' }), splitScenes: () => SP.setView('script', { split: 'sceneview' }),
  splitDir: () => { SP.ui.splitDir = SP.ui.splitDir === 'h' ? 'v' : 'h'; SP.views.layout(); },
  unsplit: () => { SP.ui.split = null; SP.views.layout(); },
  swap: () => { if (!SP.ui.split) return; const a = SP.ui.view; SP.ui.view = SP.ui.split; SP.ui.split = a; SP.views.layout(); },
  navigator: () => { document.body.classList.toggle('nav-hidden'); SP.store.set('navHidden', document.body.classList.contains('nav-hidden')); setTimeout(() => E().decorate(), 50); },
  toggleStoryMap: () => SP.storyMap.toggle(), toggleOutlineBar: () => SP.storyMap.toggle(),
  showStructure: toggle('showStructure'), showNotes: toggle('showNotes'), showAlts: toggle('showAlts'), showSceneTitles: toggle('showSceneTitles'), showInvisibles: toggle('showInvisibles'),
  zoomIn: () => { s().zoom = Math.min(2, +(s().zoom + 0.1).toFixed(2)); SP.renderAll(); }, zoomOut: () => { s().zoom = Math.max(0.5, +(s().zoom - 0.1).toFixed(2)); SP.renderAll(); }, zoomReset: () => { s().zoom = 1; SP.renderAll(); },
  typewriter: toggle('typewriter', () => SP.ui.toast('Typewriter mode ' + (s().typewriter ? 'on' : 'off'))),
  focus: () => { document.body.classList.toggle('focus-mode'); if (document.body.classList.contains('focus-mode')) SP.ui.toast('Focus Mode — press Esc or Alt+F to exit.'); setTimeout(() => E().decorate(), 50); },
  tagsMode: () => T().toggleTagsMode(), appearance: () => T().preferences(),
  elements: () => T().elements(),
  bold: () => E().exec('bold'), italic: () => E().exec('italic'), underline: () => E().exec('underline'), strike: () => E().exec('strikeThrough'),
  sup: () => E().exec('superscript'), sub: () => E().exec('subscript'),
  dul: () => E().wrapSelection('span', 'dul'), dotul: () => E().wrapSelection('span', 'dotul'), wul: () => E().wrapSelection('span', 'wul'),
  caps: () => E().wrapSelection('span', 'caps'), smallcaps: () => E().wrapSelection('span', 'smallcaps'), clearFormat: () => E().clearFormatting(),
  dual: needPara(p => {
    let i = SP.paraIndex(p.id); while (i >= 0 && SP.doc.paras[i].type !== 'character') { if (!['dialogue', 'parenthetical', 'lyrics'].includes(SP.doc.paras[i].type)) break; i--; }
    const ch = SP.doc.paras[i]; if (!ch || ch.type !== 'character') return SP.ui.toast('Place the cursor in the second speech of the pair.');
    SP.pushUndo(true); ch.dual = !ch.dual; SP.markDirty(); SP.renderAll(); SP.ui.toast(ch.dual ? 'Dual dialogue on (with the previous speech).' : 'Dual dialogue off.');
  }),
  addAlt: () => E().addAlt(), nextAlt: () => E().cycleAlt(null, 1), prevAlt: () => E().cycleAlt(null, -1), removeAlt: () => E().removeAlt(),
  headerFooter: () => T().headerFooter(), pageLayout: () => T().pageLayout(), mores: () => T().moresContinueds(), watermark: () => T().watermark(), titlePage: () => T().titlePage(),
  newScene: () => { const d = E().insertParaAfterCurrent('scene'); },
  scriptNote: needPara(p => T().editNotes(p.id)), generalNotes: () => T().generalNotes(),
  bookmark: needPara(async p => { const n = await SP.ui.prompt('Bookmark name', p.bookmark || SP.textOf(p.html).slice(0, 30)); if (n == null) return; if (n) p.bookmark = n; else delete p.bookmark; SP.markDirty(); E().decorate(); SP.views.navigator(); }),
  sceneProps: needPara(p => { const sc = SP.sceneOf(p.id); if (sc) T().sceneProps(sc.id); else SP.ui.toast('Place the cursor in a scene.'); }),
  nonSpeaking: () => T().nonSpeaking(),
  pageBreak: needPara(p => { SP.pushUndo(true); p.pageBreakAfter = !p.pageBreakAfter; SP.markDirty(); E().decorate(); SP.ui.toast(p.pageBreakAfter ? 'Page break after this element.' : 'Page break removed.'); }),
  newBeat: () => { SP.views.paraToBeat(); SP.views.refreshNonScript(); ['#pane-a', '#pane-b'].forEach(x => { const pn = SP.$(x); if (pn.dataset.view === 'beatboard' && !pn.hidden) SP.views.bbDraw(pn); }); },
  structurePoint: () => C.outline1(),
  ...Object.fromEntries([1, 2, 3, 4].map(l => ['outline' + l, needPara(async p => {
    const t = await SP.ui.prompt(`Outline ${l} item (e.g. ${['ACT ONE', 'Sequence 1', 'Inciting Incident', 'Beat'][l - 1]})`); if (!t) return;
    SP.storyMap.insert(l, t, p); if (!SP.ui.storyMap) SP.storyMap.toggle();
  })])),
  smartType: () => T().smartType(), macros: () => T().macros(), names: () => T().namesDatabase(), renameCharacter: () => T().renameCharacter(), highlightCharacters: () => T().highlightCharacters(),
  tagSelection: () => T().tagSelection(), tagCategories: () => T().tagCategories(),
  formatAssistant: () => T().formatAssistant(), reformat: () => T().reformat(), scriptCompare: () => T().scriptCompare(),
  assignVoices: () => T().assignVoices(), tableRead: () => T().tableRead(), dictation: () => T().dictation(),
  sprint: () => T().sprint(), writingStats: () => T().writingStats(), targetLength: () => T().targetLength(), preferences: () => T().preferences(),
  sceneReport: () => R().sceneReport(), locationReport: () => R().locationReport(), characterReport: () => R().characterReport(), castReport: () => R().castReport(),
  scriptReport: () => R().scriptReport(), scriptNoteReport: () => R().scriptNoteReport(), statisticsReport: () => R().statisticsReport(), tagsReport: () => R().tagsReport(), inclusivityReport: () => R().inclusivityReport(),
  sceneNumbers: () => T().sceneNumbers(), editSceneNumber: () => T().editSceneNumber(), omitScene: () => T().omitScene(), shooting: () => T().shootingScript(),
  revisions: () => T().revisions(), revisionMode: () => T().toggleRevisionMode(), markRevised: () => T().markRevised(false), clearRevised: () => T().markRevised(true),
  lockPages: () => T().lockPages(true), unlockPages: () => T().lockPages(false),
  welcome: () => T().newDialog(true), shortcuts: () => T().shortcuts(), about: () => T().about(),
  sample: async () => { if (!(await IO().confirmDiscard())) return; IO().loadDoc(SP.sampleDoc()); }
};
const colorCmd = (cls, prop) => Object.entries(SP.COLORS).map(([n, c]) => ({ label: n, swatch: c, run: () => E().wrapSelection('span', cls, { style: `${prop}:${c}` }) })).concat([{ sep: true }, { label: 'Remove', run: () => E().unwrapSelection('span.' + cls) }]);

const MENUS = () => [
  ['File', [
    ['New…', 'newDoc', '⌘N'], ['Open…', 'open', '⌘O'], ['Open Recent', null, null, () => { const r = SP.store.get('recent', []); return r.length ? r.map(x => ({ label: x.title, run: () => IO().openRecent(x.id) })) : [{ label: '(none)', disabled: true }]; }],
    '-', ['Save', 'save', '⌘S'], ['Save As…', 'saveAs', '⇧⌘S'], ['Save as Template…', 'saveTemplate'], ['Save As PDF…', 'pdf'],
    ['Export', null, null, [['Final Draft (.fdx)', 'exportFdx'], ['Fountain (.fountain)', 'exportFountain'], ['Plain Text (.txt)', 'exportTxt'], ['Web Page (.html)', 'exportHtml'], ['Screenwriter Pro (.spro)', 'exportSpro']]],
    '-', ['Combine Files…', 'combine'], ['Backup', 'backup'], ['Revert', 'revert'], '-', ['Print Preview', 'printPreview'], ['Print Index Cards', 'printCards'], ['Print…', 'print', '⌘P']]],
  ['Edit', [
    ['Undo', 'undo', '⌘Z'], ['Redo', 'redo', '⇧⌘Z'], '-', ['Cut', 'cut', '⌘X'], ['Copy', 'copy', '⌘C'], ['Paste', 'paste', '⌘V'], ['Select All', 'selectAll', '⌘A'], ['Select Scene', 'selectScene'],
    '-', ['Find…', 'find', '⌘F'], ['Replace…', 'replace', '⌥⌘F'], ['Find Selection', 'findSelection', '⌘E'], ['Go To…', 'goTo', '⌘G'],
    '-', ['Spelling (as you type)', 'spelling', null, null, () => s().spellcheck], ['Thesaurus…', 'thesaurus'],
    ['Track Changes', null, null, [['Turn On/Off Tracking', 'toggleTracking', null, null, () => s().trackChanges], ['Next Change', 'nextChange'], ['Previous Change', 'prevChange'], '-', ['Accept All Changes', 'acceptAll'], ['Reject All Changes', 'rejectAll']]]]],
  ['View', [
    ['Script – Normal View', 'viewNormal', null, null, () => SP.ui.view === 'script' && SP.ui.mode === 'normal'], ['Script – Page View', 'viewPage', null, null, () => SP.ui.view === 'script' && SP.ui.mode === 'page'], ['Script – Speed View', 'viewSpeed', null, null, () => SP.ui.view === 'script' && SP.ui.mode === 'speed'],
    ['Index Cards', 'viewCards', null, null, () => SP.ui.view === 'cards'], ['Scene View', 'viewScenes', null, null, () => SP.ui.view === 'sceneview'], ['Beat Board', 'viewBeat', null, null, () => SP.ui.view === 'beatboard'],
    ['Split', null, null, [['Script + Beat Board', 'splitBeat'], ['Script + Index Cards', 'splitCards'], ['Script + Scene View', 'splitScenes'], '-', ['Vertically / Horizontally', 'splitDir'], ['Swap Panels', 'swap'], ['Unsplit', 'unsplit']]],
    '-', ['Show Navigator', 'navigator', '⌥⇧N', null, () => !document.body.classList.contains('nav-hidden')], ['Story Map', 'toggleStoryMap', '⌥⌘M', null, () => SP.ui.storyMap], ['Show Outline in Script', 'showStructure', null, null, () => s().showStructure],
    ['Show ScriptNotes', 'showNotes', null, null, () => s().showNotes], ['Show Alts', 'showAlts', null, null, () => s().showAlts], ['Show Scene Titles & Summaries', 'showSceneTitles', null, null, () => s().showSceneTitles], ['Show Invisibles', 'showInvisibles', null, null, () => s().showInvisibles], ['Tags Mode', 'tagsMode', null, null, () => document.body.classList.contains('tags-mode')],
    '-', ['Zoom In', 'zoomIn', '⌘+'], ['Zoom Out', 'zoomOut', '⌘−'], ['Actual Size', 'zoomReset'], ['Typewriter Mode', 'typewriter', null, null, () => s().typewriter], ['Focus Mode', 'focus', '⌥F'], ['Appearance…', 'appearance']]],
  ['Format', [
    ['Elements…', 'elements'], ['Change Element To', null, null, () => Object.keys(s().elements).map(k => ({ label: SP.el(k).name, hint: SP.el(k).shortcut ? '⌥' + SP.el(k).shortcut : '', run: () => E().setType(k) }))],
    ['Style', null, null, [['Bold', 'bold', '⌘B'], ['Italic', 'italic', '⌘I'], ['Underline', 'underline', '⌘U'], ['Double Underline', 'dul'], ['Dotted Underline', 'dotul'], ['Word Underline', 'wul'], ['Strike Out', 'strike'], ['Superscript', 'sup'], ['Subscript', 'sub'], ['ALL CAPS', 'caps'], ['Small Caps', 'smallcaps'], '-', ['Clear Formatting', 'clearFormat']]],
    ['Text Color', null, null, () => colorCmd('fc', 'color')], ['Highlight', null, null, () => colorCmd('hl', 'background-color')],
    '-', ['Dual Dialogue', 'dual'], ['Add Alt', 'addAlt'], ['Next Alt', 'nextAlt'], ['Previous Alt', 'prevAlt'], ['Remove Alt', 'removeAlt'],
    '-', ['Title Page…', 'titlePage'], ['Header and Footer…', 'headerFooter'], ['Page Layout…', 'pageLayout'], ['Mores and Continueds…', 'mores'], ['Watermark…', 'watermark']]],
  ['Insert', [
    ['New Scene', 'newScene'], ['ScriptNote', 'scriptNote', '⌥N'], ['General Notes', 'generalNotes'], ['Bookmark', 'bookmark', '⌥K'], ['Scene Properties…', 'sceneProps'],
    ['Non-Speaking Character', 'nonSpeaking'], ['Page Break', 'pageBreak'], ['Outline Element', null, null, [['Outline 1 (Act)', 'outline1'], ['Outline 2 (Sequence)', 'outline2'], ['Outline 3', 'outline3'], ['Outline 4', 'outline4']]], ['New Beat (from selection)', 'newBeat']]],
  ['Tools', [
    ['SmartType…', 'smartType'], ['Macros…', 'macros'], ['Names Database…', 'names'], ['Rename Character…', 'renameCharacter'], ['Highlight Characters…', 'highlightCharacters'],
    '-', ['Tag Selection…', 'tagSelection'], ['Tag Categories…', 'tagCategories'],
    '-', ['Format Assistant', 'formatAssistant'], ['Reformat…', 'reformat'], ['ScriptCompare…', 'scriptCompare'], ['Combine Files…', 'combine'],
    '-', ['Assign Voices…', 'assignVoices'], ['Table Read', 'tableRead'], ['Dictation', 'dictation'],
    '-', ['Sprint Timer…', 'sprint'], ['Writing Stats & Goals…', 'writingStats'], ['Change Target Script Length…', 'targetLength'], '-', ['Preferences…', 'preferences']]],
  ['Reports', [['Scene Report', 'sceneReport'], ['Location Report', 'locationReport'], ['Character Report…', 'characterReport'], ['Cast Report', 'castReport'], ['Script Report…', 'scriptReport'], ['ScriptNote Report', 'scriptNoteReport'], ['Statistics', 'statisticsReport'], ['Tags Report', 'tagsReport'], ['Inclusivity Report', 'inclusivityReport']]],
  ['Production', [
    ['Scene Numbers…', 'sceneNumbers'], ['Edit Scene Number…', 'editSceneNumber'], ['Omit / Restore Scene', 'omitScene'], ['Shooting Script', 'shooting', null, null, () => s().shooting],
    '-', ['Revisions…', 'revisions'], ['Revision Mode', 'revisionMode', null, null, () => s().revisionMode], ['Mark Revised', 'markRevised'], ['Clear Revised', 'clearRevised'],
    '-', ['Lock Pages', 'lockPages', null, null, () => s().pagesLocked], ['Unlock All Pages', 'unlockPages']]],
  ['Help', [['Welcome / Templates', 'welcome'], ['Sample Script', 'sample'], ['Keyboard Shortcuts', 'shortcuts'], ['About Screenwriter Pro', 'about']]]
];

const norm = (it) => {
  if (it === '-') return { sep: true };
  if (!Array.isArray(it)) return it;
  const [label, cmd, key, sub, check] = it;
  return { label, cmd, key, sub, check };
};
function buildItems(items) {
  return items.map(norm).map((it, i) => {
    if (it.sep) return '<div class="sep"></div>';
    const sub = typeof it.sub === 'function' ? it.sub() : it.sub;
    const checked = it.check && it.check();
    return `<div class="mi${sub ? ' has-sub' : ''}${it.disabled ? ' dis' : ''}" data-cmd="${it.cmd || ''}" data-i="${i}">${it.swatch ? `<span class="sw" style="background:${it.swatch}"></span>` : `<span class="ck">${checked ? '✓' : ''}</span>`}<span>${SP.esc(it.label)}</span>${it.key || it.hint ? `<small>${SP.esc(it.key || it.hint)}</small>` : ''}${sub ? '<small>▸</small>' : ''}
      ${sub ? `<div class="submenu">${buildItems(sub)}</div>` : ''}</div>`;
  }).join('');
}
const code0 = e => e.code.replace(/^Key/, '').toLowerCase();
SP.menus = { list: () => MENUS(), norm };
SP.menus.render = () => {
  const bar = SP.$('#menubar');
  bar.innerHTML = MENUS().map(([name]) => `<button class="menu-btn" data-menu="${name}">${name}</button>`).join('');
  let open = null; const dd = document.createElement('div'); dd.className = 'menu-dd'; dd.hidden = true; document.body.appendChild(dd);
  let runs = [];
  const show = (btn) => {
    const def = MENUS().find(m => m[0] === btn.dataset.menu);
    // collect closures for function items (Open Recent / colors)
    runs = [];
    const withRuns = (items) => items.map(it => { const n = norm(it); if (n.sep) return '-'; const sub = typeof n.sub === 'function' ? n.sub() : n.sub; const o = { ...n, sub: sub ? withRuns(sub) : null }; if (n.run) { o.cmd = '__run' + runs.length; runs.push(n.run); } return o; });
    dd.innerHTML = buildItems(withRuns(def[1]));
    const r = btn.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 'px'; dd.hidden = false;
    SP.$$('.menu-btn', bar).forEach(b => b.classList.toggle('on', b === btn)); open = btn;
    SP.$$('.submenu', dd).forEach(sm => { const rr = sm.parentElement.getBoundingClientRect(); if (rr.right + 240 > innerWidth) sm.classList.add('left'); });
  };
  const close = () => { dd.hidden = true; open = null; SP.$$('.menu-btn', bar).forEach(b => b.classList.remove('on')); };
  bar.addEventListener('mousedown', e => { const b = e.target.closest('.menu-btn'); if (!b) return; e.preventDefault(); open === b ? close() : show(b); });
  bar.addEventListener('mouseover', e => { const b = e.target.closest('.menu-btn'); if (b && open && open !== b) show(b); });
  dd.addEventListener('mousedown', e => {
    e.preventDefault();
    const it = e.target.closest('.mi'); if (!it || it.classList.contains('has-sub') || it.classList.contains('dis')) return;
    const cmd = it.dataset.cmd; close();
    if (cmd.startsWith('__run')) runs[+cmd.slice(5)](); else if (C[cmd]) C[cmd]();
  });
  document.addEventListener('mousedown', e => { if (open && !dd.contains(e.target) && !bar.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) close(); });
};

/* global shortcuts */
SP.menus.keys = (e) => {
  const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
  if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !SP.$('.modal-back')) { C.focus(); return; }
  if (SP.$('.modal-back')) return;
  const map = mod ? (e.shiftKey ? { s: 'saveAs', z: 'redo' } : e.altKey ? { f: 'replace' } : { n: 'newDoc', o: 'open', s: 'save', p: 'print', f: 'find', g: 'goTo', e: 'findSelection', '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset' })
    : e.altKey && !e.ctrlKey ? (e.shiftKey ? { n: 'navigator' } : { n: 'scriptNote', k: 'bookmark', f: 'focus' }) : {};
  if (mod && e.altKey && code0(e) === 'm') { e.preventDefault(); C.toggleStoryMap(); return; }
  const code = e.code.replace(/^Key/, '').toLowerCase();
  const cmd = map[k] || (e.altKey ? map[code] : null);
  if (e.key === 'F11') { e.preventDefault(); C.focus(); return; }
  if (cmd && C[cmd]) {
    if ((cmd === 'undo' || cmd === 'redo') && SP.editor.root && SP.editor.root.contains(document.activeElement)) return;
    e.preventDefault(); C[cmd]();
  }
};
})();
