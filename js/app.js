// 곰이난이 블록 스튜디오 — 화면과 동작
import * as store from './storage.js';
import { makeExampleImage } from './world.js';
import { renderVideo, totalDur, canMakeVideo } from './video.js';
import { canRecord, startRecording, micErrorMessage } from './recorder.js';
import { aiEnabled, coach, aiMessage, getFamilyCode, setFamilyCode } from './ai.js';

const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

const ICON = {
  speaker: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3v10l-4-3H2zM11 5h1v6h-1zM13 3h1v10h-1z"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 3h2v2h2v2h2v2H9v5H7V9H3V7h2V5h2z"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v5h4v2h-2v2H9v2H7v-2H5V9H3V7h4z"/></svg>',
  spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 1h2v5h5v2H9v5H7V8H2V6h5z"/></svg>'
};
const AI_ON = aiEnabled();

const MIC_OK = canRecord();
const TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* ---------- 상태 ---------- */
let projects = [];
let project = null;
let saveTimer = null;
let rendering = false;
let cancelRequested = false;
let result = null; // { blob, ext, total, url }
const rec = { id: null, handle: null, timer: null };
const busy = new Map();      // 장면 id → { kind: 'translate'|'check', ctl: AbortController }
const statusMsg = new Map(); // 장면 id → { text, err }

