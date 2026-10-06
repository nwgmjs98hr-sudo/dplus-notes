import * as U from './util.js';
import {
  S, start, subscribe, put, del, newId, entriesFor, isTime, timeItems, dayImportant, dayHasEntries,
  recurringOn, nextO, stripId, isSynced, markSynced, signOut, isImp, noteImp, COLORS, COLOR_KEYS, COLOR_NAMES,
} from './store.js';
import { LineEditor, attachLongPress, lpRecently } from './editor.js';
import { RichText } from './rich.js';
import { saveFile, fileBlob, deleteFile, prepareImage, fmtSize, usage, QUOTA } from './files.js';
import { pickFile, cropImage, recognize, prepareScanner, scannerReady } from './scan.js';
import { CONFIG, VERSION, FIREBASE_VERSION } from './config.js';

const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = U.esc;
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ui = { page: 'days', today: U.todayStr(), newDay: null };
const updaters = new Set();
const inWin = d => { const x = U.diffDays(ui.today, d); return x >= 0 && x <= 4; };
const colorOf = c => COLORS[c] || COLORS.x;
const blurActive = () => { const a = document.activeElement; if (a && a !== document.body) a.blur(); };
const editingIn = el => { const a = document.activeElement; return !!(a && el && el.contains(a) && (/^(TEXTAREA|INPUT)$/.test(a.tagName) || a.isContentEditable)); };
const pl = t => U.plain(t);
const rich = t => U.richHtml(t);
const dayLabel = d => `${U.dowShort(d)} ${U.fmtDMY(d)}`;
const keyLabel = e => U.isWeekKey(e.k) ? `Week ${+e.k.slice(6)}` : U.isDateKey(e.k) ? dayLabel(e.k) : '';
const sortKeyOf = e => U.isWeekKey(e.k) ? U.weekMonday(e.k) + '~' : e.k || '';
const noteTitle = n => (n.title || '').trim() || pl(n.body).split('\n').find(l => l.trim()) || 'New note';
// Is a schedule item still relevant at 'now' (HHMM)? Overnight items run until midnight on their first day.
const notOver = (i, now) => i.carry ? i.end > now : i.end ? (i.end > i.start ? i.end > now : true) : i.start >= now;
const running = (i, now) => i.carry ? i.end > now : !!i.end && i.start <= now && (i.end > i.start ? now < i.end : true);
const WD = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

const svg = p => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  list: svg('<path d="M9 6h11M9 12h11M9 18h7"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  folderPlus: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>'),
  notePlus: svg('<path d="M6 3h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M12 11v6M9 14h6"/>'),
  archive: svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  clip: svg('<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>'),
  doc: svg('<path d="M6 3h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
};

/* ---------- toast with undo ---------- */
let toastTimer;
function toast(text, undo) {
  const t = $('#toast'); if (!t) return;
  $('span', t).textContent = text;
  const b = $('button', t);
  b.hidden = !undo;
  b.onclick = () => { t.classList.remove('show'); undo?.(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2500);
}
const toastMoved = id => toast('Moved to schedule', () => put('entries', id, { lit: true }));

/* ---------- sheets ---------- */
function openSheet({ html, cls = '', mount, onClose }) {
  const layer = $('#layer');
  const bd = mk('div', 'bd'), sh = mk('div', 'sheet ' + cls, '<div class="grab"></div>' + html);
  layer.append(bd, sh);
  sh.getBoundingClientRect();
  bd.classList.add('in'); sh.classList.add('in');
  let closed = false;
  const api = {
    el: sh, update: null,
    close() {
      if (closed) return; closed = true;
      blurActive(); onClose?.(); if (api.update) updaters.delete(api.update);
      bd.classList.remove('in'); sh.classList.remove('in');
      setTimeout(() => { bd.remove(); sh.remove(); }, 320);
    },
  };
  bd.addEventListener('click', api.close);
  mount?.(sh, api);
  if (api.update) updaters.add(api.update);
  return api;
}

function inputSheet(title, value, onOk) {
  openSheet({
    cls: 'menu',
    html: `<div class="sh-t">${esc(title)}</div><input class="field" style="margin-top:12px" value="${esc(value || '')}" enterkeyhint="done">
      <div class="row-end"><button class="pill" type="button" data-x>Cancel</button><button class="pill accent" type="button" data-ok>Save</button></div>`,
    mount(sh, api) {
      const i = $('input', sh); i.focus(); i.select?.();
      const ok = () => { const v = i.value.trim(); api.close(); if (v) onOk(v); };
      i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
      $('[data-ok]', sh).onclick = ok; $('[data-x]', sh).onclick = api.close;
    },
  });
}

function confirmSheet(text, okLabel, onOk) {
  openSheet({
    cls: 'menu',
    html: `<div class="sh-t" style="font-size:16px">${esc(text)}</div>
      <div class="row-end"><button class="pill" type="button" data-x>Cancel</button><button class="pill red" type="button" data-ok>${esc(okLabel)}</button></div>`,
    mount(sh, api) { $('[data-ok]', sh).onclick = () => { api.close(); onOk(); }; $('[data-x]', sh).onclick = api.close; },
  });
}

const colorHint = '<div class="m-hint">Red = important. To color only part of a text, select it while writing.</div>';
const colorRow = cur => `<div class="m-colors">${COLOR_KEYS.map(k => `<button class="sw${cur === k ? ' on' : ''}" data-c="${k}" style="background:${COLORS[k]}" type="button" aria-label="${COLOR_NAMES[k]}"></button>`).join('')}<button class="sw none${!cur ? ' on' : ''}" data-c="" type="button" aria-label="No color"></button></div>`;

/* ---------- long-press menu for any entry ---------- */
function entryMenu(e) {
  if (!e) return;
  blurActive();
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">${esc(pl(U.firstLine(e.t))) || '(empty line)'}</div>
      ${colorRow(e.c)}${colorHint}
      ${e.imp ? '<button class="m-btn" data-a="imp" type="button">Remove old important mark</button>' : ''}
      <button class="m-btn" data-a="x" type="button">${e.x ? 'Remove strike-through' : 'Strike through'}</button>
      <div class="m-row"><span>Move to</span>${[0, 1, 2, 3, 4].map(n => `<button class="chip" data-mv="${n}" type="button">D+${n}</button>`).join('')}</div>
      <button class="m-btn" data-a="rep" type="button">Make repeating…</button>
      <button class="m-btn danger" data-a="del" type="button">Delete</button>`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        const cur = S.entries.get(e.id); if (!cur) { api.close(); return; }
        if (b.dataset.c !== undefined) { put('entries', e.id, { c: b.dataset.c || null, imp: false }); api.close(); return; }
        if (b.dataset.mv) {
          const n = +b.dataset.mv, d = U.addDays(ui.today, n), old = { k: cur.k, s: cur.s, o: cur.o };
          put('entries', e.id, { k: d, s: 'day', o: nextO(d, 'day') });
          api.close(); toast(`Moved to D+${n}`, () => put('entries', e.id, old)); return;
        }
        const a = b.dataset.a;
        if (a === 'imp') put('entries', e.id, { imp: false });
        else if (a === 'x') put('entries', e.id, { x: !cur.x });
        else if (a === 'del') { const copy = stripId(cur); del('entries', e.id); toast('Deleted', () => put('entries', e.id, copy)); }
        else if (a === 'rep') { api.close(); openRecurring(null, cur); return; }
        api.close();
      });
    },
  });
}

/* ---------- date found: keep / move / both ---------- */
function datePrompt(entryId, found) {
  const e = S.entries.get(entryId); if (!e) return;
  const text = found.rest || pl(e.t);
  const many = found.dates.length > 1;
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">Date found: ${found.dates.map(dayLabel).join(', ')}</div>
      <div class="m-q">“${esc(text)}”</div>
      <button class="m-btn" data-a="keep" type="button">Keep here</button>
      <button class="m-btn" data-a="move" type="button">Move to ${many ? 'these days' : 'that day'}</button>
      <button class="m-btn" data-a="both" type="button">Both: keep here and copy</button>`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        api.close();
        if (a === 'keep') return;
        const cur = S.entries.get(entryId);
        const made = found.dates.map(d => put('entries', newId(), { k: d, s: inWin(d) ? 'day' : 'plan', t: text, o: nextO(d, inWin(d) ? 'day' : 'plan'), c: cur?.c || null }));
        let copy = null;
        if (a === 'move' && cur) { copy = stripId(cur); del('entries', entryId); }
        const where = many ? `${found.dates.length} days` : dayLabel(found.dates[0]);
        toast(a === 'move' ? `Moved to ${where}` : `Copied to ${where}`, () => { made.forEach(id => del('entries', id)); if (copy) put('entries', entryId, copy); });
      });
    },
  });
}

/* ---------- repeating entries ---------- */
function openRecurring(r, fromEntry) {
  const wd = new Set(r?.wd || [1, 2, 3, 4, 5]);
  let c = r?.c ?? fromEntry?.c ?? null;
  openSheet({
    cls: 'menu',
    html: `<div class="sh-head"><div class="sh-t">${r ? 'Repeating entry' : 'Make repeating'}</div><button class="pill accent" type="button" data-save>Save</button></div>
      <div class="ps-slot" style="min-height:64px"></div>
      <div class="lab">Days</div>
      <div class="chips" data-wd>${WD.map(([n, l]) => `<button class="chip${wd.has(n) ? ' on' : ''}" data-d="${n}" type="button">${l}</button>`).join('')}</div>
      <div class="chips" style="margin-top:6px"><button class="chip" data-q="all" type="button">Every day</button><button class="chip" data-q="wk" type="button">Mon–Fri</button></div>
      <div class="lab">Color</div>${colorRow(c)}
      ${r ? '<button class="m-btn danger" data-del type="button">Delete repeating entry</button>' : ''}`,
    mount(sh, api) {
      const rt = new RichText({ value: r ? r.t : (fromEntry?.t || ''), placeholder: '0630 PT', cls: 'ps-ta' });
      $('.ps-slot', sh).replaceWith(rt.el);
      const paint = () => $$('[data-d]', sh).forEach(b => b.classList.toggle('on', wd.has(+b.dataset.d)));
      sh.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.d !== undefined) { const n = +b.dataset.d; wd.has(n) ? wd.delete(n) : wd.add(n); paint(); }
        else if (b.dataset.q) { wd.clear(); (b.dataset.q === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).forEach(n => wd.add(n)); paint(); }
        else if (b.dataset.c !== undefined) { c = b.dataset.c || null; $$('.sw', sh).forEach(s => s.classList.toggle('on', s === b)); }
        else if (b.hasAttribute('data-del')) {
          const copy = stripId(r); del('recurring', r.id); api.close();
          toast('Repeating entry deleted', () => put('recurring', r.id, copy));
        } else if (b.hasAttribute('data-save')) {
          const t = rt.value().trim();
          if (!pl(t).trim()) { toast('Write something first'); return; }
          if (!wd.size) { toast('Pick at least one day'); return; }
          const days = [...wd].sort();
          if (r) put('recurring', r.id, { t, wd: days, c });
          else {
            const id = put('recurring', newId(), { t, wd: days, c, from: fromEntry && U.isDateKey(fromEntry.k) ? fromEntry.k : ui.today });
            if (fromEntry) { const copy = stripId(fromEntry); del('entries', fromEntry.id); toast('Now repeating', () => { del('recurring', id); put('entries', fromEntry.id, copy); }); }
          }
          api.close();
        }
      });
    },
  });
}

