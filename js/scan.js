// Camera / file pickers, the crop frame, and offline text recognition (Tesseract, German + English).
// The recognition engine (~4 MB) and language data (~4 MB) download once and then work offline.

import { toCanvas, loadBitmap } from './files.js';

const TESS = '7.0.0';
const TESS_JS = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS}/dist/tesseract.min.js`;

/* ---------- pickers (must be called directly from a tap) ---------- */
export function pickFile({ accept = 'image/*', camera = false } = {}) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    if (camera) i.setAttribute('capture', 'environment');
    i.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(i);
    i.addEventListener('change', () => { res(i.files?.[0] || null); i.remove(); }, { once: true });
    i.addEventListener('cancel', () => { res(null); i.remove(); }, { once: true });
    i.click();
  });
}

/* ---------- crop frame ---------- */
// Shows the photo with a frame the user drags. Resolves { src, crop } in image pixels, or null.
export async function cropImage(file, { title = 'Select the area', ok = 'Use' } = {}) {
  const src = await loadBitmap(file);
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
  const url = URL.createObjectURL(file);
  return new Promise(resolve => {
    const v = document.createElement('div');
    v.className = 'crop';
    v.innerHTML = `<div class="crop-head"><button type="button" class="link" data-x>Cancel</button><span>${title}</span><button type="button" class="pill accent" data-ok>${ok}</button></div>
      <div class="crop-stage"><img alt="" draggable="false"><div class="crop-box"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div>
      <div class="crop-foot"><button type="button" class="pill" data-all>Whole picture</button><span class="crop-msg"></span></div>`;
    document.body.appendChild(v);
    const img = v.querySelector('img'), box = v.querySelector('.crop-box'), stage = v.querySelector('.crop-stage');
    img.src = url;
    let fit = { x: 0, y: 0, w: 1, h: 1 }, r = null;
    const layout = () => {
      const sw = stage.clientWidth, sh = stage.clientHeight, k = Math.min(sw / iw, sh / ih);
      const w = iw * k, h = ih * k;
      fit = { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
      Object.assign(img.style, { left: fit.x + 'px', top: fit.y + 'px', width: w + 'px', height: h + 'px' });
      if (!r) r = { x: fit.x + w * 0.06, y: fit.y + h * 0.06, w: w * 0.88, h: h * 0.88 };
      draw();
    };
    const draw = () => Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    const clampR = () => {
      const MIN = 40;
      r.w = Math.max(MIN, Math.min(r.w, fit.w)); r.h = Math.max(MIN, Math.min(r.h, fit.h));
      r.x = Math.max(fit.x, Math.min(r.x, fit.x + fit.w - r.w)); r.y = Math.max(fit.y, Math.min(r.y, fit.y + fit.h - r.h));
    };
    requestAnimationFrame(layout);
    addEventListener('resize', layout);
    let drag = null;
    stage.addEventListener('pointerdown', e => {
      const h = e.target.dataset?.h, sr = stage.getBoundingClientRect();
      const px = e.clientX - sr.left, py = e.clientY - sr.top;
      if (!h && !box.contains(e.target)) {
        // tap outside the frame: start a new frame there
        drag = { h: 'se', x0: px, y0: py, r0: { x: px, y: py, w: 1, h: 1 } };
        r = { ...drag.r0 };
      } else drag = { h: h || 'move', x0: px, y0: py, r0: { ...r } };
      stage.setPointerCapture(e.pointerId); e.preventDefault();
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const sr = stage.getBoundingClientRect(), dx = e.clientX - sr.left - drag.x0, dy = e.clientY - sr.top - drag.y0, o = drag.r0;
      if (drag.h === 'move') r = { ...o, x: o.x + dx, y: o.y + dy };
      else {
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (drag.h.includes('w')) x1 += dx; else x2 += dx;
        if (drag.h.includes('n')) y1 += dy; else y2 += dy;
        r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      }
      clampR(); draw();
    });
    const up = () => { drag = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    const done = val => { removeEventListener('resize', layout); v.remove(); URL.revokeObjectURL(url); resolve(val); };
    v.querySelector('[data-x]').onclick = () => done(null);
    v.querySelector('[data-all]').onclick = () => { r = { ...fit }; draw(); };
    v.querySelector('[data-ok]').onclick = () => {
      const k = iw / fit.w;
      const crop = { x: Math.round((r.x - fit.x) * k), y: Math.round((r.y - fit.y) * k), w: Math.round(r.w * k), h: Math.round(r.h * k) };
      done({ src, crop, full: r.w >= fit.w - 2 && r.h >= fit.h - 2 });
    };
  });
}

/* ---------- text recognition ---------- */
let tessP = null, workerP = null, onProg = null;
function loadTess() {
  return tessP ||= new Promise((res, rej) => {
    if (window.Tesseract) return res(window.Tesseract);
    const s = document.createElement('script');
    s.src = TESS_JS; s.async = true;
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessP = null; s.remove(); rej(new Error('The scanner could not be loaded. Connect to the internet once so it can be saved for offline use.')); };
    document.head.appendChild(s);
  });
}
function getWorker() {
  return workerP ||= (async () => {
    const T = await loadTess();
    const w = await T.createWorker(['deu', 'eng'], 1, {
      // same-origin worker so the offline cache (service worker) also serves the engine
      workerPath: new URL('js/ocr-worker.js', location.href).href,
      workerBlobURL: false,
      logger: m => onProg?.(m),
    });
    await w.setParameters({ preserve_interword_spaces: '1' });
    try { localStorage.setItem('dplus-ocr', TESS); } catch {}
    return w;
  })().catch(e => { workerP = null; throw e; });
}
export const scannerReady = () => { try { return localStorage.getItem('dplus-ocr') === TESS; } catch { return false; } };

// Download the scanner in the background once, so it works offline later.
export function prepareScanner() {
  if (scannerReady() || !navigator.onLine) return;
  const go = () => getWorker().catch(() => {});
  ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 20000 }) : setTimeout(go, 15000);
}

export async function recognize(src, crop, progress) {
  onProg = m => {
    if (!progress) return;
    if (m.status === 'recognizing text') progress(`Reading text… ${Math.round(m.progress * 100)}%`);
    else if (/load|initializ/i.test(m.status)) progress('Starting the scanner…');
  };
  progress?.('Preparing the picture…');
  await new Promise(r => setTimeout(r, 30)); // let the message paint
  const c = binarize(scaled(src, crop));
  const w = await getWorker();
  const { data } = await w.recognize(c, {}, { text: true, blocks: true });
  return cleanText(goodText(data));
}

// Small crops are enlarged (the engine reads letters of about 30 px best), large ones reduced.
function scaled(src, crop) {
  const sw = crop ? crop.w : (src.naturalWidth || src.width), sh = crop ? crop.h : (src.naturalHeight || src.height);
  const k = Math.min(2, 2400 / Math.max(sw, sh));
  if (k <= 1) return toCanvas(src, crop, 2400);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, crop ? crop.x : 0, crop ? crop.y : 0, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// Turns a photo into clean black text on white, area by area:
// - light text on a dark background (projector slides, dark PowerPoint) is flipped,
// - uneven light, shadows and glare are evened out (adaptive threshold),
// - flat areas (walls, people, empty paper) become plain white.
export function binarize(c) {
  const w = c.width, h = c.height, n = w * h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.getImageData(0, 0, w, h), d = im.data;
  // grey + light 3x3 blur against camera noise and screen moiré
  let y = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) y[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  const t = new Uint8Array(n);
  for (let r = 0; r < h; r++) {
    const o = r * w;
    t[o] = y[o]; t[o + w - 1] = y[o + w - 1];
    for (let x = 1; x < w - 1; x++) t[o + x] = (y[o + x - 1] + 2 * y[o + x] + y[o + x + 1]) >> 2;
  }
  for (let r = 1; r < h - 1; r++) {
    const o = r * w;
    for (let x = 0; x < w; x++) y[o + x] = (t[o + x - w] + 2 * t[o + x] + t[o + x + w]) >> 2;
  }
  // which way round is the text? Per area: few bright pixels on dark = light text (skew > 0).
  const B = 16, gw = Math.ceil(w / B), gh = Math.ceil(h / B), gn = gw * gh;
  const s1 = new Float64Array(gn), s2 = new Float64Array(gn), s3 = new Float64Array(gn), cnt = new Float64Array(gn);
  for (let r = 0; r < h; r++) {
    const gr = ((r / B) | 0) * gw, o = r * w;
    for (let x = 0; x < w; x++) {
      const b = gr + ((x / B) | 0), v = y[o + x] / 255;
      s1[b] += v; s2[b] += v * v; s3[b] += v * v * v; cnt[b]++;
    }
  }
  const R = Math.max(3, Math.round(Math.max(w, h) / 30 / B));
  const inv = new Uint8Array(gn);
  let invCount = 0;
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    let a1 = 0, a2 = 0, a3 = 0, m = 0;
    for (let yy = Math.max(0, by - R); yy <= Math.min(gh - 1, by + R); yy++)
      for (let xx = Math.max(0, bx - R); xx <= Math.min(gw - 1, bx + R); xx++) {
        const b = yy * gw + xx; a1 += s1[b]; a2 += s2[b]; a3 += s3[b]; m += cnt[b];
      }
    const mu = a1 / m, v = a2 / m - mu * mu;
    const skew = (a3 / m - 3 * mu * v - mu * mu * mu) / Math.pow(Math.max(v, 1e-6), 1.5);
    // flat areas have no text; there only the overall brightness decides
    const flip = v < 0.002 ? mu < 0.35 : skew > 0.15;
    if (flip) { inv[by * gw + bx] = 1; invCount++; }
  }
  if (invCount) for (let r = 0; r < h; r++) {
    const gr = ((r / B) | 0) * gw, o = r * w;
    for (let x = 0; x < w; x++) if (inv[gr + ((x / B) | 0)]) y[o + x] = 255 - y[o + x];
  }
  // adaptive threshold (Bradley): ink = clearly darker than its surroundings
  const ii = new Uint32Array((w + 1) * (h + 1));
  for (let r = 0; r < h; r++) {
    let row = 0;
    const o = r * w, a = (r + 1) * (w + 1), p = r * (w + 1);
    for (let x = 0; x < w; x++) { row += y[o + x]; ii[a + x + 1] = ii[p + x + 1] + row; }
  }
  const S = Math.max(8, Math.round(Math.max(w, h) / 40)), K = 0.15, FLOOR = 14;
  for (let r = 0; r < h; r++) {
    const y1 = Math.max(0, r - S), y2 = Math.min(h, r + S + 1), o = r * w;
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - S), x2 = Math.min(w, x + S + 1);
      const area = (y2 - y1) * (x2 - x1);
      const sum = ii[y2 * (w + 1) + x2] - ii[y1 * (w + 1) + x2] - ii[y2 * (w + 1) + x1] + ii[y1 * (w + 1) + x1];
      const v = y[o + x], mean = sum / area;
      t[o + x] = v < mean * (1 - K) && mean - v > FLOOR ? 0 : 255;
    }
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) d[j] = d[j + 1] = d[j + 2] = t[i];
  g.putImageData(im, 0, 0);
  return c;
}

// Keep the lines the engine is reasonably sure about; blank line between text blocks.
function goodText(data) {
  const blocks = data?.blocks;
  if (!Array.isArray(blocks) || !blocks.length) return (data?.text || '').split('\n').filter(l => !l.trim() || !junk(l)).join('\n');
  const out = [];
  for (const b of blocks) {
    const lines = [];
    for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const s = (l.text || '').replace(/\s+$/, '');
      if (s.trim() && l.confidence >= 45 && !junk(s)) lines.push(s);
    }
    if (lines.length) out.push(lines.join('\n'));
  }
  return out.join('\n\n');
}

// Lines that are mostly symbols ("~ |= _ ;") or a lone stray character.
export function junk(s) {
  const t = s.replace(/\s/g, '');
  if (!t) return true;
  const good = (t.match(/[\p{L}\p{N}]/gu) || []).length;
  if (good / t.length < 0.5) return true;
  if (t.length <= 2 && !/^\d+$/.test(t) && !/^[\p{L}]{2}$/u.test(t)) return true;
  // long runs of mixed-case consonant soup with no vowel at all ("Fkrtzq") are noise
  const words = s.trim().split(/\s+/).filter(x => x.length >= 4 && /^\p{L}+$/u.test(x));
  if (words.length >= 2 && words.every(x => !/[aeiouäöüyAEIOUÄÖÜY]/.test(x))) return true;
  return false;
}

/* ---------- clean-up of recognized text ---------- */
const okT = t => +t.slice(0, 2) < 24 && +t.slice(2) < 60;
const MARK = '\u0001';
// "7:00", "07.00 Uhr", "7.00h" -> 0700, ranges -> 0700-0830, a single time moves to the line start.
export function normalizeTimes(text) {
  return text.split('\n').map(line => {
    let l = line.replace(/(?<![\d.:,])(\d{1,2})([:.])(\d{2})(?![\d.:,]?\d)(\s?(?:Uhr|h)\b)?/gi, (m, h, sep, mi, uhr, off, str) => {
      const atStart = /^\s*(?:[•\-–*]\s*)?$/.test(str.slice(0, off));
      if (sep === '.' && !uhr && !atStart) return m;
      if (+h > 23 || +mi > 59) return m;
      return MARK + h.padStart(2, '0') + mi;
    });
    l = l.replace(new RegExp(`${MARK}(\\d{4})\\s*(?:-|–|—|bis|to)\\s*${MARK}?(\\d{4})(?!\\d)`, 'gi'),
      (m, a, b) => (okT(a) && okT(b) ? `${MARK}${a}-${b}` : m));
    const toks = [...l.matchAll(new RegExp(`${MARK}(\\d{4}(?:-\\d{4})?)`, 'g'))];
    if (toks.length === 1) {
      const t = toks[0];
      const left = l.slice(0, t.index).replace(/^\s*[•\-–*]?\s*/, '').trimEnd(), right = l.slice(t.index + t[0].length).trimStart();
      l = [t[1], left, right].filter(Boolean).join(' ');
    }
    return l.split(MARK).join('').replace(/\s+$/, '');
  }).join('\n');
}

export function cleanText(t) {
  t = t.replace(/\r/g, '').replace(/[ \t]{3,}/g, '   ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  t = t.split('\n').map(l => l.replace(/^[•●▪■◦·]\s*/, '• ').replace(/^[-–]\s+/, '• ')).join('\n');
  return normalizeTimes(t);
}
