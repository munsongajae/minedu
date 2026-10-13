// 게임 효과음: WebAudio로 직접 만든 짧은 소리(파일 없음). 단어 광산·밤을 지켜라·광산 수레가 같이 쓴다.
let ac = null, noise = null;
export function sfx(kind) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    if (!noise) {
      noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime;
    const out = ac.createGain(); out.connect(ac.destination);
    const burst = (dur, freq, q, vol) => {
      const src = ac.createBufferSource(); src.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur);
    };
    const tone = (type, f0, f1, dur, vol, at = 0) => {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(vol, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g).connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    if (kind === 'hit') burst(0.07, 2200, 1.2, 0.35);
    else if (kind === 'break') { burst(0.18, 700, 0.8, 0.45); tone('square', 660, 1320, 0.12, 0.05, 0.05); }
    else if (kind === 'bad') tone('triangle', 180, 120, 0.16, 0.18);
    else if (kind === 'tink') burst(0.04, 4000, 2, 0.15);
    else if (kind === 'shoot') { const o = ac.createBufferSource(); o.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'highpass';
      f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.15);
      const g = ac.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.17); }
    else if (kind === 'poof') { burst(0.22, 500, 0.7, 0.4); tone('square', 520, 1040, 0.1, 0.04, 0.04); tone('square', 780, 1560, 0.1, 0.04, 0.12); }
    else if (kind === 'hurt') { tone('sawtooth', 220, 90, 0.3, 0.12); burst(0.2, 300, 0.8, 0.35); }
    else if (kind === 'switch') { burst(0.05, 1500, 3, 0.25); tone('square', 300, 300, 0.04, 0.04, 0.03); }
    else if (kind === 'ding') { tone('triangle', 880, 880, 0.12, 0.13); tone('triangle', 1320, 1320, 0.22, 0.12, 0.09); }
    else if (kind === 'crash') { burst(0.32, 260, 0.6, 0.55); tone('sawtooth', 160, 60, 0.3, 0.1); }
    else if (kind === 'jump') { tone('sine', 260, 520, 0.12, 0.18); burst(0.06, 1200, 1.5, 0.15); }
    else if (kind === 'land') { burst(0.09, 800, 1.0, 0.35); tone('triangle', 180, 120, 0.08, 0.1); }
    else if (kind === 'sizzle') {
      const o = ac.createBufferSource(); o.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(1000, t + 0.45); f.Q.value = 2.5;
      const g = ac.createGain(); g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.52);
    }
    else if (kind === 'splash') { burst(0.25, 450, 0.7, 0.45); tone('sine', 300, 100, 0.2, 0.15); }
    else if (kind === 'portal') { [261, 329, 392, 523, 659].forEach((f, i) => tone('sine', f, f * 1.5, 0.28, 0.1, i * 0.07)); }
    else if (kind === 'craft') { [587, 880, 1174, 1760].forEach((f, i) => tone('triangle', f, f, 0.16, 0.14, i * 0.08)); burst(0.2, 1800, 1.5, 0.2); }
    else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.12, i * 0.13)); }
    else if (kind === 'end') { tone('triangle', 784, 784, 0.18, 0.12); tone('triangle', 659, 659, 0.18, 0.12, 0.18); tone('triangle', 523, 523, 0.35, 0.12, 0.36); }
  } catch (e) { /* 소리가 안 되는 기기 */ }
}