/* ---------- quick entry (+) ---------- */
function openPlus() {
  blurActive();
  let target = { t: 'd', n: ui.page === 'days' ? Math.max(0, Days.offset) : 0 }, explicit = false, rep = 'none', color = null;
  const wd = new Set();
  openSheet({
    cls: 'plus',
    html: `<div class="sh-head"><div class="sh-t">New entry</div><div class="row">
        <button class="icon-btn" type="button" data-scan="cam" aria-label="Scan text with the camera">${I.camera}</button>
        <button class="icon-btn" type="button" data-scan="lib" aria-label="Scan text from a picture">${I.image}</button>
        <button class="pill accent" type="button" data-save>Save</button></div></div>
      <div class="ps-slot"></div>
      <div class="lab">Color of the whole entry <span class="muted">· or select text to color a part</span></div>${colorRow(null)}
      <div class="lab" style="margin-top:2px">Where</div>
      <div class="chips" data-tg>
        ${[0, 1, 2, 3, 4].map(i => `<button class="chip" data-t="d" data-n="${i}" type="button">D+${i}</button>`).join('')}
        <button class="chip" data-t="w" data-n="1" type="button">W+1</button><button class="chip" data-t="w" data-n="2" type="button">W+2</button>
        <label class="chip" data-t="date"><span>Date</span><input type="date" aria-label="Date"></label>
      </div>
      <div class="lab">Repeat</div>
      <div class="chips" data-rp><button class="chip on" data-r="none" type="button">No</button><button class="chip" data-r="daily" type="button">Every day</button><button class="chip" data-r="wk" type="button">Mon–Fri</button><button class="chip" data-r="custom" type="button">Pick days</button></div>
      <div class="chips" data-wds hidden style="margin-top:6px">${WD.map(([n, l]) => `<button class="chip" data-d="${n}" type="button">${l}</button>`).join('')}</div>`,
    mount(sh, api) {
      const dateIn = $('input[type=date]', sh);
      const rt = new RichText({ placeholder: '0900 Text, a note, or - for a list', cls: 'ps-ta' });
      $('.ps-slot', sh).replaceWith(rt.el);
      rt.focus();
      const paint = () => {
        $$('[data-tg] .chip', sh).forEach(b => b.classList.toggle('on', b.dataset.t === target.t && (b.dataset.t === 'date' || +b.dataset.n === target.n)));
        $$('[data-rp] .chip', sh).forEach(b => b.classList.toggle('on', b.dataset.r === rep));
        $('[data-wds]', sh).hidden = rep !== 'custom';
        $$('[data-wds] .chip', sh).forEach(b => b.classList.toggle('on', wd.has(+b.dataset.d)));
      };
      paint();
      dateIn.addEventListener('change', () => { if (dateIn.value) { target = { t: 'date' }; explicit = true; paint(); } });
      sh.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.t) { target = { t: b.dataset.t, n: +b.dataset.n }; explicit = true; if (target.t === 'w') rep = 'none'; paint(); }
        else if (b.dataset.r) { rep = b.dataset.r; if (rep !== 'none' && target.t === 'w') target = { t: 'd', n: 0 }; paint(); }
        else if (b.dataset.d !== undefined) { const n = +b.dataset.d; wd.has(n) ? wd.delete(n) : wd.add(n); paint(); }
        else if (b.dataset.c !== undefined) { color = b.dataset.c || null; $$('.sw', sh).forEach(x => x.classList.toggle('on', x === b)); }
        else if (b.dataset.scan) scanInto(pickFile({ camera: b.dataset.scan === 'cam' }), text => {
          const cur = rt.value().replace(/\s+$/, '');
          rt.setValue(cur ? cur + '\n' + text : text);
        });
        else if (b.hasAttribute('data-save')) save();
      });
      function save() {
        const lines = rt.lines().map(l => l.replace(/\s+$/, '')).filter(l => pl(l).trim());
        if (!lines.length) { api.close(); return; }
        if (target.t === 'date' && !dateIn.value) { toast('Pick a date first'); return; }
        const baseDay = target.t === 'date' ? dateIn.value : target.t === 'd' ? U.addDays(ui.today, target.n) : null;
        const made = [];
        let msg;
        if (rep !== 'none') {
          const days = rep === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : rep === 'wk' ? [1, 2, 3, 4, 5] : [...wd].sort();
          if (!days.length) { toast('Pick at least one day'); return; }
          lines.forEach(l => made.push(['recurring', put('recurring', newId(), { t: l, wd: days, c: color, from: baseDay || ui.today })]));
          msg = 'Repeating entry saved';
        } else {
          lines.forEach((l, i) => {
            const f = !explicit && U.extractDates(pl(l));
            if (f) { f.dates.forEach(d => { const s = inWin(d) ? 'day' : 'plan'; made.push(['entries', put('entries', newId(), { k: d, s, t: f.rest || l, o: nextO(d, s), c: color })]); }); return; }
            let k, s;
            if (target.t === 'w') { k = U.weekKey(U.addDays(U.monday(ui.today), 7 * target.n)); s = 'week'; }
            else { k = baseDay; s = target.t === 'd' || inWin(k) ? 'day' : 'plan'; }
            made.push(['entries', put('entries', newId(), { k, s, t: l, o: nextO(k, s) + i, c: color })]);
          });
          msg = target.t === 'w' ? `Saved to W+${target.n}` : target.t === 'd' ? `Saved to D+${target.n}` : `Saved to ${dayLabel(baseDay)}`;
        }
        api.close();
        toast(msg, () => made.forEach(([c, id]) => del(c, id)));
      }
    },
  });
}

/* ---------- busy overlay ---------- */
function busy(msg) {
  const v = mk('div', 'busy', `<div class="busy-box"><i class="spin"></i><span></span></div>`);
  $('span', v).textContent = msg;
  document.body.appendChild(v);
  return { set: m => { $('span', v).textContent = m; }, close: () => v.remove() };
}

/* ---------- scan text from a photo ---------- */
// filePromise comes from pickFile() started directly in the tap handler.
async function scanInto(filePromise, onText) {
  const file = await filePromise; if (!file) return;
  const cut = await cropImage(file, { title: 'Frame the text', ok: 'Read text' }); if (!cut) return;
  const b = busy('Starting the scanner…');
  try {
    const text = await recognize(cut.src, cut.crop, m => b.set(m));
    b.close();
    if (!text.trim()) { toast('No text found. Try a closer, sharper photo.'); return; }
    onText(text);
    toast('Text added – check it and edit if needed');
  } catch (e) { b.close(); toast(e.message || 'Scanning failed'); }
}

/* ---------- attachments ---------- */
const tileHtml = f => `<button class="att-t" data-fid="${f.id}" type="button">${f.thumb ? `<img src="${f.thumb}" alt="">` : `<span class="att-ic">${f.kind === 'pdf' ? 'PDF' : 'FILE'}</span>`}<span class="att-n">${esc(f.name)}</span><span class="att-s">${fmtSize(f.size)}</span></button>`;
const stripHtml = on => { const L = [...S.files.values()].filter(f => f.on === on).sort((a, b) => (a.u || 0) - (b.u || 0)); return L.length ? `<div class="att-strip scroll-x">${L.map(tileHtml).join('')}</div>` : ''; };
function wireStrip(el) {
  el.addEventListener('click', e => { if (lpRecently()) return; const t = e.target.closest('[data-fid]'); if (t) openFile(S.files.get(t.dataset.fid)); });
  attachLongPress(el, '[data-fid]', t => fileMenu(S.files.get(t.dataset.fid)));
}
const stamp = () => `${U.fmtDMY(U.todayStr())} ${U.nowHHMM()}`;

