// 광산 수레 달리기: 수레가 선로 3줄 중 하나를 달린다. 앞에서 갈림길이 다가오면 줄마다 영어 단어 간판이 있다.
// 간판(위)의 한글 뜻(또는 들려준 영어)에 맞는 줄로 수레를 옮겨 두면 통과하며 보석을 싣는다.
//   - 줄 옮기기: 아래 단어 버튼, 선로를 직접 누르기, PC는 1·2·3 / ↑·↓.
//   - 틀린 줄이면 돌 블록에 부딪혀 하트 -1(3개), 그 단어는 '틀림'. 하트가 다 없어지면 끝.
//   - 갈림길 12개를 지나면 도착. 맞힐수록 조금씩 빨라진다(천천히·보통·빨리에 따라 시작 빠르기가 다름).
//   - 줄을 골랐으면 '출발!'(PC는 Space·Enter)로 갈림길을 바로 당겨 올 수 있다. 끝나면 걸린 시간을 보여 준다.
// 수레·선로·갱도 그림은 직접 만든 일반 그림.
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';
import { HEART } from './night.js';

const TOTAL = 12, HEARTS = 3, LANES = 3;
// 갈림길이 나타나서 수레에 닿기까지 걸리는 초: 처음, 가장 빠를 때. 맞히면 STEP만큼 줄고 틀리면 늘어난다.
const SPEEDS = { slow: { start: 6.0, min: 4.2 }, normal: { start: 4.6, min: 3.0 }, fast: { start: 3.4, min: 2.2 } };
const T_STEP = 0.2, DASH = 4, GAP = 0.45;           // DASH: '출발!'을 누르면 몇 배 빨리, GAP: 다음 갈림길까지 쉬는 초
const LANE_Y = [0.24, 0.53, 0.82];                 // 줄 가운데 높이(선로 칸 높이 비율)
const LANE_CLS = ['l0', 'l1', 'l2'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let c = null, ctx = null, raf = 0;

// 수레(20×14, 위로 보석이 쌓일 자리 4칸)
const CART = (() => {
  const r = (x, y, w, h = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const gems = [[3, -2, 'g'], [6, -3, 'd'], [9, -2, 'g'], [12, -3, 'o'], [15, -2, 'd'], [5, -1, 'o'], [10, -1, 'd'], [14, -1, 'g']];
  return `<svg class="cart-svg" viewBox="0 -4 20 18" shape-rendering="crispEdges" aria-hidden="true">
    <g class="load">${gems.map(([x, y, k], i) => `<rect class="gem ${k}" data-n="${i}" x="${x}" y="${y}" width="3" height="${-y + 1}"/>`).join('')}</g>
    <g class="rim">${r(0, 0, 20, 2)}</g>
    <g class="body">${r(1, 2, 18)}${r(1, 3, 18)}${r(2, 4, 16)}${r(2, 5, 16)}${r(2, 6, 16)}${r(3, 7, 14)}${r(3, 8, 14)}${r(3, 9, 14)}</g>
    <g class="shade">${r(3, 8, 14)}${r(3, 9, 14)}${r(16, 2, 2, 6)}</g>
    <g class="band">${r(6, 2, 1, 8)}${r(13, 2, 1, 8)}</g>
    <g class="wheel">${r(3, 10, 4, 4)}${r(13, 10, 4, 4)}</g>
    <g class="hub">${r(4, 11, 2, 2)}${r(14, 11, 2, 2)}</g></svg>`;
})();

/* ---------- 시작·끝 ---------- */
export function startCart(cx, mode, speed = 'normal') {
  ctx = cx;
  stopCart();
  const order = cx.pickWords(cx.words.length);
  const sp = SPEEDS[speed] || SPEEDS.normal;
  c = {
    mode, sp, order, oi: 0, t: 0, last: 0, over: false, scroll: 0, dash: false,
    lane: 1, gate: null, nextAt: 0.6, passed: 0, right: 0, hearts: HEARTS, T: sp.start,
    missed: [], combo: 0, best: 0
  };
  const field = $('#cartField');
  field.querySelectorAll('.cart-gate, .cart-fly, .cart-block').forEach(el => el.remove());
  field.classList.remove('crash');
  $('#cartOver').hidden = true;
  $('#cartFb').textContent = '';
  $('#cartAsk').textContent = mode === 'listen' ? '들리는 단어 쪽으로 가요' : '이 뜻의 영어 단어 쪽으로 가요';
  $('#cartWord').hidden = mode === 'listen';
  $('#cartWord').textContent = '';
  $('#cartSay').hidden = mode !== 'listen';
  $('#cartPick').innerHTML = '';
  $('#cartMe').innerHTML = CART;
  drawBar();
  drawCart();
  raf = requestAnimationFrame(tick);
}
export function stopCart() {
  cancelAnimationFrame(raf);
  if (c) c.over = true;
}

/* ---------- 그리기 ---------- */
function drawBar() {
  $('#cartHearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < c.hearts ? '' : 'lost'}">${HEART}</i>`).join('');
  $('#cartHearts').setAttribute('aria-label', `하트 ${c.hearts}개`);
  $('#cartCount').textContent = `갈림길 ${Math.min(c.passed + (c.gate && !c.gate.done ? 1 : 0), TOTAL)} / ${TOTAL}`;
  $('#cartTrip').style.setProperty('--p', (c.passed / TOTAL).toFixed(3));
  // 실은 보석 수만큼 수레 위에 보석이 쌓인다(최대 8칸)
  document.querySelectorAll('#cartMe .gem').forEach(g => g.classList.toggle('on', Number(g.dataset.n) < c.right));
}
function laneY(l) { return $('#cartTrack').clientHeight * LANE_Y[l]; }
function drawCart() {
  const me = $('#cartMe');
  me.style.setProperty('--y', `${laneY(c.lane)}px`);
  document.querySelectorAll('#cartPick button').forEach(b => b.classList.toggle('on', Number(b.dataset.lane) === c.lane));
}

function cartFront() {
  const me = $('#cartMe');
  return me.offsetLeft + me.offsetWidth * 0.85;
}

/* ---------- 갈림길 ---------- */
function nextTarget() {
  for (let k = 0; k < c.order.length; k++) {
    const w = c.order[(c.oi + k) % c.order.length];
    if (!c.gate || w.key !== c.gate.target.key) { c.oi = (c.oi + k + 1) % c.order.length; return w; }
  }
  return c.order[0];
}
function distractors(t) {
  const others = shuffle(c.order.filter(w => w.key !== t.key && w.en.toLowerCase() !== t.en.toLowerCase()));
  others.sort((a, b) => Math.abs(a.en.length - t.en.length) - Math.abs(b.en.length - t.en.length));
  const out = [];
  for (const w of others) { if (!out.some(o => o.en.toLowerCase() === w.en.toLowerCase())) out.push(w); if (out.length === 2) break; }
  return out;
}
function spawnGate() {
  const target = nextTarget();
  const words = shuffle([target, ...distractors(target)]);
  while (words.length < LANES) words.push(null);
  const answer = words.findIndex(w => w && w.key === target.key);
  const track = $('#cartTrack');
  const el = document.createElement('div');
  el.className = 'cart-gate';
  el.innerHTML = words.map((w, l) => `<div class="cart-sign ${LANE_CLS[l]}" style="top:${(LANE_Y[l] * 100).toFixed(1)}%">
      ${w ? `<span class="post"></span><b lang="en">${esc(w.en)}</b>` : '<span class="cart-block-sign"></span>'}</div>`).join('');
  track.appendChild(el);
  c.gate = { target, words, answer, el, x: track.clientWidth + 30, done: false };
  $('#cartWord').textContent = target.ko;
  const sign = $('#cartSign');
  sign.classList.remove('pop'); void sign.offsetWidth; sign.classList.add('pop');
  $('#cartPick').innerHTML = words.map((w, l) => `<button type="button" class="cart-btn ${LANE_CLS[l]} ${l === c.lane ? 'on' : ''}" data-lane="${l}" ${w ? '' : 'disabled'} ${w ? 'lang="en"' : ''}>
      <span class="key" aria-hidden="true">${l + 1}</span><span class="lbl">${w ? esc(w.en) : '막힌 길'}</span></button>`).join('') +
    `<button type="button" class="cart-dash" data-dash><span class="key" aria-hidden="true">Space</span>출발!</button>`;
  c.dash = false;
  $('#cartField').classList.remove('dash');
  if (c.mode === 'listen') ctx.say(target.en);
  placeGate();
  drawBar();
}
function placeGate() {
  if (c.gate) c.gate.el.style.transform = `translateX(${c.gate.x.toFixed(1)}px)`;
}

/* ---------- 시간 ---------- */
function tick(now) {
  if (!c || c.over) return;
  const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;     // 화면을 떠나 있던 시간은 세지 않는다
  c.last = now;
  c.t += dt;
  const track = $('#cartTrack');
  const W = track.clientWidth;
  const fast = c.dash && c.gate && !c.gate.done ? DASH : 1;
  const v = (W + 30 - cartFront()) / c.T * fast;                    // 화면이 흘러가는 빠르기(px/초)
  c.scroll += v * dt;
  track.style.setProperty('--s', c.scroll.toFixed(1));
  if (!c.gate && c.passed < TOTAL && c.t >= c.nextAt) spawnGate();
  const g = c.gate;
  if (g && !g.done) {
    g.x -= v * dt;
    placeGate();
    if (g.x <= cartFront()) resolve();
  } else if (g && g.done) {
    g.x -= v * dt;                     // 지나간 간판은 계속 흘러간다
    placeGate();
  }
  if (!c.over) raf = requestAnimationFrame(tick);
}

function setLane(l) {
  if (!c || c.over || l < 0 || l >= LANES || l === c.lane) return;
  if (c.gate && !c.gate.done && !c.gate.words[l]) return;
  c.lane = l;
  sfx('switch');
  const me = $('#cartMe');
  me.classList.remove('hop'); void me.offsetWidth; me.classList.add('hop');
  drawCart();
}

// '출발!': 줄을 골랐으면 갈림길을 바로 당겨 온다.
function dash() {
  if (!c || c.over || !c.gate || c.gate.done || c.dash) return;
  c.dash = true;
  sfx('switch');
  $('#cartField').classList.add('dash');
  const b = $('#cartPick [data-dash]');
  if (b) b.disabled = true;
}

function resolve() {
  const g = c.gate;
  g.done = true;
  c.dash = false;
  $('#cartField').classList.remove('dash');
  c.passed++;
  const ok = c.lane === g.answer;
  const t = g.target;
  const signs = g.el.querySelectorAll('.cart-sign');
  signs.forEach((s, l) => s.classList.add(l === g.answer ? 'right' : 'dim'));
  document.querySelectorAll('#cartPick button').forEach(b => { b.disabled = true; b.classList.toggle('right', Number(b.dataset.lane) === g.answer); });
  if (ok) {
    c.right++; c.combo++; c.best = Math.max(c.best, c.combo);
    c.T = Math.max(c.sp.min, c.T - T_STEP);
    sfx('ding');
    ctx.recordWord(t, true);
    if (c.mode !== 'listen') ctx.say(t.en);
    flyGem(signs[g.answer]);
    $('#cartFb').innerHTML = `<b lang="en">${esc(t.en)}</b> = ${esc(t.ko)}${c.combo >= 3 ? ` · ${c.combo}연속!` : ''}`;
  } else {
    c.hearts--; c.combo = 0;
    c.T = Math.min(c.sp.start, c.T + T_STEP);
    sfx('crash');
    ctx.recordWord(t, false);
    c.missed.push(t);
    const f = $('#cartField');
    f.classList.remove('crash'); void f.offsetWidth; f.classList.add('crash');
    const blk = document.createElement('i');
    blk.className = 'cart-block';
    signs[c.lane].appendChild(blk);
    $('#cartFb').innerHTML = `쿵! 정답은 <b lang="en">${esc(t.en)}</b> = ${esc(t.ko)}`;
  }
  drawBar();
  if (c.hearts <= 0) return finish(false);
  const old = g.el;
  setTimeout(() => old.classList.add('gone'), 500);
  setTimeout(() => old.remove(), 1000);
  setTimeout(() => {
    if (!c || c.over) return;
    if (c.gate === g) c.gate = null;
    if (c.passed >= TOTAL) return finish(true);
    c.nextAt = c.t + GAP;
  }, 650);
}

function flyGem(sign) {
  if (REDUCED || !sign) return;
  const field = $('#cartField').getBoundingClientRect();
  const s = sign.querySelector('b').getBoundingClientRect();
  const m = $('#cartMe').getBoundingClientRect();
  const el = document.createElement('i');
  el.className = 'cart-fly';
  el.style.left = `${s.left - field.left + s.width / 2 - 10}px`;
  el.style.top = `${s.top - field.top}px`;
  $('#cartField').appendChild(el);
  const dx = m.left + m.width / 2 - (s.left + s.width / 2), dy = m.top - s.top - 6;
  el.animate([
    { transform: 'translate(0,0) scale(1)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 50}px) scale(1.3)`, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.9 }
  ], { duration: 600, easing: 'ease-in' }).onfinish = () => el.remove();
}

function finish(win) {
  c.over = true;
  cancelAnimationFrame(raf);
  document.querySelectorAll('#cartPick button').forEach(b => { b.disabled = true; });
  const over = $('#cartOver');
  over.querySelector('p').textContent = win ? '도착했어요!' : '수레가 멈췄어요!';
  over.hidden = false;
  sfx(win ? 'win' : 'end');
  const r = { win, right: c.right, hearts: c.hearts, best: c.best, missed: c.missed, total: TOTAL, sec: Math.round(c.t) };
  setTimeout(() => { if (ctx) ctx.onEnd(r); }, 1700);
}

/* ---------- 누르기 ---------- */
$('#cartPick').addEventListener('click', (e) => {
  if (e.target.closest('[data-dash]')) return dash();
  const b = e.target.closest('[data-lane]');
  if (b && !b.disabled) setLane(Number(b.dataset.lane));
});
$('#cartTrack').addEventListener('pointerdown', (e) => {
  if (!c || c.over) return;
  const r = $('#cartTrack').getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  const l = LANE_Y.map((ly, i) => [Math.abs(ly - y), i]).sort((a, b) => a[0] - b[0])[0][1];
  setLane(l);
});
$('#cartSay').addEventListener('click', () => { if (c && c.gate && !c.over) ctx.say(c.gate.target.en); });
document.addEventListener('keydown', (e) => {
  if ($('#cart').hidden || !c || c.over || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 3) { setLane(k - 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { setLane(c.lane - 1); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { setLane(c.lane + 1); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { dash(); e.preventDefault(); }
});
addEventListener('resize', () => { if (c && !c.over) drawCart(); });
