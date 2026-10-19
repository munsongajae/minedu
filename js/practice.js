// 문장 연습: 아이가 만든 영어 문장을 복습 상자 단계에 맞춰 연습한다.
//   1번 상자(새 문장·틀린 문장): 듣고 따라 말하기 → 블록 쌓기(낱말 순서)
//   2번 상자: 블록 쌓기
//   3번 상자: 빈칸 채우기
//   4·5번 상자: 한글 보고 말해 보기(정답을 보고 스스로 맞았는지 고르기)
// 자유 연습(언제든): 같은 활동을 섞어서 한다. 복습 날짜는 바꾸지 않고, 에메랄드는 하루 5개까지.
// 발표 테스트(ptest.js): 사진만 보고 문장을 말해 보는 시험. 힌트를 볼수록 별이 줄어든다.
// 말하며 외우기(언제든): 보면서 말하기 → 반쯤 가리고 말하기 → 다 가리고 한글만 보고 말하기 → 정답 보고 스스로 확인
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  grade, todayQueue, mastered, markToday, streak, tokens, wordKey, blobURL,
  FREE_GEMS, freeGemsLeft, takeFreeGem, nextDueDays } from './learn.js';
import { checkReset } from './reset.js';
import { openTest } from './ptest.js';
import { openPrint } from './print.js';
import { canSpeak, speak, speakWord, getSpeed, wordsOf, followHTML as followLine } from './speech.js';

const SPEAK_OK = canSpeak();
const STEP_NAMES = { listen: '듣고 따라 말하기', build: '블록 쌓기 — 낱말 순서를 맞춰요', cloze: '빈칸 채우기', recall: '한글 보고 영어로 말해 보기' };

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let pool = [];          // 지금 고른 영상의 문장
let queue = [], idx = 0, retried = new Set();
// '앞 단계로'를 눌러 문장을 다시 본 카드: 맞혀도 복습 상자를 올리지 않고 에메랄드도 없다(듣기부터 시작한 카드는 괜찮음).
let peeked = false, cardMode = '';
let session = { right: 0, wrong: 0, gems: 0, kind: 'review' };
let talk = null, voice = null;
let singleSentence = null;
let hideKo = false;
let autoPlaying = false, autoPlayToken = 0;

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
  if (!$('#allView').hidden) renderAllSentences();
  try {
    await syncProgress(progress);
    renderHome();
    if (!$('#allView').hidden) renderAllSentences();
  } catch (e) { /* 인터넷이 없으면 이 기기 기록만 */ }
}

function filtered() {
  const pid = $('#proj').value;
  return pid ? all.sentences.filter(s => s.projectId === pid) : all.sentences;
}

function renderHome() {
  pool = filtered();
  const who = $('#who');
  const start = $('#start');
  const viewAll = $('#viewAll');
  if (!all.sentences.length) {
    who.textContent = '아직 연습할 문장이 없어요. 만들기에서 영어 문장을 먼저 써 주세요.';
    start.disabled = true; $('#memorize').disabled = true; $('#free').disabled = true; $('#ptOpen').disabled = true; if (viewAll) viewAll.disabled = true; $('#stats').innerHTML = ''; return;
  }
  if (!child || !progress) {
    who.textContent = '누가 연습하나요? 위에서 이름을 눌러 주세요.';
    start.disabled = true; $('#memorize').disabled = true; $('#free').disabled = true; $('#ptOpen').disabled = true; if (viewAll) viewAll.disabled = true; $('#stats').innerHTML = ''; renderList(); return;
  }
  $('#memorize').disabled = !pool.length;
  $('#free').disabled = !pool.length;
  $('#ptOpen').disabled = !pool.length;
  if (viewAll) viewAll.disabled = !pool.length;
  const left = freeGemsLeft(progress);
  $('#freeGems').textContent = left ? `오늘 자유 연습 에메랄드 ${left}개 남았어요.` : '오늘 자유 연습 에메랄드는 다 받았어요. 연습은 계속 할 수 있어요.';
  who.textContent = `${child}의 연습`;
  const q = todayQueue(pool, progress);
  const m = mastered(pool, progress);
  $('#stats').innerHTML = `
    <div class="stat"><b>${q.length}</b><span>오늘 연습할 문장</span></div>
    <div class="stat"><b>${m}<small>/${pool.length}</small></b><span>다 외운 문장</span></div>
    <div class="stat gem"><b>${progress.emeralds}</b><span>에메랄드</span></div>
    <div class="stat"><b>${streak(progress)}<small>일</small></b><span>연속 연습</span></div>`;
  start.disabled = !q.length;
  $('#homeNote').textContent = q.length ? '' : doneNote();
  if (all.usingExample) $('#homeNote').textContent = '지금은 예시 영상 문장으로 연습해요. 영상을 만들면 내 문장이 나와요.';
  renderList();
}

