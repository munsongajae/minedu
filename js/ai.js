// AI 영어 도우미(Supabase 함수 → Gemini)와 이야기하는 부분.
import { COACH_URL } from './config.js';

const CODE_KEY = 'block-studio-family-code';

export const aiEnabled = () => !!COACH_URL;

export function getFamilyCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; }
}
export function setFamilyCode(code) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch (e) { /* 저장 못 해도 이번 사용에는 지장 없음 */ }
}

/** 실패하면 { code } 를 가진 오류를 던진다. */
export async function coach(action, payload, signal) {
  if (!COACH_URL) throw { code: 'off' };
  let res;
  try {
    res = await fetch(COACH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-family-code': getFamilyCode() },
      body: JSON.stringify({ action, ...payload }),
      signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw { code: 'cancelled' };
    throw { code: navigator.onLine === false ? 'offline' : 'network' };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* 아래에서 처리 */ }
  if (!res.ok || !data) throw { code: (data && data.error) || 'ai_error' };
  return data;
}

const MESSAGES = {
  bad_code: '가족 암호가 맞지 않아요. 부모님께 "부모님 설정"에서 암호를 넣어 달라고 해요.',
  rate_limited: '조금 천천히 눌러 주세요. 잠깐 뒤에 다시 해 봐요.',
  ai_busy: 'AI 도우미가 지금 바빠요. 잠깐 뒤에 다시 눌러 봐요.',
  too_long: '글이 너무 길어요. 조금 줄여 볼까요?',
  empty: '먼저 글을 써 주세요.',
  offline: '인터넷이 끊겨 있어요. 연결되면 다시 눌러 봐요.',
  network: 'AI 도우미에 연결하지 못했어요. 잠깐 뒤에 다시 눌러 봐요.',
  not_configured: 'AI 도우미 준비가 아직 안 됐어요. 부모님께 알려 주세요.',
  origin: '이 주소에서는 AI 도우미를 쓸 수 없어요.',
  off: 'AI 도우미가 꺼져 있어요.'
};
export function aiMessage(e) {
  const code = e && e.code;
  if (code === 'cancelled') return '';
  return MESSAGES[code] || 'AI가 대답을 잘 못 했어요. 한 번 더 눌러 보세요.';
}
