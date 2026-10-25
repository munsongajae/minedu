// 단어 광산: 해가 지기 전 1분 동안, 간판의 한글 뜻(또는 들려준 영어)에 맞는 단어 블록을 세 번 두드려 캔다.
//   맞는 블록: 두드릴 때마다 금이 가고, 세 번째에 부서져서 광물이 아래 칸으로 날아간다.
//   틀린 블록: 흔들리고 그 단어의 뜻을 잠깐 보여 준다. 그 문제는 '틀림'으로 남는다.
//     벌칙(마구 누르기 막기, 사용자 요청 2026-10-25): 남은 시간 -3초(WRONG_TIME), 곡괭이가 튕겨 잠깐 못 두드림
//     (STUN, 연달아 틀릴수록 길게 — 단어를 캐면 처음으로), 맞는 블록에 낸 금이 다시 붙음.
//   한 문제에서 7초 동안 못 찾으면 맞는 블록이 반짝여서 알려 준다(이것도 '틀림').
// 블록 그림은 직접 만든 돌·광물 무늬(공식 텍스처 아님).
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';

const DUR = 60;          // 초
const HITS = 3;          // 캐는 데 두드리는 횟수
const SLOTS = 8;         // 벽의 블록 수(넓은 화면 4×2, 좁은 화면 2×4)
const HINT_AFTER = 7;    // 초
const WRONG_TIME = 3;    // 틀린 블록을 두드리면 줄어드는 시간(초)
const STUN = [1.2, 2, 3];   // 틀렸을 때 못 두드리는 시간(초): 첫 번째, 두 번째, 세 번째부터
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
    mined: 0, combo: 0, best: 0, missed: [], minedKeys: new Set(), items: Object.fromEntries(ORES.map(o => [o, 0])), lock: 0,
    wrongs: 0, wrongRow: 0
  };
  $('#mineWall').classList.remove('stun');
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
  clearTimeout(stunTimer);
  $('#mineWall').classList.remove('stun');
  $('#mineWall').querySelectorAll('.mine-stun').forEach(x => x.remove());
  const r = { mined: m.mined, best: m.best, missed: m.missed, items: m.items, wrongs: m.wrongs };
  setTimeout(() => { if (ctx) ctx.onEnd(r); }, 1600);
}

