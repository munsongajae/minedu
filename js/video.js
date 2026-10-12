// 장면들을 캔버스에 그리고, 목소리와 함께 MediaRecorder로 녹화해 영상 파일을 만든다.
// 실제 시간만큼 걸린다(30초 영상 = 약 30초). 오디오 시계(AudioContext.currentTime)에 맞춰 그린다.
import { drawBlockWorld } from './world.js';

export const W = 1280;
export const H = 720;
export const LEAD = 0.5;     // 장면이 시작되고 목소리가 나오기까지
export const TAIL = 0.7;     // 목소리가 끝나고 다음 장면까지
export const NO_AUDIO = 4;   // 목소리가 없는 장면 길이
export const TITLE_DUR = 3.2;
export const END_DUR = 2.8;
const FADE = 0.35;

const KID = '"Jua", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const DISP = '"Do Hyeon", "Jua", "Malgun Gothic", sans-serif';

export function sceneDur(s) {
  return s.audio && s.audioDur ? s.audioDur + LEAD + TAIL : NO_AUDIO;
}

export function totalDur(project) {
  const sc = project.scenes.filter(s => s.image);
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

function drawSubtitle(ctx, en, ko) {
  const maxW = W - 180;
  const E = en && en.trim() ? fitLines(ctx, en, maxW, 46, 30, 3, KID) : { size: 0, lines: [] };
  const K = ko && ko.trim() ? fitLines(ctx, ko, maxW, 30, 22, 2, KID) : { size: 0, lines: [] };
  if (!E.lines.length && !K.lines.length) return;
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
}

function drawCard(ctx, bmp, big, small, small2) {
  if (bmp) {
    ctx.save();
    ctx.filter = 'blur(14px) brightness(0.55)';
    const [x, y, w, h] = coverRect(bmp.width, bmp.height, 1.08);
    ctx.drawImage(bmp, x, y, w, h);
    ctx.restore();
  } else {
    drawBlockWorld(ctx, W, H, false);
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(0, 0, W, H);
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

export function drawFrame(ctx, plan, t) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const seg = plan.segs.find(s => t >= s.start && t < s.start + s.dur) || plan.segs[plan.segs.length - 1];
  const tl = Math.min(seg.dur, Math.max(0, t - seg.start));
  const by = plan.makers ? '만든 사람 · ' + plan.makers : '';
  if (seg.type === 'title') drawCard(ctx, plan.firstBmp, plan.title, by, plan.date);
  else if (seg.type === 'end') drawCard(ctx, plan.lastBmp, 'The End', by, 'Thank you for watching!');
  else {
    const p = tl / seg.dur;
    const [x, y, w, h] = coverRect(seg.bmp.width, seg.bmp.height, 1 + 0.05 * p);
    ctx.drawImage(seg.bmp, x, y, w, h);
    drawSubtitle(ctx, seg.en, plan.ko ? seg.ko : '');
  }
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
  const scenes = project.scenes.filter(s => s.image);
  try {
    await Promise.all([document.fonts.load('46px "Jua"'), document.fonts.load('92px "Do Hyeon"')]);
  } catch (e) { /* 글꼴이 없으면 기본 글꼴로 */ }

  const bmps = await Promise.all(scenes.map(s => createImageBitmap(s.image)));
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    await ac.resume();
    const bufs = await Promise.all(scenes.map(async s => {
      if (!s.audio) return null;
      try { return await ac.decodeAudioData(await s.audio.arrayBuffer()); } catch (e) { return null; }
    }));

    const d = new Date();
    const plan = {
      segs: [],
      ko: !!project.opts.ko,
      title: (project.title || '').trim() || '나의 마인크래프트 이야기',
      makers: (project.makers || '').trim(),
      date: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
      firstBmp: bmps[0],
      lastBmp: bmps[bmps.length - 1]
    };
    let t = 0;
    if (project.opts.title) { plan.segs.push({ type: 'title', start: t, dur: TITLE_DUR }); t += TITLE_DUR; }
    scenes.forEach((s, i) => {
      const dur = bufs[i] ? bufs[i].duration + LEAD + TAIL : NO_AUDIO;
      plan.segs.push({ type: 'scene', start: t, dur, bmp: bmps[i], en: s.en, ko: s.ko, buf: bufs[i] });
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
    plan.segs.forEach(sg => {
      if (!sg.buf) return;
      const src = ac.createBufferSource();
      src.buffer = sg.buf;
      src.connect(dest);
      src.start(t0 + sg.start + LEAD);
      sources.push(src);
    });
    io.onStatus('영상을 만드는 중이에요. 이 화면을 켜 두세요!');

    let cancelled = false;
    await new Promise(resolve => {
      let finished = false;
      const tick = () => {
        if (finished) return;
        const now = ac.currentTime - t0;
        drawFrame(ctx, plan, Math.max(0, Math.min(now, total - 0.001)));
        io.onProgress(Math.min(1, Math.max(0, now / total)));
        if (io.isCancelled()) cancelled = true;
        if (cancelled || now >= total + 0.25) {
          finished = true;
          clearInterval(watch);
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      // 화면이 잠깐 가려져도 끝은 감지하도록 느린 타이머를 같이 돈다.
      const watch = setInterval(tick, 400);
      requestAnimationFrame(tick);
    });

    sources.forEach(s => { try { s.stop(); } catch (e) { /* 이미 끝남 */ } });
    rec.stop();
    await stopped;
    stream.getTracks().forEach(tr => tr.stop());
    if (cancelled) return null;
    return { blob: new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }), ext, total };
  } finally {
    try { await ac.close(); } catch (e) { /* 무시 */ }
  }
}
