// 발표 테스트: 영상을 발표하듯이 사진만 보고 영어 문장을 말해 본다. 음성 인식은 쓰지 않는다.
//   순서: 발표 순서(장면 순서대로) / 섞어서
//   힌트 사다리: 0 사진만(★3) → 1 첫 단어(★2) → 2 모든 낱말 첫 글자(★1) → 3 한글 뜻(★1). '모르겠어요'는 정답을 보고 0점.
//   채점: 스스로 확인 / 부모님 채점(O·X). 켜 두면 '말할 때 녹음'해서 정답과 내 목소리를 나란히 들어 볼 수 있다.
//   결과: 문장마다 별·쓴 힌트, 메달, 영상별 최고 점수(progress.tests[영상 id]).
//   복습 상자: 힌트 없이 맞히면 한 칸 올리고, 틀리거나 '모르겠어요'면 1번 상자로. 힌트를 보고 맞힌 것은 그대로.
//   에메랄드: 처음부터 끝까지 한 판을 마치면 별 3개마다 1개(최대 8개), 같은 영상은 하루 한 번.
import { $, esc, shuffle, grade, markToday, saveProgress, blobURL, todayStr } from './learn.js';
import { canSpeak, speak, getSpeed, wordsOf } from './speech.js';
import { canRecord, startRecording, micErrorMessage } from './recorder.js';

const SPEAK_OK = canSpeak();
const REC_OK = canRecord();
const STARS = [3, 2, 1, 1];
const HINT_NAMES = ['힌트 없이', '첫 단어', '첫 글자', '한글 뜻'];
const OPT_KEY = 'block-studio-ptest';

let ctx = null;          // practice.js가 넘겨줌: { getProgress, sentences, projects, defaultPid, show(which), onHome() }
let opts = { order: 'story', start: 0, judge: 'self', rec: false };
let run = null;          // { pid, items:[{s, level, ok, stars, gaveUp, attempt}], i, full }
let talk = null, audio = null, recording = null;

try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch (e) { /* 처음 */ }
const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) { /* 무시 */ } };

