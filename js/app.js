// 곰이난이 블록 스튜디오 — 화면과 동작
import * as store from './storage.js';
import { makeExampleImage } from './world.js';
import { renderVideo, totalDur, canMakeVideo } from './video.js';
import { canRecord, startRecording, micErrorMessage } from './recorder.js';
import { aiEnabled, coach, aiMessage, getFamilyCode, setFamilyCode } from './ai.js';
import { importPortfolioPdf, isPdf } from './pdf-import.js';
import { canDictate, startDictation, tidyKorean, dictationMessage } from './dictation.js';

const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

const ICON = {
  speaker: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3v10l-4-3H2zM11 5h1v6h-1zM13 3h1v10h-1z"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 3h2v2h2v2h2v2H9v5H7V9H3V7h2V5h2z"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v5h4v2h-2v2H9v2H7v-2H5V9H3V7h4z"/></svg>',
  spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 1h2v5h5v2H9v5H7V8H2V6h5z"/></svg>',
  mic: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 1h4v1h1v6h-1v1H6V8H5V2h1zM3 6h1v2h1v1h1v1h4V9h1V8h1V6h1v3h-1v1h-1v1H9v2h3v2H4v-2h3v-2H5v-1H4V9H3z"/></svg>'
};
const AI_ON = aiEnabled();

const MIC_OK = canRecord();
const DICT_OK = canDictate();
const TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* ---------- 상태 ---------- */
// 장면 = 사진 한 장 + 문장 줄 여러 개. 문장 줄마다 한글·영어·녹음이 따로 있다.
let projects = [];
let project = null;
let saveTimer = null;
let rendering = false;
let cancelRequested = false;
let result = null; // { blob, ext, total, url }
const rec = { lineId: null, sceneId: null, handle: null, timer: null };
const dict = { lineId: null, sceneId: null, handle: null };   // 말로 쓰기(음성 입력) 중인 문장
const busy = new Map();      // 문장 id → { kind: 'translate'|'check', ctl: AbortController }
const statusMsg = new Map(); // 문장 id → { text, err }

function newLine(extra) {
  return Object.assign({
    id: uid(), ko: '', en: '',
    mode: 'self', attempt: '', feedback: null, words: [],
    audio: null, audioName: '', audioDur: 0
  }, extra || {});
}
function newScene(blob, firstLine) {
  return { id: uid(), images: [blob], lines: [newLine(firstLine)] };
}
function fixLine(l) {
  if (!l.id) l.id = uid();
  for (const k of ['ko', 'en', 'attempt', 'audioName']) if (typeof l[k] !== 'string') l[k] = '';
  if (l.mode !== 'ai' && l.mode !== 'self') l.mode = 'self';
  if (!Array.isArray(l.words)) l.words = [];
  if (l.feedback === undefined) l.feedback = null;
  if (!l.audio) { l.audio = null; l.audioDur = 0; }
  return l;
}
// 예전 버전(장면 하나에 문장 하나)으로 저장한 장면을 새 모양으로 바꾼다.
const OLD_KEYS = ['ko', 'en', 'mode', 'attempt', 'feedback', 'words', 'audio', 'audioName', 'audioDur'];
function fixScene(s) {
  // 사진 한 장(image) → 여러 장(images)
  if (!Array.isArray(s.images)) s.images = s.image ? [s.image] : [];
  delete s.image;
  if (!Array.isArray(s.lines) || !s.lines.length) {
    const l = {};
    OLD_KEYS.forEach(k => { if (k in s) l[k] = s[k]; });
    s.lines = [l];
  }
  OLD_KEYS.forEach(k => { delete s[k]; });
  s.lines.forEach(fixLine);
  return s;
}
function newProject() {
  return { id: uid(), title: '', makers: project ? project.makers : '', createdAt: Date.now(), updatedAt: Date.now(), opts: { title: true, ko: true, end: true }, scenes: [] };
}
async function makeExampleProject() {
  const img = await makeExampleImage();
  const scene = newScene(img, {
    ko: '오늘은 강가에 작은 나무집을 지었어요.',
    en: 'Today I built a small wooden house by the river.',
    mode: 'ai',
    words: [{ en: 'wooden', ko: '나무로 된' }, { en: 'river', ko: '강' }]
  });
  scene.example = true;
  scene.lines.push(newLine({
    ko: '옆에는 나무도 한 그루 심었어요.',
    en: 'I also planted a tree next to it.',
    mode: 'ai',
    words: [{ en: 'planted', ko: '심었다' }]
  }));
  return {
    id: uid(), title: '예시: 강가의 나무집', makers: '곰이 · 난이', createdAt: Date.now(), updatedAt: Date.now(),
    opts: { title: true, ko: true, end: true },
    scenes: [scene]
  };
}

function save(now) {
  if (!project) return;
  project.updatedAt = Date.now();
  clearTimeout(saveTimer);
  const go = async () => {
    const ok = await store.put(project);
    if (!ok) $('#storageNote').textContent = '이 브라우저에서는 자동 저장이 되지 않아요. 창을 닫기 전에 영상을 먼저 저장하세요.';
  };
  if (now) go(); else saveTimer = setTimeout(go, 500);
}

/* ---------- 파일 주소 캐시 ---------- */
const urlCache = new Map();
function blobURL(key, blob) {
  const hit = urlCache.get(key);
  if (hit && hit.blob === blob) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, { blob, url });
  return url;
}
function clearURLs() { urlCache.forEach(v => URL.revokeObjectURL(v.url)); urlCache.clear(); }

/* ---------- 화면 켜 두기 ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* 지원하지 않으면 그냥 넘어감 */ }
}

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