/* ---------- 벽 ---------- */
// 마인크래프트 블록 균열(destroy stages)을 실제 게임 16×16 픽셀 격자 그대로 구현한 픽셀 SVG
const CRACK = `<svg class="crack" viewBox="0 0 16 16" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">
  <g class="k1">
    <rect x="7" y="6" width="2" height="2" fill="rgba(15,12,8,0.85)"/>
    <rect x="6" y="8" width="1" height="2" fill="rgba(15,12,8,0.85)"/>
    <rect x="9" y="7" width="2" height="1" fill="rgba(15,12,8,0.85)"/>
    <rect x="8" y="5" width="1" height="1" fill="rgba(15,12,8,0.85)"/>
    <rect x="5" y="7" width="1" height="1" fill="rgba(15,12,8,0.85)"/>
    <rect x="10" y="8" width="1" height="2" fill="rgba(15,12,8,0.85)"/>
    <rect x="7" y="5" width="1" height="1" fill="rgba(255,255,255,0.25)"/>
    <rect x="9" y="6" width="1" height="1" fill="rgba(255,255,255,0.25)"/>
  </g>
  <g class="k2">
    <rect x="5" y="5" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="4" y="4" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="3" y="3" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="2" y="2" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="1" y="1" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="11" y="6" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="12" y="5" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="13" y="4" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="14" y="3" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="7" y="10" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="6" y="12" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="5" y="13" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="9" y="9" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="10" y="10" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="11" y="12" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
    <rect x="12" y="13" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="8" y="3" width="1" height="2" fill="rgba(15,12,8,0.88)"/>
    <rect x="7" y="1" width="2" height="1" fill="rgba(15,12,8,0.88)"/>
  </g>
  <g class="k3">
    <rect x="0" y="3" width="3" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="2" y="4" width="1" height="2" fill="rgba(10,8,5,0.92)"/>
    <rect x="0" y="9" width="3" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="1" y="10" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="2" y="11" width="1" height="2" fill="rgba(10,8,5,0.92)"/>
    <rect x="3" y="13" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="13" y="7" width="3" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="14" y="8" width="1" height="3" fill="rgba(10,8,5,0.92)"/>
    <rect x="13" y="11" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="14" y="12" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="10" y="1" width="2" height="2" fill="rgba(10,8,5,0.92)"/>
    <rect x="11" y="0" width="1" height="2" fill="rgba(10,8,5,0.92)"/>
    <rect x="3" y="7" width="2" height="2" fill="rgba(10,8,5,0.92)"/>
    <rect x="4" y="9" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="8" y="14" width="3" height="1" fill="rgba(10,8,5,0.92)"/>
    <rect x="9" y="15" width="2" height="1" fill="rgba(10,8,5,0.92)"/>
  </g>
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
    hitBits(b, c.ore);
    if (c.hits >= HITS) return breakBlock(i, b);
    sfx('hit');
    return;
  }
  // 틀린 블록: 벌칙
  sfx('bad');
  m.wrongs++;
  m.wrongRow++;
  const stun = STUN[Math.min(m.wrongRow, STUN.length) - 1];
  m.lock = performance.now() + stun * 1000;
  m.t = Math.min(DUR, m.t + WRONG_TIME);           // 해가 3초 빨리 진다
  m.targetAt += WRONG_TIME;                         // 힌트까지 걸리는 시간은 그대로
  penalty(stun);
  // 맞는 블록에 낸 금이 다시 붙는다
  const ti = m.wall.findIndex(x => x.w && x.w.key === m.target.key);
  if (ti >= 0 && m.wall[ti].hits && m.wall[ti].hits < HITS) {
    m.wall[ti].hits = 0;
    const te = blockEl(ti);
    if (te) te.classList.remove('h1', 'h2', 'h3', 'hit');
  }
  m.combo = 0; drawBar();
  if (!m.wrong) { m.wrong = true; m.missed.push(m.target); }
  b.classList.remove('bad'); void b.offsetWidth; b.classList.add('bad');
  b.querySelectorAll('.mine-tip').forEach(t => t.remove());
  b.insertAdjacentHTML('beforeend', `<span class="mine-tip" lang="ko">${esc(c.w.ko)}</span>`);
  const id = c.id;
  setTimeout(() => { const el = blockEl(i); if (el && el.dataset.id === String(id)) { el.classList.remove('bad'); el.querySelectorAll('.mine-tip').forEach(t => t.remove()); } }, 1200);
});

// 벌칙 보여 주기: 시간 옆에 '-3초', 벽 위에 '곡괭이가 튕겼어요!'(못 두드리는 동안 벽이 어두워짐)
let stunTimer = 0;
function penalty(stun) {
  const time = $('#mineTime');
  const pop = document.createElement('span');
  pop.className = 'mine-minus';
  pop.textContent = `-${WRONG_TIME}초`;
  time.parentElement.appendChild(pop);
  const tr = time.getBoundingClientRect(), pr = time.parentElement.getBoundingClientRect();
  pop.style.left = `${tr.left - pr.left + tr.width / 2}px`;
  pop.style.top = `${tr.bottom - pr.top}px`;
  setTimeout(() => pop.remove(), 1100);
  time.classList.remove('hurt'); void time.offsetWidth; time.classList.add('hurt');
  const wall = $('#mineWall');
  wall.classList.add('stun');
  wall.querySelectorAll('.mine-stun').forEach(x => x.remove());
  wall.insertAdjacentHTML('beforeend', `<div class="mine-stun" role="status">곡괭이가 튕겼어요! ${stun}초 쉬어요</div>`);
  clearTimeout(stunTimer);
  stunTimer = setTimeout(() => { wall.classList.remove('stun'); wall.querySelectorAll('.mine-stun').forEach(x => x.remove()); }, stun * 1000);
}

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
  m.wrongRow = 0;                 // 캐면 벌칙 길이가 처음으로
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

const ORE_PALETTES = {
  gold: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#ffd84a', '#f5b324', '#fff089', '#c4890e'] },
  diamond: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#4dedf4', '#2cb3b9', '#b8f9fc', '#15838c'] },
  emerald: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#17dd62', '#0fa848', '#74f59e', '#096e2e'] },
  ruby: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#ff3b30', '#c21807', '#ff857a', '#7d0c00'] },
  iron: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#d8af93', '#b59074', '#f2dfcc', '#8a6549'] },
  coal: { stone: ['#484848', '#646464', '#7d7d7d', '#909090'], gem: ['#222222', '#363636', '#484848', '#141414'] }
};
const getOreColors = (ore) => ORE_PALETTES[ore] || ORE_PALETTES.gold;

// 타격할 때마다 마인크래프트처럼 블록 표면에서 4~6개의 작은 픽셀 파편(돌/광물)이 튄다.
function hitBits(b, ore) {
  if (REDUCED) return;
  const wall = $('#mineWall').getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const cx = r.left - wall.left + r.width * (0.35 + Math.random() * 0.3);
  const cy = r.top - wall.top + r.height * (0.3 + Math.random() * 0.3);
  const colors = getOreColors(ore);
  for (let k = 0; k < 6; k++) {
    const el = document.createElement('i');
    el.className = 'mine-bit small';
    const color = (k % 2 === 0) ? colors.stone[Math.floor(Math.random() * colors.stone.length)]
                               : colors.gem[Math.floor(Math.random() * colors.gem.length)];
    el.style.backgroundColor = color;
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    $('#mineWall').appendChild(el);
    const angle = (Math.PI * 0.75) + Math.random() * Math.PI * 1.5;
    const speed = 25 + Math.random() * 45;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 15;
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 35}px)) scale(0.4)`, opacity: 0 }
    ], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' }).onfinish = () => el.remove();
  }
}

