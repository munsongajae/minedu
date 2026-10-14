// 부모님 대시보드: 곰이·난이의 학습 기록과 영상 작품을 한눈에 보고 칭찬하는 공간
import * as store from './storage.js';
import { CHILDREN, keyOf, loadSentences, loadProgress, syncProgress, streak, mastered, isDue, nextDueDays, collectWords, loadGlossary, BOX_DAYS, esc, $ } from './learn.js';
import { cloudAvailable, getDeviceName } from './cloud.js';
import { coach, getFamilyCode } from './ai.js';
import { checkReset } from './reset.js';

let currentTab = '곰이';
let allSentences = [];
let allProjects = [];
let glossary = {};
let progressMap = {}; // { '곰이': p, '난이': p }

const toastEl = $('#toast');
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

const fmtDate = (t) => {
  if (!t) return '-';
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const todayStr = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function init() {
  bindEvents();
  await checkReset();     // 다른 기기에서 '모든 기록 지우기'를 했으면 이 기기 것도 지운다
  await loadData();
  renderSystemInfo();
}

async function loadData() {
  try {
    const sentsData = await loadSentences();
    allSentences = sentsData.sentences || [];
    allProjects = (await store.loadAll()) || [];
    glossary = await loadGlossary();

    for (const kid of CHILDREN) {
      progressMap[kid] = await loadProgress(kid);
    }
    render();
  } catch (e) {
    console.error('Failed to load parent dashboard data', e);
  }
}

function bindEvents() {
  // 아이 선택 탭
  document.querySelectorAll('.parent-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.parent-tab').forEach(b => {
        b.classList.remove('on');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('on');
      btn.setAttribute('aria-selected', 'true');
      currentTab = btn.dataset.child;
      render();
    });
  });

  // 문장 필터 변경
  $('#sentFilter').addEventListener('change', renderSentences);

  // 서버 동기화 버튼
  $('#syncBtn').addEventListener('click', async () => {
    $('#syncBtn').disabled = true;
    $('#syncBtn').textContent = '동기화 중…';
    try {
      for (const kid of CHILDREN) {
        if (progressMap[kid]) {
          progressMap[kid] = await syncProgress(progressMap[kid]);
        }
      }
      toast('서버 기록과 동기화했어요!');
      render();
    } catch (e) {
      toast('서버 연결을 확인해 주세요.');
    } finally {
      $('#syncBtn').disabled = false;
      $('#syncBtn').textContent = '서버 기록 맞추기';
    }
  });

  // 학습 기록 초기화 (영상 작품은 보존하고 아이들 학습 데이터만 삭제)
  const resetOpen = $('#resetProgressOpen');
  const resetConfirm = $('#resetProgressConfirm');
  const resetWord = $('#resetWord');
  const resetGo = $('#resetProgressGo');
  const resetCancel = $('#resetProgressCancel');
  const resetStatus = $('#resetStatus');

  if (resetOpen && resetConfirm) {
    resetOpen.addEventListener('click', () => {
      resetConfirm.hidden = false;
      resetOpen.hidden = true;
      resetWord.value = '';
      resetGo.disabled = true;
      resetStatus.textContent = '';
      resetWord.focus();
    });

    resetCancel.addEventListener('click', () => {
      resetConfirm.hidden = true;
      resetOpen.hidden = false;
      resetWord.value = '';
      resetStatus.textContent = '';
    });

    resetWord.addEventListener('input', () => {
      resetGo.disabled = resetWord.value.trim() !== '초기화';
    });

    resetGo.addEventListener('click', async () => {
      if (resetWord.value.trim() !== '초기화') return;
      resetGo.disabled = true;
      resetCancel.disabled = true;
      resetStatus.textContent = '아이들의 학습 기록을 초기화하는 중이에요…';

      try {
        const at = Date.now();
        for (const kid of CHILDREN) {
          const emptyProgress = {
            id: kid,
            sentences: {},
            words: {},
            emeralds: 0,
            days: [],
            free: { day: todayStr(), gems: 0 },
            updatedAt: at
          };
          await store.putItem('progress', emptyProgress);
          progressMap[kid] = emptyProgress;

          if (cloudAvailable()) {
            try {
              await coach('cloud_put', { key: keyOf(kid), doc: emptyProgress });
            } catch (err) {
              console.warn('Failed to reset cloud progress for ' + kid, err);
            }
          }
        }

        // AI 단어장 캐시 정리 (영상 프로젝트 projects는 그대로 안전 보존)
        await store.removeItem('meta', 'glossary');
        glossary = {};

        resetConfirm.hidden = true;
        resetOpen.hidden = false;
        resetStatus.textContent = '';
        toast('아이들 학습 기록이 모두 초기화되었어요! (영상 작품은 안전하게 유지됩니다)');
        render();
      } catch (err) {
        resetStatus.textContent = '초기화 중 오류가 발생했습니다: ' + (err.message || err);
      } finally {
        resetGo.disabled = false;
        resetCancel.disabled = false;
      }
    });
  }
}

