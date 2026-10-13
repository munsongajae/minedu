// 조합대 제작소: 3×3 마인크래프트 작업대에서 전설의 장비와 도구를 만든다.
// 단어 뜻에 맞는 재료를 선택하면 조합대 격자에 재료가 착! 꽂히고,
// 3개 재료를 모두 모으면 화살표가 빛나며 완제품(다이아몬드 검 등)이 인챈트 광채와 함께 완성된다!
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';
import { HEART } from './night.js';

const HEARTS = 3;
const RECIPES_PER_GAME = 4;
const STEPS_PER_RECIPE = 3;
const TOTAL = RECIPES_PER_GAME * STEPS_PER_RECIPE; // 12문제

let c = null, ctx = null;

/* ---------- 재료 및 완제품 픽셀 SVG ---------- */
export const INGREDIENT_SVGS = {
  diamond: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 2h6v2H5zM3 4h10v3H3zM4 7h8v3H4zM6 10h4v2H6zM7 12h2v2H7z" fill="#32cad8"/><path d="M6 3h4v1H6zM4 5h2v2H4zM6 4h1v1H6zM7 7h2v2H7z" fill="#e9feff"/><path d="M3 4h1v3H3zM5 2h1v1H5zM12 4h1v3h-1zM10 10h2v2h-2zM9 12h1v2H9z" fill="#0d5462"/></svg>`,
  iron: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 8h10v5H3z" fill="#d8d8d8"/><path d="M4 6h8v2H4z" fill="#efefef"/><path d="M5 4h6v2H5z" fill="#ffffff"/><path d="M3 13h10v1H3zM13 8h1v5h-1z" fill="#7a7a7a"/></svg>`,
  gold: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 8h10v5H3z" fill="#f8c526"/><path d="M4 6h8v2H4z" fill="#fde368"/><path d="M5 4h6v2H5z" fill="#fff6aa"/><path d="M3 13h10v1H3zM13 8h1v5h-1z" fill="#996e00"/></svg>`,
  stick: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M12 2h2v2h-2zM10 4h2v2h-2zM8 6h2v2H8zM6 8h2v2H6zM4 10h2v2H4zM2 12h2v2H2z" fill="#845932"/><path d="M13 2h1v1h-1zM11 4h1v1h-1zM9 6h1v1H9zM7 8h1v1H7zM5 10h1v1H5zM3 12h1v1H3z" fill="#a07246"/><path d="M12 3h1v1h-1zM10 5h1v1h-1zM8 7h1v1H8zM6 9h1v1H6zM4 11h1v1H4zM2 13h1v1H2z" fill="#583c1d"/></svg>`,
  apple: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="1" width="2" height="3" fill="#583c1d"/><rect x="9" y="2" width="2" height="1" fill="#4d9432"/><path d="M5 4h6v2H5zM3 6h10v6H3zM5 12h6v2H5z" fill="#d92424"/><path d="M5 5h2v2H5zM4 7h2v2H4z" fill="#ff7676"/><path d="M4 11h8v1H4zM12 6h1v6h-1z" fill="#800e0e"/></svg>`,
  string: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 13l3-3 2-4 4-2 3-3" stroke="#e0e0e0" stroke-width="1.5" fill="none"/><path d="M6 9l2 2 3-1" stroke="#ffffff" stroke-width="1" fill="none"/></svg>`,
  arrow: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M12 2h2v2h-2zM11 3h2v2h-2z" fill="#505050"/><path d="M4 10l7-7" stroke="#845932" stroke-width="1.5"/><path d="M2 12h2v2H2zM1 13h2v2H1z" fill="#e0e0e0"/></svg>`,
  wood: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="#a07246"/><path d="M2 2h12v1H2zM2 7h12v1H2zM2 11h12v1H2z" fill="#583c1d"/><path d="M2 3h12v1H2zM2 8h12v1H2zM2 12h12v1H2z" fill="#ba8958"/></svg>`,
  book: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="3" width="10" height="10" fill="#8b3c1b"/><path d="M4 4h8v8H4z" fill="#e0d7b8"/><path d="M5 3h1v10H5zM3 3h2v10H3z" fill="#5e220b"/><path d="M8 6h3v1H8zM8 8h3v1H8z" fill="#999"/></svg>`,
  obsidian: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="#151221"/><rect x="4" y="4" width="2" height="2" fill="#3c2357"/><rect x="8" y="7" width="2" height="2" fill="#5b3387"/><rect x="10" y="3" width="2" height="2" fill="#2d1645"/><rect x="5" y="10" width="2" height="2" fill="#4d2972"/></svg>`,
  redstone: `<svg class="mc-item-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="#d91e1e"/><circle cx="7" cy="7" r="2" fill="#ff6464"/><path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="#e02020" stroke-width="1.5"/></svg>`
};