function attachMenu(on, onReadText) {
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">Attach</div>
      <button class="m-btn" data-a="doc" type="button"><span class="mi">${I.doc}</span><span>Scan a document<small>Page in grey, very small (about 150 KB)</small></span></button>
      <button class="m-btn" data-a="cam" type="button"><span class="mi">${I.camera}</span><span>Take a photo</span></button>
      <button class="m-btn" data-a="lib" type="button"><span class="mi">${I.image}</span><span>Choose a photo</span></button>
      <button class="m-btn" data-a="file" type="button"><span class="mi">${I.clip}</span><span>PDF or other file<small>Up to 10 MB</small></span></button>
      ${onReadText ? `<button class="m-btn" data-a="ocr" type="button"><span class="mi">${I.camera}</span><span>Scan text into this note</span></button>` : ''}`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        // the picker must open inside this tap
        const p = a === 'file' ? pickFile({ accept: 'application/pdf,image/*,.pdf' }) : pickFile({ camera: a === 'doc' || a === 'cam' || a === 'ocr' });
        api.close();
        if (a === 'ocr') scanInto(p, onReadText);
        else addAttachment(p, a, on);
      });
    },
  });
}

async function addAttachment(filePromise, how, on) {
  const file = await filePromise; if (!file) return;
  try {
    if (how === 'file' && !/^image\//.test(file.type)) {
      const b = busy('Saving…');
      try { await saveFile(file, { name: file.name, kind: /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? 'pdf' : 'file', on }); }
      finally { b.close(); }
      toast(`Saved · ${fmtSize(file.size)}`); return;
    }
    let src, crop = null, mode = 'photo';
    if (how === 'doc') {
      const cut = await cropImage(file, { title: 'Frame the page', ok: 'Save scan' }); if (!cut) return;
      src = cut.src; crop = cut.full ? null : cut.crop; mode = 'doc';
    } else src = await (await import('./files.js')).loadBitmap(file);
    const b = busy('Saving…');
    try {
      const img = await prepareImage(src, crop, mode);
      const name = mode === 'doc' ? `Scan ${stamp()}` : (how === 'cam' ? `Photo ${stamp()}` : (file.name || `Picture ${stamp()}`).replace(/\.(heic|heif|png|webp)$/i, '.jpg'));
      await saveFile(img.blob, { name, kind: mode === 'doc' ? 'doc' : 'image', w: img.w, h: img.h, thumb: img.thumb, on });
      b.close(); toast(`Saved · ${fmtSize(img.blob.size)}`);
    } catch (e) { b.close(); throw e; }
  } catch (e) { toast(e.message || 'Could not save the file'); }
}

async function shareFile(f) {
  try {
    const blob = await fileBlob(f);
    const name = /\.[a-z0-9]{2,4}$/i.test(f.name) ? f.name : f.name + (f.mime === 'image/jpeg' ? '.jpg' : f.kind === 'pdf' ? '.pdf' : '');
    const file = new File([blob], name, { type: f.mime });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = mk('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { if (e?.name !== 'AbortError') toast(offlineMsg(e)); }
}
const offlineMsg = e => (e?.message === 'missing' || !navigator.onLine) ? 'Not saved on this device yet. Open it once with internet.' : 'Could not open the file';

function fileMenu(f) {
  if (!f) return;
  const isImg = f.kind === 'image' || f.kind === 'doc';
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">${esc(f.name)} · ${fmtSize(f.size)}</div>
      <button class="m-btn" data-a="open" type="button">Open</button>
      <button class="m-btn" data-a="share" type="button">Share or save to the phone</button>
      <button class="m-btn" data-a="ren" type="button">Rename</button>
      ${isImg && f.on?.startsWith('note:') ? '<button class="m-btn" data-a="ocr" type="button">Read text from it into the note</button>' : ''}
      ${isImg && f.on?.startsWith('day:') ? '<button class="m-btn" data-a="ocr" type="button">Read text from it into the notes</button>' : ''}
      <button class="m-btn danger" data-a="del" type="button">Delete</button>`,
    mount(sh, api) {
      sh.addEventListener('click', async ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        api.close();
        if (a === 'open') openFile(f);
        if (a === 'share') shareFile(f);
        if (a === 'ren') inputSheet('Rename file', f.name, name => put('files', f.id, { name }));
        if (a === 'del') confirmSheet(`Delete “${f.name}”?`, 'Delete', () => { deleteFile(f); toast('File deleted'); });
        if (a === 'ocr') {
          const b = busy('Starting the scanner…');
          try {
            const { loadBitmap } = await import('./files.js');
            const src = await loadBitmap(await fileBlob(f));
            const text = await recognize(src, null, m => b.set(m));
            b.close();
            if (!text.trim()) { toast('No text found'); return; }
            if (f.on.startsWith('note:')) {
              const id = f.on.slice(5), n = S.notes.get(id); if (!n) return;
              put('notes', id, { body: ((n.body || '').replace(/\s+$/, '') + '\n' + text).replace(/^\n/, '') });
            } else {
              const d = f.on.slice(4); let o = nextO(d, 'day');
              text.split('\n').filter(l => l.trim()).forEach(l => { put('entries', newId(), { k: d, s: 'day', t: l, o }); o += 10; });
            }
            toast('Text added');
          } catch (e) { b.close(); toast(e.message === 'missing' ? offlineMsg(e) : (e.message || 'Scanning failed')); }
        }
      });
    },
  });
}

async function openFile(f) {
  if (!f) return;
  blurActive();
  const v = mk('div', 'full fv');
  v.innerHTML = `<div class="ne-head"><button class="back" type="button">${I.left}<span>Back</span></button><span class="ne-f">${esc(f.name)}</span><button class="icon-btn" type="button" data-share aria-label="Share or save">${I.share}</button></div>
    <div class="fv-body"><div class="fv-msg">Loading…</div></div>`;
  $('#layer').append(v);
  v.getBoundingClientRect(); v.classList.add('in');
  let url = null;
  const close = () => { v.classList.remove('in'); setTimeout(() => { v.remove(); if (url) URL.revokeObjectURL(url); }, 300); };
  $('.back', v).onclick = close;
  $('[data-share]', v).onclick = () => shareFile(f);
  const body = $('.fv-body', v);
  try {
    const blob = await fileBlob(f);
    url = URL.createObjectURL(blob);
    if (/^image\//.test(f.mime)) {
      body.innerHTML = `<div class="fv-zoom scroll"><img alt="" src="${url}"></div><div class="fv-hint">Double-tap to zoom</div>`;
      const z = $('.fv-zoom', body); let last = 0;
      const toggle = (x, y) => {
        const on = !z.classList.contains('zoomed'), r = z.getBoundingClientRect();
        const fx = (x - r.left + z.scrollLeft) / z.scrollWidth, fy = (y - r.top + z.scrollTop) / z.scrollHeight;
        z.classList.toggle('zoomed', on);
        if (on) { z.scrollLeft = fx * z.scrollWidth - r.width / 2; z.scrollTop = fy * z.scrollHeight - r.height / 2; }
      };
      z.addEventListener('dblclick', e => toggle(e.clientX, e.clientY));
      z.addEventListener('touchend', e => { const now = Date.now(); if (now - last < 300 && e.changedTouches[0]) { e.preventDefault(); toggle(e.changedTouches[0].clientX, e.changedTouches[0].clientY); } last = now; });
    } else if (f.kind === 'pdf') {
      body.innerHTML = `<iframe class="fv-pdf" title="${esc(f.name)}" src="${url}"></iframe><div class="row" style="justify-content:center;padding:10px"><a class="pill" href="${url}" target="_blank" rel="noopener">Open in viewer</a><button class="pill" type="button" data-sh>Share or save</button></div>`;
      $('[data-sh]', body).onclick = () => shareFile(f);
    } else {
      body.innerHTML = `<div class="fv-msg">${esc(f.name)} · ${fmtSize(f.size)}<br><br><button class="pill accent" type="button" data-sh>Share or save</button></div>`;
      $('[data-sh]', body).onclick = () => shareFile(f);
    }
  } catch (e) { body.innerHTML = `<div class="fv-msg">${esc(offlineMsg(e))}</div>`; }
}

// Delete attachments of something that was deleted, unless it comes back (undo) within a few seconds.
function dropFilesLater(on, stillGone) {
  setTimeout(() => { if (stillGone()) [...S.files.values()].filter(f => f.on === on).forEach(deleteFile); }, 6500);
}

/* ---------- settings (tap on sync status) ---------- */
function syncLabel() {
  const st = S.status;
  if (S.kind === 'demo') return ['● Demo', 'ing'];
  if (isSynced()) return ['● Synced', ''];
  if (st.online) return ['● Syncing…', 'ing'];
  let ls = '—';
  if (st.lastSync) { const d = new Date(st.lastSync); const ds = U.ymd(d); ls = (ds === ui.today ? '' : U.fmtDM(ds) + ' ') + U.hhmmOf(d); }
  return [`● Offline · last sync ${ls}`, 'off'];
}

// Is this device ready to start without internet?
async function offlineDiag() {
  try {
    if (!('serviceWorker' in navigator) || !window.caches) return 'not supported in this browser';
    const ctl = !!navigator.serviceWorker.controller;
    const keys = (await caches.keys()).filter(k => k.startsWith('dplus-'));
    let fb = false, files = 0;
    for (const k of keys) {
      const c = await caches.open(k);
      files += (await c.keys()).length;
      if (await c.match(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)) fb = true;
    }
    if (ctl && fb) return `ready ✓ (${keys.join(', ')})`;
    return `not ready – worker ${ctl ? 'on' : 'off'}, cache ${keys.join(', ') || 'none'} (${files} files), Firebase ${fb ? 'saved' : 'missing'}`;
  } catch (e) { return 'check failed: ' + e.message; }
}

function openSettings() {
  openSheet({
    cls: 'menu',
    html: `<div class="sh-t">D+ Notes</div><div class="sh-s">Signed in as ${esc(S.user?.email || '')}</div>
      <div class="m-row"><span>Sync</span><b>${esc(syncLabel()[0].slice(2))}</b></div>
      <button class="m-btn" data-a="install" type="button">Install on phone or laptop</button>
      <button class="m-btn danger" data-a="out" type="button">Sign out<small>Also removes the notes saved on this device</small></button>
      <div class="m-row"><span>Offline</span><b class="diag">checking…</b></div>
      <div class="m-row" style="display:block"><div class="stor-l"><span>Storage</span><b class="stor-t"></b></div><div class="stor"><i></i></div><div class="sh-s stor-s"></div></div>
      <div class="m-row"><span>Scanner</span><b>${scannerReady() ? 'ready offline ✓' : (navigator.onLine ? 'downloading in the background…' : 'needs internet once')}</b></div>
      <div class="sh-s" style="margin-top:12px">Version ${VERSION}</div>`,
    mount(sh, api) {
      offlineDiag().then(t => { const d = $('.diag', sh); if (d) d.textContent = t; });
      const us = usage(), pct = Math.min(100, us.used / QUOTA * 100);
      $('.stor-t', sh).textContent = `${fmtSize(us.used)} of 1 GB`;
      $('.stor i', sh).style.width = Math.max(pct, 0.6) + '%';
      $('.stor i', sh).classList.toggle('hi', pct > 80);
      $('.stor-s', sh).textContent = `${us.count} file${us.count === 1 ? '' : 's'} (${fmtSize(us.files)}) · notes and days ${fmtSize(us.text)}`;
      sh.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        api.close();
        if (a === 'install') openSheet({
          cls: 'menu',
          html: `<div class="sh-t">Install the app</div>
            <div class="help"><b>iPhone:</b> open the app in Safari, tap Share, then “Add to Home Screen”.<br><br>
            <b>Android:</b> open it in Chrome, tap ⋮, then “Install app”.<br><br>
            <b>Laptop:</b> open it in Chrome or Edge and click the install icon in the address bar.<br><br>
            <b>Work laptop:</b> just use it in the browser and sign out when you are done.</div>`,
        });
        if (a === 'out') {
          const go = async () => { await signOut(); location.reload(); };
          if (S.status.pending) confirmSheet('Some changes are not synced yet. Signing out now loses them.', 'Sign out anyway', go);
          else go();
        }
      });
    },
  });
}