function render() {
  if (currentTab === 'compare') {
    $('#childView').hidden = true;
    $('#compareView').hidden = false;
    renderCompare();
  } else {
    $('#childView').hidden = false;
    $('#compareView').hidden = true;
    renderChild(currentTab);
  }
}

function renderChild(kid) {
  const p = progressMap[kid] || { emeralds: 0, days: [], sentences: {}, words: {} };
  const allWords = collectWords(allSentences, glossary);

  // 1. KPI 카드
  $('#kpiEmeralds').textContent = p.emeralds || 0;
  $('#kpiStreak').innerHTML = `${streak(p)}<small>일</small>`;
  $('#kpiDays').innerHTML = `${(p.days || []).length}<small>일</small>`;
  const mCount = mastered(allSentences, p);
  $('#kpiMastered').innerHTML = `${mCount}<small>/${allSentences.length}</small>`;

  const knownWords = allWords.filter(w => {
    const r = p.words && p.words[w.key];
    return r && (r.right || 0) >= 2 && (r.right || 0) > (r.wrong || 0);
  });
  $('#kpiWords').innerHTML = `${knownWords.length}<small>/${allWords.length}</small>`;

  // 2. 학습 잔디밭
  renderGarden(p);

  // 3. 복습 상자 진행도
  renderBoxBars(p);
  renderSentences();

  // 4. 단어 통계
  renderWords(p, allWords);

  // 5. 작품 목록
  renderProjects(kid);
}

