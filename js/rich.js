// Rich text field: a contenteditable box with one <div> per line and highlighter marks.
// Its value is plain text with highlights stored inline as ⟦c|text⟧ (see util.js).
// Selecting text shows a small color bar; Enter keeps the list and line behaviour of the app.

import { richHtml, plain } from './util.js';

const COLORS = { r: '#E5655C', o: '#D9A14B', b: '#5B8DEF', g: '#7FBF7A', p: '#A98BD8', x: '#8C8D85' };
const NAMES = { r: 'Red – important', o: 'Orange – deadline', b: 'Blue – service', g: 'Green – training', p: 'Purple – personal', x: 'Grey – info' };
const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

/* ---------- text model: markup <-> characters ---------- */
function toChars(t) {
  const a = []; let last = 0;
  const push = (s, c) => { for (let i = 0; i < s.length; i++) a.push([s[i], c]); };
  for (const m of t.matchAll(/⟦([a-z])\|([^⟧]*)⟧/g)) { push(t.slice(last, m.index), null); push(m[2], m[1]); last = m.index + m[0].length; }
  push(t.slice(last), null);
  return a;
}
function fromChars(a) {
  let out = '', i = 0;
  while (i < a.length) {
    const c = a[i][1]; let s = '';
    while (i < a.length && a[i][1] === c) { s += a[i][0]; i++; }
    s = s.replace(/[⟦⟧]/g, '');
    out += c ? `⟦${c}|${s}⟧` : s;
  }
  return out;
}

/* ---------- DOM <-> lines ---------- */
function scan(root) {
  const lines = []; let cur = null;
  const need = block => { if (!cur) { cur = { nodes: [], block }; lines.push(cur); } return cur; };
  const isLast = (n, box) => { let x = n; while (x && x !== box) { if (x.nextSibling) return false; x = x.parentNode; } return true; };
  const walk = (n, block) => {
    for (const ch of [...n.childNodes]) {
      if (ch.nodeType === 3) need(block).nodes.push(ch);
      else if (ch.nodeType !== 1) continue;
      else if (ch.nodeName === 'BR') { need(block); if (!isLast(ch, block || root)) cur = null; }
      else if (BLOCK.has(ch.nodeName)) { cur = null; const before = lines.length; walk(ch, ch); if (lines.length === before) need(ch); cur = null; }
      else walk(ch, block);
    }
  };
  walk(root, null);
  return lines;
}
const colorOf = (n, root) => { for (let e = n.parentElement; e && e !== root; e = e.parentElement) if (e.dataset?.c) return e.dataset.c; return null; };
function lineMarkup(root, ln) {
  const a = [];
  for (const t of ln.nodes) { const c = colorOf(t, root), s = t.data.replace(/ /g, ' '); for (let i = 0; i < s.length; i++) a.push([s[i], c]); }
  return fromChars(a);
}

function toPos(root, lines, node, off) {
  if (node.nodeType === 3) {
    for (let l = 0; l < lines.length; l++) { let acc = 0; for (const t of lines[l].nodes) { if (t === node) return { l, o: acc + Math.min(off, t.length) }; acc += t.length; } }
  }
  const r = document.createRange();
  try { r.setStart(node, off); } catch { return null; }
  r.collapse(true);
  for (let l = 0; l < lines.length; l++) {
    const L = lines[l]; let acc = 0;
    for (const t of L.nodes) { if (r.comparePoint(t, 0) >= 0) return { l, o: acc }; acc += t.length; }
    const nx = lines[l + 1], first = nx && (nx.nodes[0] || nx.block);
    if (!nx || (first && r.comparePoint(first, 0) > 0)) return { l, o: acc };
  }
  return { l: 0, o: 0 };
}
function fromPos(root, lines, p) {
  const L = lines[Math.max(0, Math.min(p.l, lines.length - 1))];
  if (!L) return { node: root, off: 0 };
  let acc = 0;
  for (const t of L.nodes) { if (p.o <= acc + t.length) return { node: t, off: p.o - acc }; acc += t.length; }
  if (L.nodes.length) { const t = L.nodes[L.nodes.length - 1]; return { node: t, off: t.length }; }
  return { node: L.block || root, off: 0 };
}

/* ---------- color bar (one for the whole app) ---------- */
let bar = null, barFor = null;
function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'cbar';
  bar.innerHTML = Object.keys(COLORS).map(k => `<button type="button" class="cb" data-c="${k}" style="background:${COLORS[k]}" aria-label="${NAMES[k]}"></button>`).join('')
    + '<button type="button" class="cb clr" data-c="" aria-label="Remove color">×</button>';
  const act = e => { const b = e.target.closest('[data-c]'); if (!b) return; e.preventDefault(); barFor?.applyColor(b.dataset.c || null); };
  bar.addEventListener('pointerdown', act);
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  document.body.appendChild(bar);
  return bar;
}
const hideBar = () => { if (bar) bar.style.display = 'none'; barFor = null; };
document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (!s || !s.rangeCount || s.isCollapsed) return hideBar();
  const r = s.getRangeAt(0);
  const c = r.commonAncestorContainer, host = (c.nodeType === 1 ? c : c.parentElement)?.closest('.rt');
  if (!host?._rt || !host.isContentEditable || !host.isConnected || document.activeElement !== host) return hideBar();
  barFor = host._rt;
  const b = ensureBar();
  b.style.display = 'flex';
  const rects = r.getClientRects(), rect = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
  const top0 = (rects[0] || rect).top;
  const vv = window.visualViewport, bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let top = rect.bottom + 16;
  if (top + bh > bottom - 6) top = Math.max(6, top0 - bh - 16);
  const left = Math.max(8, Math.min(innerWidth - bw - 8, rect.left + rect.width / 2 - bw / 2));
  b.style.top = top + 'px'; b.style.left = left + 'px';
});

