// js/worldplay.js — 마인크래프트 실제 캡처 화면 & 1인칭 HUD 단어 탐험 게임
import * as THREE from './three.module.min.js';
import { speak } from './speech.js';
import { sfx } from './sfx.js';

const TOTAL = 12;
const MAX_HEARTS = 3;
const TIME_LIMIT = 12; // 문제당 12초 제한시간

// 캔 보물 아이템 테이블
const LOOT_ITEMS = [
  { icon: '💎', name: '다이아몬드', rare: true },
  { icon: '💚', name: '에메랄드', rare: true },
  { icon: '🍎', name: '황금 사과', rare: true },
  { icon: '🔮', name: '엔더 진주', rare: false },
  { icon: '🪙', name: '금괴', rare: false },
  { icon: '⛏️', name: '철 곡괭이', rare: false },
  { icon: '🌟', name: '네더의 별', rare: true },
  { icon: '🗡️', name: '다이아 검', rare: true },
  { icon: '🍞', name: '구운 빵', rare: false },
  { icon: '🏹', name: '마법의 활', rare: false }
];

let activeCleanup = null;

export function stopWorldGame() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * 내 월드 탐험 시작 함수
 * @param {Object} cfg
 * @param {Array} cfg.words - 단어 목록
 * @param {'ko'|'en'|'listen'} cfg.mode - 게임 모드
 * @param {Array} [cfg.projects] - 실제 캡처 이미지 추출용 프로젝트 목록
 * @param {Function} cfg.onItem - (en, ok) 단어별 정답 기록
 * @param {Function} cfg.onEnd - ({ emeralds, title, text, wrong }) 게임 종료 콜백
 * @param {Function} cfg.onQuit - 그만하기 콜백
 */
