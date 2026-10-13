// 모든 기록 지우기(부모님 설정).
//   지우는 것: 만든 영상(사진·녹음·음악), 아이별 연습 기록·에메랄드, 단어 뜻 모음 — 이 기기와 서버 모두.
//   남기는 것: 가족 암호, 기기 이름, 발음 빠르기 같은 이 기기 설정.
// 다른 기기: 서버에 '지운 때'(kv/reset.json {at})를 남겨 두고, 각 페이지가 시작할 때 checkReset()으로 보고
//   그때보다 먼저 고친 영상·연습 기록을 이 기기에서도 지운다(지운 뒤에 새로 만든 것은 남는다).
//   이렇게 하지 않으면 다른 기기에 남은 옛 영상·기록이 서버로 다시 올라간다.
import * as store from './storage.js';
import { coach } from './ai.js';
import { cloudAvailable, listCloud, deleteCloud } from './cloud.js';
import { CHILDREN, keyOf } from './learn.js';

const MARK = 'block-studio-reset';       // 이 기기가 마지막으로 따른 '지운 때'
const localMark = () => { try { return Number(localStorage.getItem(MARK) || 0); } catch (e) { return 0; } };
const setMark = (at) => { try { localStorage.setItem(MARK, String(at)); } catch (e) { /* 무시 */ } };

/** 이 기기에서 at 이전에 고친 영상·연습 기록과 단어 뜻 모음을 지운다. */
export async function wipeLocal(at = Infinity) {
  for (const p of (await store.loadAll()) || []) if ((p.updatedAt || 0) < at) await store.remove(p.id);
  for (const r of await store.allItems('progress')) if ((r.updatedAt || 0) < at) await store.removeItem('progress', r.id);
  await store.removeItem('meta', 'glossary');
}

/** 페이지가 시작할 때 먼저 부른다. 다른 기기에서 '모두 지우기'를 했으면 이 기기 것도 지운다. 지웠으면 true. */
export async function checkReset() {
  if (!cloudAvailable()) return false;
  try {
    const r = await Promise.race([
      coach('cloud_get', { key: 'reset' }),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 2500))
    ]);
    const at = Number(r && r.doc && r.doc.at) || 0;
    if (at > localMark()) {
      await wipeLocal(at);
      setMark(at);
      return true;
    }
  } catch (e) { /* 인터넷이 안 되면 다음에 */ }
  return false;
}

/** 이 기기와 서버의 모든 기록을 지운다. onStep(글)으로 진행을 알린다. */
export async function eraseEverything(onStep = () => {}) {
  const at = Date.now();
  if (cloudAvailable()) {
    onStep('서버에 저장된 것을 지우는 중이에요…');
    try {
      await coach('cloud_reset', { confirm: 'erase-all' });
    } catch (e) {
      if (!e || e.code !== 'bad_request') throw e;
      // 서버 함수가 아직 옛 판이면: 영상을 하나씩 지우고, 아이별 연습 기록은 빈 기록으로 덮는다.
      for (const it of await listCloud()) await deleteCloud(it.id);
      for (const child of CHILDREN) {
        await coach('cloud_put', { key: keyOf(child), doc: { id: child, sentences: {}, words: {}, emeralds: 0, days: [], updatedAt: at } });
      }
    }
    await coach('cloud_put', { key: 'reset', doc: { at } });
  }
  onStep('이 기기에 저장된 것을 지우는 중이에요…');
  await wipeLocal();
  setMark(at);
}
