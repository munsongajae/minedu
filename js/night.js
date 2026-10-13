// 밤을 지켜라: 한글 뜻을 든 몹이 왼쪽에서 집으로 걸어온다.
// 아래 영어 단어 블록 4개 중 맞는 것을 누르면 집 창문에서 화살이 날아가 그 몹을 물리친다.
//   - 보기 4개에는 지금 걸어오는 몹(최대 3마리)의 답이 늘 들어 있다.
//   - 틀린 단어를 누르면 그 단어의 뜻을 보여 주고 0.6초 쉰다.
//   - 몹이 집에 닿으면 하트 1개가 깎이고, 그 단어는 '틀림'으로 남는다. 하트 3개가 다 없어지면 끝.
//   - 몹 12마리를 다 막으면 아침이 온다. 뒤로 갈수록 조금씩 빨라진다.
//   - '몹 부르기'(PC는 Space)로 다음 몹을 바로 불러낼 수 있다(동시에 3마리까지). 끝나면 걸린 시간을 보여 준다.
// 몹은 좀비·스켈레톤·크리퍼, 집·하트는 직접 만든 픽셀 그림.
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';

const TOTAL = 12, HEARTS = 3, MAX_ALIVE = 3, LANES = 3;
const SPEEDS = {                       // walk: 왼쪽 끝에서 집까지 걸리는 초, gap: 다음 몹이 나오는 간격
  slow: { walk: 17, gap: 4.6 },
  normal: { walk: 13, gap: 3.6 },
  fast: { walk: 10, gap: 2.8 }
};
const MATERIALS = ['grass', 'sky', 'gold', 'dirt'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let n = null, ctx = null, raf = 0, seq = 0;

// 마인크래프트 3D 입체 몹: 좀비·스켈레톤·크리퍼·엔더맨을 3D 아이소메트릭 블록으로 직접 구현.
export const ZOMBIE_SVG = `<svg class="ng-creature zombie" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true">
  <ellipse class="mc-shadow" cx="13" cy="37.5" rx="8.5" ry="2" fill="rgba(0,0,0,0.38)"/>
  <g class="mc-arm-far">
    <polygon points="12,14 17,13 18,15 13,16" fill="#1b8587"/>
    <rect x="13" y="15" width="4" height="3" fill="#146d6f"/>
    <polygon points="17,13 22,13 22,15 17,15" fill="#69a838"/>
    <rect x="17" y="15" width="5" height="3" fill="#4d8226"/>
    <rect x="17" y="18" width="5" height="1" fill="#38601c"/>
  </g>
  <g class="mc-leg-far">
    <rect x="11" y="25" width="2" height="11" fill="#1b1735"/>
    <rect x="13" y="25" width="4" height="11" fill="#2a2350"/>
    <rect x="13" y="30" width="4" height="1" fill="#201a3e"/>
    <rect x="12" y="35" width="5" height="1.5" fill="#16132b"/>
  </g>
  <g class="mc-torso">
    <polygon points="7,14 11,11.5 18,12.5 14,15" fill="#2ac3c5"/>
    <polygon points="7,14 10,13.5 10,25 7,24" fill="#135f61"/>
    <polygon points="10,13.5 17,14 17,25 10,25" fill="#1ea8aa"/>
    <polygon points="12,13.8 14.5,13.9 13.5,16.5 12,16.5" fill="#588c34"/>
    <rect x="10" y="23.5" width="7" height="1.5" fill="#157c7e"/>
  </g>
  <g class="mc-leg-near">
    <polygon points="7,24 10,24 12,25 9,25" fill="#4d4282"/>
    <rect x="6.5" y="25" width="2.5" height="11" fill="#231d42"/>
    <rect x="9" y="25" width="4.5" height="11" fill="#3a3168"/>
    <rect x="9" y="25" width="1" height="10" fill="#483d7e"/>
    <rect x="8" y="30" width="5" height="1" fill="#28224a"/>
    <rect x="7" y="35" width="6.5" height="1.5" fill="#1c1735"/>
  </g>
  <g class="mc-arm-near">
    <polygon points="6,15 10,14 12,16 8,17" fill="#2fc5c7"/>
    <polygon points="6,15 8,17 8,20 6,18" fill="#14686a"/>
    <polygon points="8,17 12,16 12,19 8,20" fill="#1ea8aa"/>
    <polygon points="12,16 23,16 24,18 13,18" fill="#75b840"/>
    <rect x="13" y="18" width="11" height="3" fill="#588c34"/>
    <rect x="13" y="21" width="11" height="1" fill="#3d6324"/>
    <rect x="23" y="17" width="1" height="4" fill="#30501c"/>
  </g>
  <g class="mc-head">
    <polygon points="8,5 12,2 18,3 14,6" fill="#4a7327"/>
    <polygon points="10,4.5 13,2.5 16,3.2 13,5.2" fill="#5c8c32"/>
    <polygon points="8,5 11,5.5 11,14 8,13" fill="#2d4817"/>
    <rect x="9" y="8" width="1.5" height="2" fill="#243b12"/>
    <polygon points="8,10 11,10.5 11,14 8,13" fill="#3b5e22"/>
    <polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#588c34"/>
    <rect x="11" y="5.5" width="7" height="2.5" fill="#38581e"/>
    <rect x="13" y="8" width="2" height="1" fill="#38581e"/>
    <rect x="12" y="9" width="2" height="1.5" fill="#13210d"/>
    <rect x="12.5" y="9" width="1" height="1" fill="#233550"/>
    <rect x="15" y="9.5" width="2" height="1.5" fill="#13210d"/>
    <rect x="15.5" y="9.5" width="1" height="1" fill="#233550"/>
    <rect x="14" y="11.5" width="2" height="1" fill="#426827"/>
    <rect x="13" y="13" width="3" height="1" fill="#2e4c1a"/>
  </g>
</svg>`;

export const SKELETON_SVG = `<svg class="ng-creature skeleton" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true">
  <ellipse class="mc-shadow" cx="13" cy="37.5" rx="8" ry="1.8" fill="rgba(0,0,0,0.38)"/>
  <g class="mc-arm-far">
    <rect x="14" y="14" width="2" height="8" fill="#999684"/>
  </g>
  <g class="mc-leg-far">
    <rect x="13" y="25" width="2.5" height="11" fill="#918e7d"/>
    <rect x="13" y="29.5" width="2.5" height="1" fill="#6d6a5c"/>
    <rect x="13" y="35" width="3" height="1.5" fill="#757364"/>
  </g>
  <g class="mc-torso">
    <rect x="8" y="14" width="8" height="10" fill="#141414"/>
    <rect x="11.5" y="14" width="2" height="10" fill="#e0ddd0"/>
    <polygon points="7,14 11,12 17,13 13,15" fill="#f4f1e4"/>
    <rect x="8" y="15.5" width="8" height="1.2" fill="#dcd9c8"/>
    <rect x="8.5" y="18" width="7.5" height="1.2" fill="#dcd9c8"/>
    <rect x="9" y="20.5" width="6.5" height="1.2" fill="#dcd9c8"/>
    <polygon points="8,23 16,23.5 15,25.5 9,25" fill="#c7c3b2"/>
  </g>
  <g class="mc-leg-near">
    <rect x="8.5" y="25" width="1" height="11" fill="#999684"/>
    <rect x="9.5" y="25" width="2" height="11" fill="#dedbc9"/>
    <rect x="8.5" y="30" width="3" height="1" fill="#aba794"/>
    <rect x="9" y="35" width="3.5" height="1.5" fill="#b8b4a2"/>
  </g>
  <g class="mc-arm-near">
    <polygon points="7,14 10,14 16,18 14,20" fill="#dedbc9"/>
    <rect x="13" y="18" width="2" height="2" fill="#b0ac9a"/>
    <g class="mc-bow">
      <rect x="16" y="9" width="2" height="3" fill="#693c18"/>
      <rect x="17.5" y="11" width="2" height="4" fill="#8f562b"/>
      <rect x="19" y="14" width="2" height="4" fill="#aa6c35"/>
      <rect x="19.5" y="17" width="2.5" height="4" fill="#bd7d42"/>
      <rect x="18.5" y="17.5" width="1.5" height="3" fill="#693c18"/>
      <rect x="19" y="20" width="2" height="4" fill="#aa6c35"/>
      <rect x="17.5" y="23" width="2" height="4" fill="#8f562b"/>
      <rect x="16" y="26" width="2" height="3" fill="#693c18"/>
      <line x1="16.5" y1="9.5" x2="16.5" y2="28.5" stroke="#f0f0f0" stroke-width="0.8"/>
      <line x1="14" y1="18.5" x2="24" y2="18.5" stroke="#8a5e35" stroke-width="1"/>
      <polygon points="24,17.5 26,18.5 24,19.5" fill="#d2d2d2"/>
      <rect x="14" y="17.5" width="1.5" height="2" fill="#f8f8f8"/>
    </g>
  </g>
  <g class="mc-head">
    <polygon points="8,5 12,2 18,3 14,6" fill="#f4f1e4"/>
    <polygon points="8,5 11,5.5 11,14 8,13" fill="#918e7c"/>
    <rect x="8.5" y="7" width="2" height="3" fill="#757262"/>
    <polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#dedbc9"/>
    <rect x="12" y="8" width="2" height="2" fill="#141414"/>
    <rect x="15" y="8.5" width="2.5" height="2" fill="#141414"/>
    <polygon points="14,11 15,11 14.5,12" fill="#141414"/>
    <rect x="12" y="12.5" width="5.5" height="1.2" fill="#2b2b2b"/>
    <line x1="13.5" y1="12.5" x2="13.5" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/>
    <line x1="15" y1="12.5" x2="15" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/>
    <line x1="16.5" y1="12.5" x2="16.5" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/>
  </g>
</svg>`;

export const CREEPER_SVG = `<svg class="ng-creature creeper" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true">
  <ellipse class="mc-shadow" cx="13" cy="37.5" rx="8.5" ry="2" fill="rgba(0,0,0,0.38)"/>
  <g class="mc-leg-rear-far">
    <rect x="6" y="27" width="3.5" height="8" fill="#32631f"/>
    <rect x="6" y="34" width="3.5" height="1.5" fill="#182c10"/>
  </g>
  <g class="mc-leg-rear-near">
    <polygon points="9,28 13,28 13,36 9,36" fill="#4d8c32"/>
    <rect x="9" y="34.5" width="4" height="1.5" fill="#182c10"/>
  </g>
  <g class="mc-leg-front-far">
    <rect x="13" y="27" width="3.5" height="8" fill="#3d7528"/>
    <rect x="13" y="34" width="3.5" height="1.5" fill="#182c10"/>
  </g>
  <g class="mc-leg-front-near">
    <polygon points="16,28 20,28 20,36 16,36" fill="#589e3a"/>
    <rect x="16" y="34.5" width="4" height="1.5" fill="#182c10"/>
  </g>
  <g class="mc-torso">
    <polygon points="7,14 11,11.5 18,12.5 14,15" fill="#75c74e"/>
    <polygon points="7,14 10,13.5 10,28 7,27" fill="#2d5c1c"/>
    <rect x="7" y="16" width="3" height="3" fill="#244a16"/>
    <rect x="7" y="21" width="3" height="2" fill="#387023"/>
    <polygon points="10,13.5 18,14.5 18,28 10,28" fill="#529938"/>
    <rect x="11" y="15" width="2" height="2" fill="#73c750"/>
    <rect x="14" y="15" width="3" height="2" fill="#3c7826"/>
    <rect x="12" y="18" width="3" height="3" fill="#65b844"/>
    <rect x="15" y="19" width="3" height="2" fill="#88db5f"/>
    <rect x="10.5" y="22" width="2.5" height="3" fill="#366b23"/>
    <rect x="14" y="23" width="3" height="3" fill="#4d9432"/>
  </g>
  <g class="mc-head">
    <polygon points="8,5 12,2 18,3 14,6" fill="#75c74e"/>
    <polygon points="10,4.5 13,2.5 16,3.2 13,5.2" fill="#8ae060"/>
    <polygon points="8,5 11,5.5 11,14 8,13" fill="#2d5c1c"/>
    <rect x="8.5" y="8" width="2" height="2" fill="#204214"/>
    <polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#5db03e"/>
    <rect x="11" y="6" width="3" height="2" fill="#79d453"/>
    <rect x="15" y="6.5" width="3" height="2" fill="#46872d"/>
    <rect x="11.5" y="8" width="2" height="2" fill="#0d180b"/>
    <rect x="15.5" y="8.5" width="2" height="2" fill="#0d180b"/>
    <rect x="13.5" y="9.5" width="2" height="2" fill="#0d180b"/>
    <rect x="12.5" y="11" width="1.5" height="2.5" fill="#0d180b"/>
    <rect x="15" y="11.5" width="1.5" height="2.5" fill="#0d180b"/>
    <rect x="12" y="13" width="5" height="1" fill="#0d180b"/>
  </g>
</svg>`;

export const ENDERMAN_SVG = `<svg class="ng-creature enderman" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true">
  <ellipse class="mc-shadow" cx="13" cy="37.5" rx="7.5" ry="1.8" fill="rgba(0,0,0,0.38)"/>
  <g class="mc-arm-far">
    <rect x="14" y="11" width="1.8" height="22" fill="#0f0f12"/>
  </g>
  <g class="mc-leg-far">
    <rect x="12.5" y="22" width="2" height="15" fill="#0f0f12"/>
  </g>
  <g class="mc-torso">
    <polygon points="8,10 11,9 16,9.5 13,11" fill="#282830"/>
    <polygon points="8,10 10,9.8 10,22 8,21.5" fill="#121216"/>
    <polygon points="10,9.8 15,10.2 15,22 10,22" fill="#1a1a20"/>
  </g>
  <g class="mc-leg-near">
    <rect x="8.5" y="22" width="2.2" height="15" fill="#18181e"/>
    <rect x="8.5" y="35.5" width="3" height="1.5" fill="#101014"/>
  </g>
  <g class="mc-arm-near">
    <rect x="7" y="11" width="2" height="22" fill="#1a1a22"/>
    <rect x="7" y="31" width="2" height="3" fill="#121218"/>
  </g>
  <g class="mc-head">
    <polygon points="8,3.5 11,1 17,1.8 13,4.5" fill="#2e2e38"/>
    <polygon points="8,3.5 10,4 10,10 8,9.5" fill="#111116"/>
    <polygon points="10,4 17,4.8 17,10.5 10,10" fill="#1a1a22"/>
    <rect x="11" y="6" width="2" height="1.2" fill="#d645f5"/>
    <rect x="11.5" y="6.2" width="1" height="0.8" fill="#ffa8ff"/>
    <rect x="14.5" y="6.4" width="2" height="1.2" fill="#d645f5"/>
    <rect x="15" y="6.6" width="1" height="0.8" fill="#ffa8ff"/>
  </g>
  <g class="mc-ender-sparks">
    <rect class="mc-spark s1" x="5" y="6" width="1.2" height="1.2" fill="#d645f5"/>
    <rect class="mc-spark s2" x="18" y="14" width="1.2" height="1.2" fill="#d645f5"/>
    <rect class="mc-spark s3" x="4" y="20" width="1.2" height="1.2" fill="#ba33db"/>
    <rect class="mc-spark s4" x="17" y="28" width="1.2" height="1.2" fill="#e86eff"/>
  </g>
</svg>`;

export const MOB_TYPES = [
  { name: '좀비', svg: ZOMBIE_SVG },
  { name: '스켈레톤', svg: SKELETON_SVG },
  { name: '크리퍼', svg: CREEPER_SVG },
  { name: '엔더맨', svg: ENDERMAN_SVG },
];
export const HOUSE = `<svg class="ng-house-svg" viewBox="0 0 16 15" shape-rendering="crispEdges" aria-hidden="true">
  <g class="roof"><rect x="7" y="0" width="2" height="1"/><rect x="5" y="1" width="6" height="1"/><rect x="3" y="2" width="10" height="1"/><rect x="1" y="3" width="14" height="1"/><rect x="0" y="4" width="16" height="1"/></g>
  <g class="wall"><rect x="1" y="5" width="14" height="10"/></g>
  <g class="plank"><rect x="1" y="8" width="14" height="1"/><rect x="1" y="11" width="14" height="1"/></g>
  <g class="door"><rect x="9" y="9" width="4" height="6"/></g>
  <g class="win"><rect x="3" y="6" width="4" height="4"/></g>
  <g class="frame"><rect x="4" y="6" width="1" height="4"/><rect x="3" y="7" width="4" height="1"/></g></svg>`;
export const HEART = `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/></svg>`;

/* ---------- 시작·끝 ---------- */
export function startNight(c, mode = 'ko', speed = 'normal') {
  if (['slow', 'normal', 'fast'].includes(mode) && speed === 'normal') {
    speed = mode;
    mode = 'ko';
  }
  ctx = c;
  stopNight();
  const order = c.pickWords(c.words.length);
  n = {
    mode, speed: SPEEDS[speed] ? speed : 'normal', order, oi: 0, t: 0, last: 0, over: false,
    mobs: [], spawned: 0, killed: 0, reached: 0, hearts: HEARTS, nextSpawn: 1.2,
    opts: [], lock: 0, missed: [], combo: 0, best: 0, mobOrder: shuffle(MOB_TYPES)
  };
  $('#ngField').querySelectorAll('.ng-mob, .ng-arrow, .ng-bit').forEach(el => el.remove());
  $('#ngOver').hidden = true;
  $('#ngField').classList.remove('dawn', 'hurt');
  $('#ngFb').textContent = '';
  if (mode === 'en') {
    const distinct = [];
    const usedKo = new Set();
    for (const w of order) {
      if (!usedKo.has(w.ko)) {
        usedKo.add(w.ko);
        distinct.push(w);
        if (distinct.length === 4) break;
      }
    }
    n.opts = distinct.length === 4 ? distinct : shuffle(order.slice(0, 4));
  } else {
    n.opts = shuffle(order.slice(0, 4));
  }
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
  $('#ngCount').textContent = `물리친 몹 ${n.killed} / ${TOTAL}`;
  const done = (n.killed + n.reached) / TOTAL;
  $('#ngField').style.setProperty('--p', done.toFixed(3));
}
function drawOpts() {
  const isEnMode = n.mode === 'en';
  $('#ngOpts').innerHTML = n.opts.map((w, k) =>
    `<button type="button" class="wg-opt ng-opt ${MATERIALS[k]}" data-k="${k}" ${isEnMode ? '' : 'lang="en"'}><span class="key" aria-hidden="true">${k + 1}</span><span class="lbl">${esc(isEnMode ? w.ko : w.en)}</span></button>`).join('');
}
function setOpt(k, w) {
  n.opts[k] = w;
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);
  if (!b) return;
  const isEnMode = n.mode === 'en';
  b.querySelector('.lbl').textContent = isEnMode ? w.ko : w.en;
  if (isEnMode) b.removeAttribute('lang'); else b.setAttribute('lang', 'en');
  b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap');
}

