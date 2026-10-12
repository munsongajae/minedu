// 마인크래프트 에듀케이션 "포트폴리오 내보내기" PDF에서 사진을 꺼낸다.
//
// 포트폴리오 PDF는 단순하다: 첫 페이지는 표지(글자만), 그다음 페이지마다 JPEG 사진 한 장.
// 사진에는 폴라로이드 같은 밝은 테두리가 붙어 있어서, 테두리를 찾아 게임 화면만 잘라낸다.
// 외부 라이브러리 없이 PDF 바이트를 직접 읽는다. JPEG(DCTDecode) 사진만 꺼낼 수 있다.

const MIN_SIDE = 200; // 이보다 작은 그림(로고 등)은 건너뛴다

/* ---------- PDF 읽기 ---------- */

function bytesToText(bytes) {
  // 바이트 위치와 글자 위치가 1:1로 맞도록 한 바이트 = 한 글자로 바꾼다.
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

function indexObjects(text) {
  const objs = new Map(); // 번호 → { start, dictEnd, streamStart }
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(text))) {
    const num = Number(m[1]);
    const start = re.lastIndex;
    const end = text.indexOf('endobj', start);
    const streamAt = text.indexOf('stream', start);
    const hasStream = streamAt >= 0 && (end < 0 || streamAt < end);
    objs.set(num, {
      start,
      dictEnd: hasStream ? streamAt : (end < 0 ? text.length : end),
      streamKw: hasStream ? streamAt : -1,
      end: end < 0 ? text.length : end
    });
    if (end > 0) re.lastIndex = end; // 스트림 안의 바이트를 객체로 잘못 읽지 않게 건너뛴다
  }
  return objs;
}

function makeReader(bytes) {
  const text = bytesToText(bytes);
  const objs = indexObjects(text);
  const dict = (num) => {
    const o = objs.get(num);
    return o ? text.slice(o.start, o.dictEnd) : '';
  };
  const resolveNumber = (val) => {
    // "123" 또는 "13 0 R"
    const ref = /^\s*(\d+)\s+\d+\s+R/.exec(val);
    if (ref) { const n = /-?\d+/.exec(dict(Number(ref[1]))); return n ? Number(n[0]) : NaN; }
    const n = /^\s*(\d+)/.exec(val);
    return n ? Number(n[1]) : NaN;
  };
  const streamBytes = (num) => {
    const o = objs.get(num);
    if (!o || o.streamKw < 0) return null;
    let s = o.streamKw + 6;
    if (text[s] === '\r') s++;
    if (text[s] === '\n') s++;
    const d = dict(num);
    const lenMatch = /\/Length\s+(\d+\s+\d+\s+R|\d+)/.exec(d);
    let len = lenMatch ? resolveNumber(lenMatch[1]) : NaN;
    if (!(len > 0) || s + len > bytes.length) {
      let e = text.indexOf('endstream', s);
      if (e < 0) return null;
      if (text[e - 1] === '\n') e--;
      if (text[e - 1] === '\r') e--;
      len = e - s;
    }
    return bytes.subarray(s, s + len);
  };
  return { text, objs, dict, streamBytes };
}

const refsIn = (s) => [...s.matchAll(/(\d+)\s+\d+\s+R/g)].map(m => Number(m[1]));

function isImage(d) { return /\/Subtype\s*\/Image\b/.test(d); }
function isJpeg(d) { return /\/DCTDecode\b/.test(d); }
function sizeOf(d) {
  const w = /\/Width\s+(\d+)/.exec(d), h = /\/Height\s+(\d+)/.exec(d);
  return { w: w ? Number(w[1]) : 0, h: h ? Number(h[1]) : 0 };
}

// 페이지 객체 번호를 문서 순서대로
function pageOrder(r) {
  let root = null;
  for (const num of r.objs.keys()) {
    const d = r.dict(num);
    if (/\/Type\s*\/Pages\b/.test(d) && !/\/Parent\b/.test(d)) { root = num; break; }
  }
  if (root == null) return [];
  const out = [];
  const seen = new Set();
  const walk = (num) => {
    if (seen.has(num) || seen.size > 5000) return;
    seen.add(num);
    const d = r.dict(num);
    if (/\/Type\s*\/Pages\b/.test(d)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(d);
      if (kids) refsIn(kids[1]).forEach(walk);
    } else if (/\/Type\s*\/Page\b/.test(d)) out.push(num);
  };
  walk(root);
  return out;
}

