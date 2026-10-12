// 문장 연습·단어 게임이 함께 쓰는 것: 아이 고르기, 문장 모으기, 연습 기록(복습 상자), 단어장, 기록 서버 저장.
import * as store from './storage.js';
import { coach, aiEnabled, getFamilyCode } from './ai.js';

export const CHILDREN = ['곰이', '난이'];
const CHILD_KEY = 'block-studio-child';

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- 아이 고르기 ---------- */
export function getChild() {
  try { const c = localStorage.getItem(CHILD_KEY); if (CHILDREN.includes(c)) return c; } catch (e) { /* 없음 */ }
  return null;
}
export function setChild(c) {
  try { localStorage.setItem(CHILD_KEY, c); } catch (e) { /* 이번만 */ }
}
export function childPickerHTML(cur) {
  return `<div class="kid-pick" role="group" aria-label="누가 연습하나요?">
    ${CHILDREN.map(c => `<button type="button" class="kid ${c === cur ? 'on' : ''}" data-kid="${esc(c)}" aria-pressed="${c === cur}">${esc(c)}</button>`).join('')}
  </div>`;
}

/* ---------- 문장 모으기 ---------- */
// 모든 영상에서 영어 문장이 있는 문장 줄을 모은다. 예시 영상은 다른 문장이 없을 때만 쓴다.
export async function loadSentences() {
  const all = (await store.loadAll()) || [];
  const fix = (p) => {
    p.scenes = (p.scenes || []).map(s => ({
      ...s,
      images: Array.isArray(s.images) ? s.images : (s.image ? [s.image] : []),
      lines: Array.isArray(s.lines) && s.lines.length ? s.lines : [{ id: s.id, ko: s.ko || '', en: s.en || '', words: s.words || [], audio: s.audio || null }]
    }));
    return p;
  };
  const projects = all.map(fix).sort((a, b) => b.updatedAt - a.updatedAt);
  const collect = (list) => {
    const out = [];
    list.forEach(p => p.scenes.forEach(sc => sc.lines.forEach(l => {
      const en = String(l.en || '').trim();
      if (!en) return;
      out.push({
        key: l.id, en, ko: String(l.ko || '').trim(),
        image: sc.images[0] || null, audio: l.audio || null,
        words: Array.isArray(l.words) ? l.words : [],
        projectId: p.id, projectTitle: p.title || '제목 없는 영상'
      });
    })));
    return out;
  };
  let real = projects.filter(p => !p.example);
  let sentences = collect(real);
  let usingExample = false;
  if (!sentences.length) { sentences = collect(projects); real = projects; usingExample = sentences.length > 0; }
  const withText = new Set(sentences.map(s => s.projectId));
  return { sentences, projects: real.filter(p => withText.has(p.id)), usingExample };
}

/* ---------- 연습 기록 ---------- */
// 복습 상자(라이트너): 맞히면 다음 상자, 틀리면 1번 상자. 상자마다 다시 나오는 날까지의 간격.
export const BOX_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
const DAY = 24 * 60 * 60 * 1000;

function emptyProgress(child) {
  return { id: child, sentences: {}, words: {}, emeralds: 0, days: [], updatedAt: 0 };
}
export async function loadProgress(child) {
  const p = (await store.getItem('progress', child)) || emptyProgress(child);
  p.sentences = p.sentences || {}; p.words = p.words || {}; p.days = p.days || []; p.emeralds = p.emeralds || 0;
  return p;
}
let pushTimer = null;
export async function saveProgress(p) {
  p.updatedAt = Date.now();
  await store.putItem('progress', p);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncProgress(p).catch(() => {}), 2500);
}

const todayStr = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function markToday(p) {
  const t = todayStr();
  if (!p.days.includes(t)) p.days.push(t);
  if (p.days.length > 400) p.days = p.days.slice(-400);
}
export function streak(p) {
  const set = new Set(p.days);
  let n = 0;
  for (let t = Date.now(); set.has(todayStr(t)); t -= DAY) n++;
  return n;
}

// 하루의 시작(자정) 기준으로 '다시 나오는 날'을 정한다.
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function grade(item, ok) {
  const now = Date.now();
  const it = item || { box: 1, seen: 0, right: 0, wrong: 0 };
  it.seen = (it.seen || 0) + 1;
  if (ok) { it.right = (it.right || 0) + 1; it.box = Math.min(5, (it.box || 1) + 1); }
  else { it.wrong = (it.wrong || 0) + 1; it.box = 1; }
  it.due = it.box === 1 ? now : startOfDay(now) + BOX_DAYS[it.box] * DAY;
  it.t = now;
  return it;
}
export const isDue = (it, now = Date.now()) => !it || (it.due || 0) <= now;

