// Demo backend (open the app with ?demo). Stores sample data in this browser only.
import { todayStr, addDays, weekKey, monday } from './util.js';

const KEY = 'dplus-demo-v1';

export function demoBackend() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!data) data = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
  save();
  return {
    kind: 'demo',
    onAuth(cb) { setTimeout(() => cb({ uid: 'demo', email: 'demo (this browser only)' }), 0); },
    async signIn() {},
    async signOut() { localStorage.removeItem(KEY); },
    watch(uid, col, cb) {
      setTimeout(() => cb(Object.entries(data[col] || {}).map(([id, d]) => ({ type: 'added', id, data: d })), { pending: false, cache: false }), 0);
    },
    set(uid, col, id, d) { (data[col] ||= {})[id] = d; save(); },
    del(uid, col, id) { if (data[col]) delete data[col][id]; save(); },
  };
}

function seed() {
  const t = todayStr(), E = {};
  let n = 0;
  const add = (k, s, text, x = {}) => { n++; E['demo' + n] = { k, s, t: text, o: n * 10, u: Date.now(), ...x }; };
  add(t, 'day', '0630-0700 PT run 5 km', { c: 'g' });
  add(t, 'day', '0800 Briefing ops room', { c: 'b' });
  add(t, 'day', '1050 Submit DSR', { c: 'o' });
  add(t, 'day', '1400-1530 Vehicle check, bay 2', { c: 'b' });
  add(t, 'day', '1900 Call home', { c: 'p' });
  add(t, 'day', 'Buy AA batteries');
  add(t, 'day', 'Pack for range');
  add(t, 'day', '☐ Ear protection');
  add(t, 'day', '☐ Notebook');
  add(t, 'day', 'Print 1000" sheets for the briefing');
  const t1 = addDays(t, 1);
  add(t1, 'day', '0700 Range day, live fire', { c: 'r', imp: true });
  add(t1, 'day', 'Return borrowed kit');
  add(addDays(t, 2), 'day', 'Laundry, call home');
  add(addDays(t, 4), 'plan', '0800 Week briefing', { c: 'b' });
  add(addDays(t, 4), 'plan', 'Leave request deadline', { c: 'o' });
  add(addDays(t, -1), 'day', '0900 Range safety briefing', { c: 'b' });
  add(addDays(t, -1), 'day', 'Buy shoe polish');
  add(addDays(t, -2), 'day', '1400 Hand in weekly report', { c: 'o' });
  add(addDays(t, -3), 'day', 'Order new boots', { c: 'p' });
  const wk = weekKey(t);
  add(wk, 'week', 'Exercise prep all week');
  add(wk, 'week', 'Hand in equipment list', { x: true });
  add(wk, 'week', 'Dress code: field uniform');
  add(weekKey(addDays(monday(t), 7)), 'week', 'Exercise week');
  add(addDays(t, 12), 'plan', '1400 Dentist', { c: 'p' });
  add(addDays(t, 20), 'plan', '0900 Written exam', { c: 'r', imp: true });
  return {
    entries: E,
    days: {},
    folders: {
      f1: { name: 'Service', p: null, o: 1 }, f2: { name: 'NCO school prep', p: 'f1', o: 2 },
      f3: { name: 'Training', p: null, o: 3 }, f4: { name: 'Personal', p: null, o: 4 },
    },
    notes: {
      n1: { f: 'f2', title: 'Reading list', body: '• Leadership basics\n• Radio procedures', c: 'b', u: 3 },
      n2: { f: 'f3', title: 'Strength plan', body: 'Mon: upper body\nWed: lower body\nFri: full body', c: 'g', u: 2 },
      n3: { f: 'f4', title: 'Gift ideas', body: '', c: 'p', u: 1 },
      n4: { f: null, title: 'App feature ideas', body: '', c: 'x', u: 1 },
    },
    recurring: { r1: { t: '2200 Lights out', wd: [0, 1, 2, 3, 4, 5, 6], from: addDays(t, -30) } },
  };
}