/* ---------- week sheet (grows out of the week bar) ---------- */
function openWeek(n) {
  const bar = $('#weekbar'); if (!bar) return;
  blurActive();
  const mon = U.addDays(U.monday(ui.today), 7 * n), wk = U.weekKey(mon);
  const ar = app.getBoundingClientRect(), r = bar.getBoundingClientRect();
  const startH = r.height, fullH = Math.max(startH, Math.min(ar.height * 0.6, r.bottom - ar.top - 24));
  const bd = mk('div', 'bd'), sh = mk('div', 'wsheet');
  sh.style.bottom = (ar.bottom - r.bottom) + 'px';
  sh.style.height = startH + 'px';
  sh.innerHTML = `<div class="ws-head"><div><div class="sh-t">${['This week', 'W+1', 'W+2'][n]}</div><div class="sh-s">Week ${U.isoWeek(mon).week} · ${U.fmtDM(mon)}–${U.fmtDM(U.addDays(mon, 6))}</div></div><button class="pill accent" type="button" data-done>Done</button></div><div class="ws-body scroll"></div>`;
  const body = $('.ws-body', sh), eds = [];
  const section = (label, cls, ed) => { body.append(mk('div', 'ws-lab ' + cls, label)); const box = mk('div', 'ws-box scroll'); box.append(ed.el); body.append(box); eds.push(ed); };
  section('General', '', new LineEditor({ k: wk, s: 'week', placeholder: 'General info for this week', onLongPress: entryMenu, onDate: datePrompt }));
  for (let i = 0; i < 7; i++) {
    const d = U.addDays(mon, i);
    const cls = d < ui.today ? 'past' : d === ui.today ? 'today' : '';
    const lab = `${U.dowShort(d)} ${U.fmtDM(d)}${d === ui.today ? ' · today' : ''}${dayImportant(d) ? ' <b class="le-imp">!</b>' : ''}`;
    section(lab, cls, new LineEditor({ k: d, s: 'plan', placeholder: '—', onLongPress: entryMenu, onDate: datePrompt }));
  }
  $('#layer').append(bd, sh);
  sh.getBoundingClientRect();
  bd.classList.add('in'); sh.style.height = fullH + 'px'; sh.classList.add('open');
  setTimeout(() => body.classList.add('in'), 140);
  const upd = () => eds.forEach(e => e.render());
  updaters.add(upd);
  let closing = false;
  const close = () => {
    if (closing) return; closing = true;
    eds.forEach(e => e.stop()); updaters.delete(upd);
    body.classList.remove('in'); sh.classList.remove('open'); sh.style.height = startH + 'px'; bd.classList.remove('in');
    setTimeout(() => { bd.remove(); sh.remove(); }, 330);
    if (ui.page === 'days') Days.update();
  };
  bd.onclick = close; $('[data-done]', sh).onclick = close;
}

/* ---------- calendar day sheet ---------- */
function openDaySheet(d) {
  blurActive();
  const diff = U.diffDays(ui.today, d);
  const hint = diff >= 0 && diff <= 4 ? `Shows in D+${diff} as planned` : diff < 0 ? 'Past day' : 'Shows up in the D+ slots when the day comes';
  const ed = new LineEditor({ k: d, s: 'plan', placeholder: '0900 Text, or any note', onLongPress: entryMenu, onDate: datePrompt });
  openSheet({
    cls: 'day-sheet',
    html: `<div class="sh-head"><div><div class="sh-t">${dayLabel(d)}</div><div class="sh-s">${hint}</div></div>
      <div class="row"><button class="pill" type="button" data-imp>Important</button><button class="pill accent" type="button" data-done>Done</button></div></div>
      <div class="box ds-box scroll"></div><div class="ds-day"></div>`,
    mount(sh, api) {
      $('.ds-box', sh).append(ed.el);
      const impB = $('[data-imp]', sh);
      const paint = () => {
        impB.classList.toggle('red', !!S.days.get(d)?.imp);
        const own = entriesFor(d, 'day').filter(e => pl(e.t).trim());
        $('.ds-day', sh).innerHTML = own.length ? `<div class="lab">Also in the D+ slot</div>` + own.map(e => `<div class="ds-line"><i class="c-dot" style="background:${colorOf(e.c)}"></i><span>${rich(U.firstLine(e.t))}</span></div>`).join('') : '';
      };
      paint();
      impB.onclick = () => { put('days', d, { imp: !S.days.get(d)?.imp }); paint(); };
      $('[data-done]', sh).onclick = api.close;
      $('.ds-box', sh).addEventListener('click', e => { if (e.target.classList.contains('ds-box')) ed.edit(-1, true); });
      api.update = () => { ed.render(); paint(); };
    },
    onClose() { ed.stop(); },
  });
}

/* ---------- search everything ---------- */
function openSearch() {
  blurActive();
  const v = mk('div', 'full sf');
  v.innerHTML = `<div class="sf-head"><label class="search">${I.search}<input type="search" placeholder="Search everything" autocomplete="off" enterkeyhint="search"></label><button class="link" type="button" data-x>Cancel</button></div><div class="sf-res scroll"></div>`;
  $('#layer').append(v);
  v.getBoundingClientRect(); v.classList.add('in');
  const inp = $('input', v), res = $('.sf-res', v);
  inp.focus();
  const run = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { res.innerHTML = '<div class="empty">Search days, calendar, weeks, notes and the archive.</div>'; return; }
    const hits = [];
    for (const e of S.entries.values()) {
      const pt = pl(e.t);
      if (!pt.trim()) continue;
      const lab = keyLabel(e);
      if (pt.toLowerCase().includes(q) || lab.toLowerCase().includes(q)) hits.push({ e, lab, sort: sortKeyOf(e) });
    }
    hits.sort((a, b) => b.sort.localeCompare(a.sort));
    const notes = [...S.notes.values()].filter(n => `${pl(n.title)}\n${pl(n.body)}`.toLowerCase().includes(q));
    const folders = [...S.folders.values()].filter(f => (f.name || '').toLowerCase().includes(q));
    let h = '';
    if (hits.length) h += '<div class="ar-day">Days and calendar</div>' + hits.slice(0, 80).map(x => `<button class="hit" data-e="${x.e.id}" type="button"><span class="up-d">${esc(x.lab)}</span><span class="hit-x">${rich(U.firstLine(x.e.t))}</span></button>`).join('');
    if (notes.length || folders.length) h += '<div class="ar-day">Notes</div>'
      + folders.map(f => `<button class="hit" data-f="${f.id}" type="button"><span class="hit-i">${I.folder}</span><span class="hit-x">${esc(f.name)}</span></button>`).join('')
      + notes.slice(0, 60).map(n => `<button class="hit" data-n="${n.id}" type="button"><i class="c-dot" style="background:${colorOf(n.c)}"></i><span class="hit-x">${esc(noteTitle(n))}</span></button>`).join('');
    res.innerHTML = h || `<div class="empty">No matches for “${esc(inp.value)}”</div>`;
  };
  const close = () => { updaters.delete(run); blurActive(); v.classList.remove('in'); setTimeout(() => v.remove(), 300); };
  inp.oninput = run; run(); updaters.add(run);
  $('[data-x]', v).onclick = close;
  res.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    close();
    if (b.dataset.e) gotoEntry(S.entries.get(b.dataset.e));
    else if (b.dataset.n) { go('notes'); openNote(b.dataset.n); }
    else if (b.dataset.f) { Notes.reveal(b.dataset.f); go('notes'); }
  };
}

function gotoEntry(e) {
  if (!e) return;
  if (U.isWeekKey(e.k)) {
    const n = U.diffDays(U.monday(ui.today), U.weekMonday(e.k)) / 7;
    if (n >= 0 && n <= 2) { go('days'); openWeek(n); } else go('archive', pl(U.firstLine(e.t)).slice(0, 40));
    return;
  }
  const diff = U.diffDays(ui.today, e.k);
  if (diff >= -1 && diff <= 4) { Days.offset = diff; go('days'); }
  else if (diff < -1) go('archive', pl(U.firstLine(e.t)).slice(0, 40));
  else { Cal.month = e.k.slice(0, 7); go('calendar'); openDaySheet(e.k); }
}

