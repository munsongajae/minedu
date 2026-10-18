// 장면들을 캔버스에 그리고, 목소리와 함께 MediaRecorder로 녹화해 영상 파일을 만든다.
// 실제 시간만큼 걸린다(30초 영상 = 약 30초). 오디오 시계(AudioContext.currentTime)에 맞춰 그린다.
import { drawBlockWorld } from './world.js';
import { resolveFx, motionAt, compose, TRANS_DUR, clamp01, easeInOut, easeOut, backOut, rand } from './fx.js';

export const W = 1280;
export const H = 720;
export const LEAD = 0.5;     // 장면이 시작되고 첫 문장 목소리가 나오기까지
export const TAIL = 0.7;     // 마지막 문장 목소리가 끝나고 다음 장면까지
export const GAP = 0.35;     // 같은 장면 안에서 문장과 문장 사이
export const TITLE_DUR = 3.2;
export const END_DUR = 2.8;
const FADE = 0.45;          // 영상 맨 처음과 맨 끝에 까맣게 밝아지고 어두워지는 시간
const SUB_LEAD = 0.25;      // 자막은 목소리보다 조금 먼저 나온다
const READ = '#6fe3ff';     // 읽는 낱말 칠하기 색(다이아몬드 색)

const KID = '"Jua", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const DISP = '"Do Hyeon", "Jua", "Malgun Gothic", sans-serif';

// 녹음이 없는 문장은 글 길이로 보여 줄 시간을 정한다.
export function textDur(en) {
  const words = String(en || '').trim().split(/\s+/).filter(Boolean).length;
  return words ? Math.min(7, Math.max(2.5, 1.2 + words * 0.4)) : 2.5;
}
function lineDur(l, buf) {
  if (buf) return buf.duration;
  return l.audio && l.audioDur ? l.audioDur : textDur(l.en);
}
export function sceneDur(s) {
  const ds = s.lines.map(l => lineDur(l));
  return LEAD + ds.reduce((a, b) => a + b, 0) + GAP * Math.max(0, ds.length - 1) + TAIL;
}

export function totalDur(project) {
  const sc = project.scenes.filter(s => s.images && s.images.length);
  let t = sc.reduce((a, s) => a + sceneDur(s), 0);
  if (sc.length && project.opts.title) t += TITLE_DUR;
  if (sc.length && project.opts.end) t += END_DUR;
  return t;
}

export function canMakeVideo() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

function pickMime() {
  const list = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* 다음 */ }
  }
  return '';
}

function coverRect(iw, ih, scale) {
  const r = Math.max(W / iw, H / ih) * scale;
  const w = iw * r, h = ih * r;
  return [(W - w) / 2, (H - h) / 2, w, h];
}

// 띄어쓰기 기준으로 줄바꿈하고, 한 단어가 너무 길면 글자 단위로 자른다.
export function wrap(ctx, text, maxW) {
  const out = [];
  String(text).split(/\n+/).forEach(para => {
    const words = para.trim().split(/\s+/).filter(Boolean);
    let line = '';
    const breakLong = (w) => {
      let part = '';
      for (const ch of w) {
        if (ctx.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; }
        else part += ch;
      }
      return part;
    };
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) line = t;
      else if (!line) line = breakLong(w);
      else { out.push(line); line = ctx.measureText(w).width > maxW ? breakLong(w) : w; }
    }
    if (line) out.push(line);
  });
  return out;
}

