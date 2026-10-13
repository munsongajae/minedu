// 용암 파쿠르 (parkour.js): 부글부글 끓는 네더 용암 바다 위 징검다리를 건너 네더 차원문으로 탈출한다!
// 단어 뜻에 맞는 발판을 고르면 경쾌한 포물선 점프로 착지!
// 틀리면 자갈 함정 블록이 부서져 떨어지며, 물양동이 클러치(MLG)로 치이익 흑요석을 만들어 비상 착지한다.
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';
import { HEART } from './night.js';

const TOTAL = 10;
const HEARTS = 3;

let pState = null;

/* ---------- 마인크래프트 스티브 & 네더 차원문 & 아이템 픽셀 SVG ---------- */

// 스티브 서 있는 모습 (16x32 마크 비율)
const STEVE_STAND_SVG = `<svg class="pk-steve-svg stand" viewBox="0 0 24 38" shape-rendering="crispEdges" aria-hidden="true">
  <!-- 머리 -->
  <polygon points="7,2 11,0 17,0.5 13,3" fill="#6a4a2b"/>
  <rect x="7" y="2" width="10" height="9" fill="#bc8965"/>
  <rect x="7" y="2" width="10" height="3" fill="#4d3219"/>
  <rect x="7" y="5" width="2" height="3" fill="#4d3219"/>
  <rect x="15" y="5" width="2" height="3" fill="#4d3219"/>
  <rect x="9" y="5.5" width="2" height="1.5" fill="#fff"/>
  <rect x="10" y="5.5" width="1" height="1.5" fill="#2d5bb8"/>
  <rect x="13" y="5.5" width="2" height="1.5" fill="#fff"/>
  <rect x="13" y="5.5" width="1" height="1.5" fill="#2d5bb8"/>
  <rect x="10" y="7.5" width="4" height="1.5" fill="#58341e"/>
  <!-- 몸통 (청록색 셔츠) -->
  <rect x="8" y="11" width="8" height="12" fill="#00a8aa"/>
  <rect x="9.5" y="11" width="5" height="3" fill="#bc8965"/>
  <rect x="8" y="22" width="8" height="1" fill="#008082"/>
  <!-- 왼팔/오른팔 -->
  <rect x="5" y="11" width="3" height="4" fill="#00a8aa"/>
  <rect x="5" y="15" width="3" height="7" fill="#bc8965"/>
  <rect x="16" y="11" width="3" height="4" fill="#00a8aa"/>
  <rect x="16" y="15" width="3" height="7" fill="#bc8965"/>
  <!-- 다리 (남색 바지 & 회색 신발) -->
  <rect x="8" y="23" width="3.5" height="11" fill="#293998"/>
  <rect x="12.5" y="23" width="3.5" height="11" fill="#1e2c7a"/>
  <rect x="8" y="34" width="3.5" height="3" fill="#555562"/>
  <rect x="12.5" y="34" width="3.5" height="3" fill="#424250"/>
</svg>`;

