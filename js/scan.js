// Camera / file pickers, the crop frame, and offline text recognition (Tesseract, German + English).
// The recognition engine (~4 MB) and language data (~4 MB) download once and then work offline.

import { toCanvas, docFilter, loadBitmap } from './files.js';

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
  const c = docFilter(toCanvas(src, crop, 2400));
  const w = await getWorker();
  const { data } = await w.recognize(c);
  return cleanText(data.text || '');
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