function renderGarden(p) {
  const g = $('#garden');
  const now = Date.now();
  const daySet = new Set(p.days || []);
  let html = '';

  // 최근 28일 (4주) 거꾸로 계산
  for (let i = 27; i >= 0; i--) {
    const dTime = now - i * DAY_MS;
    const dStr = todayStr(dTime);
    const dateObj = new Date(dTime);
    const isDone = daySet.has(dStr);
    const label = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일: ${isDone ? '연습 완료 🌱' : '휴식'}`;
    html += `<div class="garden-cell ${isDone ? 'done' : ''}" title="${label}" aria-label="${label}">
      <i class="garden-block ${isDone ? 'grass' : 'dirt'}"></i>
      <span class="garden-date">${dateObj.getDate()}</span>
    </div>`;
  }
  g.innerHTML = html;
}

const BOX_NAMES = {
  1: '1번 상자 (새 문장/복습 필요 · 매일)',
  2: '2번 상자 (어순 배열 단계 · 1일 뒤)',
  3: '3번 상자 (빈칸 채우기 단계 · 3일 뒤)',
  4: '4번 상자 (영어로 말하기 단계 · 7일 뒤)',
  5: '5번 상자 (완전 정복! · 14일 뒤)'
};

function renderBoxBars(p) {
  const total = allSentences.length;
  if (!total) {
    $('#boxBars').innerHTML = '<p class="parent-empty">아직 등록된 문장이 없어요. 만들기에서 영상을 만들어 주세요.</p>';
    return;
  }

  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  allSentences.forEach(s => {
    const item = p.sentences && p.sentences[s.key];
    const b = item ? (item.box || 1) : 0;
    counts[b] = (counts[b] || 0) + 1;
  });

  let html = '';
  // 5번 상자부터 1번 상자 순으로
  [5, 4, 3, 2, 1].forEach(b => {
    const cnt = counts[b] || 0;
    const pct = total ? Math.round((cnt / total) * 100) : 0;
    html += `<div class="parent-box-row b${b}">
      <div class="parent-box-info">
        <span class="parent-box-name">${BOX_NAMES[b]}</span>
        <b class="parent-box-cnt">${cnt}문장 (${pct}%)</b>
      </div>
      <div class="parent-bar-track">
        <div class="parent-bar-fill fill-b${b}" style="width: ${pct}%;"></div>
      </div>
    </div>`;
  });

  if (counts[0]) {
    const pct = Math.round((counts[0] / total) * 100);
    html += `<div class="parent-box-row b0">
      <div class="parent-box-info">
        <span class="parent-box-name">아직 연습을 시작하지 않은 문장</span>
        <b class="parent-box-cnt">${counts[0]}문장 (${pct}%)</b>
      </div>
      <div class="parent-bar-track">
        <div class="parent-bar-fill fill-b0" style="width: ${pct}%;"></div>
      </div>
    </div>`;
  }

  $('#boxBars').innerHTML = html;
}

function renderSentences() {
  const p = progressMap[currentTab] || { sentences: {} };
  const filter = $('#sentFilter').value;
  const now = Date.now();

  let list = allSentences.map(s => {
    const item = p.sentences && p.sentences[s.key];
    const box = item ? (item.box || 1) : 0;
    const right = item ? (item.right || 0) : 0;
    const wrong = item ? (item.wrong || 0) : 0;
    const due = item ? item.due || 0 : 0;
    const dueDay = item ? Math.max(0, Math.round((due - now) / DAY_MS)) : 0;
    const isDueToday = !item || isDue(item, now);
    return { ...s, box, right, wrong, isDueToday, dueDay, item };
  });

  if (filter === 'due') {
    list = list.filter(s => s.isDueToday);
  } else if (filter === 'learning') {
    list = list.filter(s => s.box >= 1 && s.box <= 3);
  } else if (filter === 'mastered') {
    list = list.filter(s => s.box >= 4);
  }

  $('#sentCount').textContent = `${list.length}개`;

  if (!list.length) {
    $('#sentList').innerHTML = '<li class="parent-empty">해당하는 문장이 없어요.</li>';
    return;
  }

  $('#sentList').innerHTML = list.map(s => {
    let dueBadge = '';
    if (s.box === 0) dueBadge = '<span class="parent-tag tag-new">시작 전</span>';
    else if (s.isDueToday) dueBadge = '<span class="parent-tag tag-due">오늘 복습할 차례</span>';
    else if (s.box >= 5) dueBadge = '<span class="parent-tag tag-master">완전 정복!</span>';
    else dueBadge = `<span class="parent-tag tag-wait">${s.dueDay}일 뒤 복습</span>`;

    return `<li class="parent-sent-item">
      <div class="parent-sent-main">
        <p class="parent-sent-en" lang="en">${esc(s.en)}</p>
        <p class="parent-sent-ko">${esc(s.ko)}</p>
      </div>
      <div class="parent-sent-meta">
        <span class="parent-box-badge b${s.box}">${s.box ? `${s.box}번 상자` : '미학습'}</span>
        <span class="parent-score">맞힘 ${s.right} / 틀림 ${s.wrong}</span>
        ${dueBadge}
      </div>
    </li>`;
  }).join('');
}

function renderWords(p, allWords) {
  const wordsStats = p.words || {};
  const wordItems = allWords.map(w => {
    const st = wordsStats[w.key] || { right: 0, wrong: 0, t: 0 };
    return { ...w, right: st.right || 0, wrong: st.wrong || 0 };
  });

  // 취약 단어 (wrong > 0, 틀린 횟수 많은 순)
  const weak = wordItems.filter(w => w.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 16);
  if (weak.length) {
    $('#weakWords').innerHTML = weak.map(w =>
      `<li class="parent-word-chip weak">
        <b lang="en">${esc(w.en)}</b>
        <span>${esc(w.ko || '-')}</span>
        <small class="wrong-badge">${w.wrong}번 틀림</small>
      </li>`).join('');
  } else {
    $('#weakWords').innerHTML = '<li class="parent-empty">아직 틀린 단어가 없어요. 아주 잘하고 있어요! 👍</li>';
  }

  // 자신 있는 단어 (right >= 2 && wrong === 0)
  const strong = wordItems.filter(w => w.right >= 2 && w.wrong === 0).sort((a, b) => b.right - a.right).slice(0, 16);
  if (strong.length) {
    $('#strongWords').innerHTML = strong.map(w =>
      `<li class="parent-word-chip strong">
        <b lang="en">${esc(w.en)}</b>
        <span>${esc(w.ko || '-')}</span>
        <small class="right-badge">${w.right}번 정답</small>
      </li>`).join('');
  } else {
    $('#strongWords').innerHTML = '<li class="parent-empty">게임을 통해 마스터 단어를 모아보세요!</li>';
  }
}

function renderProjects(kid) {
  const container = $('#projList');
  // 만든 사람에 아이 이름이 포함되어 있거나, 구분이 없으면 전체
  const list = allProjects.filter(p => !p.example && (!p.makers || p.makers.includes(kid) || p.makers.includes('둘이')));

  $('#projNote').textContent = `총 ${list.length}개의 영상`;

  if (!list.length) {
    container.innerHTML = '<p class="parent-empty">아직 만든 영상이 없어요.</p>';
    return;
  }

  container.innerHTML = list.map(p => {
    const sceneCount = (p.scenes || []).length;
    let lineCount = 0;
    (p.scenes || []).forEach(sc => { lineCount += (sc.lines || []).length; });

    return `<article class="parent-proj-card">
      <div class="parent-proj-head">
        <h3>${esc(p.title || '제목 없는 영상')}</h3>
        <span class="parent-proj-maker">${esc(p.makers || kid)}</span>
      </div>
      <div class="parent-proj-body">
        <span>🎬 ${sceneCount}개 장면</span>
        <span>📝 ${lineCount}개 문장</span>
        <span>📅 ${fmtDate(p.updatedAt || p.createdAt)}</span>
      </div>
    </article>`;
  }).join('');
}

function renderCompare() {
  const grid = $('#compareGrid');
  const pGom = progressMap['곰이'] || { emeralds: 0, days: [], sentences: {}, words: {} };
  const pNan = progressMap['난이'] || { emeralds: 0, days: [], sentences: {}, words: {} };
  const allWords = collectWords(allSentences, glossary);

  const getStats = (p) => {
    const knownWords = allWords.filter(w => {
      const r = p.words && p.words[w.key];
      return r && (r.right || 0) >= 2 && (r.right || 0) > (r.wrong || 0);
    });
    return {
      emeralds: p.emeralds || 0,
      streak: streak(p),
      days: (p.days || []).length,
      masteredSent: mastered(allSentences, p),
      masteredWords: knownWords.length
    };
  };

  const sGom = getStats(pGom);
  const sNan = getStats(pNan);

  grid.innerHTML = `
    <div class="parent-compare-col gom">
      <div class="parent-compare-header">
        <h3>🐻 곰이</h3>
      </div>
      <ul class="parent-compare-list">
        <li><span>💎 모은 에메랄드</span><b>${sGom.emeralds}개</b></li>
        <li><span>🔥 연속 연습일</span><b>${sGom.streak}일</b></li>
        <li><span>📅 총 연습한 날</span><b>${sGom.days}일</b></li>
        <li><span>🏆 완전 정복 문장</span><b>${sGom.masteredSent} / ${allSentences.length}</b></li>
        <li><span>🌟 마스터한 단어</span><b>${sGom.masteredWords} / ${allWords.length}</b></li>
      </ul>
    </div>
    <div class="parent-compare-col nan">
      <div class="parent-compare-header">
        <h3>🐱 난이</h3>
      </div>
      <ul class="parent-compare-list">
        <li><span>💎 모은 에메랄드</span><b>${sNan.emeralds}개</b></li>
        <li><span>🔥 연속 연습일</span><b>${sNan.streak}일</b></li>
        <li><span>📅 총 연습한 날</span><b>${sNan.days}일</b></li>
        <li><span>🏆 완전 정복 문장</span><b>${sNan.masteredSent} / ${allSentences.length}</b></li>
        <li><span>🌟 마스터한 단어</span><b>${sNan.masteredWords} / ${allWords.length}</b></li>
      </ul>
    </div>
  `;
}

function renderSystemInfo() {
  $('#infoDevice').textContent = getDeviceName('이 기기');
  const code = getFamilyCode();
  $('#infoCode').textContent = code ? '설정됨 (연결 가능)' : '미설정 (만들기 화면의 부모님 설정에서 암호를 넣어주세요)';
  $('#infoCloud').textContent = cloudAvailable() ? '정상 작동 중 (기기 간 자동 동기화)' : '가족 암호 필요';
}

init();