// 스티브 점프 포즈 (팔다리 스프린트 점프)
const STEVE_JUMP_SVG = `<svg class="pk-steve-svg jump" viewBox="0 0 28 38" shape-rendering="crispEdges" aria-hidden="true">
  <!-- 머리 약간 앞으로 숙임 -->
  <rect x="10" y="1" width="10" height="9" fill="#bc8965"/>
  <rect x="10" y="1" width="10" height="3" fill="#4d3219"/>
  <rect x="12" y="4.5" width="2" height="1.5" fill="#fff"/>
  <rect x="13" y="4.5" width="1" height="1.5" fill="#2d5bb8"/>
  <rect x="16" y="4.5" width="2" height="1.5" fill="#fff"/>
  <rect x="16" y="4.5" width="1" height="1.5" fill="#2d5bb8"/>
  <rect x="13" y="6.5" width="4" height="1.5" fill="#58341e"/>
  <!-- 몸통 비스듬히 -->
  <polygon points="9,10 17,9 18,20 10,21" fill="#00a8aa"/>
  <!-- 앞팔 (앞으로 뻗음) -->
  <polygon points="17,10 23,8 24,11 18,13" fill="#00a8aa"/>
  <polygon points="23,8 27,6 28,9 24,11" fill="#bc8965"/>
  <!-- 뒷팔 (뒤로 휘두름) -->
  <polygon points="9,11 4,14 3,17 8,14" fill="#00a8aa"/>
  <polygon points="4,14 1,18 2,20 5,16" fill="#bc8965"/>
  <!-- 앞다리 (앞으로 차올림) -->
  <polygon points="14,20 20,24 18,27 12,23" fill="#293998"/>
  <polygon points="20,24 23,30 20,32 17,26" fill="#1e2c7a"/>
  <rect x="20" y="30" width="4" height="3" fill="#555562"/>
  <!-- 뒷다리 (뒤로 접힘) -->
  <polygon points="10,21 5,26 8,28 13,23" fill="#293998"/>
  <polygon points="5,26 2,33 5,34 8,27" fill="#1e2c7a"/>
  <rect x="1" y="33" width="4" height="3" fill="#424250"/>
</svg>`;

// 물양동이 클러치(MLG) 포즈: 물을 아래로 쏟는 스티브
const STEVE_CLUTCH_SVG = `<svg class="pk-steve-svg clutch" viewBox="0 0 28 38" shape-rendering="crispEdges" aria-hidden="true">
  <!-- 머리 아래를 내려다봄 -->
  <rect x="8" y="2" width="10" height="9" fill="#bc8965"/>
  <rect x="8" y="2" width="10" height="3" fill="#4d3219"/>
  <rect x="9" y="6" width="2" height="1.5" fill="#fff"/>
  <rect x="10" y="6" width="1" height="1.5" fill="#2d5bb8"/>
  <rect x="13" y="6" width="2" height="1.5" fill="#fff"/>
  <rect x="13" y="6" width="1" height="1.5" fill="#2d5bb8"/>
  <!-- 몸통 -->
  <rect x="8" y="11" width="8" height="11" fill="#00a8aa"/>
  <!-- 팔: 앞으로 양손 뻗어 물양동이 잡음 -->
  <rect x="12" y="14" width="7" height="4" fill="#bc8965"/>
  <!-- 물양동이 -->
  <g class="pk-bucket" transform="translate(16, 15)">
    <path d="M1 0h6v1H1zM0 1h8v1H0zM1 2h6v4H1zM2 6h4v1H2z" fill="#cfcfcf"/>
    <rect x="2" y="1" width="4" height="2" fill="#1e90ff"/>
    <path d="M3 3v12H2v-12zM4 3v14H5v-14z" fill="#00bfff" opacity="0.85"/>
  </g>
  <!-- 다리 긴장된 착지 준비 -->
  <rect x="7" y="22" width="4" height="11" fill="#293998"/>
  <rect x="12" y="22" width="4" height="11" fill="#1e2c7a"/>
  <rect x="7" y="33" width="4" height="3" fill="#555562"/>
  <rect x="12" y="33" width="4" height="3" fill="#424250"/>
</svg>`;