/** 오늘 연습할 문장: 다시 볼 때가 된 문장 먼저, 그다음 새 문장 몇 개. */
export function todayQueue(sentences, progress, { max = 8, newMax = 3 } = {}) {
  const now = Date.now();
  const due = sentences.filter(s => progress.sentences[s.key] && isDue(progress.sentences[s.key], now))
    .sort((a, b) => (progress.sentences[a.key].due || 0) - (progress.sentences[b.key].due || 0));
  const fresh = sentences.filter(s => !progress.sentences[s.key]);
  return [...due.slice(0, max), ...fresh.slice(0, Math.max(0, Math.min(newMax, max - Math.min(due.length, max))))];
}
export function mastered(sentences, progress) {
  return sentences.filter(s => (progress.sentences[s.key]?.box || 0) >= 4).length;
}

/* ---------- 단어 ---------- */
const STOP = new Set(('a an the i me my we our you your he she it its they them their is am are was were be been being do does did have has had ' +
  'to of in on at by for with and or but so if then than that this these those there here as from up down out into over very too also not no yes ' +
  'can could will would should just all some any one two lot lots got get go went come came make made let it\'s i\'m we\'re').split(/\s+/));
export function tokens(en) {
  return String(en).replace(/[“”"]/g, '').split(/\s+/).map(w => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '')).filter(Boolean);
}
export const wordKey = (w) => w.toLowerCase().replace(/’/g, "'");

/** 문장들에서 배울 만한 단어를 모은다. 뜻은 AI 낱말(문장마다) → 단어 뜻 모음(glossary) 순서로 찾는다. */
export function collectWords(sentences, glossary) {
  const map = new Map();
  sentences.forEach(s => {
    (s.words || []).forEach(w => {
      if (!w || !w.en || !w.ko) return;
      const k = wordKey(w.en);
      if (!map.has(k)) map.set(k, { key: k, en: w.en, ko: w.ko, from: s.key });
      else if (!map.get(k).ko) map.get(k).ko = w.ko;
    });
    tokens(s.en).forEach((t, i) => {
      const k = wordKey(t);
      if (k.length < 3 || STOP.has(k) || /'/.test(k)) return;
      // 문장 가운데에서도 대문자로 쓴 낱말(이름)은 그대로, 나머지는 소문자로 보여준다.
      const proper = i > 0 && /^[A-Z]/.test(t);
      if (!map.has(k)) map.set(k, { key: k, en: proper ? t : k, ko: '', from: s.key });
      else if (proper) map.get(k).en = t;
    });
  });
  for (const w of map.values()) if (!w.ko && glossary[w.key]) w.ko = glossary[w.key];
  return [...map.values()];
}

export async function loadGlossary() {
  const g = await store.getItem('meta', 'glossary');
  return (g && g.words) || {};
}
/** 뜻이 없는 단어의 뜻을 AI에게 물어 채운다(한 번에 40개까지). */
export async function fillGlossary(words, sentences) {
  if (!aiEnabled()) throw { code: 'off' };
  const need = words.filter(w => !w.ko).slice(0, 40);
  if (!need.length) return 0;
  const context = sentences.slice(0, 30).map(s => s.en).join(' ').slice(0, 1500);
  const r = await coach('glossary', { words: need.map(w => w.en), context });
  const g = await loadGlossary();
  let n = 0;
  (r.items || []).forEach(it => {
    const k = wordKey(String(it.en || ''));
    const ko = String(it.ko || '').trim();
    if (k && ko) { g[k] = ko; n++; }
  });
  await store.putItem('meta', { id: 'glossary', words: g });
  return n;
}

/* ---------- 연습 기록 서버 저장(다른 기기와 합치기) ---------- */
const keyOf = (child) => 'progress-' + [...new TextEncoder().encode(child)].map(b => b.toString(16).padStart(2, '0')).join('');
const cloudOk = () => aiEnabled() && !!getFamilyCode();

// 문장·단어마다 더 나중에 연습한 기록을 남기고, 에메랄드는 큰 쪽, 연습한 날은 합친다.
export function mergeProgress(a, b) {
  const pick = (x, y) => { const out = { ...x }; for (const [k, v] of Object.entries(y || {})) if (!out[k] || (v.t || 0) > (out[k].t || 0)) out[k] = v; return out; };
  return {
    id: a.id,
    sentences: pick(a.sentences, b.sentences),
    words: pick(a.words, b.words),
    emeralds: Math.max(a.emeralds || 0, b.emeralds || 0),
    days: [...new Set([...(a.days || []), ...(b.days || [])])].sort().slice(-400),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0)
  };
}
/** 서버의 기록과 합쳐서 양쪽에 저장한다. 합쳐진 기록을 돌려준다. */
export async function syncProgress(p) {
  if (!cloudOk()) return p;
  const key = keyOf(p.id);
  const r = await coach('cloud_get', { key });
  const merged = r && r.doc ? mergeProgress(p, r.doc) : p;
  await coach('cloud_put', { key, doc: merged });
  Object.assign(p, merged);
  await store.putItem('progress', p);
  return p;
}

/* ---------- 그림 주소 ---------- */
const urls = new Map();
export function blobURL(blob) {
  if (!blob) return '';
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
}
