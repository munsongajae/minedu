// 작품 서버 저장(다른 기기에서 이어서 편집). Supabase 함수(coach)의 cloud_* 기능을 쓴다.
//
// 작품 내용은 JSON으로, 사진·녹음·음악 파일은 내용의 SHA-256 값으로 이름을 붙여 따로 올린다.
// 같은 파일은 한 번만 올라가고, 바뀐 글만 고치면 작은 JSON만 다시 올라간다.
// 판 번호(rev)로 두 기기의 저장이 엇갈렸는지 알아낸다.
import { coach, aiEnabled, getFamilyCode } from './ai.js';

export const cloudAvailable = () => aiEnabled() && !!getFamilyCode();

const DEVICE_KEY = 'block-studio-device';
export function getDeviceName(fallback) {
  try { return localStorage.getItem(DEVICE_KEY) || fallback; } catch (e) { return fallback; }
}
export function setDeviceName(name) {
  try { if (name) localStorage.setItem(DEVICE_KEY, name); else localStorage.removeItem(DEVICE_KEY); } catch (e) { /* 이번만 */ }
}

/* ---------- 파일 이름(해시) ---------- */
const hashCache = new WeakMap();
async function hashOf(blob) {
  if (hashCache.has(blob)) return hashCache.get(blob);
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  hashCache.set(blob, hex);
  return hex;
}

/* ---------- 작품 ↔ JSON ---------- */
// 사진·소리 Blob을 { ref, type } 로 바꾼 JSON과, 올려야 할 파일 목록을 만든다.
export async function serialize(project) {
  const blobs = new Map();
  const ref = async (blob) => {
    if (!blob) return null;
    const h = await hashOf(blob);
    blobs.set(h, blob);
    return { ref: h, type: blob.type || '' };
  };
  const m = project.music;
  const doc = {
    format: 1,
    id: project.id,
    title: project.title || '',
    makers: project.makers || '',
    createdAt: project.createdAt || Date.now(),
    opts: { ...project.opts },
    music: m && m.blob ? { ...(await ref(m.blob)), name: m.name || '', dur: m.dur || 0, vol: m.vol, credit: m.credit || '' } : null,
    scenes: []
  };
  for (const s of project.scenes) {
    const images = [];
    for (const b of s.images) images.push(await ref(b));
    const lines = [];
    for (const l of s.lines) {
      const { audio, ...rest } = l;
      lines.push({ ...rest, audio: await ref(audio) });
    }
    doc.scenes.push({ id: s.id, example: !!s.example, images, lines, ...(s.fx ? { fx: { ...s.fx } } : {}) });
  }
  return { doc, blobs };
}

async function rebuild(doc, urls, onProgress) {
  const cache = new Map();
  const refs = new Set();
  const note = (r) => { if (r && r.ref) refs.add(r.ref); };
  note(doc.music);
  doc.scenes.forEach(s => { s.images.forEach(note); s.lines.forEach(l => note(l.audio)); });
  let done = 0;
  const list = [...refs];
  // 서너 개씩 나눠 내려받는다.
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async (h) => {
      const u = urls[h];
      if (!u) throw { code: 'missing_file' };
      const res = await fetch(u);
      if (!res.ok) throw { code: 'download_failed' };
      cache.set(h, await res.blob());
      done++;
      onProgress && onProgress(done / list.length);
    }));
  }
  const blobOf = (r) => {
    if (!r) return null;
    const b = cache.get(r.ref);
    return b && r.type && b.type !== r.type ? new Blob([b], { type: r.type }) : b;
  };
  return {
    id: doc.id,
    title: doc.title || '',
    makers: doc.makers || '',
    createdAt: doc.createdAt || Date.now(),
    updatedAt: Date.now(),
    opts: { title: true, ko: true, end: true, ...(doc.opts || {}) },
    music: doc.music ? { blob: blobOf(doc.music), name: doc.music.name, dur: doc.music.dur, vol: doc.music.vol, credit: doc.music.credit } : null,
    scenes: doc.scenes.map(s => ({
      id: s.id,
      example: !!s.example,
      ...(s.fx ? { fx: s.fx } : {}),
      images: s.images.map(blobOf).filter(Boolean),
      lines: s.lines.map(l => ({ ...l, audio: blobOf(l.audio) }))
    })),
    cloud: { on: true, rev: doc.rev || 0, dirty: false, syncedAt: Date.now(), device: doc.device || '', serverAt: doc.updatedAt || 0 }
  };
}

/* ---------- 서버와 주고받기 ---------- */
async function putFile(url, blob) {
  const form = new FormData();
  form.append('cacheControl', '31536000');
  form.append('', blob);
  const res = await fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
  // 다른 기기가 같은 파일을 먼저 올렸으면 '이미 있음'으로 실패하는데, 그건 괜찮다.
  if (!res.ok && res.status !== 409 && res.status !== 400) throw { code: 'upload_failed' };
}

/**
 * 작품을 서버에 저장한다. 엇갈림이 있으면 { code: 'conflict', server } 를 던진다.
 * @returns {Promise<{ rev, updatedAt }>}
 */
export async function pushProject(project, device, { force = false } = {}) {
  const { doc, blobs } = await serialize(project);
  const { uploads } = await coach('cloud_need', { hashes: [...blobs.keys()] });
  for (let i = 0; i < uploads.length; i += 3) {
    await Promise.all(uploads.slice(i, i + 3).map(u => putFile(u.url, blobs.get(u.hash))));
  }
  return coach('cloud_save', { id: project.id, doc, baseRev: (project.cloud && project.cloud.rev) || 0, device, force });
}

export async function pullProject(id, onProgress) {
  const { doc, urls } = await coach('cloud_load', { id });
  return rebuild(doc, urls, onProgress);
}

export const headProject = (id) => coach('cloud_head', { id });
export const listCloud = () => coach('cloud_list', {}).then(r => r.items || []);
export const deleteCloud = (id) => coach('cloud_delete', { id });