/* ---------- swipe helper ---------- */
function onSwipe(el, cb) {
  let x0 = null, y0 = 0, t0 = 0;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || editingIn(document.body)) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy) && Date.now() - t0 < 700) cb(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/* ================= pages ================= */

const Days = {
  offset: 0,
  mount(el) {
    this.el = el; this.schedEdit = false; this.pending = false;
    el.innerHTML = `
      <header class="hdr">
        <div><div class="clock" id="clock"></div><div class="hdr-date" id="hdrDate"></div></div>
        <div class="hdr-r"><button class="sync" id="sync" type="button"></button><button class="icon-btn" id="srch" type="button" aria-label="Search">${I.search}</button></div>
      </header>
      <div id="banners"></div>
      <div class="tabs" id="tabs"></div>
      <div id="next"></div>
      <div class="day-body" id="dayBody">
        <div class="sec-head"><span>Schedule</span><button class="link" id="yday" type="button">Yesterday</button></div>
        <div class="sched scroll" id="sched"></div>
        <div class="split" id="split" role="separator" aria-orientation="horizontal" aria-label="Drag to resize schedule and notes"><i></i></div>
        <div class="sec-head"><span>Notes</span><span class="row"><span class="hint">tap to write</span><button class="icon-btn sm" id="dayClip" type="button" aria-label="Attach a file to this day">${I.clip}</button></span></div>
        <div class="notes scroll" id="notes">
          <div id="dayEd"></div>
          <div id="planBlk" hidden><div class="blk-lab">Planned</div><div id="planEd"></div></div>
          <div id="recBlk"></div>
          <div id="attBlk"></div>
          <div class="notes-fill" id="notesFill"></div>
        </div>
      </div>
      <div class="weekbar" id="weekbar">
        <button class="wb-main" id="wb0" type="button"><div class="wb-l">This week ›</div><div class="wb-s" id="wbS"></div></button>
        <button class="pill" type="button" id="wb1">W+1</button><button class="pill" type="button" id="wb2">W+2</button>
      </div>`;
    $('#sync').onclick = openSettings;
    $('#srch').onclick = openSearch;
    $('#tabs').onclick = e => { const b = e.target.closest('[data-o]'); if (b) this.setOffset(+b.dataset.o); };
    $('#yday').onclick = () => this.setOffset(this.offset === -1 ? 0 : -1);
    $('#banners').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'dismiss') { ui.newDay = null; this.renderBanners(); }
      if (b.dataset.act === 'today') this.setOffset(0);
      if (b.dataset.act === 'goto') this.setOffset(+b.dataset.o);
    };
    const sched = $('#sched');
    sched.onclick = e => this.onSchedClick(e);
    attachLongPress(sched, '.sr[data-sid]', t => {
      const it = this.items?.get(t.dataset.sid); if (!it) return;
      if (it.rec) openRecurring(it.rec); else entryMenu(it.e);
    });
    $('#notesFill').onclick = () => this.dayEd.edit(-1, true);
    $('#dayClip').onclick = () => attachMenu('day:' + this.date, null);
    wireStrip($('#attBlk'));
    $('#recBlk').onclick = e => { const b = e.target.closest('[data-rid]'); if (b) openRecurring(S.recurring.get(b.dataset.rid)); };
    $('#wb0').onclick = () => openWeek(0);
    $('#wb1').onclick = () => openWeek(1);
    $('#wb2').onclick = () => openWeek(2);
    onSwipe($('#dayBody'), dir => { const n = this.offset + dir; if (n >= -1 && n <= 4) this.setOffset(n); });
    this.splitter();
    this.setDate(true);
  },
  unmount() { this.el = null; },

  // Drag the line between schedule and notes; the height is remembered on this device.
  splitter() {
    const sched = $('#sched'), split = $('#split'), body = $('#dayBody');
    const clamp = h => Math.max(70, Math.min(h, body.clientHeight - 130));
    const saved = +localStorage.getItem('dplus-split') || 0;
    if (saved) sched.style.height = clamp(saved) + 'px';
    let y0 = 0, h0 = 0, on = false;
    split.addEventListener('pointerdown', e => {
      on = true; y0 = e.clientY; h0 = sched.getBoundingClientRect().height;
      split.setPointerCapture(e.pointerId); split.classList.add('drag'); e.preventDefault();
    });
    split.addEventListener('pointermove', e => { if (on) sched.style.height = clamp(h0 + e.clientY - y0) + 'px'; });
    const end = () => {
      if (!on) return; on = false; split.classList.remove('drag');
      try { localStorage.setItem('dplus-split', Math.round(sched.getBoundingClientRect().height)); } catch {}
    };
    split.addEventListener('pointerup', end); split.addEventListener('pointercancel', end);
    split.addEventListener('dblclick', () => { sched.style.height = ''; try { localStorage.removeItem('dplus-split'); } catch {} });
  },

  setOffset(n) { if (n === this.offset) return; blurActive(); this.offset = n; this.setDate(); },

  setDate(scroll) {
    const d = U.addDays(ui.today, this.offset);
    this.date = d;
    const common = { onTimeMoved: toastMoved, onDate: datePrompt, onLongPress: entryMenu, onEditEnd: () => this.afterEdit(), moveTime: true, filter: e => !isTime(e) };
    this.dayEd = new LineEditor({ ...common, k: d, s: 'day', placeholder: 'Tap to write' });
    this.planEd = new LineEditor({ ...common, k: d, s: 'plan', placeholder: '' });
    $('#dayEd').replaceChildren(this.dayEd.el);
    $('#planEd').replaceChildren(this.planEd.el);
    this.update();
    if (scroll !== false) this.scrollToNow();
  },

  afterEdit() { if (this.pending) { this.pending = false; this.setDate(); } else this.update(); },

  scrollToNow() {
    const sc = $('#sched'), cur = $('.sr.cur', sc) || $('.sr:not(.past)', sc);
    sc.scrollTop = cur && this.offset === 0 ? Math.max(0, cur.offsetTop - 44) : 0;
  },

  update() {
    if (!this.el) return;
    this.renderHeader(); this.renderBanners(); this.renderTabs(); this.renderNext(); this.renderSched();
    this.dayEd.render(); this.planEd.render();
    $('#planBlk').hidden = this.planEd.isEmpty();
    this.renderRec(); this.renderWeekbar();
    const att = stripHtml('day:' + this.date);
    $('#attBlk').innerHTML = att ? '<div class="blk-lab">Attachments</div>' + att : '';
  },

  renderHeader() {
    $('#clock').textContent = U.nowHHMM();
    $('#hdrDate').textContent = `${U.dowLong(ui.today)} ${U.fmtDMY(ui.today)} · Week ${U.isoWeek(ui.today).week}`;
    const [t, c] = syncLabel(); const s = $('#sync'); s.textContent = t; s.className = 'sync ' + c;
  },

  renderBanners() {
    let h = '';
    if (S.error) h += `<div class="banner imp">${esc(S.error)}</div>`;
    if (ui.newDay) h += `<button class="banner new" data-act="dismiss" type="button"><span>${esc(ui.newDay)}</span><span class="b-x">OK</span></button>`;
    if (this.offset === -1) h += `<div class="banner info"><span>Yesterday · ${dayLabel(this.date)}</span><button class="link" data-act="today" type="button">Back to today</button></div>`;
    if (this.offset === 0) for (const i of [1, 2]) {
      const d = U.addDays(ui.today, i);
      if (!dayImportant(d)) continue;
      const imp = entriesFor(d).find(e => e.s !== 'week' && isImp(e)) || entriesFor(d).find(e => e.s !== 'week' && pl(e.t).trim());
      const txt = imp ? pl(U.parseTime(imp.t)?.text || U.firstLine(imp.t)) : 'Important day';
      h += `<button class="banner imp" data-act="goto" data-o="${i}" type="button"><span><b>${i === 1 ? 'Tomorrow' : U.dowShort(d)}:</b> ${esc(txt)} · important</span></button>`;
    }
    $('#banners').innerHTML = h;
  },

  renderTabs() {
    $('#tabs').innerHTML = [0, 1, 2, 3, 4].map(i => {
      const d = U.addDays(ui.today, i);
      return `<button class="tab${i === this.offset ? ' on' : ''}" data-o="${i}" type="button"><b>D+${i}</b><span>${U.dowShort(d)}</span>${dayImportant(d) ? '<i class="imp"></i>' : ''}</button>`;
    }).join('');
    $('#yday').textContent = this.offset === -1 ? 'Today' : 'Yesterday';
  },

  renderNext() {
    const all = timeItems(this.date), items = all.filter(i => !i.carry);
    let lab = 'First', it = null, extra = '';
    if (this.offset === 0) {
      const now = U.nowHHMM();
      it = all.find(i => running(i, now));
      if (it) { lab = 'Now'; extra = `until ${it.end}`; }
      else {
        it = items.find(i => i.start >= now);
        if (it) { lab = 'Next'; const m = U.mins(it.start) - U.mins(now); extra = m === 0 ? 'now' : 'in ' + U.durText(m); }
      }
      if (!it) { it = timeItems(U.addDays(this.date, 1)).find(i => !i.carry); if (it) lab = 'Tomorrow'; }
    } else it = items[0];
    $('#next').innerHTML = it
      ? `<div class="next"><span class="l">${lab}</span><span class="t">${it.start}</span><span class="x">${rich(it.text)}</span><span class="in">${extra}</span></div>`
      : `<div class="next quiet"><span class="l">${this.offset === 0 ? 'Next' : 'First'}</span><span class="x muted">Nothing planned</span></div>`;
  },

  renderSched() {
    if (this.schedEdit) return;
    const items = timeItems(this.date), today = this.offset === 0, now = U.nowHHMM();
    const cur = today ? items.findIndex(i => notOver(i, now)) : -1;
    this.items = new Map(items.map(i => [i.id, i]));
    const rows = items.map((it, i) => {
      let st = '';
      if (today) {
        if (cur === -1 || i < cur) st = 'past';
        else if (i === cur) st = 'cur';
      }
      const tt = it.carry ? `→${it.end}` : it.end ? `${it.start}–${it.end}` : it.start;
      const tags = (it.carry ? '<span class="tag">overnight</span>' : '') + (it.src === 'plan' ? '<span class="tag">planned</span>' : '') + (it.rec ? `<span class="tag ic">${I.repeat}</span>` : '') + (it.e?.imp ? '<b class="le-imp">!</b>' : '');
      const sub = it.rest?.length ? `<div class="sr-sub">${it.rest.map(rich).join('<br>')}</div>` : '';
      const dot = st === 'past' ? '' : `background:${colorOf(it.c)}`;
      return `<div class="sr ${st}${it.x ? ' x' : ''}" data-sid="${esc(it.id)}"><span class="sr-dot" style="${dot}"></span><span class="sr-t">${tt}</span><div class="sr-x"><div><span class="sr-txt">${rich(it.text)}</span>${tags}</div>${sub}</div></div>`;
    });
    rows.push(`<div class="sr add" data-sid="new"><span class="sr-dot"></span><span class="sr-t"></span><div class="sr-x">+ Add time entry</div></div>`);
    $('#sched').innerHTML = `<div class="sr-wrap"><div class="sr-line"></div>${rows.join('')}</div>`;
  },

  onSchedClick(ev) {
    if (lpRecently() || this.schedEdit) return;
    const r = ev.target.closest('.sr'); if (!r) return;
    const sid = r.dataset.sid;
    if (sid === 'new') return this.editRow(r, null);
    const it = this.items.get(sid); if (!it) return;
    if (it.rec) return openRecurring(it.rec);
    this.editRow(r, it.e);
  },

  editRow(row, entry) {
    this.schedEdit = true;
    const d = this.date;
    let done = false, finalV = null;
    const rt = new RichText({
      value: entry ? entry.t : '', placeholder: '1600 Text', cls: 'sr-edit',
      // Enter on a normal line saves; inside a list it keeps the list going
      onLine: (line, i, isList) => {
        if (isList) return;
        const L = rt.lines(); L.splice(i + 1, 1);
        finalV = L.join('\n'); rt.el.blur();
      },
      onBlur: () => commit(),
    });
    row.classList.add('editing');
    $('.sr-t', row)?.remove();
    $('.sr-x', row).replaceWith(rt.el);
    rt.focus(); rt.caretToLineEnd(-1);
    const commit = () => {
      if (done) return; done = true; this.schedEdit = false;
      const v = (finalV ?? rt.value()).replace(/\s+$/, '');
      if (!entry) {
        if (pl(v).trim()) {
          if (U.parseTime(v)) put('entries', newId(), { k: d, s: 'day', t: v, o: 0 });
          else { put('entries', newId(), { k: d, s: 'day', t: v, o: nextO(d, 'day') }); toast('No time at the start – added to notes'); }
        }
      } else if (!pl(v).trim()) {
        const copy = stripId(entry); del('entries', entry.id); toast('Entry deleted', () => put('entries', entry.id, copy));
      } else if (v !== entry.t) {
        const old = entry.t;
        put('entries', entry.id, { t: v, lit: false });
        if (!U.parseTime(v)) toast('No time at the start – moved to notes', () => put('entries', entry.id, { t: old }));
      }
      this.update();
    };
    rt.el.addEventListener('keydown', e => { if (e.key === 'Escape') { done = true; this.schedEdit = false; this.renderSched(); } });
  },

  renderRec() {
    const recs = recurringOn(this.date).filter(r => !U.parseTime(r.t));
    $('#recBlk').innerHTML = recs.length ? '<div class="blk-lab">Repeating</div>' + recs.map(r => `<button class="rec-line" data-rid="${r.id}" type="button"><i class="c-dot" style="background:${colorOf(r.c)}"></i><span>${rich(r.t)}</span><span class="tag ic">${I.repeat}</span></button>`).join('') : '';
  },

  renderWeekbar() {
    const L = entriesFor(U.weekKey(ui.today), 'week').filter(e => pl(e.t).trim() && !e.x);
    $('#wbS').textContent = L.length ? pl(U.firstLine(L[0].t)) + (L.length > 1 ? ` · +${L.length - 1}` : '') : 'Nothing planned';
  },

  tickMinute() { if (!this.el) return; this.renderHeader(); this.renderNext(); this.renderSched(); },
};

