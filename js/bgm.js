// js/bgm.js — 마인크래프트 감성 Web Audio 실시간 BGM 신디사이저
// 대용량 외부 파일 없이 순수 Web Audio API로 각 게임 분위기에 맞춘 몰입감 넘치는 배경 음악을 연주합니다.

let ac = null;
let currentTheme = null;
let masterGain = null;
let stepTimer = null;
let isMuted = false;

// 브라우저 로컬 저장소에서 음소거 설정 불러오기
try {
  isMuted = localStorage.getItem('block-studio-bgm-mute') === '1';
} catch (_) {}

function getAudioContext() {
  if (!ac) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      ac = new AudioCtx();
      masterGain = ac.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.38, ac.currentTime);
      masterGain.connect(ac.destination);
    }
  }
  if (ac && ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  return ac;
}

// 부드러운 칼림바/신스 피아노 톤 연주 헬퍼
function playNote({ freq, dur = 0.5, type = 'sine', vol = 0.3, detune = 0, pan = 0, delay = 0 }) {
  if (!ac || isMuted || !currentTheme) return;
  const t = ac.currentTime + delay;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);

  // 로우패스 필터로 부드럽고 따뜻한 마인크래프트 로파이 톤 연출
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(type === 'sawtooth' ? 1400 : 2600, t);
  filter.Q.setValueAtTime(1.5, t);

  // 엔벨로프 (부드러운 어택 + 긴 서스테인 & 릴리즈)
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// 주파수 변환 헬퍼 (음이름 -> Hz)
const NOTES = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50,
  // 샵/플랫
  Db3: 138.59, Eb3: 155.56, Fs3: 185.00, Ab3: 207.65, Bb3: 233.08,
  Db4: 277.18, Eb4: 311.13, Fs4: 369.99, Ab4: 415.30, Bb4: 466.16,
  Db5: 554.37, Eb5: 622.25, Fs5: 739.99, Ab5: 830.61, Bb5: 932.33
};

/* ---------------- 각 게임별 마인크래프트 맞춤 BGM 악보 ---------------- */

// 1. cart (광산 수레 달리기): 신나고 덜컹거리는 롤러코스터 레일 칩튠 (128 BPM)
const CART_TRACK = {
  bpm: 128,
  steps: 16,
  play: (step) => {
    // 통통 튀는 베이스라인
    const bassSeq = ['C2', null, 'C3', null, 'G2', null, 'Bb2', null, 'C2', null, 'C3', 'G2', 'Bb2', null, 'G2', null];
    const b = bassSeq[step];
    if (b && NOTES[b]) {
      playNote({ freq: NOTES[b], dur: 0.22, type: 'triangle', vol: 0.35 });
    }
    // 경쾌한 아르페지오 멜로디
    const leadSeq = [
      'C4', 'Eb4', 'G4', 'Bb4', 'C5', 'G4', 'Eb4', 'C4',
      'Bb3', 'D4', 'F4', 'Ab4', 'Bb4', 'F4', 'D4', 'Bb3'
    ];
    const l = leadSeq[step];
    if (l && NOTES[l]) {
      playNote({ freq: NOTES[l], dur: 0.28, type: 'square', vol: 0.12, detune: 4 });
    }
  }
};

// 2. mine (단어 광산): 지하 동굴의 영롱한 보석/칼림바 탐험곡 (106 BPM)
const MINE_TRACK = {
  bpm: 106,
  steps: 16,
  play: (step) => {
    // 맑은 칼림바 보석 아르페지오
    const notes = [
      'G4', null, 'B4', 'D5', null, 'G5', 'D5', null,
      'E4', null, 'G4', 'B4', null, 'E5', 'B4', 'G4'
    ];
    const n = notes[step];
    if (n && NOTES[n]) {
      playNote({ freq: NOTES[n], dur: 0.65, type: 'sine', vol: 0.26 });
      playNote({ freq: NOTES[n] * 2, dur: 0.35, type: 'triangle', vol: 0.08, delay: 0.02 });
    }
    // 은은한 저음 패드 (4박자마다)
    if (step % 8 === 0) {
      const pad = step === 0 ? 'G2' : 'E2';
      playNote({ freq: NOTES[pad], dur: 1.8, type: 'triangle', vol: 0.3 });
    }
  }
};

// 3. night (밤을 지켜라): 어두운 밤 평원의 긴장감 넘치는 서스펜스 디펜스 (96 BPM)
const NIGHT_TRACK = {
  bpm: 96,
  steps: 16,
  play: (step) => {
    // 묵직한 펄스 베이스
    const bassSeq = ['A1', null, 'A1', null, 'E2', null, 'G2', null, 'F2', null, 'F2', null, 'D2', null, 'E2', null];
    const b = bassSeq[step];
    if (b && NOTES[b]) {
      playNote({ freq: NOTES[b], dur: 0.35, type: 'sawtooth', vol: 0.22 });
    }
    // 서스펜스 단조 스트링
    const leadSeq = [
      'A3', null, 'C4', null, 'E4', null, 'Ab4', null,
      'F4', null, 'D4', null, 'E4', null, 'B3', null
    ];
    const l = leadSeq[step];
    if (l && NOTES[l]) {
      playNote({ freq: NOTES[l], dur: 0.5, type: 'triangle', vol: 0.18, detune: -5 });
    }
  }
};