/* ---------- 그리기: 프로젝트 정보 ---------- */
function renderProjectBar() {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#projSelect').innerHTML = sorted.map(p =>
    `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${esc(p.title || '제목 없는 영상')} (${p.scenes.length}장면)</option>`).join('');
  $('#delProjWrap').innerHTML = '<button class="btn small" id="delProj" type="button">이 영상 지우기</button>';
}
function renderMeta() {
  $('#title').value = project.title || '';
  $('#makers').value = project.makers || '';
  $('#optTitle').checked = !!project.opts.title;
  $('#optKo').checked = !!project.opts.ko;
  $('#optEnd').checked = !!project.opts.end;
}

/* ---------- 그리기: 장면 카드 ---------- */
function chipsHTML(s) {
  const c = (ok, t) => `<span class="chip ${ok ? 'ok' : ''}">${ok ? '✓ ' : ''}${t}</span>`;
  const L = s.lines;
  const voiced = L.filter(l => l.audio).length;
  return c(s.images.length > 0, s.images.length > 1 ? `사진 ${s.images.length}장` : '사진')
    + c(L.every(l => l.ko.trim()), '한글')
    + c(L.every(l => l.en.trim()), '영어')
    + c(voiced === L.length, L.length > 1 ? `목소리 ${voiced}/${L.length}` : '목소리');
}

function audioHTML(l) {
  const isRec = rec.lineId === l.id;
  const recBtn = MIC_OK
    ? `<button class="btn red ${isRec ? 'on' : ''}" type="button" data-act="rec"><span class="rec-dot"></span>${isRec ? '녹음 끝내기 <span class="rectime" data-rectime>0:00</span>' : (l.audio ? '다시 녹음' : '녹음 시작')}</button>`
    : '';
  if (l.audio && !isRec) {
    return `<audio controls preload="metadata" src="${blobURL('aud-' + l.id, l.audio)}"></audio>
      <div class="row"><span class="note">${esc(l.audioName || '내 목소리')} · ${fmtTime(l.audioDur)}</span></div>
      <div class="row">${recBtn}
        <label class="btn small" for="af-${l.id}">파일로 바꾸기</label>
        <button class="btn small" type="button" data-act="audio-remove">지우기</button></div>`;
  }
  return `<div class="note">${isRec ? '이 문장을 또박또박 읽어요. 다 읽으면 <b>녹음 끝내기</b>!' : (MIC_OK ? '녹음 시작을 누르고 이 문장을 읽어요.' : '녹음 파일을 골라 넣어요.')}</div>
    <div class="row">${recBtn}${isRec ? '' : `<label class="btn small" for="af-${l.id}">녹음 파일 고르기</label>`}</div>`;
}

function aiBoxHTML(l) {
  const b = busy.get(l.id);
  const st = statusMsg.get(l.id);
  const stText = b ? (b.kind === 'translate' ? '영어로 바꾸는 중이에요…' : '선생님이 읽어 보는 중이에요…') : (st ? st.text : '');
  const stopBtn = b ? '<button class="btn small" type="button" data-act="stop-ai">멈추기</button>' : '';
  const tabs = `<div class="tabs" role="group" aria-label="영어 만드는 방법">
      <button type="button" data-act="mode" data-mode="self" aria-pressed="${l.mode === 'self'}">내가 먼저 써 보기</button>
      <button type="button" data-act="mode" data-mode="ai" aria-pressed="${l.mode === 'ai'}">AI가 번역</button>
    </div>`;
  let inner;
  if (l.mode === 'ai') {
    const vocab = l.words && l.words.length
      ? `<div><div class="lab">새로 나온 낱말</div><div class="vocab">${l.words.map(w => `<span><b>${esc(w.en)}</b> · ${esc(w.ko)}</span>`).join('')}</div></div>`
      : '';
    inner = `<div class="row">
        <button class="btn diamond" type="button" data-act="translate" ${b || !l.ko.trim() ? 'disabled' : ''}>${ICON.spark} ${l.en.trim() ? '다시 번역하기' : '영어로 바꾸기'}</button>${stopBtn}
      </div>
      <p class="status ${st && st.err && !b ? 'err' : ''}" data-status>${esc(stText || (l.ko.trim() ? '' : '먼저 한글 문장을 써 주세요.'))}</p>
      ${vocab}`;
  } else {
    const f = l.feedback;
    const fb = f ? `<div class="feedback">
        <div class="praise">${esc(f.praise)}</div>
        ${f.corrected && f.corrected !== l.attempt.trim() ? `<div><div class="lab">이렇게 고치면 더 좋아요</div><div class="fixed">${esc(f.corrected)}</div></div>` : ''}
        ${(f.fixes || []).map(x => `<div class="fix"><div class="ba"><s>${esc(x.before)}</s> → <ins>${esc(x.after)}</ins></div><div class="why">${esc(x.why)}</div></div>`).join('')}
        <div class="row"><button class="btn small grass" type="button" data-act="use-fix">이 문장으로 정하기</button></div>
      </div>` : '';
    inner = `<div class="field">
        <label class="lab" for="att-${l.id}">내가 먼저 영어로 써 보기</label>
        <textarea id="att-${l.id}" data-field="attempt" rows="2" placeholder="Today I ..." lang="en" autocapitalize="sentences">${esc(l.attempt)}</textarea>
      </div>
      <div class="row">
        <button class="btn diamond" type="button" data-act="check" ${b || !l.attempt.trim() ? 'disabled' : ''}>${ICON.spark} 선생님 확인받기</button>${stopBtn}
      </div>
      <p class="status ${st && st.err && !b ? 'err' : ''}" data-status>${esc(stText)}</p>
      ${fb}`;
  }
  return `${tabs}<div class="ai-box">${inner}</div>`;
}