const Cal = {
  month: null,
  mount(el) {
    this.el = el;
    if (!this.month) this.month = ui.today.slice(0, 7);
    el.innerHTML = `
      <header class="ph"><div><div class="ph-t" id="calT"></div><div class="ph-s" id="calS"></div></div>
        <div class="ph-r"><span class="mini-clock"></span><button class="icon-btn" id="calP" type="button" aria-label="Previous month">${I.left}</button><button class="icon-btn" id="calN" type="button" aria-label="Next month">${I.right}</button></div></header>
      <div class="cal-dow"><span>Wk</span>${WD.map(([, l]) => `<span>${l}</span>`).join('')}</div>
      <div class="cal-grid" id="calG"></div>
      <div class="divider" style="margin-top:12px"></div>
      <div class="sec-head"><span>Coming up</span><button class="link" id="calToday" type="button">Today</button></div>
      <div class="up scroll" id="calUp"></div>`;
    const shift = n => { const [y, m] = this.month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); this.month = U.ymd(d).slice(0, 7); this.update(); };
    $('#calP').onclick = () => shift(-1);
    $('#calN').onclick = () => shift(1);
    $('#calToday').onclick = () => { this.month = ui.today.slice(0, 7); this.update(); };
    el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) openDaySheet(b.dataset.d); });
    onSwipe($('#calG'), dir => shift(dir));
    this.update();
  },
  unmount() { this.el = null; },
  update() {
    if (!this.el) return;
    const [y, m] = this.month.split('-').map(Number);
    $('#calT').textContent = `${U.MONTHS[m - 1]} ${y}`;
    $('#calS').textContent = `Today: ${U.dowShort(ui.today)} ${U.fmtDM(ui.today)} · Week ${U.isoWeek(ui.today).week}`;
    let d = U.monday(`${this.month}-01`);
    const end = U.addDays(U.monday(U.ymd(new Date(y, m, 0))), 6);
    let h = '';
    while (d <= end) {
      h += `<span class="cal-wk">${U.isoWeek(d).week}</span>`;
      for (let i = 0; i < 7; i++) {
        const imp = dayImportant(d), has = dayHasEntries(d);
        const cls = ['cd', d.slice(0, 7) !== this.month && 'out', d === ui.today && 'today', imp && 'imp'].filter(Boolean).join(' ');
        h += `<button class="${cls}" data-d="${d}" type="button" aria-label="${dayLabel(d)}"><span>${+d.slice(8)}</span><i class="dt" style="${has || imp ? `background:${imp ? 'var(--red)' : 'var(--ac)'}` : ''}"></i></button>`;
        d = U.addDays(d, 1);
      }
    }
    $('#calG').innerHTML = h;
    const days = new Map();
    for (const e of S.entries.values()) {
      if (!U.isDateKey(e.k) || e.k < ui.today || e.s === 'week' || !pl(e.t).trim()) continue;
      if (!days.has(e.k)) days.set(e.k, []);
      days.get(e.k).push(e);
    }
    for (const [id, v] of S.days) if (v.imp && id >= ui.today && !days.has(id)) days.set(id, []);
    const keys = [...days.keys()].sort().slice(0, 20);
    $('#calUp').innerHTML = keys.length ? keys.map(k => {
      const L = days.get(k).sort((a, b) => (a.o || 0) - (b.o || 0));
      const timed = L.map(e => U.parseTime(e.t)).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
      const first = pl(timed[0] ? `${timed[0].start} ${timed[0].text}` : L[0] ? U.firstLine(L[0].t) : 'Important day');
      const imp = dayImportant(k);
      return `<button class="up-row" data-d="${k}" type="button"><span class="up-d${imp ? ' red' : ''}">${U.dowShort(k)} ${U.fmtDM(k)}</span><span class="up-x">${esc(first)}${L.length > 1 ? ` <span class="muted">+${L.length - 1}</span>` : ''}</span>${imp ? '<i class="c-dot" style="background:var(--red)"></i>' : ''}</button>`;
    }).join('') : '<div class="empty">Nothing coming up. Tap a day to plan.</div>';
  },
};

const Notes = {
  open: new Set(JSON.parse(localStorage.getItem('dplus-open') || '[]')),
  sel: null,
  saveOpen() { try { localStorage.setItem('dplus-open', JSON.stringify([...this.open])); } catch {} },
  reveal(fid) { let f = S.folders.get(fid); while (f) { this.open.add(f.id); f = S.folders.get(f.p); } this.sel = fid; this.saveOpen(); },
  mount(el) {
    this.el = el;
    el.innerHTML = `
      <header class="ph"><div class="ph-t">Notes</div>
        <div class="ph-r"><span class="mini-clock"></span><button class="icon-btn" id="nSrch" type="button" aria-label="Search">${I.search}</button><button class="icon-btn" id="nFolder" type="button" aria-label="New folder">${I.folderPlus}</button><button class="icon-btn accent" id="nNote" type="button" aria-label="New note">${I.notePlus}</button></div></header>
      <div class="legend">${COLOR_KEYS.map(k => `<span><i class="c-dot" style="background:${COLORS[k]}"></i>${COLOR_NAMES[k]}</span>`).join('')}</div>
      <div class="tree scroll" id="tree"></div>`;
    $('#nSrch').onclick = openSearch;
    $('#nFolder').onclick = () => inputSheet(this.sel && S.folders.get(this.sel) ? `New folder in “${S.folders.get(this.sel).name}”` : 'New folder', '', name => {
      const p = this.sel && S.folders.get(this.sel) ? this.sel : null;
      put('folders', newId(), { name, p, o: Date.now() }); if (p) { this.open.add(p); this.saveOpen(); }
    });
    $('#nNote').onclick = () => this.newNote(this.sel && S.folders.get(this.sel) ? this.sel : null);
    const tree = $('#tree');
    tree.onclick = e => {
      if (lpRecently()) return;
      const f = e.target.closest('[data-fid]');
      if (f) { const id = f.dataset.fid; this.open.has(id) && this.sel === id ? this.open.delete(id) : this.open.add(id); this.sel = this.open.has(id) ? id : (S.folders.get(id)?.p || null); this.saveOpen(); this.update(); return; }
      const n = e.target.closest('[data-nid]'); if (n) openNote(n.dataset.nid);
    };
    attachLongPress(tree, '[data-fid],[data-nid]', t => t.dataset.fid ? folderMenu(S.folders.get(t.dataset.fid)) : noteMenu(S.notes.get(t.dataset.nid)));
    this.update();
  },
  unmount() { this.el = null; },
  newNote(fid) {
    const id = put('notes', newId(), { f: fid, title: '', body: '' });
    if (fid) { this.open.add(fid); this.saveOpen(); }
    openNote(id, true);
  },
  update() {
    if (!this.el) return;
    const folders = [...S.folders.values()], notes = [...S.notes.values()];
    const kids = p => folders.filter(f => (f.p || null) === p).sort((a, b) => (a.o || 0) - (b.o || 0));
    const inF = f => notes.filter(n => (n.f || null) === f && S.folders.has(n.f || '') === !!f).sort((a, b) => (b.u || 0) - (a.u || 0));
    const count = f => inF(f.id).length + kids(f.id).reduce((a, k) => a + count(k), 0);
    const noteRow = (n, depth) => `<button class="nr" data-nid="${n.id}" type="button" style="padding-left:${12 + depth * 20}px"><i class="c-dot" style="background:${n.c ? COLORS[n.c] : noteImp(n) ? COLORS.r : '#3A3B37'}"></i><span class="nr-t">${esc(noteTitle(n))}</span>${noteImp(n) ? '<b class="le-imp">!</b>' : ''}</button>`;
    let h = '';
    const walk = (p, depth) => {
      for (const f of kids(p)) {
        const open = this.open.has(f.id);
        h += `<button class="fr${this.sel === f.id ? ' sel' : ''}" data-fid="${f.id}" type="button" style="padding-left:${6 + depth * 20}px"><span class="chev">${open ? I.down : I.right}</span><span class="fi">${I.folder}</span><span class="fr-n">${esc(f.name)}</span><span class="cnt">${count(f)}</span></button>`;
        if (open) { walk(f.id, depth + 1); inF(f.id).forEach(n => { h += noteRow(n, depth + 1); }); }
      }
    };
    walk(null, 0);
    const loose = notes.filter(n => !n.f || !S.folders.has(n.f)).sort((a, b) => (b.u || 0) - (a.u || 0));
    loose.forEach(n => { h += noteRow(n, 0); });
    $('#tree').innerHTML = h || '<div class="empty">No notes yet.<br>Create a folder or a note with the buttons above.</div>';
  },
};

