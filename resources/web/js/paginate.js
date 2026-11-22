/* Screenwriter Pro — pagination, MOREs/CONT'Ds, locked pages, print/PDF rendering. */
'use strict';
(() => {
const KEEP_WITH_NEXT = new Set(['scene', 'character', 'parenthetical', 'shot', 'newact', 'outline1', 'page', 'panel']);
const SPLITTABLE = new Set(['action', 'dialogue', 'general', 'lyrics', 'outline2']);

SP.formatHF = (tpl, page, total) => (tpl || '')
  .replace(/\{page\}/g, page).replace(/\{pages\}/g, total || '')
  .replace(/\{title\}/g, SP.doc.titlePage.title || SP.doc.title)
  .replace(/\{date\}/g, new Date().toLocaleDateString())
  .replace(/\{rev\}/g, SP.doc.settings.revisionName || '');

SP.wrapText = (text, width) => {
  const out = [];
  String(text).split('\n').forEach(line => {
    if (!line.length) { out.push(''); return; }
    let cur = '';
    line.split(/(\s+)/).forEach(tok => {
      if (!tok) return;
      if ((cur + tok).length <= width) { cur += tok; return; }
      if (/^\s+$/.test(tok)) { out.push(cur); cur = ''; return; }
      if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
      cur = '';
      while (tok.length > width) { out.push(tok.slice(0, width)); tok = tok.slice(width); }
      cur = tok;
    });
    out.push(cur.replace(/\s+$/, ''));
  });
  return out;
};
const widthOf = (type, dual) => Math.max(8, Math.floor((SP.el(type).right - SP.el(type).left) * 10 * (dual ? 0.62 : 1)));
const linesOf = (p, dual) => {
  const def = SP.el(p.type);
  let t = SP.textOf(p.html); if (def.caps) t = t.toUpperCase();
  const ls = SP.wrapText(t, widthOf(p.type, dual));
  return def.lineSpacing > 1 ? ls.flatMap((l, i) => i ? [''.padEnd(0), l] : [l]) : ls;
};

/* group paras into blocks; a dual-dialogue pair becomes one block */
function blocks(paras) {
  const out = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.type === 'character' && p.dual) {
      // find previous speech on out and merge
      let j = out.length - 1; const right = [p];
      while (i + 1 < paras.length && ['parenthetical', 'dialogue', 'lyrics'].includes(paras[i + 1].type)) right.push(paras[++i]);
      const left = [];
      while (j >= 0 && ['parenthetical', 'dialogue', 'lyrics'].includes(out[j].para?.type)) left.unshift(out[j--].para);
      if (j >= 0 && out[j].para?.type === 'character') { left.unshift(out[j].para); out.length = j; out.push({ dual: true, left, right, para: left[0] }); continue; }
      out.push(...left.map(q => ({ para: q })));
      right.forEach(q => out.push({ para: q }));
      continue;
    }
    out.push({ para: p });
  }
  return out;
}

