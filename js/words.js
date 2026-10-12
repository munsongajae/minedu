// 단어 게임: 아이가 만든 문장에서 나온 단어로 한다. 기록은 아이별로 따로.
//   짝 맞추기: 영어 카드와 한글 카드의 짝을 찾는다.
//   보고 고르기: 한글 뜻을 보고 영어 단어를, 또는 영어 단어를 보고 한글 뜻을 4개 중에서 고른다(10문제).
// 아직 잘 모르는 단어(처음 보거나 자주 틀린 단어)가 먼저 나온다.
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  markToday, streak, collectWords, loadGlossary, fillGlossary, wordKey } from './learn.js';
import { aiEnabled, aiMessage } from './ai.js';
import { canSpeak, speak } from './speech.js';

const SPEAK_OK = canSpeak();
const PAIRS_KEY = 'block-studio-pairs';
const KIND_KEY = 'block-studio-wordgame';
const DIR_KEY = 'block-studio-quizdir';
const QUIZ_LEN = 10;
const load = (k, ok, d) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : d; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 이번만 */ } };
let kind = load(KIND_KEY, ['match', 'quiz'], 'match');
let dir = load(DIR_KEY, ['ko2en', 'en2ko', 'mix'], 'ko2en');

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let words = [];          // 뜻이 있는 단어
let pairs = 6;
try { pairs = Number(localStorage.getItem(PAIRS_KEY)) || 6; } catch (e) { /* 기본 */ }

let game = null;         // { cards, open: [], found, moves, start, timer, miss: {}, lock }

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000); }
function show(which) { ['home', 'game', 'quiz', 'done'].forEach(k => { $('#' + k).hidden = k !== which; }); }

/* ---------- 처음 화면 ---------- */
$('#kidPick').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kid]');
  if (!b) return;
  child = b.dataset.kid; setChild(child);
  $('#kidPick').innerHTML = childPickerHTML(child);
  await loadKid();
});
async function loadKid() {
  if (!child) { renderHome(); return; }
  progress = await loadProgress(child);
  renderHome();
  try { await syncProgress(progress); renderHome(); } catch (e) { /* 이 기기 기록만 */ }
}

const known = (w) => { const r = progress && progress.words[w.key]; return r && (r.right || 0) >= 2 && (r.right || 0) > (r.wrong || 0); };

function renderHome() {
  document.querySelectorAll('[data-pairs]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.pairs) === pairs)));
  document.querySelectorAll('[data-dir]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dir === dir)));
  document.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  $('#matchOpts').hidden = kind !== 'match';
  $('#quizOpts').hidden = kind !== 'quiz';
  const need = kind === 'quiz' ? 4 : 2;
  const pid = $('#proj').value;
  const sents = pid ? all.sentences.filter(s => s.projectId === pid) : all.sentences;
  words = collectWords(sents, glossary).filter(w => w.ko);
  const missing = collectWords(sents, glossary).filter(w => !w.ko).length;
  const start = $('#start');
  if (!all.sentences.length) {
    $('#who').textContent = '아직 단어가 없어요. 만들기에서 영어 문장을 먼저 써 주세요.';
    start.disabled = true; $('#stats').innerHTML = ''; return;
  }
  $('#who').textContent = child ? `${child}의 단어 게임` : '누가 하나요? 위에서 이름을 눌러 주세요.';
  if (child && progress) {
    $('#stats').innerHTML = `
      <div class="stat"><b>${words.length}</b><span>뜻을 아는 단어</span></div>
      <div class="stat"><b>${words.filter(known).length}</b><span>잘 아는 단어</span></div>
      <div class="stat gem"><b>${progress.emeralds}</b><span>에메랄드</span></div>
      <div class="stat"><b>${streak(progress)}<small>일</small></b><span>연속 연습</span></div>`;
  } else $('#stats').innerHTML = '';
  start.disabled = !child || words.length < need;
  const note = $('#homeNote');
  if (words.length < need) note.textContent = missing ? '단어 뜻을 채우는 중이에요…' : `단어가 ${need}개 이상 있어야 이 게임을 할 수 있어요.`;
  else if (kind === 'match' && words.length < pairs) note.textContent = `단어가 ${words.length}개라서 ${words.length}쌍으로 할게요.`;
  else if (kind === 'quiz' && words.length < QUIZ_LEN) note.textContent = `단어가 ${words.length}개라서 ${words.length}문제로 할게요.`;
  else note.textContent = '';
  $('#wordList').innerHTML = words.map(w => `<li><button type="button" class="btn tiny-say" data-say="${esc(w.en)}" aria-label="${esc(w.en)} 듣기">▶</button>
    <b lang="en">${esc(w.en)}</b><span>${esc(w.ko)}</span>${known(w) ? '<i class="ok">잘 알아요</i>' : ''}</li>`).join('');
}

$('#proj').addEventListener('change', renderHome);
$('#matchOpts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pairs]');
  if (!b) return;
  pairs = Number(b.dataset.pairs);
  keep(PAIRS_KEY, String(pairs));
  renderHome();
});
$('#quizOpts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dir]');
  if (!b) return;
  dir = b.dataset.dir; keep(DIR_KEY, dir);
  renderHome();
});
document.querySelector('.game-pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  kind = b.dataset.kind; keep(KIND_KEY, kind);
  renderHome();
});
$('#wordList').addEventListener('click', (e) => { const b = e.target.closest('[data-say]'); if (b) say(b.dataset.say); });
const startKind = () => (kind === 'quiz' ? startQuiz() : startGame());
$('#start').addEventListener('click', startKind);
$('#again').addEventListener('click', startKind);
$('#qQuit').addEventListener('click', () => { quiz = null; show('home'); renderHome(); });
$('#home2').addEventListener('click', () => { show('home'); renderHome(); });
$('#quit').addEventListener('click', () => { endTimer(); show('home'); renderHome(); });

