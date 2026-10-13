// 단어 게임: 아이가 만든 문장에서 나온 단어로 한다. 기록은 아이별로 따로.
//   짝 맞추기: 영어 카드와 한글 카드의 짝을 찾는다(4·6·8쌍).
//   보고 고르기: 한글 뜻을 보고 영어 단어를, 또는 영어 단어를 보고 한글 뜻을 4개 중에서 고른다(10문제).
//   단어 광산(mine.js): 1분 동안 뜻에 맞는(또는 들리는) 단어 블록을 세 번 두드려 캔다.
//   밤을 지켜라(night.js): 뜻을 든 몹이 집으로 걸어오면 맞는 영어 단어를 눌러 막는다.
//   광산 수레 달리기(cart.js): 갈림길이 오기 전에 뜻에 맞는 단어가 있는 선로로 수레를 옮긴다.
// 처음 화면의 게임 판 버튼을 누르면 바로 시작한다. 아직 잘 모르는 단어가 먼저 나온다.
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  markToday, streak, collectWords, loadGlossary, fillGlossary } from './learn.js';
import { aiEnabled, aiMessage } from './ai.js';
import { canSpeak, speak } from './speech.js';
import { startMine, stopMine } from './mine.js';
import { startNight, stopNight } from './night.js';
import { startCart, stopCart } from './cart.js';
import { startCraft, stopCraft } from './craft.js';

const SPEAK_OK = canSpeak();
const QUIZ_LEN = 10;
const MATERIALS = ['grass', 'sky', 'gold', 'dirt'];   // 보기 블록 색

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let glossary = {};
let words = [];          // 뜻이 있는 단어
let filling = false;     // AI가 단어 뜻을 찾는 중
let last = null;         // 마지막으로 한 게임 { kind, pairs | dir } — '한 판 더'
let game = null;         // 짝 맞추기
let quiz = null;         // 보고 고르기

function show(which) { ['home', 'game', 'quiz', 'mine', 'night', 'cart', 'craft', 'done'].forEach(k => { $('#' + k).hidden = k !== which; }); window.scrollTo(0, 0); }
function say(text) { if (SPEAK_OK) speak(text, { speed: 'slow' }).catch(() => {}); }

/* ---------- 아이·기록 ---------- */
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
function renderBadges() {
  $('#badges').innerHTML = child && progress
    ? `<span class="gem-ico" aria-hidden="true"></span><b>${progress.emeralds}</b><span class="sr">에메랄드</span>${streak(progress) > 1 ? `<span class="streak">${streak(progress)}일째 연습</span>` : ''}`
    : '';
}

const known = (w) => { const r = progress && progress.words[w.key]; return r && (r.right || 0) >= 2 && (r.right || 0) > (r.wrong || 0); };

/* ---------- 처음 화면 ---------- */
function renderHome() {
  const pid = $('#proj').value;
  const sents = pid ? all.sentences.filter(s => s.projectId === pid) : all.sentences;
  const everything = collectWords(sents, glossary);
  words = everything.filter(w => w.ko);
  renderBadges();

  // 알림 한 줄: 무엇을 해야 시작할 수 있는지
  let msg = '';
  if (!all.sentences.length) msg = '아직 단어가 없어요. 만들기에서 영어 문장을 먼저 써 주세요.';
  else if (!child) msg = '누가 할까요? 위에서 이름을 눌러 주세요.';
  else if (filling) msg = 'AI가 단어 뜻을 찾는 중이에요…';
  else if (words.length < 2) msg = '단어가 2개 이상 있어야 게임을 할 수 있어요.';
  $('#homeMsg').textContent = msg;
  $('#homeMsg').hidden = !msg;

  const ready = !!child && !!progress;
  document.querySelectorAll('[data-go="match"]').forEach(b => { b.disabled = !ready || words.length < 2; });
  document.querySelectorAll('[data-go="quiz"], [data-go="mine"], [data-go="night"], [data-go="cart"], [data-go="craft"]').forEach(b => { b.disabled = !ready || words.length < 4; });
  $('#mineListen').hidden = !SPEAK_OK;
  $('#cartListen').hidden = !SPEAK_OK;
  $('#games').classList.toggle('locked', !ready);

  $('#openList').textContent = `내 단어장 ${words.length}개`;
  $('#openList').hidden = !words.length;
  $('#wordList').innerHTML = words.map(w => `<li class="${known(w) ? 'known' : ''}">
    <button type="button" class="wl-say" data-say="${esc(w.en)}" aria-label="${esc(w.en)} 듣기"></button>
    <b lang="en">${esc(w.en)}</b><span>${esc(w.ko)}</span></li>`).join('');
  syncSpeedButtons();
}