function dictButtonHTML(l) {
  const on = dict.lineId === l.id;
  return `<button class="btn small mic ${on ? 'on' : ''}" type="button" data-act="dictate" aria-pressed="${on}">${ICON.mic} ${on ? '듣는 중이에요… 다 말하면 눌러요' : '말로 쓰기'}</button>`;
}

function lineHTML(l, j, n) {
  const many = n > 1;
  return `<section class="line" data-line="${l.id}">
    <div class="line-head">
      <div class="line-name">문장 ${j + 1}</div>
      ${many ? `<div class="head-tools">
        <button class="btn small" type="button" data-act="line-up" ${j === 0 ? 'disabled' : ''} aria-label="문장 ${j + 1} 앞으로">${ICON.up}</button>
        <button class="btn small" type="button" data-act="line-down" ${j === n - 1 ? 'disabled' : ''} aria-label="문장 ${j + 1} 뒤로">${ICON.down}</button>
        <span data-linedelwrap><button class="btn small" type="button" data-act="line-del">문장 지우기</button></span>
      </div>` : ''}
    </div>
    <div class="field">
      <div class="lab-row">
        <label class="lab" for="ko-${l.id}">한글로 쓰기</label>
        ${DICT_OK ? dictButtonHTML(l) : ''}
      </div>
      <textarea id="ko-${l.id}" data-field="ko" rows="2" placeholder="${j === 0 ? '이 사진에서 무엇을 했나요?' : '이어서 하고 싶은 말을 써요'}">${esc(l.ko)}</textarea>
    </div>
    ${AI_ON ? aiBoxHTML(l) : ''}
    <div class="field">
      <label class="lab" for="en-${l.id}">${AI_ON ? '영상에 들어갈 영어 문장' : '영어로 써 보기'}</label>
      <textarea id="en-${l.id}" data-field="en" rows="2" placeholder="Today I ..." lang="en" autocapitalize="sentences" spellcheck="true">${esc(l.en)}</textarea>
      <div class="row helpers">
        <button class="btn small" type="button" data-act="speak" ${'speechSynthesis' in window ? '' : 'hidden'}>${ICON.speaker} 발음 들어 보기</button>
        ${AI_ON ? '' : '<button class="btn small" type="button" data-act="papago">파파고로 도움 받기</button>'}
      </div>
    </div>
    <div class="field">
      <div class="lab">내 목소리 (이 문장 읽기)</div>
      <div class="audio-drop ${l.audio ? 'has' : ''}" data-audiodrop>
        ${audioHTML(l)}
        <input type="file" id="af-${l.id}" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" data-act="audio-file" hidden>
      </div>
    </div>
  </section>`;
}

function sceneHint(s) {
  const P = s.images.length, L = s.lines.length;
  if (P > 1 && L > 1) return `영상에서 사진 ${P}장이 차례로 넘어가는 동안 문장 ${L}개가 나와요.`;
  if (P > 1) return `영상에서 이 문장이 나오는 동안 사진 ${P}장이 차례로 넘어가요.`;
  if (L > 1) return `영상에서 이 사진이 나오는 동안 문장 ${L}개가 차례대로 나와요.`;
  return '할 말이 더 있으면 <b>문장 더하기</b>, 같은 문장에 사진을 더 보여주려면 <b>사진 더하기</b>를 눌러요.';
}

function photosHTML(s, i) {
  const P = s.images.length;
  if (!P) return '<div class="shot"></div>';
  const main = `<div class="shot"><img src="${blobURL(`img-${s.id}-0`, s.images[0])}" alt="장면 ${i + 1} 게임 화면"></div>`;
  if (P === 1) return main;
  const thumbs = s.images.map((b, k) => `<figure class="thumb" data-photo="${k}">
      <img src="${blobURL(`img-${s.id}-${k}`, b)}" alt="장면 ${i + 1} 사진 ${k + 1}">
      <figcaption>${k + 1}</figcaption>
      <div class="thumb-tools">
        <button class="btn tiny" type="button" data-act="photo-left" ${k === 0 ? 'disabled' : ''} aria-label="사진 ${k + 1} 앞으로">◀</button>
        <button class="btn tiny" type="button" data-act="photo-right" ${k === P - 1 ? 'disabled' : ''} aria-label="사진 ${k + 1} 뒤로">▶</button>
        <button class="btn tiny" type="button" data-act="photo-del" aria-label="사진 ${k + 1} 빼기">✕</button>
      </div>
    </figure>`).join('');
  return `${main}<div class="thumbs">${thumbs}</div>`;
}

