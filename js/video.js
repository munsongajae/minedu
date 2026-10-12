// 장면들을 캔버스에 그리고, 목소리와 함께 MediaRecorder로 녹화해 영상 파일을 만든다.
// 실제 시간만큼 걸린다(30초 영상 = 약 30초). 오디오 시계(AudioContext.currentTime)에 맞춰 그린다.
import { drawBlockWorld } from './world.js';

export const W = 1280;
export const H = 720;
export const LEAD = 0.5;     // 장면이 시작되고 첫 문장 목소리가 나오기까지
export const TAIL = 0.7;     // 마지막 문장 목소리가 끝나고 다음 장면까지
export const GAP = 0.35;     // 같은 장면 안에서 문장과 문장 사이
export const TITLE_DUR = 3.2;
export const END_DUR = 2.8;
const FADE = 0.35;

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

function drawSubtitle(ctx, en, ko, alpha = 1) {
  const maxW = W - 180;
  const E = en && en.trim() ? fitLines(ctx, en, maxW, 46, 30, 3, KID) : { size: 0, lines: [] };
  const K = ko && ko.trim() ? fitLines(ctx, ko, maxW, 30, 22, 2, KID) : { size: 0, lines: [] };
  if (!E.lines.length && !K.lines.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const eh = E.lines.length * E.size * 1.22;
  const kh = K.lines.length * K.size * 1.25;
  const gap = E.lines.length && K.lines.length ? 10 : 0;
  const boxH = eh + kh + gap + 34;
  const y0 = H - 34 - boxH;
  ctx.fillStyle = 'rgba(10, 12, 16, 0.66)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(60, y0, W - 120, boxH, 10); else ctx.rect(60, y0, W - 120, boxH);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = y0 + 17;
  ctx.font = `${E.size}px ${KID}`;
  E.lines.forEach(l => { outlined(ctx, l, W / 2, y, '#ffffff', 'rgba(0,0,0,.6)', 5); y += E.size * 1.22; });
  y += gap;
  ctx.font = `${K.size}px ${KID}`;
  K.lines.forEach(l => { outlined(ctx, l, W / 2, y, '#ffe08a', 'rgba(0,0,0,.6)', 4); y += K.size * 1.25; });
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

function drawCard(ctx, bg, big, small, small2) {
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    drawBlockWorld(ctx, W, H, false);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const T = fitLines(ctx, big, W - 200, 92, 52, 2, DISP);
  ctx.font = `${T.size}px ${DISP}`;
  const th = T.lines.length * T.size * 1.1;
  let y = H / 2 - th / 2 - (small ? 26 : 0) + T.size * 0.55;
  T.lines.forEach(l => { outlined(ctx, l, W / 2, y, '#ffffff', '#1d1a14', 10); y += T.size * 1.1; });
  if (small) { ctx.font = `36px ${KID}`; outlined(ctx, small, W / 2, y + 22, '#ffe08a', '#1d1a14', 6); }
  if (small2) { ctx.font = `26px ${KID}`; outlined(ctx, small2, W / 2, y + 74, '#e7eef3', '#1d1a14', 5); }
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

function drawPhoto(ctx, ph, zoom, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (ph.bg) {
    // 16:9가 아닌 사진(포트폴리오 사진 등): 흐린 배경 위에 사진 전체를 보여준다.
    ctx.drawImage(ph.bg, 0, 0, W, H);
    const r = Math.min(W / ph.bmp.width, H / ph.bmp.height) * zoom;
    const w = ph.bmp.width * r, h = ph.bmp.height * r;
    ctx.drawImage(ph.bmp, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const [x, y, w, h] = coverRect(ph.bmp.width, ph.bmp.height, zoom);
    ctx.drawImage(ph.bmp, x, y, w, h);
  }
  ctx.restore();
}

export function drawFrame(ctx, plan, t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const seg = plan.segs.find(s => t >= s.start && t < s.start + s.dur) || plan.segs[plan.segs.length - 1];
  const tl = Math.min(seg.dur, Math.max(0, t - seg.start));
  const by = plan.makers ? '만든 사람 · ' + plan.makers : '';
  if (seg.type === 'title') drawCard(ctx, plan.firstBg, plan.title, by, plan.date);
  else if (seg.type === 'end') { drawCard(ctx, plan.lastBg, 'The End', by, 'Thank you for watching!'); drawCredit(ctx, plan.credit, H - 40); }
  else {
    // 사진이 여러 장이면 장면 시간을 똑같이 나눠 차례로 보여주고, 넘어갈 때 살짝 겹친다.
    const P = seg.photos.length;
    const slot = seg.dur / P;
    const k = Math.min(P - 1, Math.floor(tl / slot));
    const u = tl - k * slot;
    if (k > 0 && u < XFADE) {
      drawPhoto(ctx, seg.photos[k - 1], 1 + 0.05 * Math.min(1, (slot + u) / slot), 1);
      drawPhoto(ctx, seg.photos[k], 1 + 0.05 * (u / slot), u / XFADE);
    } else {
      drawPhoto(ctx, seg.photos[k], 1 + 0.05 * (u / slot), 1);
    }
    // 지금 읽는 문장의 자막만 보여준다. 첫 문장 목소리 전에는 첫 문장을 미리 띄운다.
    let li = 0;
    for (let i = 0; i < seg.lines.length; i++) if (t >= seg.lines[i].start) li = i;
    const ln = seg.lines[li];
    const alpha = li > 0 ? Math.min(1, (t - ln.start) / 0.2 + 0.15) : 1;
    drawSubtitle(ctx, ln.en, plan.ko ? ln.ko : '', alpha);
  }
  // 끝 화면이 없으면 마지막 장면의 끝 3초 동안 위쪽에 음악 출처를 작게 보여준다.
  if (seg.type === 'scene' && seg === plan.segs[plan.segs.length - 1] && seg.dur - tl < 3) drawCredit(ctx, plan.credit, 40);
  const a = Math.min(1, tl / FADE, (seg.dur - tl) / FADE);
  if (a < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - Math.max(0, a)).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/**
 * 영상을 만든다.
 * @param {object} project
 * @param {object} io { mount(canvas), onProgress(0..1), onStatus(text), isCancelled() }
 * @returns {Promise<{blob: Blob, ext: string, total: number} | null>} 멈추면 null
 */
export async function renderVideo(project, io) {
  const scenes = project.scenes.filter(s => s.images && s.images.length);
  try {
    await Promise.all([document.fonts.load('46px "Jua"'), document.fonts.load('92px "Do Hyeon"')]);
  } catch (e) { /* 글꼴이 없으면 기본 글꼴로 */ }

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

    const d = new Date();
    const plan = {
      segs: [],
      ko: !!project.opts.ko,
      title: (project.title || '').trim() || '나의 마인크래프트 이야기',
      makers: (project.makers || '').trim(),
      date: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
      firstBg: project.opts.title ? makeBackdrop(bmps[0][0], 0.55) : null,
      lastBg: project.opts.end ? makeBackdrop(bmps.at(-1).at(-1), 0.55) : null,
      credit: music ? String(project.music.credit || '').trim() : ''
    };
    let t = 0;
    if (project.opts.title) { plan.segs.push({ type: 'title', start: t, dur: TITLE_DUR }); t += TITLE_DUR; }
    scenes.forEach((s, i) => {
      const lines = [];
      let lt = t + LEAD;
      s.lines.forEach((l, j) => {
        const buf = bufs[i][j];
        const dur = lineDur(l, buf);
        lines.push({ start: lt, dur, en: l.en, ko: l.ko, buf });
        lt += dur + GAP;
      });
      const dur = (lt - GAP) - t + TAIL;
      const photos = bmps[i].map(bmp => ({ bmp, bg: needsBackdrop(bmp) ? makeBackdrop(bmp, 0.35) : null }));
      plan.segs.push({ type: 'scene', start: t, dur, photos, lines });
      t += dur;
    });
    if (project.opts.end) { plan.segs.push({ type: 'end', start: t, dur: END_DUR }); t += END_DUR; }
    const total = t;

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
