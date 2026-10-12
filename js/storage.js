// 이 기기·이 브라우저 안에만 저장하는 IndexedDB 래퍼.
// 프로젝트 하나 = { id, title, makers, opts, scenes: [{ image: Blob, audio: Blob, ... }] }

const DB_NAME = 'block-studio';
const STORE = 'projects';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** 모든 프로젝트. 저장소를 못 쓰면 null. */
export async function loadAll() {
  try { return await tx('readonly', s => s.getAll()); }
  catch (e) { return null; }
}

export async function put(project) {
  try { await tx('readwrite', s => s.put(project)); return true; }
  catch (e) { return false; }
}

export async function remove(id) {
  try { await tx('readwrite', s => s.delete(id)); } catch (e) { /* 무시 */ }
}

/** 브라우저가 공간이 부족할 때 데이터를 지우지 않도록 요청. */
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* 무시 */ }
}