function cardHTML(s, i, n) {
  const L = s.lines;
  return `<article class="card" data-id="${s.id}">
    <div class="card-head">
      <div class="name">장면 ${i + 1} ${s.example ? '<span class="badge">예시</span>' : ''}</div>
      <div class="chips" data-chips>${chipsHTML(s)}</div>
      <div class="head-tools">
        <button class="btn small" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="장면 앞으로 옮기기">${ICON.up}</button>
        <button class="btn small" type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="장면 뒤로 옮기기">${ICON.down}</button>
        <span data-delwrap><button class="btn small" type="button" data-act="del">장면 지우기</button></span>
      </div>
    </div>
    <div class="card-body">
      <div class="shot-col">
        ${photosHTML(s, i)}
        <div class="shot-tools">
          <label class="btn small" for="if-${s.id}">+ 사진 더하기</label>
          <input type="file" id="if-${s.id}" accept="image/*" multiple data-act="img-file" hidden>
          ${i < n - 1 ? `<span data-mergewrap><button class="btn small" type="button" data-act="merge">아래 장면과 합치기</button></span>` : ''}
        </div>
        <p class="hint">${sceneHint(s)}</p>
      </div>
      <div class="col lines">
        ${L.map((l, j) => lineHTML(l, j, L.length)).join('')}
        <button class="btn grass" type="button" data-act="line-add">+ 문장 더하기</button>
        <p class="hint">${AI_ON ? '영어 문장은 자막으로 들어가요. 직접 고쳐도 돼요. 발음 듣기는 연습용이에요.' : '먼저 혼자 써 보고, 막히면 파파고에서 한글 문장을 바꿔 봐요. 발음 듣기는 연습용이에요.'}</p>
      </div>
    </div>
  </article>`;
}

function renderScenes() {
  if (!project) return;
  const n = project.scenes.length;
  $('#scenes').innerHTML = project.scenes.map((s, i) => cardHTML(s, i, n)).join('');
  $('#adderTitle').textContent = n ? '장면 더 넣기' : '게임 화면 사진을 넣어요';
  renderSummary();
}
function rerenderCard(id) {
  const idx = project.scenes.findIndex(s => s.id === id);
  const el = document.querySelector(`.card[data-id="${id}"]`);
  if (idx < 0 || !el) return renderScenes();
  el.outerHTML = cardHTML(project.scenes[idx], idx, project.scenes.length);
  renderSummary();
}
function updateChips(s) {
  const el = document.querySelector(`.card[data-id="${s.id}"] [data-chips]`);
  if (el) el.innerHTML = chipsHTML(s);
  renderSummary();
}

function renderSummary() {
  const sc = project.scenes;
  const lines = sc.flatMap(s => s.lines);
  const voiced = lines.filter(l => l.audio).length;
  $('#summary').textContent = sc.length
    ? `장면 ${sc.length}개 · 문장 ${lines.length}개 · 목소리 ${voiced}/${lines.length} · 예상 길이 ${fmtTime(totalDur(project))}`
    : '아직 장면이 없어요';
  const todo = [];
  sc.forEach((s, i) => {
    s.lines.forEach((l, j) => {
      const miss = [];
      if (!l.en.trim()) miss.push('영어 문장');
      if (!l.audio) miss.push('목소리');
      if (miss.length) todo.push(`장면 ${i + 1}${s.lines.length > 1 ? ` 문장 ${j + 1}` : ''}: ${miss.join(', ')}이 아직 없어요`);
    });
  });
  $('#todo').innerHTML = todo.slice(0, 5).map(t => `<li>${esc(t)}</li>`).join('') + (todo.length > 5 ? `<li>그 밖에 ${todo.length - 5}개 더</li>` : '');
  $('#makeBtn').disabled = !sc.length || rendering;
}

/* ---------- 사진·소리 넣기 ---------- */
function addImages(files) {
  const imgs = [...files].filter(f => f && f.type && f.type.startsWith('image/'));
  if (!imgs.length) return 0;
  imgs.forEach(f => project.scenes.push(newScene(f)));
  renderScenes(); renderProjectBar(); save();
  toast(`장면 ${imgs.length}개를 넣었어요`);
  return imgs.length;
}

// 마인크래프트 포트폴리오 PDF → 사진마다 장면 하나
let importing = false;
async function addPdfs(files) {
  const pdfs = [...files].filter(isPdf);
  if (!pdfs.length) return 0;
  if (importing) { toast('PDF를 꺼내는 중이에요. 잠깐만 기다려 주세요.'); return pdfs.length; }
  importing = true;
  const note = $('#importNote');
  note.classList.remove('err');
  note.textContent = 'PDF에서 사진을 꺼내는 중이에요…';
  let total = 0;
  try {
    for (const f of pdfs) {
      let out;
      try { out = await importPortfolioPdf(f); }
      catch (e) { console.error(e); out = { title: '', images: [] }; }
      if (!out.images.length) continue;
      out.images.forEach(({ blob, caption }) => {
        const first = {};
        if (caption) { if (/[가-힣]/.test(caption)) first.ko = caption; else first.attempt = caption; }
        project.scenes.push(newScene(blob, first));
      });
      total += out.images.length;
      if (out.title && !(project.title || '').trim()) { project.title = out.title; $('#title').value = out.title; }
    }
  } finally {
    importing = false;
  }
  if (total) {
    renderScenes(); renderProjectBar(); save();
    note.textContent = '';
    toast(`포트폴리오에서 사진 ${total}장을 꺼냈어요`);
  } else {
    note.classList.add('err');
    note.textContent = '이 PDF에서는 사진을 찾지 못했어요. 마인크래프트에서 내보낸 포트폴리오 PDF인지 확인해 주세요.';
  }
  return pdfs.length;
}

let decodeCtx = null;
async function audioDuration(blob) {
  try {
    decodeCtx = decodeCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } catch (e) { return null; }
}
const isAudio = (f) => f && ((f.type && f.type.startsWith('audio/')) || /\.(m4a|mp3|wav|ogg|webm|aac)$/i.test(f.name || ''));