/* ---------- 몹 ---------- */
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
  const type = n.mobOrder[n.spawned % n.mobOrder.length];
  const signText = n.mode === 'en' ? w.en : w.ko;
  const isEnSign = n.mode === 'en';
  const el = document.createElement('div');
  el.className = `ng-mob lane${lane}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${type.name} · ${signText}`);
  el.innerHTML = `<span class="ng-sign"${isEnSign ? ' lang="en"' : ''}>${esc(signText)}</span>${type.svg}`;
  $('#ngField').appendChild(el);
  const m = { id: ++seq, w, type, lane, x: 0, walk, el, state: 'walk', bob: Math.random() * 6 };
  n.mobs.push(m);
  n.spawned++;
  ensureAnswers();
  place(m);
}
// 지금 걸어오는 몹의 답이 보기에 다 있게: 없으면 아무 몹의 답도 아닌 보기와 바꾼다.
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
// 쓴 보기는 다른 단어로(보기에 없는 것, 걸어오는 몹 답 먼저)
function refreshOpt(k) {
  const inOpts = new Set(n.opts.map(o => o.key));
  const need = alive().map(m => m.w).filter(w => !inOpts.has(w.key));
  let pool = need.length ? need : shuffle(n.order.filter(w => !inOpts.has(w.key)));
  if (n.mode === 'en') {
    const currentKos = new Set(n.opts.map((o, idx) => idx !== k ? o.ko : null).filter(Boolean));
    const nonDup = pool.filter(w => !currentKos.has(w.ko));
    if (nonDup.length) pool = nonDup;
  }
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
  const canCall = n.spawned < TOTAL && alive().length < MAX_ALIVE;
  const cb = $('#ngCall');
  if (cb.disabled === canCall) cb.disabled = !canCall;
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
  const particle = ['스켈레톤', '엔더맨'].includes(m.type.name) ? '이' : '가';
  $('#ngFb').innerHTML = `${m.type.name}${particle} 집에 닿았어요! <b lang="en">${esc(m.w.en)}</b> = ${esc(m.w.ko)}`;
  drawBar();
  if (n.hearts <= 0) return gameOver();
}