function folderMenu(f) {
  if (!f) return;
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">${esc(f.name)}</div>
      <button class="m-btn" data-a="note" type="button">New note here</button>
      <button class="m-btn" data-a="sub" type="button">New subfolder</button>
      <button class="m-btn" data-a="ren" type="button">Rename</button>
      <button class="m-btn" data-a="mv" type="button">Move to…</button>
      <button class="m-btn danger" data-a="del" type="button">Delete folder</button>`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        api.close();
        if (a === 'note') Notes.newNote(f.id);
        if (a === 'sub') inputSheet(`New folder in “${f.name}”`, '', name => { put('folders', newId(), { name, p: f.id, o: Date.now() }); Notes.open.add(f.id); Notes.saveOpen(); });
        if (a === 'ren') inputSheet('Rename folder', f.name, name => put('folders', f.id, { name }));
        if (a === 'mv') folderPicker('Move folder to', f.id, p => put('folders', f.id, { p }));
        if (a === 'del') {
          const fids = []; const walk = id => { fids.push(id); for (const x of S.folders.values()) if (x.p === id) walk(x.id); }; walk(f.id);
          const ns = [...S.notes.values()].filter(n => fids.includes(n.f));
          const go = () => {
            const fc = fids.map(id => [id, stripId(S.folders.get(id))]), nc = ns.map(n => [n.id, stripId(n)]);
            fids.forEach(id => del('folders', id)); ns.forEach(n => { del('notes', n.id); dropFilesLater('note:' + n.id, () => !S.notes.has(n.id)); });
            toast('Folder deleted', () => { fc.forEach(([id, v]) => put('folders', id, v)); nc.forEach(([id, v]) => put('notes', id, v)); });
          };
          if (ns.length || fids.length > 1) confirmSheet(`Delete “${f.name}” with ${ns.length} note${ns.length === 1 ? '' : 's'}${fids.length > 1 ? ` and ${fids.length - 1} subfolder${fids.length > 2 ? 's' : ''}` : ''}?`, 'Delete', go);
          else go();
        }
      });
    },
  });
}

function noteMenu(n, onGone) {
  if (!n) return;
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">${esc(noteTitle(n))}</div>${colorRow(n.c)}${colorHint}
      ${n.imp ? '<button class="m-btn" data-a="imp" type="button">Remove old important mark</button>' : ''}
      <button class="m-btn" data-a="mv" type="button">Move to folder…</button>
      <button class="m-btn danger" data-a="del" type="button">Delete note</button>`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.c !== undefined) { put('notes', n.id, { c: b.dataset.c || null, imp: false }); api.close(); return; }
        const a = b.dataset.a; if (!a) return;
        api.close();
        if (a === 'imp') put('notes', n.id, { imp: false });
        if (a === 'mv') folderPicker('Move note to', null, f => put('notes', n.id, { f }));
        if (a === 'del') { const copy = stripId(S.notes.get(n.id) || n); del('notes', n.id); onGone?.(); toast('Note deleted', () => put('notes', n.id, copy)); dropFilesLater('note:' + n.id, () => !S.notes.has(n.id)); }
      });
    },
  });
}

function folderPicker(title, excludeId, onPick) {
  const ex = new Set();
  if (excludeId) { const walk = id => { ex.add(id); for (const x of S.folders.values()) if (x.p === id) walk(x.id); }; walk(excludeId); }
  let rows = `<button class="m-btn" data-p="" type="button">Top level</button>`;
  const walk = (p, depth) => {
    [...S.folders.values()].filter(f => (f.p || null) === p && !ex.has(f.id)).sort((a, b) => (a.o || 0) - (b.o || 0)).forEach(f => {
      rows += `<button class="m-btn" data-p="${f.id}" type="button" style="padding-left:${4 + depth * 20}px"><span class="fi">${I.folder}</span>${esc(f.name)}</button>`;
      walk(f.id, depth + 1);
    });
  };
  walk(null, 0);
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">${esc(title)}</div><div class="scroll" style="max-height:55vh">${rows}</div>`,
    mount(sh, api) { sh.addEventListener('click', ev => { const b = ev.target.closest('[data-p]'); if (!b) return; api.close(); onPick(b.dataset.p || null); }); },
  });
}

function openNote(id, isNew) {
  const n = S.notes.get(id); if (!n) return;
  blurActive();
  const v = mk('div', 'full ne');
  const path = []; let f = S.folders.get(n.f); while (f) { path.unshift(f.name); f = S.folders.get(f.p); }
  v.innerHTML = `<div class="ne-head"><button class="back" type="button">${I.left}<span>Notes</span></button><span class="ne-f">${esc(path.join(' / '))}</span><span class="clock-s mini-clock">${U.nowHHMM()}</span><button class="icon-btn" type="button" data-clip aria-label="Attach">${I.clip}</button><button class="icon-btn" type="button" data-more aria-label="More">${I.more}</button></div>
    <input class="ne-title" placeholder="Title" autocapitalize="sentences"><div class="ne-att"></div><div class="ne-slot"></div>`;
  const ti = $('.ne-title', v);
  ti.value = n.title || '';
  const bo = new RichText({
    value: n.body || '', placeholder: 'Write…', cls: 'ne-body scroll',
    onLine: (line, i, isList) => {
      const p = pl(line), found = U.extractDates(isList ? p.slice(2) : p); if (!found) return;
      save();
      noteDatePrompt(id, line, found, bo);
    },
    onInput: () => later(),
    onBlur: () => save(),
  });
  $('.ne-slot', v).replaceWith(bo.el);
  $('#layer').append(v);
  v.getBoundingClientRect(); v.classList.add('in');
  let t = null;
  const save = () => {
    clearTimeout(t); t = null;
    const cur = S.notes.get(id); if (!cur) return;
    const body = bo.value();
    if ((cur.title || '') !== ti.value || (cur.body || '') !== body) put('notes', id, { title: ti.value, body });
  };
  const later = () => { clearTimeout(t); t = setTimeout(save, 600); };
  ti.oninput = later;
  ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); bo.focus(); bo.caretToLineEnd(-1); } };
  ti.addEventListener('blur', save);
  const upd = () => {
    const cur = S.notes.get(id);
    if (!cur) { close(true); return; }
    if (document.activeElement !== ti && !t && (cur.title || '') !== ti.value) ti.value = cur.title || '';
    if (document.activeElement !== bo.el && !t && (cur.body || '') !== bo.value()) bo.setValue(cur.body || '');
  };
  const att = $('.ne-att', v);
  const paintAtt = () => { att.innerHTML = stripHtml('note:' + id); };
  paintAtt(); wireStrip(att);
  const upd2 = upd;
  const updAll = () => { upd2(); paintAtt(); };
  updaters.add(updAll);
  $('[data-clip]', v).onclick = () => {
    save();
    attachMenu('note:' + id, text => {
      const cur = S.notes.get(id); if (!cur) return;
      const body = ((cur.body || '').replace(/\s+$/, '') + '\n' + text).replace(/^\n/, '');
      put('notes', id, { body }); bo.setValue(body);
    });
  };
  let closed = false;
  const close = gone => {
    if (closed) return; closed = true;
    updaters.delete(updAll);
    if (!gone) {
      const val = bo.value(), trimmed = val.replace(/(\n(• |☐ |☑ )?[ \t]*)+$/, '');
      if (trimmed !== val) bo.setValue(trimmed);
      save();
      const cur = S.notes.get(id);
      if (cur && !(cur.title || '').trim() && !pl(cur.body).trim() && ![...S.files.values()].some(f => f.on === 'note:' + id)) del('notes', id);
    }
    blurActive();
    v.classList.remove('in'); setTimeout(() => v.remove(), 300);
  };
  $('.back', v).onclick = () => close();
  $('[data-more]', v).onclick = () => { save(); noteMenu(S.notes.get(id), () => close(true)); };
  if (isNew) ti.focus();
}

function noteDatePrompt(id, line, found, bo) {
  const text = found.rest || pl(line).replace(/^(• |☐ |☑ )/, '');
  openSheet({
    cls: 'menu',
    html: `<div class="m-t">Date found: ${found.dates.map(dayLabel).join(', ')}</div><div class="m-q">“${esc(text)}”</div>
      <button class="m-btn" data-a="keep" type="button">Keep in this note</button>
      <button class="m-btn" data-a="move" type="button">Move to ${found.dates.length > 1 ? 'these days' : 'that day'}</button>
      <button class="m-btn" data-a="both" type="button">Both: keep here and copy</button>`,
    mount(sh, api) {
      sh.addEventListener('click', ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        api.close();
        if (a === 'keep') return;
        const made = found.dates.map(d => put('entries', newId(), { k: d, s: inWin(d) ? 'day' : 'plan', t: text, o: nextO(d, inWin(d) ? 'day' : 'plan') }));
        let oldBody = null;
        if (a === 'move') {
          const cur = S.notes.get(id); oldBody = cur?.body || '';
          const lines = oldBody.split('\n'); const i = lines.indexOf(line);
          if (i >= 0) { lines.splice(i, 1); const nb = lines.join('\n'); put('notes', id, { body: nb }); if (bo.el.isConnected) bo.setValue(nb); }
        }
        const where = found.dates.length > 1 ? `${found.dates.length} days` : dayLabel(found.dates[0]);
        toast(a === 'move' ? `Moved to ${where}` : `Copied to ${where}`, () => {
          made.forEach(x => del('entries', x));
          if (oldBody != null) { put('notes', id, { body: oldBody }); if (bo.el.isConnected) bo.setValue(oldBody); }
        });
      });
    },
  });
}