// 블록이 산산조각 날 때 28개의 3D 큐브 느낌 픽셀 파편이 중력 가속도를 받으며 포물선으로 튀어 떨어진다.
function bits(b, ore) {
  if (REDUCED) return;
  const wall = $('#mineWall').getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const cx = r.left - wall.left + r.width / 2;
  const cy = r.top - wall.top + r.height / 2;
  const colors = getOreColors(ore);
  const COUNT = 28;

  for (let k = 0; k < COUNT; k++) {
    const el = document.createElement('i');
    const isBig = k % 5 === 0;
    const isSmall = k % 3 === 0;
    el.className = `mine-bit ${isBig ? 'large' : (isSmall ? 'small' : '')}`;
    const isGem = Math.random() < 0.42;
    const palette = isGem ? colors.gem : colors.stone;
    el.style.backgroundColor = palette[Math.floor(Math.random() * palette.length)];

    const startX = cx + (Math.random() - 0.5) * (r.width * 0.7);
    const startY = cy + (Math.random() - 0.5) * (r.height * 0.7);
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    $('#mineWall').appendChild(el);

    const angle = (Math.random() - 0.5) * Math.PI * 1.6;
    const speed = 40 + Math.random() * 80;
    const vx = Math.sin(angle) * speed;
    const vy = - (50 + Math.random() * 95);
    const rot = (Math.random() - 0.5) * 360;

    const midX = vx * 0.4;
    const midY = vy * 0.4 + 18;
    const endX = vx * 0.95;
    const endY = vy * 0.95 + 160 + Math.random() * 60;

    el.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${midX}px), calc(-50% + ${midY}px)) rotate(${rot * 0.5}deg) scale(0.95)`, opacity: 1, offset: 0.38 },
      { transform: `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) rotate(${rot}deg) scale(0.3)`, opacity: 0 }
    ], { duration: 620 + Math.random() * 140, easing: 'cubic-bezier(0.18, 0.8, 0.4, 1)' }).onfinish = () => el.remove();
  }
}

// 캔 광물이 마인크래프트 아이템 드롭처럼 제자리에서 톡 튀어오른 뒤 자석처럼 핫바로 날아간다.
function flyItem(b, ore) {
  const slot = $('#mineHot').querySelector(`[data-ore="${ore}"]`);
  const done = () => {
    if (!slot || !m) return;
    slot.classList.remove('empty', 'pop'); void slot.offsetWidth; slot.classList.add('pop');
    slot.querySelector('b').textContent = m.items[ore];
    sfx('ding');
    // +1 픽셀 플로팅 이펙트
    const plus = document.createElement('span');
    plus.className = 'mine-plus-one';
    plus.textContent = '+1';
    slot.appendChild(plus);
    setTimeout(() => plus.remove(), 750);
  };
  if (REDUCED || !slot) return done();

  const r = b.getBoundingClientRect(), s = slot.getBoundingClientRect();
  const el = document.createElement('i');
  el.className = `ore-ico mine-fly ore-${ore}`;
  el.style.left = `${r.left + r.width / 2 - 16}px`;
  el.style.top = `${r.top + r.height / 2 - 16}px`;
  document.body.appendChild(el);

  const dx = s.left + s.width / 2 - (r.left + r.width / 2);
  const dy = s.top + s.height / 2 - (r.top + r.height / 2);

  el.animate([
    { transform: 'translate(0, 0) scale(0.6) rotate(-15deg)', opacity: 0.8 },
    { transform: 'translate(0, -26px) scale(1.35) rotate(10deg)', opacity: 1, offset: 0.22 },
    { transform: 'translate(0, -20px) scale(1.25) rotate(-5deg)', opacity: 1, offset: 0.38 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.4 - 30}px) scale(1.1) rotate(15deg)`, offset: 0.68 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.65) rotate(0deg)`, opacity: 0.9 }
  ], { duration: 680, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }).onfinish = () => { el.remove(); done(); };
}

$('#mineSay').addEventListener('click', () => { if (m && !m.over) ctx.say(m.target.en); });
