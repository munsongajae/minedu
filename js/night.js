// 밤을 지켜라: 한글 뜻을 든 그림자 유령이 왼쪽에서 집으로 걸어온다.
// 아래 영어 단어 블록 4개 중 맞는 것을 누르면 집 창문에서 화살이 날아가 그 유령을 물리친다.
//   - 보기 4개에는 지금 걸어오는 유령(최대 3마리)의 답이 늘 들어 있다.
//   - 틀린 단어를 누르면 그 단어의 뜻을 보여 주고 0.6초 쉰다.
//   - 유령이 집에 닿으면 하트 1개가 깎이고, 그 단어는 '틀림'으로 남는다. 하트 3개가 다 없어지면 끝.
//   - 유령 12마리를 다 막으면 아침이 온다. 뒤로 갈수록 조금씩 빨라진다.
// 유령·집·하트 그림은 직접 만든 픽셀 그림(게임 캐릭터 아님).
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';

const TOTAL = 12, HEARTS = 3, MAX_ALIVE = 3, LANES = 3;
const SPEEDS = {                       // walk: 왼쪽 끝에서 집까지 걸리는 초, gap: 다음 유령이 나오는 간격
  slow: { walk: 17, gap: 4.6 },
  normal: { walk: 13, gap: 3.6 },
  fast: { walk: 10, gap: 2.8 }
};
const MATERIALS = ['grass', 'sky', 'gold', 'dirt'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let n = null, ctx = null, raf = 0, seq = 0;

// 픽셀 유령(12×12). 몸, 오른쪽 그늘, 눈, 입
const GHOST = (() => {
  const body = [[4, 0, 4], [2, 1, 8], [1, 2, 10], ...[3, 4, 5, 6, 7, 8, 9].map(y => [0, y, 12]), [0, 10, 3], [4, 10, 4], [9, 10, 3], [0, 11, 2], [5, 11, 2], [10, 11, 2]];
  const shade = [[10, 3, 2, 7], [9, 2, 1, 1]];
  const r = (x, y, w, h = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return `<svg class="ng-ghost" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <g class="b">${body.map(([x, y, w]) => r(x, y, w)).join('')}</g>
    <g class="s">${shade.map(([x, y, w, h]) => r(x, y, w, h)).join('')}</g>
    <g class="e">${r(3, 4, 2, 2)}${r(7, 4, 2, 2)}</g>
    <g class="m">${r(4, 5, 1)}${r(8, 5, 1)}${r(5, 7, 2)}</g></svg>`;
})();
export const HOUSE = `<svg class="ng-house-svg" viewBox="0 0 16 15" shape-rendering="crispEdges" aria-hidden="true">
  <g class="roof"><rect x="7" y="0" width="2" height="1"/><rect x="5" y="1" width="6" height="1"/><rect x="3" y="2" width="10" height="1"/><rect x="1" y="3" width="14" height="1"/><rect x="0" y="4" width="16" height="1"/></g>
  <g class="wall"><rect x="1" y="5" width="14" height="10"/></g>
  <g class="plank"><rect x="1" y="8" width="14" height="1"/><rect x="1" y="11" width="14" height="1"/></g>
  <g class="door"><rect x="9" y="9" width="4" height="6"/></g>
  <g class="win"><rect x="3" y="6" width="4" height="4"/></g>
  <g class="frame"><rect x="4" y="6" width="1" height="4"/><rect x="3" y="7" width="4" height="1"/></g></svg>`;
const HEART = `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/></svg>`;

/* ---------- 시작·끝 ---------- */
export function startNight(c, speed) {
  ctx = c;
  stopNight();
  const order = c.pickWords(c.words.length);
  n = {
    speed: SPEEDS[speed] ? speed : 'normal', order, oi: 0, t: 0, last: 0, over: false,
    mobs: [], spawned: 0, killed: 0, reached: 0, hearts: HEARTS, nextSpawn: 1.2,
    opts: [], lock: 0, missed: [], combo: 0, best: 0
  };
  $('#ngField').querySelectorAll('.ng-mob, .ng-arrow, .ng-bit').forEach(el => el.remove());
  $('#ngOver').hidden = true;
  $('#ngField').classList.remove('dawn', 'hurt');
  $('#ngFb').textContent = '';
  n.opts = shuffle(order.slice(0, 4));
  drawOpts();
  drawBar();
  raf = requestAnimationFrame(tick);
}
export function stopNight() {
  cancelAnimationFrame(raf);
  if (n) n.over = true;
}

/* ---------- 그리기 ---------- */
function drawBar() {
  $('#ngHearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < n.hearts ? '' : 'lost'}">${HEART}</i>`).join('');
  $('#ngHearts').setAttribute('aria-label', `하트 ${n.hearts}개`);
  $('#ngCount').textContent = `물리친 유령 ${n.killed} / ${TOTAL}`;
  const done = (n.killed + n.reached) / TOTAL;
  $('#ngField').style.setProperty('--p', done.toFixed(3));
}
function drawOpts() {
  $('#ngOpts').innerHTML = n.opts.map((w, k) =>
    `<button type="button" class="wg-opt ng-opt ${MATERIALS[k]}" data-k="${k}" lang="en"><span class="key" aria-hidden="true">${k + 1}</span><span class="lbl">${esc(w.en)}</span></button>`).join('');
}
function setOpt(k, w) {
  n.opts[k] = w;
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);
  if (!b) return;
  b.querySelector('.lbl').textContent = w.en;
  b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap');
}

/* ---------- 유령 ---------- */
const alive = () => n.mobs.filter(m => m.state === 'walk');
function nextWord() {
  const onField = new Set(alive().map(m => m.w.key));
  for (let k = 0; k < n.order.length; k++) {
    const w = n.order[(n.oi + k) % n.order.length];
    if (!onField.has(w.key)) { n.oi = (n.oi + k + 1) % n.order.length; return w; }
  }
  return n.order[0];
}
function spawn() {
  const w = nextWord();
  const used = alive().filter(m => m.x < 0.3).map(m => m.lane);
  const free = [...Array(LANES).keys()].filter(l => !used.includes(l));
  const lane = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * LANES);
  const base = SPEEDS[n.speed];
  const walk = base.walk * (1 - 0.28 * (n.spawned / TOTAL));     // 뒤로 갈수록 빨라짐
  const el = document.createElement('div');
  el.className = `ng-mob lane${lane}`;
  el.innerHTML = `<span class="ng-sign">${esc(w.ko)}</span>${GHOST}`;
  $('#ngField').appendChild(el);
  const m = { id: ++seq, w, lane, x: 0, walk, el, state: 'walk', bob: Math.random() * 6 };
  n.mobs.push(m);
  n.spawned++;
  ensureAnswers();
  place(m);
}
// 지금 걸어오는 유령의 답이 보기에 다 있게: 없으면 아무 유령의 답도 아닌 보기와 바꾼다.
function ensureAnswers() {
  const need = alive().map(m => m.w);
  const needKeys = new Set(need.map(w => w.key));
  for (const w of need) {
    if (n.opts.some(o => o.key === w.key)) continue;
    const spare = n.opts.map((o, k) => k).filter(k => !needKeys.has(n.opts[k].key));
    if (!spare.length) break;
    setOpt(spare[Math.floor(Math.random() * spare.length)], w);
  }
}
// 쓴 보기는 다른 단어로(보기에 없는 것, 걸어오는 유령 답 먼저)
function refreshOpt(k) {
  const inOpts = new Set(n.opts.map(o => o.key));
  const need = alive().map(m => m.w).filter(w => !inOpts.has(w.key));
  const pool = need.length ? need : shuffle(n.order.filter(w => !inOpts.has(w.key)));
  if (pool.length) setOpt(k, pool[0]);
}

function fieldBox() { const f = $('#ngField'); return { w: f.clientWidth, h: f.clientHeight }; }
function place(m) {
  const { w } = fieldBox();
  const start = 6, end = w * 0.78 - 64;
  const x = start + (end - start) * Math.min(1, m.x);
  const bob = REDUCED ? 0 : Math.abs(Math.sin((n.t + m.bob) * 5)) * -6;
  m.el.style.transform = `translate(${x.toFixed(1)}px, ${bob.toFixed(1)}px)`;
}

/* ---------- 시간 ---------- */
function tick(now) {
  if (!n || n.over) return;
  const dt = n.last ? Math.min(0.1, (now - n.last) / 1000) : 0;    // 화면을 떠나 있던 시간은 세지 않는다
  n.last = now;
  n.t += dt;
  const a = alive();
  if (n.spawned < TOTAL && a.length < MAX_ALIVE && (n.t >= n.nextSpawn || (!a.length && n.t >= n.nextSpawn - 2))) {
    spawn();
    const g = SPEEDS[n.speed].gap;
    n.nextSpawn = n.t + g * (0.8 + Math.random() * 0.4);
  }
  for (const m of alive()) {
    if (n.over) break;
    m.x += dt / m.walk;
    place(m);
    if (m.x >= 1) reach(m);
  }
  if (n.over) return;
  if (n.spawned >= TOTAL && !n.mobs.some(m => m.state !== 'gone')) return morning();
  raf = requestAnimationFrame(tick);
}

function reach(m) {
  m.state = 'gone';
  sfx('hurt');
  poof(m, true);
  n.hearts--;
  n.reached++;
  n.combo = 0;
  n.missed.push(m.w);
  ctx.recordWord(m.w, false);
  const f = $('#ngField');
  f.classList.remove('hurt'); void f.offsetWidth; f.classList.add('hurt');
  $('#ngFb').innerHTML = `유령이 집에 닿았어요! <b lang="en">${esc(m.w.en)}</b> = ${esc(m.w.ko)}`;
  drawBar();
  if (n.hearts <= 0) return gameOver();
}

/* ---------- 쏘기 ---------- */
function choose(k) {
  if (!n || n.over || performance.now() < n.lock) return;
  const w = n.opts[k];
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);
  // 같은 단어 유령이 여럿이면 집에 가장 가까운 것부터
  const m = alive().filter(x => x.w.key === w.key).sort((a, c) => c.x - a.x)[0];
  if (!m) {
    sfx('bad');
    n.lock = performance.now() + 600;
    n.combo = 0;
    b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
    setTimeout(() => b.classList.remove('wrong'), 600);
    $('#ngFb').innerHTML = `<b lang="en">${esc(w.en)}</b> = ${esc(w.ko)} · 이 뜻의 유령은 없어요`;
    return;
  }
  m.state = 'hit';
  n.combo++; n.best = Math.max(n.best, n.combo);
  b.classList.remove('right'); void b.offsetWidth; b.classList.add('right');
  setTimeout(() => b.classList.remove('right'), 400);
  $('#ngFb').innerHTML = `<b lang="en">${esc(w.en)}</b> = ${esc(w.ko)}${n.combo >= 3 ? ` · ${n.combo}연속!` : ''}`;
  sfx('shoot');
  shoot(m, () => {
    m.state = 'gone';
    sfx('poof');
    poof(m, false);
    n.killed++;
    ctx.recordWord(m.w, true);
    ctx.say(m.w.en);
    drawBar();
  });
  refreshOpt(k);
}

