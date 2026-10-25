// 단어 게임: 아이가 만든 문장에서 나온 단어로 한다. 기록은 아이별로 따로.
//   짝 맞추기: 영어 카드와 한글 카드의 짝을 찾는다(4·6·8쌍).
//   단어 광산(mine.js): 1분 동안 뜻에 맞는(또는 들리는) 단어 블록을 세 번 두드려 캔다.
//   밤을 지켜라(night.js): 뜻을 든 몹이 집으로 걸어오면 맞는 영어 단어를 눌러 막는다.
//   광산 수레 달리기(cart.js): 갈림길이 오기 전에 뜻에 맞는 단어가 있는 선로로 수레를 옮긴다.
//   조합대 제작소(craft.js): 3x3 작업대에 맞는 단어 재료를 넣어 아이템을 조합한다.
//   내 월드 탐험(worldplay.js): 실제 마인크래프트 캡처 사진과 3D 월드에서 핫바로 단어를 고른다.
// 처음 화면의 게임 판 버튼을 누르면 바로 시작한다. 아직 잘 모르는 단어가 먼저 나온다.
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  markToday, streak, collectWords, loadGlossary, fillGlossary, madeBy } from './learn.js';
import { aiEnabled, aiMessage } from './ai.js';
import { checkReset } from './reset.js';
import { canSpeak, speak } from './speech.js';
import { startMine, stopMine } from './mine.js';
import { startNight, stopNight } from './night.js';
import { startCart, stopCart } from './cart.js';
import { startCraft, stopCraft } from './craft.js';
import { startWorldGame, stopWorldGame } from './worldplay.js';
import { playBgm, stopBgm, duckBgm, toggleBgm, isBgmMuted } from './bgm.js';

const SPEAK_OK = canSpeak();

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let glossary = {};
let words = [];          // 뜻이 있는 단어
let filling = false;     // AI가 단어 뜻을 찾는 중
let last = null;         // 마지막으로 한 게임 { kind, pairs | dir } — '한 판 더'
let game = null;         // 짝 맞추기

function show(which) { ['home', 'game', 'mine', 'night', 'cart', 'craft', 'world', 'done'].forEach(k => { $('#' + k).hidden = k !== which; }); window.scrollTo(0, 0); }
function say(text) {
  if (SPEAK_OK) {
    duckBgm(1.5);
    speak(text, { speed: 'slow' }).catch(() => {});
  }
}

/* ---------- 아이·기록 ---------- */
$('#kidPick').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kid]');
  if (!b) return;
  child = b.dataset.kid; setChild(child);
  $('#kidPick').innerHTML = childPickerHTML(child);
  renderProjOptions();
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
  // 그 아이가 만든 영상(만든 사람 칸)의 문장만 쓴다. 고른 영상이 있으면 그 영상만.
  const pid = $('#proj').value;
  const mine = all.sentences.filter(s => madeBy(s, child));
  const sents = pid ? mine.filter(s => s.projectId === pid) : mine;
  const everything = collectWords(sents, glossary);
  words = everything.filter(w => w.ko);
  renderBadges();

  // 알림 한 줄: 무엇을 해야 시작할 수 있는지
  let msg = '';
  if (!all.sentences.length) msg = '아직 단어가 없어요. 만들기에서 영어 문장을 먼저 써 주세요.';
  else if (!child) msg = '누가 할까요? 위에서 이름을 눌러 주세요.';
  else if (!mine.length) msg = `${child}가 만든 영상이 아직 없어요. 만들기 화면의 '만든 사람'에서 ${child}를 눌러 주세요.`;
  else if (filling) msg = 'AI가 단어 뜻을 찾는 중이에요…';
  else if (words.length < 2) msg = '단어가 2개 이상 있어야 게임을 할 수 있어요.';
  $('#homeMsg').textContent = msg;
  $('#homeMsg').hidden = !msg;

  const ready = !!child && !!progress;
  document.querySelectorAll('[data-go="match"]').forEach(b => { b.disabled = !ready || words.length < 2; });
  document.querySelectorAll('[data-go="mine"], [data-go="night"], [data-go="cart"], [data-go="craft"], [data-go="world"]').forEach(b => { b.disabled = !ready || words.length < 4; });
  $('#mineListen').hidden = !SPEAK_OK;
  $('#cartListen').hidden = !SPEAK_OK;
  if ($('#worldListen')) $('#worldListen').hidden = !SPEAK_OK;
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
  else if (b.dataset.go === 'world') goWorld(b.dataset.mode || 'ko');
});
$('#again').addEventListener('click', () => {
  if (!last) return show('home');
  if (last.kind === 'match') startMatch(last.pairs);
  else if (last.kind === 'mine') goMine(last.mode);
  else if (last.kind === 'night') goNight(last.mode || 'ko', last.speed || speeds.night || 'normal');
  else if (last.kind === 'cart') goCart(last.mode || 'ko', last.speed || speeds.cart || 'normal');
  else if (last.kind === 'craft') goCraft(last.mode || 'ko');
  else if (last.kind === 'world') goWorld(last.mode || 'ko');
});
$('#home2').addEventListener('click', () => { stopBgm(); show('home'); renderHome(); });
$('#quit').addEventListener('click', () => { stopBgm(); game = null; show('home'); renderHome(); });
$('#cartQuit').addEventListener('click', () => { stopBgm(); stopCart(); saveProgress(progress); show('home'); renderHome(); });
$('#ngQuit').addEventListener('click', () => { stopBgm(); stopNight(); saveProgress(progress); show('home'); renderHome(); });
$('#mineQuit').addEventListener('click', () => { stopBgm(); stopMine(); saveProgress(progress); show('home'); renderHome(); });
$('#craftQuit').addEventListener('click', () => { stopBgm(); stopCraft(); saveProgress(progress); show('home'); renderHome(); });
$('#worldQuit').addEventListener('click', () => { stopBgm(); stopWorldGame(); saveProgress(progress); show('home'); renderHome(); });

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
  playBgm('match');
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