export const SWORD_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><g transform="rotate(45 12 12)"><rect x="11" y="2" width="2" height="14" fill="#32cad8"/><rect x="11" y="2" width="1" height="14" fill="#e9feff"/><rect x="12" y="2" width="1" height="14" fill="#0d5462"/><rect x="9" y="16" width="6" height="2" fill="#0d5462"/><rect x="11" y="18" width="2" height="4" fill="#845932"/><rect x="10" y="22" width="4" height="2" fill="#583c1d"/></g></svg>`;
export const PICKAXE_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><g transform="rotate(45 12 12)"><path d="M5 4h14v3H5z" fill="#32cad8"/><path d="M5 4h14v1H5z" fill="#e9feff"/><path d="M5 6h14v1H5z" fill="#0d5462"/><rect x="11" y="7" width="2" height="15" fill="#845932"/><rect x="11" y="7" width="1" height="15" fill="#a07246"/></g></svg>`;
export const GAPPLE_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="11" y="2" width="2" height="4" fill="#583c1d"/><path d="M8 6h8v2H8zM5 8h14v10H5zM8 18h8v2H8z" fill="#f8c526"/><path d="M8 7h3v3H8zM7 10h2v3H7z" fill="#fff6aa"/><path d="M7 17h10v1H7zM18 8h1v10h-1z" fill="#996e00"/></svg>`;
export const BOW_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path d="M6 3h3v3H6zM4 6h2v6H4zM6 12h3v3H6z" fill="#845932"/><line x1="9" y1="3" x2="9" y2="15" stroke="#fff" stroke-width="1.5"/><line x1="3" y1="9" x2="16" y2="9" stroke="#505050" stroke-width="1.5"/></svg>`;
export const SHIELD_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 3h14v11l-7 7-7-7z" fill="#a07246"/><path d="M5 3h14v2H5zM5 3v11l7 7v-2l-5-5V5h10v9l-2 2v2l4-4V3z" fill="#d8d8d8"/><rect x="10" y="8" width="4" height="4" fill="#7a7a7a"/></svg>`;
export const ENCHANT_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="12" width="16" height="8" fill="#151221"/><rect x="5" y="11" width="14" height="2" fill="#c91f1f"/><path d="M8 5h8v4H8z" fill="#8b3c1b"/><path d="M9 4h6v3H9z" fill="#e0d7b8"/><circle cx="12" cy="7" r="1.5" fill="#32cad8"/></svg>`;
export const HELMET_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 4h14v10H5z" fill="#32cad8"/><rect x="9" y="10" width="6" height="4" fill="#0f141c"/><rect x="6" y="5" width="2" height="3" fill="#e9feff"/><rect x="5" y="13" width="14" height="1" fill="#0d5462"/></svg>`;
export const COMPASS_SVG = `<svg class="mc-crafted-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#2d2d2d"/><circle cx="12" cy="12" r="7" fill="#efefef"/><polygon points="12,6 14,12 12,11 10,12" fill="#d91e1e"/><polygon points="12,18 14,12 12,13 10,12" fill="#505050"/></svg>`;