/* ---------- the field ---------- */
export class RichText {
  // o: { value, placeholder, cls, onLine(markupLine, index, isList), onInput(), onBlur() }
  constructor(o = {}) {
    this.o = o;
    const el = this.el = document.createElement('div');
    el.className = 'rt' + (o.cls ? ' ' + o.cls : '');
    el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('autocapitalize', 'sentences');
    if (o.placeholder) el.dataset.ph = o.placeholder;
    el._rt = this;
    this.render((o.value || '').split('\n'));
    el.addEventListener('input', e => this.onInput(e));
    el.addEventListener('paste', e => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    el.addEventListener('blur', () => { if (barFor === this) hideBar(); this.o.onBlur?.(); });
  }

  lines() { const L = scan(this.el); return L.length ? L.map(ln => lineMarkup(this.el, ln)) : ['']; }
  value() { return this.lines().join('\n'); }
  setValue(v) { this.render((v || '').split('\n')); }
  render(lines) {
    this.el.innerHTML = (lines.length ? lines : ['']).map(l => `<div>${richHtml(l) || '<br>'}</div>`).join('');
    this.updEmpty();
  }
  updEmpty() { const v = this.el.textContent; this.el.classList.toggle('empty', !v); }

  focus() { this.el.focus({ preventScroll: true }); }
  caret() { const s = getSelection(); if (!s.rangeCount || !this.el.contains(s.focusNode)) return null; return toPos(this.el, scan(this.el), s.focusNode, s.focusOffset); }
  setSel(a, b = a) {
    const L = scan(this.el), x = fromPos(this.el, L, a), y = fromPos(this.el, L, b);
    const s = getSelection(), r = document.createRange();
    try { r.setStart(x.node, x.off); r.setEnd(y.node, y.off); s.removeAllRanges(); s.addRange(r); } catch {}
  }
  caretToLineEnd(l) { const L = this.lines(); const i = l < 0 ? L.length - 1 : Math.min(l, L.length - 1); this.setSel({ l: i, o: plain(L[i]).length }); }

  removeLine(i) {
    const L = this.lines(); L.splice(i, 1);
    this.render(L.length ? L : ['']);
    this.setSel({ l: Math.min(i, L.length - 1), o: 0 });
  }

  applyColor(c) {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0); if (!this.el.contains(r.commonAncestorContainer)) return;
    const sc = scan(this.el);
    const a = toPos(this.el, sc, r.startContainer, r.startOffset), b = toPos(this.el, sc, r.endContainer, r.endOffset);
    if (!a || !b) return;
    const md = sc.map(ln => lineMarkup(this.el, ln));
    for (let l = a.l; l <= b.l; l++) {
      const ch = toChars(md[l]);
      const from = l === a.l ? a.o : 0, to = l === b.l ? b.o : ch.length;
      for (let i = from; i < to; i++) ch[i][1] = c;
      md[l] = fromChars(ch);
    }
    this.render(md);
    this.setSel(a, b);
    this.o.onInput?.();
  }

  onInput(e) {
    if (e.isComposing) return;
    const t = e.inputType;
    if (t === 'insertParagraph' || t === 'insertLineBreak') this.afterEnter();
    else if (t === 'insertText' && e.data === ' ') this.listPrefix();
    this.updEmpty();
    this.o.onInput?.();
  }

  // "- " → "• ", "[] " → "☐ " at the start of a line
  listPrefix() {
    const p = this.caret(); if (!p) return;
    const L = this.lines(), ch = toChars(L[p.l] || ''), head = ch.slice(0, p.o).map(x => x[0]).join('');
    let rep = null;
    if (head === '- ' || head === '* ') rep = '• ';
    else if (head === '[] ' || head === '[ ] ') rep = '☐ ';
    if (!rep) return;
    const rest = ch.slice(p.o);
    L[p.l] = rep + fromChars(rest);
    this.render(L);
    this.setSel({ l: p.l, o: rep.length });
  }

  afterEnter() {
    const p = this.caret(); if (!p || p.l < 1) return;
    const L = this.lines(), i = p.l - 1, prev = L[i], pp = plain(prev);
    const m = pp.match(/^(• |☐ |☑ )(.*)$/);
    if (m) {
      if (!m[2].trim()) {
        L[i] = '';
        if (!plain(L[p.l] || '')) L.splice(p.l, 1);
        this.render(L); this.setSel({ l: i, o: 0 });
      } else {
        const pre = m[1] === '☑ ' ? '☐ ' : m[1];
        L[p.l] = pre + (L[p.l] || '');
        this.render(L); this.setSel({ l: p.l, o: pre.length });
        this.o.onLine?.(prev, i, true);
      }
      return;
    }
    this.o.onLine?.(prev, i, false);
  }
}
