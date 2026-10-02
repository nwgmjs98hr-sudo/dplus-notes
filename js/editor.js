// Line editor: shows a list of entries (one per line) and turns into a rich text field when tapped.
// On save the lines are matched back to entries, so every line stays its own synced document.

import { S, put, del, newId, entriesFor, COLORS } from './store.js';
import { parseTime, extractDates, esc, richHtml, plain } from './util.js';
import { RichText } from './rich.js';

let lastLP = 0;
export const lpRecently = () => Date.now() - lastLP < 700;

export function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

// Long press (touch), long click or right click on elements matching selector.
export function attachLongPress(root, selector, cb) {
  let timer = null, sx = 0, sy = 0, target = null;
  const clear = () => { clearTimeout(timer); timer = null; };
  const begin = (t, x, y) => {
    target = t; sx = x; sy = y; clear();
    timer = setTimeout(() => { timer = null; lastLP = Date.now(); try { navigator.vibrate?.(12); } catch {} cb(target); }, 480);
  };
  const pick = e => { const t = e.target.closest?.(selector); return t && root.contains(t) ? t : null; };
  root.addEventListener('touchstart', e => { const t = pick(e); if (t && e.touches.length === 1) begin(t, e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  root.addEventListener('touchmove', e => { if (timer && (Math.abs(e.touches[0].clientX - sx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8)) clear(); }, { passive: true });
  root.addEventListener('touchend', e => { clear(); if (lpRecently() && e.cancelable) e.preventDefault(); });
  root.addEventListener('touchcancel', clear);
  root.addEventListener('mousedown', e => { if (e.button !== 0) return; const t = pick(e); if (t) begin(t, e.clientX, e.clientY); });
  root.addEventListener('mousemove', e => { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) clear(); });
  root.addEventListener('mouseup', clear);
  root.addEventListener('mouseleave', clear);
  root.addEventListener('contextmenu', e => {
    const t = pick(e); if (!t) return;
    e.preventDefault(); clear();
    if (lpRecently()) return;
    lastLP = Date.now(); cb(t);
  });
}

function lineHtml(e) {
  let t = e.t || '', pre = '';
  if (/^[☐☑] /.test(t)) { pre = `<button class="le-chk${t[0] === '☑' ? ' on' : ''}" type="button" aria-label="Toggle"></button>`; t = t.slice(2); }
  else if (/^• /.test(t)) { pre = '<span class="le-bul">•</span>'; t = t.slice(2); }
  const dot = e.c ? `<i class="le-dot" style="background:${COLORS[e.c] || COLORS.x}"></i>` : '';
  return `<div class="le-line${e.x ? ' x' : ''}" data-id="${e.id}">${dot}${pre}<span class="le-t">${richHtml(t) || '&nbsp;'}</span>${e.imp ? '<b class="le-imp">!</b>' : ''}</div>`;
}

// Matches new lines to existing entries: exact text first, then by position. Returns ids per item.
function reconcile(old, items, base) {
  const used = new Set(), assign = [];
  items.forEach((it, i) => { const e = old.find(x => !used.has(x.id) && x.t === it.t); if (e) { used.add(e.id); assign[i] = e; } });
  const rest = old.filter(e => !used.has(e.id));
  let r = 0;
  items.forEach((it, i) => { if (!assign[i] && r < rest.length) { assign[i] = rest[r++]; used.add(assign[i].id); } });
  old.forEach(e => { if (!used.has(e.id)) del('entries', e.id); });
  return items.map((it, i) => {
    const e = assign[i];
    if (!e) return put('entries', newId(), { ...base, t: it.t, o: it.o });
    if (e.t !== it.t || e.o !== it.o) put('entries', e.id, { t: it.t, o: it.o });
    return e.id;
  });
}

export class LineEditor {
  // o: { k, s, filter, moveTime, placeholder, onTimeMoved(id), onDate(id, found, editor), onLongPress(entry), onEditEnd(editor) }
  constructor(o) {
    this.o = o; this.editing = false; this.rt = null; this.timer = null; this.owned = null;
    this.el = document.createElement('div');
    this.el.className = 'le';
    this.el.addEventListener('click', e => this.onClick(e));
    attachLongPress(this.el, '.le-line', t => { if (this.editing) return; const e = S.entries.get(t.dataset.id); if (e) o.onLongPress?.(e); });
    this.render();
  }
  list() { const f = this.o.filter; return entriesFor(this.o.k, this.o.s).filter(e => !f || f(e)); }
  isEmpty() { return !this.editing && this.list().length === 0; }

  render() {
    if (this.editing) return;
    const L = this.list();
    this.el.innerHTML = L.length ? L.map(lineHtml).join('')
      : (this.o.placeholder ? `<div class="le-empty">${esc(this.o.placeholder)}</div>` : '');
  }

  onClick(ev) {
    if (this.editing || lpRecently()) return;
    const chk = ev.target.closest('.le-chk');
    if (chk) {
      const id = chk.closest('.le-line').dataset.id, e = S.entries.get(id);
      if (e) put('entries', id, { t: (e.t[0] === '☑' ? '☐' : '☑') + e.t.slice(1) });
      return;
    }
    const line = ev.target.closest('.le-line');
    if (line) this.edit(this.list().findIndex(e => e.id === line.dataset.id));
    else this.edit(-1, true);
  }

  // idx: line to put the caret on (-1 = end). newLine: start a fresh line at the end.
  edit(idx = -1, newLine = false) {
    if (this.editing) { this.rt.focus(); return; }
    const L = this.list();
    this.editing = true;
    this.owned = new Set(L.map(e => e.id));
    const rt = this.rt = new RichText({
      value: L.map(e => e.t).join('\n') + (newLine && L.length ? '\n' : ''),
      placeholder: this.o.placeholder && this.o.placeholder !== '—' ? this.o.placeholder : '',
      onLine: (line, i, isList) => this.lineDone(line, i, isList),
      onInput: () => this.later(),
      onBlur: () => this.finish(),
    });
    this.el.innerHTML = ''; this.el.appendChild(rt.el);
    rt.focus();
    rt.caretToLineEnd(idx >= 0 ? idx : -1);
  }

  isLit(line) { for (const id of this.owned || []) { const e = S.entries.get(id); if (e && e.lit && e.t === line) return true; } return false; }
  movable(line) { return this.o.moveTime && parseTime(line) && !this.isLit(line); }

  lineDone(line, i, isList) {
    if (!isList && this.movable(line)) {
      this.rt.removeLine(i);
      this.handOff(line, i);
      this.save();
      return;
    }
    if (this.o.onDate) {
      const p = plain(line);
      const f = extractDates(isList ? p.slice(2) : p);
      if (f) { const map = this.save(); const id = map[i]; if (id) setTimeout(() => this.o.onDate(id, f, this), 0); }
    }
  }

  handOff(line, idx) {
    const id = put('entries', newId(), { k: this.o.k, s: this.o.s, t: line, o: idx * 10 - 5 });
    this.o.onTimeMoved?.(id);
  }

  later() { clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 800); }

  // Writes the field back to entries. Returns line index -> entry id.
  save() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.rt) return [];
    const lines = this.rt.lines();
    let n = lines.length; while (n > 0 && !plain(lines[n - 1]).trim()) n--;
    const items = [], lineOf = [];
    for (let i = 0; i < n; i++) {
      if (this.movable(lines[i])) continue; // a time line in progress is not saved until Enter / leaving
      items.push({ t: lines[i], o: i * 10 }); lineOf.push(i);
    }
    const old = [...this.owned].map(id => S.entries.get(id)).filter(e => e && e.k === this.o.k && e.s === this.o.s);
    const ids = reconcile(old, items, { k: this.o.k, s: this.o.s });
    this.owned = new Set([...[...this.owned].filter(id => S.entries.has(id)), ...ids]);
    const map = []; lineOf.forEach((li, j) => { map[li] = ids[j]; });
    return map;
  }

  finish() {
    if (!this.editing) return;
    const rt = this.rt;
    if (this.o.moveTime) {
      const keep = [], moved = [];
      rt.lines().forEach((l, i) => (this.movable(l) ? moved.push([l, i]) : keep.push(l)));
      if (moved.length) { rt.render(keep); moved.forEach(([l, i]) => this.handOff(l, i)); }
    }
    this.save();
    this.editing = false; this.rt = null; this.owned = null;
    this.render();
    this.o.onEditEnd?.(this);
  }

  stop() { if (this.editing) { const el = this.rt.el; this.finish(); el.blur(); } }
}