// 4. craft (조합대 제작소): 마인크래프트 C418 느낌의 따뜻한 공방 피아노 왈츠 (86 BPM)
const CRAFT_TRACK = {
  bpm: 86,
  steps: 12, // 3/4 왈츠
  play: (step) => {
    // 베이스 (1박) + 코드 (2, 3박)
    if (step % 3 === 0) {
      const b = step < 6 ? 'F2' : 'G2';
      playNote({ freq: NOTES[b], dur: 0.9, type: 'triangle', vol: 0.32 });
    } else {
      const chord = step < 6 ? ['A3', 'C4'] : ['B3', 'D4'];
      chord.forEach(c => playNote({ freq: NOTES[c], dur: 0.45, type: 'sine', vol: 0.15 }));
    }
    // 은은한 목공방 멜로디
    const melody = [
      'C5', null, 'E5', 'G5', null, null,
      'B4', null, 'D5', 'G5', null, 'F5'
    ];
    const m = melody[step];
    if (m && NOTES[m]) {
      playNote({ freq: NOTES[m], dur: 0.8, type: 'sine', vol: 0.25 });
    }
  }
};

// 5. world (내 월드 탐험): C418 'Sweden' 스타일의 평화롭고 웅장한 오버월드 피아노 (68 BPM)
const WORLD_TRACK = {
  bpm: 68,
  steps: 16,
  play: (step) => {
    // 잔잔한 오버월드 피아노 펜타토닉 멜로디
    const melody = [
      'D4', null, 'Fs4', null, 'A4', null, 'B4', null,
      'D5', null, 'A4', null, 'Fs4', null, 'E4', null
    ];
    const m = melody[step];
    if (m && NOTES[m]) {
      playNote({ freq: NOTES[m], dur: 1.4, type: 'sine', vol: 0.35 });
      playNote({ freq: NOTES[m], dur: 1.1, type: 'triangle', vol: 0.12, detune: 6 });
    }
    // 깊고 웅장한 대지 베이스 (8스텝마다)
    if (step === 0) {
      playNote({ freq: NOTES['D2'], dur: 2.8, type: 'triangle', vol: 0.38 });
      playNote({ freq: NOTES['A2'], dur: 2.8, type: 'sine', vol: 0.22, delay: 0.05 });
    } else if (step === 8) {
      playNote({ freq: NOTES['G2'], dur: 2.8, type: 'triangle', vol: 0.38 });
      playNote({ freq: NOTES['B2'], dur: 2.8, type: 'sine', vol: 0.22, delay: 0.05 });
    }
  }
};

// 6. match (짝 맞추기): 아기자기하고 귀여운 차임벨 미니게임 (100 BPM)
const MATCH_TRACK = {
  bpm: 100,
  steps: 16,
  play: (step) => {
    const chimes = [
      'C5', 'G4', 'E4', 'G4', 'C5', 'E5', 'G5', 'E5',
      'D5', 'A4', 'F4', 'A4', 'D5', 'F5', 'A5', 'F5'
    ];
    const c = chimes[step];
    if (c && NOTES[c]) {
      playNote({ freq: NOTES[c], dur: 0.38, type: 'sine', vol: 0.22 });
    }
    if (step % 4 === 0) {
      const b = step < 8 ? 'C3' : 'D3';
      playNote({ freq: NOTES[b], dur: 0.6, type: 'triangle', vol: 0.28 });
    }
  }
};

const TRACKS = {
  cart: CART_TRACK,
  mine: MINE_TRACK,
  night: NIGHT_TRACK,
  craft: CRAFT_TRACK,
  world: WORLD_TRACK,
  match: MATCH_TRACK
};

/**
 * 특정 게임 테마 BGM 시작
 * @param {'cart'|'mine'|'night'|'craft'|'world'|'match'} themeName
 */
export function playBgm(themeName) {
  const ctx = getAudioContext();
  if (!ctx || !TRACKS[themeName]) return;

  if (currentTheme === themeName) return; // 이미 연주 중

  stopBgm();
  currentTheme = themeName;
  const track = TRACKS[themeName];

  // 부드러운 볼륨 페이드인
  if (masterGain && !isMuted) {
    masterGain.gain.setValueAtTime(0.01, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 0.6);
  }

  const stepInterval = (60 / track.bpm) / 2 * 1000; // 8분음표/16분음표 간격
  let currentStep = 0;

  stepTimer = setInterval(() => {
    if (!currentTheme) return;
    track.play(currentStep);
    currentStep = (currentStep + 1) % track.steps;
  }, stepInterval);
}

/**
 * BGM 정지 (부드러운 페이드아웃)
 */
export function stopBgm() {
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
  }
  if (ac && masterGain && currentTheme && !isMuted) {
    masterGain.gain.setValueAtTime(masterGain.gain.value, ac.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.001, ac.currentTime + 0.45);
  }
  currentTheme = null;
}

/**
 * 음성 또는 정답 효과음이 나올 때 음악 볼륨을 살짝 낮췄다가 복원 (오디오 더킹)
 */
export function duckBgm(dur = 1.2) {
  if (!ac || !masterGain || isMuted || !currentTheme) return;
  const t = ac.currentTime;
  masterGain.gain.setValueAtTime(0.12, t);
  masterGain.gain.linearRampToValueAtTime(0.38, t + dur);
}

/**
 * 음소거 켜기/끄기 토글
 * @returns {boolean} 음소거 여부
 */
export function toggleBgm() {
  isMuted = !isMuted;
  try {
    localStorage.setItem('block-studio-bgm-mute', isMuted ? '1' : '0');
  } catch (_) {}

  const ctx = getAudioContext();
  if (ctx && masterGain) {
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.38, ctx.currentTime);
  }
  return isMuted;
}

export function isBgmMuted() {
  return isMuted;
}