function fitLines(ctx, text, maxW, size, minSize, maxLines, family) {
  let s = size, lines;
  do {
    ctx.font = `${s}px ${family}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) break;
    s -= 2;
  } while (s > minSize);
  return { size: s, lines: lines.slice(0, maxLines) };
}

function outlined(ctx, text, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function subLayout(ctx, en, ko) {
  const maxW = W - 180;
  const E = en && en.trim() ? fitLines(ctx, en, maxW, 46, 30, 3, KID) : { size: 0, lines: [] };
  const K = ko && ko.trim() ? fitLines(ctx, ko, maxW, 30, 22, 2, KID) : { size: 0, lines: [] };
  if (!E.lines.length && !K.lines.length) return null;
  const eh = E.lines.length * E.size * 1.22;
  const kh = K.lines.length * K.size * 1.25;
  const gap = E.lines.length && K.lines.length ? 10 : 0;
  const boxH = eh + kh + gap + 34;
  return { E, K, eh, gap, boxH, y0: H - 34 - boxH };
}

// 줄마다 낱말이 놓일 자리(가운데 맞춤 줄 안에서)
function wordSpots(ctx, lines, size, yTop, lh) {
  ctx.font = `${size}px ${KID}`;
  const sp = ctx.measureText(' ').width;
  const out = [];
  lines.forEach((line, r) => {
    let x = W / 2 - ctx.measureText(line).width / 2;
    line.split(' ').forEach(w => {
      const ww = ctx.measureText(w).width;
      out.push({ w, x, y: yTop + r * lh, ww });
      x += ww + sp;
    });
  });
  return out;
}

/**
 * 자막 하나. mode: plain(그냥) | rise(아래에서 쏙) | pop(낱말 톡톡) | karaoke(읽는 낱말 칠하기)
 * t는 영상 전체 시간. 효과는 목소리보다 SUB_LEAD초 먼저 시작한다.
 */
function drawSubtitle(ctx, ln, ko, t, mode) {
  const L = subLayout(ctx, ln.en, ko);
  if (!L) return;
  const q = t - (ln.start - SUB_LEAD);
  let alpha, dy = 0;
  if (mode === 'rise') { const k = easeOut(q / 0.45); alpha = k; dy = (1 - k) * 46; }
  else if (mode === 'plain') alpha = clamp01(0.35 + q / 0.15);
  else alpha = clamp01(q / 0.2);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(10, 12, 16, 0.66)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(60, L.y0, W - 120, L.boxH, 10); else ctx.rect(60, L.y0, W - 120, L.boxH);
  ctx.fill();
  ctx.textBaseline = 'top';
  const yE = L.y0 + 17;
  const lh = L.E.size * 1.22;
  let koAlpha = 1;
  if ((mode === 'pop' || mode === 'karaoke') && L.E.lines.length) {
    const spots = wordSpots(ctx, L.E.lines, L.E.size, yE, lh);
    ctx.textAlign = 'left';
    if (mode === 'pop') {
      const n = spots.length;
      const step = Math.min(0.3, Math.max(0.1, (ln.dur * 0.6) / n));
      spots.forEach((s, i) => {
        const wq = (q - 0.1 - i * step) / 0.3;
        if (wq <= 0) return;
        const sc = 0.4 + 0.6 * backOut(wq);
        ctx.save();
        ctx.globalAlpha = alpha * clamp01(wq * 2.5);
        ctx.translate(s.x + s.ww / 2, s.y + L.E.size / 2);
        ctx.scale(sc, sc);
        outlined(ctx, s.w, -s.ww / 2, -L.E.size / 2, '#ffffff', 'rgba(0,0,0,.6)', 5);
        ctx.restore();
      });
      koAlpha = clamp01((q - 0.1 - n * step) / 0.3);
    } else {
      // 녹음 길이 안에서 글자 수만큼 나눠 지금 읽는 낱말을 칠한다(대강 맞춤).
      const lens = spots.map(s => s.w.replace(/[^A-Za-z0-9']/g, '').length || 1);
      const tot = lens.reduce((a, b) => a + b, 0);
      const started = t >= ln.start;
      const pr = clamp01((t - ln.start) / Math.max(0.5, ln.dur * 0.92)) * tot;
      let acc = 0;
      spots.forEach((s, i) => {
        const a0 = acc, a1 = acc + lens[i];
        acc = a1;
        const done = started && pr >= a1, now = started && pr >= a0 && pr < a1;
        ctx.save();
        if (now) { ctx.translate(s.x + s.ww / 2, s.y + L.E.size / 2); ctx.scale(1.08, 1.08); ctx.translate(-(s.x + s.ww / 2), -(s.y + L.E.size / 2)); }
        outlined(ctx, s.w, s.x, s.y, done || now ? READ : '#ffffff', 'rgba(0,0,0,.7)', 5);
        ctx.restore();
      });
    }
  } else {
    ctx.textAlign = 'center';
    ctx.font = `${L.E.size}px ${KID}`;
    L.E.lines.forEach((l, r) => outlined(ctx, l, W / 2, yE + r * lh, '#ffffff', 'rgba(0,0,0,.6)', 5));
  }
  if (koAlpha > 0 && L.K.lines.length) {
    ctx.globalAlpha = alpha * koAlpha;
    ctx.textAlign = 'center';
    ctx.font = `${L.K.size}px ${KID}`;
    let y = yE + L.eh + L.gap;
    L.K.lines.forEach(l => { outlined(ctx, l, W / 2, y, '#ffe08a', 'rgba(0,0,0,.6)', 4); y += L.K.size * 1.25; });
  }
  ctx.restore();
}

// 사진을 아주 작게 줄였다가 다시 키워서 흐린 배경을 한 번만 만들어 둔다(매 프레임 흐리게 하면 태블릿이 느려짐).
function makeBackdrop(bmp, darkness) {
  const tiny = document.createElement('canvas');
  tiny.width = 48; tiny.height = 27;
  const tctx = tiny.getContext('2d');
  const r = Math.max(48 / bmp.width, 27 / bmp.height) * 1.1;
  const w = bmp.width * r, h = bmp.height * r;
  tctx.drawImage(bmp, (48 - w) / 2, (27 - h) / 2, w, h);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tiny, 0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${darkness})`;
  ctx.fillRect(0, 0, W, H);
  return c;
}

// 16:9에서 많이 벗어난 사진인가(위아래나 양옆이 많이 잘리는가)
function needsBackdrop(bmp) {
  const a = bmp.width / bmp.height;
  return Math.abs(a - W / H) > 0.2;
}

function drawCredit(ctx, credit, y) {
  if (!credit) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const T = fitLines(ctx, '♪ ' + credit, W - 160, 22, 16, 1, KID);
  ctx.font = `${T.size}px ${KID}`;
  outlined(ctx, T.lines[0] || '', W / 2, y, '#e7eef3', 'rgba(0,0,0,.7)', 4);
  ctx.restore();
}

/**
 * 제목 화면·끝 화면. anim이면 글자가 블록처럼 하나씩 떨어져 쌓이고(닿을 때 작은 가루),
 * 아래 작은 글은 그다음에 올라오고, 배경은 천천히 다가간다. sparkle이면 끝에 픽셀이 펑 흩어지고 별이 반짝인다.
 */
function drawCard(ctx, bg, big, small, small2, tl = 0, anim = false, sparkle = false) {
  ctx.save();
  if (anim) {
    const s = 1 + 0.06 * clamp01(tl / 3.2);
    ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  }
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    drawBlockWorld(ctx, W, H, false);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  ctx.save();
  ctx.textBaseline = 'middle';
  const T = fitLines(ctx, big, W - 200, 92, 52, 2, DISP);
  ctx.font = `${T.size}px ${DISP}`;
  const th = T.lines.length * T.size * 1.1;
  let y = H / 2 - th / 2 - (small ? 26 : 0) + T.size * 0.55;
  let smallAlpha = 1, smallOff = 0, tSmall = 0;
  if (!anim) {
    ctx.textAlign = 'center';
    T.lines.forEach(l => { outlined(ctx, l, W / 2, y, '#ffffff', '#1d1a14', 10); y += T.size * 1.1; });
  } else {
    const n = T.lines.reduce((a, l) => a + [...l].length, 0);
    const st = Math.min(0.08, 0.9 / Math.max(1, n));
    let j = 0;
    ctx.textAlign = 'left';
    T.lines.forEach(line => {
      const x0 = W / 2 - ctx.measureText(line).width / 2;
      let pre = '';
      for (const ch of line) {
        const x = x0 + ctx.measureText(pre).width;
        pre += ch;
        const q = (tl - 0.2 - j * st) / 0.5;
        j++;
        if (q <= 0 || ch === ' ') continue;
        ctx.save();
        ctx.globalAlpha = clamp01(q * 3);
        outlined(ctx, ch, x, y - (1 - backOut(q)) * 110, '#ffffff', '#1d1a14', 10);
        ctx.restore();
        if (q > 0.55 && q < 1.6) {
          // 글자가 닿을 때 작은 블록 가루가 양옆으로 튄다
          const k = (q - 0.55) / 1.05, cw = ctx.measureText(ch).width;
          for (let d = 0; d < 3; d++) {
            const side = d % 2 ? 1 : -1, r = rand(j * 13 + d), sz = 6 + Math.round(r * 4);
            ctx.fillStyle = `rgba(255,224,138,${((1 - k) * 0.9).toFixed(3)})`;
            ctx.fillRect(x + cw / 2 + side * (cw * 0.3 + k * (30 + r * 30)) - sz / 2, y + T.size * 0.38 - k * (20 + r * 25) + k * k * 40, sz, sz);
          }
        }
      }
      y += T.size * 1.1;
    });
    tSmall = 0.2 + n * st + 0.35;
    const k = easeOut((tl - tSmall) / 0.45);
    smallAlpha = k; smallOff = (1 - k) * 24;
  }
  if (smallAlpha > 0) {
    ctx.globalAlpha = smallAlpha;
    ctx.textAlign = 'center';
    if (small) { ctx.font = `36px ${KID}`; outlined(ctx, small, W / 2, y + 22 + smallOff, '#ffe08a', '#1d1a14', 6); }
    if (small2) { ctx.font = `26px ${KID}`; outlined(ctx, small2, W / 2, y + 74 + smallOff, '#e7eef3', '#1d1a14', 5); }
  }
  ctx.restore();
  if (anim && sparkle) drawSparkles(ctx, tl - tSmall + 0.1);
}

const SPARK = ['#ffd54a', '#5fe08a', '#6fe3ff', '#ffffff', '#ff7a5c'];
function drawSparkles(ctx, u) {
  if (u <= 0) return;
  ctx.save();
  // 가운데에서 픽셀이 펑 흩어지고 아래로 떨어진다
  const LIFE = 1.7;
  for (let i = 0; i < 70; i++) {
    const d = u - (i % 3) * 0.05;
    if (d <= 0 || d > LIFE) continue;
    const a = rand(i) * Math.PI * 2, v = 260 + rand(i + 50) * 520;
    const x = W / 2 + Math.cos(a) * v * d;
    const y = H / 2 - 20 + Math.sin(a) * v * d * 0.75 + 380 * d * d;
    const sz = 6 + Math.floor(rand(i + 90) * 4) * 3;
    ctx.globalAlpha = clamp01(1 - d / LIFE);
    ctx.fillStyle = SPARK[i % SPARK.length];
    ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
  }
  // 여기저기 작은 별이 반짝인다
  for (let i = 0; i < 26; i++) {
    const x = 60 + rand(i + 200) * (W - 120), y = 40 + rand(i + 300) * (H - 80);
    const a = clamp01((u - rand(i + 400) * 0.8) / 0.3) * (0.5 + 0.5 * Math.sin(u * 5 + i * 1.7));
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe08a';
    ctx.fillRect(x - 2, y - 8, 4, 16);
    ctx.fillRect(x - 8, y - 2, 16, 4);
  }
  ctx.restore();
}

const XFADE = 0.5; // 같은 장면 안에서 사진이 넘어갈 때 겹치는 시간

// 배경 음악 크기 곡선: 처음 1.5초 동안 커지고, 끝 2초 동안 작아지고,
// 목소리가 나오는 동안에는 30%로 줄인다(문장 사이 짧은 틈은 이어서 줄인 채로).
export const MUSIC_DUCK = 0.3;
export function musicEnvelope(vol, total, voice, step = 0.05) {
  const merged = [];
  [...voice].sort((a, b) => a[0] - b[0]).forEach(([a, b]) => {
    const last = merged[merged.length - 1];
    if (last && a - last[1] < 0.8) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  });
  const IN = 0.3, OUT = 0.5; // 줄어들 때, 다시 커질 때 걸리는 시간
  const duckAt = (t) => {
    let g = 1;
    for (const [a, b] of merged) {
      let d = 1;
      if (t >= a && t <= b) d = 0;
      else if (t < a && t > a - IN) d = (a - t) / IN;
      else if (t > b && t < b + OUT) d = (t - b) / OUT;
      g = Math.min(g, MUSIC_DUCK + (1 - MUSIC_DUCK) * d);
    }
    return g;
  };
  const n = Math.max(2, Math.ceil(total / step) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(total, i * step);
    const fade = Math.min(1, t / 1.5, (total - t) / 2);
    out[i] = Math.max(0, vol * Math.max(0, fade) * duckAt(t));
  }
  return out;
}

// mo = { s: 크기, dx: 보이는 곳(-1 왼쪽 ~ 1 오른쪽) } (fx.js motionAt)
function drawPhoto(ctx, ph, mo, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const iw = ph.bmp.width, ih = ph.bmp.height;
  if (ph.bg) {
    // 16:9가 아닌 사진(포트폴리오 사진 등): 흐린 배경 위에 사진 전체를 보여준다.
    ctx.drawImage(ph.bg, 0, 0, W, H);
    const r = Math.min(W / iw, H / ih) * mo.s;
    const w = iw * r, h = ih * r;
    ctx.drawImage(ph.bmp, (W - w) / 2 - mo.dx * 60, (H - h) / 2, w, h);
  } else {
    const r = Math.max(W / iw, H / ih) * mo.s;
    const w = iw * r, h = ih * r;
    ctx.drawImage(ph.bmp, (W - w) / 2 - mo.dx * (w - W) / 2, (H - h) / 2, w, h);
  }
  ctx.restore();
}

// 한 장면(제목·장면·끝)을 그 장면 안의 시간 tl에 그린다. tl은 장면 길이를 넘을 수 있다(다음 장면과 겹칠 때).
function drawSeg(ctx, plan, seg, tl) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const by = plan.makers ? '만든 사람 · ' + plan.makers : '';
  if (seg.type === 'title') drawCard(ctx, plan.firstBg, plan.title, by, plan.date, tl, plan.cards, false);
  else if (seg.type === 'end') {
    drawCard(ctx, plan.lastBg, 'The End', by, 'Thank you for watching!', tl, plan.cards, true);
    drawCredit(ctx, plan.credit, H - 40);
  } else {
    // 사진이 여러 장이면 장면 시간을 똑같이 나눠 차례로 보여주고, 넘어갈 때 살짝 겹친다.
    const P = seg.photos.length;
    const slot = seg.dur / P;
    const k = Math.min(P - 1, Math.floor(Math.max(0, tl) / slot));
    const u = tl - k * slot;
    const mo = (j, uu) => motionAt(seg.photos[j].move, uu / slot, !!seg.photos[j].bg);
    if (k > 0 && u < XFADE) {
      drawPhoto(ctx, seg.photos[k - 1], mo(k - 1, slot + u), 1);
      drawPhoto(ctx, seg.photos[k], mo(k, u), easeInOut(u / XFADE));
    } else {
      drawPhoto(ctx, seg.photos[k], mo(k, u), 1);
    }
    // 지금 읽는 문장의 자막만 보여준다.
    const ta = seg.start + tl;
    let li = 0;
    for (let i = 0; i < seg.lines.length; i++) if (ta >= seg.lines[i].start - SUB_LEAD) li = i;
    const ln = seg.lines[li];
    if (ln) drawSubtitle(ctx, ln, plan.ko ? ln.ko : '', ta, plan.sub);
    // 끝 화면이 없으면 마지막 장면의 끝 3초 동안 위쪽에 음악 출처를 작게 보여준다.
    if (seg === plan.segs[plan.segs.length - 1] && seg.dur - tl < 3) drawCredit(ctx, plan.credit, 40);
  }
}