const Archive = {
  q: '', openId: null, open: new Set(),
  mount(el, q) {
    this.el = el;
    if (q != null) this.q = q;
    el.innerHTML = `
      <header class="ph"><div><div class="ph-t">Archive</div><div class="ph-s">Kept for 1 year</div></div><div class="ph-r"><span class="mini-clock"></span><button class="link" id="arAll" type="button">Open all</button></div></header>
      <label class="search">${I.search}<input id="arQ" type="search" placeholder="Search archive" autocomplete="off" enterkeyhint="search"></label>
      <div class="ar-list scroll" id="arL"></div>`;
    const inp = $('#arQ'); inp.value = this.q;
    inp.oninput = () => { this.q = inp.value; this.openId = null; this.update(); };
    $('#arAll').onclick = () => {
      if (this.open.size) this.open.clear(); else this.keys?.forEach(k => this.open.add(k));
      this.update();
    };
    const L = $('#arL');
    L.onclick = e => {
      if (lpRecently()) return;
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.day) { const k = b.dataset.day; this.open.has(k) ? this.open.delete(k) : this.open.add(k); this.update(); return; }
      if (b.dataset.mv) { this.openId = this.openId === b.dataset.mv ? null : b.dataset.mv; this.update(); return; }
      if (b.dataset.to) {
        const id = b.dataset.id, cur = S.entries.get(id); if (!cur) return;
        const n = +b.dataset.to, d = U.addDays(ui.today, n), old = { k: cur.k, s: cur.s, o: cur.o };
        put('entries', id, { k: d, s: 'day', o: nextO(d, 'day') });
        this.openId = null;
        toast(`Moved to D+${n}`, () => put('entries', id, old));
      }
    };
    attachLongPress(L, '.ar-row[data-id]', t => entryMenu(S.entries.get(t.dataset.id)));
    wireStrip(L);
    this.update();
  },
  unmount() { this.el = null; },
  update() {
    if (!this.el) return;
    const t = ui.today, curW = U.weekKey(t), q = this.q.trim().toLowerCase();
    const groups = new Map(), files = new Map();
    const isPast = k => U.isWeekKey(k) ? k < curW : U.isDateKey(k) && k < t;
    for (const e of S.entries.values()) {
      const pt = pl(e.t);
      if (!pt.trim() || !isPast(e.k)) continue;
      if (q && !pt.toLowerCase().includes(q) && !keyLabel(e).toLowerCase().includes(q)) continue;
      if (!groups.has(e.k)) groups.set(e.k, []);
      groups.get(e.k).push(e);
    }
    for (const f of S.files.values()) {
      const k = (f.on || '').startsWith('day:') ? f.on.slice(4) : null;
      if (!k || !isPast(k)) continue;
      if (q && !f.name.toLowerCase().includes(q) && !dayLabel(k).toLowerCase().includes(q)) continue;
      files.set(k, (files.get(k) || 0) + 1);
      if (!groups.has(k)) groups.set(k, []);
    }
    const keys = this.keys = [...groups.keys()].sort((a, b) => sortKeyOf({ k: b }).localeCompare(sortKeyOf({ k: a })));
    $('#arAll').textContent = this.open.size ? 'Close all' : 'Open all';
    let h = '', rows = 0;
    for (const k of keys) {
      const L = groups.get(k).map(e => ({ e, p: e.lit ? null : U.parseTime(e.t) }))
        .sort((a, b) => (a.p ? 0 : 1) - (b.p ? 0 : 1) || (a.p && b.p ? a.p.start.localeCompare(b.p.start) : (a.e.o || 0) - (b.e.o || 0)));
      const open = !!q || this.open.has(k), nf = files.get(k) || 0;
      const imp = L.some(x => isImp(x.e)) || (U.isDateKey(k) && !!S.days.get(k)?.imp);
      const first = L[0] ? pl(L[0].p ? `${L[0].p.start} ${L[0].p.text}` : U.firstLine(L[0].e.t)) : '';
      const label = U.isWeekKey(k) ? `Week ${+k.slice(6)} · general` : dayLabel(k);
      h += `<button class="ar-dh${open ? ' open' : ''}" data-day="${k}" type="button" aria-expanded="${open}">`
        + `<span class="chev">${open ? I.down : I.right}</span><span class="ar-dl${imp ? ' red' : ''}">${label}</span>`
        + `<span class="ar-dp">${open ? '' : esc(first)}</span>`
        + `<span class="ar-dc">${L.length}${nf ? ` · <span class="ar-clip">${I.clip}</span>${nf}` : ''}</span></button>`;
      if (!open || rows > 600) continue;
      h += '<div class="ar-body">';
      for (const { e, p } of L) {
        rows++;
        const act = this.openId === e.id
          ? `<span class="mv-row">${[1, 2, 3].map(n => `<button class="mv go" data-id="${e.id}" data-to="${n}" type="button">D+${n}</button>`).join('')}</span>`
          : `<button class="mv" data-mv="${e.id}" type="button">Move</button>`;
        h += `<div class="ar-row" data-id="${e.id}"><i class="c-dot" style="background:${colorOf(e.c)}"></i><span class="ar-t">${p ? p.start : ''}</span><span class="ar-x${e.x ? ' x' : ''}">${rich(p ? p.text : U.firstLine(e.t))}${e.imp ? ' <b class="le-imp">!</b>' : ''}</span>${act}</div>`;
      }
      if (nf) h += stripHtml('day:' + k);
      h += '</div>';
    }
    $('#arL').innerHTML = h || (q ? `<div class="empty">No matches for “${esc(this.q)}”</div>` : '<div class="empty">Nothing archived yet. Past days land here automatically.</div>');
  },
};

const PAGES = { days: Days, calendar: Cal, notes: Notes, archive: Archive };

function go(name, arg) {
  blurActive();
  PAGES[ui.page]?.unmount?.();
  ui.page = name;
  const el = $('#page');
  el.innerHTML = ''; el.className = 'page page-' + name;
  PAGES[name].mount(el, arg);
  $$('#nav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === name));
  tick(true);
}

/* ---------- clock, day change, sync label ---------- */
let lastMin = '';
function tick(force) {
  const now = U.nowHHMM();
  $$('.clock,.mini-clock').forEach(e => { e.textContent = now; });
  const t = U.todayStr();
  if (t !== ui.today) {
    ui.today = t;
    ui.newDay = `New day · ${U.dowShort(t)} ${U.fmtDM(t)} is now D+0`;
    if (ui.page === 'days' && Days.el) { if (editingIn(Days.el)) Days.pending = true; else Days.setDate(); }
    else PAGES[ui.page].update?.();
  }
  if (isSynced()) markSynced();
  if (now !== lastMin || force) { lastMin = now; if (ui.page === 'days') Days.tickMinute(); }
  const sy = $('#sync'); if (sy) { const [txt, c] = syncLabel(); sy.textContent = txt; sy.className = 'sync ' + c; }
}

/* ---------- keyboard / viewport ---------- */
function viewportFix() {
  const vv = window.visualViewport; if (!vv) return;
  let maxH = vv.height;
  const f = () => {
    if (vv.height > maxH) maxH = vv.height;
    document.documentElement.style.setProperty('--app-h', vv.height + 'px');
    document.body.classList.toggle('kb', maxH - vv.height > 140);
    if (window.scrollY) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', f);
  addEventListener('orientationchange', () => { maxH = 0; setTimeout(f, 300); });
  f();
}

/* ---------- start ---------- */
function shell() {
  app.innerHTML = `<div id="page" class="page"></div>
    <nav class="nav" id="nav">
      <button data-nav="days" type="button">${I.list}<span>Days</span></button>
      <button data-nav="calendar" type="button">${I.cal}<span>Calendar</span></button>
      <button class="nav-plus" data-nav="plus" type="button" aria-label="New entry">${I.plus}</button>
      <button data-nav="notes" type="button">${I.folder}<span>Notes</span></button>
      <button data-nav="archive" type="button">${I.archive}<span>Archive</span></button>
    </nav>
    <div id="layer"></div>
    <div id="toast" class="toast" role="status"><span></span><button type="button">Undo</button></div>`;
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    if (b.dataset.nav === 'plus') openPlus();
    else { if (b.dataset.nav === 'days' && ui.page === 'days') Days.setOffset(0); go(b.dataset.nav); }
  });
}

function startApp(backend, user) {
  start(backend, user);
  shell();
  go('days');
  subscribe(() => { PAGES[ui.page].update?.(); updaters.forEach(f => { try { f(); } catch (e) { console.error(e); } }); });
  setInterval(() => tick(), 10000);
  if (backend.kind !== 'demo') prepareScanner();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(true); });
}

function showLogin(backend) {
  app.innerHTML = `<div class="login">
    <div class="logo">D+</div><h1>D+ Notes</h1><p class="muted">Sign in with the account you created in Firebase.</p>
    <form id="lf" class="lf"><input class="field" type="email" name="e" autocomplete="username" placeholder="Email" required>
      <input class="field" type="password" name="p" autocomplete="current-password" placeholder="Password" required>
      <button class="btn" type="submit">Sign in</button><div class="err" id="lerr"></div></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, err = $('#lerr'), btn = $('button', f);
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
    try { await backend.signIn(f.e.value.trim(), f.p.value); }
    catch (x) {
      const c = x?.code || '';
      err.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? 'Wrong email or password.'
        : /network/.test(c) ? 'No connection. Signing in needs internet the first time.'
        : /too-many/.test(c) ? 'Too many attempts. Wait a moment and try again.'
        : 'Sign-in failed: ' + (x?.message || c);
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A new version was installed in the background: reload once, but never while typing.
  let done = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || done) return;
    const reload = () => { if (done) return; if (editingIn(document.body)) return setTimeout(reload, 3000); done = true; location.reload(); };
    reload();
  });
}

async function boot() {
  registerSW();
  // If starting takes long, the phone probably thinks it is online but nothing gets through (VPN, weak signal).
  const slow = setTimeout(() => {
    const b = $('.boot small');
    if (b) b.textContent = 'Still loading… If a VPN is switched on without internet, turn it off.';
  }, 6000);
  viewportFix();
  const demo = new URLSearchParams(location.search).has('demo');
  let backend;
  try {
    const load = demo ? import('./demo.js').then(m => m.demoBackend()) : import('./firebase.js').then(m => m.firebaseBackend(CONFIG));
    backend = await Promise.race([load, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="login"><div class="logo">D+</div><h1>Can't start</h1>
      <p class="muted">The app needs internet the first time it opens on a device, so it can save itself for offline use. Connect and try again.</p>
      <button class="btn" type="button" id="rl">Try again</button></div>`;
    $('#rl').onclick = () => location.reload();
    return;
  }
  let started = false;
  backend.onAuth(user => {
    clearTimeout(slow);
    if (user && !started) { started = true; startApp(backend, user); }
    else if (!user) { if (started) location.reload(); else showLogin(backend); }
  });
}

boot();