async function setAudio(s, l, blob, name) {
  const d = await audioDuration(blob);
  if (!d) { toast('이 녹음 파일은 열 수 없어요. m4a, mp3, wav 파일을 넣어 주세요.'); return false; }
  l.audio = blob; l.audioName = name || '내 목소리'; l.audioDur = d;
  save(); rerenderCard(s.id);
  return true;
}
// 녹음 파일 여러 개를 끌어다 놓으면 파일 이름 순서대로 빈 문장 칸에 넣는다.
async function addAudiosInOrder(files) {
  const auds = [...files].filter(isAudio).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true }));
  let k = 0;
  for (const s of project.scenes) {
    for (const l of s.lines) {
      if (k >= auds.length) break;
      if (!l.audio) { await setAudio(s, l, auds[k], auds[k].name); k++; }
    }
  }
  if (auds.length) toast(k ? '녹음 파일을 목소리 칸에 차례대로 넣었어요' : '목소리가 빈 문장이 없어요');
}

/* ---------- 녹음 ---------- */
async function stopRecordingNow() {
  if (!rec.lineId) return null;
  clearInterval(rec.timer);
  const blob = await rec.handle.stop();
  rec.lineId = null; rec.sceneId = null; rec.handle = null;
  keepAwake(false);
  return blob;
}
async function toggleRecord(s, l) {
  if (rec.lineId === l.id) {
    const blob = await stopRecordingNow();
    if (!blob || blob.size < 500) { toast('녹음이 너무 짧아요. 다시 해 볼까요?'); rerenderCard(s.id); return; }
    await setAudio(s, l, blob, '내 목소리 녹음');
    return;
  }
  if (rec.lineId) { toast('다른 문장을 녹음하고 있어요. 먼저 녹음을 끝내 주세요.'); return; }
  if (dict.lineId) { toast('말로 쓰기가 끝나면 녹음해 주세요.'); return; }
  if (!l.en.trim()) toast('영어 문장을 먼저 써 두면 보면서 읽을 수 있어요');
  try {
    rec.handle = await startRecording();
    rec.lineId = l.id; rec.sceneId = s.id;
    keepAwake(true);
    rerenderCard(s.id);
    rec.timer = setInterval(() => {
      const el = document.querySelector(`[data-line="${l.id}"] [data-rectime]`);
      if (el) el.textContent = fmtTime((Date.now() - rec.handle.startedAt) / 1000);
    }, 250);
  } catch (e) {
    toast(micErrorMessage(e));
  }
}

/* ---------- 말로 쓰기(음성 입력) ---------- */
const joinText = (base, add) => (base && add ? base + ' ' + add : base || add);
function stopDictation() { if (dict.handle) dict.handle.stop(); }
function toggleDictation(s, l) {
  if (dict.lineId === l.id) { stopDictation(); return; }
  if (rec.lineId) { toast('녹음하는 동안에는 말로 쓰기를 할 수 없어요. 녹음을 먼저 끝내 주세요.'); return; }
  if (dict.lineId) stopDictation();
  const base = l.ko.trim();
  try {
    dict.handle = startDictation({
      lang: 'ko-KR',
      onText: (text) => {
        const ta = document.getElementById('ko-' + l.id);
        if (ta) ta.value = joinText(base, text);
      },
      onError: (code) => toast(dictationMessage(code)),
      onEnd: (finalText) => {
        dict.lineId = null; dict.sceneId = null; dict.handle = null;
        if (finalText) { l.ko = joinText(base, tidyKorean(finalText)); s.example = false; save(); }
        const now = sceneOfLine(l);
        if (now) rerenderCard(now.id);
      }
    });
    dict.lineId = l.id; dict.sceneId = s.id;
    rerenderCard(s.id);
  } catch (e) {
    dict.lineId = null; dict.handle = null;
    toast(dictationMessage('unknown'));
  }
}