// 네더 차원문 (Nether Portal) SVG
const NETHER_PORTAL_SVG = `<svg class="pk-portal-svg" viewBox="0 0 48 72" shape-rendering="crispEdges" aria-hidden="true">
  <!-- 흑요석 프레임 (4x5 블록) -->
  <rect x="0" y="0" width="48" height="72" fill="#151221"/>
  <rect x="8" y="8" width="32" height="56" fill="#1a142e"/>
  <!-- 흑요석 하이라이트 -->
  <rect x="2" y="2" width="4" height="4" fill="#3c2357"/>
  <rect x="22" y="2" width="4" height="4" fill="#5b3387"/>
  <rect x="42" y="2" width="4" height="4" fill="#3c2357"/>
  <rect x="2" y="66" width="4" height="4" fill="#5b3387"/>
  <rect x="42" y="66" width="4" height="4" fill="#3c2357"/>
  <rect x="2" y="32" width="4" height="4" fill="#4d2972"/>
  <rect x="42" y="32" width="4" height="4" fill="#5b3387"/>
  <!-- 보라색 포털 소용돌이 -->
  <rect class="pk-portal-swirl" x="8" y="8" width="32" height="56" fill="url(#pk-portal-grad)"/>
  <g class="pk-portal-sparks">
    <rect x="12" y="16" width="3" height="3" fill="#e86eff"/>
    <rect x="28" y="24" width="2.5" height="2.5" fill="#ffffff"/>
    <rect x="16" y="38" width="3" height="3" fill="#d645f5"/>
    <rect x="32" y="48" width="2" height="2" fill="#ffa8ff"/>
    <rect x="22" y="12" width="2" height="2" fill="#ba33db"/>
  </g>
</svg>`;

/* ---------- 발판 블록 텍스처 (조약돌/흑요석/네더벽돌) ---------- */
function stoneBlockHTML(type = 'cobble') {
  if (type === 'obsidian') {
    return `<div class="pk-block-face pk-obsidian"><i class="pk-sh1"></i><i class="pk-sh2"></i></div>`;
  }
  if (type === 'nether') {
    return `<div class="pk-block-face pk-nether"><i class="pk-b1"></i><i class="pk-b2"></i><i class="pk-b3"></i></div>`;
  }
  return `<div class="pk-block-face pk-cobble"><i class="pk-c1"></i><i class="pk-c2"></i><i class="pk-c3"></i><i class="pk-c4"></i></div>`;
}

/* ---------- 질문 항목 생성 ---------- */
function buildQuestions(targetWords, allWords, mode) {
  return targetWords.map(w => {
    // 오답 후보 2개: 다른 단어들 중 글자 길이 비슷한 것 우선
    const others = shuffle(allWords.filter(x => x.key !== w.key));
    if (mode === 'ko') {
      others.sort((a, b) => Math.abs(a.en.length - w.en.length) - Math.abs(b.en.length - w.en.length));
    }
    const picks = [];
    const used = new Set([mode === 'en' ? w.ko : w.en]);
    for (const x of others) {
      const label = mode === 'en' ? x.ko : x.en;
      if (!used.has(label)) {
        used.add(label);
        picks.push({ key: x.key, en: x.en, ko: x.ko, label });
        if (picks.length === 2) break;
      }
    }
    const answerLabel = mode === 'en' ? w.ko : w.en;
    const opts = shuffle([{ key: w.key, en: w.en, ko: w.ko, label: answerLabel, correct: true }, ...picks]);
    return { target: w, opts };
  });
}

/* ---------- 메인 컨트롤러 ---------- */
export function startParkour({ words, pickWords, recordWord, say, onEnd }, mode = 'ko') {
  const chosenWords = pickWords(Math.min(TOTAL, words.length));
  const questions = buildQuestions(chosenWords, words, mode);

  pState = {
    words, pickWords, recordWord, say, onEnd, mode,
    questions,
    idx: 0,
    hearts: HEARTS,
    streak: 0,
    best: 0,
    right: 0,
    missed: [],
    start: Date.now(),
    locked: false,
    standType: 'cobble'
  };

  renderParkourUI();
  drawQuestion();
}

export function stopParkour() {
  pState = null;
}