function say(text) { if (SPEAK_OK) speak(text, { speed: 'slow' }).catch(() => {}); }

/* ---------- 게임 ---------- */
// 잘 모르는 단어를 먼저: 처음 보는 단어, 틀린 적 많은 단어, 오래전에 본 단어 순.
function pickWords(n) {
  const score = (w) => {
    const r = progress.words[w.key];
    if (!r) return 100 + Math.random() * 10;
    return (r.wrong || 0) * 10 - (r.right || 0) * 6 + (Date.now() - (r.t || 0)) / 864e5 + Math.random() * 4;
  };
  return [...words].sort((a, b) => score(b) - score(a)).slice(0, n);
}

function startGame() {
  const n = Math.min(pairs, words.length);
  const chosen = pickWords(n);
  const cards = shuffle(chosen.flatMap(w => [{ key: w.key, side: 'en', text: w.en, w }, { key: w.key, side: 'ko', text: w.ko, w }]))
    .map((c, i) => ({ ...c, i, up: false, done: false }));
  endTimer();
  game = { cards, open: [], found: 0, total: n, moves: 0, start: Date.now(), miss: {}, lock: false, timer: null };
  game.timer = setInterval(drawTop, 500);
  show('game');
  drawBoard(); drawTop();
}
function endTimer() { if (game && game.timer) { clearInterval(game.timer); game.timer = null; } }
function drawTop() {
  if (!game) return;
  const sec = Math.floor((Date.now() - game.start) / 1000);
  $('#found').textContent = `찾은 짝 ${game.found} / ${game.total}`;
  $('#moves').textContent = `뒤집기 ${game.moves}번`;
  $('#clock').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function cardHTML(c) {
  const face = c.up || c.done;
  return `<button type="button" class="tile ${c.side} ${face ? 'up' : ''} ${c.done ? 'done' : ''}" data-i="${c.i}"
    aria-label="${face ? esc(c.text) : '뒤집힌 카드'}" ${c.done ? 'disabled' : ''}>
    <span class="tile-back" aria-hidden="true"></span>
    <span class="tile-face" ${c.side === 'en' ? 'lang="en"' : ''}>${face ? esc(c.text) : ''}</span>
  </button>`;
}
function drawBoard() {
  const board = $('#board');
  board.className = `board n${game.cards.length}`;
  board.innerHTML = game.cards.map(cardHTML).join('');
}
function redraw(i) {
  const el = document.querySelector(`.tile[data-i="${i}"]`);
  if (el) el.outerHTML = cardHTML(game.cards[i]);
}

$('#board').addEventListener('click', async (e) => {
  const b = e.target.closest('.tile');
  if (!b || !game || game.lock) return;
  const c = game.cards[Number(b.dataset.i)];
  if (c.up || c.done) return;
  c.up = true; redraw(c.i);
  if (c.side === 'en') say(c.text);
  game.open.push(c);
  if (game.open.length < 2) return;
  game.moves++; drawTop();
  const [a, d] = game.open;
  game.open = [];
  if (a.key === d.key) {
    a.done = d.done = true;
    game.found++;
    redraw(a.i); redraw(d.i);
    if (a.side !== 'en') say(a.w.en); else if (d.side !== 'en') say(d.w.en);
    // 이 단어를 이번 판에서 한 번도 안 틀리고 찾았으면 '맞음', 틀린 적 있으면 '틀림'
    const r = progress.words[a.key] || { seen: 0, right: 0, wrong: 0 };
    r.seen++; if (game.miss[a.key]) r.wrong++; else r.right++;
    r.t = Date.now();
    progress.words[a.key] = r;
    drawTop();
    if (game.found === game.total) await win();
    return;
  }
  game.miss[a.key] = true; game.miss[d.key] = true;
  game.lock = true;
  setTimeout(() => {
    a.up = d.up = false;
    redraw(a.i); redraw(d.i);
    game.lock = false;
  }, 1000);
});

async function win() {
  endTimer();
  const sec = Math.round((Date.now() - game.start) / 1000);
  const perfect = game.moves <= game.total + 2;
  const gems = Math.max(1, Math.round(game.total / 2)) + (perfect ? 1 : 0);
  progress.emeralds += gems;
  markToday(progress);
  await saveProgress(progress);
  setTimeout(() => {
    show('done');
    $('#doneTitle').textContent = perfect ? '대단해요! 거의 한 번에 다 찾았어요!' : '다 찾았어요!';
    $('#doneText').innerHTML = `${game.total}쌍을 <b>${game.moves}</b>번 뒤집어서 <b>${Math.floor(sec / 60)}분 ${sec % 60}초</b> 만에 찾았어요 · 에메랄드 <b>+${gems}</b> (모두 ${progress.emeralds}개)`;
  }, 700);
}

/* ---------- 보고 고르기 ---------- */
let quiz = null;   // { items: [{ w, dir }], i, right, answered, missed: [] }

function startQuiz() {
  const n = Math.min(QUIZ_LEN, words.length);
  const items = pickWords(n).map(w => ({ w, dir: dir === 'mix' ? (Math.random() < 0.5 ? 'ko2en' : 'en2ko') : dir }));
  quiz = { items, i: 0, right: 0, answered: false, missed: [] };
  show('quiz');
  drawQuestion();
}

// 보기 4개: 정답 + 다른 단어 3개(같은 글자로 보이는 보기는 빼고, 영어 보기는 길이가 비슷한 것부터).
function optionsFor(w, d) {
  const label = (x) => (d === 'en2ko' ? x.ko : x.en);
  const answer = label(w);
  const others = shuffle(words.filter(x => x.key !== w.key));
  if (d === 'ko2en') others.sort((a, b) => Math.abs(a.en.length - w.en.length) - Math.abs(b.en.length - w.en.length));
  const opts = [];
  for (const x of others) {
    const l = label(x);
    if (l === answer || opts.some(o => o.label === l)) continue;
    opts.push({ label: l, key: x.key });
    if (opts.length === 3) break;
  }
  return shuffle([{ label: answer, key: w.key }, ...opts]);
}

function drawQuestion() {
  const q = quiz.items[quiz.i];
  const n = quiz.items.length;
  quiz.answered = false;
  $('#qCount').textContent = `${quiz.i + 1} / ${n}`;
  $('#qScore').textContent = `맞힘 ${quiz.right}`;
  $('#qFill').style.width = `${(quiz.i / n) * 100}%`;
  const en2ko = q.dir === 'en2ko';
  $('#qLabel').textContent = en2ko ? '이 영어 단어의 뜻은 무엇일까요?' : '이 뜻을 가진 영어 단어는 무엇일까요?';
  const prompt = $('#qPrompt');
  prompt.textContent = en2ko ? q.w.en : q.w.ko;
  prompt.lang = en2ko ? 'en' : 'ko';
  prompt.className = 'q-prompt ' + (en2ko ? 'en' : 'ko');
  $('#qSay').hidden = !en2ko || !SPEAK_OK;
  $('#qOpts').innerHTML = optionsFor(q.w, q.dir).map(o =>
    `<button type="button" class="btn q-opt ${en2ko ? 'ko' : 'en'}" data-key="${esc(o.key)}" ${en2ko ? '' : 'lang="en"'}>${esc(o.label)}</button>`).join('');
  $('#qFb').textContent = ''; $('#qFb').className = 'pfb';
  $('#qNextRow').hidden = true;
  if (en2ko) say(q.w.en);
}

$('#qSay').addEventListener('click', () => { if (quiz) say(quiz.items[quiz.i].w.en); });

$('#qOpts').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-key]');
  if (!b || !quiz || quiz.answered) return;
  quiz.answered = true;
  const q = quiz.items[quiz.i];
  const ok = b.dataset.key === q.w.key;
  document.querySelectorAll('.q-opt').forEach(x => {
    x.disabled = true;
    if (x.dataset.key === q.w.key) x.classList.add('right');
  });
  if (!ok) b.classList.add('wrong');
  // 단어 기록
  const r = progress.words[q.w.key] || { seen: 0, right: 0, wrong: 0 };
  r.seen++; if (ok) r.right++; else r.wrong++;
  r.t = Date.now();
  progress.words[q.w.key] = r;
  saveProgress(progress);
  say(q.w.en);
  if (ok) {
    quiz.right++;
    $('#qScore').textContent = `맞힘 ${quiz.right}`;
    $('#qFb').textContent = '맞았어요!'; $('#qFb').className = 'pfb good';
    setTimeout(() => { if (quiz && quiz.items[quiz.i] === q) nextQuestion(); }, 1200);
  } else {
    quiz.missed.push(q.w);
    $('#qFb').textContent = `아쉬워요! 정답: ${q.w.en} = ${q.w.ko}`;
    $('#qFb').className = 'pfb warn';
    $('#qNextRow').hidden = false;
  }
});
$('#qNext').addEventListener('click', () => nextQuestion());