function doneNote() {
  const d = nextDueDays(pool, progress);
  const when = d === null ? '' : d === 1 ? ' 다음 문장은 내일 나와요.' : ` 다음 문장은 ${d}일 뒤에 나와요.`;
  return `오늘 연습할 문장을 다 했어요!${when} 더 하고 싶으면 자유 연습이나 말하며 외우기를 해요.`;
}

function renderList() {
  const box = (k) => (progress && progress.sentences[k] ? progress.sentences[k].box : 0);
  const cnt = $('#sentListCount');
  if (cnt) cnt.textContent = pool.length;
  $('#sentList').innerHTML = pool.map(s => {
    const b = box(s.key);
    return `<li><span class="boxes" aria-label="${b ? `${b}번 상자` : '아직 안 함'}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= b ? 'on' : ''}"></i>`).join('')}</span>
      <div class="sent-list-text"><span class="en">${esc(s.en)}</span><span class="ko">${esc(s.ko)}</span></div>
      <div class="sent-list-tools">${SPEAK_OK ? `<button type="button" class="wl-say" data-list-say="${esc(s.en)}" title="발음 듣기" aria-label="발음 듣기"></button>` : ''}</div></li>`;
  }).join('');
}

$('#proj').addEventListener('change', renderHome);
$('#start').addEventListener('click', () => startSession());
$('#memorize').addEventListener('click', () => startMemorize());
$('#free').addEventListener('click', () => startFree());
$('#viewAll').addEventListener('click', () => openAllView());
$('#ptOpen').addEventListener('click', () => {
  stopAudio();
  openTest({
    getProgress: () => progress, sentences: all.sentences, projects: all.projects, defaultPid: $('#proj').value,
    show, onHome: () => { show('home'); renderHome(); }
  });
});
const qoa = $('#quickOpenAll');
if (qoa) qoa.addEventListener('click', () => openAllView());
$('#allBack').addEventListener('click', () => closeAllView());
$('#allBackBottom').addEventListener('click', () => closeAllView());
$('#allProj').addEventListener('change', () => renderAllSentences());
$('#allSearch').addEventListener('input', () => renderAllSentences());
$('#allToggleKo').addEventListener('click', () => toggleHideKo());
$('#allAutoPlay').addEventListener('click', () => toggleAutoPlay());
$('#allPrint').addEventListener('click', () => {
  stopAudio(); stopAutoPlay();
  const { pid, q } = allViewList();
  // 인쇄 화면에서도 영상을 고를 수 있다(검색어는 그대로). 고르면 한꺼번에 보기 칸도 같이 바뀐다.
  const listFor = (id) => {
    $('#allProj').value = id;
    const r = allViewList();
    const proj = all.projects.find(p => p.id === id);
    return { list: r.list, filtered: !!(id || r.q), title: proj ? (proj.title || '제목 없는 영상') : '모든 영상' };
  };
  openPrint({
    child, pid, q, listFor,
    projects: all.projects.map(p => ({ id: p.id, title: p.title || '제목 없는 영상', n: all.sentences.filter(s => s.projectId === p.id).length })).filter(p => p.n),
    total: all.sentences.length,
    show, onBack: () => { show('all'); renderAllSentences(); window.scrollTo(0, 0); }
  });
});

$('#again').addEventListener('click', () => {
  if (session.source === 'all' && singleSentence) {
    if (session.kind === 'memorize') startSingleMemorize(singleSentence);
    else startSinglePractice(singleSentence);
  } else if (session.kind === 'memorize') startMemorize();
  else if (session.kind === 'review' && todayQueue(pool, progress).length) startSession();
  else startFree();
});
$('#home2').addEventListener('click', () => {
  if (session.source === 'all') {
    openAllView();
  } else {
    show('home');
    renderHome();
  }
});
$('#quit').addEventListener('click', () => {
  stopAudio();
  if (session.source === 'all') {
    openAllView();
  } else {
    finish();
  }
});

function show(which) {
  $('#home').hidden = which !== 'home';
  $('#session').hidden = which !== 'session';
  $('#done').hidden = which !== 'done';
  $('#allView').hidden = which !== 'all';
  $('#test').hidden = which !== 'test';
  $('#printView').hidden = which !== 'print';
}

/* ---------- 모든 문장 한꺼번에 보기 ---------- */
function openAllView() {
  stopAudio();
  stopAutoPlay();
  show('all');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  $('#allProj').innerHTML = `<option value="">모든 영상 (${all.sentences.length}문장)</option>` +
    all.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')} (${all.sentences.filter(s => s.projectId === p.id).length}문장)</option>`).join('');
  $('#allProj').value = $('#proj').value || '';

  renderAllSentences();
}

