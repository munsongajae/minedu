// 단어 광산: 해가 지기 전 1분 동안, 간판의 한글 뜻(또는 들려준 영어)에 맞는 단어 블록을 세 번 두드려 캔다.
//   맞는 블록: 두드릴 때마다 금이 가고, 세 번째에 부서져서 광물이 아래 칸으로 날아간다.
//   틀린 블록: 흔들리고 그 단어의 뜻을 잠깐 보여 준다(0.5초 쉼). 그 문제는 '틀림'으로 남는다.
//   한 문제에서 7초 동안 못 찾으면 맞는 블록이 반짝여서 알려 준다(이것도 '틀림').
// 블록 그림은 직접 만든 돌·광물 무늬(공식 텍스처 아님).
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';

const DUR = 60;          // 초
const HITS = 3;          // 캐는 데 두드리는 횟수
const SLOTS = 8;         // 벽의 블록 수(넓은 화면 4×2, 좁은 화면 2×4)
const HINT_AFTER = 7;    // 초
export const ORES = ['gold', 'diamond', 'emerald', 'ruby', 'iron', 'coal'];
const ORE_NAMES = { gold: '금', diamond: '다이아몬드', emerald: '에메랄드', ruby: '루비', iron: '철', coal: '석탄' };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let m = null;            // 지금 게임
let ctx = null;          // words.js가 넘겨주는 것: words, pickWords, recordWord, say, onEnd
let raf = 0, seq = 0;

/* ---------- 시작·끝 ---------- */
export function startMine(c, mode) {
  ctx = c;
  stopMine();
  const order = c.pickWords(c.words.length);          // 잘 모르는 단어가 앞에
  const rank = new Map(order.map((w, i) => [w.key, i]));
  m = {
    mode, order, rank, t: 0, last: 0, over: false,
    wall: [], target: null, targetAt: 0, wrong: false, hinted: false, justMined: null,
    mined: 0, combo: 0, best: 0, missed: [], minedKeys: new Set(), items: Object.fromEntries(ORES.map(o => [o, 0])), lock: 0
  };
  const first = shuffle(order.slice(0, SLOTS));
  for (let i = 0; i < SLOTS; i++) m.wall.push(cell(first[i] || null));
  $('#mineAsk').textContent = mode === 'listen' ? '들리는 영어 단어를 캐요' : '이 뜻의 영어 단어를 캐요';
  $('#mineSay').hidden = mode !== 'listen';
  $('#mineWord').hidden = mode === 'listen';
  $('#mineOver').hidden = true;
  $('#mineHot').innerHTML = ORES.map(o => `<li class="empty" data-ore="${o}"><i class="ore-ico ore-${o}"></i><b>0</b><span class="sr">${ORE_NAMES[o]}</span></li>`).join('');
  drawWall();
  drawBar();
  nextTarget();
  raf = requestAnimationFrame(tick);
}

export function stopMine() {
  cancelAnimationFrame(raf);
  if (m) m.over = true;
  document.querySelectorAll('.mine-fly').forEach(el => el.remove());
}

function cell(w) { return { id: ++seq, w, ore: ORES[Math.floor(Math.random() * ORES.length)], hits: 0 }; }

/* ---------- 시간(해가 지는 하늘) ---------- */
function tick(now) {
  if (!m || m.over) return;
  const dt = m.last ? Math.min(0.1, (now - m.last) / 1000) : 0;   // 화면을 떠나 있던 시간은 세지 않는다
  m.last = now;
  m.t += dt;
  drawSky();
  if (!m.hinted && m.t - m.targetAt > HINT_AFTER) showHint();
  if (m.t >= DUR) return timeUp();
  raf = requestAnimationFrame(tick);
}
let shownSec = -1;
function drawSky() {
  const p = Math.min(1, m.t / DUR);
  const sky = $('#mineSky');
  sky.style.setProperty('--t', p.toFixed(3));
  const sun = $('#mineSun');
  sun.style.left = `${8 + p * 84}%`;
  sun.style.top = `${78 - Math.sin(Math.PI * Math.min(1, p * 0.92 + 0.04)) * 58}%`;
  const left = Math.max(0, Math.ceil(DUR - m.t));
  if (left !== shownSec) {
    shownSec = left;
    $('#mineTime').textContent = left;
    $('#mineTime').classList.toggle('low', left <= 10);
  }
}
function timeUp() {
  m.over = true;
  shownSec = -1;
  $('#mineTime').textContent = '0';
  document.querySelectorAll('.mine-block').forEach(b => { b.disabled = true; b.classList.remove('hint'); });
  $('#mineOver').hidden = false;
  sfx('end');
  if (m.wrong) ctx.recordWord(m.target, false);   // 힌트를 보고도 못 캔 단어
  const r = { mined: m.mined, best: m.best, missed: m.missed, items: m.items };
  setTimeout(() => { if (ctx) ctx.onEnd(r); }, 1600);
}