SP.paginate = (paras, opts = {}) => {
  const s = SP.doc.settings;
  const cap = s.linesPerPage || 54;
  const locked = SP.doc.lockedPages && s.pagesLocked ? new Map(SP.doc.lockedPages.map(x => [x.id, x.label])) : null;
  const pages = [];
  let page = null, used = 0, base = 1, sub = 0, autoNum = 0;
  const letter = n => String.fromCharCode(64 + n);
  const newPage = (label) => {
    page = { items: [], label: label ?? String(++autoNum) };
    pages.push(page); used = 0;
  };
  const overflowLabel = () => {
    if (!locked) return undefined;
    sub++; return base + letter(sub);
  };
  newPage(locked ? '1' : undefined);
  if (locked) autoNum = 1;
  const bl = blocks(paras);
  let lastSpeaker = null; let speechSinceScene = new Set();
  const place = (item, n, sb) => { item.sb = page.items.length ? sb : 0; page.items.push(item); used += item.sb + n; };
  for (let bi = 0; bi < bl.length; bi++) {
    const b = bl[bi]; const p = b.para; const def = SP.el(p.type);
    if (def.outline && !s.printOutline) continue; // Story Map outline elements never print
    if (locked && locked.has(p.id) && page.items.length) { base = locked.get(p.id); sub = 0; newPage(base); }
    else if (locked && locked.has(p.id)) { base = locked.get(p.id); sub = 0; page.label = base; }
    if (def.newPage && page.items.length) newPage(overflowLabel());
    else if (bi > 0 && bl[bi - 1].para.pageBreakAfter && page.items.length) newPage(overflowLabel());
    if (def.sceneLike) { lastSpeaker = null; }
    let lines, n;
    if (b.dual) {
      const L = b.left.flatMap(q => linesOf(q, true).concat(q.type === 'character' || q.type === 'parenthetical' ? [] : [])), R = b.right.flatMap(q => linesOf(q, true));
      n = Math.max(L.length, R.length); lines = null;
    } else { lines = linesOf(p); n = lines.length; }
    const sb = def.spaceBefore || 0;
    const avail = cap - used - (page.items.length ? sb : 0);
    // keep-with-next: need room for this + first two lines of next block
    let need = n;
    if (KEEP_WITH_NEXT.has(p.type) && bl[bi + 1]) {
      const nx = bl[bi + 1]; const nl = nx.dual ? 2 : Math.min(2, linesOf(nx.para).length);
      need = n + (SP.el(nx.para.type).spaceBefore || 0) + nl;
    }
    // automatic character CONT'D
    let contd = false;
    if (p.type === 'character' && !b.dual) {
      const nm = SP.charName(SP.textOf(p.html));
      if (s.autoCharContd && nm && nm === lastSpeaker && !/CONT'?D/i.test(SP.textOf(p.html))) contd = true;
      lastSpeaker = nm;
    } else if (b.dual) lastSpeaker = null;
    else if (def.sceneLike || p.type === 'transition') lastSpeaker = null;
    if (need <= avail) { place({ para: p, lines, dual: b.dual ? b : null, contd }, n, sb); continue; }
    // try splitting
    if (!b.dual && SPLITTABLE.has(p.type) && n >= 4) {
      const isDlg = p.type === 'dialogue' || p.type === 'lyrics';
      const room = avail - (isDlg && s.useMore ? 1 : 0);
      if (room >= 2 && n - room >= 2) {
        let cut = room;
        if (!isDlg) { // prefer breaking after a sentence
          for (let k = room; k >= 2; k--) if (/[.!?]["')]?$/.test(lines[k - 1])) { cut = k; break; }
        }
        place({ para: p, lines: lines.slice(0, cut), part: 'first', more: isDlg && s.useMore }, cut, sb);
        newPage(overflowLabel());
        if (isDlg) {
          // find the speaker
          let ch = null; for (let k = paras.indexOf(p) - 1; k >= 0; k--) { if (paras[k].type === 'character') { ch = paras[k]; break; } if (!['parenthetical', 'dialogue', 'lyrics'].includes(paras[k].type)) break; }
          if (ch) place({ para: ch, lines: [SP.charName(SP.textOf(ch.html)) + (s.useContd ? ' ' + s.contd : '')], cont: true, synthetic: true }, 1, 0);
        }
        place({ para: p, lines: lines.slice(cut), part: 'rest', cont: true }, n - cut, 0);
        continue;
      }
    }
    // move to next page, carrying keep-with-next predecessors
    const carry = [];
    while (page.items.length > 1) {
      const last = page.items[page.items.length - 1];
      if (last.cont || !KEEP_WITH_NEXT.has(last.para.type) || last.dual) break;
      carry.unshift(page.items.pop());
    }
    // a dialogue moving alone drags its character + parenthetical too
    if ((p.type === 'dialogue' || p.type === 'parenthetical') && !carry.length) {
      while (page.items.length > 1) {
        const last = page.items[page.items.length - 1];
        if (!['character', 'parenthetical', 'dialogue'].includes(last.para.type) || last.cont) break;
        if (last.para.type === 'dialogue') { // split speech: add MORE and CONT'D
          if (s.useMore) last.more = true;
          break;
        }
        carry.unshift(page.items.pop());
      }
    }
    if (page.items.length === 0 && carry.length === 0) { place({ para: p, lines, dual: b.dual ? b : null, contd }, n, sb); continue; }
    newPage(overflowLabel());
    carry.forEach(it => place(it, it.lines ? it.lines.length : 1, SP.el(it.para.type).spaceBefore || 0));
    place({ para: p, lines, dual: b.dual ? b : null, contd }, n, sb);
  }
  // recompute line count for carried items whose lines were null (dual)
  return pages;
};

/* ---------- print / PDF rendering ---------- */
SP.renderPrint = (opts = {}) => {
  SP.editor.sync();
  const s = SP.doc.settings; const t = SP.doc.titlePage;
  const pages = SP.paginate(SP.doc.paras);
  const scenes = SP.scenes(); const sceneById = new Map(scenes.map(x => [x.id, x]));
  const showNum = s.sceneNumbers !== 'none';
  const revColor = name => (SP.REVISION_COLORS.find(r => r.name === name) || {}).color;
  let html = '';
  const wm = s.watermark ? `<div class="watermark">${SP.esc(s.watermark)}</div>` : '';
  if (opts.titlePage !== false && (t.title || t.author)) {
    html += `<div class="print-page title-page">${wm}
      <div class="tp-main"><div class="tp-title">${SP.esc(t.title).toUpperCase()}</div>
      ${t.credit ? `<div class="tp-credit">${SP.esc(t.credit)}</div>` : ''}<div class="tp-author">${SP.esc(t.author).replace(/\n/g, '<br>')}</div>
      ${t.source ? `<div class="tp-source">${SP.esc(t.source).replace(/\n/g, '<br>')}</div>` : ''}</div>
      <div class="tp-left">${SP.esc(t.contact).replace(/\n/g, '<br>')}</div>
      <div class="tp-right">${SP.esc(t.draft)}<br>${SP.esc(t.date)}${t.copyright ? '<br>' + SP.esc(t.copyright) : ''}</div></div>`;
  }
  const lineHtml = (it) => {
    const p = it.para;
    if (it.lines && (it.part || it.synthetic || SP.el(p.type).lineSpacing > 1)) return it.lines.map(l => SP.esc(l) || '&nbsp;').join('<br>');
    let h = p.html || '&nbsp;';
    if (it.contd && s.useContd) h += ' ' + SP.esc(s.contd);
    return h;
  };
  const dualCol = (ps) => ps.map(q => `<div class="pp dual-${q.type}" data-type="${q.type}">${q.html || '&nbsp;'}</div>`).join('');
  pages.forEach((pg, i) => {
    let body = '';
    pg.items.forEach((it, k) => {
      const p = it.para; const def = SP.el(p.type);
      const mt = k === 0 ? 0 : (it.sb ?? def.spaceBefore ?? 0) * 12;
      const sc = !it.cont && sceneById.get(p.id);
      let marks = '';
      if (sc && showNum) {
        const n = SP.esc(SP.sceneNumber(sc));
        if (s.sceneNumbers === 'left' || s.sceneNumbers === 'both') marks += `<span class="pn-l" style="left:-0.75in">${n}</span>`;
        if (s.sceneNumbers === 'right' || s.sceneNumbers === 'both') marks += `<span class="pn-r" style="left:${7.6 - def.left}in">${n}</span>`;
      }
      if (p.rev && opts.revisionMarks !== false) marks += `<span class="pn-rev" style="left:${7.85 - def.left}in" title="${p.rev}">${SP.esc(s.revisionMark)}</span>`;
      if (it.dual) {
        body += `<div class="pp-dual" style="margin-top:${mt}pt"><div class="dcol">${dualCol(it.dual.left)}</div><div class="dcol">${dualCol(it.dual.right)}</div></div>`;
      } else {
        body += `<div class="pp" data-type="${it.synthetic ? 'character' : p.type}" style="margin-top:${mt}pt">${marks}${lineHtml(it)}</div>`;
      }
      if (it.more) body += `<div class="pp" data-type="character" style="margin-top:0">${SP.esc(s.more)}</div>`;
    });
    if (s.sceneContd && i < pages.length - 1) {
      const nextFirst = pages[i + 1].items[0];
      if (nextFirst && !SP.el(nextFirst.para.type).sceneLike) body += `<div class="pp" data-type="transition" style="margin-top:12pt">CONTINUED:</div>`;
    }
    const showHeader = i > 0 || s.headerFirstPage;
    const rv = pg.items.some(it => it.para.rev);
    html += `<div class="print-page${opts.revColors && rv ? ' revpage' : ''}" ${opts.revColors && rv ? `style="background:${revColor(pg.items.find(it => it.para.rev).para.rev)}33"` : ''}>${wm}
      <div class="ph">${showHeader ? SP.esc(SP.formatHF(s.header, pg.label, pages.length)) : ''}</div>
      <div class="pbody">${body}</div>
      <div class="pf">${SP.esc(SP.formatHF(s.footer, pg.label, pages.length))}</div></div>`;
  });
  return { html, pages };
};

/* fractional page position (0 = top of page 1) for every paragraph; outline elements take the
   position of the next printed paragraph */
let posCache = { key: null };
SP.positions = () => {
  const key = SP.doc.modified + ':' + SP.doc.paras.length;
  if (posCache.key === key && posCache.doc === SP.doc) return posCache;
  const cap = SP.doc.settings.linesPerPage || 54;
  const pages = SP.paginate(SP.doc.paras);
  const pos = new Map();
  pages.forEach((pg, i) => { let y = 0; pg.items.forEach(it => { y += it.sb || 0; if (!pos.has(it.para.id)) pos.set(it.para.id, i + y / cap); y += it.lines ? it.lines.length : 1; }); });
  const total = Math.max(1, pages.length);
  let next = total;
  for (let i = SP.doc.paras.length - 1; i >= 0; i--) { const p = SP.doc.paras[i]; if (pos.has(p.id)) next = pos.get(p.id); else pos.set(p.id, next); }
  posCache = { key, doc: SP.doc, pos, pages, total };
  return posCache;
};

SP.printDocument = (opts = {}) => {
  const { html } = SP.renderPrint(opts);
  const pr = SP.$('#print-root'); pr.innerHTML = html;
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove('printing'); pr.innerHTML = ''; }, 500); }, 80);
};
})();
