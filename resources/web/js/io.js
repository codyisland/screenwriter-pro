/* Screenwriter Pro — file I/O: native .spro, FDX, Fountain, text/HTML, autosave, library, backups. */
'use strict';
(() => {
const IO = SP.io = {};

/* ---------- inline markup helpers ---------- */
const fountainInline = (s) => SP.esc(s)
  .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\*(.+?)\*/g, '<i>$1</i>')
  .replace(/_(.+?)_/g, '<u>$1</u>');
const htmlToFountain = (html) => {
  const d = document.createElement('div'); d.innerHTML = html || '';
  const walk = n => {
    if (n.nodeType === 3) return n.textContent;
    const inner = Array.from(n.childNodes).map(walk).join('');
    switch (n.tagName) {
      case 'B': case 'STRONG': return `**${inner}**`;
      case 'I': case 'EM': return `*${inner}*`;
      case 'U': return `_${inner}_`;
      case 'BR': return '\n';
      default: return inner;
    }
  };
  return walk(d);
};

/* ---------- Fountain ---------- */
IO.parseFountain = (src) => {
  let text = src.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const titlePage = {};
  const lines = text.split('\n');
  let i = 0;
  // title page: "Key: value" block at top
  if (/^\s*(Title|Credit|Author|Authors|Source|Draft date|Date|Contact|Copyright|Notes)\s*:/i.test(lines[0] || '')) {
    let key = null;
    for (; i < lines.length; i++) {
      const l = lines[i]; if (!l.trim()) { i++; break; }
      const m = l.match(/^\s*([A-Za-z ]+):\s*(.*)$/);
      if (m && !/^\s{2,}|\t/.test(l)) { key = m[1].toLowerCase(); titlePage[key] = m[2].trim(); }
      else if (key) titlePage[key] = (titlePage[key] ? titlePage[key] + '\n' : '') + l.trim();
    }
  }
  const paras = []; const notesFor = [];
  const push = (type, t, extra = {}) => {
    const notes = [];
    t = t.replace(/\[\[([\s\S]*?)\]\]/g, (_, n) => { notes.push({ id: SP.uid(), text: n.trim(), color: '#ffe066', date: Date.now() }); return ''; });
    const p = { id: SP.uid(), type, html: fountainInline(t.trim()), ...extra };
    if (notes.length) p.notes = notes;
    paras.push(p); return p;
  };
  const isBlank = k => k < 0 || k >= lines.length || !lines[k].trim();
  let inDialogue = false;
  let lastScene = null;
  for (; i < lines.length; i++) {
    const raw = lines[i]; const l = raw.trim();
    if (!l) { inDialogue = false; continue; }
    if (inDialogue) {
      if (/^\(.*\)$/.test(l)) push('parenthetical', l);
      else if (/^~/.test(l)) push('lyrics', l.slice(1));
      else {
        const last = paras[paras.length - 1];
        if (last && last.type === 'dialogue' && raw.startsWith('  ')) last.html += '<br>' + fountainInline(l);
        else push('dialogue', l);
      }
      continue;
    }
    if (/^={3,}$/.test(l)) { if (paras.length) paras[paras.length - 1].pageBreakAfter = true; continue; }
    if (/^#+/.test(l)) { push('outline' + Math.min(4, l.match(/^#+/)[0].length), l.replace(/^#+\s*/, '')); continue; }
    if (/^=(?!=)/.test(l)) { if (lastScene) lastScene.summary = ((lastScene.summary || '') + ' ' + l.slice(1).trim()).trim(); continue; }
    const sceneRe = /^(\.(?!\.)|(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s])/i;
    if (sceneRe.test(l) && isBlank(i - 1)) {
      let h = l.replace(/^\./, ''); let num;
      const m = h.match(/\s*#([^#]+)#\s*$/); if (m) { num = m[1]; h = h.slice(0, m.index); }
      lastScene = push('scene', h, num ? { sceneNum: num } : {});
      continue;
    }
    if (/^>.*<$/.test(l)) { push('general', l.slice(1, -1).trim(), {}); paras[paras.length - 1].center = true; continue; }
    if ((/^[A-Z0-9 .'\-]+TO:$/.test(l) && isBlank(i - 1) && isBlank(i + 1)) || /^>/.test(l)) { push('transition', l.replace(/^>\s*/, '')); continue; }
    if (/^~/.test(l)) { push('lyrics', l.slice(1)); continue; }
    const charCand = /^@/.test(l) || (/^[^a-z]*[A-Z][^a-z]*$/.test(l.replace(/\(.*?\)/g, '')) && /[A-Z]/.test(l) && isBlank(i - 1) && !isBlank(i + 1));
    if (charCand) {
      let name = l.replace(/^@/, ''); let dual = false;
      if (/\^\s*$/.test(name)) { dual = true; name = name.replace(/\s*\^\s*$/, ''); }
      push('character', name, dual ? { dual: true } : {}); inDialogue = true; continue;
    }
    if (/^!/.test(l)) { push('action', raw.trim().slice(1)); continue; }
    // action (keep consecutive lines together)
    const last = paras[paras.length - 1];
    if (last && last.type === 'action' && !isBlank(i - 1)) last.html += '<br>' + fountainInline(l);
    else push('action', l);
  }
  return { paras, titlePage };
};
IO.toFountain = (doc = SP.doc) => {
  const t = doc.titlePage; let out = '';
  const tp = [['Title', t.title], ['Credit', t.credit], ['Author', t.author], ['Source', t.source], ['Draft date', t.date || t.draft], ['Contact', t.contact], ['Copyright', t.copyright]].filter(x => x[1]);
  if (tp.length) out += tp.map(([k, v]) => `${k}: ${String(v).includes('\n') ? '\n    ' + v.split('\n').join('\n    ') : v}`).join('\n') + '\n\n';
  const ps = doc.paras;
  ps.forEach((p, i) => {
    let s = htmlToFountain(p.html);
    const def = doc.settings.elements[p.type] || {};
    if (def.caps) s = s.toUpperCase();
    const notes = (p.notes || []).map(n => ` [[${n.text}]]`).join('');
    const prevT = i ? ps[i - 1].type : null;
    const tight = ['parenthetical', 'dialogue', 'lyrics'].includes(p.type) && ['character', 'parenthetical', 'dialogue', 'lyrics'].includes(prevT);
    if (i && !tight) out += '\n';
    switch (p.type) {
      case 'scene': out += (/^(INT|EXT|EST|I\/E)/i.test(s) ? '' : '.') + s + (p.sceneNum ? ` #${p.sceneNum}#` : '') + notes + '\n'; if (p.summary) out += '\n= ' + p.summary + '\n'; break;
      case 'character': out += (/[a-z]/.test(s) ? '@' : '') + s + (p.dual ? ' ^' : '') + notes + '\n'; break;
      case 'transition': out += (/TO:$/.test(s) ? '' : '> ') + s + notes + '\n'; break;
      case 'lyrics': out += '~' + s + '\n'; break;
      case 'outline1': case 'outline2': case 'outline3': case 'outline4': out += '#'.repeat(+p.type.slice(-1)) + ' ' + s + '\n'; break;
      case 'newact': case 'page': out += '# ' + s + '\n'; break;
      case 'endact': out += '> ' + s + ' <\n'; break;
      case 'action': case 'general': default:
        out += (p.center ? '> ' + s + ' <' : (/^[^a-z]*$/.test(s) && /[A-Z]/.test(s) ? '!' + s : s)) + notes + '\n';
    }
    if (p.pageBreakAfter) out += '\n===\n';
  });
  return out;
};

/* ---------- Final Draft XML (.fdx) ---------- */
const FDX_TYPES = { scene: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'General', castlist: 'Cast List', newact: 'New Act', endact: 'End of Act', lyrics: 'Lyrics', outline1: 'Outline 1', outline2: 'Outline 2', outline3: 'Outline 3', outline4: 'Outline 4' };
const FDX_BACK = Object.fromEntries(Object.entries(FDX_TYPES).map(([k, v]) => [v.toLowerCase(), k]));
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function htmlToTextRuns(html) {
  const runs = []; const d = document.createElement('div'); d.innerHTML = html || '';
  const walk = (n, st) => {
    if (n.nodeType === 3) { if (n.textContent) runs.push({ t: n.textContent, st: [...st] }); return; }
    if (n.tagName === 'BR') { runs.push({ t: '\n', st: [...st] }); return; }
    const add = { B: 'Bold', STRONG: 'Bold', I: 'Italic', EM: 'Italic', U: 'Underline', S: 'Strikeout', STRIKE: 'Strikeout' }[n.tagName];
    let nst = add ? [...st, add] : st;
    if (n.classList && n.classList.contains('caps')) nst = [...nst, 'AllCaps'];
    n.childNodes.forEach(c => walk(c, nst));
  };
  walk(d, []);
  return runs;
}
IO.toFDX = (doc = SP.doc) => {
  const para = (p) => {
    const runs = htmlToTextRuns(p.html);
    const texts = (runs.length ? runs : [{ t: '', st: [] }]).map(r => `<Text${r.st.length ? ` Style="${[...new Set(r.st)].join('+')}"` : ''}>${xmlEsc(r.t)}</Text>`).join('');
    const attrs = [`Type="${xmlEsc(FDX_TYPES[p.type] || doc.settings.elements[p.type]?.name || 'General')}"`];
    if (p.sceneNum) attrs.push(`Number="${xmlEsc(p.sceneNum)}"`);
    if (p.color && SP.el(p.type).outline) attrs.push(`Color="${hexToFdColor(p.color)}"`);
    if (p.pageBreakAfter) attrs.push('StartsNewPage="No"');
    let props = '';
    if (p.type === 'scene' && (p.summary || p.color || p.label)) {
      props = `<SceneProperties Title="${xmlEsc(p.label || '')}"${p.color ? ` Color="${xmlEsc(hexToFdColor(p.color))}"` : ''}>${p.summary ? `<Summary><Paragraph><Text>${xmlEsc(p.summary)}</Text></Paragraph></Summary>` : ''}</SceneProperties>`;
    }
    const notes = (p.notes || []).map(n => `<ScriptNote><Paragraph><Text>${xmlEsc(n.text)}</Text></Paragraph></ScriptNote>`).join('');
    return `    <Paragraph ${attrs.join(' ')}>${props}${texts}${notes}</Paragraph>\n`;
  };
  let body = ''; const ps = doc.paras;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    // dual dialogue: wrap previous speech + this speech
    if (p.type === 'character' && p.dual) continue;
    if (p.type === 'character') {
      let j = i + 1; while (j < ps.length && ['parenthetical', 'dialogue', 'lyrics'].includes(ps[j].type)) j++;
      if (ps[j] && ps[j].type === 'character' && ps[j].dual) {
        let k = j + 1; while (k < ps.length && ['parenthetical', 'dialogue', 'lyrics'].includes(ps[k].type)) k++;
        body += `    <Paragraph><DualDialogue>\n${ps.slice(i, k).map(para).join('')}    </DualDialogue></Paragraph>\n`;
        i = k - 1; continue;
      }
    }
    body += para(p);
  }
  const t = doc.titlePage;
  const tpPara = (txt, align = 'Center') => `    <Paragraph Alignment="${align}" Type="General"><Text>${xmlEsc(txt)}</Text></Paragraph>\n`;
  let tp = '';
  if (t.title) {
    tp += tpPara(t.title.toUpperCase()) + tpPara('') + tpPara(t.credit || 'Written by') + tpPara(t.author || '');
    if (t.source) tp += tpPara('') + tpPara(t.source);
    if (t.contact) tp += t.contact.split('\n').map(l => tpPara(l, 'Left')).join('');
    if (t.draft || t.date) tp += tpPara((t.draft || '') + ' ' + (t.date || ''), 'Right');
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n  <Content>\n${body}  </Content>\n  <TitlePage>\n   <Content>\n${tp}   </Content>\n  </TitlePage>\n</FinalDraft>\n`;
};
function hexToFdColor(hex) { const h = hex.replace('#', ''); return '#' + h.match(/../g).map(x => x + x).join('').toUpperCase(); }
function fdColorToHex(c) { if (!c) return null; const h = c.replace('#', ''); if (h.length === 12) return '#' + [0, 4, 8].map(i => h.slice(i, i + 2)).join(''); return '#' + h.slice(0, 6); }
IO.parseFDX = (xml) => {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) throw new Error('Not a valid FDX file');
  const paras = [];
  const readPara = (pe, dual) => {
    const typeName = (pe.getAttribute('Type') || 'General').toLowerCase();
    const type = FDX_BACK[typeName] || 'general';
    let html = '';
    Array.from(pe.children).filter(c => c.tagName === 'Text').forEach(tn => {
      const style = (tn.getAttribute('Style') || '').split('+');
      let h = SP.esc(tn.textContent).replace(/\n/g, '<br>');
      if (style.includes('Bold')) h = `<b>${h}</b>`;
      if (style.includes('Italic')) h = `<i>${h}</i>`;
      if (style.includes('Underline')) h = `<u>${h}</u>`;
      if (style.includes('Strikeout')) h = `<s>${h}</s>`;
      if (style.includes('AllCaps')) h = `<span class="caps">${h}</span>`;
      html += h;
    });
    const p = { id: SP.uid(), type, html };
    const num = pe.getAttribute('Number'); if (num) p.sceneNum = num;
    if (pe.getAttribute('Color') && SP.el(type).outline) p.color = fdColorToHex(pe.getAttribute('Color'));
    const sp = Array.from(pe.children).find(c => c.tagName === 'SceneProperties');
    if (sp) {
      if (sp.getAttribute('Title')) p.label = sp.getAttribute('Title');
      if (sp.getAttribute('Color')) p.color = fdColorToHex(sp.getAttribute('Color'));
      const sum = sp.querySelector('Summary'); if (sum && sum.textContent.trim()) p.summary = sum.textContent.trim();
    }
    const notes = Array.from(pe.children).filter(c => c.tagName === 'ScriptNote').map(n => ({ id: SP.uid(), text: n.textContent.trim(), color: '#ffe066', date: Date.now() }));
    if (notes.length) p.notes = notes;
    return p;
  };
  const content = dom.querySelector('FinalDraft > Content') || dom.querySelector('Content');
  Array.from(content ? content.children : []).forEach(pe => {
    if (pe.tagName !== 'Paragraph') return;
    const dd = Array.from(pe.children).find(c => c.tagName === 'DualDialogue');
    if (dd) {
      let chars = 0;
      Array.from(dd.children).filter(c => c.tagName === 'Paragraph').forEach(c => {
        const p = readPara(c);
        if (p.type === 'character') { chars++; if (chars === 2) p.dual = true; }
        paras.push(p);
      });
      return;
    }
    paras.push(readPara(pe));
  });
  const titlePage = {};
  const tpc = dom.querySelector('TitlePage Content');
  if (tpc) {
    const lines = Array.from(tpc.children).map(c => ({ t: c.textContent.trim(), a: c.getAttribute('Alignment') || 'Left' })).filter(x => x.t);
    const centered = lines.filter(x => x.a === 'Center');
    if (centered[0]) titlePage.title = centered[0].t;
    const by = centered.findIndex(x => /written by|screenplay by|by$/i.test(x.t));
    if (by >= 0) { titlePage.credit = centered[by].t; titlePage.author = (centered[by + 1] || {}).t || ''; }
    const left = lines.filter(x => x.a === 'Left').map(x => x.t); if (left.length) titlePage.contact = left.join('\n');
    const right = lines.filter(x => x.a === 'Right').map(x => x.t); if (right.length) titlePage.draft = right.join(' ');
  }
  return { paras: paras.length ? paras : [{ id: SP.uid(), type: 'scene', html: '' }], titlePage };
};

/* ---------- plain text / HTML export ---------- */
IO.toText = () => {
  const { pages } = SP.renderPrint({ titlePage: false });
  const s = SP.doc.settings; let out = '';
  pages.forEach((pg, i) => {
    if (i) out += '\f\n' + ' '.repeat(70) + pg.label + '.\n\n';
    pg.items.forEach((it, k) => {
      const def = SP.el(it.para.type); const pad = ' '.repeat(Math.round((def.left - 1.5) * 10));
      if (k && (it.sb ?? def.spaceBefore)) out += '\n'.repeat(it.sb ?? def.spaceBefore);
      let lines = it.lines || SP.wrapText(SP.textOf(it.para.html), 60);
      if (def.caps) lines = lines.map(l => l.toUpperCase());
      if (def.align === 'right') lines = lines.map(l => l.padStart(Math.round((def.right - 1.5) * 10)));
      out += lines.map(l => def.align === 'right' ? l : pad + l).join('\n') + (it.contd ? ' ' + s.contd : '') + '\n';
      if (it.more) out += ' '.repeat(22) + s.more + '\n';
    });
  });
  return out;
};
IO.toHTML = () => {
  const { html } = SP.renderPrint();
  const css = Array.from(document.styleSheets).map(ss => { try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${SP.esc(SP.doc.title)}</title><style>${css}</style></head><body class="export-html"><div id="print-root" style="display:block">${html}</div></body></html>`;
};

/* ---------- native format ---------- */
IO.serialize = () => { SP.editor.sync(); return JSON.stringify(SP.doc, null, 1); };
IO.loadDoc = (doc, name) => {
  SP.doc = SP.normalizeDoc(doc);
  if (name) SP.doc.title = name.replace(/\.(spro|fdx|fountain|txt|json)$/i, '');
  SP.ui.fileHandle = null; SP.ui.dirty = false;
  SP.resetHistory(); SP.applyElementStyles(); SP.renderAll(); SP.emit('loaded');
  IO.addRecent();
};
IO.openText = (text, name) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  let doc;
  if (ext === 'fdx' || /^\s*<\?xml[\s\S]*<FinalDraft/.test(text)) {
    const r = IO.parseFDX(text); doc = SP.newDoc(); doc.paras = r.paras; Object.assign(doc.titlePage, r.titlePage);
  } else if (ext === 'spro' || ext === 'json' || /^\s*\{/.test(text)) {
    doc = JSON.parse(text);
  } else {
    const r = IO.parseFountain(text); doc = SP.newDoc(); doc.paras = r.paras.length ? r.paras : doc.paras;
    const t = r.titlePage; Object.assign(doc.titlePage, { title: t.title || '', credit: t.credit || 'Written by', author: t.author || t.authors || '', source: t.source || '', draft: t['draft date'] || '', date: t.date || '', contact: t.contact || '', copyright: t.copyright || '', notes: t.notes || '' });
  }
  return doc;
};
IO.pickFiles = (accept, multiple) => new Promise(res => {
  const inp = SP.$('#file-input'); inp.accept = accept; inp.multiple = !!multiple; inp.value = '';
  inp.onchange = async () => { const files = Array.from(inp.files); res(await Promise.all(files.map(async f => ({ name: f.name, text: await f.text() })))); };
  inp.click();
});
IO.open = async () => {
  if (!(await IO.confirmDiscard())) return;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await showOpenFilePicker({ types: [{ description: 'Scripts', accept: { 'text/plain': ['.spro', '.fdx', '.fountain', '.txt'] } }] });
      const f = await h.getFile(); const text = await f.text();
      IO.loadDoc(IO.openText(text, f.name), f.name);
      if (/\.spro$/i.test(f.name)) SP.ui.fileHandle = h;
      return;
    } catch (e) { if (e.name === 'AbortError') return; if (!(e instanceof TypeError)) { SP.ui.alert('Could not open: ' + e.message); return; } }
  }
  const [f] = await IO.pickFiles('.spro,.fdx,.fountain,.txt,.json');
  if (!f) return;
  try { IO.loadDoc(IO.openText(f.text, f.name), f.name); } catch (e) { SP.ui.alert('Could not open file: ' + e.message); }
};
IO.save = async (as) => {
  const data = IO.serialize();
  const name = (SP.doc.title || 'Untitled') + '.spro';
  if (window.showSaveFilePicker) {
    try {
      if (!SP.ui.fileHandle || as) SP.ui.fileHandle = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'Screenwriter Pro', accept: { 'application/json': ['.spro'] } }] });
      const w = await SP.ui.fileHandle.createWritable(); await w.write(data); await w.close();
      SP.doc.title = SP.ui.fileHandle.name.replace(/\.spro$/i, '');
      IO.savedOk(); return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (as) { const n = await SP.ui.prompt('Save as', SP.doc.title); if (n == null) return; SP.doc.title = n; }
  SP.download(SP.doc.title + '.spro', data, 'application/json');
  IO.savedOk();
};
IO.savedOk = () => { SP.ui.dirty = false; SP.ui.lastSaved = IO.serialize(); IO.autosave(); SP.emit('saved'); IO.addRecent(); };
IO.revert = async () => {
  if (!SP.ui.lastSaved) return SP.ui.alert('No saved version to revert to in this session.');
  if (await SP.ui.confirm('Revert to the last saved version? Unsaved changes will be lost.')) { const last = SP.ui.lastSaved; IO.loadDoc(JSON.parse(last)); SP.ui.lastSaved = last; }
};
IO.export = (fmt) => {
  SP.editor.sync(); const n = SP.doc.title || 'Untitled';
  if (fmt === 'fdx') SP.download(n + '.fdx', IO.toFDX(), 'application/xml');
  if (fmt === 'fountain') SP.download(n + '.fountain', IO.toFountain());
  if (fmt === 'txt') SP.download(n + '.txt', IO.toText());
  if (fmt === 'html') SP.download(n + '.html', IO.toHTML(), 'text/html');
  if (fmt === 'spro') SP.download(n + '.spro', IO.serialize(), 'application/json');
};
IO.backup = () => { SP.download(`${SP.doc.title || 'Untitled'} backup ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.spro`, IO.serialize(), 'application/json'); };
IO.confirmDiscard = async () => !SP.ui.dirty || await SP.ui.confirm('You have unsaved changes (they are autosaved locally). Continue?');

/* ---------- autosave + local library (recent files) + rolling backups ---------- */
IO.autosave = () => {
  if (!SP.doc) return;
  const data = IO.serialize();
  SP.store.set('doc:' + SP.doc.id, data);
  SP.store.set('current', SP.doc.id);
  const bk = SP.store.get('backups:' + SP.doc.id, []);
  if (!bk.length || Date.now() - bk[bk.length - 1].t > 10 * 60 * 1000) {
    bk.push({ t: Date.now(), data }); while (bk.length > 8) bk.shift();
    if (!SP.store.set('backups:' + SP.doc.id, bk)) { bk.splice(0, 4); SP.store.set('backups:' + SP.doc.id, bk); }
  }
  IO.addRecent();
  SP.emit('autosaved');
};
IO.addRecent = () => {
  const r = SP.store.get('recent', []).filter(x => x.id !== SP.doc.id);
  r.unshift({ id: SP.doc.id, title: SP.doc.title, t: Date.now() });
  SP.store.set('recent', r.slice(0, 15));
};
IO.openRecent = async (id) => {
  if (!(await IO.confirmDiscard())) return;
  const data = SP.store.get('doc:' + id); if (!data) return SP.ui.alert('That script is no longer in local storage.');
  IO.loadDoc(JSON.parse(data));
};
IO.restoreCurrent = () => {
  const id = SP.store.get('current'); const data = id && SP.store.get('doc:' + id);
  if (data) { try { IO.loadDoc(JSON.parse(data)); return true; } catch {} }
  return false;
};
IO.combine = async () => {
  const files = await IO.pickFiles('.spro,.fdx,.fountain,.txt', true);
  if (!files.length) return;
  SP.editor.sync(); SP.pushUndo(true);
  files.forEach(f => { try { const d = IO.openText(f.text, f.name); SP.doc.paras.push(...d.paras.map(p => ({ ...p, id: SP.uid() }))); } catch (e) { SP.ui.alert(f.name + ': ' + e.message); } });
  SP.markDirty(); SP.renderAll(); SP.ui.toast(`Appended ${files.length} file(s).`);
};
IO.saveAsTemplate = async () => {
  const name = await SP.ui.prompt('Template name', SP.doc.title + ' Template'); if (!name) return;
  SP.editor.sync();
  const t = SP.store.get('userTemplates', {});
  t[name] = { group: 'My Templates', userDoc: { settings: SP.doc.settings, paras: SP.doc.paras, beats: SP.doc.beats, titlePage: SP.doc.titlePage } };
  SP.store.set('userTemplates', t); SP.ui.toast('Template saved.');
};
})();