function nextQuestion() {
  quiz.i++;
  if (quiz.i < quiz.items.length) drawQuestion(); else finishQuiz();
}

async function finishQuiz() {
  const n = quiz.items.length, right = quiz.right;
  const gems = Math.max(right ? 1 : 0, Math.ceil(right / 2)) + (right === n ? 1 : 0);
  progress.emeralds += gems;
  markToday(progress);
  await saveProgress(progress);
  show('done');
  $('#doneTitle').textContent = right === n ? '다 맞았어요! 최고예요!' : right >= n * 0.7 ? '잘했어요!' : '끝까지 했어요!';
  const missed = [...new Map(quiz.missed.map(w => [w.key, w])).values()];
  $('#doneText').innerHTML = `${n}문제 중 <b>${right}</b>개 맞혔어요 · 에메랄드 <b>+${gems}</b> (모두 ${progress.emeralds}개)` +
    (missed.length ? `<br><span class="review-words">다시 볼 단어: ${missed.map(w => `<b lang="en">${esc(w.en)}</b> ${esc(w.ko)}`).join(' · ')}</span>` : '');
  quiz = null;
}

/* ---------- 시작 ---------- */
let glossary = {};
async function fillMeanings() {
  const missing = collectWords(all.sentences, glossary).filter(w => !w.ko);
  if (!missing.length || !aiEnabled()) return;
  $('#homeNote').textContent = `AI가 단어 ${Math.min(missing.length, 40)}개의 뜻을 찾는 중이에요…`;
  try {
    await fillGlossary(missing, all.sentences);
    glossary = await loadGlossary();
    renderHome();
  } catch (e) {
    $('#homeNote').textContent = words.length >= 2 ? '' : `단어 뜻을 찾지 못했어요. ${aiMessage(e)}`;
  }
}
async function init() {
  $('#kidPick').innerHTML = childPickerHTML(child);
  all = await loadSentences();
  glossary = await loadGlossary();
  $('#proj').innerHTML = `<option value="">모든 영상</option>` +
    all.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')}</option>`).join('');
  await loadKid();
  fillMeanings();
}
init();
