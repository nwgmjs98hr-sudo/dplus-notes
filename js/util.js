// Date, time and text helpers. Dates are local 'YYYY-MM-DD' strings.

export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const todayStr = () => ymd(new Date());
// Whole days from a to b (b - a)
export const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const isDateKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k || '');
export const isWeekKey = k => /^W\d{4}-\d{2}$/.test(k || '');

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dowShort = s => DOW[parseYmd(s).getDay()];
export const dowLong = s => DOWL[parseYmd(s).getDay()];
export const fmtDM = s => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
export const fmtDMY = s => `${fmtDM(s)}.${s.slice(2, 4)}`;

export const hhmmOf = d => pad(d.getHours()) + pad(d.getMinutes());
export const nowHHMM = () => hhmmOf(new Date());
export const mins = t => +t.slice(0, 2) * 60 + +t.slice(2, 4);
export const durText = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) : ''}`;

// ISO 8601 week (Monday start)
export function isoWeek(s) {
  const d = parseYmd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // Thursday of this week
  const year = d.getFullYear();
  const t = new Date(year, 0, 4);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3); // Thursday of week 1
  return { year, week: 1 + Math.round((d - t) / (7 * 864e5)) };
}
export const weekKey = s => { const { year, week } = isoWeek(s); return `W${year}-${pad(week)}`; };
export const monday = s => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
export function weekMonday(key) {
  const [y, w] = key.slice(1).split('-').map(Number);
  const d = new Date(y, 0, 4);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (w - 1) * 7);
  return ymd(d);
}

// Highlights are stored inline as ⟦c|text⟧ (c = color key). plain() removes them.
export const MARK_RX = /⟦([a-z])\|([^⟧]*)⟧/g;
export const plain = t => (t || '').replace(MARK_RX, '$2');
export const hasRed = t => (t || '').includes('⟦r|');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const firstLine = t => (t || '').split('\n')[0];
// Escaped HTML with highlights as <mark>.
export function richHtml(t) {
  t = t || ''; let out = '', last = 0;
  for (const m of t.matchAll(MARK_RX)) {
    out += esc(t.slice(last, m.index)) + `<mark class="hl hl-${m[1]}" data-c="${m[1]}">${esc(m[2])}</mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

// "0900 Text", "0900-1050 Text". A quote right after the digits (1000" or 1000“) means a number.
const TIME_RX = /^(\d{2})(\d{2})(?:\s*[-–—]\s*(\d{2})(\d{2}))?\s+(\S.*)$/;
export function parseTime(t) {
  if (!t) return null;
  const lines = t.split('\n');
  let m = lines[0].match(TIME_RX);
  if (!m && lines[0].includes('⟦')) m = plain(lines[0]).match(TIME_RX);
  if (!m) return null;
  const [, h1, m1, h2, m2, text] = m;
  if (+h1 > 23 || +m1 > 59) return null;
  if (h2 !== undefined && (+h2 > 23 || +m2 > 59)) return null;
  return { start: h1 + m1, end: h2 !== undefined ? h2 + m2 : '', text, rest: lines.slice(1) };
}

// Dates in the form 01.02.26 (day and month may be 1 or 2 digits, year always 2 digits).
// A time right after a date ("01.02.26 0900 Arzt") belongs to that date.
const DATE_RX = /(^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{2})(?![\d])(?:\s+(\d{4}(?:\s*[-–—]\s*\d{4})?)(?=\s|$))?/g;
const MARK = '\u0000';
const CONN = '(?:und|and|&|\\+|,|/|-|–)';
export function extractDates(line) {
  const dates = []; let time = '';
  let s = (line || '').replace(DATE_RX, (all, pre, d, m, y, t) => {
    const Y = 2000 + +y, M = +m, D = +d;
    if (M < 1 || M > 12 || D < 1 || D > new Date(Y, M, 0).getDate()) return all;
    dates.push(`${Y}-${pad(M)}-${pad(D)}`);
    if (t && !time && parseTime(t + ' x')) time = t.replace(/\s+/g, '');
    else if (t) return pre + MARK + ' ' + t;
    return pre + MARK;
  });
  if (!dates.length) return null;
  // "01.02.26 und 05.02.26" -> one gap; connectors only disappear when they sit between dates
  s = s.replace(new RegExp(`${MARK}(?:\\s*${CONN}\\s*${MARK})+`, 'gi'), MARK);
  let r = s.split(MARK).map(x => x.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  r = r.replace(new RegExp(`^(${CONN}\\s*)+`, 'i'), '').replace(new RegExp(`(\\s*${CONN})+$`, 'i'), '').trim();
  if (time) r = `${time} ${r}`.trim();
  return { dates: [...new Set(dates)], rest: r };
}