function shoot(m, done) {
  const field = $('#ngField');
  const fr = field.getBoundingClientRect();
  const win = $('#ngHouse .win').getBoundingClientRect();
  const mr = m.el.querySelector('.ng-ghost').getBoundingClientRect();
  const sx = win.left - fr.left + win.width / 2, sy = win.top - fr.top + win.height / 2;
  const tx = mr.left - fr.left + mr.width / 2, ty = mr.top - fr.top + mr.height * 0.45;
  if (REDUCED) return done();
  const el = document.createElement('i');
  el.className = 'ng-arrow';
  el.style.left = `${sx}px`; el.style.top = `${sy}px`;
  field.appendChild(el);
  const dx = tx - sx, dy = ty - sy;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const lift = -Math.min(60, Math.abs(dx) * 0.12);
  el.animate([
    { transform: `translate(0px, 0px) rotate(${ang - 12}deg)` },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) rotate(${ang}deg)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) rotate(${ang + 10}deg)` }
  ], { duration: 260, easing: 'linear' }).onfinish = () => { el.remove(); done(); };
}

function poof(m, atHouse) {
  const el = m.el;
  el.classList.add(atHouse ? 'bump' : 'pop');
  setTimeout(() => el.remove(), 380);
  if (REDUCED) return;
  const field = $('#ngField');
  const fr = field.getBoundingClientRect();
  const r = el.querySelector('.ng-ghost').getBoundingClientRect();
  const cx = r.left - fr.left + r.width / 2, cy = r.top - fr.top + r.height / 2;
  for (let k = 0; k < 12; k++) {
    const b = document.createElement('i');
    b.className = `ng-bit ${k % 4 === 0 ? 'eye' : ''}`;
    b.style.left = `${cx}px`; b.style.top = `${cy}px`;
    field.appendChild(b);
    const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 50;
    b.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 20}px)) scale(.4)`, opacity: 0 }
    ], { duration: 480, easing: 'ease-out' }).onfinish = () => b.remove();
  }
}

/* ---------- 끝 ---------- */
function finish(win) {
  n.over = true;
  cancelAnimationFrame(raf);
  $('#ngOpts').querySelectorAll('button').forEach(b => { b.disabled = true; });
  const over = $('#ngOver');
  over.querySelector('p').textContent = win ? '아침이 왔어요!' : '집이 다 부서졌어요!';
  over.hidden = false;
  if (win) $('#ngField').classList.add('dawn');
  sfx(win ? 'win' : 'end');
  // 걸어오던 유령의 단어도 '틀림'으로
  if (!win) alive().forEach(m => { m.state = 'gone'; n.missed.push(m.w); ctx.recordWord(m.w, false); });
  const r = { win, killed: n.killed, hearts: n.hearts, best: n.best, missed: n.missed, total: TOTAL };
  setTimeout(() => { if (ctx) ctx.onEnd(r); }, 1800);
}
const morning = () => finish(true);
const gameOver = () => finish(false);

/* ---------- 누르기 ---------- */
$('#ngOpts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (b && !b.disabled) choose(Number(b.dataset.k));
});
document.addEventListener('keydown', (e) => {
  if ($('#night').hidden || !n || n.over || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 4) { choose(k - 1); e.preventDefault(); }
});