function closeAllView() {
  stopAudio();
  stopAutoPlay();
  show('home');
  renderHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleHideKo() {
  hideKo = !hideKo;
  const btn = $('#allToggleKo');
  btn.setAttribute('aria-pressed', String(hideKo));
  btn.textContent = hideKo ? '한글 뜻 모두 보이기' : '한글 뜻 숨기기';
  renderAllSentences();
}

function highlightCard(key) {
  document.querySelectorAll('.all-card.now-playing').forEach(el => el.classList.remove('now-playing'));
  const card = document.getElementById(`card-${key}`);
  if (card) card.classList.add('now-playing');
}

async function saySentence(text, speed = 'slow', key = null) {
  if (!SPEAK_OK) return;
  stopAudio();
  if (key) highlightCard(key);
  talk = await speak(text, {
    speed,
    onEnd: () => {
      talk = null;
      if (key && !autoPlaying) {
        const card = document.getElementById(`card-${key}`);
        if (card) card.classList.remove('now-playing');
      }
    }
  });
}

function playCardAudio(s) {
  if (!s.audio) return;
  stopAudio();
  stopAutoPlay();
  highlightCard(s.key);
  voice = new Audio(blobURL(s.audio));
  const card = document.getElementById(`card-${s.key}`);
  const clear = () => { voice = null; if (card && !autoPlaying) card.classList.remove('now-playing'); };
  voice.onended = clear;
  voice.onerror = clear;
  voice.play().catch(clear);
}

function stopAutoPlay() {
  if (!autoPlaying) return;
  autoPlaying = false;
  autoPlayToken++;
  stopAudio();
  const btn = $('#allAutoPlay');
  if (btn) {
    btn.textContent = '▶ 차례대로 모두 듣기';
    btn.classList.remove('playing', 'red');
    btn.classList.add('gold');
  }
  document.querySelectorAll('.all-card.now-playing').forEach(el => el.classList.remove('now-playing'));
}

async function startAutoPlay() {
  if (!SPEAK_OK) {
    toast('이 기기에서는 음성 읽기를 지원하지 않아요.');
    return;
  }
  const cards = [...document.querySelectorAll('#allGrid .all-card')];
  if (!cards.length) {
    toast('들을 문장이 없어요.');
    return;
  }
  autoPlaying = true;
  const currentToken = ++autoPlayToken;
  const btn = $('#allAutoPlay');
  btn.textContent = '⏹ 듣기 멈추기';
  btn.classList.remove('gold');
  btn.classList.add('playing', 'red');

  for (let i = 0; i < cards.length; i++) {
    if (!autoPlaying || autoPlayToken !== currentToken) break;
    const card = cards[i];
    const key = card.dataset.key;
    const s = all.sentences.find(item => item.key === key);
    if (!s) continue;

    highlightCard(key);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    await new Promise(resolve => {
      stopAudio();
      speak(s.en, {
        speed: getSpeed(),
        onEnd: () => {
          talk = null;
          resolve();
        }
      }).then(t => {
        talk = t;
      }).catch(() => resolve());
    });

    if (!autoPlaying || autoPlayToken !== currentToken) break;
    await new Promise(resolve => setTimeout(resolve, 900));
  }

  stopAutoPlay();
}

function toggleAutoPlay() {
  if (autoPlaying) stopAutoPlay();
  else startAutoPlay();
}

// 한꺼번에 보기에서 지금 고른 영상·검색에 맞는 문장(인쇄하기도 같은 목록을 쓴다).
function allViewList() {
  const pid = $('#allProj').value;
  const q = ($('#allSearch').value || '').trim().toLowerCase();
  let list = pid ? all.sentences.filter(s => s.projectId === pid) : all.sentences;
  if (q) {
    list = list.filter(s =>
      s.en.toLowerCase().includes(q) ||
      (s.ko && s.ko.toLowerCase().includes(q)) ||
      (s.words && s.words.some(w => (typeof w === 'string' ? w : (w.en + ' ' + (w.ko || ''))).toLowerCase().includes(q)))
    );
  }
  return { list, pid, q };
}

function renderAllSentences() {
  const { list, q } = allViewList();

  const boxOf = (k) => (progress && progress.sentences[k] ? progress.sentences[k].box : 0);
  const mCount = list.filter(s => boxOf(s.key) >= 5).length;
  $('#allCountBadge').textContent = `총 ${list.length}문장 (다 외움 ${mCount}개)`;

  if (!list.length) {
    $('#allGrid').innerHTML = `
      <div class="all-empty">
        <p>조건에 맞는 문장이 없어요.</p>
        ${q ? '<button class="btn small" type="button" id="clearSearch">검색 지우기</button>' : ''}
      </div>`;
    const clr = $('#clearSearch');
    if (clr) clr.addEventListener('click', () => { $('#allSearch').value = ''; renderAllSentences(); });
    return;
  }

  $('#allGrid').innerHTML = list.map((s, idx) => {
    const box = boxOf(s.key);
    const boxLabel = box === 5 ? '⭐ 다 외움' : box > 0 ? `📦 ${box}번 상자` : '🌱 새로움';
    const thumbHTML = s.image
      ? `<div class="all-card-thumb"><img src="${blobURL(s.image)}" alt="${esc(s.en)}" loading="lazy"></div>`
      : `<div class="all-card-thumb no-img" aria-hidden="true"><span>🎬</span></div>`;

    const wordsHTML = (s.words && s.words.length)
      ? `<div class="all-card-words">${s.words.map(w => `<span class="all-word-tag">${typeof w === 'string' ? esc(w) : `${esc(w.en)}${w.ko ? ` <small>(${esc(w.ko)})</small>` : ''}`}</span>`).join('')}</div>`
      : '';

    return `
      <article class="all-card" id="card-${esc(s.key)}" data-key="${esc(s.key)}">
        ${thumbHTML}
        <div class="all-card-main">
        <div class="all-card-top">
          <div class="all-card-tags">
            <span class="all-num">#${idx + 1}</span>
            <span class="all-proj-tag" title="${esc(s.projectTitle)}">${esc(s.projectTitle)}</span>
          </div>
          <div class="all-box-badge ${box === 5 ? 'master' : ''}">
            <span class="all-box-name">${boxLabel}</span>
            <span class="boxes" aria-label="${box ? `${box}번 상자` : '새 문장'}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= box ? 'on' : ''}"></i>`).join('')}</span>
          </div>
        </div>
        <div class="all-card-body">
          <div class="all-card-content">
            <p class="all-card-en" lang="en">${esc(s.en)}</p>
            <p class="all-card-ko ${hideKo ? 'masked-ko' : ''}" data-ko="${esc(s.ko || '')}">
              <span class="ko-text">${esc(s.ko || '(한글 뜻 없음)')}</span>
              ${hideKo ? '<span class="ko-peek-hint">뜻 보기</span>' : ''}
            </p>
            ${wordsHTML}
          </div>
        </div>
        <div class="all-card-footer">
          <div class="all-audio-btns">
            ${SPEAK_OK ? `<button type="button" class="btn small listen" data-act="say" data-key="${esc(s.key)}">🔊 발음</button><button type="button" class="btn small listen" data-act="slow" data-key="${esc(s.key)}">🐢 천천히</button>` : ''}
            ${s.audio ? `<button type="button" class="btn small grass" data-act="mine" data-key="${esc(s.key)}">🎤 내 목소리</button>` : ''}
          </div>
          <div class="all-act-btns">
            <button type="button" class="btn small gold" data-act="memo" data-key="${esc(s.key)}" title="이 문장 말하며 외우기">외우기</button>
            <button type="button" class="btn small grass" data-act="test" data-key="${esc(s.key)}" title="이 문장 블록 쌓기/빈칸 연습">연습</button>
          </div>
        </div>
        </div>
      </article>`;
  }).join('');
}

function startSingleMemorize(s) {
  stopAudio();
  stopAutoPlay();
  singleSentence = s;
  queue = [s];
  idx = 0;
  retried = new Set();
  session = { right: 0, wrong: 0, gems: 0, kind: 'memorize', source: 'all' };
  show('session');
  nextCard();
}

function startSinglePractice(s) {
  stopAudio();
  stopAutoPlay();
  singleSentence = s;
  queue = [s];
  idx = 0;
  retried = new Set();
  session = { right: 0, wrong: 0, gems: 0, kind: 'review', source: 'all' };
  show('session');
  nextCard();
}

$('#sentList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-list-say]');
  if (!b) return;
  stopAudio();
  saySentence(b.dataset.listSay, 'slow');
});

$('#allGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn) {
    const act = btn.dataset.act;
    const key = btn.dataset.key;
    const s = all.sentences.find(item => item.key === key);
    if (!s) return;

    if (act === 'say') {
      saySentence(s.en, 'slow', key);
    } else if (act === 'slow') {
      saySentence(s.en, 'slower', key);
    } else if (act === 'mine') {
      playCardAudio(s);
    } else if (act === 'memo') {
      startSingleMemorize(s);
    } else if (act === 'test') {
      startSinglePractice(s);
    }
    return;
  }

  const koEl = e.target.closest('.masked-ko');
  if (koEl) {
    koEl.classList.toggle('revealed');
  }
});

/* ---------- 연습 진행 ---------- */
function startSession() {
  queue = todayQueue(pool, progress);
  if (!queue.length) { toast('오늘 연습할 문장을 다 했어요!'); show('home'); renderHome(); return; }
  idx = 0; retried = new Set(); session = { right: 0, wrong: 0, gems: 0, kind: 'review' };
  show('session');
  nextCard();
}

// 말하며 외우기: 아직 덜 외운 문장부터 10개까지.
function startMemorize() {
  const boxOf = (s) => (progress.sentences[s.key] ? progress.sentences[s.key].box : 0);
  queue = shuffle(pool).sort((a, b) => boxOf(a) - boxOf(b)).slice(0, 10);
  if (!queue.length) { toast('외울 문장이 없어요.'); return; }
  idx = 0; retried = new Set(); session = { right: 0, wrong: 0, gems: 0, kind: 'memorize' };
  show('session');
  nextCard();
}

// 자유 연습: 덜 외운 문장이 더 자주 나오게 고르되, 매번 조금씩 섞는다. 8개까지.
function startFree() {
  const boxOf = (s) => Math.max(1, progress.sentences[s.key] ? progress.sentences[s.key].box : 1);
  queue = shuffle(pool).map(s => ({ s, w: boxOf(s) + Math.random() * 2.5 })).sort((a, b) => a.w - b.w).map(x => x.s).slice(0, 8);
  if (!queue.length) { toast('연습할 문장이 없어요.'); return; }
  idx = 0; retried = new Set(); session = { right: 0, wrong: 0, gems: 0, kind: 'free' };
  show('session');
  nextCard();
}

// 자유 연습은 상자 단계 안에서 활동을 골고루 섞는다.
function freeModeFor(s) {
  const it = progress.sentences[s.key];
  const box = it ? it.box : 0;
  const can = ['build'];
  if (box === 0) return 'listen';
  if (box >= 2 && tokens(s.en).length >= 3) can.push('cloze');
  if (box >= 3) can.push('recall');
  return can[Math.floor(Math.random() * can.length)];
}

function modeFor(s) {
  if (session.kind === 'free') return freeModeFor(s);
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
  $('#controls').onclick = null;
  if (idx >= queue.length) return finish();
  const s = queue[idx];
  $('#count').textContent = `${idx + 1} / ${queue.length}`;
  $('#progFill').style.width = `${(idx / queue.length) * 100}%`;
  $('#pshot').innerHTML = s.image ? `<img src="${blobURL(s.image)}" alt="">` : '';
  $('#pko').textContent = s.ko || '';
  $('#pfb').textContent = ''; $('#pfb').className = 'pfb';
  peeked = false;
  if (session.kind === 'memorize') return runMemorize(s);
  const mode = modeFor(s);
  cardMode = mode;
  if (mode === 'listen') runListen(s);
  else if (mode === 'build') runBuild(s);
  else if (mode === 'cloze') runCloze(s);
  else runRecall(s);
}

// 결과를 남기고, 받은 에메랄드 수(0 또는 1)를 돌려준다.
// 자유 연습은 복습 날짜를 바꾸지 않고, 에메랄드는 하루 한도 안에서만 준다.
async function record(s, ok) {
  let gem = 0;
  const saw = ok && peeked;
  if (session.kind !== 'free' && !saw) progress.sentences[s.key] = grade(progress.sentences[s.key], ok);
  if (ok) {
    session.right += 1;
    if (saw) { /* 문장을 다시 보고 맞힘: 그대로 둔다 */ }
    else if (session.kind !== 'free') { progress.emeralds += 1; gem = 1; }
    else if (takeFreeGem(progress)) gem = 1;
    session.gems += gem;
  } else {
    session.wrong += 1;
    // 틀린 문장은 이번 연습 끝에 한 번 더 나온다.
    if (!retried.has(s.key)) { retried.add(s.key); queue.push(s); }
  }
  markToday(progress);
  await saveProgress(progress);
  return gem;
}
const gemNote = (gem) => (peeked ? ' 앞 단계에서 문장을 봤으니 다음에 한 번 더 나와요.' : gem ? ' 에메랄드 1개를 얻었어요.' : '');
// 블록 쌓기·빈칸 채우기의 '앞 단계로': 듣고 따라 말하기로 돌아갔다가 같은 활동으로 다시 온다.
const BACK_BTN = '<button class="btn small" type="button" id="back">← 앞 단계로</button>';
function bindBack(s, again) {
  $('#back').addEventListener('click', () => {
    if (cardMode !== 'listen') peeked = true;
    bindActivity(null);
    feedback('');
    runListen(s, again);
  });
}

function controls(html) { $('#controls').innerHTML = html; }
function feedback(text, kind) { const f = $('#pfb'); f.textContent = text; f.className = 'pfb ' + (kind || ''); }

/* ---------- 소리 ---------- */
function stopAudio() {
  if (talk) { talk.stop(); talk = null; }
  if (voice) { voice.pause(); voice = null; }
}
const markWord = (i) => document.querySelectorAll('#activity [data-w]').forEach(el => el.classList.toggle('now', Number(el.dataset.w) === i));
async function sayIt(text) {
  if (!SPEAK_OK) return;
  stopAudio();
  talk = await speak(text, { speed: getSpeed(), onWord: markWord, onEnd: () => { markWord(-1); talk = null; } });
}
// 한 단어씩: 누른 낱말 하나만 읽는다.
async function sayWord(btn) {
  if (!SPEAK_OK) return;
  stopAudio();
  const i = Number(btn.dataset.w);
  markWord(i);
  const h = await speakWord(btn, { speed: getSpeed(), onEnd: () => { if (talk === h) { markWord(-1); talk = null; } } });
  talk = h;
}
function playMine(s) {
  if (!s.audio) return;
  stopAudio();
  voice = new Audio(blobURL(s.audio));
  voice.play().catch(() => {});
}
const listenButtons = (s) => `
  ${SPEAK_OK ? '<button class="btn small listen" type="button" data-say="all">천천히 듣기</button>' : ''}
  ${s.audio ? '<button class="btn small" type="button" data-say="mine">내 목소리 듣기</button>' : ''}
  ${SPEAK_OK ? '<span class="hint fw-hint">단어를 누르면 그 단어만 들려요</span>' : ''}`;
const followHTML = (text) => followLine(text, 'big');
$('#activity').addEventListener('click', (e) => {
  const w = e.target.closest('.follow [data-w]');
  if (w) { sayWord(w); return; }
  const b = e.target.closest('[data-say]');
  if (!b) return;
  const s = queue[idx];
  if (b.dataset.say === 'mine') playMine(s); else sayIt(s.en);
});

/* ---------- 1. 듣고 따라 말하기 ---------- */
function runListen(s, then = runBuild) {
  $('#stepName').textContent = STEP_NAMES.listen;
  $('#activity').innerHTML = `${followHTML(s.en)}<div class="row">${listenButtons(s)}</div>
    <p class="hint">듣고 소리 내어 두세 번 따라 말해 봐요.</p>`;
  controls('<button class="btn big grass" type="button" id="toBuild">따라 말했어요 →</button>');
  $('#toBuild').addEventListener('click', () => then(s));
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
      $('#activity').insertAdjacentHTML('beforeend', followHTML(s.en));
      feedback('맞았어요!' + gemNote(await record(s, true)), 'good');
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
  controls(BACK_BTN);
  bindBack(s, runBuild);
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
  controls(BACK_BTN);
  bindBack(s, runCloze);
  bindActivity(async (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b || b.disabled) return;
    if (wordKey(b.dataset.opt) === wordKey(answer)) {
      b.classList.add('right');
      document.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; });
      $('#activity').querySelector('.cloze').outerHTML = sentenceHTML(true);
      const gem = await record(s, tries === 0);
      feedback(tries ? '맞았어요!' : '한 번에 맞았어요!' + gemNote(gem), 'good');
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
      const gem = await record(s, ok);
      feedback(ok ? '잘했어요!' + gemNote(gem) : session.kind === 'free' ? '괜찮아요. 이번 연습 끝에 한 번 더 나와요.' : '괜찮아요. 다음에 다시 나와요.', ok ? 'good' : 'warn');
      controls('<button class="btn big grass" type="button" id="next">다음 →</button>');
      $('#next').addEventListener('click', () => { idx++; nextCard(); });
    };
    $('#yes').addEventListener('click', () => done(true));
    $('#no').addEventListener('click', () => done(false));
  });
}

/* ---------- 말하며 외우기 ---------- */
const MEMO_STEPS = ['1단계 · 보면서 말하기', '2단계 · 반쯤 가리고 말하기', '3단계 · 한글 뜻만 보고 말하기'];

// 가릴 낱말 고르기: 반쯤 단계는 세 글자 이상인 낱말을 하나 건너 하나(긴 낱말 먼저), 다 가리기는 모두.
function maskSet(raw, level) {
  const letters = raw.map(w => w.replace(/[^A-Za-z']/g, ''));
  if (level === 2) return new Set(raw.map((_, i) => i).filter(i => letters[i]));
  const cand = raw.map((_, i) => i).filter(i => letters[i].length >= 3);
  const pick = cand.filter((_, k) => k % 2 === 0);
  if (!pick.length && raw.length) pick.push(raw.map((_, i) => i).sort((a, b) => letters[b].length - letters[a].length)[0]);
  return new Set(pick);
}
function maskedHTML(text, level, firstLetters) {
  const raw = wordsOf(text);
  const hide = maskSet(raw, level);
  return `<p class="masked" lang="en">${raw.map((w, i) => {
    if (!hide.has(i)) return `<span class="mw">${esc(w)}</span>`;
    const m = /^([^A-Za-z']*)([A-Za-z'’]+)([^A-Za-z']*)$/.exec(w) || ['', '', w, ''];
    const core = m[2];
    const showFirst = level === 1 || firstLetters;
    const shown = showFirst ? core[0] + '_'.repeat(core.length - 1) : '_'.repeat(core.length);
    return `<span class="mw">${esc(m[1])}<button type="button" class="mask" data-peek="${esc(core)}" data-shown="${esc(shown)}" aria-label="가린 낱말, 눌러서 엿보기">${esc(shown)}</button>${esc(m[3])}</span>`;
  }).join(' ')}</p>`;
}

function runMemorize(s) {
  stopAudio();
  let stage = 0, hints = false;
  const draw = () => {
    $('#stepName').textContent = MEMO_STEPS[stage];
    feedback('');
    if (stage === 0) {
      $('#activity').innerHTML = followHTML(s.en) + `<div class="row">${listenButtons(s)}</div>
        <p class="hint">듣고 영어 문장을 소리 내어 두세 번 말해 봐요.</p>`;
      controls('<button class="btn big grass" type="button" data-memo="next">말해 봤어요 →</button>');
      sayIt(s.en);
    } else if (stage === 1) {
      $('#activity').innerHTML = maskedHTML(s.en, 1) + `<div class="row">${listenButtons(s)}</div>
        <p class="hint">가린 낱말을 떠올리며 문장 전체를 말해 봐요. 가린 낱말을 누르면 잠깐 보여요.</p>`;
      controls('<button class="btn big grass" type="button" data-memo="next">말해 봤어요 →</button><button class="btn small" type="button" data-memo="back">앞 단계로</button>');
    } else {
      $('#activity').innerHTML = maskedHTML(s.en, 2, hints) +
        `<p class="hint big-hint">사진과 한글 뜻만 보고 영어로 말해 봐요.</p>`;
      controls(`<button class="btn big gold" type="button" data-memo="reveal">정답 보기</button>
        ${hints ? '' : '<button class="btn small" type="button" data-memo="hint">첫 글자 힌트</button>'}
        <button class="btn small" type="button" data-memo="back">앞 단계로</button>`);
    }
  };
  const reveal = () => {
    $('#activity').innerHTML = followHTML(s.en) + `<div class="row">${listenButtons(s)}</div><p class="hint">내가 말한 것과 같았나요?</p>`;
    sayIt(s.en);
    controls('<button class="btn big grass" type="button" data-memo="yes">외웠어요</button><button class="btn big" type="button" data-memo="no">더 연습할래요</button>');
  };
  const doneCard = async (ok) => {
    const gem = await record(s, ok);
    feedback(ok ? '외웠어요!' + gemNote(gem) : '괜찮아요. 이번 연습 끝에 한 번 더 나와요.', ok ? 'good' : 'warn');
    controls('<button class="btn big grass" type="button" data-memo="go">다음 →</button>');
  };
  // 가린 낱말 엿보기
  bindActivity((e) => {
    const m = e.target.closest('[data-peek]');
    if (!m) return;
    m.textContent = m.dataset.peek; m.classList.add('peek');
    setTimeout(() => { m.textContent = m.dataset.shown; m.classList.remove('peek'); }, 1500);
  });
  $('#controls').onclick = async (e) => {
    const b = e.target.closest('[data-memo]');
    if (!b) return;
    const what = b.dataset.memo;
    if (what === 'next') { stage = Math.min(2, stage + 1); stopAudio(); draw(); }
    else if (what === 'back') { stage = Math.max(0, stage - 1); draw(); }
    else if (what === 'hint') { hints = true; draw(); }
    else if (what === 'reveal') reveal();
    else if (what === 'yes') doneCard(true);
    else if (what === 'no') doneCard(false);
    else if (what === 'go') { $('#controls').onclick = null; idx++; nextCard(); }
  };
  draw();
}

/* ---------- 끝 ---------- */
function finish() {
  stopAudio();
  bindActivity(null);
  show('done');
  const n = session.right + session.wrong;
  const free = session.kind === 'free';
  $('#doneTitle').textContent = !n ? '다음에 또 해요!' : free ? '자유 연습 끝!' : session.kind === 'memorize' ? '외우기 끝!' : '오늘 연습 끝!';
  const capNote = free && !freeGemsLeft(progress) ? '<br>오늘 자유 연습 에메랄드는 다 받았어요. 연습은 더 해도 좋아요!' : '';
  $('#doneText').innerHTML = n
    ? `맞힌 문장 <b>${session.right}</b>개 · 에메랄드 <b>+${session.gems}</b> (모두 ${progress.emeralds}개) · <b>${streak(progress)}</b>일째 연습${capNote}`
    : '';
  $('#again').hidden = false;
  if (session.source === 'all') {
    $('#home2').textContent = '한꺼번에 보기로';
    $('#again').textContent = '이 문장 다시 하기';
  } else {
    $('#home2').textContent = '처음으로';
    if (session.kind === 'memorize') $('#again').textContent = '다시 외우기';
    else if (session.kind === 'review' && todayQueue(pool, progress).length) $('#again').textContent = '더 연습하기';
    else $('#again').textContent = free ? '자유 연습 한 번 더' : '자유 연습 하기';
  }
}

/* ---------- 시작 ---------- */
async function init() {
  renderKid();
  await checkReset();     // 다른 기기에서 '모든 기록 지우기'를 했으면 이 기기 것도 지운다
  all = await loadSentences();
  $('#proj').innerHTML = `<option value="">모든 영상 (${all.sentences.length}문장)</option>` +
    all.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')} (${all.sentences.filter(s => s.projectId === p.id).length}문장)</option>`).join('');
  await loadKid();
}
init();
