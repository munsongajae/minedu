// 곰이난이 블록 스튜디오 — 화면과 동작
import * as store from './storage.js';
import { makeExampleImage } from './world.js';
import { renderVideo, previewVideo, totalDur, canMakeVideo } from './video.js';
import { TRANS, MOVES, SUBS, fxOf } from './fx.js';
import { canRecord, startRecording, micErrorMessage } from './recorder.js';
import { aiEnabled, coach, aiMessage, getFamilyCode, setFamilyCode } from './ai.js';
import { importPortfolioPdf, isPdf } from './pdf-import.js';
import { canDictate, startDictation, tidyKorean, tidyEnglish, dictationMessage } from './dictation.js';
import { canSpeak, speak as say, speakWord, SPEEDS, getSpeed, setSpeed, followHTML } from './speech.js';
import { cloudAvailable, getDeviceName, setDeviceName, pushProject, pullProject, headProject, listCloud, deleteCloud } from './cloud.js';
import { checkReset, eraseEverything } from './reset.js';

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
const SPEAK_OK = canSpeak();
const TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* ---------- 상태 ---------- */
// 장면 = 사진 한 장 + 문장 줄 여러 개. 문장 줄마다 한글·영어·녹음이 따로 있다.
let projects = [];
let project = null;
let saveTimer = null;
let erasing = false;     // '모든 기록 지우기' 중에는 저장·서버 올리기를 멈춘다
let rendering = false;
let cancelRequested = false;
let result = null; // { blob, ext, total, url }
const rec = { lineId: null, sceneId: null, handle: null, timer: null };
const dict = { lineId: null, sceneId: null, field: null, handle: null };
const talk = { lineId: null, mode: null, handle: null };   // 발음 들어 보기 중인 문장과 방식('all'|'word')   // 말로 쓰기(음성 입력) 중인 문장과 칸
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
    example: true,   // 예시 영상은 서버에 올리지 않는다
    opts: { title: true, ko: true, end: true },
    scenes: [scene]
  };
}

function save(now) {
  if (!project || erasing) return;
  project.updatedAt = Date.now();
  if (cloudOn(project)) { project.cloud.dirty = true; project.cloud.seq = (project.cloud.seq || 0) + 1; scheduleSync(); }
  clearTimeout(saveTimer);
  const go = async () => {
    const ok = await store.put(project);
    if (!ok) $('#storageNote').textContent = '이 브라우저에서는 자동 저장이 되지 않아요. 창을 닫기 전에 영상을 먼저 저장하세요.';
  };
  if (now) go(); else saveTimer = setTimeout(() => { saveTimer = null; go(); }, 500);
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
  drawFx();
  renderMusic();
}