function newScene(blob, extra) {
  return Object.assign({
    id: uid(), image: blob, ko: '', en: '',
    mode: 'self', attempt: '', feedback: null, words: [],
    audio: null, audioName: '', audioDur: 0
  }, extra || {});
}
// 예전 버전에서 저장한 장면에 새 칸을 채워 넣는다.
function fixScene(s) {
  if (s.mode !== 'ai' && s.mode !== 'self') s.mode = 'self';
  if (typeof s.attempt !== 'string') s.attempt = '';
  if (!Array.isArray(s.words)) s.words = [];
  if (s.feedback === undefined) s.feedback = null;
  return s;
}
function newProject() {
  return { id: uid(), title: '', makers: project ? project.makers : '', createdAt: Date.now(), updatedAt: Date.now(), opts: { title: true, ko: true, end: true }, scenes: [] };
}
async function makeExampleProject() {
  const img = await makeExampleImage();
  return {
    id: uid(), title: '예시: 강가의 나무집', makers: '곰이 · 난이', createdAt: Date.now(), updatedAt: Date.now(),
    opts: { title: true, ko: true, end: true },
    scenes: [newScene(img, {
      example: true,
      ko: '오늘은 강가에 작은 나무집을 지었어요. 옆에는 나무도 한 그루 심었어요.',
      en: 'Today I built a small wooden house by the river. I also planted a tree next to it.',
      mode: 'ai',
      words: [{ en: 'wooden', ko: '나무로 된' }, { en: 'river', ko: '강' }, { en: 'planted', ko: '심었다' }]
    })]
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
  return c(!!s.image, '사진') + c(s.ko.trim().length > 0, '한글') + c(s.en.trim().length > 0, '영어') + c(!!s.audio, '목소리');
}

function audioHTML(s) {
  const isRec = rec.id === s.id;
  const recBtn = MIC_OK
    ? `<button class="btn red ${isRec ? 'on' : ''}" type="button" data-act="rec"><span class="rec-dot"></span>${isRec ? '녹음 끝내기 <span class="rectime" data-rectime>0:00</span>' : (s.audio ? '다시 녹음' : '녹음 시작')}</button>`
    : '';
  if (s.audio && !isRec) {
    return `<audio controls preload="metadata" src="${blobURL('aud-' + s.id, s.audio)}"></audio>
      <div class="row"><span class="note">${esc(s.audioName || '내 목소리')} · ${fmtTime(s.audioDur)}</span></div>
      <div class="row">${recBtn}
        <label class="btn small" for="af-${s.id}">파일로 바꾸기</label>
        <button class="btn small" type="button" data-act="audio-remove">지우기</button></div>`;
  }
  return `<div class="note">${isRec ? '영어 문장을 또박또박 읽어요. 다 읽으면 <b>녹음 끝내기</b>!' : (MIC_OK ? '녹음 시작을 누르고 영어 문장을 읽어요.' : '녹음 파일을 골라 넣어요.')}</div>
    <div class="row">${recBtn}${isRec ? '' : `<label class="btn small" for="af-${s.id}">녹음 파일 고르기</label>`}</div>`;
}

function aiBoxHTML(s) {
  const b = busy.get(s.id);
  const st = statusMsg.get(s.id);
  const stText = b ? (b.kind === 'translate' ? '영어로 바꾸는 중이에요…' : '선생님이 읽어 보는 중이에요…') : (st ? st.text : '');
  const stopBtn = b ? '<button class="btn small" type="button" data-act="stop-ai">멈추기</button>' : '';
  const tabs = `<div class="tabs" role="group" aria-label="영어 만드는 방법">
      <button type="button" data-act="mode" data-mode="self" aria-pressed="${s.mode === 'self'}">내가 먼저 써 보기</button>
      <button type="button" data-act="mode" data-mode="ai" aria-pressed="${s.mode === 'ai'}">AI가 번역</button>
    </div>`;
  let inner;
  if (s.mode === 'ai') {
    const vocab = s.words && s.words.length
      ? `<div><div class="lab">새로 나온 낱말</div><div class="vocab">${s.words.map(w => `<span><b>${esc(w.en)}</b> · ${esc(w.ko)}</span>`).join('')}</div></div>`
      : '';
    inner = `<div class="row">
        <button class="btn diamond" type="button" data-act="translate" ${b || !s.ko.trim() ? 'disabled' : ''}>${ICON.spark} ${s.en.trim() ? '다시 번역하기' : '영어로 바꾸기'}</button>${stopBtn}
      </div>
      <p class="status ${st && st.err && !b ? 'err' : ''}" data-status>${esc(stText || (s.ko.trim() ? '' : '먼저 한글 설명을 써 주세요.'))}</p>
      ${vocab}`;
  } else {
    const f = s.feedback;
    const fb = f ? `<div class="feedback">
        <div class="praise">${esc(f.praise)}</div>
        ${f.corrected && f.corrected !== s.attempt.trim() ? `<div><div class="lab">이렇게 고치면 더 좋아요</div><div class="fixed">${esc(f.corrected)}</div></div>` : ''}
        ${(f.fixes || []).map(x => `<div class="fix"><div class="ba"><s>${esc(x.before)}</s> → <ins>${esc(x.after)}</ins></div><div class="why">${esc(x.why)}</div></div>`).join('')}
        <div class="row"><button class="btn small grass" type="button" data-act="use-fix">이 문장으로 정하기</button></div>
      </div>` : '';
    inner = `<div class="field">
        <label class="lab" for="att-${s.id}">내가 먼저 영어로 써 보기</label>
        <textarea id="att-${s.id}" data-field="attempt" rows="2" placeholder="Today I ..." lang="en" autocapitalize="sentences">${esc(s.attempt)}</textarea>
      </div>
      <div class="row">
        <button class="btn diamond" type="button" data-act="check" ${b || !s.attempt.trim() ? 'disabled' : ''}>${ICON.spark} 선생님 확인받기</button>${stopBtn}
      </div>
      <p class="status ${st && st.err && !b ? 'err' : ''}" data-status>${esc(stText)}</p>
      ${fb}`;
  }
  return `${tabs}<div class="ai-box">${inner}</div>`;
}

function cardHTML(s, i, n) {
  const img = s.image ? `<img src="${blobURL('img-' + s.id, s.image)}" alt="장면 ${i + 1} 게임 화면">` : '';
  return `<article class="card" data-id="${s.id}">
    <div class="card-head">
      <div class="name">장면 ${i + 1} ${s.example ? '<span class="badge">예시</span>' : ''}</div>
      <div class="chips" data-chips>${chipsHTML(s)}</div>
      <div class="head-tools">
        <button class="btn small" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="앞으로 옮기기">${ICON.up}</button>
        <button class="btn small" type="button" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="뒤로 옮기기">${ICON.down}</button>
        <span data-delwrap><button class="btn small" type="button" data-act="del">장면 지우기</button></span>
      </div>
    </div>
    <div class="card-body">
      <div>
        <div class="shot">${img}</div>
        <div class="shot-tools">
          <label class="btn small" for="if-${s.id}">사진 바꾸기</label>
          <input type="file" id="if-${s.id}" accept="image/*" data-act="img-file" hidden>
        </div>
      </div>
      <div class="col">
        <div class="field">
          <label class="lab" for="ko-${s.id}">한글로 설명하기</label>
          <textarea id="ko-${s.id}" data-field="ko" rows="2" placeholder="이 사진에서 무엇을 했나요?">${esc(s.ko)}</textarea>
        </div>
        ${AI_ON ? aiBoxHTML(s) : ''}
        <div class="field">
          <label class="lab" for="en-${s.id}">${AI_ON ? '영상에 들어갈 영어 문장' : '영어로 써 보기'}</label>
          <textarea id="en-${s.id}" data-field="en" rows="2" placeholder="Today I ..." lang="en" autocapitalize="sentences" spellcheck="true">${esc(s.en)}</textarea>
          <div class="row helpers">
            <button class="btn small" type="button" data-act="speak" ${'speechSynthesis' in window ? '' : 'hidden'}>${ICON.speaker} 발음 들어 보기</button>
            ${AI_ON ? '' : '<button class="btn small" type="button" data-act="papago">파파고로 도움 받기</button>'}
          </div>
          <p class="hint">${AI_ON ? '자막으로 들어가는 문장이에요. 직접 고쳐도 돼요. 발음 듣기는 연습용이에요.' : '먼저 혼자 써 보고, 막히면 파파고에서 한글 설명을 바꿔 봐요. 발음 듣기는 연습용이에요.'}</p>
        </div>
        <div class="field">
          <div class="lab">내 목소리 (영어로 읽기)</div>
          <div class="audio-drop ${s.audio ? 'has' : ''}" data-audiodrop>
            ${audioHTML(s)}
            <input type="file" id="af-${s.id}" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" data-act="audio-file" hidden>
          </div>
        </div>
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
  const voiced = sc.filter(s => s.audio).length;
  $('#summary').textContent = sc.length
    ? `장면 ${sc.length}개 · 목소리 ${voiced}/${sc.length} · 예상 길이 ${fmtTime(totalDur(project))}`
    : '아직 장면이 없어요';
  const todo = [];
  sc.forEach((s, i) => {
    const miss = [];
    if (!s.en.trim()) miss.push('영어 문장');
    if (!s.audio) miss.push('목소리');
    if (miss.length) todo.push(`장면 ${i + 1}: ${miss.join(', ')}이 아직 없어요`);
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

let decodeCtx = null;
async function audioDuration(blob) {
  try {
    decodeCtx = decodeCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } catch (e) { return null; }
}
const isAudio = (f) => f && ((f.type && f.type.startsWith('audio/')) || /\.(m4a|mp3|wav|ogg|webm|aac)$/i.test(f.name || ''));

async function setAudio(s, blob, name) {
  const d = await audioDuration(blob);
  if (!d) { toast('이 녹음 파일은 열 수 없어요. m4a, mp3, wav 파일을 넣어 주세요.'); return false; }
  s.audio = blob; s.audioName = name || '내 목소리'; s.audioDur = d;
  save(); rerenderCard(s.id);
  return true;
}
async function addAudiosInOrder(files) {
  const auds = [...files].filter(isAudio).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true }));
  let k = 0;
  for (const s of project.scenes) {
    if (k >= auds.length) break;
    if (!s.audio) { await setAudio(s, auds[k], auds[k].name); k++; }
  }
  if (auds.length) toast(k ? '녹음 파일을 목소리 칸에 차례대로 넣었어요' : '목소리가 빈 장면이 없어요');
}

/* ---------- 녹음 ---------- */
async function toggleRecord(s) {
  if (rec.id === s.id) {
    const id = rec.id;
    clearInterval(rec.timer);
    const blob = await rec.handle.stop();
    rec.id = null; rec.handle = null;
    keepAwake(false);
    if (blob.size < 500) { toast('녹음이 너무 짧아요. 다시 해 볼까요?'); rerenderCard(id); return; }
    await setAudio(s, blob, '내 목소리 녹음');
    return;
  }
  if (rec.id) { toast('다른 장면에서 녹음 중이에요. 먼저 녹음을 끝내 주세요.'); return; }
  if (!s.en.trim()) toast('영어 문장을 먼저 써 두면 보면서 읽을 수 있어요');
  try {
    rec.handle = await startRecording();
    rec.id = s.id;
    keepAwake(true);
    rerenderCard(s.id);
    rec.timer = setInterval(() => {
      const el = document.querySelector(`.card[data-id="${s.id}"] [data-rectime]`);
      if (el) el.textContent = fmtTime((Date.now() - rec.handle.startedAt) / 1000);
    }, 250);
  } catch (e) {
    toast(micErrorMessage(e));
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
async function runAI(s, kind, work) {
  const ctl = new AbortController();
  busy.set(s.id, { kind, ctl });
  statusMsg.delete(s.id);
  rerenderCard(s.id);
  try {
    await work(ctl.signal);
  } catch (e) {
    const msg = aiMessage(e);
    if (msg) statusMsg.set(s.id, { text: msg, err: true });
  } finally {
    busy.delete(s.id);
    if (project.scenes.includes(s)) rerenderCard(s.id);
  }
}
function aiTranslate(s) {
  if (!s.ko.trim()) return;
  return runAI(s, 'translate', async (signal) => {
    const r = await coach('translate', { ko: s.ko.trim() }, signal);
    s.en = String(r.english || '').trim();
    s.words = Array.isArray(r.words) ? r.words.slice(0, 4) : [];
    statusMsg.set(s.id, { text: '다 됐어요! 아래 영어 문장을 소리 내어 읽어 보세요.', err: false });
    save();
  });
}
function aiCheck(s) {
  if (!s.attempt.trim()) return;
  s.feedback = null;
  return runAI(s, 'check', async (signal) => {
    const r = await coach('check', { ko: s.ko.trim(), attempt: s.attempt.trim() }, signal);
    s.feedback = {
      corrected: String(r.corrected || s.attempt).trim(),
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

scenesEl.addEventListener('input', (e) => {
  const f = e.target.dataset.field;
  if (!f) return;
  const s = findScene(e.target);
  if (!s) return;
  s[f] = e.target.value;
  if (s.example) s.example = false;
  save(); updateChips(s);
  // 글을 쓰면 AI 버튼을 켜거나 끈다(카드를 다시 그리지 않아 글쓰기가 끊기지 않게).
  if (AI_ON && (f === 'ko' || f === 'attempt') && !busy.get(s.id)) {
    const card = e.target.closest('.card');
    const btn = card.querySelector(f === 'ko' ? '[data-act="translate"]' : '[data-act="check"]');
    if (btn) btn.disabled = !e.target.value.trim();
    if (f === 'ko' && s.mode === 'ai' && !statusMsg.get(s.id)) {
      const st = card.querySelector('[data-status]');
      if (st) st.textContent = e.target.value.trim() ? '' : '먼저 한글 설명을 써 주세요.';
    }
  }
});

scenesEl.addEventListener('change', async (e) => {
  const act = e.target.dataset.act;
  const s = findScene(e.target);
  const file = e.target.files && e.target.files[0];
  if (!s || !file) return;
  if (act === 'img-file' && file.type.startsWith('image/')) { s.image = file; save(); rerenderCard(s.id); }
  if (act === 'audio-file') await setAudio(s, file, file.name);
  e.target.value = '';
});

scenesEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const s = findScene(b);
  if (!s) return;
  const i = project.scenes.indexOf(s);
  const act = b.dataset.act;
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
    if (rec.id === s.id) { clearInterval(rec.timer); await rec.handle.stop(); rec.id = null; rec.handle = null; keepAwake(false); }
    const job = busy.get(s.id); if (job) job.ctl.abort();
    project.scenes.splice(i, 1);
    save(); renderScenes(); renderProjectBar();
  } else if (act === 'mode') { s.mode = b.dataset.mode; statusMsg.delete(s.id); save(); rerenderCard(s.id); }
  else if (act === 'translate') aiTranslate(s);
  else if (act === 'check') aiCheck(s);
  else if (act === 'stop-ai') { const x = busy.get(s.id); if (x) x.ctl.abort(); }
  else if (act === 'use-fix') {
    if (s.feedback) { s.en = s.feedback.corrected || s.attempt; save(); rerenderCard(s.id); toast('영상에 들어갈 문장으로 정했어요'); }
  } else if (act === 'speak') speak(s.en);
  else if (act === 'papago') openPapago(s.ko);
  else if (act === 'audio-remove') { s.audio = null; s.audioName = ''; s.audioDur = 0; save(); rerenderCard(s.id); }
  else if (act === 'rec') toggleRecord(s);
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
$('#pickImages').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
$('#projSelect').addEventListener('change', (e) => {
  const p = projects.find(p => p.id === e.target.value);
  if (p) openProject(p);
});
$('#newProj').addEventListener('click', () => {
  if (rendering || rec.id) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); return; }
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
    if (rendering || rec.id) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); renderProjectBar(); return; }
    await store.remove(project.id);
    projects = projects.filter(p => p.id !== project.id);
    if (!projects.length) { const p = newProject(); projects.push(p); openProject(p); save(true); }
    else openProject([...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
    toast('지웠어요');
  }
});
function openProject(p) {
  if (rendering || rec.id) { toast('녹음이나 영상 만들기를 먼저 끝내 주세요'); renderProjectBar(); return; }
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
  if (zone && auds.length) { const s = findScene(zone); if (s) await setAudio(s, auds[0], auds[0].name); }
  else if (auds.length) await addAudiosInOrder(auds);
  const n = addImages(files);
  if (!n && !auds.length) toast('사진이나 녹음 파일만 넣을 수 있어요');
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
  if (rendering || !project.scenes.some(s => s.image)) return;
  if (rec.id) { toast('녹음을 먼저 끝내 주세요'); return; }
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
  if (rendering || rec.id) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 기능 없이 계속 */ });
}