/* ---------- 발음 듣기와 파파고 ---------- */
function speak(text) {
  if (!text.trim()) { toast('먼저 영어 문장을 써 주세요'); return; }
  if (!('speechSynthesis' in window)) { toast('이 브라우저에서는 발음 듣기가 안 돼요'); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    const v = speechSynthesis.getVoices().find(v => /^en[-_]US/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { toast('이 브라우저에서는 발음 듣기가 안 돼요'); }
}
function openPapago(ko) {
  const url = 'https://papago.naver.com/?sk=ko&tk=en' + (ko.trim() ? '&st=' + encodeURIComponent(ko.trim()) : '');
  window.open(url, '_blank', 'noopener');
}

/* ---------- AI 영어 도우미 ---------- */
const sceneOfLine = (l) => project.scenes.find(s => s.lines.includes(l));
async function runAI(s, l, kind, work) {
  const ctl = new AbortController();
  busy.set(l.id, { kind, ctl });
  statusMsg.delete(l.id);
  rerenderCard(s.id);
  try {
    await work(ctl.signal);
  } catch (e) {
    const msg = aiMessage(e);
    if (msg) statusMsg.set(l.id, { text: msg, err: true });
  } finally {
    busy.delete(l.id);
    const now = sceneOfLine(l);
    if (now) rerenderCard(now.id);
  }
}
function aiTranslate(s, l) {
  if (!l.ko.trim()) return;
  return runAI(s, l, 'translate', async (signal) => {
    const r = await coach('translate', { ko: l.ko.trim() }, signal);
    l.en = String(r.english || '').trim();
    l.words = Array.isArray(r.words) ? r.words.slice(0, 4) : [];
    statusMsg.set(l.id, { text: '다 됐어요! 아래 영어 문장을 소리 내어 읽어 보세요.', err: false });
    save();
  });
}
function aiCheck(s, l) {
  if (!l.attempt.trim()) return;
  l.feedback = null;
  return runAI(s, l, 'check', async (signal) => {
    const r = await coach('check', { ko: l.ko.trim(), attempt: l.attempt.trim() }, signal);
    l.feedback = {
      corrected: String(r.corrected || l.attempt).trim(),
      praise: String(r.praise || '잘 썼어요!'),
      fixes: Array.isArray(r.fixes) ? r.fixes.slice(0, 4) : []
    };
    save();
  });
}

/* ---------- 부모님 설정 ---------- */
function initParentPanel() {
  const panel = $('#parent');
  if (!AI_ON) { panel.hidden = true; return; }
  const input = $('#familyCode');
  input.value = getFamilyCode();
  const status = $('#parentStatus');
  $('#saveCode').addEventListener('click', async () => {
    setFamilyCode(input.value.trim());
    status.classList.remove('err');
    status.textContent = '확인하는 중이에요…';
    try {
      await coach('ping', {});
      status.textContent = 'AI 도우미와 연결됐어요.';
    } catch (e) {
      status.classList.add('err');
      status.textContent = aiMessage(e);
    }
  });
}

/* ---------- 이벤트: 카드 ---------- */
const scenesEl = $('#scenes');
const findScene = (el) => {
  const c = el.closest('.card');
  return c ? project.scenes.find(s => s.id === c.dataset.id) : null;
};
const findLine = (s, el) => {
  const box = el.closest('[data-line]');
  return s && box ? s.lines.find(l => l.id === box.dataset.line) : null;
};
const abortLine = (l) => { const job = busy.get(l.id); if (job) job.ctl.abort(); };

scenesEl.addEventListener('input', (e) => {
  const f = e.target.dataset.field;
  if (!f) return;
  const s = findScene(e.target);
  const l = findLine(s, e.target);
  if (!l) return;
  l[f] = e.target.value;
  if (s.example) s.example = false;
  save(); updateChips(s);
  // 글을 쓰면 AI 버튼을 켜거나 끈다(카드를 다시 그리지 않아 글쓰기가 끊기지 않게).
  if (AI_ON && (f === 'ko' || f === 'attempt') && !busy.get(l.id)) {
    const box = e.target.closest('[data-line]');
    const btn = box.querySelector(f === 'ko' ? '[data-act="translate"]' : '[data-act="check"]');
    if (btn) btn.disabled = !e.target.value.trim();
    if (f === 'ko' && l.mode === 'ai' && !statusMsg.get(l.id)) {
      const st = box.querySelector('[data-status]');
      if (st) st.textContent = e.target.value.trim() ? '' : '먼저 한글 문장을 써 주세요.';
    }
  }
});

scenesEl.addEventListener('change', async (e) => {
  const act = e.target.dataset.act;
  const s = findScene(e.target);
  const file = e.target.files && e.target.files[0];
  if (!s || !file) return;
  if (act === 'img-file') {
    const imgs = [...e.target.files].filter(f => f.type && f.type.startsWith('image/'));
    if (imgs.length) { s.images.push(...imgs); s.example = false; save(); rerenderCard(s.id); toast(`사진 ${imgs.length}장을 이 장면에 더했어요`); }
  }
  if (act === 'audio-file') { const l = findLine(s, e.target); if (l) await setAudio(s, l, file, file.name); }
  e.target.value = '';
});

scenesEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const s = findScene(b);
  if (!s) return;
  const i = project.scenes.indexOf(s);
  const l = findLine(s, b);
  const j = l ? s.lines.indexOf(l) : -1;
  const act = b.dataset.act;

  // 장면
  if (act === 'up' && i > 0) {
    [project.scenes[i - 1], project.scenes[i]] = [project.scenes[i], project.scenes[i - 1]];
    save(); renderScenes();
  } else if (act === 'down' && i < project.scenes.length - 1) {
    [project.scenes[i + 1], project.scenes[i]] = [project.scenes[i], project.scenes[i + 1]];
    save(); renderScenes();
  } else if (act === 'del') {
    b.parentElement.innerHTML = '<button class="btn small red" type="button" data-act="del-yes">정말 지울까요?</button> <button class="btn small" type="button" data-act="del-no">아니요</button>';
  } else if (act === 'del-no') {
    b.parentElement.innerHTML = '<button class="btn small" type="button" data-act="del">장면 지우기</button>';
  } else if (act === 'del-yes') {
    if (rec.sceneId === s.id) await stopRecordingNow();
    if (dict.sceneId === s.id) stopDictation();
    s.lines.forEach(abortLine);
    project.scenes.splice(i, 1);
    save(); renderScenes(); renderProjectBar();
  }

  // 사진
  else if (act === 'photo-left' || act === 'photo-right' || act === 'photo-del') {
    const k = Number(b.closest('[data-photo]').dataset.photo);
    if (act === 'photo-del') { if (s.images.length > 1) s.images.splice(k, 1); }
    else {
      const m = act === 'photo-left' ? k - 1 : k + 1;
      if (m >= 0 && m < s.images.length) [s.images[k], s.images[m]] = [s.images[m], s.images[k]];
    }
    save(); rerenderCard(s.id);
  } else if (act === 'merge') {
    b.parentElement.innerHTML = '<button class="btn small red" type="button" data-act="merge-yes">아래 장면을 합칠까요?</button> <button class="btn small" type="button" data-act="merge-no">아니요</button>';
  } else if (act === 'merge-no') {
    b.parentElement.innerHTML = '<button class="btn small" type="button" data-act="merge">아래 장면과 합치기</button>';
  } else if (act === 'merge-yes') {
    const next = project.scenes[i + 1];
    if (!next) return;
    if (rec.sceneId === next.id) await stopRecordingNow();
    s.images.push(...next.images);
    // 아래 장면의 문장 중 무언가 쓴 것만 이어 붙인다.
    const used = next.lines.filter(l => l.ko.trim() || l.en.trim() || l.attempt.trim() || l.audio);
    s.lines.push(...used);
    project.scenes.splice(i + 1, 1);
    s.example = false;
    save(); renderScenes(); renderProjectBar();
    toast(`장면 ${i + 2}의 사진을 이 장면에 합쳤어요`);
  }

  // 문장 줄
  else if (act === 'line-add') {
    const nl = newLine();
    s.lines.push(nl);
    s.example = false;
    save(); rerenderCard(s.id);
    const ta = document.getElementById('ko-' + nl.id);
    if (ta) { ta.focus({ preventScroll: true }); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  } else if (!l) {
    return;
  } else if (act === 'line-up' && j > 0) {
    [s.lines[j - 1], s.lines[j]] = [s.lines[j], s.lines[j - 1]];
    save(); rerenderCard(s.id);
  } else if (act === 'line-down' && j < s.lines.length - 1) {
    [s.lines[j + 1], s.lines[j]] = [s.lines[j], s.lines[j + 1]];
    save(); rerenderCard(s.id);
  } else if (act === 'line-del') {
    b.parentElement.innerHTML = '<button class="btn small red" type="button" data-act="line-del-yes">정말 지울까요?</button> <button class="btn small" type="button" data-act="line-del-no">아니요</button>';
  } else if (act === 'line-del-no') {
    b.parentElement.innerHTML = '<button class="btn small" type="button" data-act="line-del">문장 지우기</button>';
  } else if (act === 'line-del-yes') {
    if (s.lines.length <= 1) return;
    if (rec.lineId === l.id) await stopRecordingNow();
    if (dict.lineId === l.id) stopDictation();
    abortLine(l);
    s.lines.splice(j, 1);
    save(); rerenderCard(s.id);
  }
  else if (act === 'mode') { l.mode = b.dataset.mode; statusMsg.delete(l.id); save(); rerenderCard(s.id); }
  else if (act === 'translate') aiTranslate(s, l);
  else if (act === 'check') aiCheck(s, l);
  else if (act === 'stop-ai') abortLine(l);
  else if (act === 'use-fix') {
    if (l.feedback) { l.en = l.feedback.corrected || l.attempt; save(); rerenderCard(s.id); toast('영상에 들어갈 문장으로 정했어요'); }
  } else if (act === 'speak') speak(l.en);
  else if (act === 'papago') openPapago(l.ko);
  else if (act === 'audio-remove') { l.audio = null; l.audioName = ''; l.audioDur = 0; save(); rerenderCard(s.id); }
  else if (act === 'rec') toggleRecord(s, l);
  else if (act === 'dictate') toggleDictation(s, l);
});

/* ---------- 이벤트: 프로젝트 ---------- */
let barTimer;
$('#title').addEventListener('input', (e) => {
  project.title = e.target.value; save();
  clearTimeout(barTimer); barTimer = setTimeout(renderProjectBar, 400);
});
$('#makers').addEventListener('input', (e) => { project.makers = e.target.value; save(); });
document.querySelectorAll('[data-maker]').forEach(b => b.addEventListener('click', () => {
  project.makers = b.dataset.maker; $('#makers').value = project.makers; save();
}));
['Title', 'Ko', 'End'].forEach(k => $('#opt' + k).addEventListener('change', (e) => {
  project.opts[k.toLowerCase()] = e.target.checked; save(); renderSummary();
}));
$('#pickImages').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  addImages(files);
  addPdfs(files);
});
$('#projSelect').addEventListener('change', (e) => {
  const p = projects.find(p => p.id === e.target.value);
  if (p) openProject(p);
});
$('#newProj').addEventListener('click', () => {
  if (rendering || rec.lineId) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); return; }
  const p = newProject();
  projects.push(p);
  openProject(p);
  save(true);
  toast('새 영상을 시작했어요. 사진부터 넣어 볼까요?');
});
$('.projbar').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'delProj') {
    $('#delProjWrap').innerHTML = '<button class="btn small red" id="delYes" type="button">정말 지울까요?</button> <button class="btn small" id="delNo" type="button">아니요</button>';
  } else if (b.id === 'delNo') renderProjectBar();
  else if (b.id === 'delYes') {
    if (rendering || rec.lineId) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); renderProjectBar(); return; }
    await store.remove(project.id);
    projects = projects.filter(p => p.id !== project.id);
    if (!projects.length) { const p = newProject(); projects.push(p); openProject(p); save(true); }
    else openProject([...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
    toast('지웠어요');
  }
});
function openProject(p) {
  if (rendering || rec.lineId) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); renderProjectBar(); return; }
  clearURLs();
  busy.forEach(x => x.ctl.abort());
  busy.clear(); statusMsg.clear();
  project = p;
  resetResult();
  renderProjectBar(); renderMeta(); renderScenes();
}

