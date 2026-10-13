// 문장 연습: 아이가 만든 영어 문장을 복습 상자 단계에 맞춰 연습한다.
//   1번 상자(새 문장·틀린 문장): 듣고 따라 말하기 → 블록 쌓기(낱말 순서)
//   2번 상자: 블록 쌓기
//   3번 상자: 빈칸 채우기
//   4·5번 상자: 한글 보고 말해 보기(정답을 보고 스스로 맞았는지 고르기)
// 자유 연습(언제든): 같은 활동을 섞어서 한다. 복습 날짜는 바꾸지 않고, 에메랄드는 하루 5개까지.
// 말하며 외우기(언제든): 보면서 말하기 → 반쯤 가리고 말하기 → 다 가리고 한글만 보고 말하기 → 정답 보고 스스로 확인
import { $, esc, shuffle, getChild, setChild, childPickerHTML, loadSentences, loadProgress, saveProgress, syncProgress,
  grade, todayQueue, mastered, markToday, streak, tokens, wordKey, blobURL,
  FREE_GEMS, freeGemsLeft, takeFreeGem, nextDueDays } from './learn.js';
import { canSpeak, speak, getSpeed, wordsOf } from './speech.js';

const SPEAK_OK = canSpeak();
const STEP_NAMES = { listen: '듣고 따라 말하기', build: '블록 쌓기 — 낱말 순서를 맞춰요', cloze: '빈칸 채우기', recall: '한글 보고 영어로 말해 보기' };

let child = getChild();
let progress = null;
let all = { sentences: [], projects: [] };
let pool = [];          // 지금 고른 영상의 문장
let queue = [], idx = 0, retried = new Set();
let session = { right: 0, wrong: 0, gems: 0, kind: 'review' };
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
    start.disabled = true; $('#memorize').disabled = true; $('#free').disabled = true; $('#stats').innerHTML = ''; return;
  }
  if (!child || !progress) {
    who.textContent = '누가 연습하나요? 위에서 이름을 눌러 주세요.';
    start.disabled = true; $('#memorize').disabled = true; $('#free').disabled = true; $('#stats').innerHTML = ''; renderList(); return;
  }
  $('#memorize').disabled = !pool.length;
  $('#free').disabled = !pool.length;
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
  $('#sentList').innerHTML = pool.map(s => {
    const b = box(s.key);
    return `<li><span class="boxes" aria-label="${b ? `${b}번 상자` : '아직 안 함'}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= b ? 'on' : ''}"></i>`).join('')}</span>
      <span class="en">${esc(s.en)}</span><span class="ko">${esc(s.ko)}</span></li>`;
  }).join('');
}

$('#proj').addEventListener('change', renderHome);
$('#start').addEventListener('click', () => startSession());
$('#memorize').addEventListener('click', () => startMemorize());
$('#free').addEventListener('click', () => startFree());
$('#again').addEventListener('click', () => {
  if (session.kind === 'memorize') startMemorize();
  else if (session.kind === 'review' && todayQueue(pool, progress).length) startSession();
  else startFree();
});
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
  if (session.kind === 'memorize') return runMemorize(s);
  const mode = modeFor(s);
  if (mode === 'listen') runListen(s);
  else if (mode === 'build') runBuild(s);
  else if (mode === 'cloze') runCloze(s);
  else runRecall(s);
}

// 결과를 남기고, 받은 에메랄드 수(0 또는 1)를 돌려준다.
// 자유 연습은 복습 날짜를 바꾸지 않고, 에메랄드는 하루 한도 안에서만 준다.
async function record(s, ok) {
  let gem = 0;
  if (session.kind !== 'free') progress.sentences[s.key] = grade(progress.sentences[s.key], ok);
  if (ok) {
    session.right += 1;
    if (session.kind !== 'free') { progress.emeralds += 1; gem = 1; }
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
const gemNote = (gem) => (gem ? ' 에메랄드 1개를 얻었어요.' : '');

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
  if (session.kind === 'memorize') $('#again').textContent = '다시 외우기';
  else if (session.kind === 'review' && todayQueue(pool, progress).length) $('#again').textContent = '더 연습하기';
  else $('#again').textContent = free ? '자유 연습 한 번 더' : '자유 연습 하기';
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
