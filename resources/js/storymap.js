/* Screenwriter Pro — Story Map: Outline elements laid out along the script by page position.
   Each Outline element (levels 1–4) lives in the script itself; on the map it spans from its
   position to the next Outline element of the same or a higher level. */
'use strict';
(() => {
const M = SP.storyMap = { ppp: null, sel: null, levels: 2 };
const LABEL_W = 110;

const items = () => {
  const { pos, total } = SP.positions();
  const list = SP.doc.paras.filter(SP.isOutline).map(p => ({ p, level: SP.outlineLevel(p), at: pos.get(p.id) ?? 0 }));
  list.forEach((it, i) => {
    const next = list.slice(i + 1).find(o => o.level <= it.level);
    it.end = next ? next.at : total;
  });
  return list;
};
const posToPara = (at) => { // first printed paragraph at or after a page position
  const { pos } = SP.positions();
  let best = null, bestD = Infinity;
  SP.doc.paras.forEach(p => { if (SP.isOutline(p)) return; const d = Math.abs((pos.get(p.id) ?? 0) - at); if (d < bestD) { bestD = d; best = p; } });
  return best;
};
const sceneStartNear = (at) => {
  const { pos } = SP.positions(); const sc = SP.scenes();
  let best = null, bestD = Infinity;
  sc.forEach(s => { const d = Math.abs((pos.get(s.id) ?? 0) - at); if (d < bestD) { bestD = d; best = s.para; } });
  return bestD < 0.6 ? best : posToPara(at);
};

M.render = () => {
  const host = SP.$('#storymap'); if (!host) return;
  host.hidden = !SP.ui.storyMap;
  if (host.hidden) { document.body.classList.remove('has-storymap'); return; }
  document.body.classList.add('has-storymap');
  const { pos, total } = SP.positions();
  const its = items();
  const levels = Math.max(M.levels, ...its.map(i => i.level), 1);
  const target = Math.max(total, SP.doc.settings.targetPages || 0);
  const trackW = host.clientWidth - LABEL_W - 4;
  if (!M.ppp) M.ppp = Math.max(24, Math.min(240, trackW / Math.max(total + 1, 6)));
  const ppp = M.ppp; const width = Math.max(trackW, (target + 1) * ppp);
  const caret = SP.editor.getCaret(); const caretAt = caret ? pos.get(caret.id) : null;
  const sc = SP.scenes();
  let ruler = '';
  for (let pg = 0; pg <= target; pg++) {
    ruler += `<div class="sm-tick major" style="left:${pg * ppp}px"><span>${pg + 1}</span></div>`;
    for (let k = 1; k < 8; k++) ruler += `<div class="sm-tick${k === 4 ? ' mid' : ''}" style="left:${(pg + k / 8) * ppp}px"></div>`;
  }
  const rows = Array.from({ length: levels }, (_, i) => i + 1);
  host.innerHTML = `
    <div class="sm-labels">
      ${rows.map(l => `<div class="sm-label lv${l}">Outline ${l}</div>`).join('')}
      <div class="sm-label ruler-l" title="Add an outline level"><button class="sm-addrow">＋</button></div>
      <div class="sm-label script-l">Script</div>
      <div class="sm-label foot-l"></div>
    </div>
    <div class="sm-scroll"><div class="sm-track" style="width:${width}px;--ppp:${ppp}px">
      ${rows.map(l => `<div class="sm-row" data-level="${l}">${its.filter(i => i.level === l).map(i => `<div class="sm-item${M.sel === i.p.id ? ' sel' : ''}" data-id="${i.p.id}" title="${SP.esc(SP.textOf(i.p.html))} — p. ${Math.floor(i.at) + 1}" style="left:${i.at * ppp}px;width:${Math.max(18, (i.end - i.at) * ppp - 3)}px;--c:${i.p.color || '#9aa0a6'}">${SP.esc(SP.textOf(i.p.html) || 'Untitled')}</div>`).join('')}</div>`).join('')}
      <div class="sm-ruler">${ruler}<div class="sm-target" style="left:${target * ppp}px" title="Target length: ${target} pages"></div></div>
      <div class="sm-script">${sc.map((s, i) => { const a = pos.get(s.id) ?? 0, b = sc[i + 1] ? pos.get(sc[i + 1].id) ?? total : total; return `<div class="sm-scene" data-go="${s.id}" title="${SP.esc(s.num + '. ' + s.heading)}" style="left:${a * ppp}px;width:${Math.max(4, (b - a) * ppp - 2)}px;--c:${s.para.color || 'transparent'}"></div>`; }).join('')}</div>
      ${caretAt != null ? `<div class="sm-playhead" style="left:${caretAt * ppp}px"></div>` : ''}
    </div></div>
    <input class="sm-zoom" type="range" min="12" max="320" value="${Math.round(ppp)}" title="Zoom Story Map">`;
  const scroll = SP.$('.sm-scroll', host);
  if (M.scrollLeft != null) scroll.scrollLeft = M.scrollLeft;
  scroll.onscroll = () => { M.scrollLeft = scroll.scrollLeft; };
  bind(host, scroll, ppp);
};

function bind(host, scroll, ppp) {
  const track = SP.$('.sm-track', host);
  const atX = (clientX) => Math.max(0, (clientX - track.getBoundingClientRect().left) / ppp);
  SP.$('.sm-zoom', host).oninput = e => { const c = scroll.scrollLeft / M.ppp; M.ppp = +e.target.value; M.scrollLeft = c * M.ppp; M.render(); };
  SP.$('.sm-addrow', host).onclick = () => { M.levels = Math.min(4, M.levels + 1); M.render(); };
  track.addEventListener('dblclick', async e => {
    if (e.target.closest('.sm-item')) { SP.editor.goTo(e.target.closest('.sm-item').dataset.id); return; }
    const row = e.target.closest('.sm-row'); if (!row) return;
    const at = atX(e.clientX);
    const title = await SP.ui.prompt(`New Outline ${row.dataset.level} item at page ${Math.floor(at) + 1}`); if (!title) return;
    M.insert(+row.dataset.level, title, sceneStartNear(at));
  });
  track.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { SP.editor.goTo(g.dataset.go); return; }
    if (e.target.closest('.sm-ruler')) { const p = posToPara(atX(e.clientX)); if (p) SP.editor.goTo(p.id); }
  });
  track.addEventListener('contextmenu', e => {
    const it = e.target.closest('.sm-item'); if (!it) return; e.preventDefault();
    M.menu(it.dataset.id, e.clientX, e.clientY);
  });
  // drag an item along the script
  track.addEventListener('pointerdown', e => {
    const it = e.target.closest('.sm-item'); if (!it || e.button !== 0) return;
    e.preventDefault(); M.sel = it.dataset.id;
    SP.$$('.sm-item', track).forEach(x => x.classList.toggle('sel', x === it));
    const startX = e.clientX, left0 = parseFloat(it.style.left); let moved = false;
    const ghost = document.createElement('div'); ghost.className = 'sm-drop';
    const mv = ev => {
      const dx = ev.clientX - startX; if (Math.abs(dx) > 3) moved = true; if (!moved) return;
      it.style.left = (left0 + dx) + 'px'; it.classList.add('dragging');
      const p = sceneStartNear((left0 + dx) / ppp); const at = p ? SP.positions().pos.get(p.id) : 0;
      ghost.style.left = at * ppp + 'px'; if (!ghost.parentNode) track.appendChild(ghost);
    };
    const up = ev => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); ghost.remove();
      if (!moved) return;
      const target = sceneStartNear((left0 + ev.clientX - startX) / ppp);
      M.move(it.dataset.id, target);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}

M.insert = (level, title, beforePara, color) => {
  SP.editor.sync(); SP.pushUndo(true);
  const colors = Object.values(SP.COLORS);
  const p = { id: SP.uid(), type: 'outline' + level, html: SP.esc(title), color: color || colors[SP.doc.paras.filter(SP.isOutline).length % 11] };
  const i = beforePara ? SP.paraIndex(beforePara.id) : SP.doc.paras.length;
  SP.doc.paras.splice(i < 0 ? SP.doc.paras.length : i, 0, p);
  M.sel = p.id; SP.markDirty(); SP.renderAll();
  return p;
};
M.move = (id, beforePara) => {
  if (!beforePara || beforePara.id === id) return;
  SP.editor.sync(); SP.pushUndo(true);
  const i = SP.paraIndex(id); const [p] = SP.doc.paras.splice(i, 1);
  let j = SP.paraIndex(beforePara.id);
  // keep stacked outline elements (e.g. an Act and its first sequence) in level order
  while (j > 0 && SP.isOutline(SP.doc.paras[j - 1]) && SP.outlineLevel(SP.doc.paras[j - 1]) > SP.outlineLevel(p)) j--;
  SP.doc.paras.splice(j, 0, p);
  SP.markDirty(); SP.renderAll();
};
M.menu = (id, x, y) => {
  const p = SP.para(id); if (!p) return;
  const set = (fn) => () => { SP.editor.sync(); SP.pushUndo(true); fn(); SP.markDirty(); SP.renderAll(); };
  SP.ui.popupMenu(x, y, [
    { label: 'Go To in Script', action: () => SP.editor.goTo(id) },
    { label: 'Rename…', action: async () => { const t = await SP.ui.prompt('Outline item', SP.textOf(p.html)); if (t != null) set(() => { p.html = SP.esc(t); })(); } },
    { sep: true },
    ...[1, 2, 3, 4].map(l => ({ label: `Outline ${l}${SP.outlineLevel(p) === l ? '  ✓' : ''}`, action: set(() => { p.type = 'outline' + l; }) })),
    { sep: true },
    ...Object.entries(SP.COLORS).map(([n, c]) => ({ label: n, swatch: c, action: set(() => { p.color = c; }) })),
    { sep: true },
    { label: 'Delete', action: set(() => { SP.doc.paras.splice(SP.paraIndex(id), 1); }) }
  ]);
};
/* Beat Board › Send to Story Map: each selected beat becomes an Outline 1 item at the cursor */
M.fromBeats = (beats) => {
  if (!beats.length) return SP.ui.toast('Select beats first.');
  SP.editor.sync();
  const c = SP.editor.getCaret(); let before = c ? SP.para(c.id) : null;
  [...beats].sort((a, b) => (a.y - b.y) || (a.x - b.x)).reverse().forEach(b => { const p = M.insert(1, b.title || 'Beat', before, b.color); before = p; });
  SP.ui.storyMap = true; SP.store.set('storyMap', true); M.render();
  SP.ui.toast(`Added ${beats.length} item(s) to the Story Map.`);
};
M.playhead = () => {
  const ph = SP.$('#storymap .sm-playhead'); const c = SP.editor.getCaret(); if (!ph || !c || !M.ppp) return;
  const at = SP.positions().pos.get(c.id); if (at != null) ph.style.left = at * M.ppp + 'px';
};
M.toggle = () => { SP.ui.storyMap = !SP.ui.storyMap; SP.store.set('storyMap', SP.ui.storyMap); M.render(); };
addEventListener('resize', () => { clearTimeout(M._rt); M._rt = setTimeout(M.render, 150); });
})();