// 페이지가 쓰는 그림 객체 번호들
function pageImages(r, pageNum) {
  let d = r.dict(pageNum);
  const resRef = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(d);
  if (resRef) d = r.dict(Number(resRef[1]));
  const at = d.indexOf('/XObject');
  if (at < 0) return [];
  let rest = d.slice(at + 8).trimStart();
  const indirect = /^(\d+)\s+\d+\s+R/.exec(rest);
  if (indirect) rest = r.dict(Number(indirect[1]));
  const open = rest.indexOf('<<');
  const close = rest.indexOf('>>', open);
  if (open < 0 || close < 0) return [];
  return refsIn(rest.slice(open + 2, close)).filter(n => isImage(r.dict(n)));
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate');
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  } catch (e) { return null; }
}

// 페이지 글자(괄호 문자열)만 간단히 읽는다. 표지의 월드 이름, 사진 설명 글을 위해.
async function pageStrings(r, pageNum) {
  const d = r.dict(pageNum);
  const c = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(d);
  if (!c) return [];
  const out = [];
  for (const num of refsIn(c[1])) {
    let data = r.streamBytes(num);
    if (!data) continue;
    if (/\/FlateDecode\b/.test(r.dict(num))) data = await inflate(data);
    if (!data) continue;
    const s = bytesToText(data);
    const bt = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = bt.exec(s))) {
      for (const lit of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) {
        const t = lit[1]
          .replace(/\\([nrtbf()\\])/g, (_, ch) => ({ n: '\n', r: '', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[ch]))
          .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
          .trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/**
 * PDF 바이트에서 사진과 글을 꺼낸다.
 * @returns {Promise<{ title: string, photos: { jpeg: Uint8Array, caption: string }[] }>}
 */
export async function readPortfolio(bytes) {
  const r = makeReader(bytes);
  const photos = [];
  let title = '';
  const usable = (n) => { const d = r.dict(n); const s = sizeOf(d); return isJpeg(d) && s.w >= MIN_SIDE && s.h >= MIN_SIDE; };
  const pushJpeg = (n, caption) => {
    const data = r.streamBytes(n);
    if (data && data[0] === 0xFF && data[1] === 0xD8) photos.push({ jpeg: data, caption });
  };

  const pages = pageOrder(r);
  const used = new Set();
  for (let i = 0; i < pages.length; i++) {
    const imgs = pageImages(r, pages[i]).filter(usable);
    const strings = await pageStrings(r, pages[i]).catch(() => []);
    if (!imgs.length) {
      if (i === 0 && !title) title = pickTitle(strings);
      continue;
    }
    const caption = strings.join(' ').replace(/\s+/g, ' ').trim();
    imgs.forEach((n, k) => { used.add(n); pushJpeg(n, k === 0 ? caption : ''); });
  }

  // 페이지 구조를 못 읽었을 때: 파일 안의 JPEG 사진을 차례대로
  if (!photos.length) {
    [...r.objs.keys()].sort((a, b) => a - b)
      .filter(n => !used.has(n) && isImage(r.dict(n)) && usable(n))
      .forEach(n => pushJpeg(n, ''));
  }
  return { title, photos };
}

// 표지 글: ["Portfolio", "_2__1", "My World", "Apr  5 2026"] → "My World"
function pickTitle(strings) {
  const date = /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$/;
  const cand = strings.filter(s => !/^portfolio$/i.test(s) && !/^_/.test(s) && !date.test(s) && /[\p{L}]/u.test(s));
  return cand[0] || '';
}

/* ---------- 테두리 자르기 ---------- */

/**
 * 밝은 회색 테두리 안쪽의 사진 영역을 찾는다(작게 줄인 그림에서).
 * @param {Uint8ClampedArray} data RGBA
 * @returns {{x,y,w,h}|null} 같은 크기 좌표. 테두리가 없으면 null.
 */
export function findPhotoRect(data, width, height) {
  const frame = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) < 16 && Math.min(r, g, b) > 175;
  };
  const longest = (flags) => {
    let best = [0, -1, -1], s = -1;
    for (let i = 0; i <= flags.length; i++) {
      const f = i < flags.length && flags[i];
      if (f && s < 0) s = i;
      if (!f && s >= 0) { if (i - s > best[0]) best = [i - s, s, i - 1]; s = -1; }
    }
    return best;
  };
  const colFrac = [];
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = 0; y < height; y++) if (frame((y * width + x) * 4)) n++;
    colFrac.push(n / height);
  }
  const [cw, L, R] = longest(colFrac.map(f => f < 0.5));
  if (cw < width * 0.3) return null;
  const rowFrac = [];
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = L; x <= R; x++) if (frame((y * width + x) * 4)) n++;
    rowFrac.push(n / (R - L + 1));
  }
  const [rh, T, B] = longest(rowFrac.map(f => f < 0.5));
  if (rh < height * 0.3) return null;
  const rect = { x: L, y: T, w: R - L + 1, h: B - T + 1 };
  // 테두리가 거의 없으면(이미 잘린 사진) 자르지 않는다.
  if (rect.w > width * 0.97 && rect.h > height * 0.97) return null;
  return rect;
}

