// 발음 들어 보기(영어 읽어 주기). 브라우저에 들어 있는 음성 합성(speechSynthesis)을 쓴다.
// 아이들이 따라 들을 수 있게 빠르기를 고르고, 한 단어씩 끊어 읽기도 된다.
// 읽는 낱말을 알려 주는 onWord로 화면에 따라 읽기 표시를 한다.

export const SPEEDS = {
  normal: { label: '보통', rate: 0.9 },
  slow: { label: '천천히', rate: 0.7 },
  slower: { label: '아주 천천히', rate: 0.5 }
};
const SPEED_KEY = 'block-studio-speech-speed';

export const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function getSpeed() {
  try { const v = localStorage.getItem(SPEED_KEY); if (v && SPEEDS[v]) return v; } catch (e) { /* 기본값 */ }
  return 'slow';
}
export function setSpeed(v) {
  if (!SPEEDS[v]) return;
  try { localStorage.setItem(SPEED_KEY, v); } catch (e) { /* 이번만 */ }
}

// 목소리 목록은 늦게 준비되는 경우가 많아서(크롬) 잠깐 기다린다.
let voicesReady = null;
function loadVoices() {
  if (!voicesReady) {
    voicesReady = new Promise(resolve => {
      const now = speechSynthesis.getVoices();
      if (now.length) return resolve(now);
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }
  return voicesReady;
}

// 자연스러운 미국 영어 목소리를 먼저 고른다.
export function pickVoice(voices) {
  const en = voices.filter(v => /^en[-_]/i.test(v.lang));
  const us = en.filter(v => /^en[-_]US/i.test(v.lang));
  const score = (v) => {
    const n = v.name || '';
    if (/natural|neural/i.test(n)) return 0;          // 엣지의 자연스러운 목소리(Aria, Jenny 등)
    if (/google/i.test(n)) return 1;                   // 크롬의 Google US English
    if (/samsung/i.test(n)) return 2;
    if (v.localService) return 3;
    return 4;
  };
  const sorted = (list) => [...list].sort((a, b) => score(a) - score(b));
  return sorted(us)[0] || sorted(en)[0] || null;
}

const wordsOf = (text) => String(text).trim().split(/\s+/).filter(Boolean);

/**
 * 읽기 시작. 이미 읽고 있으면 멈추고 새로 읽는다.
 * @param {string} text
 * @param {object} o { speed: 'normal'|'slow'|'slower', wordByWord: bool, onWord(i), onEnd() }
 * @returns {Promise<{ stop(): void }>}
 */
export async function speak(text, { speed = 'slow', wordByWord = false, onWord, onEnd } = {}) {
  speechSynthesis.cancel();
  const voice = pickVoice(await loadVoices());
  const rate = (SPEEDS[speed] || SPEEDS.slow).rate;
  const words = wordsOf(text);
  let stopped = false;
  let timer = null;
  const finish = () => { if (stopped) return; stopped = true; clearTimeout(timer); onEnd && onEnd(); };
  const make = (t) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1;
    return u;
  };

  if (wordByWord) {
    // 낱말마다 따로 읽고 사이를 잠깐 쉰다. 읽는 낱말 표시는 늘 정확하다.
    const pause = speed === 'normal' ? 250 : speed === 'slow' ? 400 : 600;
    let i = 0;
    const next = () => {
      if (stopped) return;
      if (i >= words.length) return finish();
      onWord && onWord(i);
      const u = make(words[i].replace(/[.,!?;:"]+$/g, '') || words[i]);
      u.onend = () => { i++; timer = setTimeout(next, pause); };
      u.onerror = () => finish();
      speechSynthesis.speak(u);
    };
    next();
  } else {
    // 문장을 한 번에 읽는다. 낱말 위치(boundary)를 알려 주는 목소리면 따라 읽기 표시도 한다.
    const u = make(text);
    const starts = [];
    let pos = 0;
    words.forEach(w => { const at = text.indexOf(w, pos); starts.push(at); pos = at + w.length; });
    u.onstart = () => onWord && onWord(0);
    u.onboundary = (ev) => {
      if (ev.name && ev.name !== 'word') return;
      let k = 0;
      for (let j = 0; j < starts.length; j++) if (starts[j] <= ev.charIndex) k = j;
      onWord && onWord(k);
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  }
  return { stop() { stopped = true; clearTimeout(timer); speechSynthesis.cancel(); onEnd && onEnd(); } };
}

export { wordsOf };
