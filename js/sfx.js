// 게임 효과음: 실제 마인크래프트 효과음(.ogg) Web Audio 버퍼 캐시 재생 + 미탑재/로드 전 WebAudio 폴백
let ac = null, noise = null;
const bufferCache = new Map();
const loadingSet = new Set();

const SOUND_DEFS = {
  shoot:   { file: 'bow.ogg',     vol: 0.65, pitchVar: 0.08 },
  bow:     { file: 'click.ogg',   vol: 0.25, pitchVar: 0.05, synthFallback: true },
  bowhit:  { file: 'bowhit.ogg',  vol: 0.70, pitchVar: 0.12 },
  hit:     { file: 'stone.ogg',   vol: 0.55, pitchVar: 0.12 },
  break:   { file: 'stone.ogg',   vol: 0.70, pitchVar: 0.10 },
  pop:     { file: 'pop.ogg',     vol: 0.55, pitchVar: 0.20 },
  poof:    { file: 'pop.ogg',     vol: 0.60, pitchVar: 0.15 },
  fuse:    { file: 'fuse.ogg',    vol: 0.55, pitchVar: 0.04 },
  explode: { file: 'explode.ogg', vol: 0.70, pitchVar: 0.08 },
  hurt:    { file: 'hurt.ogg',    vol: 0.60, pitchVar: 0.10 },
  bad:     { file: 'hurt.ogg',    vol: 0.45, pitchVar: 0.08 },
  click:   { file: 'click.ogg',   vol: 0.40, pitchVar: 0.06 },
  switch:  { file: 'click.ogg',   vol: 0.40, pitchVar: 0.06 },
  tink:    { file: 'click.ogg',   vol: 0.35, pitchVar: 0.08 },
  ding:    { file: 'orb.ogg',     vol: 0.55, pitchVar: 0.08 },
  orb:     { file: 'orb.ogg',     vol: 0.55, pitchVar: 0.08 },
  craft:   { file: 'pop.ogg',     vol: 0.60, pitchVar: 0.06 },
  win:     { file: 'levelup.ogg', vol: 0.65, pitchVar: 0.02 },
  end:     { file: 'fall.ogg',    vol: 0.60, pitchVar: 0.06 },
  crash:   { file: 'explode.ogg', vol: 0.60, pitchVar: 0.08 },
  fall:    { file: 'fall.ogg',    vol: 0.60, pitchVar: 0.08 },
  zombie:  { file: 'zombie.ogg',  vol: 0.45, pitchVar: 0.08 },
  grass:   { file: 'grass.ogg',   vol: 0.55, pitchVar: 0.10 },
  stone:   { file: 'stone.ogg',   vol: 0.55, pitchVar: 0.12 },
};

function soundUrl(filename) {
  try {
    return new URL(`../sounds/${filename}`, import.meta.url).href;
  } catch (e) {
    return `sounds/${filename}`;
  }
}

function ensureContext() {
  if (!ac) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) ac = new AudioCtx();
  }
  if (ac && ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  return ac;
}

async function loadBuffer(filename) {
  if (!filename || bufferCache.has(filename) || loadingSet.has(filename)) {
    return bufferCache.get(filename);
  }
  const ctx = ensureContext();
  if (!ctx) return null;
  loadingSet.add(filename);
  try {
    const url = soundUrl(filename);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    bufferCache.set(filename, buf);
    return buf;
  } catch (e) {
    return null;
  } finally {
    loadingSet.delete(filename);
  }
}

export function preloadSfx() {
  try {
    ensureContext();
    const uniqueFiles = new Set(Object.values(SOUND_DEFS).map(d => d.file));
    for (const f of uniqueFiles) {
      loadBuffer(f);
    }
  } catch (e) {}
}

function playBuffer(buf, vol = 0.5, pitchVar = 0.08) {
  if (!ac || !buf) return false;
  try {
    const src = ac.createBufferSource();
    src.buffer = buf;
    const pitch = 1.0 + (Math.random() * 2 - 1) * pitchVar;
    src.playbackRate.value = Math.max(0.5, Math.min(2.0, pitch));
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(ac.destination);
    src.start(0);
    return true;
  } catch (e) {
    return false;
  }
}

function playSynth(kind, ctx) {
  try {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const out = ctx.createGain(); out.connect(ctx.destination);
    const burst = (dur, freq, q, vol) => {
      const src = ctx.createBufferSource(); src.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur);
    };
    const tone = (type, f0, f1, dur, vol, at = 0) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(vol, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g).connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    if (kind === 'hit') burst(0.07, 2200, 1.2, 0.35);
    else if (kind === 'break') { burst(0.18, 700, 0.8, 0.45); tone('square', 660, 1320, 0.12, 0.05, 0.05); }
    else if (kind === 'bad') tone('triangle', 180, 120, 0.16, 0.18);
    else if (kind === 'tink') burst(0.04, 4000, 2, 0.15);
    else if (kind === 'shoot') { const o = ctx.createBufferSource(); o.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'highpass';
      f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.15);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.17); }
    else if (kind === 'poof') { burst(0.22, 500, 0.7, 0.4); tone('square', 520, 1040, 0.1, 0.04, 0.04); tone('square', 780, 1560, 0.1, 0.04, 0.12); }
    else if (kind === 'hurt') { tone('sawtooth', 220, 90, 0.3, 0.12); burst(0.2, 300, 0.8, 0.35); }
    else if (kind === 'switch') { burst(0.05, 1500, 3, 0.25); tone('square', 300, 300, 0.04, 0.04, 0.03); }
    else if (kind === 'ding') { tone('triangle', 880, 880, 0.12, 0.13); tone('triangle', 1320, 1320, 0.22, 0.12, 0.09); }
    else if (kind === 'crash') { burst(0.32, 260, 0.6, 0.55); tone('sawtooth', 160, 60, 0.3, 0.1); }
    else if (kind === 'craft') { [587, 880, 1174, 1760].forEach((f, i) => tone('triangle', f, f, 0.16, 0.14, i * 0.08)); burst(0.2, 1800, 1.5, 0.2); }
    else if (kind === 'bow') { tone('triangle', 220, 360, 0.08, 0.12); }
    else if (kind === 'fuse') { burst(0.75, 3000, 2.5, 0.42); }
    else if (kind === 'explode') { burst(0.55, 180, 0.5, 0.65); tone('sawtooth', 120, 30, 0.38, 0.35); }
    else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.12, i * 0.13)); }
    else if (kind === 'end') { tone('triangle', 784, 784, 0.18, 0.12); tone('triangle', 659, 659, 0.18, 0.12, 0.18); tone('triangle', 523, 523, 0.35, 0.12, 0.36); }
  } catch (e) {}
}

export function sfx(kind) {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    const def = SOUND_DEFS[kind];
    if (def) {
      if (def.synthFallback) {
        playSynth(kind, ctx);
        return;
      }
      const buf = bufferCache.get(def.file);
      if (buf) {
        playBuffer(buf, def.vol, def.pitchVar);
        return;
      }
      loadBuffer(def.file);
    }
    playSynth(kind, ctx);
  } catch (e) {}
}

// 브라우저 첫 터치/클릭 시 자동 프리로드 & AudioContext 활성화
if (typeof window !== 'undefined') {
  const unlock = () => {
    preloadSfx();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}