/* ---------- 붙여넣기와 끌어다 놓기 (PC) ---------- */
document.addEventListener('paste', (e) => {
  const items = e.clipboardData ? [...e.clipboardData.items] : [];
  const files = items.filter(it => it.kind === 'file' && it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addImages(files); }
});
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; $('#dropOverlay').hidden = false; });
document.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#dropOverlay').hidden = true;
});
document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  document.querySelectorAll('.audio-drop.drag').forEach(el => el.classList.remove('drag'));
  const z = e.target.closest && e.target.closest('[data-audiodrop]');
  if (z) z.classList.add('drag');
});
document.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0; $('#dropOverlay').hidden = true;
  document.querySelectorAll('.audio-drop.drag').forEach(el => el.classList.remove('drag'));
  const files = [...e.dataTransfer.files];
  const zone = e.target.closest && e.target.closest('[data-audiodrop]');
  const auds = files.filter(isAudio);
  if (zone && auds.length) { const s = findScene(zone); const l = findLine(s, zone); if (l) await setAudio(s, l, auds[0], auds[0].name); }
  else if (auds.length) await addAudiosInOrder(auds);
  const n = addImages(files);
  const p = await addPdfs(files);
  if (!n && !p && !auds.length) toast('사진, 포트폴리오 PDF, 녹음 파일만 넣을 수 있어요');
});