// 1010×1010 포트폴리오 사진에서 게임 화면이 있는 자리(비율)
const STD = { x: 77 / 1010, y: 77 / 1010, w: 856 / 1010, h: 743 / 1010 };

// 가장자리 띠가 밝은 회색이면 테두리가 있는 사진으로 본다.
function looksFramed(ctx, w, h) {
  const band = Math.max(2, Math.round(w * 0.04));
  const d = ctx.getImageData(0, 0, w, band).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 16 && Math.min(r, g, b) > 175) n++;
  }
  return n / (d.length / 4) > 0.8;
}

async function cropFrame(jpegBytes) {
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) { return null; }
  try {
    const S = 200;
    const sc = Math.min(1, S / Math.max(bmp.width, bmp.height));
    const sw = Math.max(1, Math.round(bmp.width * sc)), sh = Math.max(1, Math.round(bmp.height * sc));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(bmp, 0, 0, sw, sh);
    let rect = findPhotoRect(sctx.getImageData(0, 0, sw, sh).data, sw, sh);
    // 정사각형 포트폴리오 사진은 테두리 위치가 늘 같다. 하늘이 아주 밝아서(눈, 구름)
    // 찾은 위치가 크게 어긋나면 표준 위치를 쓴다.
    if (Math.abs(sw - sh) <= 2) {
      const std = { x: STD.x * sw, y: STD.y * sh, w: STD.w * sw, h: STD.h * sh };
      const off = (a, b) => Math.abs(a - b) > sw * 0.04;
      if (!rect || off(rect.x, std.x) || off(rect.y, std.y) || off(rect.w, std.w) || off(rect.h, std.h)) {
        if (rect || looksFramed(sctx, sw, sh)) rect = std;
      }
    }
    if (!rect) return blob;
    // 원래 크기로 되돌리고, 테두리 선이 남지 않게 안쪽으로 조금 더 자른다.
    const k = 1 / sc, pad = Math.ceil(k) + 2;
    const x = Math.round(rect.x * k) + pad, y = Math.round(rect.y * k) + pad;
    const w = Math.round(rect.w * k) - pad * 2, h = Math.round(rect.h * k) - pad * 2;
    if (w < 100 || h < 100) return blob;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
    return await new Promise(res => c.toBlob(b => res(b || blob), 'image/jpeg', 0.92));
  } finally { bmp.close && bmp.close(); }
}

export const isPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));

/**
 * PDF 파일 → 장면에 넣을 사진들.
 * @returns {Promise<{ title: string, images: { blob: Blob, caption: string }[] }>}
 */
export async function importPortfolioPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytesToText(bytes.subarray(0, 1024)).indexOf('%PDF') < 0) throw new Error('not_pdf');
  const { title, photos } = await readPortfolio(bytes);
  const images = [];
  for (const p of photos) {
    const blob = await cropFrame(p.jpeg);
    if (blob) images.push({ blob, caption: p.caption });
  }
  return { title, images };
}
