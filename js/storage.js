// 이 기기·이 브라우저 안에 저장하는 IndexedDB 래퍼.
//   projects : 영상 작품 { id, title, makers, opts, music, scenes: [{ images: [Blob], lines: [{ audio: Blob, ... }] }] }
//   progress : 아이별 연습 기록 { id: 아이 이름, sentences: {...}, words: {...}, emeralds, days: [...] }
//   meta     : 그 밖의 것(단어 뜻 모음 등) { id, ... }

const DB_NAME = 'block-studio';
const DB_VERSION = 2;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of ['projects', 'progress', 'meta']) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // 다른 탭에서 새 버전 앱이 열리면 연결을 놓아 준다.
          db.onversionchange = () => { db.close(); dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
        req.onblocked = () => { /* 다른 탭이 닫히면 이어서 열린다 */ };
      } catch (e) { dbPromise = null; reject(e); }
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ---------- 작품 ---------- */
/** 모든 프로젝트. 저장소를 못 쓰면 null. */
export async function loadAll() {
  try { return await tx('projects', 'readonly', s => s.getAll()); }
  catch (e) { return null; }
}
export async function put(project) {
  try { await tx('projects', 'readwrite', s => s.put(project)); return true; }
  catch (e) { return false; }
}
export async function remove(id) {
  try { await tx('projects', 'readwrite', s => s.delete(id)); } catch (e) { /* 무시 */ }
}

/* ---------- 연습 기록·그 밖의 것 ---------- */
export async function getItem(store, id) {
  try { return (await tx(store, 'readonly', s => s.get(id))) || null; }
  catch (e) { return null; }
}
export async function putItem(store, obj) {
  try { await tx(store, 'readwrite', s => s.put(obj)); return true; }
  catch (e) { return false; }
}

/** 브라우저가 공간이 부족할 때 데이터를 지우지 않도록 요청. */
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* 무시 */ }
}