function renderParkourUI() {
  const heartsHTML = Array.from({ length: HEARTS }, (_, i) => `<span class="ng-heart" data-idx="${i}">${HEART}</span>`).join('');
  const stepsHTML = Array.from({ length: TOTAL }, (_, i) => `<li class="" aria-label="${i + 1}단계"></li>`).join('');

  $('#pkHearts').innerHTML = heartsHTML;
  $('#pkSteps').innerHTML = stepsHTML;
  $('#pkFb').textContent = '';
  $('#pkFb').className = 'pk-fb';

  // 스테이지 내부 초기화
  const stage = $('#pkStage');
  stage.innerHTML = `
    <!-- 네더 동굴 및 용암 바다 -->
    <div class="pk-nether-bg" aria-hidden="true">
      <div class="pk-glowstone g1"></div>
      <div class="pk-glowstone g2"></div>
      <div class="pk-cavern-glow"></div>
      <div class="pk-lava-sea">
        <div class="pk-lava-surface"></div>
        <div class="pk-lava-bubbles">
          <i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i>
        </div>
        <div class="pk-lava-embers">
          <i class="e1"></i><i class="e2"></i><i class="e3"></i><i class="e4"></i>
        </div>
      </div>
    </div>

    <!-- 발판 및 플레이어 레이어 -->
    <div class="pk-world" id="pkWorld">
      <!-- 시작 발판 -->
      <div class="pk-pillar pk-stand-pillar" id="pkStandPillar">
        <div class="pk-block-top">${stoneBlockHTML('cobble')}</div>
        <div class="pk-block-body"></div>
        <div class="pk-steve-wrap" id="pkSteveWrap">
          ${STEVE_STAND_SVG}
        </div>
      </div>

      <!-- 3개의 징검다리 후보 발판 -->
      <div class="pk-islands-group" id="pkIslandsGroup">
        <!-- JS에서 동적으로 채움 -->
      </div>

      <!-- 네더 차원문 (마지막 점프 때 표시) -->
      <div class="pk-portal-dock" id="pkPortalDock" hidden>
        ${NETHER_PORTAL_SVG}
      </div>
    </div>
  `;
}

function updateHearts() {
  if (!pState) return;
  const hs = document.querySelectorAll('#pkHearts .ng-heart');
  hs.forEach((el, i) => {
    el.classList.toggle('lost', i >= pState.hearts);
  });
}

function updateSteps() {
  if (!pState) return;
  const lis = document.querySelectorAll('#pkSteps li');
  lis.forEach((el, i) => {
    if (i < pState.idx) el.className = 'right';
    else if (i === pState.idx) el.className = 'now';
    else el.className = '';
  });
}

