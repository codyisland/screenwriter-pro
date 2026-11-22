/* Screenwriter Pro — reports: scene, location, character, cast, script, ScriptNote, statistics, tags, inclusivity. */
'use strict';
(() => {
const R = SP.reports = {};
const pageOf = (id) => SP.pageOf(id);
const tbl = (head, rows) => `<table class="tbl report"><thead><tr>${head.map(h => `<th>${SP.esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const toCSV = (el) => SP.$$('tr', el).map(tr => SP.$$('th,td', tr).map(td => `"${td.textContent.replace(/"/g, '""')}"`).join(',')).join('\n');

R.show = (title, html, opts = {}) => {
  SP.ui.modal({ title, wide: true, cls: 'report-modal', body: `<div class="report-body">${html}</div>`,
    buttons: [
      ...(opts.csv !== false ? [{ label: 'Export CSV', left: true, action: m => { SP.download(`${SP.doc.title} - ${title}.csv`, toCSV(SP.$('.report-body', m)), 'text/csv'); return false; } }] : []),
      { label: 'Export Text', left: true, action: m => { SP.download(`${SP.doc.title} - ${title}.txt`, SP.$('.report-body', m).innerText); return false; } },
      { label: 'Print', action: m => { const ph = `<div class="print-report"><h1>${SP.esc(SP.doc.title)} — ${SP.esc(title)}</h1>${SP.$('.report-body', m).innerHTML}</div>`; if (SP.native.isNative) { SP.native.printHTML(ph); return false; } const pr = SP.$('#print-root'); pr.innerHTML = ph; document.body.classList.add('printing'); setTimeout(() => { print(); setTimeout(() => { document.body.classList.remove('printing'); pr.innerHTML = ''; }, 500); }, 80); return false; } },
      { label: 'Close', primary: true }],
    onOpen: m => m.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { m.close(); SP.editor.goTo(g.dataset.go); } }) });
};
const go = (id, text) => `<a href="#" data-go="${id}">${SP.esc(text)}</a>`;
const prep = () => SP.editor.sync();

R.sceneReport = () => {
  prep();
  const rows = SP.scenes().map(s => {
    const h = SP.parseHeading(s.heading);
    const chars = [...new Set(s.paras.filter(p => p.type === 'character').map(p => SP.charName(SP.textOf(p.html))))];
    const words = s.paras.reduce((n, p) => n + SP.wordCount(SP.textOf(p.html)), 0);
    return [SP.esc(s.num), go(s.id, s.heading || '(untitled)'), SP.esc(h.intro), SP.esc(h.time), pageOf(s.id), words, SP.esc(chars.join(', ')), SP.esc(s.para.summary || '')];
  });
  R.show('Scene Report', `<p>${rows.length} scenes.</p>` + tbl(['#', 'Heading', 'Int/Ext', 'Time', 'Page', 'Words', 'Characters', 'Summary'], rows));
};
R.locationReport = () => {
  prep();
  const ls = SP.locations().sort((a, b) => b.count - a.count);
  R.show('Location Report', `<p>${ls.length} locations.</p>` + tbl(['Location', 'Scenes', 'Int/Ext', 'Times', 'Scene numbers'], ls.map(l => [
    `<b>${SP.esc(l.name)}</b>`, l.count, SP.esc([...new Set(l.scenes.map(s => SP.parseHeading(s.heading).intro))].join(', ')),
    SP.esc([...new Set(l.scenes.map(s => SP.parseHeading(s.heading).time).filter(Boolean))].join(', ')), l.scenes.map(s => go(s.id, s.num)).join(' ')])));
};
R.characterReport = (names) => {
  prep();
  const cs = SP.characters().filter(c => !c.nonSpeaking);
  const build = (sel) => {
    let html = ''; const ps = SP.doc.paras; let scene = null;
    sel.forEach(name => {
      html += `<h3>${SP.esc(name)}</h3>`;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; if (SP.el(p.type).sceneLike) scene = p;
        if (p.type === 'character' && SP.charName(SP.textOf(p.html)) === name) {
          const lines = []; let j = i + 1;
          while (j < ps.length && ['dialogue', 'parenthetical', 'lyrics'].includes(ps[j].type)) { lines.push(`<div class="rp-${ps[j].type}">${ps[j].html}</div>`); j++; }
          html += `<div class="rp-speech"><small>${scene ? go(scene.id, SP.textOf(scene.html)) : ''} · p. ${pageOf(p.id)}</small>${lines.join('')}</div>`;
        }
      }
    });
    return html;
  };
  if (names) return R.show('Character Report', build(names), { csv: false });
  SP.ui.modal({ title: 'Character Report', body: `<p>Choose characters:</p><div class="chk-list">${cs.map(c => `<label><input type="checkbox" value="${SP.esc(c.name)}"> ${SP.esc(c.name)} <small class="muted">(${c.speeches})</small></label>`).join('')}</div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Create Report', primary: true, action: m => { const sel = SP.$$('input:checked', m).map(i => i.value); if (sel.length) setTimeout(() => R.show('Character Report', build(sel), { csv: false }), 0); } }] });
};
R.castReport = () => {
  prep();
  const cs = SP.characters().sort((a, b) => b.words - a.words);
  const total = cs.reduce((n, c) => n + c.words, 0) || 1;
  R.show('Cast Report', `<p>${cs.length} characters.</p>` + tbl(['Character', 'Speeches', 'Words', '% dialogue', 'Scenes', 'First appears', 'Description'], cs.map(c => {
    const first = SP.doc.paras[c.first];
    return [`<b>${SP.esc(c.name)}</b>${c.nonSpeaking ? ' <small>(non-speaking)</small>' : ''}`, c.speeches, c.words, (c.words / total * 100).toFixed(1) + '%', c.scenes.size, first ? 'p. ' + pageOf(first.id) : '', SP.esc((SP.doc.cast[c.name] || {}).desc || '')];
  })));
};
R.scriptReport = () => {
  const els = SP.doc.settings.elements;
  SP.ui.modal({ title: 'Script Report', body: `<p>Include these elements:</p><div class="chk-list">${Object.entries(els).map(([k, e]) => `<label><input type="checkbox" value="${k}" ${['scene', 'action'].includes(k) ? 'checked' : ''}> ${SP.esc(e.name)}</label>`).join('')}</div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Create Report', primary: true, action: m => {
      const types = new Set(SP.$$('input:checked', m).map(i => i.value)); prep();
      setTimeout(() => R.show('Script Report', SP.doc.paras.filter(p => types.has(p.type)).map(p => `<div class="rp-line rp-${p.type}"><small>${SP.esc(SP.el(p.type).name)} · p. ${pageOf(p.id)}</small> ${go(p.id, SP.textOf(p.html) || '(empty)')}</div>`).join(''), { csv: false }), 0);
    } }] });
};
R.scriptNoteReport = () => {
  prep();
  const rows = []; SP.doc.paras.forEach(p => (p.notes || []).forEach(n => rows.push([`<span class="dot" style="background:${n.color}"></span>`, 'p. ' + pageOf(p.id), go(p.id, SP.textOf(p.html).slice(0, 60) || '(empty)'), SP.esc(n.text).replace(/\n/g, '<br>'), new Date(n.date || Date.now()).toLocaleDateString()])));
  const gn = (SP.doc.generalNotes || []).map(t => `<p>${SP.esc(t)}</p>`).join('');
  R.show('ScriptNote Report', (gn ? `<h3>General Notes</h3>${gn}` : '') + `<h3>ScriptNotes (${rows.length})</h3>` + tbl(['', 'Page', 'On', 'Note', 'Date'], rows));
};
R.statisticsReport = () => {
  prep();
  const ps = SP.doc.paras; const sc = SP.scenes(); const pages = SP.paginate(ps).length;
  const byType = {}; ps.forEach(p => { const w = SP.wordCount(SP.textOf(p.html)); byType[p.type] = (byType[p.type] || 0) + w; });
  const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  const ie = { INT: 0, EXT: 0, other: 0 }; const times = {};
  sc.forEach(s => { const h = SP.parseHeading(s.heading); const k = /^INT/.test(h.intro) && !/EXT/.test(h.intro) ? 'INT' : /^EXT/.test(h.intro) ? 'EXT' : 'other'; ie[k]++; if (h.time) times[h.time] = (times[h.time] || 0) + 1; });
  const cs = SP.characters().sort((a, b) => b.words - a.words).slice(0, 12); const maxW = Math.max(1, ...cs.map(c => c.words));
  const bar = (label, v, max, color = 'var(--accent)') => `<div class="hbar"><span>${SP.esc(label)}</span><div><i style="width:${v / max * 100}%;background:${color}"></i></div><b>${v}</b></div>`;
  const sceneLens = sc.map(s => s.paras.reduce((n, p) => n + SP.wordCount(SP.textOf(p.html)), 0));
  R.show('Statistics', `
    <div class="stat-tiles"><div><b>${pages}</b><small>pages</small></div><div><b>${sc.length}</b><small>scenes</small></div><div><b>${total}</b><small>words</small></div><div><b>${SP.characters().length}</b><small>characters</small></div><div><b>${SP.locations().length}</b><small>locations</small></div><div><b>${Math.round(pages)}′</b><small>est. runtime</small></div></div>
    <h3>Words by element</h3>${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => bar(SP.el(k).name, v, total)).join('')}
    <p class="muted">Dialogue is ${((byType.dialogue || 0) / total * 100).toFixed(0)}% of the script; action ${((byType.action || 0) / total * 100).toFixed(0)}%.</p>
    <h3>Interior / Exterior</h3>${bar('INT.', ie.INT, sc.length || 1, '#74c0fc')}${bar('EXT.', ie.EXT, sc.length || 1, '#51cf66')}${ie.other ? bar('Other', ie.other, sc.length || 1, '#adb5bd') : ''}
    <h3>Time of day</h3>${Object.entries(times).sort((a, b) => b[1] - a[1]).map(([k, v]) => bar(k, v, sc.length || 1, '#ffa94d')).join('') || '<p class="muted">—</p>'}
    <h3>Dialogue words by character</h3>${cs.map(c => bar(c.name, c.words, maxW, '#b197fc')).join('') || '<p class="muted">—</p>'}
    <h3>Scene length (words)</h3><div class="spark">${sceneLens.map((w, i) => `<i title="Scene ${sc[i].num}: ${w} words" style="height:${w / Math.max(1, ...sceneLens) * 100}%"></i>`).join('')}</div>`, { csv: false });
};
R.tagsReport = () => {
  prep();
  const tags = SP.tools.collectTags(); const sceneOf = new Map(); SP.scenes().forEach(s => s.paras.forEach(p => sceneOf.set(p.id, s)));
  let html = '';
  SP.doc.tagCats.forEach(c => {
    const items = tags.filter(t => t.cat === c.name); if (!items.length) return;
    const by = new Map(); items.forEach(t => { const k = t.text.toUpperCase(); const e = by.get(k) || { scenes: new Set() }; const s = sceneOf.get(t.paraId); if (s) e.scenes.add(s); by.set(k, e); });
    html += `<h3><span class="dot" style="background:${c.color}"></span> ${SP.esc(c.name)}</h3>` + tbl(['Item', 'Scenes'], [...by].map(([k, e]) => [SP.esc(k), [...e.scenes].map(s => go(s.id, s.num)).join(' ')]));
  });
  R.show('Tags Report', html || '<p>No tags yet. Select text in the script and use Tools › Tag Selection.</p>');
  // breakdown by scene
};
R.inclusivityReport = () => {
  prep();
  const cs = SP.characters(); const cast = SP.doc.cast;
  const dims = [['gender', 'Gender'], ['ethnicity', 'Race / Ethnicity'], ['age', 'Age'], ['disability', 'Disability'], ['lgbt', 'LGBTQIA+']];
  const total = cs.reduce((n, c) => n + c.words, 0) || 1, totalS = cs.reduce((n, c) => n + c.speeches, 0) || 1;
  const filled = cs.filter(c => cast[c.name] && dims.some(([k]) => cast[c.name][k])).length;
  let html = `<p>${filled} of ${cs.length} characters have attributes. Add them in the Navigator's <b>Cast List</b> tab (click a character).</p>`;
  dims.forEach(([k, l]) => {
    const g = {}; cs.forEach(c => { const v = ((cast[c.name] || {})[k] || 'Unspecified').trim() || 'Unspecified'; const e = g[v] || { chars: 0, words: 0, speeches: 0 }; e.chars++; e.words += c.words; e.speeches += c.speeches; g[v] = e; });
    html += `<h3>${l}</h3>` + tbl([l, 'Characters', 'Speeches', '% of speeches', 'Dialogue words', '% of dialogue'], Object.entries(g).sort((a, b) => b[1].words - a[1].words).map(([v, e]) => [SP.esc(v), e.chars, e.speeches, (e.speeches / totalS * 100).toFixed(1) + '%', e.words, (e.words / total * 100).toFixed(1) + '%']));
  });
  R.show('Inclusivity Report', html);
};
})();