/* ---------- 화면 효과 ---------- */
// project.opts.fx = { trans, move, sub, cards }, scene.fx = { trans, move } ('' = 영상 설정대로). 그리기는 fx.js·video.js.
const FX_CHOICES = {
  trans: TRANS,
  move: MOVES,
  sub: SUBS,
  cards: { true: '움직이기', false: '가만히' }
};
function drawFx() {
  const f = fxOf(project);
  document.querySelectorAll('#fxBox [data-fx]').forEach(g => {
    const key = g.dataset.fx;
    g.innerHTML = Object.entries(FX_CHOICES[key]).map(([v, label]) => {
      const on = String(f[key]) === v;
      return `<button type="button" data-v="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}">${label}</button>`;
    }).join('');
  });
}
$('#fxBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fx] button');
  if (!b) return;
  const key = b.closest('[data-fx]').dataset.fx;
  const v = key === 'cards' ? b.dataset.v === 'true' : b.dataset.v;
  project.opts.fx = { ...fxOf(project), [key]: v };
  save(); drawFx();
});
// 장면 카드의 '이 장면 효과'
const fxOpen = new Set();   // 펼쳐 둔 장면(다시 그려도 펼친 채로)
function sceneFxHTML(s) {
  const own = s.fx || {};
  const opt = (list, cur) => `<option value="" ${!cur ? 'selected' : ''}>영상 설정대로</option>` +
    Object.entries(list).filter(([v]) => v !== 'auto').map(([v, label]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`).join('');
  const now = [own.move && MOVES[own.move], own.trans && TRANS[own.trans] && `넘어올 때 ${TRANS[own.trans]}`].filter(Boolean).join(' · ');
  return `<details class="scene-fx" data-scenefx ${fxOpen.has(s.id) ? 'open' : ''}>
      <summary>이 장면 효과 <span class="scene-fx-now">${now ? esc(now) : '영상 설정대로'}</span></summary>
      <label>사진 움직임 <select data-act="scene-fx" data-key="move">${opt(MOVES, own.move)}</select></label>
      <label>이 장면으로 넘어올 때 <select data-act="scene-fx" data-key="trans">${opt(TRANS, own.trans)}</select></label>
    </details>`;
}

/* ---------- 미리 보기(소리와 함께) ---------- */
// 녹화하지 않고 #screen에 바로 재생한다. 목소리·배경 음악도 나오고, 그동안 음악 크기를 바꾸면 바로 들린다.
const PREVIEW_BTNS = { fxPreview: '▶ 미리 보기', musicPreview: '▶ 목소리랑 같이 들어 보기' };
let preview = null;   // { keep: 원래 화면, bar, h, btn }
async function togglePreview(btnId, opts = {}) {
  if (preview) { const same = preview.btn === btnId; stopPreview(); if (same) return; }
  if (rendering) return;
  if (rec.lineId) { toast('녹음을 먼저 끝내 주세요'); return; }
  if (!project.scenes.some(s => s.images.length)) { toast('먼저 게임 화면 사진을 넣어 주세요'); return; }
  stopTalk();
  $('#musicPlayer').pause();
  const screen = $('#screen');
  screen.querySelectorAll('video').forEach(v => v.pause());
  preview = { keep: [...screen.childNodes], bar: $('#barFill').style.width, h: null, btn: btnId };
  $('#' + btnId).textContent = '■ 멈추기';
  try {
    const h = await previewVideo(project, {
      mount: (c) => { if (preview) { screen.innerHTML = ''; screen.appendChild(c); } },
      onProgress: (p) => { $('#barFill').style.width = (p * 100).toFixed(1) + '%'; },
      onEnd: () => setTimeout(stopPreview, 600)
    }, opts);
    if (preview && preview.btn === btnId) preview.h = h; else h.stop();
  } catch (e) {
    console.error(e);
    stopPreview();
    toast('미리 보기를 하지 못했어요');
  }
}
function stopPreview() {
  if (!preview) return;
  const p = preview;
  preview = null;
  if (p.h) p.h.stop();
  $('#screen').replaceChildren(...p.keep);
  $('#barFill').style.width = p.bar;
  Object.entries(PREVIEW_BTNS).forEach(([id, label]) => { $('#' + id).textContent = label; });
}
$('#fxPreview').addEventListener('click', () => togglePreview('fxPreview'));
$('#musicPreview').addEventListener('click', () => togglePreview('musicPreview', { fromVoice: true }));

/* ---------- 배경 음악 ---------- */
// project.music = null | { blob, name, dur, vol(0~1), credit }
function renderMusic() {
  const m = project.music;
  $('#music').classList.toggle('has', !!m);
  $('#musicEmpty').hidden = !!m;
  $('#musicSet').hidden = !m;
  const player = $('#musicPlayer');
  if (!m) { player.removeAttribute('src'); return; }
  $('#musicName').textContent = `♪ ${m.name || '배경 음악'} · ${fmtTime(m.dur)}`;
  const url = blobURL('music', m.blob);
  if (player.getAttribute('src') !== url) player.src = url;
  player.volume = Math.min(1, Math.max(0, m.vol));
  $('#musicVol').value = Math.round(m.vol * 100);
  $('#musicCredit').value = m.credit || '';
}
async function setMusic(file) {
  const d = await audioDuration(file);
  if (!d) { toast('이 음악 파일은 열 수 없어요. mp3, m4a, wav 파일을 넣어 주세요.'); return; }
  project.music = { blob: file, name: file.name || '배경 음악', dur: d, vol: project.music ? project.music.vol : 0.3, credit: '' };
  save(); renderMusic(); renderSummary();
  toast('배경 음악을 넣었어요');
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
        <div class="lab-row">
          <label class="lab" for="att-${l.id}">내가 먼저 영어로 써 보기</label>
          ${dictButtonHTML(l, 'attempt')}
        </div>
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

// 말로 쓰기 칸: ko(한국어), attempt·en(영어)
const DICT_FIELDS = {
  ko: { lang: 'ko-KR', id: 'ko-', idle: '말로 쓰기', on: '듣는 중이에요… 다 말하면 눌러요' },
  attempt: { lang: 'en-US', id: 'att-', idle: '영어로 말하기', on: 'Listening… 다 말하면 눌러요' },
  en: { lang: 'en-US', id: 'en-', idle: '영어로 말하기', on: 'Listening… 다 말하면 눌러요' }
};
function dictButtonHTML(l, field) {
  if (!DICT_OK) return '';
  const F = DICT_FIELDS[field];
  const on = dict.lineId === l.id && dict.field === field;
  return `<button class="btn small mic ${on ? 'on' : ''}" type="button" data-act="dictate" data-dfield="${field}" aria-pressed="${on}">${ICON.mic} ${on ? F.on : F.idle}</button>`;
}

// 발음 들어 보기: 문장 통째로 / 한 단어씩, 빠르기 고르기, 읽는 낱말 표시
function speedChipsHTML() {
  const cur = getSpeed();
  return `<div class="speed" role="group" aria-label="읽는 빠르기">${Object.entries(SPEEDS).map(([k, v]) =>
    `<button type="button" data-act="speed" data-speed="${k}" aria-pressed="${k === cur}">${v.label}</button>`).join('')}</div>`;
}
function listenHTML(l) {
  if (!SPEAK_OK) return '';
  const on = talk.lineId === l.id;
  const btn = (mode, icon, label, onLabel) => (on && talk.mode === mode)
    ? `<button class="btn small listen on" type="button" data-act="speak" data-mode="${mode}" aria-pressed="true">${onLabel}</button>`
    : `<button class="btn small listen" type="button" data-act="speak" data-mode="${mode}">${icon} ${label}</button>`;
  // 한 단어씩: 낱말 버튼 줄을 열어 두고, 누른 낱말만 읽는다(저절로 넘어가지 않음).
  const follow = on
    ? followHTML(l.en).replace('<p class="follow ', '<p data-follow class="follow ').replaceAll('class="fw"', 'class="fw" data-act="sayword"') +
      (talk.mode === 'word' ? '<p class="hint fw-hint">단어를 누르면 그 단어만 들려요</p>' : '')
    : '';
  return `<div class="listen-box">
      <div class="row helpers">
        ${btn('all', ICON.speaker, '발음 들어 보기', '■ 멈추기')}
        ${btn('word', ICON.speaker, '한 단어씩', '■ 단어 닫기')}
        ${speedChipsHTML()}
      </div>
      ${follow}
    </div>`;
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
        ${dictButtonHTML(l, 'ko')}
      </div>
      <textarea id="ko-${l.id}" data-field="ko" rows="2" placeholder="${j === 0 ? '이 사진에서 무엇을 했나요?' : '이어서 하고 싶은 말을 써요'}">${esc(l.ko)}</textarea>
    </div>
    ${AI_ON ? aiBoxHTML(l) : ''}
    <div class="field">
      <div class="lab-row">
        <label class="lab" for="en-${l.id}">${AI_ON ? '영상에 들어갈 영어 문장' : '영어로 써 보기'}</label>
        ${AI_ON ? '' : dictButtonHTML(l, 'en')}
      </div>
      <textarea id="en-${l.id}" data-field="en" rows="2" placeholder="Today I ..." lang="en" autocapitalize="sentences" spellcheck="true">${esc(l.en)}</textarea>
      ${listenHTML(l)}
      ${AI_ON ? '' : '<div class="row helpers"><button class="btn small" type="button" data-act="papago">파파고로 도움 받기</button></div>'}
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
        ${sceneFxHTML(s)}
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
    ? `장면 ${sc.length}개 · 문장 ${lines.length}개 · 목소리 ${voiced}/${lines.length}${project.music ? ' · 배경 음악' : ''} · 예상 길이 ${fmtTime(totalDur(project))}`
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
  stopPreview();
  if (rec.lineId === l.id) {
    const blob = await stopRecordingNow();
    if (!blob || blob.size < 500) { toast('녹음이 너무 짧아요. 다시 해 볼까요?'); rerenderCard(s.id); return; }
    await setAudio(s, l, blob, '내 목소리 녹음');
    return;
  }
  if (rec.lineId) { toast('다른 문장을 녹음하고 있어요. 먼저 녹음을 끝내 주세요.'); return; }
  if (dict.lineId) { toast('말로 쓰기가 끝나면 녹음해 주세요.'); return; }
  stopTalk();
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
function toggleDictation(s, l, field) {
  const F = DICT_FIELDS[field];
  if (!F) return;
  if (dict.lineId === l.id && dict.field === field) { stopDictation(); return; }
  if (rec.lineId) { toast('녹음하는 동안에는 말로 쓰기를 할 수 없어요. 녹음을 먼저 끝내 주세요.'); return; }
  if (dict.lineId) stopDictation();
  stopTalk();
  const base = String(l[field] || '').trim();
  const tidy = field === 'ko' ? tidyKorean : tidyEnglish;
  try {
    dict.handle = startDictation({
      lang: F.lang,
      onText: (text) => {
        const ta = document.getElementById(F.id + l.id);
        if (ta) ta.value = joinText(base, text);
      },
      onError: (code) => toast(dictationMessage(code, F.lang)),
      onEnd: (finalText) => {
        dict.lineId = null; dict.sceneId = null; dict.field = null; dict.handle = null;
        if (finalText) {
          l[field] = joinText(base, tidy(finalText));
          if (field === 'attempt') l.feedback = null;   // 글이 바뀌었으니 예전 확인 결과는 지운다
          s.example = false; save();
        }
        const now = sceneOfLine(l);
        if (now) rerenderCard(now.id);
      }
    });
    dict.lineId = l.id; dict.sceneId = s.id; dict.field = field;
    rerenderCard(s.id);
  } catch (e) {
    dict.lineId = null; dict.field = null; dict.handle = null;
    toast(dictationMessage('unknown'));
  }
}

/* ---------- 발음 듣기와 파파고 ---------- */
function stopTalk() { if (talk.handle) talk.handle.stop(); }
const markWord = (l, i) => document.querySelectorAll(`[data-line="${l.id}"] [data-follow] [data-w]`).forEach(el => el.classList.toggle('now', Number(el.dataset.w) === i));
function closeTalk(l) {
  stopTalk();
  talk.lineId = null; talk.mode = null; talk.handle = null;
  const now = sceneOfLine(l);
  if (now) rerenderCard(now.id);
}
async function listen(s, l, mode) {
  if (talk.lineId === l.id && talk.mode === mode) { mode === 'word' ? closeTalk(l) : stopTalk(); return; }
  if (!l.en.trim()) { toast('먼저 영어 문장을 써 주세요'); return; }
  if (rec.lineId || dict.lineId) { toast('녹음이나 말로 쓰기가 끝나면 들어 봐요'); return; }
  stopTalk();
  talk.lineId = l.id; talk.mode = mode; talk.handle = null;
  rerenderCard(s.id);
  if (mode === 'word') return;   // 낱말 버튼을 누를 때 읽는다
  try {
    const h = await say(l.en, {
      speed: getSpeed(),
      onWord: (i) => markWord(l, i),
      onEnd: () => {
        if (talk.handle !== h && talk.handle) return;   // 새로 시작한 읽기가 있으면 그대로 둔다
        if (talk.mode !== 'all') return;                 // 한 단어씩으로 바뀌었으면 그대로 둔다
        talk.lineId = null; talk.mode = null; talk.handle = null;
        const now = sceneOfLine(l);
        if (now) rerenderCard(now.id);
      }
    });
    if (talk.lineId === l.id && talk.mode === mode) talk.handle = h; else h.stop();
  } catch (e) {
    talk.lineId = null; talk.mode = null; talk.handle = null;
    rerenderCard(s.id);
    toast('이 브라우저에서는 발음 듣기가 안 돼요');
  }
}
// 한 단어씩 줄(또는 문장을 읽는 중의 따라 읽기 줄)에서 누른 낱말 하나만 읽는다.
async function sayWordOf(l, b) {
  if (rec.lineId || dict.lineId) { toast('녹음이나 말로 쓰기가 끝나면 들어 봐요'); return; }
  if (talk.mode === 'all') { stopTalk(); return; }   // 문장을 읽는 중이면 멈추기만
  stopTalk();
  talk.handle = null;
  const i = Number(b.dataset.w);
  markWord(l, i);
  try {
    const h = await speakWord(b.textContent, { speed: getSpeed(), onEnd: () => { if (talk.handle === h) { talk.handle = null; markWord(l, -1); } } });
    if (talk.lineId === l.id && talk.mode === 'word') talk.handle = h; else h.stop();
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

/* ---------- 서버 저장(다른 기기에서 이어서 하기) ---------- */
// project.cloud = { on, rev(서버 판 번호), dirty(서버에 안 올린 고침이 있음), seq, syncedAt, device, serverAt }
const deviceName = () => getDeviceName(TOUCH ? '태블릿' : 'PC');
const cloudOn = (p) => !!(p && p.cloud && p.cloud.on && cloudAvailable());
function ensureCloud(p) {
  if (p && !p.cloud && cloudAvailable()) p.cloud = { on: !p.example, rev: 0, dirty: true, seq: 0, syncedAt: 0 };
}
const hasContent = (p) => p.scenes.length > 0 || (p.title || '').trim() !== '';
const cloud = { state: 'idle', info: null, err: null, timer: null, busy: false, again: false, forceNext: false, pulling: null };

function fmtWhen(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

function renderCloud() {
  const bar = $('#cloudBar');
  if (!AI_ON || !project) { bar.hidden = true; return; }
  bar.hidden = false;
  const st = $('#cloudStatus'), act = $('#cloudActions');
  const avail = cloudAvailable();
  $('#cloudOpen').hidden = !avail;
  let text = '', state = 'idle', buttons = '';
  if (!avail) {
    text = '가족 암호를 넣으면 서버에도 저장돼서 다른 기기에서 이어서 할 수 있어요. (맨 아래 부모님 설정)';
  } else if (cloud.pulling) {
    state = 'saving'; text = `서버에서 불러오는 중이에요… ${Math.round(cloud.pulling * 100)}%`;
  } else if (!project.cloud || !project.cloud.on) {
    text = project.example ? '예시 영상은 이 기기에만 있어요.' : '이 영상은 이 기기에만 저장돼요.';
    if (!project.example) buttons = '<button class="btn small grass" type="button" data-cloud="on">서버에도 저장하기</button>';
  } else if (cloud.state === 'conflict') {
    state = 'conflict';
    const i = cloud.info || {};
    text = `다른 기기(${esc(i.device || '?')})에서 ${fmtWhen(i.updatedAt)}에 고친 내용이 있어요. 어느 쪽을 남길까요?`;
    buttons = '<button class="btn small gold" type="button" data-cloud="take">그 기기 것 불러오기</button><button class="btn small" type="button" data-cloud="force">이 기기 것으로 덮어쓰기</button>';
  } else if (cloud.busy) {
    state = 'saving'; text = '서버에 저장하는 중이에요…';
  } else if (cloud.state === 'error') {
    state = 'error'; text = '서버에 저장하지 못했어요. ' + esc(cloudMessage(cloud.err));
    buttons = '<button class="btn small" type="button" data-cloud="retry">다시 해 보기</button>';
  } else if (project.cloud.dirty && hasContent(project)) {
    state = 'saving'; text = '고친 내용을 곧 서버에 저장해요…';
  } else if (project.cloud.rev > 0) {
    state = 'saved'; text = `서버에 저장됨 · ${fmtWhen(project.cloud.syncedAt)} · 다른 기기에서 이어서 할 수 있어요`;
    buttons = '<button class="btn small" type="button" data-cloud="off">이 기기에만 저장</button>';
  } else {
    text = '사진을 넣으면 서버에도 저장돼요.';
  }
  st.dataset.state = state;
  st.innerHTML = text;
  act.innerHTML = buttons;
}

function cloudMessage(e) {
  if (!e) return '';
  if (e.code === 'network' || e.code === 'offline') return '인터넷을 확인해 주세요.';
  return aiMessage(e);
}

function scheduleSync(delay = 3000) {
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(runSync, delay);
  renderCloud();
}

async function runSync() {
  const p = project;
  clearTimeout(cloud.timer);
  if (erasing) return;
  if (!cloudOn(p)) return renderCloud();
  if (cloud.busy) { cloud.again = true; return; }
  if (cloud.state === 'conflict' && !cloud.forceNext) return renderCloud();
  if (rendering || rec.lineId || cloud.pulling) { scheduleSync(5000); return; }
  if (!p.cloud.dirty || !hasContent(p)) return renderCloud();
  cloud.busy = true; cloud.again = false;
  renderCloud();
  const seq = p.cloud.seq;
  const force = cloud.forceNext;
  try {
    const r = await pushProject(p, deviceName(), { force });
    p.cloud.rev = r.rev; p.cloud.serverAt = r.updatedAt; p.cloud.syncedAt = Date.now(); p.cloud.device = deviceName();
    if (p.cloud.seq === seq) p.cloud.dirty = false;
    cloud.forceNext = false;
    cloud.state = 'saved'; cloud.err = null;
    await store.put(p);
  } catch (e) {
    if (e && e.code === 'conflict') { cloud.state = 'conflict'; cloud.info = (e.data && e.data.server) || null; }
    else { cloud.state = 'error'; cloud.err = e; clearTimeout(cloud.timer); cloud.timer = setTimeout(runSync, 30000); }
  } finally {
    cloud.busy = false;
    if (p === project && (cloud.again || p.cloud.dirty) && cloud.state === 'saved') scheduleSync(1500);
    renderCloud();
  }
}

// 다른 기기에서 더 새로 고쳤는지 확인한다(열 때, 다시 돌아왔을 때).
async function checkRemote(p) {
  if (!cloudOn(p) || cloud.busy || cloud.pulling) return;
  try {
    const h = await headProject(p.id);
    if (p !== project) return;
    if (h.missing) {
      if (p.cloud.rev > 0) { p.cloud.rev = 0; p.cloud.dirty = true; scheduleSync(500); }
      else if (p.cloud.dirty) scheduleSync(500);
      return;
    }
    if (h.rev > p.cloud.rev) {
      if (!p.cloud.dirty) {
        await pullInto(p.id, { quiet: true });
        toast(`다른 기기(${h.device || '?'})에서 고친 내용을 불러왔어요`);
      } else {
        cloud.state = 'conflict'; cloud.info = h; renderCloud();
      }
    } else if (p.cloud.dirty) scheduleSync(500);
  } catch (e) { /* 인터넷이 없으면 나중에 다시 */ }
}

// 서버의 작품을 이 기기로 가져와 연다. 같은 작품이 이 기기에 있으면 바꿔 넣는다.
async function pullInto(id, { keepLocalCopy = false } = {}) {
  if (rendering || rec.lineId) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); return false; }
  stopDictation(); stopTalk();
  cloud.pulling = 0.01; renderCloud();
  try {
    const np = await pullProject(id, (f) => { cloud.pulling = Math.max(0.01, f); renderCloud(); });
    np.scenes.forEach(fixScene);
    const i = projects.findIndex(x => x.id === id);
    if (i >= 0 && keepLocalCopy) {
      // 이 기기에서 고친 것도 버리지 않고 사본으로 남긴다.
      const old = projects[i];
      const copy = { ...old, id: uid(), title: `${old.title || '제목 없는 영상'} (이 기기 사본)`, cloud: undefined, updatedAt: Date.now() - 1 };
      delete copy.cloud;
      projects.push(copy);
      await store.put(copy);
    }
    // 바꿔 넣는 옛 내용은 서버로 다시 올리지 않는다.
    if (i >= 0 && projects[i].cloud) { projects[i].cloud.dirty = false; projects[i].cloud.on = false; }
    if (i >= 0) projects[i] = np; else projects.push(np);
    await store.put(np);
    cloud.state = 'saved'; cloud.info = null; cloud.err = null;
    cloud.pulling = null;
    openProject(np, { skipCheck: true });
    return true;
  } catch (e) {
    cloud.pulling = null;
    toast('서버에서 불러오지 못했어요. ' + cloudMessage(e));
    renderCloud();
    return false;
  }
}

$('#cloudActions').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cloud]');
  if (!b) return;
  const what = b.dataset.cloud;
  if (what === 'on') {
    if (!project.cloud) project.cloud = { on: true, rev: 0, dirty: true, seq: 0, syncedAt: 0 };
    project.cloud.on = true; project.cloud.dirty = true;
    save(); runSync();
  } else if (what === 'off') {
    project.cloud.on = false; store.put(project); renderCloud();
    toast('이제 이 영상은 이 기기에만 저장돼요. 서버에 있던 건 남아 있어요.');
  } else if (what === 'retry') {
    cloud.state = 'idle'; runSync();
  } else if (what === 'take') {
    if (await pullInto(project.id, { keepLocalCopy: true })) toast('그 기기 것을 불러왔어요. 이 기기에서 고친 건 "(이 기기 사본)"으로 남겨 뒀어요.');
  } else if (what === 'force') {
    cloud.forceNext = true; cloud.state = 'idle'; project.cloud.dirty = true; runSync();
  }
});

// 다른 기기 영상 목록
async function renderCloudList() {
  const note = $('#cloudPanelNote'), list = $('#cloudList');
  note.hidden = false; note.textContent = '서버에 있는 영상을 불러오는 중이에요…'; list.innerHTML = '';
  try {
    const items = await listCloud();
    if (!items.length) { note.textContent = '아직 서버에 저장된 영상이 없어요.'; return; }
    note.hidden = true;
    list.innerHTML = items.map(it => {
      const here = projects.some(p => p.id === it.id);
      return `<li class="cloud-item" data-cid="${esc(it.id)}">
        ${it.thumbUrl ? `<img src="${esc(it.thumbUrl)}" alt="">` : '<div class="noimg"></div>'}
        <div><div class="t">${esc(it.title || '제목 없는 영상')}</div>
          <div class="m">장면 ${it.scenes}개 · 마지막으로 고친 곳: ${esc(it.device || '?')}, ${fmtWhen(it.updatedAt)}${it.id === project.id ? ' · 지금 여는 영상' : ''}</div></div>
        <div class="row">
          <button class="btn small grass" type="button" data-cl="open">${here ? '열기' : '불러오기'}</button>
          <span data-cldel><button class="btn small" type="button" data-cl="del">서버에서 지우기</button></span>
        </div>
      </li>`;
    }).join('');
  } catch (e) {
    note.textContent = '목록을 불러오지 못했어요. ' + cloudMessage(e);
  }
}
$('#cloudOpen').addEventListener('click', () => {
  const panel = $('#cloudPanel');
  panel.hidden = !panel.hidden;
  $('#cloudOpen').setAttribute('aria-expanded', String(!panel.hidden));
  $('#cloudOpen').textContent = panel.hidden ? '다른 기기 영상 불러오기' : '목록 닫기';
  if (!panel.hidden) renderCloudList();
});
$('#cloudList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cl]');
  if (!b) return;
  const id = b.closest('[data-cid]').dataset.cid;
  const what = b.dataset.cl;
  if (what === 'open') {
    const local = projects.find(p => p.id === id);
    if (local) { openProject(local); }
    else if (await pullInto(id)) toast('서버에서 영상을 불러왔어요. 이제 이 기기에서 이어서 하면 돼요.');
    $('#cloudPanel').hidden = true; $('#cloudOpen').textContent = '다른 기기 영상 불러오기'; $('#cloudOpen').setAttribute('aria-expanded', 'false');
  } else if (what === 'del') {
    b.parentElement.innerHTML = '<button class="btn small red" type="button" data-cl="del-yes">서버에서 지울까요?</button> <button class="btn small" type="button" data-cl="del-no">아니요</button>';
  } else if (what === 'del-no') {
    b.parentElement.innerHTML = '<button class="btn small" type="button" data-cl="del">서버에서 지우기</button>';
  } else if (what === 'del-yes') {
    try {
      await deleteCloud(id);
      const local = projects.find(p => p.id === id);
      if (local && local.cloud) { local.cloud.on = false; local.cloud.rev = 0; await store.put(local); }
      toast('서버에서 지웠어요. 이 기기에 있는 건 그대로 있어요.');
      renderCloud(); renderCloudList();
    } catch (err) { toast('지우지 못했어요. ' + cloudMessage(err)); }
  }
});

/* ---------- 부모님 설정 ---------- */
function initParentPanel() {
  const panel = $('#parent');
  if (!AI_ON) { panel.hidden = true; return; }
  const input = $('#familyCode');
  input.value = getFamilyCode();
  const status = $('#parentStatus');
  const dev = $('#deviceName');
  dev.value = getDeviceName('');
  dev.placeholder = `예: ${TOUCH ? '곰이 태블릿' : '거실 PC'} (안 쓰면 "${TOUCH ? '태블릿' : 'PC'}")`;
  dev.addEventListener('input', () => setDeviceName(dev.value.trim()));
  $('#saveCode').addEventListener('click', async () => {
    setFamilyCode(input.value.trim());
    status.classList.remove('err');
    status.textContent = '확인하는 중이에요…';
    try {
      await coach('ping', {});
      status.textContent = 'AI 도우미와 연결됐어요. 서버 저장도 켜졌어요.';
      ensureCloud(project);
      renderCloud();
      if (cloudOn(project)) { project.cloud.dirty = true; runSync(); }
    } catch (e) {
      status.classList.add('err');
      status.textContent = aiMessage(e);
    }
  });
  initErase();
}

// 모든 기록 지우기: '지우기'라고 써야 버튼이 켜진다.
function initErase() {
  const box = $('#eraseConfirm'), word = $('#eraseWord'), go = $('#eraseGo'), st = $('#eraseStatus');
  $('#eraseOpen').addEventListener('click', () => {
    box.hidden = false; word.value = ''; go.disabled = true; st.textContent = '';
    st.classList.remove('err');
    $('#eraseHint').textContent = cloudAvailable()
      ? '확인하려면 칸에 "지우기"라고 써 주세요. 이 기기와 서버에서 지우고, 다른 기기는 다음에 열 때 지워져요.'
      : '확인하려면 칸에 "지우기"라고 써 주세요. 가족 암호가 없어서 이 기기에서만 지워요.';
    word.focus();
  });
  word.addEventListener('input', () => { go.disabled = word.value.trim() !== '지우기'; });
  $('#eraseCancel').addEventListener('click', () => { box.hidden = true; st.textContent = ''; });
  go.addEventListener('click', async () => {
    go.disabled = true; word.disabled = true;
    erasing = true;
    clearTimeout(saveTimer); saveTimer = null; clearTimeout(cloud.timer);
    st.classList.remove('err');
    try {
      await eraseEverything((msg) => { st.textContent = msg; });
      st.textContent = '모두 지웠어요. 새로 시작해요!';
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      erasing = false;
      st.classList.add('err');
      st.textContent = `다 지우지 못했어요. ${aiMessage(e)} 인터넷을 확인하고 다시 눌러 주세요.`;
      go.disabled = false; word.disabled = false;
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

// '이 장면 효과'를 펼친 채로 두기(toggle은 퍼지지 않아서 잡기 단계에서 듣는다)
scenesEl.addEventListener('toggle', (e) => {
  if (!e.target.matches || !e.target.matches('[data-scenefx]')) return;
  const s = findScene(e.target);
  if (s) { if (e.target.open) fxOpen.add(s.id); else fxOpen.delete(s.id); }
}, true);
scenesEl.addEventListener('change', async (e) => {
  const act = e.target.dataset.act;
  const s = findScene(e.target);
  if (act === 'scene-fx' && s) {
    const fx = { ...(s.fx || {}) };
    if (e.target.value) fx[e.target.dataset.key] = e.target.value; else delete fx[e.target.dataset.key];
    s.fx = Object.keys(fx).length ? fx : undefined;
    if (!s.fx) delete s.fx;
    save(); rerenderCard(s.id);
    return;
  }
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
  } else if (act === 'speak') listen(s, l, b.dataset.mode || 'all');
  else if (act === 'sayword') sayWordOf(l, b);
  else if (act === 'speed') {
    setSpeed(b.dataset.speed);
    document.querySelectorAll('[data-act="speed"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.speed === b.dataset.speed)));
  }
  else if (act === 'papago') openPapago(l.ko);
  else if (act === 'audio-remove') { l.audio = null; l.audioName = ''; l.audioDur = 0; save(); rerenderCard(s.id); }
  else if (act === 'rec') toggleRecord(s, l);
  else if (act === 'dictate') toggleDictation(s, l, b.dataset.dfield || 'ko');
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
$('#musicFile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) setMusic(f);
});
$('#musicVol').addEventListener('input', (e) => {
  if (!project.music) return;
  project.music.vol = Number(e.target.value) / 100;
  $('#musicPlayer').volume = project.music.vol;
  if (preview && preview.h) preview.h.setMusicVol(project.music.vol);   // 미리 보기 중이면 바로 들리게
  save();
});
$('#musicCredit').addEventListener('input', (e) => {
  if (!project.music) return;
  project.music.credit = e.target.value;
  save();
});
$('#musicRemove').addEventListener('click', () => {
  stopPreview();
  $('#musicPlayer').pause();
  project.music = null;
  save(); renderMusic(); renderSummary();
  toast('배경 음악을 뺐어요');
});
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
    const wasCloud = cloudOn(project) && project.cloud.rev > 0;
    await store.remove(project.id);
    projects = projects.filter(p => p.id !== project.id);
    if (!projects.length) { const p = newProject(); projects.push(p); openProject(p); save(true); }
    else openProject([...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
    toast(wasCloud ? '이 기기에서 지웠어요. 서버에 있는 건 "다른 기기 영상 불러오기"에 남아 있어요.' : '지웠어요');
  }
});
function openProject(p, { skipCheck = false } = {}) {
  if (rendering || rec.lineId) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); renderProjectBar(); return; }
  const prev = project;
  if (prev && prev !== p && cloudOn(prev) && prev.cloud.dirty && !cloud.busy) { project = prev; runSync(); }
  clearURLs();
  busy.forEach(x => x.ctl.abort());
  busy.clear(); statusMsg.clear();
  project = p;
  ensureCloud(p);
  if (!cloud.busy) { cloud.state = 'idle'; cloud.info = null; cloud.err = null; cloud.forceNext = false; }
  resetResult();
  renderProjectBar(); renderMeta(); renderScenes(); renderCloud();
  if (!skipCheck) checkRemote(p);
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
  document.querySelectorAll('.audio-drop.drag, .music.drag').forEach(el => el.classList.remove('drag'));
  const z = e.target.closest && (e.target.closest('[data-audiodrop]') || e.target.closest('[data-musicdrop]'));
  if (z) z.classList.add('drag');
});
document.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0; $('#dropOverlay').hidden = true;
  document.querySelectorAll('.audio-drop.drag, .music.drag').forEach(el => el.classList.remove('drag'));
  const files = [...e.dataTransfer.files];
  const mzone = e.target.closest && e.target.closest('[data-musicdrop]');
  if (mzone) {
    const a = files.find(isAudio);
    if (a) setMusic(a); else toast('음악 칸에는 음악 파일만 넣을 수 있어요');
    return;
  }
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
  stopPreview();
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
  const MAC = /Mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '') && !TOUCH;
  if (TOUCH) { $('#howPC').hidden = true; $('#howTab').hidden = false; }
  else if (MAC) { $('#howPC').hidden = true; $('#howMac').hidden = false; }
  initParentPanel();
  store.askPersist();
  await checkReset();     // 다른 기기에서 '모든 기록 지우기'를 했으면 이 기기 것도 지운다
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
  ensureCloud(project);
  renderProjectBar(); renderMeta(); renderScenes(); renderCloud();
  checkRemote(project);
}
init();

// 창을 닫거나 다른 앱으로 넘어갈 때, 모아 두던 저장을 바로 한다.
const flushSave = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(true); } };
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flushSave(); if (cloudOn(project) && project.cloud.dirty) runSync(); }
  else if (project) checkRemote(project);
});

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