/* ---------- 영상 만들기 ---------- */
function resetResult() {
  if (result && result.url) URL.revokeObjectURL(result.url);
  result = null;
  $('#resultRow').hidden = true;
  $('#saveStatus').textContent = '';
  $('#saveStatus').classList.remove('err');
  $('#screen').innerHTML = '<div class="idle">여기에 영상이 나와요</div>';
  $('#barFill').style.width = '0%';
}

async function makeVideo() {
  if (rendering || !project.scenes.some(s => s.images.length)) return;
  if (rec.lineId) { toast('녹음을 먼저 끝내 주세요'); return; }
  stopDictation();
  if (!canMakeVideo()) { $('#makeNote').textContent = '이 브라우저에서는 영상을 만들 수 없어요. 크롬이나 엣지에서 열어 주세요.'; return; }
  rendering = true; cancelRequested = false;
  resetResult();
  $('#makeBtn').disabled = true;
  $('#cancelBtn').hidden = false;
  $('#makeNote').textContent = '준비하는 중이에요…';
  keepAwake(true);
  try {
    const out = await renderVideo(project, {
      mount: (canvas) => { $('#screen').innerHTML = ''; $('#screen').appendChild(canvas); },
      onProgress: (p) => { $('#barFill').style.width = (p * 100).toFixed(1) + '%'; },
      onStatus: (t) => { $('#makeNote').textContent = t; },
      isCancelled: () => cancelRequested
    });
    if (!out) { resetResult(); $('#makeNote').textContent = '멈췄어요. 다시 만들 수 있어요.'; return; }
    result = { ...out, url: URL.createObjectURL(out.blob) };
    const v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.src = result.url;
    $('#screen').innerHTML = ''; $('#screen').appendChild(v);
    $('#barFill').style.width = '100%';
    $('#makeNote').textContent = `완성! ${fmtTime(out.total)} 길이의 영상이에요. 재생해 보고 마음에 들면 저장하세요.`;
    $('#resultRow').hidden = false;
    $('#shareBtn').hidden = !canShareFile(videoFile());
  } catch (e) {
    console.error(e);
    resetResult();
    $('#makeNote').textContent = '영상을 만들다가 문제가 생겼어요. 사진이나 녹음 파일 하나가 망가졌을 수 있어요. 다시 눌러 보세요.';
  } finally {
    rendering = false;
    keepAwake(false);
    $('#cancelBtn').hidden = true;
    renderSummary();
  }
}

function fileBase() {
  return ((project.title || '').trim() || '나의 마인크래프트 이야기').replace(/[\\/:*?"<>|]+/g, ' ').trim();
}
function videoFile() {
  if (!result) return null;
  return new File([result.blob], `${fileBase()}.${result.ext}`, { type: result.blob.type });
}
function canShareFile(f) {
  try { return !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}

$('#makeBtn').addEventListener('click', makeVideo);
$('#cancelBtn').addEventListener('click', () => { cancelRequested = true; });
$('#saveBtn').addEventListener('click', () => {
  if (!result) return;
  const a = document.createElement('a');
  a.href = result.url;
  a.download = `${fileBase()}.${result.ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  $('#saveStatus').textContent = TOUCH
    ? '저장했어요! 갤러리의 Download 앨범이나 내 파일 → 다운로드에서 찾을 수 있어요.'
    : '저장했어요! 다운로드 폴더를 열어 보세요.';
});
$('#shareBtn').addEventListener('click', async () => {
  const f = videoFile();
  if (!canShareFile(f)) return;
  try { await navigator.share({ files: [f], title: fileBase() }); }
  catch (e) { if (e && e.name !== 'AbortError') $('#saveStatus').textContent = '보내기를 하지 못했어요. 저장하기를 눌러 주세요.'; }
});

/* ---------- 시작 ---------- */
async function init() {
  if (TOUCH) { $('#howPC').hidden = true; $('#howTab').hidden = false; }
  initParentPanel();
  store.askPersist();
  const all = await store.loadAll();
  if (all === null) $('#storageNote').textContent = '이 브라우저에서는 자동 저장이 되지 않아요. 창을 닫기 전에 영상을 먼저 저장하세요.';
  if (all && all.length) {
    all.forEach(p => p.scenes.forEach(fixScene));
    projects = all;
    project = [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  } else {
    project = await makeExampleProject();
    projects = [project];
    save(true);
  }
  renderProjectBar(); renderMeta(); renderScenes();
}
init();

window.addEventListener('beforeunload', (e) => {
  if (rendering || rec.lineId) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(() => { /* 오프라인 기능 없이 계속 */ });
  // 새 버전이 들어오면 한 번 새로 고침해서 바로 새 화면을 쓴다(녹음·영상 만들기 중이면 끝난 뒤에).
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    const go = () => {
      if (rendering || rec.lineId || importing) { setTimeout(go, 2000); return; }
      reloaded = true;
      location.reload();
    };
    go();
  });
}