/* ---------- 벽 ---------- */
const CRACK = `<svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <g class="k1"><polyline points="62,0 58,14 66,22 60,34"/><polyline points="0,70 12,66 18,74"/></g>
  <g class="k2"><polyline points="60,34 48,42 52,54 40,62"/><polyline points="100,40 88,46 84,58 90,66"/><polyline points="18,74 26,86 22,100"/></g>
  <g class="k3"><polyline points="40,62 30,58 18,64 8,56"/><polyline points="52,54 66,62 74,78 70,92"/><polyline points="84,58 72,52 66,40"/><polyline points="30,0 34,12 26,22"/></g>
</svg>`;
function cellHTML(c, i) {
  if (!c.w) return `<div class="mine-block stone" data-i="${i}" aria-hidden="true"></div>`;
  return `<button type="button" class="mine-block ore-${c.ore} ${c.hits ? 'h' + c.hits : ''}" data-i="${i}" data-id="${c.id}" lang="en">
    ${CRACK}<span class="plate">${esc(c.w.en)}</span></button>`;
}
function drawWall() { $('#mineWall').innerHTML = m.wall.map(cellHTML).join(''); }
function blockEl(i) { return $('#mineWall').querySelector(`[data-i="${i}"]`); }
function drawBar() {
  $('#mineCount').textContent = `캔 단어 ${m.mined}개`;
  const cb = $('#mineCombo');
  cb.hidden = m.combo < 2;
  if (m.combo >= 2) { cb.textContent = `${m.combo}연속!`; cb.classList.remove('pop'); void cb.offsetWidth; cb.classList.add('pop'); }
}

// 다음 문제: 벽에 있는 단어 중에서, 이번 판에 아직 안 캔 것·잘 모르는 것 먼저(방금 캔 단어는 빼고).
function nextTarget() {
  let cand = m.wall.filter(c => c.w && c.w.key !== m.justMined);
  if (!cand.length) cand = m.wall.filter(c => c.w);
  const score = (c) => (m.minedKeys.has(c.w.key) ? 100 : 0) + m.rank.get(c.w.key) + Math.random() * 3;
  const pick = cand.sort((a, b) => score(a) - score(b))[0];
  m.target = pick.w;
  m.targetAt = m.t;
  m.wrong = false;
  m.hinted = false;
  const sign = $('#mineSign');
  $('#mineWord').textContent = m.target.ko;
  sign.classList.remove('pop'); void sign.offsetWidth; sign.classList.add('pop');
  if (m.mode === 'listen') ctx.say(m.target.en);
}

// 빈 자리 채우기: 벽에 없는 단어 중에서(이번 판에 안 캔 것 먼저). 다 벽에 있으면 방금 캔 단어를 다시 넣는다.
function refill(i, minedWord) {
  const onWall = new Set(m.wall.filter(c => c.w).map(c => c.w.key));
  const pool = m.order.filter(w => !onWall.has(w.key) && w.key !== minedWord.key);
  const fresh = pool.filter(w => !m.minedKeys.has(w.key));
  const w = (fresh.length ? fresh : pool)[0] || minedWord;
  m.wall[i] = cell(w);
}

function showHint() {
  m.hinted = true;
  if (!m.wrong) { m.wrong = true; m.missed.push(m.target); }
  m.combo = 0; drawBar();
  const i = m.wall.findIndex(c => c.w && c.w.key === m.target.key);
  const el = blockEl(i);
  if (el) el.classList.add('hint');
}