function drawQuestion() {
  if (!pState || pState.idx >= pState.questions.length) return;
  pState.locked = false;
  const q = pState.questions[pState.idx];
  const isEnMode = pState.mode === 'en';
  const isListenMode = pState.mode === 'listen';
  const isFinalStep = pState.idx === TOTAL - 1;

  updateHearts();
  updateSteps();

  // 상단 문제 간판 텍스트 설정
  const promptEl = $('#pkPrompt');
  const labelEl = $('#pkLabel');
  if (isListenMode) {
    labelEl.textContent = '들려주는 단어의 발판으로 점프!';
    promptEl.textContent = '🔊 들려주는 소리';
    promptEl.lang = 'ko';
    $('#pkSay').hidden = false;
    pState.say(q.target.en);
  } else if (isEnMode) {
    labelEl.textContent = '이 단어의 뜻은?';
    promptEl.textContent = q.target.en;
    promptEl.lang = 'en';
    $('#pkSay').hidden = false;
    pState.say(q.target.en);
  } else {
    labelEl.textContent = '이 뜻의 영어 단어로 점프!';
    promptEl.textContent = q.target.ko;
    promptEl.lang = 'ko';
    $('#pkSay').hidden = true;
  }

  // 피드백 초기화
  $('#pkFb').textContent = '';
  $('#pkFb').className = 'pk-fb';

  // 3개 징검다리 섬 배치
  const islandsWrap = $('#pkIslandsGroup');
  const islandBlockType = isFinalStep ? 'obsidian' : (pState.idx % 2 === 0 ? 'cobble' : 'nether');
  
  islandsWrap.innerHTML = q.opts.map((opt, k) => `
    <div class="pk-island lane-${k}" data-k="${k}" role="button" tabindex="0" aria-label="${k + 1}번 발판: ${esc(opt.label)}">
      <div class="pk-sign">
        <span class="pk-num" aria-hidden="true">${k + 1}</span>
        <b class="pk-text" ${isEnMode ? '' : 'lang="en"'}>${esc(opt.label)}</b>
      </div>
      <div class="pk-block-top">
        ${stoneBlockHTML(islandBlockType)}
      </div>
      <div class="pk-block-body"></div>
    </div>
  `).join('');

  // 마지막 스텝이면 네더 차원문 도크 표시
  const portalDock = $('#pkPortalDock');
  if (isFinalStep) {
    portalDock.hidden = false;
    portalDock.classList.add('glow');
  } else {
    portalDock.hidden = true;
  }

  // 하단 3개 버튼 생성
  const optsWrap = $('#pkOpts');
  optsWrap.innerHTML = q.opts.map((opt, k) => `
    <button type="button" class="pk-opt opt-${k}" data-k="${k}" ${isEnMode ? '' : 'lang="en"'}>
      <span class="key" aria-hidden="true">${k + 1}</span>
      <span class="lbl">${esc(opt.label)}</span>
    </button>
  `).join('');

  // 스티브 서 있는 포즈로 원위치
  const steveWrap = $('#pkSteveWrap');
  steveWrap.className = 'pk-steve-wrap';
  steveWrap.innerHTML = STEVE_STAND_SVG;
}

// 점프 실행
async function makeJump(chosenK) {
  if (!pState || pState.locked) return;
  pState.locked = true;

  const q = pState.questions[pState.idx];
  const chosenOpt = q.opts[chosenK];
  const ok = !!chosenOpt.correct;
  const isFinalStep = pState.idx === TOTAL - 1;

  // 버튼 비활성화 및 선택 강조
  document.querySelectorAll('.pk-opt').forEach((b, k) => {
    b.disabled = true;
    if (k === chosenK) b.classList.add('picked');
  });

  const islandEl = document.querySelector(`.pk-island[data-k="${chosenK}"]`);
  const steveWrap = $('#pkSteveWrap');

  if (ok) {
    // ---------------- 정답 점프 ----------------
    sfx('jump');
    steveWrap.innerHTML = STEVE_JUMP_SVG;
    steveWrap.className = `pk-steve-wrap jumping-to-${chosenK}`;

    // 점프 중 비행 (350ms)
    await wait(360);
    sfx('land');
    pState.say(q.target.en);

    // 발판 착지 & 반짝임
    if (islandEl) islandEl.classList.add('right');
    steveWrap.innerHTML = STEVE_STAND_SVG;
    steveWrap.className = `pk-steve-wrap landed-at-${chosenK}`;

    pState.right++;
    pState.streak++;
    pState.best = Math.max(pState.best, pState.streak);
    pState.recordWord(q.target, true);

    const comboText = pState.streak >= 2 ? ` 🔥 ${pState.streak}연속 성공!` : '';
    $('#pkFb').textContent = `나이스 점프!${comboText}`;
    $('#pkFb').className = 'pk-fb good';

    if (isFinalStep) {
      // 마지막 문제 완료: 차원문 돌진 탈출!
      await wait(450);
      sfx('portal');
      sfx('win');
      steveWrap.className = `pk-steve-wrap entering-portal`;
      $('#pkPortalDock').classList.add('teleport');
      $('#pkFb').textContent = `네더 차원문 탈출 성공!`;
      await wait(1100);
      finishGame(true);
      return;
    }

    // 다음 발판으로 카메라 이동 트랜지션 (600ms)
    await wait(650);
    slideStageForward(chosenK);
  } else {
    // ---------------- 오답 점프: 자갈 붕괴 & MLG 물양동이 클러치 ----------------
    sfx('jump');
    steveWrap.innerHTML = STEVE_JUMP_SVG;
    steveWrap.className = `pk-steve-wrap jumping-to-${chosenK}`;

    await wait(340);

    // 자갈 함정 블록 금 가며 붕괴!
    if (islandEl) {
      islandEl.classList.add('crumble');
      sfx('crash');
    }

    // 스티브 용암으로 추락 모션
    steveWrap.className = `pk-steve-wrap falling-at-${chosenK}`;
    await wait(240);

    // MLG 물양동이 클러치! 스티브가 물양동이를 쏟아 용암을 흑요석으로 굳힘!
    sfx('sizzle');
    steveWrap.innerHTML = STEVE_CLUTCH_SVG;
    steveWrap.className = `pk-steve-wrap clutching-at-${chosenK}`;

    // 수증기 폭발 & 흑요석 블록 형성 이펙트
    spawnSteamClutch(chosenK);

    pState.hearts--;
    sfx('hurt');
    updateHearts();
    pState.streak = 0;
    pState.missed.push(q.target);
    pState.recordWord(q.target, false);
    pState.say(q.target.en);

    $('#pkFb').innerHTML = `앗, 자갈 함정! 정답은 <b lang="en">${esc(q.target.en)}</b> = <b>${esc(q.target.ko)}</b>`;
    $('#pkFb').className = 'pk-fb bad';

    if (pState.hearts <= 0) {
      // 하트 소진 게임 오버
      await wait(1200);
      sfx('end');
      finishGame(false);
      return;
    }

    // 세이프 후 다음 문제로 진행
    await wait(1600);
    slideStageForward(chosenK, true);
  }
}