/* ---------- 단어 광산 ---------- */
function goMine(mode) {
  last = { kind: 'mine', mode };
  show('mine');
  playBgm('mine');
  startMine({ words, pickWords, recordWord, say, onEnd: finishMine }, mode);
  $('#mine').scrollIntoView({ block: 'start' });
}
async function finishMine(r) {
  if ($('#mine').hidden) return;     // 그사이 그만하기를 눌렀으면
  const gems = Math.min(8, Math.ceil(r.mined / 3)) + (r.mined >= 6 && !r.missed.length ? 1 : 0);
  await reward(gems);
  showDone({
    title: r.mined ? `${r.mined}개 캤어요!` : '해가 졌어요!',
    text: (r.mined ? `1분 동안 단어 ${r.mined}개를 캤어요.${r.best >= 3 ? ` 가장 길게 ${r.best}번 연속으로 캤어요.` : ''}` : '다음에는 더 많이 캐 봐요.') +
      (r.wrongs ? ` 틀린 블록을 ${r.wrongs}번 두드려서 ${r.wrongs * 3}초를 잃었어요. 잘 보고 두드리면 더 많이 캘 수 있어요.` : ''),
    gems, missed: r.missed
  });
}

/* ---------- 밤을 지켜라 ---------- */
function goNight(mode = 'ko', speed = 'normal') {
  last = { kind: 'night', mode, speed };
  show('night');
  playBgm('night');
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
  playBgm('cart');
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
  playBgm('craft');
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

/* ---------- 내 월드 탐험 ---------- */
function goWorld(mode = 'ko') {
  last = { kind: 'world', mode };
  show('world');
  playBgm('world');
  startWorldGame({
    words,
    mode,
    projects: all.projects,
    onItem: (en, ok) => {
      const w = words.find(x => x.en.toLowerCase() === en.toLowerCase());
      if (w) recordWord(w, ok);
    },
    onEnd: finishWorld,
    onQuit: () => {
      stopBgm();
      saveProgress(progress);
      show('home');
      renderHome();
    }
  });
  $('#world').scrollIntoView({ block: 'start' });
}
async function finishWorld(r) {
  if ($('#world').hidden) return;
  await reward(r.emeralds);
  showDone({
    title: r.title,
    text: r.text,
    gems: r.emeralds,
    missed: r.wrong
  });
}

/* ---------- 끝 ---------- */
async function reward(gems) {
  progress.emeralds += gems;
  markToday(progress);
  await saveProgress(progress);
}
function showDone({ title, text, gems, missed }) {
  stopBgm();
  show('done');
  $('#gems').innerHTML = Array.from({ length: gems }, (_, i) => `<i style="--d:${i * 120}ms"></i>`).join('');
  $('#doneTitle').textContent = title;
  $('#doneText').textContent = gems ? `${text} 에메랄드 ${gems}개를 얻었어요. (모두 ${progress.emeralds}개)` : text;
  const uniq = [...new Map(missed.map(w => [w.key, w])).values()];
  $('#review').innerHTML = uniq.length
    ? `<p>다시 볼 단어</p><ul>${uniq.map(w => `<li><b lang="en">${esc(w.en)}</b><span>${esc(w.ko)}</span></li>`).join('')}</ul>`
    : '';
  $('#again').textContent = last && last.kind === 'mine' ? '한 번 더 캐기' : last && last.kind === 'night' ? '다시 지키기' : last && last.kind === 'cart' ? '다시 달리기' : last && last.kind === 'craft' ? '다시 만들기' : last && last.kind === 'world' ? '다시 탐험하기' : '한 판 더 하기';
  renderBadges();
}

// 단어 가져올 영상: 고른 아이가 만든 영상만(만든 사람 칸에 이름이 있거나 비어 있는 영상)
function renderProjOptions() {
  const cur = $('#proj').value;
  const list = all.projects.filter(p => madeBy(p, child));
  $('#proj').innerHTML = `<option value="">${child ? esc(child) + '가 만든 영상 모두' : '모든 영상'}</option>` +
    list.map(p => `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')}</option>`).join('');
  $('#proj').value = list.some(p => p.id === cur) ? cur : '';
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
function updateBgmBtn() {
  const btn = $('#bgmBtn');
  if (!btn) return;
  const muted = isBgmMuted();
  btn.textContent = muted ? '🔇 음악 꺼짐' : '🎵 음악 켜짐';
  btn.classList.toggle('muted', muted);
}
$('#bgmBtn')?.addEventListener('click', () => {
  toggleBgm();
  updateBgmBtn();
});

async function init() {
  updateBgmBtn();
  $('#kidPick').innerHTML = childPickerHTML(child);
  await checkReset();     // 다른 기기에서 '모든 기록 지우기'를 했으면 이 기기 것도 지운다
  all = await loadSentences();
  glossary = await loadGlossary();
  renderProjOptions();
  await loadKid();
  fillMeanings();
}
init();