const speeds = { cart: 'normal', night: 'normal' };
try {
  if (localStorage.getItem('cartSpeed')) speeds.cart = localStorage.getItem('cartSpeed');
  if (localStorage.getItem('nightSpeed')) speeds.night = localStorage.getItem('nightSpeed');
} catch {}

function syncSpeedButtons() {
  ['cart', 'night'].forEach(g => {
    const group = document.querySelector(`.wg-speed-picks[data-game="${g}"]`);
    if (!group) return;
    group.querySelectorAll('.sp-btn').forEach(b => {
      const on = b.dataset.speed === speeds[g];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
}

$('#proj').addEventListener('change', renderHome);
$('#openList').addEventListener('click', () => {
  const l = $('#list');
  l.hidden = !l.hidden;
  $('#openList').setAttribute('aria-expanded', String(!l.hidden));
});
$('#wordList').addEventListener('click', (e) => { const b = e.target.closest('[data-say]'); if (b) say(b.dataset.say); });
$('#games').addEventListener('click', (e) => {
  const spBtn = e.target.closest('.sp-btn');
  if (spBtn) {
    const group = spBtn.closest('.wg-speed-picks');
    const g = group?.dataset.game;
    if (g && ['cart', 'night'].includes(g)) {
      speeds[g] = spBtn.dataset.speed || 'normal';
      group.querySelectorAll('.sp-btn').forEach(b => {
        const on = b === spBtn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      try { localStorage.setItem(`${g}Speed`, speeds[g]); } catch {}
    }
    return;
  }
  const b = e.target.closest('[data-go]');
  if (!b || b.disabled) return;
  if (b.dataset.go === 'match') startMatch(Number(b.dataset.pairs));
  else if (b.dataset.go === 'mine') goMine(b.dataset.mode);
  else if (b.dataset.go === 'night') goNight(b.dataset.mode || 'ko', b.dataset.speed || speeds.night || 'normal');
  else if (b.dataset.go === 'cart') goCart(b.dataset.mode || 'ko', b.dataset.speed || speeds.cart || 'normal');
  else if (b.dataset.go === 'craft') goCraft(b.dataset.mode || 'ko');
  else startQuiz(b.dataset.dir);
});
$('#again').addEventListener('click', () => {
  if (!last) return show('home');
  if (last.kind === 'match') startMatch(last.pairs);
  else if (last.kind === 'mine') goMine(last.mode);
  else if (last.kind === 'night') goNight(last.mode || 'ko', last.speed || speeds.night || 'normal');
  else if (last.kind === 'cart') goCart(last.mode || 'ko', last.speed || speeds.cart || 'normal');
  else if (last.kind === 'craft') goCraft(last.mode || 'ko');
  else startQuiz(last.dir);
});
$('#home2').addEventListener('click', () => { show('home'); renderHome(); });
$('#qQuit').addEventListener('click', () => { quiz = null; show('home'); renderHome(); });
$('#quit').addEventListener('click', () => { game = null; show('home'); renderHome(); });
$('#cartQuit').addEventListener('click', () => { stopCart(); saveProgress(progress); show('home'); renderHome(); });
$('#ngQuit').addEventListener('click', () => { stopNight(); saveProgress(progress); show('home'); renderHome(); });
$('#mineQuit').addEventListener('click', () => { stopMine(); saveProgress(progress); show('home'); renderHome(); });
$('#craftQuit').addEventListener('click', () => { stopCraft(); saveProgress(progress); show('home'); renderHome(); });

// 잘 모르는 단어를 먼저: 처음 보는 단어, 틀린 적 많은 단어, 오래전에 본 단어 순.
function pickWords(n) {
  const score = (w) => {
    const r = progress.words[w.key];
    if (!r) return 100 + Math.random() * 10;
    return (r.wrong || 0) * 10 - (r.right || 0) * 6 + (Date.now() - (r.t || 0)) / 864e5 + Math.random() * 4;
  };
  return [...words].sort((a, b) => score(b) - score(a)).slice(0, n);
}
function recordWord(w, ok) {
  const r = progress.words[w.key] || { seen: 0, right: 0, wrong: 0 };
  r.seen++; if (ok) r.right++; else r.wrong++;
  r.t = Date.now();
  progress.words[w.key] = r;
}
const stepsHTML = (states) => states.map((s, i) => `<li class="${s}" aria-label="${i + 1}"></li>`).join('');

/* ---------- 짝 맞추기 ---------- */
function startMatch(pairs) {
  const n = Math.min(pairs, words.length);
  last = { kind: 'match', pairs };
  const cards = shuffle(pickWords(n).flatMap(w => [{ key: w.key, side: 'en', text: w.en, w }, { key: w.key, side: 'ko', text: w.ko, w }]))
    .map((c, i) => ({ ...c, i, up: false, done: false }));
  game = { cards, open: [], found: 0, total: n, moves: 0, start: Date.now(), miss: {}, lock: false };
  show('game');
  drawBoard(); drawMatchBar();
}
function drawMatchBar() {
  $('#mSteps').innerHTML = stepsHTML(Array.from({ length: game.total }, (_, i) => (i < game.found ? 'right' : '')));
  $('#moves').textContent = `${game.moves}번 뒤집었어요`;
}
function tileHTML(c) {
  const face = c.up || c.done;
  return `<button type="button" class="wg-tile ${c.side} ${face ? 'up' : ''} ${c.done ? 'done' : ''}" data-i="${c.i}"
    aria-label="${face ? esc(c.text) : '뒤집힌 카드'}" ${c.done ? 'disabled' : ''}>
    ${face ? `<span class="tag">${c.side === 'en' ? 'English' : '한글'}</span><span class="word" ${c.side === 'en' ? 'lang="en"' : ''}>${esc(c.text)}</span>`
           : '<span class="q" aria-hidden="true">?</span>'}
  </button>`;
}
function drawBoard() {
  const board = $('#board');
  board.className = `wg-board n${game.cards.length}`;
  board.innerHTML = game.cards.map(tileHTML).join('');
}
function redraw(i) {
  const el = document.querySelector(`.wg-tile[data-i="${i}"]`);
  if (el) el.outerHTML = tileHTML(game.cards[i]);
}
$('#board').addEventListener('click', async (e) => {
  const b = e.target.closest('.wg-tile');
  if (!b || !game || game.lock) return;
  const c = game.cards[Number(b.dataset.i)];
  if (c.up || c.done) return;
  c.up = true; redraw(c.i);
  if (c.side === 'en') say(c.text);
  game.open.push(c);
  if (game.open.length < 2) return;
  game.moves++;
  const [a, d] = game.open;
  game.open = [];
  if (a.key === d.key) {
    a.done = d.done = true;
    game.found++;
    redraw(a.i); redraw(d.i);
    say(a.w.en);
    recordWord(a.w, !game.miss[a.key]);   // 이번 판에서 한 번도 안 틀리고 찾았으면 '맞음'
    drawMatchBar();
    if (game.found === game.total) setTimeout(finishMatch, 600);
    return;
  }
  drawMatchBar();
  game.miss[a.key] = true; game.miss[d.key] = true;
  game.lock = true;
  setTimeout(() => {
    a.up = d.up = false;
    redraw(a.i); redraw(d.i);
    game.lock = false;
  }, 1000);
});
async function finishMatch() {
  const sec = Math.round((Date.now() - game.start) / 1000);
  const perfect = game.moves <= game.total + 2;
  const gems = Math.max(1, Math.round(game.total / 2)) + (perfect ? 1 : 0);
  await reward(gems);
  const missed = game.cards.filter(c => c.side === 'en' && game.miss[c.key]).map(c => c.w);
  showDone({
    title: perfect ? '거의 한 번에 다 찾았어요!' : '짝을 다 찾았어요!',
    text: `${game.total}쌍을 ${game.moves}번 뒤집어서 ${Math.floor(sec / 60) ? `${Math.floor(sec / 60)}분 ` : ''}${sec % 60}초 만에 찾았어요.`,
    gems, missed
  });
  game = null;
}

/* ---------- 보고 고르기 ---------- */
function startQuiz(dir) {
  const n = Math.min(QUIZ_LEN, words.length);
  last = { kind: 'quiz', dir };
  const items = pickWords(n).map(w => ({ w, dir: dir === 'mix' ? (Math.random() < 0.5 ? 'ko2en' : 'en2ko') : dir, result: '' }));
  quiz = { items, i: 0, right: 0, answered: false, missed: [] };
  show('quiz');
  drawQuestion();
}
// 보기 4개: 정답 + 다른 단어 3개(같은 글자 보기는 빼고, 영어 보기는 길이가 비슷한 것부터).
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
  quiz.answered = false;
  $('#qSteps').innerHTML = stepsHTML(quiz.items.map((it, k) => it.result || (k === quiz.i ? 'now' : '')));
  const en2ko = q.dir === 'en2ko';
  $('#qLabel').textContent = en2ko ? '이 단어의 뜻은?' : '이 뜻의 영어 단어는?';
  const prompt = $('#qPrompt');
  prompt.textContent = en2ko ? q.w.en : q.w.ko;
  prompt.lang = en2ko ? 'en' : 'ko';
  $('#qSay').hidden = !en2ko || !SPEAK_OK;
  $('#qOpts').innerHTML = optionsFor(q.w, q.dir).map((o, k) =>
    `<button type="button" class="wg-opt ${MATERIALS[k]}" data-key="${esc(o.key)}" ${en2ko ? '' : 'lang="en"'}>
      <span class="key" aria-hidden="true">${k + 1}</span><span class="lbl">${esc(o.label)}</span></button>`).join('');
  $('#qFb').textContent = ''; $('#qFb').className = 'wg-fb';
  $('#qNext').hidden = true;
  if (en2ko) say(q.w.en);
}
$('#qSay').addEventListener('click', () => { if (quiz) say(quiz.items[quiz.i].w.en); });
function answer(b) {
  if (!b || !quiz || quiz.answered) return;
  quiz.answered = true;
  const q = quiz.items[quiz.i];
  const ok = b.dataset.key === q.w.key;
  document.querySelectorAll('.wg-opt').forEach(x => {
    x.disabled = true;
    if (x.dataset.key === q.w.key) x.classList.add('right');
    else if (x !== b) x.classList.add('dim');
  });
  if (!ok) b.classList.add('wrong');
  q.result = ok ? 'right' : 'wrong';
  $('#qSteps').innerHTML = stepsHTML(quiz.items.map((it, k) => it.result || (k === quiz.i ? 'now' : '')));
  recordWord(q.w, ok);
  saveProgress(progress);
  say(q.w.en);
  if (ok) {
    quiz.right++;
    $('#qFb').textContent = '맞았어요!'; $('#qFb').className = 'wg-fb good';
    setTimeout(() => { if (quiz && quiz.items[quiz.i] === q) nextQuestion(); }, 1100);
  } else {
    quiz.missed.push(q.w);
    $('#qFb').innerHTML = `정답은 <b lang="en">${esc(q.w.en)}</b> = <b>${esc(q.w.ko)}</b>`;
    $('#qFb').className = 'wg-fb bad';
    $('#qNext').hidden = false;
    $('#qNext').focus({ preventScroll: true });
  }
}
$('#qOpts').addEventListener('click', (e) => answer(e.target.closest('[data-key]')));
$('#qNext').addEventListener('click', () => nextQuestion());
// PC에서는 숫자키 1~4로 고르고, Enter로 다음 문제
document.addEventListener('keydown', (e) => {
  if ($('#quiz').hidden || !quiz || e.altKey || e.ctrlKey || e.metaKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4 && !quiz.answered) { answer(document.querySelectorAll('.wg-opt')[n - 1]); e.preventDefault(); }
  else if (e.key === 'Enter' && quiz.answered && !$('#qNext').hidden) { nextQuestion(); e.preventDefault(); }
});
function nextQuestion() {
  quiz.i++;
  if (quiz.i < quiz.items.length) drawQuestion(); else finishQuiz();
}
async function finishQuiz() {
  const n = quiz.items.length, right = quiz.right;
  const gems = Math.max(right ? 1 : 0, Math.ceil(right / 2)) + (right === n ? 1 : 0);
  await reward(gems);
  showDone({
    title: right === n ? '다 맞았어요!' : right >= n * 0.7 ? '잘했어요!' : '끝까지 했어요!',
    text: `${n}문제 중 ${right}개 맞혔어요.`,
    gems, missed: quiz.missed
  });
  quiz = null;
}

/* ---------- 단어 광산 ---------- */
function goMine(mode) {
  last = { kind: 'mine', mode };
  show('mine');
  startMine({ words, pickWords, recordWord, say, onEnd: finishMine }, mode);
  $('#mine').scrollIntoView({ block: 'start' });
}
async function finishMine(r) {
  if ($('#mine').hidden) return;     // 그사이 그만하기를 눌렀으면
  const gems = Math.min(8, Math.ceil(r.mined / 3)) + (r.mined >= 6 && !r.missed.length ? 1 : 0);
  await reward(gems);
  showDone({
    title: r.mined ? `${r.mined}개 캤어요!` : '해가 졌어요!',
    text: r.mined ? `1분 동안 단어 ${r.mined}개를 캤어요.${r.best >= 3 ? ` 가장 길게 ${r.best}번 연속으로 캤어요.` : ''}` : '다음에는 더 많이 캐 봐요.',
    gems, missed: r.missed
  });
}

/* ---------- 밤을 지켜라 ---------- */
function goNight(mode = 'ko', speed = 'normal') {
  last = { kind: 'night', mode, speed };
  show('night');
  startNight({ words, pickWords, recordWord, say, onEnd: finishNight }, mode, speed);
  $('#night').scrollIntoView({ block: 'start' });
}
async function finishNight(r) {
  if ($('#night').hidden) return;     // 그사이 그만하기를 눌렀으면
  const gems = r.win ? Math.min(8, Math.ceil(r.killed / 2)) + (r.hearts === 3 ? 1 : 0) : Math.ceil(r.killed / 3);
  await reward(gems);
  showDone({
    title: r.win ? (r.hearts === 3 ? '집을 완벽하게 지켰어요!' : '아침까지 집을 지켰어요!') : '다음엔 꼭 지켜요!',
    text: `몹 ${r.total}마리 중 ${r.killed}마리를 물리쳤어요.${r.win ? ` ${Math.floor(r.sec / 60) ? `${Math.floor(r.sec / 60)}분 ` : ''}${r.sec % 60}초 걸렸어요.` : ''}${r.best >= 3 ? ` 가장 길게 ${r.best}번 연속으로 맞혔어요.` : ''}`,
    gems, missed: r.missed
  });
}

/* ---------- 광산 수레 달리기 ---------- */
function goCart(mode = 'ko', speed = 'normal') {
  last = { kind: 'cart', mode, speed };
  show('cart');
  startCart({ words, pickWords, recordWord, say, onEnd: finishCart }, mode, speed);
  $('#cart').scrollIntoView({ block: 'start' });
}
async function finishCart(r) {
  if ($('#cart').hidden) return;     // 그사이 그만하기를 눌렀으면
  const gems = r.win ? Math.min(8, Math.ceil(r.right / 2)) + (r.hearts === 3 ? 1 : 0) : Math.ceil(r.right / 3);
  await reward(gems);
  showDone({
    title: r.win ? (r.hearts === 3 ? '한 번도 안 부딪히고 도착했어요!' : '끝까지 도착했어요!') : '다음엔 꼭 도착해요!',
    text: `갈림길 ${r.total}개 중 ${r.right}개를 맞는 길로 지나갔어요.${r.win ? ` ${Math.floor(r.sec / 60) ? `${Math.floor(r.sec / 60)}분 ` : ''}${r.sec % 60}초 걸렸어요.` : ''}${r.best >= 3 ? ` 가장 길게 ${r.best}번 연속으로 맞혔어요.` : ''}`,
    gems, missed: r.missed
  });
}

/* ---------- 조합대 제작소 ---------- */
function goCraft(mode = 'ko') {
  last = { kind: 'craft', mode };
  show('craft');
  startCraft({ words, pickWords, recordWord, say, onEnd: finishCraft }, mode);
  $('#craft').scrollIntoView({ block: 'start' });
}
async function finishCraft(r) {
  if ($('#craft').hidden) return;     // 그사이 그만하기를 눌렀으면
  const gems = r.win ? Math.min(8, Math.ceil(r.right / 2)) + (r.hearts === 3 ? 1 : 0) : Math.ceil(r.right / 3);
  await reward(gems);
  const itemsText = r.crafted && r.crafted.length
    ? ` ${r.crafted.map(it => it.name).join(', ')}을(를) 완성했어요!`
    : '';
  showDone({
    title: r.win ? (r.hearts === 3 ? '전설의 장비를 완벽하게 제작했어요!' : '조합을 모두 마쳤어요!') : '다음엔 꼭 완성해요!',
    text: `문제 ${r.total}개 중 ${r.right}개를 맞혔어요.${itemsText}${r.win ? ` ${Math.floor(r.sec / 60) ? `${Math.floor(r.sec / 60)}분 ` : ''}${r.sec % 60}초 걸렸어요.` : ''}${r.best >= 3 ? ` 가장 길게 ${r.best}번 연속으로 맞혔어요.` : ''}`,
    gems, missed: r.missed
  });
}

/* ---------- 끝 ---------- */
async function reward(gems) {
  progress.emeralds += gems;
  markToday(progress);
  await saveProgress(progress);
}
function showDone({ title, text, gems, missed }) {
  show('done');
  $('#gems').innerHTML = Array.from({ length: gems }, (_, i) => `<i style="--d:${i * 120}ms"></i>`).join('');
  $('#doneTitle').textContent = title;
  $('#doneText').textContent = gems ? `${text} 에메랄드 ${gems}개를 얻었어요. (모두 ${progress.emeralds}개)` : text;
  const uniq = [...new Map(missed.map(w => [w.key, w])).values()];
  $('#review').innerHTML = uniq.length
    ? `<p>다시 볼 단어</p><ul>${uniq.map(w => `<li><b lang="en">${esc(w.en)}</b><span>${esc(w.ko)}</span></li>`).join('')}</ul>`
    : '';
  $('#again').textContent = last && last.kind === 'quiz' ? '한 판 더 풀기' : last && last.kind === 'mine' ? '한 번 더 캐기' : last && last.kind === 'night' ? '다시 지키기' : last && last.kind === 'cart' ? '다시 달리기' : last && last.kind === 'craft' ? '다시 만들기' : '한 판 더 하기';
  renderBadges();
}

/* ---------- 시작 ---------- */
async function fillMeanings() {
  const missing = collectWords(all.sentences, glossary).filter(w => !w.ko);
  if (!missing.length || !aiEnabled()) return;
  filling = true; renderHome();
  try {
    await fillGlossary(missing, all.sentences);
    glossary = await loadGlossary();
  } catch (e) {
    if (words.length < 2) { filling = false; renderHome(); $('#homeMsg').textContent = `단어 뜻을 찾지 못했어요. ${aiMessage(e)}`; $('#homeMsg').hidden = false; return; }
  }
  filling = false; renderHome();
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
