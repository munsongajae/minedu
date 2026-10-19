// 발음 들어 보기(영어 읽어 주기). 브라우저에 들어 있는 음성 합성(speechSynthesis)을 쓴다.
// 아이들이 따라 들을 수 있게 빠르기를 고른다. 읽는 낱말을 알려 주는 onWord로 화면에 따라 읽기 표시를 한다.
// '한 단어씩'은 저절로 흘러가지 않는다: followHTML의 낱말 버튼을 누르면 그 낱말 하나만 읽는다(speakWord).

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
 * @param {object} o { speed: 'normal'|'slow'|'slower', onWord(i), onEnd() }
 * @returns {Promise<{ stop(): void }>}
 */
export async function speak(text, { speed = 'slow', onWord, onEnd } = {}) {
  speechSynthesis.cancel();
  const voice = pickVoice(await loadVoices());
  const rate = (SPEEDS[speed] || SPEEDS.slow).rate;
  const words = wordsOf(text);
  let stopped = false;
  const finish = () => { if (stopped) return; stopped = true; onEnd && onEnd(); };
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : 'en-US';
  if (voice) u.voice = voice;
  u.rate = rate;
  u.pitch = 1;
  // 낱말 위치(boundary)를 알려 주는 목소리면 따라 읽기 표시도 한다.
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
  return { stop() { stopped = true; speechSynthesis.cancel(); onEnd && onEnd(); } };
}

// 낱말 하나만 읽으면 음성 합성이 글자 이름으로 읽는 것: 문장 속에서 들리는 소리로 바꿔 읽힌다.
// 'a'를 혼자 읽으면 "에이"가 되므로 "uh"(어)로. 화면 글자는 그대로다.
const SAY_ALONE = { a: 'uh' };

/** 낱말 하나만 읽는다(앞뒤 문장부호는 뺀다). */
export function speakWord(word, o = {}) {
  const w = String(word).replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '') || String(word);
  return speak(SAY_ALONE[w.toLowerCase()] || w, o);
}

const escW = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/**
 * 따라 읽기 줄. 낱말마다 버튼이라 누르면 그 낱말만 들을 수 있다(눌렀을 때 speakWord는 각 페이지가 부른다).
 * 문장을 통째로 읽을 때는 같은 data-w로 지금 낱말을 칠한다.
 */
export function followHTML(text, cls = '') {
  return `<p class="follow ${cls}" lang="en">${wordsOf(text).map((w, i) =>
    `<button type="button" class="fw" data-w="${i}" aria-label="${escW(w)} 발음 듣기">${escW(w)}</button>`).join(' ')}</p>`;
}

export { wordsOf };