/* ---------- 두드리기 ---------- */
$('#mineWall').addEventListener('click', (e) => {
  const b = e.target.closest('.mine-block');
  if (!b || !m || m.over) return;
  const i = Number(b.dataset.i);
  const c = m.wall[i];
  if (!c.w) { sfx('tink'); return; }
  if (c.hits >= HITS || performance.now() < m.lock) return;
  swing(b);
  if (c.w.key === m.target.key) {
    c.hits++;
    b.classList.remove('h1', 'h2', 'h3', 'hit'); void b.offsetWidth;
    b.classList.add('h' + c.hits, 'hit');
    if (c.hits >= HITS) return breakBlock(i, b);
    sfx('hit');
    return;
  }
  // 틀린 블록
  sfx('bad');
  m.lock = performance.now() + 500;
  m.combo = 0; drawBar();
  if (!m.wrong) { m.wrong = true; m.missed.push(m.target); }
  b.classList.remove('bad'); void b.offsetWidth; b.classList.add('bad');
  b.querySelectorAll('.mine-tip').forEach(t => t.remove());
  b.insertAdjacentHTML('beforeend', `<span class="mine-tip" lang="ko">${esc(c.w.ko)}</span>`);
  const id = c.id;
  setTimeout(() => { const el = blockEl(i); if (el && el.dataset.id === String(id)) { el.classList.remove('bad'); el.querySelectorAll('.mine-tip').forEach(t => t.remove()); } }, 1200);
});

function swing(b) {
  const pick = $('#minePick');
  const field = $('.mine-field').getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const size = pick.offsetWidth || 84;
  pick.style.left = `${r.right - field.left - size * 0.75}px`;
  pick.style.top = `${r.top - field.top - size * 0.3}px`;
  pick.classList.remove('swing'); void pick.offsetWidth; pick.classList.add('swing');
}

function breakBlock(i, b) {
  const c = m.wall[i];
  const w = c.w;
  sfx('break');
  ctx.recordWord(w, !m.wrong);
  m.mined++; m.combo++; m.best = Math.max(m.best, m.combo);
  m.minedKeys.add(w.key);
  m.justMined = w.key;
  m.items[c.ore]++;
  drawBar();
  if (m.mode !== 'listen') ctx.say(w.en);
  bits(b, c.ore);
  flyItem(b, c.ore);
  b.classList.add('broken');
  b.disabled = true;
  refill(i, w);
  setTimeout(() => {
    if (!m || m.over) return;
    const el = blockEl(i);
    if (!el) return;
    el.outerHTML = cellHTML(m.wall[i], i);
    const nb = blockEl(i);
    if (nb) nb.classList.add('fresh');
  }, REDUCED ? 80 : 320);
  nextTarget();
}

// 부서질 때 돌·광물 조각이 튄다.
function bits(b, ore) {
  if (REDUCED) return;
  const wall = $('#mineWall').getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const cx = r.left - wall.left + r.width / 2, cy = r.top - wall.top + r.height / 2;
  for (let k = 0; k < 14; k++) {
    const el = document.createElement('i');
    el.className = `mine-bit ${k % 3 === 0 ? 'ore-' + ore : ''}`;
    el.style.left = `${cx}px`; el.style.top = `${cy}px`;
    $('#mineWall').appendChild(el);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 30;
    el.animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random() * 180}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 60}px)) rotate(200deg)`, opacity: 0 }
    ], { duration: 560, easing: 'ease-out' }).onfinish = () => el.remove();
  }
}

// 캔 광물이 아래 칸으로 날아간다.
function flyItem(b, ore) {
  const slot = $('#mineHot').querySelector(`[data-ore="${ore}"]`);
  const done = () => {
    if (!slot || !m) return;
    slot.classList.remove('empty', 'pop'); void slot.offsetWidth; slot.classList.add('pop');
    slot.querySelector('b').textContent = m.items[ore];
  };
  if (REDUCED || !slot) return done();
  const r = b.getBoundingClientRect(), s = slot.getBoundingClientRect();
  const el = document.createElement('i');
  el.className = `ore-ico mine-fly ore-${ore}`;
  el.style.left = `${r.left + r.width / 2 - 15}px`; el.style.top = `${r.top + r.height / 2 - 15}px`;
  document.body.appendChild(el);
  const dx = s.left + s.width / 2 - (r.left + r.width / 2), dy = s.top + s.height / 2 - (r.top + r.height / 2);
  el.animate([
    { transform: 'translate(0,0) scale(1.3)' },
    { transform: `translate(${dx * 0.35}px, ${Math.min(dy, 0) - 50}px) scale(1.15)`, offset: 0.35 },
    { transform: `translate(${dx}px, ${dy}px) scale(.8)` }
  ], { duration: 650, easing: 'ease-in' }).onfinish = () => { el.remove(); done(); };
}

$('#mineSay').addEventListener('click', () => { if (m && !m.over) ctx.say(m.target.en); });
