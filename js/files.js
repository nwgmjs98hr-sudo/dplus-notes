// Attachments: images are shrunk before saving, documents ("scan") become a small grey page.
// The file content is split into ~900 KB base64 pieces (Firestore documents max out at 1 MB),
// so everything stays in the free plan and opened files are kept on the device for offline use.

import { S, put, del, newId, rawSet, rawGet, rawDel } from './store.js';

export const MAX_FILE = 10 * 1024 * 1024;      // 10 MB per file
export const QUOTA = 1024 * 1024 * 1024;        // free Firestore storage: 1 GiB
const PIECE = 900000;                            // base64 characters per chunk (multiple of 4)
const mem = new Map();                           // fileId -> Blob, for this session

export async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.src = url; await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
const W = src => src.naturalWidth || src.width;
const H = src => src.naturalHeight || src.height;

// Draw (part of) an image onto a canvas no larger than max px on the long side.
export function toCanvas(src, crop, max) {
  const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0, sw = crop ? crop.w : W(src), sh = crop ? crop.h : H(src);
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// Grey page with stretched contrast: paper becomes white, ink dark. Small and easy to read.
export function docFilter(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, n = d.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = y; hist[y]++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.12) { hi = v; break; } }
  if (hi - lo < 30) { lo = Math.max(0, lo - 15); hi = Math.min(255, hi + 15); }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); lut[v] = Math.round(255 * Math.pow(t, 1.4)); }
  for (let i = 0; i < d.length; i += 4) { const y = lut[d[i]]; d[i] = d[i + 1] = d[i + 2] = y; }
  g.putImageData(im, 0, 0);
  return c;
}

const toBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
function thumbOf(src, crop) {
  const c = toCanvas(src, crop, 180);
  return c.toDataURL('image/jpeg', 0.6);
}

// mode: 'doc' (A4 scan, grey, ~100-250 KB) or 'photo' (color, ~150-400 KB)
export async function prepareImage(src, crop, mode) {
  const c = toCanvas(src, crop, mode === 'doc' ? 1800 : 1600);
  if (mode === 'doc') docFilter(c);
  const blob = await toBlob(c, mode === 'doc' ? 0.55 : 0.72);
  const thumb = mode === 'doc' ? (() => { const t = toCanvas(c, null, 180); return t.toDataURL('image/jpeg', 0.6); })() : thumbOf(src, crop);
  return { blob, w: c.width, h: c.height, thumb };
}

function blobToB64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function b64ToBlob(b64, mime) {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: mime });
}

export async function saveFile(blob, meta) {
  if (blob.size > MAX_FILE) throw new Error(`File is too big (${fmtSize(blob.size)}). Max ${fmtSize(MAX_FILE)}.`);
  const b64 = await blobToB64(blob);
  const id = newId(), parts = Math.max(1, Math.ceil(b64.length / PIECE));
  for (let i = 0; i < parts; i++) rawSet('chunks', `${id}_${i}`, { f: id, i, d: b64.slice(i * PIECE, (i + 1) * PIECE) });
  mem.set(id, blob);
  put('files', id, { ...meta, mime: blob.type || meta.mime || 'application/octet-stream', size: blob.size, bytes: b64.length, parts });
  return id;
}

export async function fileBlob(f) {
  if (mem.has(f.id)) return mem.get(f.id);
  const pieces = [];
  for (let i = 0; i < f.parts; i++) {
    const c = await rawGet('chunks', `${f.id}_${i}`);
    if (!c) throw new Error('missing');
    pieces.push(c.d);
  }
  const blob = b64ToBlob(pieces.join(''), f.mime);
  mem.set(f.id, blob);
  return blob;
}

export function deleteFile(f) {
  for (let i = 0; i < (f.parts || 0); i++) rawDel('chunks', `${f.id}_${i}`);
  mem.delete(f.id);
  del('files', f.id);
}

export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// Storage used in the free 1 GB: attachments (as stored) plus all text.
export function usage() {
  let files = 0, count = 0, text = 0;
  for (const f of S.files.values()) { files += (f.bytes || 0) + (f.thumb || '').length + 200; count++; }
  for (const col of ['entries', 'days', 'folders', 'notes', 'recurring']) for (const v of S[col].values()) text += JSON.stringify(v).length + 100;
  return { used: files + text, files, text, count };
}