export function startWorldGame({ words, mode = 'ko', projects = [], onItem, onEnd, onQuit }) {
  stopWorldGame();

  const sec = document.getElementById('world');
  const viewport = document.getElementById('worldViewport');
  const realImg = document.getElementById('worldRealImg');
  const canvas = document.getElementById('worldCanvas3D');
  const heartsEl = document.getElementById('worldHearts');
  const badgeEl = document.getElementById('worldSceneBadge');
  const comboEl = document.getElementById('worldCombo');
  const countEl = document.getElementById('worldCount');
  const bossTitle = document.getElementById('worldBossTitle');
  const bossFill = document.getElementById('worldBossFill');
  const timeFill = document.getElementById('worldTimeFill');
  const coordsEl = document.getElementById('worldCoords');
  const crackEl = document.getElementById('worldCrack');
  const askEl = document.getElementById('worldAsk');
  const wordEl = document.getElementById('worldWord');
  const sentHintEl = document.getElementById('worldSentHint');
  const sayBtn = document.getElementById('worldSay');
  const handEl = document.getElementById('worldHand');
  const xpLvEl = document.getElementById('worldXpLv');
  const xpFillEl = document.getElementById('worldXpFill');
  const overEl = document.getElementById('worldOver');
  const fbEl = document.getElementById('worldFb');
  const backpackEl = document.getElementById('worldBackpack');
  const optsEl = document.getElementById('worldOpts');
  const quitBtn = document.getElementById('worldQuit');

  // 1. 프로젝트 장면에서 단어별 실제 마인크래프트 스크린샷 매핑
  const wordPhotoMap = new Map();
  const allScenePhotos = [];

  for (const proj of projects || []) {
    for (const sc of proj.scenes || []) {
      const blobs = (sc.images || []).filter(b => b instanceof Blob);
      if (!blobs.length) continue;
      for (const b of blobs) {
        allScenePhotos.push({ blob: b, title: proj.title || '내 마인크래프트 월드' });
      }
      for (const line of sc.lines || []) {
        const lineEn = (line.en || '').toLowerCase();
        for (const w of words) {
          const key = w.en.toLowerCase();
          if (lineEn.includes(key) && !wordPhotoMap.has(key)) {
            wordPhotoMap.set(key, {
              blob: blobs[0],
              sentence: line.en,
              title: proj.title || '내 마인크래프트 월드'
            });
          }
        }
      }
    }
  }

  // 상태 변수
  let active = true;
  let qIdx = 0;
  let hearts = MAX_HEARTS;
  let correctCount = 0;
  let combo = 0;
  let bestCombo = 0;
  let locked = false;
  let currentUrl = null;
  let timeLeft = TIME_LIMIT;
  let timerInterval = null;
  const collectedLoot = [];
  const wrongList = [];
  const questions = [];

  // 12문제 큐
  for (let i = 0; i < TOTAL; i++) {
    const pool = [...words].sort(() => Math.random() - 0.5);
    questions.push(pool[i % pool.length]);
  }

  // 2. Three.js 풍성한 3D 마인크래프트 월드 구성
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene3d = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(0, 2.1, 4.4);

  const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
  const dirLight = new THREE.DirectionalLight(0xffeedd, 0.95);
  dirLight.position.set(6, 12, 8);
  scene3d.add(ambLight, dirLight);

  // 지형 & 복셀 나무 그룹
  const worldGroup = new THREE.Group();
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4f8723 });
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2d });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3e1d });
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x336d1b });
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

  // 복셀 잔디 바닥
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 3; z++) {
      const isTop = Math.random() > 0.85 && Math.abs(x) > 2;
      const y = isTop ? 0.5 : -0.5;
      const m = new THREE.Mesh(boxGeo, (x + z) % 2 === 0 ? grassMat : dirtMat);
      m.position.set(x, y, z);
      worldGroup.add(m);
    }
  }

  // 복셀 나무 2그루 (좌/우)
  function makeTree(tx, tz) {
    const tree = new THREE.Group();
    // 기둥
    for (let y = 0; y < 4; y++) {
      const trunk = new THREE.Mesh(boxGeo, woodMat);
      trunk.position.set(0, y, 0);
      tree.add(trunk);
    }
    // 잎사귀
    for (let lx = -1; lx <= 1; lx++) {
      for (let ly = 3; ly <= 5; ly++) {
        for (let lz = -1; lz <= 1; lz++) {
          if (lx === 0 && ly < 4 && lz === 0) continue;
          const leaf = new THREE.Mesh(boxGeo, leavesMat);
          leaf.position.set(lx, ly, lz);
          tree.add(leaf);
        }
      }
    }
    tree.position.set(tx, 0, tz);
    return tree;
  }
  worldGroup.add(makeTree(-5.5, -3.5));
  worldGroup.add(makeTree(5.5, -4.5));

  // 둥둥 떠가는 사각 구름들
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(3.5 + i, 0.6, 2.5), cloudMat);
    cloud.position.set(-12 + i * 8, 6.5 + (i % 2) * 0.8, -10 + i * 2);
    worldGroup.add(cloud);
    clouds.push(cloud);
  }
  scene3d.add(worldGroup);

  // 중앙 타겟 럭키 블록
  const targetGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const targetColors = [0x32cad8, 0x17dd62, 0xfad64a, 0xe05252, 0xa55eea, 0x2ed573];
  const targetMat = new THREE.MeshLambertMaterial({ color: 0x32cad8 });
  const targetBlock = new THREE.Mesh(targetGeo, targetMat);
  targetBlock.position.set(0, 1.7, 0);
  scene3d.add(targetBlock);

  // 블록 외곽선 와이어프레임
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.22, 1.22, 1.22));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  targetBlock.add(wireframe);

  // 3D 폭발 파티클 풀
  const particleMeshes = [];
  const partGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  for (let i = 0; i < 24; i++) {
    const pm = new THREE.Mesh(partGeo, targetMat);
    pm.visible = false;
    scene3d.add(pm);
    particleMeshes.push({ mesh: pm, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  function triggerBreakParticles(color) {
    const pMat = new THREE.MeshLambertMaterial({ color });
    particleMeshes.forEach(p => {
      p.mesh.material = pMat;
      p.mesh.position.set(0, 1.7, 0);
      p.mesh.visible = true;
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = Math.random() * 5 + 2;
      p.vz = (Math.random() - 0.5) * 6;
      p.life = 1.0;
    });
  }

  let rafId = 0;
  function resize3D() {
    const w = viewport.clientWidth || 640;
    const h = viewport.clientHeight || 380;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate3D(t) {
    if (!active) return;
    // 블록 회전 및 부유
    targetBlock.rotation.y = Math.sin(t * 0.0014) * 0.45;
    targetBlock.position.y = 1.7 + Math.sin(t * 0.0035) * 0.09;

    // 구름 이동
    clouds.forEach(c => {
      c.position.x += 0.004;
      if (c.position.x > 14) c.position.x = -14;
    });

    // 파티클 업데이트
    particleMeshes.forEach(p => {
      if (p.life > 0) {
        p.life -= 0.025;
        p.mesh.position.x += p.vx * 0.016;
        p.mesh.position.y += p.vy * 0.016;
        p.mesh.position.z += p.vz * 0.016;
        p.vy -= 9.8 * 0.016; // 중력
        p.mesh.scale.setScalar(Math.max(0.01, p.life));
        if (p.life <= 0) p.mesh.visible = false;
      }
    });

    renderer.render(scene3d, camera);
    rafId = requestAnimationFrame(animate3D);
  }

  // 하트 렌더링
  function renderHearts() {
    heartsEl.innerHTML = '❤️'.repeat(hearts) + '🖤'.repeat(MAX_HEARTS - hearts);
    heartsEl.setAttribute('aria-label', `남은 하트 ${hearts}개`);
  }

  // 콤보 배지 업데이트
  function renderCombo() {
    if (combo >= 2) {
      comboEl.textContent = `🔥 ${combo}연속 채굴!`;
      comboEl.hidden = false;
    } else {
      comboEl.hidden = true;
    }
  }

  // 배낭 전리품 렌더링
  function renderBackpack() {
    backpackEl.innerHTML = collectedLoot.map(item => `
      <li class="world-loot-item ${item.rare ? 'rare' : ''}">
        <span>${item.icon}</span><b>${item.name}</b>
      </li>
    `).join('');
  }

  // 날아가는 보물 애니메이션
  function spawnFlyingLoot(lootItem, startElem) {
    const fly = document.createElement('div');
    fly.className = 'world-fly-loot';
    fly.textContent = lootItem.icon;
    const startRect = startElem ? startElem.getBoundingClientRect() : viewport.getBoundingClientRect();
    const sx = startRect.left + startRect.width / 2;
    const sy = startRect.top + startRect.height / 2;
    fly.style.left = `${sx}px`;
    fly.style.top = `${sy}px`;
    document.body.appendChild(fly);

    const bpRect = backpackEl.getBoundingClientRect();
    const tx = bpRect.left + Math.min(bpRect.width, collectedLoot.length * 30);
    const ty = bpRect.top + 10;

    requestAnimationFrame(() => {
      fly.style.transform = `translate(${tx - sx}px, ${ty - sy}px) scale(1.4)`;
      setTimeout(() => {
        fly.style.opacity = '0';
        setTimeout(() => fly.remove(), 250);
      }, 550);
    });
  }

  // 타이머 리셋
  function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = TIME_LIMIT;
    timeFill.style.width = '100%';
    timerInterval = setInterval(() => {
      if (!active || locked) return;
      timeLeft -= 0.1;
      const pct = Math.max(0, (timeLeft / TIME_LIMIT) * 100);
      timeFill.style.width = `${pct}%`;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 100);
  }

  // 시간 초과 처리
  function handleTimeout() {
    if (locked || !active) return;
    locked = true;
    sfx('hurt');
    viewport.classList.add('world-hurt');
    setTimeout(() => viewport.classList.remove('world-hurt'), 350);

    hearts = Math.max(0, hearts - 1);
    combo = 0;
    renderHearts();
    renderCombo();

    const q = questions[qIdx];
    if (!wrongList.some(w => w.en === q.en)) wrongList.push(q);
    onItem?.(q.en, false);

    fbEl.textContent = `⏰ 시간 초과! 정답은 "${q.en} (${q.ko})" 이에요.`;

    if (hearts <= 0) {
      setTimeout(() => finishGame(false), 1200);
    } else {
      setTimeout(nextStep, 1300);
    }
  }

  // 문제 표시
  function showQuestion() {
    if (!active) return;
    locked = false;
    fbEl.textContent = '';
    crackEl.className = 'world-crack';
    targetBlock.scale.set(1, 1, 1);
    const q = questions[qIdx];

    countEl.textContent = `${qIdx + 1} / ${TOTAL}`;
    bossTitle.textContent = `WORLD EXPLORER · ${qIdx + 1} / ${TOTAL}`;
    bossFill.style.width = `${((TOTAL - qIdx) / TOTAL) * 100}%`;
    xpLvEl.textContent = String(1 + Math.floor(correctCount / 2));
    xpFillEl.style.width = `${((correctCount % 2) * 50) + (qIdx / TOTAL) * 40}%`;
    coordsEl.textContent = `XYZ: ${100 + qIdx * 14} / 68 / ${-25 + qIdx * 6}`;

    // 타겟 블록 색상 변경
    const color = targetColors[qIdx % targetColors.length];
    targetMat.color.setHex(color);

    // 실제 스크린샷 매핑
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    const matchedPhoto = wordPhotoMap.get(q.en.toLowerCase()) ||
      (allScenePhotos.length ? allScenePhotos[qIdx % allScenePhotos.length] : null);

    if (matchedPhoto && matchedPhoto.blob) {
      currentUrl = URL.createObjectURL(matchedPhoto.blob);
      realImg.src = currentUrl;
      realImg.hidden = false;
      worldGroup.visible = false;
      badgeEl.textContent = `📷 ${matchedPhoto.title}`;
      if (matchedPhoto.sentence) {
        const blanked = matchedPhoto.sentence.replace(new RegExp(q.en, 'gi'), '____');
        sentHintEl.textContent = `내 문장: "${blanked}"`;
        sentHintEl.hidden = false;
      } else {
        sentHintEl.hidden = true;
      }
    } else {
      realImg.hidden = true;
      worldGroup.visible = true;
      badgeEl.textContent = '🌍 3D 마인크래프트 월드';
      sentHintEl.hidden = true;
    }

    // 모드별 질문
    if (mode === 'ko') {
      askEl.textContent = '이 뜻의 영어 단어를 핫바(1~4)에서 골라요';
      wordEl.textContent = q.ko;
      sayBtn.hidden = true;
    } else if (mode === 'en') {
      askEl.textContent = '이 영어 단어의 한글 뜻을 핫바(1~4)에서 골라요';
      wordEl.textContent = q.en;
      sayBtn.hidden = false;
    } else {
      askEl.textContent = '소리를 듣고 맞는 영어 단어를 골라요';
      wordEl.textContent = '🔊 잘 들어 보세요';
      sayBtn.hidden = false;
      speak(q.en);
    }

    // 보기 4개
    const distractors = words
      .filter(w => w.en.toLowerCase() !== q.en.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const choices = [q, ...distractors].sort(() => Math.random() - 0.5);

    optsEl.innerHTML = '';
    choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-slot';
      const label = mode === 'en' ? choice.ko : choice.en;
      btn.innerHTML = `<span class="world-slot-num">${idx + 1}</span><b class="world-slot-txt">${label}</b>`;
      btn.onclick = () => pickAnswer(choice, btn);
      optsEl.appendChild(btn);
    });

    resetTimer();
  }

  // 정답 판정
  function pickAnswer(choice, btnEl) {
    if (locked || !active) return;
    locked = true;
    clearInterval(timerInterval);
    const q = questions[qIdx];
    const isCorrect = choice.en.toLowerCase() === q.en.toLowerCase();

    // 1인칭 곡괭이 스윙
    handEl.classList.remove('swing');
    void handEl.offsetWidth;
    handEl.classList.add('swing');

    if (isCorrect) {
      btnEl.classList.add('good');
      sfx('hit');

      // 3단 연속 채굴 타격 연출
      crackEl.className = 'world-crack k1';
      targetBlock.scale.set(1.15, 1.15, 1.15);

      setTimeout(() => {
        if (!active) return;
        sfx('hit');
        crackEl.className = 'world-crack k2';
        targetBlock.scale.set(1.25, 1.25, 1.25);
      }, 160);

      setTimeout(() => {
        if (!active) return;
        sfx('break');
        crackEl.className = 'world-crack k3';
        triggerBreakParticles(targetMat.color.getHex());
        targetBlock.scale.set(0.1, 0.1, 0.1);

        correctCount++;
        combo++;
        if (combo > bestCombo) bestCombo = combo;
        renderCombo();

        // 보물 획득
        const loot = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
        collectedLoot.push(loot);
        renderBackpack();
        spawnFlyingLoot(loot, btnEl);
        sfx('pop');

        if (combo >= 2) sfx('ding');
        speak(q.en);

        fbEl.textContent = `✨ 정답! [${loot.icon} ${loot.name}] 획득! ${q.en} — ${q.ko}`;
        onItem?.(q.en, true);

        setTimeout(nextStep, 950);
      }, 340);
    } else {
      btnEl.classList.add('bad');
      sfx('hurt');
      viewport.classList.add('world-hurt');
      setTimeout(() => viewport.classList.remove('world-hurt'), 350);

      hearts = Math.max(0, hearts - 1);
      combo = 0;
      renderHearts();
      renderCombo();

      if (!wrongList.some(w => w.en === q.en)) wrongList.push(q);
      onItem?.(q.en, false);

      const targetTxt = mode === 'en' ? q.ko : q.en;
      Array.from(optsEl.children).forEach(el => {
        if (el.querySelector('.world-slot-txt')?.textContent === targetTxt) {
          el.classList.add('good');
        }
      });
      fbEl.textContent = `💡 아쉬워요! 정답은 "${q.en} (${q.ko})" 이에요.`;

      if (hearts <= 0) {
        setTimeout(() => finishGame(false), 1200);
      } else {
        setTimeout(nextStep, 1300);
      }
    }
  }

  function nextStep() {
    if (!active) return;
    qIdx++;
    if (qIdx >= TOTAL) {
      finishGame(true);
    } else {
      showQuestion();
    }
  }

  function finishGame(cleared) {
    if (!active) return;
    clearInterval(timerInterval);
    overEl.hidden = false;
    overEl.querySelector('p').textContent = cleared ? '🎉 월드 탐험 성공!' : '💔 하트가 모두 줄었어요!';
    if (cleared) sfx('win');
    else sfx('end');

    // 에메랄드 보상 계산: 클리어 시 맞힌 수/2(올림, 최대 8) + 하트 3개 유지 시 1
    let emeralds = cleared
      ? Math.min(8, Math.ceil(correctCount / 2)) + (hearts === MAX_HEARTS ? 1 : 0)
      : Math.ceil(correctCount / 3);

    const lootNames = collectedLoot.map(l => `${l.icon} ${l.name}`).join(', ');

    setTimeout(() => {
      // 중요: sec.hidden = true를 호출하지 않고 Three.js 리소스만 정리
      active = false;
      activeCleanup = null;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize3D);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      renderer.dispose();

      onEnd?.({
        emeralds,
        title: cleared ? (hearts === MAX_HEARTS ? '완벽한 월드 대탐험 성공!' : '월드 탐험 완료!') : '탐험을 마쳤어요!',
        text: `단어 ${TOTAL}개 중 ${correctCount}개를 채굴했어요! ${collectedLoot.length ? `(보물: ${lootNames})` : ''} ${bestCombo >= 2 ? `최대 ${bestCombo}연속 콤보!` : ''}`,
        wrong: wrongList
      });
    }, 1100);
  }

  // 키보드 1~4
  function onKey(e) {
    if (!active || locked) return;
    if (e.key >= '1' && e.key <= '4') {
      const idx = Number(e.key) - 1;
      const btn = optsEl.children[idx];
      if (btn) btn.click();
    }
  }

  function cleanup() {
    if (!active) return;
    active = false;
    activeCleanup = null;
    clearInterval(timerInterval);
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize3D);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    renderer.dispose();
    overEl.hidden = true;
    sec.hidden = true;
  }

  activeCleanup = cleanup;

  sayBtn.onclick = () => {
    const q = questions[qIdx];
    if (q) speak(q.en);
  };

  quitBtn.onclick = () => {
    sfx('click');
    cleanup();
    onQuit?.();
  };

  // 초기화 & 시작
  sec.hidden = false;
  overEl.hidden = true;
  renderHearts();
  renderCombo();
  renderBackpack();
  resize3D();
  window.addEventListener('resize', resize3D);
  window.addEventListener('keydown', onKey);
  showQuestion();
  rafId = requestAnimationFrame(animate3D);
}
