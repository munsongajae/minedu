// 말로 글쓰기(음성 입력). 브라우저에 들어 있는 음성 인식(Web Speech API)을 쓴다.
// 크롬·엣지(PC, 안드로이드)에서 된다. 말소리는 브라우저 회사(크롬은 Google)의 인식 서버로 보내져 글자로 바뀐다.
// 한 번 누르면 말이 끝나고 잠깐 조용해질 때까지 듣고 멈춘다(안드로이드에서 continuous 모드가 글을 겹쳐 쓰는 문제를 피함).

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

export function canDictate() {
  return !!Rec && window.isSecureContext;
}

/**
 * 듣기 시작.
 * @param {object} o { lang, onText(text, isFinal), onEnd(finalText), onError(code) }
 * @returns {{ stop(): void }}
 */
export function startDictation({ lang = 'ko-KR', onText, onEnd, onError }) {
  const r = new Rec();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = '';
  let errored = false;
  r.onresult = (ev) => {
    let fin = '', interim = '';
    for (let i = 0; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) fin += t; else interim += t;
    }
    finalText = fin.trim();
    onText && onText((fin + interim).trim(), !interim);
  };
  r.onerror = (ev) => {
    if (ev.error === 'aborted') return;
    errored = true;
    onError && onError(ev.error || 'unknown');
  };
  r.onend = () => { onEnd && onEnd(errored ? '' : finalText); };
  r.start();
  return { stop() { try { r.stop(); } catch (e) { /* 이미 멈춤 */ } } };
}

// 한국어 문장 끝에 마침표가 없으면 붙인다(자막에 쓰이므로).
export function tidyKorean(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return /[.!?…~]$/.test(t) ? t : t + '.';
}

export function dictationMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 사용이 막혀 있어요. 주소창 옆 자물쇠 아이콘을 눌러 마이크를 허용해 주세요.';
    case 'no-speech':
      return '목소리가 안 들렸어요. 다시 누르고 또박또박 말해 봐요.';
    case 'audio-capture':
      return '마이크를 찾을 수 없어요. 마이크가 연결돼 있는지 확인해 주세요.';
    case 'network':
      return '말로 쓰기는 인터넷이 있어야 돼요. 연결을 확인해 주세요.';
    case 'language-not-supported':
      return '이 브라우저는 한국어 말로 쓰기를 못 해요. 크롬이나 엣지에서 해 봐요.';
    default:
      return '말로 쓰기가 잘 안 됐어요. 한 번 더 눌러 봐요.';
  }
}
