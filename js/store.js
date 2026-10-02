// In-memory mirror of the user's data plus a thin write API.
// Every line/entry is its own document, so sync conflicts resolve per entry (newest write wins).
//
// Collections (under users/{uid}/):
//   entries   { k, s, t, o, c?, imp?, x?, lit?, u }
//             k = 'YYYY-MM-DD' (day/plan) or 'W2026-40' (week)
//             s = 'day' (D+ notes and times) | 'plan' (calendar / week day boxes) | 'week' (week general)
//             t = text (highlights inline as ⟦c|text⟧), o = order, c = line color, x = struck, lit = never treat as time
//             Red (line color or highlight) means important; imp is an older flag that still counts.
//   days      { imp }                     id = 'YYYY-MM-DD'
//   folders   { name, p, o }              p = parent folder id or null
//   notes     { f, title, body, c?, imp? }
//   recurring { t, wd: [0..6], from, c? } wd uses JS weekday numbers (0 = Sunday)

import { parseTime, addDays, todayStr, parseYmd, weekMonday, isDateKey, isWeekKey, hasRed } from './util.js';

export const COLORS = { r: '#E5655C', o: '#D9A14B', b: '#5B8DEF', g: '#7FBF7A', p: '#A98BD8', x: '#6F7069' };
export const COLOR_KEYS = ['r', 'o', 'b', 'g', 'p', 'x'];
export const COLOR_NAMES = { r: 'Important', o: 'Deadline', b: 'Service', g: 'Training', p: 'Personal', x: 'Info' };
const COLS = ['entries', 'days', 'folders', 'notes', 'recurring'];

export const S = {
  entries: new Map(), days: new Map(), folders: new Map(), notes: new Map(), recurring: new Map(),
  user: null, kind: '', loaded: false, error: '',
  status: { online: navigator.onLine, pending: false, cache: true, lastSync: +localStorage.getItem('dplus-lastsync') || 0 },
};

let B = null, idx = null, timer = null;
const meta = {};
const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
export function emit() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }, 16);
}

export function newId() {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = ''; for (const x of crypto.getRandomValues(new Uint8Array(20))) s += c[x % 62];
  return s;
}

export function start(backend, user) {
  B = backend; S.user = user; S.kind = backend.kind;
  let waiting = COLS.length;
  for (const col of COLS) {
    meta[col] = { pending: false, cache: true };
    let first = true;
    backend.watch(user.uid, col, (changes, m) => {
      const map = S[col];
      for (const c of changes) {
        if (c.type === 'removed') map.delete(c.id); else map.set(c.id, { ...c.data, id: c.id });
      }
      if (col === 'entries' && changes.length) idx = null;
      meta[col] = m; S.error = '';
      if (first) { first = false; if (--waiting === 0) { S.loaded = true; setTimeout(cleanup, 5000); } }
      updStatus(); emit();
    }, err => {
      S.error = err?.code === 'permission-denied'
        ? 'No access to the database. The Firestore rules are not set yet.'
        : (err?.message || 'Database error');
      emit();
    });
  }
  const on = () => { updStatus(); emit(); };
  addEventListener('online', on); addEventListener('offline', on);
}

function updStatus() {
  const st = S.status;
  st.online = navigator.onLine;
  st.pending = Object.values(meta).some(m => m.pending);
  st.cache = Object.values(meta).some(m => m.cache);
  if (isSynced()) markSynced();
}
export const isSynced = () => S.status.online && !S.status.pending && !S.status.cache;
export function markSynced() { S.status.lastSync = Date.now(); try { localStorage.setItem('dplus-lastsync', S.status.lastSync); } catch {} }
export const signOut = () => B.signOut();

export function put(col, id, patch) {
  const cur = S[col].get(id) || {};
  const v = { ...cur, ...patch, u: Date.now() };
  delete v.id;
  for (const k in v) if (v[k] === undefined) delete v[k];
  S[col].set(id, { ...v, id });
  if (col === 'entries') idx = null;
  B.set(S.user.uid, col, id, v);
  emit();
  return id;
}
export function del(col, id) {
  if (!S[col].has(id)) return;
  S[col].delete(id);
  if (col === 'entries') idx = null;
  B.del(S.user.uid, col, id);
  emit();
}
export const stripId = e => { const { id, ...r } = e; return r; };

const byO = (a, b) => (a.o ?? 0) - (b.o ?? 0) || (a.id < b.id ? -1 : 1);
function index() {
  if (idx) return idx;
  idx = new Map();
  for (const e of S.entries.values()) {
    let a = idx.get(e.k); if (!a) idx.set(e.k, a = []);
    a.push(e);
  }
  for (const a of idx.values()) a.sort(byO);
  return idx;
}
export const byKey = k => index().get(k) || [];
export const entriesFor = (k, s) => byKey(k).filter(e => !s || e.s === s);
export const isTime = e => !e.lit && !!parseTime(e.t);
export const nextO = (k, s) => entriesFor(k, s).reduce((m, e) => Math.max(m, e.o || 0), 0) + 10;

export function recurringOn(d) {
  const wd = parseYmd(d).getDay();
  return [...S.recurring.values()].filter(r => (r.wd || []).includes(wd) && (!r.from || d >= r.from));
}

// Everything with a time for date d, sorted. Overnight items from the day before come first.
export function timeItems(d) {
  const items = [];
  for (const e of byKey(d)) {
    if (e.s === 'week' || e.lit) continue;
    const p = parseTime(e.t);
    if (p) items.push({ ...p, id: e.id, e, c: e.c, x: e.x, src: e.s });
  }
  for (const r of recurringOn(d)) {
    const p = parseTime(r.t);
    if (p) items.push({ ...p, id: 'rec-' + r.id, rec: r, c: r.c });
  }
  for (const e of byKey(addDays(d, -1))) {
    if (e.s === 'week' || e.lit) continue;
    const p = parseTime(e.t);
    if (p && p.end && p.end < p.start) items.push({ ...p, id: e.id + '~', e, c: e.c, x: e.x, src: e.s, carry: true });
  }
  return items.sort((a, b) => (b.carry ? 1 : 0) - (a.carry ? 1 : 0) || a.start.localeCompare(b.start) || (a.end || '').localeCompare(b.end || ''));
}

export const isImp = e => !!e && (!!e.imp || e.c === 'r' || hasRed(e.t));
export const noteImp = n => !!n && (!!n.imp || n.c === 'r' || hasRed(n.title) || hasRed(n.body));
export const dayImportant = d => !!S.days.get(d)?.imp || byKey(d).some(e => e.s !== 'week' && isImp(e));
export const dayHasEntries = d => byKey(d).some(e => e.s !== 'week' && (e.t || '').trim());

// Drop anything older than a year (archive retention).
function cleanup() {
  const cut = addDays(todayStr(), -366);
  let n = 0;
  for (const e of [...S.entries.values()]) {
    if (n >= 300) break;
    const d = isWeekKey(e.k) ? weekMonday(e.k) : e.k;
    if (isDateKey(d) && d < cut) { del('entries', e.id); n++; }
  }
  for (const id of [...S.days.keys()]) if (isDateKey(id) && id < cut && n++ < 400) del('days', id);
}