export const RECIPES = [
  {
    id: 'sword',
    name: '다이아몬드 검',
    desc: '몬스터를 단숨에 베는 강력한 검',
    svg: SWORD_SVG,
    steps: [
      { slot: 7, item: 'stick', name: '나무 막대기' },
      { slot: 4, item: 'diamond', name: '다이아몬드 칼날' },
      { slot: 1, item: 'diamond', name: '다이아몬드 칼끝' },
    ]
  },
  {
    id: 'gapple',
    name: '황금 사과',
    desc: '체력을 모두 회복하는 전설의 사과',
    svg: GAPPLE_SVG,
    steps: [
      { slot: 4, item: 'apple', name: '빨간 사과' },
      { slot: 1, item: 'gold', name: '황금 조각' },
      { slot: 7, item: 'gold', name: '황금 외피' },
    ]
  },
  {
    id: 'bow',
    name: '마법의 활',
    desc: '화살을 멀리 날리는 마법의 활',
    svg: BOW_SVG,
    steps: [
      { slot: 3, item: 'stick', name: '유연한 나뭇가지' },
      { slot: 5, item: 'string', name: '거미줄 활시위' },
      { slot: 4, item: 'arrow', name: '깃털 화살' },
    ]
  },
  {
    id: 'pickaxe',
    name: '다이아 곡괭이',
    desc: '흑요석까지 부수는 최고급 곡괭이',
    svg: PICKAXE_SVG,
    steps: [
      { slot: 7, item: 'stick', name: '곡괭이 자루' },
      { slot: 0, item: 'diamond', name: '왼쪽 다이아' },
      { slot: 2, item: 'diamond', name: '오른쪽 다이아' },
    ]
  },
  {
    id: 'shield',
    name: '단단한 방패',
    desc: '화살과 폭발을 막아내는 튼튼한 방패',
    svg: SHIELD_SVG,
    steps: [
      { slot: 1, item: 'iron', name: '철제 보강판' },
      { slot: 3, item: 'wood', name: '왼쪽 오크 판자' },
      { slot: 5, item: 'wood', name: '오른쪽 오크 판자' },
    ]
  },
  {
    id: 'enchant',
    name: '인챈트 테이블',
    desc: '무기에 신비한 마법을 부여하는 제단',
    svg: ENCHANT_SVG,
    steps: [
      { slot: 7, item: 'obsidian', name: '흑요석 받침' },
      { slot: 3, item: 'diamond', name: '마법 다이아' },
      { slot: 1, item: 'book', name: '지혜의 마법 책' },
    ]
  },
  {
    id: 'helmet',
    name: '다이아 투구',
    desc: '머리를 안전하게 지켜주는 빛나는 투구',
    svg: HELMET_SVG,
    steps: [
      { slot: 0, item: 'diamond', name: '왼쪽 챙' },
      { slot: 1, item: 'diamond', name: '정수리 보호대' },
      { slot: 2, item: 'diamond', name: '오른쪽 챙' },
    ]
  },
  {
    id: 'compass',
    name: '신비의 나침반',
    desc: '언제나 집이 있는 방향을 가리키는 나침반',
    svg: COMPASS_SVG,
    steps: [
      { slot: 1, item: 'iron', name: '철제 테두리' },
      { slot: 4, item: 'redstone', name: '마법 레드스톤 바늘' },
      { slot: 7, item: 'iron', name: '철제 외벽' },
    ]
  }
];

/* ---------- 시작·종료 ---------- */
export function startCraft(cx, mode = 'ko') {
  ctx = cx;
  stopCraft();
  const order = cx.pickWords(cx.words.length);
  const recipes = shuffle(RECIPES).slice(0, RECIPES_PER_GAME);
  c = {
    mode, order, oi: 0, recipes, ri: 0, si: 0,
    hearts: HEARTS, rightCount: 0, totalAsked: 0,
    crafted: [], missed: [], combo: 0, best: 0,
    over: false, lock: false, startAt: Date.now(),
    placedSlots: {}, currentOptions: []
  };

  $('#craftOver').hidden = true;
  $('#craftFb').textContent = '';
  $('#craftHotbar').innerHTML = '';
  drawBar();
  drawTable();
  nextQuestion();
}

export function stopCraft() {
  if (c) c.over = true;
}