function layers(plan) {
  if (!plan.layers) {
    plan.layers = [0, 1].map(() => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c.getContext('2d');
    });
  }
  return plan.layers;
}

export function drawFrame(ctx, plan, t) {
  const segs = plan.segs;
  let i = segs.findIndex(s => t >= s.start && t < s.start + s.dur);
  if (i < 0) i = segs.length - 1;
  const seg = segs[i];
  const tl = Math.max(0, t - seg.start);
  const TR = i > 0 ? (TRANS_DUR[seg.trans] || 0) : 0;
  if (TR && tl < TR) {
    // 장면 넘김: 앞 장면(계속 움직이는 채로)과 새 장면을 따로 그려서 합친다.
    const [a, b] = layers(plan);
    const prev = segs[i - 1];
    drawSeg(a, plan, prev, prev.dur + tl);
    drawSeg(b, plan, seg, tl);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    compose(ctx, seg.trans, tl / TR, a.canvas, b.canvas, W, H);
  } else {
    drawSeg(ctx, plan, seg, tl);
  }
  // 영상 맨 처음과 맨 끝
  const total = plan.total || (seg.start + seg.dur);
  const fa = Math.min(1, t / FADE, (total - t) / FADE);
  if (fa < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - Math.max(0, fa)).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// 영상 계획: 장면마다 시작 시간·길이·문장 시간·사진 움직임·넘김 효과
function buildPlan(project, scenes, bmps, bufs, hasMusic) {
  const fx = resolveFx(project, scenes);
  const d = new Date();
  const plan = {
    segs: [],
    ko: !!project.opts.ko,
    sub: fx.sub,
    cards: fx.cards,
    title: (project.title || '').trim() || '나의 마인크래프트 이야기',
    makers: (project.makers || '').trim(),
    date: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
    firstBg: project.opts.title ? makeBackdrop(bmps[0][0], 0.55) : null,
    lastBg: project.opts.end ? makeBackdrop(bmps.at(-1).at(-1), 0.55) : null,
    credit: hasMusic ? String(project.music.credit || '').trim() : ''
  };
  let t = 0;
  if (project.opts.title) { plan.segs.push({ type: 'title', start: t, dur: TITLE_DUR, trans: 'fade' }); t += TITLE_DUR; }
  scenes.forEach((s, i) => {
    const lines = [];
    let lt = t + LEAD;
    s.lines.forEach((l, j) => {
      const buf = bufs ? bufs[i][j] : null;
      const dur = lineDur(l, buf);
      lines.push({ start: lt, dur, en: l.en, ko: l.ko, buf });
      lt += dur + GAP;
    });
    const dur = (lt - GAP) - t + TAIL;
    const photos = bmps[i].map((bmp, k) => ({ bmp, bg: needsBackdrop(bmp) ? makeBackdrop(bmp, 0.35) : null, move: fx.scenes[i].moves[k] }));
    plan.segs.push({ type: 'scene', start: t, dur, photos, lines, trans: fx.scenes[i].trans });
    t += dur;
  });
  if (project.opts.end) { plan.segs.push({ type: 'end', start: t, dur: END_DUR, trans: fx.endTrans }); t += END_DUR; }
  plan.total = t;
  return plan;
}

async function loadFonts() {
  try {
    await Promise.all([document.fonts.load('46px "Jua"'), document.fonts.load('92px "Do Hyeon"')]);
  } catch (e) { /* 글꼴이 없으면 기본 글꼴로 */ }
}

/**
 * 효과 미리 보기: 녹화하지 않고 소리 없이 캔버스에 바로 재생한다.
 * @param {object} io { mount(canvas), onProgress(0..1), onEnd() }
 * @returns {Promise<{ stop(): void }>}
 */
export async function makePlan(project) {
  const scenes = project.scenes.filter(s => s.images && s.images.length);
  await loadFonts();
  const bmps = await Promise.all(scenes.map(s => Promise.all(s.images.map(b => createImageBitmap(b)))));
  return buildPlan(project, scenes, bmps, null, !!(project.music && project.music.blob));
}
export async function previewVideo(project, io) {
  const plan = await makePlan(project);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, plan, 0);
  io.mount(canvas);
  let on = true;
  const t0 = performance.now();
  const loop = () => {
    if (!on) return;
    const t = (performance.now() - t0) / 1000;
    drawFrame(ctx, plan, Math.min(t, plan.total - 0.001));
    io.onProgress && io.onProgress(Math.min(1, t / plan.total));
    if (t >= plan.total) { on = false; io.onEnd && io.onEnd(); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { stop() { on = false; } };
}

/**
 * 영상을 만든다.
 * @param {object} project
 * @param {object} io { mount(canvas), onProgress(0..1), onStatus(text), isCancelled() }
 * @returns {Promise<{blob: Blob, ext: string, total: number} | null>} 멈추면 null
 */
export async function renderVideo(project, io) {
  const scenes = project.scenes.filter(s => s.images && s.images.length);
  await loadFonts();

  const bmps = await Promise.all(scenes.map(s => Promise.all(s.images.map(b => createImageBitmap(b)))));
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    await ac.resume();
    const decode = async (blob) => {
      if (!blob) return null;
      try { return await ac.decodeAudioData(await blob.arrayBuffer()); } catch (e) { return null; }
    };
    const bufs = await Promise.all(scenes.map(s => Promise.all(s.lines.map(l => decode(l.audio)))));
    const music = project.music && project.music.blob ? await decode(project.music.blob) : null;

    const plan = buildPlan(project, scenes, bmps, bufs, !!music);
    const total = plan.total;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    io.mount(canvas);
    drawFrame(ctx, plan, 0);

    const dest = ac.createMediaStreamDestination();
    // 목소리가 없는 구간에도 소리 트랙에 (들리지 않는) 소리가 계속 흐르게 한다.
    // 소리가 끊기면 mp4 녹화가 앞부분만 저장되고 잘리는 문제가 있다.
    const hum = ac.createOscillator();
    const mute = ac.createGain();
    mute.gain.value = 0.00001;
    hum.connect(mute).connect(dest);
    hum.start();
    const vs = canvas.captureStream(30);
    const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : { videoBitsPerSecond: 5_000_000 });
    const ext = (rec.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.start(500);

    const t0 = ac.currentTime + 0.2;
    const sources = [];
    plan.segs.forEach(sg => (sg.lines || []).forEach(ln => {
      if (!ln.buf) return;
      const src = ac.createBufferSource();
      src.buffer = ln.buf;
      src.connect(dest);
      src.start(t0 + ln.start);
      sources.push(src);
    }));
    if (music) {
      const voice = [];
      plan.segs.forEach(sg => (sg.lines || []).forEach(ln => { if (ln.buf) voice.push([ln.start, ln.start + ln.buf.duration]); }));
      const vol = Math.min(1, Math.max(0, Number(project.music.vol) || 0.3));
      const gain = ac.createGain();
      gain.gain.value = 0;
      gain.gain.setValueCurveAtTime(musicEnvelope(vol, total, voice), t0, total);
      const src = ac.createBufferSource();
      src.buffer = music;
      src.loop = music.duration < total;   // 음악이 영상보다 짧으면 반복
      src.connect(gain).connect(dest);
      src.start(t0);
      sources.push(src);
    }
    io.onStatus('영상을 만드는 중이에요. 이 화면을 켜 두세요!');

    let cancelled = false;
    await new Promise(resolve => {
      let finished = false;
      let lastStep = 0;
      // 한 번 그리고, 끝났는지 확인한다.
      const step = () => {
        if (finished) return;
        lastStep = performance.now();
        const now = ac.currentTime - t0;
        drawFrame(ctx, plan, Math.max(0, Math.min(now, total - 0.001)));
        io.onProgress(Math.min(1, Math.max(0, now / total)));
        if (io.isCancelled()) cancelled = true;
        if (cancelled || now >= total + 0.25) {
          finished = true;
          clearInterval(watch);
          resolve();
        }
      };
      // 화면 그리기 흐름은 하나만 돈다.
      const loop = () => { step(); if (!finished) requestAnimationFrame(loop); };
      // 화면이 가려져 그리기가 멈춰도 끝은 감지하도록, 느린 타이머가 대신 한 번씩 그린다.
      const watch = setInterval(() => { if (performance.now() - lastStep > 300) step(); }, 400);
      requestAnimationFrame(loop);
    });

    sources.forEach(s => { try { s.stop(); } catch (e) { /* 이미 끝남 */ } });
    try { hum.stop(); } catch (e) { /* 이미 끝남 */ }
    rec.stop();
    await stopped;
    stream.getTracks().forEach(tr => tr.stop());
    if (cancelled) return null;
    return { blob: new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }), ext, total };
  } finally {
    try { await ac.close(); } catch (e) { /* 무시 */ }
  }
}