/* ---------- 준비 화면 ---------- */
export function openTest(c) {
  ctx = c;
  stopAll();
  const projs = ctx.projects.filter(p => ctx.sentences.some(s => s.projectId === p.id));
  const sel = $('#ptProj');
  sel.innerHTML = projs.map(p => {
    const n = ctx.sentences.filter(s => s.projectId === p.id).length;
    return `<option value="${esc(p.id)}">${esc(p.title || '제목 없는 영상')} (${n}문장)</option>`;
  }).join('') + (projs.length > 1 ? `<option value="">모든 영상 (${ctx.sentences.length}문장)</option>` : '');
  sel.value = projs.some(p => p.id === ctx.defaultPid) ? ctx.defaultPid : (projs[0] ? projs[0].id : '');
  $('#ptRecWrap').hidden = !REC_OK;
  $('#ptRec').checked = REC_OK && !!opts.rec;
  drawOpts();
  drawBest();
  showPart('setup');
  ctx.show('test');
}
function drawOpts() {
  document.querySelectorAll('#ptSetup [data-opt]').forEach(g => {
    g.querySelectorAll('button').forEach(b => {
      const on = String(opts[g.dataset.opt]) === b.dataset.v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
}
function testRec(pid) { const p = ctx.getProgress(); return p.tests && p.tests[pid || 'all']; }
function drawBest() {
  const r = testRec($('#ptProj').value);
  $('#ptBest').textContent = r
    ? `지금까지 최고 점수 ${r.best}점 (별 ${r.bestStars}/${r.max}) · 마지막 테스트 ${r.last ? new Date(r.last).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''}`
    : '아직 이 영상으로 테스트한 적이 없어요.';
}
$('#ptSetup').addEventListener('click', (e) => {
  const b = e.target.closest('[data-opt] button');
  if (!b) return;
  const key = b.closest('[data-opt]').dataset.opt;
  opts[key] = key === 'start' ? Number(b.dataset.v) : b.dataset.v;
  saveOpts(); drawOpts();
});
$('#ptProj').addEventListener('change', drawBest);
$('#ptRec').addEventListener('change', () => { opts.rec = $('#ptRec').checked; saveOpts(); });
$('#ptBack').addEventListener('click', () => { stopAll(); ctx.onHome(); });
$('#ptGo').addEventListener('click', () => {
  const pid = $('#ptProj').value;
  let list = ctx.sentences.filter(s => !pid || s.projectId === pid);
  if (opts.order === 'shuffle') list = shuffle(list);
  begin(pid, list, true);
});

function showPart(which) {
  $('#ptSetup').hidden = which !== 'setup';
  $('#ptRun').hidden = which !== 'run';
  $('#ptResult').hidden = which !== 'result';
  window.scrollTo(0, 0);
}

/* ---------- 테스트 진행 ---------- */
function begin(pid, list, full) {
  if (!list.length) return;
  run = { pid, full, i: 0, items: list.map(s => ({ s, level: opts.start, ok: null, stars: 0, gaveUp: false, attempt: null })) };
  showPart('run');
  drawItem();
}
const cur = () => run.items[run.i];

function stopAudio() {
  if (talk) { talk.stop(); talk = null; }
  if (audio) { audio.pause(); audio = null; }
}
function stopAll() {
  stopAudio();
  if (recording) { recording.stop(); recording = null; }
}
async function say(text) {
  if (!SPEAK_OK) return;
  stopAudio();
  const mark = (i) => document.querySelectorAll('#ptAnswer [data-w]').forEach(el => el.classList.toggle('now', Number(el.dataset.w) === i));
  talk = await speak(text, { speed: getSpeed(), onWord: mark, onEnd: () => { mark(-1); talk = null; } });
}
function play(blob) {
  if (!blob) return;
  stopAudio();
  audio = new Audio(blobURL(blob));
  audio.play().catch(() => {});
}

// 사진: 장면에 사진이 여러 장이면 눌러서 넘겨 본다.
function drawPhoto(s, k = 0) {
  const imgs = (s.images && s.images.length ? s.images : [s.image]).filter(Boolean);
  const el = $('#ptPhoto');
  if (!imgs.length) { el.innerHTML = '<div class="pt-nophoto">사진이 없는 장면이에요</div>'; return; }
  const n = k % imgs.length;
  el.innerHTML = `<img src="${blobURL(imgs[n])}" alt="장면 ${s.sceneNo} 사진">` +
    (imgs.length > 1 ? `<button type="button" class="pt-more" data-photo="${n + 1}">사진 ${n + 1}/${imgs.length} · 눌러서 다음 사진</button>` : '');
}
$('#ptPhoto').addEventListener('click', (e) => {
  const b = e.target.closest('[data-photo]');
  if (b && run) drawPhoto(cur().s, Number(b.dataset.photo));
});

// 힌트 글: 1단계 첫 단어 + 나머지는 빈칸, 2단계 모든 낱말 첫 글자
function blankWord(w, keepFirst) {
  const m = /^([^A-Za-z']*)([A-Za-z'’]+)(.*)$/.exec(w);
  if (!m) return esc(w);
  const core = m[2];
  const shown = keepFirst ? core[0] + '_'.repeat(core.length - 1) : '_'.repeat(Math.max(2, core.length));
  return `${esc(m[1])}<span class="pt-blank">${esc(shown)}</span>${esc(m[3])}`;
}
function hintHTML(s, level) {
  const raw = wordsOf(s.en);
  const parts = [];
  if (level === 0) parts.push('<p class="pt-say">사진을 보고 영어 문장을 소리 내어 말해 봐요.</p>');
  if (level >= 1) {
    const line = raw.map((w, i) => (level === 1 ? (i === 0 ? esc(w) : blankWord(w, false)) : (i === 0 ? esc(w) : blankWord(w, true)))).join(' ');
    parts.push(`<p class="pt-clue" lang="en">${line}</p>`);
  }
  if (level >= 3 && s.ko) parts.push(`<p class="pt-ko">${esc(s.ko)}</p>`);
  return parts.join('');
}

function drawStars(n, max = 3) {
  return `<span class="pt-starrow" aria-label="별 ${n}개">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
}

function drawItem() {
  stopAll();
  const it = cur(), s = it.s;
  const n = run.items.length;
  $('#ptCount').textContent = `${run.i + 1} / ${n}`;
  $('#ptFill').style.width = `${(run.i / n) * 100}%`;
  $('#ptTotal').innerHTML = `★ ${run.items.reduce((a, x) => a + x.stars, 0)}`;
  drawPhoto(s);
  const where = [`장면 ${s.sceneNo}`];
  if (s.lineCount > 1) where.push(`이 사진의 문장 ${s.lineCount}개 중 ${s.lineNo}번째`);
  if (!run.pid) where.unshift(s.projectTitle);
  $('#ptWhere').textContent = where.join(' · ');
  // 발표 순서면 같은 장면의 바로 앞 문장을 보여 줘서 이어 말하기 쉽게
  const prev = run.items[run.i - 1];
  $('#ptPrev').innerHTML = opts.order === 'story' && prev && prev.s.sceneId === s.sceneId && s.lineNo > 1
    ? `앞 문장: <span lang="en">${esc(prev.s.en)}</span>` : '';
  $('#ptAnswer').hidden = true; $('#ptAnswer').innerHTML = '';
  $('#ptFb').textContent = ''; $('#ptFb').className = 'pfb';
  drawAsk();
}

function drawAsk() {
  const it = cur();
  $('#ptStars').innerHTML = drawStars(STARS[it.level]) + `<span class="pt-starnote">${it.level ? `힌트: ${HINT_NAMES[it.level]}` : '힌트 없이 말하면 별 3개!'}</span>`;
  $('#ptHint').innerHTML = hintHTML(it.s, it.level);
  const canHint = it.level < 3 && !(it.level === 2 && !it.s.ko);
  const recBtn = opts.rec && REC_OK
    ? `<button class="btn big red ${recording ? 'on' : ''}" type="button" data-pt="rec"><span class="rec-dot" aria-hidden="true"></span>${recording ? '녹음 끝' : '녹음하며 말하기'}</button>` : '';
  $('#ptCtrl').innerHTML = `${recBtn}
    <button class="btn big gold" type="button" data-pt="reveal">말했어요 → 정답 확인</button>
    ${canHint ? `<button class="btn" type="button" data-pt="hint">힌트 보기 (별 하나 줄어요)</button>` : ''}
    <button class="btn small" type="button" data-pt="giveup">모르겠어요</button>`;
}

async function toggleRec() {
  const it = cur();
  if (recording) {
    const r = recording; recording = null;
    it.attempt = await r.stop();
    drawAsk();
    $('#ptFb').textContent = '녹음했어요. 정답 확인에서 들어 볼 수 있어요.';
    return;
  }
  stopAudio();
  try {
    recording = await startRecording();
    drawAsk();
    $('#ptFb').textContent = '녹음 중이에요. 문장을 말하고 "녹음 끝"을 눌러요.';
  } catch (e) {
    recording = null;
    $('#ptFb').textContent = micErrorMessage(e);
  }
}

async function reveal(gaveUp) {
  const it = cur(), s = it.s;
  if (recording) { const r = recording; recording = null; it.attempt = await r.stop(); }
  it.gaveUp = gaveUp;
  $('#ptFb').textContent = ''; $('#ptFb').className = 'pfb';
  if (it.level === 0) $('#ptHint').innerHTML = '';
  $('#ptAnswer').hidden = false;
  $('#ptAnswer').innerHTML = `<p class="follow big" lang="en">${wordsOf(s.en).map((w, i) => `<span data-w="${i}">${esc(w)}</span>`).join(' ')}</p>
    ${s.ko ? `<p class="pt-ko small">${esc(s.ko)}</p>` : ''}
    <div class="row">
      ${SPEAK_OK ? '<button class="btn small listen" type="button" data-pt="sayans">정답 듣기</button>' : ''}
      ${it.attempt ? '<button class="btn small" type="button" data-pt="mine">방금 내 목소리</button>' : ''}
      ${s.audio ? '<button class="btn small" type="button" data-pt="orig">영상 속 내 목소리</button>' : ''}
    </div>`;
  say(s.en);
  if (gaveUp) { setResult(false); return; }
  const parent = opts.judge === 'parent';
  $('#ptStars').innerHTML = drawStars(STARS[it.level]) + `<span class="pt-starnote">${parent ? '부모님이 눌러 주세요' : '내가 말한 것과 같았나요?'}</span>`;
  $('#ptCtrl').innerHTML = parent
    ? `<button class="btn big grass pt-ox" type="button" data-pt="yes" aria-label="맞았어요">O 맞았어요</button>
       <button class="btn big red pt-ox" type="button" data-pt="no" aria-label="틀렸어요">X 틀렸어요</button>`
    : `<button class="btn big grass" type="button" data-pt="yes">맞았어요</button>
       <button class="btn big" type="button" data-pt="no">틀렸어요</button>`;
}

async function setResult(ok) {
  const it = cur();
  it.ok = ok;
  it.stars = ok ? STARS[it.level] : 0;
  // 복습 상자
  const p = ctx.getProgress();
  if (!ok) p.sentences[it.s.key] = grade(p.sentences[it.s.key], false);
  else if (it.level === 0) p.sentences[it.s.key] = grade(p.sentences[it.s.key], true);
  markToday(p);
  saveProgress(p);
  $('#ptStars').innerHTML = drawStars(it.stars);
  const fb = $('#ptFb');
  fb.textContent = ok ? (it.stars === 3 ? '완벽해요! 별 3개!' : `잘했어요! 별 ${it.stars}개`) : it.gaveUp ? '괜찮아요. 정답을 듣고 따라 말해 봐요.' : '괜찮아요. 정답을 듣고 한 번 더 말해 봐요.';
  fb.className = 'pfb ' + (ok ? 'good' : 'warn');
  $('#ptTotal').innerHTML = `★ ${run.items.reduce((a, x) => a + x.stars, 0)}`;
  const last = run.i >= run.items.length - 1;
  $('#ptCtrl').innerHTML = `<button class="btn big grass" type="button" data-pt="next">${last ? '결과 보기' : '다음 장면 →'}</button>`;
}

$('#ptRun').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pt]');
  if (!b || !run) return;
  const it = cur();
  const what = b.dataset.pt;
  if (what === 'hint') { it.level = Math.min(3, it.level + 1); drawAsk(); }
  else if (what === 'rec') toggleRec();
  else if (what === 'reveal') reveal(false);
  else if (what === 'giveup') reveal(true);
  else if (what === 'yes') setResult(true);
  else if (what === 'no') setResult(false);
  else if (what === 'sayans') say(it.s.en);
  else if (what === 'mine') play(it.attempt);
  else if (what === 'orig') play(it.s.audio);
  else if (what === 'next') { run.i++; if (run.i >= run.items.length) finish(); else drawItem(); }
});
$('#ptQuit').addEventListener('click', () => {
  stopAll();
  // 하나라도 했으면 거기까지의 결과를 보여 준다(점수 기록·에메랄드는 끝까지 한 판만).
  if (run && run.items.some(x => x.ok !== null)) { run.items = run.items.filter(x => x.ok !== null); run.full = false; finish(); }
  else openTest(ctx);
});
document.addEventListener('keydown', (e) => {
  if (!run || $('#ptRun').hidden || $('#test').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest('input, select, textarea')) return;
  const btn = (k) => $(`#ptCtrl [data-pt="${k}"]`);
  let b = null;
  if (e.key === 'Enter') b = btn('next') || btn('reveal');
  else if (e.key === 'h' || e.key === 'H') b = btn('hint');
  else if (e.key === '1') b = btn('yes');
  else if (e.key === '2') b = btn('no');
  if (b) { e.preventDefault(); b.click(); }
});

/* ---------- 결과 ---------- */
function medalFor(ratio) {
  if (ratio >= 0.9) return { cls: 'gold', name: '금메달', title: '발표 준비 끝!' };
  if (ratio >= 0.7) return { cls: 'silver', name: '은메달', title: '거의 다 외웠어요!' };
  if (ratio >= 0.4) return { cls: 'bronze', name: '동메달', title: '잘하고 있어요!' };
  return null;
}
async function finish() {
  stopAll();
  const items = run.items;
  const stars = items.reduce((a, x) => a + x.stars, 0);
  const max = items.length * STARS[opts.start];
  const ratio = max ? stars / max : 0;
  const score = Math.round(ratio * 100);
  const medal = medalFor(ratio);
  const p = ctx.getProgress();
  p.tests = p.tests || {};
  const key = run.pid || 'all';
  const before = p.tests[key];
  let gems = 0, gemNote = '', recordNote = '';
  if (run.full) {
    const today = todayStr();
    const already = before && before.gemDay === today;
    if (!already) { gems = Math.min(8, Math.ceil(stars / 3)); p.emeralds += gems; }
    else gemNote = ' 오늘은 이 영상 테스트 에메랄드를 이미 받았어요.';
    const isBest = !before || score > (before.best || 0);
    if (before && isBest) recordNote = ` 새 최고 기록! (전에는 ${before.best}점)`;
    p.tests[key] = {
      best: isBest ? score : before.best, bestStars: isBest ? stars : before.bestStars, max: isBest ? max : before.max,
      last: Date.now(), t: Date.now(), runs: ((before && before.runs) || 0) + 1,
      gemDay: already ? before.gemDay : (gems ? today : (before && before.gemDay) || ''),
      lastScore: score
    };
  }
  markToday(p);
  await saveProgress(p);

  $('#ptMedal').innerHTML = medal ? `<div class="pt-medal-${medal.cls}"><span>${medal.name}</span></div>` : '';
  $('#ptTitle').textContent = medal ? medal.title : '다시 도전해요!';
  $('#ptText').innerHTML = `${items.length}문장 · 별 <b>${stars}</b>/${max} · <b>${score}</b>점${run.full ? '' : ' (연습 판이라 기록에는 안 남아요)'}` +
    (gems ? ` · 에메랄드 <b>+${gems}</b>` : '') + (gemNote || recordNote ? '<br>' : '') + esc((gemNote + recordNote).trim());
  $('#ptList').innerHTML = items.map(x => {
    const how = x.ok === false ? (x.gaveUp ? '정답 봤어요' : '다시 연습') : HINT_NAMES[x.level];
    return `<li class="${x.ok ? 'ok' : 'miss'}">
      ${x.s.image ? `<img src="${blobURL(x.s.image)}" alt="">` : '<span class="noimg"></span>'}
      <div class="pt-li-text"><span lang="en">${esc(x.s.en)}</span><small>${esc(x.s.ko)}</small></div>
      <div class="pt-li-score">${drawStars(x.stars, STARS[opts.start])}<small>${how}</small></div></li>`;
  }).join('');
  const redo = items.filter(x => !x.ok || x.level > opts.start);
  $('#ptRetry').hidden = !redo.length;
  $('#ptRetry').textContent = `못한 문장만 다시 (${redo.length}개)`;
  run.redo = redo.map(x => x.s);
  showPart('result');
}
$('#ptRetry').addEventListener('click', () => { if (run && run.redo.length) begin(run.pid, run.redo, false); });
$('#ptAgain').addEventListener('click', () => openTest(ctx));
$('#ptHome').addEventListener('click', () => { stopAll(); ctx.onHome(); });