/* ---------- UI 그리기 ---------- */
function drawBar() {
  if (!c) return;
  $('#craftHearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < c.hearts ? '' : 'lost'}">${HEART}</i>`).join('');
  $('#craftHearts').setAttribute('aria-label', `하트 ${c.hearts}개`);
  const curRecipe = c.recipes[c.ri];
  $('#craftCount').textContent = `아이템 ${Math.min(c.ri + 1, RECIPES_PER_GAME)} / ${RECIPES_PER_GAME}`;
  $('#craftRecipeName').textContent = curRecipe ? `만들 아이템: ${curRecipe.name}` : '';
  $('#craftProg').textContent = `${c.si} / ${STEPS_PER_RECIPE} 재료`;
}

function drawTable() {
  if (!c) return;
  const grid = $('#craftGrid');
  const curRecipe = c.recipes[c.ri];
  const nextSlot = curRecipe ? curRecipe.steps[c.si]?.slot : -1;

  grid.innerHTML = Array.from({ length: 9 }, (_, i) => {
    const placed = c.placedSlots[i];
    const isTarget = i === nextSlot;
    if (placed) {
      return `<div class="craft-slot placed" data-slot="${i}">
        ${INGREDIENT_SVGS[placed.item] || ''}
        <span class="slot-lbl">${esc(placed.name)}</span>
      </div>`;
    }
    if (isTarget) {
      const step = curRecipe.steps[c.si];
      return `<div class="craft-slot ghost" data-slot="${i}" title="${esc(step.name)}">
        <div class="slot-ghost-item">${INGREDIENT_SVGS[step.item] || ''}</div>
      </div>`;
    }
    return `<div class="craft-slot" data-slot="${i}"></div>`;
  }).join('');

  // 화살표 게이지
  const pct = Math.round((c.si / STEPS_PER_RECIPE) * 100);
  $('#craftArrowFill').style.width = `${pct}%`;

  // 완성 슬롯
  const outSlot = $('#craftOutputSlot');
  if (curRecipe) {
    if (c.si >= STEPS_PER_RECIPE) {
      outSlot.className = 'craft-output-slot ready pop';
      outSlot.innerHTML = curRecipe.svg;
      $('#craftOutputName').textContent = curRecipe.name;
    } else {
      outSlot.className = 'craft-output-slot blueprint';
      outSlot.innerHTML = curRecipe.svg;
      $('#craftOutputName').textContent = '';
    }
  }
}

/* ---------- 문제 생성 ---------- */
function nextTargetWord() {
  for (let k = 0; k < c.order.length; k++) {
    const w = c.order[(c.oi + k) % c.order.length];
    c.oi = (c.oi + k + 1) % c.order.length;
    return w;
  }
  return c.order[0];
}

function distractors(target) {
  const isEnMode = c.mode === 'en';
  const others = shuffle(c.order.filter(w => {
    if (w.key === target.key) return false;
    if (isEnMode) return w.ko !== target.ko;
    return w.en.toLowerCase() !== target.en.toLowerCase();
  }));
  const out = [];
  for (const w of others) {
    if (isEnMode) {
      if (!out.some(o => o.ko === w.ko)) out.push(w);
    } else {
      if (!out.some(o => o.en.toLowerCase() === w.en.toLowerCase())) out.push(w);
    }
    if (out.length === 3) break;
  }
  return out;
}

function nextQuestion() {
  if (!c || c.over) return;
  const curRecipe = c.recipes[c.ri];
  if (!curRecipe) return finish(true);

  const step = curRecipe.steps[c.si];
  const target = nextTargetWord();
  c.target = target;
  c.currentStep = step;

  const isEnMode = c.mode === 'en';
  $('#craftAsk').textContent = isEnMode
    ? '이 단어의 한글 뜻 재료를 조합대에 올려요'
    : '이 뜻의 재료를 조합대에 올려요';

  const wordEl = $('#craftWord');
  wordEl.textContent = isEnMode ? target.en : target.ko;
  if (isEnMode) wordEl.setAttribute('lang', 'en');
  else wordEl.removeAttribute('lang');

  $('#craftSay').hidden = !isEnMode;
  if (isEnMode) ctx.say(target.en);

  // 보기 4개
  const words = shuffle([target, ...distractors(target)]);
  while (words.length < 4) words.push(target);
  c.currentOptions = words;

  // 재료 아이콘 리스트
  const icons = ['diamond', 'iron', 'gold', 'stick', 'apple', 'wood', 'book', 'obsidian', 'redstone'];
  $('#craftPick').innerHTML = words.map((w, i) => {
    const icon = w.key === target.key ? step.item : icons[(i + c.totalAsked) % icons.length];
    const lbl = isEnMode ? w.ko : w.en;
    return `<button type="button" class="craft-btn" data-i="${i}" ${isEnMode ? '' : 'lang="en"'}>
      <span class="key" aria-hidden="true">${i + 1}</span>
      <span class="craft-btn-ico">${INGREDIENT_SVGS[icon] || INGREDIENT_SVGS.iron}</span>
      <span class="lbl">${esc(lbl)}</span>
    </button>`;
  }).join('');

  drawBar();
  drawTable();
}

/* ---------- 답 고르기 ---------- */
function choose(idx) {
  if (!c || c.over || c.lock) return;
  const picked = c.currentOptions[idx];
  if (!picked) return;

  const b = $(`#craftPick [data-i="${idx}"]`);
  const isOk = picked.key === c.target.key;

  if (isOk) {
    c.lock = true;
    c.rightCount++;
    c.combo++;
    c.best = Math.max(c.best, c.combo);
    ctx.recordWord(c.target, true);
    ctx.say(c.target.en);
    sfx('ding');

    if (b) {
      b.classList.add('right');
      flyItem(b, c.currentStep.slot, c.currentStep.item);
    }

    // 슬롯에 배치
    c.placedSlots[c.currentStep.slot] = {
      item: c.currentStep.item,
      name: c.currentStep.name
    };

    c.si++;
    c.totalAsked++;
    $('#craftFb').innerHTML = `<b lang="en">${esc(c.target.en)}</b> = ${esc(c.target.ko)}${c.combo >= 3 ? ` · ${c.combo}연속!` : ''}`;
    drawBar();

    // 레시피 완성 확인
    if (c.si >= STEPS_PER_RECIPE) {
      setTimeout(() => {
        if (!c || c.over) return;
        completeRecipe();
      }, 550);
    } else {
      setTimeout(() => {
        if (!c || c.over) return;
        c.lock = false;
        nextQuestion();
      }, 550);
    }
  } else {
    c.hearts--;
    c.combo = 0;
    c.missed.push(c.target);
    ctx.recordWord(c.target, false);
    sfx('bad');

    if (b) {
      b.classList.remove('wrong');
      void b.offsetWidth;
      b.classList.add('wrong');
    }

    $('#craftFb').innerHTML = `앗! 정답은 <b lang="en">${esc(c.target.en)}</b> = ${esc(c.target.ko)}`;
    drawBar();

    if (c.hearts <= 0) {
      return finish(false);
    }
  }
}

/* ---------- 레시피 완성 연출 ---------- */
function completeRecipe() {
  const curRecipe = c.recipes[c.ri];
  c.crafted.push(curRecipe);
  sfx('craft');

  drawTable(); // output slot ready
  $('#craftFb').innerHTML = `<b class="craft-win-txt">✨ ${esc(curRecipe.name)} 완성! ✨</b>`;

  // 완성 아이템이 보관함(핫바)으로 날아가는 연출
  flyToHotbar(curRecipe);

  setTimeout(() => {
    if (!c || c.over) return;
    c.ri++;
    c.si = 0;
    c.placedSlots = {};
    if (c.ri >= RECIPES_PER_GAME) {
      finish(true);
    } else {
      c.lock = false;
      drawTable();
      nextQuestion();
    }
  }, 1300);
}

/* ---------- 날아가는 파티클 연출 ---------- */
function flyItem(fromBtn, targetSlotIndex, itemKey) {
  const table = $('#craftTable');
  const slotEl = $(`#craftGrid [data-slot="${targetSlotIndex}"]`);
  if (!table || !slotEl || !fromBtn) return;

  const tr = table.getBoundingClientRect();
  const fr = fromBtn.getBoundingClientRect();
  const sr = slotEl.getBoundingClientRect();

  const fly = document.createElement('div');
  fly.className = 'craft-fly-item';
  fly.innerHTML = INGREDIENT_SVGS[itemKey] || '';
  fly.style.left = `${fr.left - tr.left + fr.width / 2 - 16}px`;
  fly.style.top = `${fr.top - tr.top + fr.height / 2 - 16}px`;
  table.appendChild(fly);

  const dx = (sr.left - tr.left + sr.width / 2) - (fr.left - tr.left + fr.width / 2);
  const dy = (sr.top - tr.top + sr.height / 2) - (fr.top - tr.top + fr.height / 2);

  fly.animate([
    { transform: 'translate(0, 0) scale(1.1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 35}px) scale(1.3)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.8 }
  ], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }).onfinish = () => {
    fly.remove();
    slotEl.classList.remove('pop');
    void slotEl.offsetWidth;
    slotEl.classList.add('pop');
  };
}

function flyToHotbar(recipe) {
  const hotbar = $('#craftHotbar');
  const li = document.createElement('li');
  li.className = 'craft-hotbar-item pop';
  li.innerHTML = `${recipe.svg}<b>${esc(recipe.name)}</b>`;
  hotbar.appendChild(li);
}

/* ---------- 종료 ---------- */
function finish(win) {
  if (!c) return;
  c.over = true;
  document.querySelectorAll('#craftPick button').forEach(b => { b.disabled = true; });
  const over = $('#craftOver');
  over.querySelector('p').textContent = win ? '모든 전설의 아이템을 만들었어요!' : '조합대 재료가 다 떨어졌어요!';
  over.hidden = false;
  sfx(win ? 'win' : 'end');

  const sec = Math.round((Date.now() - c.startAt) / 1000);
  const r = {
    win,
    crafted: c.crafted,
    right: c.rightCount,
    hearts: c.hearts,
    best: c.best,
    missed: c.missed,
    total: TOTAL,
    sec
  };

  setTimeout(() => {
    if (ctx) ctx.onEnd(r);
  }, 1700);
}

/* ---------- 이벤트 리스너 ---------- */
$('#craftPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b && !b.disabled) choose(Number(b.dataset.i));
});

$('#craftSay').addEventListener('click', () => {
  if (c && c.target && !c.over) ctx.say(c.target.en);
});

document.addEventListener('keydown', (e) => {
  if ($('#craft').hidden || !c || c.over || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 4) {
    choose(k - 1);
    e.preventDefault();
  }
});
