// 문장 연습: 아이가 만든 영어 문장을 복습 상자 단계에 맞춰 연습한다.
//   1번 상자(새 문장·틀린 문장): 듣고 따라 말하기 → 블록 쌓기(낱말 순서)
//   2번 상자: 블록 쌓기
//   3번 상자: 빈칸 채우기
//   4·5번 상자: 한글 보고 말해 보기(정답을 보고 스스로 맞았는지 고르기)
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  grade, todayQueue, mastered, markToday, streak, tokens, wordKey, blobURL } from './learn.js';
import { canSpeak, speak, getSpeed, wordsOf } from './speech.js';

const SPEAK_OK = canSpeak();
const STEP_NAMES = { listen: '듣고 따라 말하기', build: '블록 쌓기 — 낱말 순서를 맞춰요', cloze: '빈칸 채우기', recall: '한글 보고 영어로 말해 보기' };

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let pool = [];          // 지금 고른 영상의 문장
let queue = [], idx = 0, retried = new Set();
let session = { right: 0, wrong: 0, gems: 0 };
let talk = null, voice = null;

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000); }

/* ---------- 처음 화면 ---------- */
function renderKid() {
  $('#kidPick').innerHTML = childPickerHTML(child);
}
$('#kidPick').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kid]');
  if (!b) return;
  child = b.dataset.kid; setChild(child);
  renderKid();
  await loadKid();
});

async function loadKid() {
  if (!child) { renderHome(); return; }
  progress = await loadProgress(child);
  renderHome();
  try { await syncProgress(progress); renderHome(); } catch (e) { /* 인터넷이 없으면 이 기기 기록만 */ }
}

function filtered() {
  const pid = $('#proj').value;
  return pid ? all.sentences.filter(s => s.projectId === pid) : all.sentences;
}

function renderHome() {
  pool = filtered();
  const who = $('#who');
  const start = $('#start');
  if (!all.sentences.length) {
    who.textContent = '아직 연습할 문장이 없어요. 만들기에서 영어 문장을 먼저 써 주세요.';
    start.disabled = true; $('#stats').innerHTML = ''; return;
  }
  if (!child || !progress) {
    who.textContent = '누가 연습하나요? 위에서 이름을 눌러 주세요.';
    start.disabled = true; $('#stats').innerHTML = ''; renderList(); return;
  }
  who.textContent = `${child}의 연습`;
  const q = todayQueue(pool, progress);
  const m = mastered(pool, progress);
  $('#stats').innerHTML = `
    <div class="stat"><b>${q.length}</b><span>오늘 연습할 문장</span></div>
    <div class="stat"><b>${m}<small>/${pool.length}</small></b><span>다 외운 문장</span></div>
    <div class="stat gem"><b>${progress.emeralds}</b><span>에메랄드</span></div>
    <div class="stat"><b>${streak(progress)}<small>일</small></b><span>연속 연습</span></div>`;
  start.disabled = !q.length;
  $('#homeNote').textContent = q.length ? '' : '오늘 연습할 문장을 다 했어요! 내일 다시 와요. 새 문장을 만들면 바로 연습할 수 있어요.';
  if (all.usingExample) $('#homeNote').textContent = '지금은 예시 영상 문장으로 연습해요. 영상을 만들면 내 문장이 나와요.';
  renderList();
}

