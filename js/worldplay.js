// js/worldplay.js — 마인크래프트 실제 캡처 화면 & 1인칭 HUD 단어 탐험 게임
import * as THREE from './three.module.min.js';
import { speak } from './speech.js';

const TOTAL = 12;
const MAX_HEARTS = 3;

let activeCleanup = null;

// 저장소 내장 효과음 재생 헬퍼 (./sounds/*.ogg 활용)
function playOgg(name, vol = 0.6) {
  try {
    const a = new Audio(`./sounds/${name}.ogg`);
    a.volume = vol;
    a.play().catch(() => {});
  } catch (_) {}
}

export function stopWorldGame() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * 내 월드 탐험 시작 함수
 * @param {Object} cfg
 * @param {Array} cfg.words - [{ en, ko, sceneBlob?, sentenceEn?, projectTitle? }] 단어 목록
 * @param {'ko'|'en'|'listen'} cfg.mode - 게임 모드
 * @param {Array} [cfg.projects] - IndexedDB에서 불러온 프로젝트 목록(실제 캡처 이미지 추출용)
 * @param {Function} cfg.onItem - (en, ok) 단어별 정답/오답 기록 콜백
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
  const countEl = document.getElementById('worldCount');
  const bossTitle = document.getElementById('worldBossTitle');
  const bossFill = document.getElementById('worldBossFill');
  const coordsEl = document.getElementById('worldCoords');
  const askEl = document.getElementById('worldAsk');
  const wordEl = document.getElementById('worldWord');
  const sentHintEl = document.getElementById('worldSentHint');
  const sayBtn = document.getElementById('worldSay');
  const handEl = document.getElementById('worldHand');
  const xpLvEl = document.getElementById('worldXpLv');
  const xpFillEl = document.getElementById('worldXpFill');
  const overEl = document.getElementById('worldOver');
  const fbEl = document.getElementById('worldFb');
  const optsEl = document.getElementById('worldOpts');
  const quitBtn = document.getElementById('worldQuit');

  // 1. 프로젝트 장면(scenes)에서 단어별 실제 마인크래프트 캡처 사진(Blob) 매핑
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
  let locked = false;
  let currentUrl = null;
  const wrongList = [];
  const questions = [];

  // 12문제 출제 큐 구성
  for (let i = 0; i < TOTAL; i++) {
    const pool = [...words].sort(() => Math.random() - 0.5);
    questions.push(pool[i % pool.length]);
  }

  // 2. Three.js 1인칭 마인크래프트 3D 월드 초기화 (캡처 사진이 없을 때나 3D 타겟 블록 연출용)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene3d = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(0, 1.8, 4.2);

  const ambLight = new THREE.AmbientLight(0xffffff, 0.75);
  const dirLight = new THREE.DirectionalLight(0xfff4d6, 0.85);
  dirLight.position.set(5, 10, 7);
  scene3d.add(ambLight, dirLight);

  // 복셀 바닥 및 타겟 광석 블록 생성
  const groundGroup = new THREE.Group();
  const grassGeo = new THREE.BoxGeometry(1, 1, 1);
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x559028 });
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x79553a });
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 2; z++) {
      const m = new THREE.Mesh(grassGeo, (x + z) % 2 === 0 ? grassMat : dirtMat);
      m.position.set(x, -0.5, z);
      groundGroup.add(m);
    }
  }
  scene3d.add(groundGroup);

  // 정중앙 타겟 마인크래프트 블록
  const targetGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
  const targetColors = [0x32cad8, 0x17dd62, 0xfad64a, 0xe05252, 0x9b59b6];
  const targetMat = new THREE.MeshLambertMaterial({ color: 0x32cad8 });
  const targetBlock = new THREE.Mesh(targetGeo, targetMat);
  targetBlock.position.set(0, 1.6, 0);
  scene3d.add(targetBlock);

  // 블록 선택 검은 테두리 (마인크래프트 하이라이트 와이어프레임)
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.17, 1.17, 1.17));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  targetBlock.add(wireframe);

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
    targetBlock.rotation.y = Math.sin(t * 0.0012) * 0.35;
    targetBlock.position.y = 1.55 + Math.sin(t * 0.003) * 0.08;
    renderer.render(scene3d, camera);
    rafId = requestAnimationFrame(animate3D);
  }

  // 하트 UI 업데이트
  function renderHearts() {
    heartsEl.innerHTML = '❤️'.repeat(hearts) + '🖤'.repeat(MAX_HEARTS - hearts);
    heartsEl.setAttribute('aria-label', `남은 하트 ${hearts}개`);
  }

  // 문제 표시
  function showQuestion() {
    if (!active) return;
    locked = false;
    fbEl.textContent = '';
    const q = questions[qIdx];

    countEl.textContent = `${qIdx + 1} / ${TOTAL}`;
    bossTitle.textContent = `WORLD EXPLORER · ${qIdx + 1} / ${TOTAL}`;
    bossFill.style.width = `${((TOTAL - qIdx) / TOTAL) * 100}%`;
    xpLvEl.textContent = String(1 + Math.floor(correctCount / 2));
    xpFillEl.style.width = `${((correctCount % 2) * 50) + (qIdx / TOTAL) * 40}%`;
    coordsEl.textContent = `XYZ: ${100 + qIdx * 12} / 68 / ${-30 + qIdx * 5}`;

    // 타겟 블록 색상 변경
    targetMat.color.setHex(targetColors[qIdx % targetColors.length]);

    // 실제 마인크래프트 캡처 사진이 있는지 확인
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
      groundGroup.visible = false; // 실제 스크린샷 위에는 3D 타겟 블록만 띄움
      badgeEl.textContent = `📷 ${matchedPhoto.title}`;
      if (matchedPhoto.sentence) {
        // 정답 단어를 빈칸으로 가린 문장 힌트 제공
        const blanked = matchedPhoto.sentence.replace(new RegExp(q.en, 'gi'), '____');
        sentHintEl.textContent = `내 문장: "${blanked}"`;
        sentHintEl.hidden = false;
      } else {
        sentHintEl.hidden = true;
      }
    } else {
      realImg.hidden = true;
      groundGroup.visible = true;
      badgeEl.textContent = '🌍 3D 마인크래프트 월드';
      sentHintEl.hidden = true;
    }

    // 모드별 질문 표시
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

    // 4개 보기 구성 (정답 1 + 오답 3)
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
  }

  // 정답 판정
  function pickAnswer(choice, btnEl) {
    if (locked || !active) return;
    locked = true;
    const q = questions[qIdx];
    const isCorrect = choice.en.toLowerCase() === q.en.toLowerCase();

    // 오른손 곡괭이 스윙 애니메이션
    handEl.classList.remove('swing');
    void handEl.offsetWidth;
    handEl.classList.add('swing');

    if (isCorrect) {
      btnEl.classList.add('good');
      playOgg('stone', 0.5);
      setTimeout(() => playOgg('orb', 0.65), 120);
      speak(q.en);
      correctCount++;
      fbEl.textContent = `✨ 정답이에요! ${q.en} — ${q.ko}`;
      onItem?.(q.en, true);

      // 타겟 블록 타격 점프 연출
      targetBlock.scale.set(1.25, 1.25, 1.25);
      setTimeout(() => targetBlock.scale.set(1, 1, 1), 220);

      setTimeout(nextStep, 950);
    } else {
      btnEl.classList.add('bad');
      playOgg('hurt', 0.6);
      viewport.classList.add('world-hurt');
      setTimeout(() => viewport.classList.remove('world-hurt'), 350);

      hearts = Math.max(0, hearts - 1);
      renderHearts();
      if (!wrongList.some(w => w.en === q.en)) wrongList.push(q);
      onItem?.(q.en, false);

      // 정답 슬롯 표시
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
    overEl.hidden = false;
    overEl.querySelector('p').textContent = cleared ? '월드 탐험 성공!' : '하트가 모두 줄었어요!';
    if (cleared) playOgg('levelup', 0.7);

    // CLAUDE.md 에메랄드 계산 규칙: 클리어 시 맞힌 수/2(올림, 최대 8) + 하트 3개 유지 시 1
    let emeralds = cleared
      ? Math.min(8, Math.ceil(correctCount / 2)) + (hearts === MAX_HEARTS ? 1 : 0)
      : Math.ceil(correctCount / 3);

    setTimeout(() => {
      cleanup();
      onEnd?.({
        emeralds,
        title: cleared ? '월드 탐험 완료!' : '탐험을 마쳤어요!',
        text: `${TOTAL}개 중 ${correctCount}개의 단어를 채굴했어요!`,
        wrong: wrongList
      });
    }, 900);
  }

  // 키보드 숫자 1~4 지원
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
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize3D);
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
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
    playOgg('click', 0.5);
    cleanup();
    onQuit?.();
  };

  // 시작!
  sec.hidden = false;
  overEl.hidden = true;
  renderHearts();
  resize3D();
  window.addEventListener('resize', resize3D);
  window.addEventListener('keydown', onKey);
  showQuestion();
  rafId = requestAnimationFrame(animate3D);
}