// 물양동이 수증기 및 흑요석 안전 발판 생성
function spawnSteamClutch(laneK) {
  const island = document.querySelector(`.pk-island[data-k="${laneK}"]`);
  if (!island) return;
  const steam = document.createElement('div');
  steam.className = 'pk-steam-puff';
  steam.innerHTML = `<span class="s1"></span><span class="s2"></span><span class="s3"></span><b class="mlg-txt">MLG 세이프!</b>`;
  island.appendChild(steam);
  island.classList.add('obsidian-saved');
}

// 다음 라운드로 화면 자연스럽게 전진
function slideStageForward(landedK, wasClutched = false) {
  if (!pState) return;
  const world = $('#pkWorld');
  world.classList.add('panning');

  setTimeout(() => {
    pState.idx++;
    world.classList.remove('panning');
    drawQuestion();
  }, 400);
}

// 게임 종료 처리
async function finishGame(win) {
  if (!pState) return;
  const sec = Math.round((Date.now() - pState.start) / 1000);
  const result = {
    win,
    total: TOTAL,
    right: pState.right,
    hearts: pState.hearts,
    sec,
    best: pState.best,
    missed: pState.missed
  };
  const onEnd = pState.onEnd;
  pState = null;
  if (onEnd) onEnd(result);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------- 이벤트 리스너 (발판 클릭 & 버튼 클릭 & 키보드) ---------- */
$('#parkour').addEventListener('click', (e) => {
  if (!pState || pState.locked) return;
  const optBtn = e.target.closest('.pk-opt');
  if (optBtn) {
    makeJump(Number(optBtn.dataset.k));
    return;
  }
  const island = e.target.closest('.pk-island');
  if (island) {
    makeJump(Number(island.dataset.k));
    return;
  }
});

$('#pkSay').addEventListener('click', () => {
  if (pState && pState.questions[pState.idx]) {
    pState.say(pState.questions[pState.idx].target.en);
  }
});

// PC 키보드 1, 2, 3으로 점프
document.addEventListener('keydown', (e) => {
  if ($('#parkour').hidden || !pState || pState.locked || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 3) {
    e.preventDefault();
    makeJump(k - 1);
  }
});