function renderList() {
  const box = (k) => (progress && progress.sentences[k] ? progress.sentences[k].box : 0);
  $('#sentList').innerHTML = pool.map(s => {
    const b = box(s.key);
    return `<li><span class="boxes" aria-label="${b ? `${b}번 상자` : '아직 안 함'}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= b ? 'on' : ''}"></i>`).join('')}</span>
      <span class="en">${esc(s.en)}</span><span class="ko">${esc(s.ko)}</span></li>`;
  }).join('');
}

$('#proj').addEventListener('change', renderHome);
$('#start').addEventListener('click', () => startSession());
$('#again').addEventListener('click', () => startSession());
$('#home2').addEventListener('click', () => { show('home'); renderHome(); });
$('#quit').addEventListener('click', () => { stopAudio(); finish(); });

function show(which) {
  $('#home').hidden = which !== 'home';
  $('#session').hidden = which !== 'session';
  $('#done').hidden = which !== 'done';
}

/* ---------- 연습 진행 ---------- */
function startSession() {
  queue = todayQueue(pool, progress);
  if (!queue.length) { toast('오늘 연습할 문장을 다 했어요!'); show('home'); renderHome(); return; }
  idx = 0; retried = new Set(); session = { right: 0, wrong: 0, gems: 0 };
  show('session');
  nextCard();
}

function modeFor(s) {
  const it = progress.sentences[s.key];
  const box = it ? it.box : 0;
  if (box <= 1) return 'listen';
  if (box === 2) return 'build';
  if (box === 3) return tokens(s.en).length >= 3 ? 'cloze' : 'build';
  return 'recall';
}

function nextCard() {
  stopAudio();
  bindActivity(null);
  if (idx >= queue.length) return finish();
  const s = queue[idx];
  $('#count').textContent = `${idx + 1} / ${queue.length}`;
  $('#progFill').style.width = `${(idx / queue.length) * 100}%`;
  $('#pshot').innerHTML = s.image ? `<img src="${blobURL(s.image)}" alt="">` : '';
  $('#pko').textContent = s.ko || '';
  $('#pfb').textContent = ''; $('#pfb').className = 'pfb';
  const mode = modeFor(s);
  if (mode === 'listen') runListen(s);
  else if (mode === 'build') runBuild(s);
  else if (mode === 'cloze') runCloze(s);
  else runRecall(s);
}

async function record(s, ok) {
  progress.sentences[s.key] = grade(progress.sentences[s.key], ok);
  if (ok) { progress.emeralds += 1; session.gems += 1; session.right += 1; }
  else {
    session.wrong += 1;
    // 틀린 문장은 이번 연습 끝에 한 번 더 나온다.
    if (!retried.has(s.key)) { retried.add(s.key); queue.push(s); }
  }
  markToday(progress);
  await saveProgress(progress);
}

function controls(html) { $('#controls').innerHTML = html; }
function feedback(text, kind) { const f = $('#pfb'); f.textContent = text; f.className = 'pfb ' + (kind || ''); }

/* ---------- 소리 ---------- */
function stopAudio() {
  if (talk) { talk.stop(); talk = null; }
  if (voice) { voice.pause(); voice = null; }
}
async function sayIt(text, wordByWord = false) {
  if (!SPEAK_OK) return;
  stopAudio();
  const mark = (i) => document.querySelectorAll('#activity [data-w]').forEach(el => el.classList.toggle('now', Number(el.dataset.w) === i));
  talk = await speak(text, { speed: getSpeed(), wordByWord, onWord: mark, onEnd: () => { mark(-1); talk = null; } });
}
function playMine(s) {
  if (!s.audio) return;
  stopAudio();
  voice = new Audio(blobURL(s.audio));
  voice.play().catch(() => {});
}
const listenButtons = (s) => `
  ${SPEAK_OK ? '<button class="btn small listen" type="button" data-say="all">천천히 듣기</button><button class="btn small listen" type="button" data-say="word">한 단어씩</button>' : ''}
  ${s.audio ? '<button class="btn small" type="button" data-say="mine">내 목소리 듣기</button>' : ''}`;
function followHTML(text) {
  return `<p class="follow big" lang="en">${wordsOf(text).map((w, i) => `<span data-w="${i}">${esc(w)}</span>`).join(' ')}</p>`;
}
$('#activity').addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (!b) return;
  const s = queue[idx];
  if (b.dataset.say === 'mine') playMine(s); else sayIt(s.en, b.dataset.say === 'word');
});

/* ---------- 1. 듣고 따라 말하기 ---------- */
function runListen(s) {
  $('#stepName').textContent = STEP_NAMES.listen;
  $('#activity').innerHTML = `${followHTML(s.en)}<div class="row">${listenButtons(s)}</div>
    <p class="hint">듣고 소리 내어 두세 번 따라 말해 봐요.</p>`;
  controls('<button class="btn big grass" type="button" id="toBuild">따라 말했어요 →</button>');
  $('#toBuild').addEventListener('click', () => runBuild(s));
  sayIt(s.en);
}

/* ---------- 2. 블록 쌓기 ---------- */
function runBuild(s) {
  stopAudio();
  $('#stepName').textContent = STEP_NAMES.build;
  feedback('');
  const words = tokens(s.en);
  let order = shuffle(words.map((w, i) => i));
  if (words.length > 1) for (let n = 0; n < 5 && order.every((v, i) => v === i); n++) order = shuffle(order);
  let placed = [];        // 놓은 블록(원래 자리 번호)
  let tries = 0;
  const locked = new Set();
  const draw = () => {
    const left = order.filter(i => !placed.includes(i));
    $('#activity').innerHTML = `
      <div class="answer-row" aria-label="내가 쌓은 문장">${placed.map((i, k) =>
        `<button type="button" class="wblock ${locked.has(k) ? 'locked' : ''}" data-back="${k}" ${locked.has(k) ? 'disabled' : ''}>${esc(words[i])}</button>`).join('')}
        ${placed.length < words.length ? '<span class="slot"></span>' : ''}</div>
      <div class="block-pool" aria-label="낱말 블록">${left.map(i => `<button type="button" class="wblock" data-put="${i}">${esc(words[i])}</button>`).join('')}</div>`;
  };
  const check = async () => {
    const ok = placed.every((i, k) => wordKey(words[i]) === wordKey(words[k]));
    if (ok) {
      bindActivity(null);
      feedback('맞았어요! 에메랄드 1개를 얻었어요.', 'good');
      $('#activity').insertAdjacentHTML('beforeend', followHTML(s.en));
      await record(s, true);
      controls('<button class="btn big grass" type="button" id="next">다음 →</button>');
      $('#next').addEventListener('click', () => { idx++; nextCard(); });
      sayIt(s.en);
      return;
    }
    tries++;
    if (tries < 2) {
      // 맞게 놓은 앞부분은 고정하고, 나머지는 다시 풀어 준다.
      let k = 0;
      while (k < placed.length && wordKey(words[placed[k]]) === wordKey(words[k])) { locked.add(k); k++; }
      placed = placed.slice(0, k);
      feedback(k ? `앞의 ${k}개는 맞았어요. 나머지 순서를 다시 해 볼까요?` : '순서가 조금 달라요. 다시 해 볼까요?', 'warn');
      draw();
      return;
    }
    bindActivity(null);
    feedback('괜찮아요! 정답을 보고 소리 내어 읽어 봐요.', 'warn');
    $('#activity').innerHTML = followHTML(s.en) + `<div class="row">${listenButtons(s)}</div>`;
    await record(s, false);
    controls('<button class="btn big grass" type="button" id="next">다음 →</button>');
    $('#next').addEventListener('click', () => { idx++; nextCard(); });
    sayIt(s.en);
  };
  const onClick = (e) => {
    const put = e.target.closest('[data-put]'), back = e.target.closest('[data-back]');
    if (put) { placed.push(Number(put.dataset.put)); draw(); if (placed.length === words.length) check(); }
    else if (back && !back.disabled) { placed.splice(Number(back.dataset.back), 1); draw(); }
  };
  draw();
  controls('<button class="btn small" type="button" id="hint">처음부터 다시</button>');
  $('#hint').addEventListener('click', () => { placed = placed.filter((_, k) => locked.has(k)); draw(); });
  bindActivity(onClick);
}

// 활동마다 클릭 처리기를 하나만 건다(소리 버튼 처리기는 따로 계속 둔다).
let activityHandler = null;
function bindActivity(fn) {
  const el = $('#activity');
  if (activityHandler) el.removeEventListener('click', activityHandler);
  activityHandler = fn;
  if (fn) el.addEventListener('click', fn);
}

/* ---------- 3. 빈칸 채우기 ---------- */
function runCloze(s) {
  stopAudio();
  $('#stepName').textContent = STEP_NAMES.cloze;
  feedback('');
  const words = tokens(s.en);
  const raw = wordsOf(s.en);
  // 가장 긴 낱말을 빈칸으로(너무 쉬운 낱말은 피한다)
  const cand = words.map((w, i) => ({ w, i })).filter(x => x.w.length >= 3 && !/^(the|and|but|was|are|with|this|that|have|has)$/i.test(x.w));
  const target = (cand.length ? cand : words.map((w, i) => ({ w, i }))).sort((a, b) => b.w.length - a.w.length)[0];
  const answer = target.w;
  const others = [...new Set(all.sentences.flatMap(x => tokens(x.en)).filter(w => w.length >= 3 && wordKey(w) !== wordKey(answer)))];
  const near = shuffle(others).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length)).slice(0, 8);
  const fallback = ['house', 'block', 'river', 'green', 'happy', 'water', 'stone', 'build'].filter(w => wordKey(w) !== wordKey(answer));
  const opts = shuffle([answer, ...shuffle([...near, ...fallback]).filter((w, i, a) => a.findIndex(x => wordKey(x) === wordKey(w)) === i).slice(0, 3)]);
  let tries = 0;
  const sentenceHTML = (fill) => `<p class="cloze" lang="en">${raw.map((w, i) => i === target.i
    ? `<span class="blank ${fill ? 'filled' : ''}">${fill ? esc(w) : '　　　'}</span>` : esc(w)).join(' ')}</p>`;
  $('#activity').innerHTML = sentenceHTML(false) + `<div class="opts">${opts.map(o => `<button type="button" class="btn opt" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  controls('');
  bindActivity(async (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b || b.disabled) return;
    if (wordKey(b.dataset.opt) === wordKey(answer)) {
      b.classList.add('right');
      document.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; });
      $('#activity').querySelector('.cloze').outerHTML = sentenceHTML(true);
      feedback(tries ? '맞았어요!' : '한 번에 맞았어요! 에메랄드 1개를 얻었어요.', 'good');
      await record(s, tries === 0);
      sayIt(s.en);
    } else {
      b.classList.add('wrong'); b.disabled = true;
      tries++;
      if (tries < 2) { feedback('다시 골라 봐요.', 'warn'); return; }
      document.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; if (wordKey(x.dataset.opt) === wordKey(answer)) x.classList.add('right'); });
      $('#activity').querySelector('.cloze').outerHTML = sentenceHTML(true);
      feedback('정답은 이거예요. 문장을 소리 내어 읽어 봐요.', 'warn');
      await record(s, false);
      sayIt(s.en);
    }
    controls('<button class="btn big grass" type="button" id="next">다음 →</button>');
    $('#next').addEventListener('click', () => { idx++; nextCard(); });
  });
}

/* ---------- 4. 한글 보고 말해 보기 ---------- */
function runRecall(s) {
  stopAudio();
  $('#stepName').textContent = STEP_NAMES.recall;
  feedback('');
  const first = tokens(s.en).map(w => w[0] + '…').join(' ');
  $('#activity').innerHTML = `<p class="hint big-hint">사진과 한글을 보고 영어로 소리 내어 말해 봐요.</p>
    <details class="first-letters"><summary>힌트 보기</summary><p lang="en">${esc(first)}</p></details>`;
  controls('<button class="btn big gold" type="button" id="reveal">정답 보기</button>');
  bindActivity(null);
  $('#reveal').addEventListener('click', () => {
    $('#activity').innerHTML = followHTML(s.en) + `<div class="row">${listenButtons(s)}</div><p class="hint">내가 말한 것과 같았나요?</p>`;
    sayIt(s.en);
    controls('<button class="btn big grass" type="button" id="yes">맞았어요</button><button class="btn big" type="button" id="no">아직 어려워요</button>');
    const done = async (ok) => {
      await record(s, ok);
      feedback(ok ? '잘했어요! 에메랄드 1개를 얻었어요.' : '괜찮아요. 다음에 다시 나와요.', ok ? 'good' : 'warn');
      controls('<button class="btn big grass" type="button" id="next">다음 →</button>');
      $('#next').addEventListener('click', () => { idx++; nextCard(); });
    };
    $('#yes').addEventListener('click', () => done(true));
    $('#no').addEventListener('click', () => done(false));
  });
}

/* ---------- 끝 ---------- */
function finish() {
  stopAudio();
  bindActivity(null);
  show('done');
  const n = session.right + session.wrong;
  $('#doneTitle').textContent = n ? '오늘 연습 끝!' : '다음에 또 해요!';
  $('#doneText').innerHTML = n
    ? `맞힌 문장 <b>${session.right}</b>개 · 에메랄드 <b>+${session.gems}</b> (모두 ${progress.emeralds}개) · <b>${streak(progress)}</b>일째 연습`
    : '';
  $('#again').hidden = !todayQueue(pool, progress).length;
}

/* ---------- 시작 ---------- */
async function init() {
  renderKid();
  all = await loadSentences();
  $('#proj').innerHTML = `<option value="">모든 영상 (${all.sentences.length}문장)</option>` +
    all.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')} (${all.sentences.filter(s => s.projectId === p.id).length}문장)</option>`).join('');
  await loadKid();
}
init();