/* ---------- 쏘기 ---------- */
function choose(k) {
  if (!n || n.over || performance.now() < n.lock) return;
  const w = n.opts[k];
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);
  // 같은 단어 몹이 여럿이면 집에 가장 가까운 것부터
  const m = alive().filter(x => x.w.key === w.key).sort((a, c) => c.x - a.x)[0];
  if (!m) {
    sfx('bad');
    n.lock = performance.now() + 600;
    n.combo = 0;
    b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
    setTimeout(() => b.classList.remove('wrong'), 600);
    $('#ngFb').innerHTML = `<b lang="en">${esc(w.en)}</b> = ${esc(w.ko)} · 이 ${n.mode === 'en' ? '단어' : '뜻'}의 몹은 없어요`;
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
  const mr = m.el.querySelector('.ng-creature').getBoundingClientRect();
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
  ], { duration: 260, easing: 'linear' }).onfinish = () => {
    el.remove();
    m.el.classList.add('hit-flash');
    setTimeout(() => done(), 90);
  };
}

function poof(m, atHouse) {
  const el = m.el;
  el.classList.add(atHouse ? 'bump' : 'pop');
  setTimeout(() => el.remove(), 380);
  if (REDUCED) return;
  const field = $('#ngField');
  const fr = field.getBoundingClientRect();
  const r = el.querySelector('.ng-creature').getBoundingClientRect();
  const cx = r.left - fr.left + r.width / 2, cy = r.top - fr.top + r.height / 2;
  const bitColor = m.type.name === '스켈레톤' ? 'var(--mob-bone)'
    : m.type.name === '크리퍼' ? 'var(--creeper-skin)'
    : m.type.name === '엔더맨' ? '#d645f5'
    : 'var(--zombie-skin)';
  for (let k = 0; k < 14; k++) {
    const b = document.createElement('i');
    b.className = `ng-bit ${k % 4 === 0 ? 'eye' : ''}`;
    b.style.background = bitColor;
    b.style.left = `${cx}px`; b.style.top = `${cy}px`;
    field.appendChild(b);
    const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 50;
    b.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 20}px)) scale(.4)`, opacity: 0 }
    ], { duration: 480, easing: 'ease-out' }).onfinish = () => b.remove();
  }
}

// '몹 부르기': 다음 몹을 바로 불러낸다. 다음 몹이 저절로 나오는 시간도 그만큼 뒤로.
function callNext() {
  if (!n || n.over || n.spawned >= TOTAL || alive().length >= MAX_ALIVE) return;
  spawn();
  sfx('switch');
  n.nextSpawn = n.t + SPEEDS[n.speed].gap * (0.8 + Math.random() * 0.4);
  if (n.spawned >= TOTAL || alive().length >= MAX_ALIVE) $('#ngCall').disabled = true;
}

/* ---------- 끝 ---------- */
function finish(win) {
  n.over = true;
  cancelAnimationFrame(raf);
  $('#ngOpts').querySelectorAll('button').forEach(b => { b.disabled = true; });
  $('#ngCall').disabled = true;
  const over = $('#ngOver');
  over.querySelector('p').textContent = win ? '아침이 왔어요!' : '집이 다 부서졌어요!';
  over.hidden = false;
  if (win) $('#ngField').classList.add('dawn');
  sfx(win ? 'win' : 'end');
  // 걸어오던 몹의 단어도 '틀림'으로
  if (!win) alive().forEach(m => { m.state = 'gone'; n.missed.push(m.w); ctx.recordWord(m.w, false); });
  const r = { win, killed: n.killed, hearts: n.hearts, best: n.best, missed: n.missed, total: TOTAL, sec: Math.round(n.t) };
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
  else if (e.key === ' ' || e.key === 'Enter') { callNext(); e.preventDefault(); }
});
$('#ngCall').addEventListener('click', callNext);
