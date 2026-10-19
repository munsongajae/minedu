// 인쇄하기(한꺼번에 보기에서): 인쇄용 화면을 만들어 브라우저 인쇄 창(window.print)을 연다.
// 인쇄 창에서 프린터로 뽑거나 'PDF로 저장'을 고를 수 있다. 파일을 따로 만들지 않는다.
//   문장 카드     : 사진 + 영어 + 한글 뜻(크게: 한 줄에 하나, 작게: 두 개씩). 한 사진(장면)의 문장 여러 개는 카드 하나에 모은다.
//   외우기 학습지 : 사진 + 가린 문장(첫 단어 / 첫 글자 / 빈 줄만) + 쓰는 줄, 정답은 맨 끝 장에
//   접는 플래시카드: 위 칸(사진 + 한글 뜻)과 아래 칸(영어, 거꾸로)을 가운데에서 접으면 앞뒤가 된다
//   단어장        : 문장에 나온 단어와 뜻 + 써 보기 칸
// 사진: 크게 / 작게 / 빼기(문장만 인쇄). 고른 값은 localStorage `block-studio-print`. 흑백 프린터에서도 보이게 색 대신 테두리·굵기로 구분한다.
import { $, esc, blobURL, collectWords, loadGlossary } from './learn.js';
import { wordsOf } from './speech.js';

const OPT_KEY = 'block-studio-print';
let opts = { kind: 'cards', ko: true, photo: 'big', hide: 'first', name: true };
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch (e) { /* 처음 */ }
const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch (e) { /* 무시 */ } };

let ctx = null;      // { list, title, child, show, onBack }
let glossary = {};

const KINDS = { cards: '영어 문장 카드', sheet: '영어 외우기 학습지', flash: '접는 플래시카드', words: '나의 영어 단어장' };

export async function openPrint(c) {
  ctx = c;
  // 영상 고르기: 모든 영상 + 문장이 있는 영상
  $('#prProj').innerHTML = `<option value="">모든 영상 (${c.total}문장)</option>` +
    c.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)} (${p.n}문장)</option>`).join('');
  $('#prProj').value = c.projects.some(p => p.id === c.pid) ? c.pid : '';
  Object.assign(ctx, c.listFor($('#prProj').value));
  glossary = await loadGlossary();
  drawOpts();
  drawSheet();
  ctx.show('print');
  window.scrollTo(0, 0);
}

/* ---------- 고르기 ---------- */
function drawOpts() {
  document.querySelectorAll('#printView [data-popt]').forEach(g => {
    const key = g.dataset.popt;
    g.querySelectorAll('button').forEach(b => {
      const on = String(opts[key]) === b.dataset.v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  // 모양마다 쓰는 선택지만 보여 준다.
  const k = opts.kind;
  $('#prOptKo').hidden = k === 'flash';
  $('#prOptPhoto').hidden = k === 'words';
  // 플래시카드는 사진 크기가 정해져 있어서 '넣기/빼기'만
  const small = document.querySelector('#prOptPhoto [data-v="small"]');
  small.hidden = k === 'flash';
  document.querySelector('#prOptPhoto [data-v="big"]').textContent = k === 'flash' ? '넣기' : '크게';
  if (k === 'flash' && opts.photo === 'small') document.querySelector('#prOptPhoto [data-v="big"]').classList.add('on');
  $('#prOptHide').hidden = k !== 'sheet';
  const n = ctx.list.length;
  $('#prCount').textContent = k === 'words'
    ? `문장 ${n}개에 나온 단어로 만들어요.`
    : `문장 ${n}개를 인쇄해요.${ctx.q ? ` (검색어 '${ctx.q}'에 맞는 문장만)` : ''}`;
}
$('#printView').addEventListener('click', (e) => {
  const b = e.target.closest('[data-popt] button');
  if (!b) return;
  const key = b.closest('[data-popt]').dataset.popt;
  const v = b.dataset.v;
  opts[key] = v === 'true' ? true : v === 'false' ? false : v;
  saveOpts(); drawOpts(); drawSheet();
});
$('#prProj').addEventListener('change', (e) => {
  Object.assign(ctx, ctx.listFor(e.target.value));
  drawOpts(); drawSheet();
});
$('#prBack').addEventListener('click', () => ctx.onBack());
$('#prGo').addEventListener('click', async () => {
  // 사진이 다 그려진 다음에 인쇄 창을 연다.
  await Promise.all([...document.querySelectorAll('#printSheet img')].map(img => (img.decode ? img.decode().catch(() => {}) : null)));
  window.print();
});

/* ---------- 만들기 ---------- */
function headerHTML(title, sub) {
  const name = opts.name
    ? `<div class="pr-name"><span>이름: <b>${ctx.child ? esc(ctx.child) : '<i class="pr-fill"></i>'}</b></span><span>날짜: <i class="pr-fill short"></i>월 <i class="pr-fill short"></i>일</span></div>` : '';
  return `<header class="pr-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${name}</header>`;
}
const img = (s) => (s.image ? `<img src="${blobURL(s.image)}" alt="">` : '<span class="pr-noimg">사진 없음</span>');
const noPhoto = () => opts.photo === 'none';
const photoHTML = (s) => (noPhoto() ? '' : `<div class="pr-photo">${img(s)}</div>`);
const sizeClass = () => (noPhoto() ? 'nophoto' : opts.photo === 'small' ? 'small' : 'big');

// 같은 사진(장면)의 문장끼리 모은다. 순서는 처음 나온 차례 그대로, 번호는 문장마다.
function byScene(list) {
  const groups = [], at = new Map();
  list.forEach((s, i) => {
    const k = `${s.projectId}|${s.sceneId || s.key}`;
    if (!at.has(k)) { at.set(k, groups.length); groups.push({ s, items: [] }); }
    groups[at.get(k)].items.push({ s, no: i + 1 });
  });
  return groups;
}

// 가린 문장: first = 첫 단어만, letters = 모든 낱말 첫 글자, blank = 빈 줄만
function hidden(s, how) {
  if (how === 'blank') return '';
  const raw = wordsOf(s.en);
  return raw.map((w, i) => {
    const m = /^([^A-Za-z']*)([A-Za-z'’]+)(.*)$/.exec(w);
    if (!m) return esc(w);
    if (i === 0) return esc(w);
    const core = m[2];
    const shown = how === 'letters' ? core[0] + '_'.repeat(core.length - 1) : '_'.repeat(Math.max(2, core.length));
    return `${esc(m[1])}${esc(shown)}${esc(m[3])}`;
  }).join(' ');
}

function cardsHTML(list) {
  return `<div class="pr-cards ${sizeClass()}">${byScene(list).map(g => `
    <article class="pr-card ${g.items.length > 1 ? 'many' : ''}">
      ${photoHTML(g.s)}
      <div class="pr-text">${g.items.map(({ s, no }) => `
        <div class="pr-line">
          <span class="pr-no">${no}</span>
          <div>
            <p class="pr-en" lang="en">${esc(s.en)}</p>
            ${opts.ko && s.ko ? `<p class="pr-ko">${esc(s.ko)}</p>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </article>`).join('')}</div>`;
}

function sheetHTML(list) {
  const guide = { first: '첫 단어를 보고 문장을 완성해 써 봐요.', letters: '첫 글자를 보고 문장을 완성해 써 봐요.', blank: '사진을 보고 영어 문장을 써 봐요.' }[opts.hide];
  return `<p class="pr-guide">${guide}</p>
    <div class="pr-sheet ${sizeClass()}">${list.map((s, i) => `
      <article class="pr-row">
        ${photoHTML(s)}
        <div class="pr-work">
          <span class="pr-no">${i + 1}</span>
          ${opts.ko && s.ko ? `<p class="pr-ko">${esc(s.ko)}</p>` : ''}
          ${opts.hide !== 'blank' ? `<p class="pr-clue" lang="en">${hidden(s, opts.hide)}</p>` : ''}
          <div class="pr-lines"><i></i><i></i></div>
        </div>
      </article>`).join('')}</div>
    <section class="pr-answers">
      <h2>정답</h2>
      <ol>${list.map(s => `<li lang="en">${esc(s.en)}</li>`).join('')}</ol>
    </section>`;
}

function flashHTML(list) {
  return `<p class="pr-guide">바깥 실선을 따라 자르고, 가운데 점선에서 반으로 접어요. 앞면은 ${noPhoto() ? '한글 뜻' : '사진과 뜻'}, 뒷면은 영어 문장이에요.</p>
    <div class="pr-flash ${noPhoto() ? 'nophoto' : ''}">${list.map((s, i) => `
      <article class="pr-fc">
        <div class="pr-fc-front">
          ${photoHTML(s)}
          <p class="pr-ko">${esc(s.ko || '(한글 뜻 없음)')}</p>
          <span class="pr-no">${i + 1}</span>
        </div>
        <div class="pr-fc-fold"><span>접는 선</span></div>
        <div class="pr-fc-back"><p class="pr-en" lang="en">${esc(s.en)}</p><span class="pr-no">${i + 1}</span></div>
      </article>`).join('')}</div>`;
}

function wordsHTML(list) {
  const words = collectWords(list, glossary).filter(w => w.ko).sort((a, b) => a.en.localeCompare(b.en));
  if (!words.length) return '<p class="pr-guide">아직 뜻이 있는 단어가 없어요. 단어 게임 화면을 한 번 열면 AI가 단어 뜻을 찾아 둬요.</p>';
  return `<table class="pr-words">
      <thead><tr><th>번호</th><th>영어</th>${opts.ko ? '<th>뜻</th>' : ''}<th>써 보기</th></tr></thead>
      <tbody>${words.map((w, i) => `<tr><td>${i + 1}</td><td lang="en">${esc(w.en)}</td>${opts.ko ? `<td>${esc(w.ko)}</td>` : ''}<td class="pr-write"></td></tr>`).join('')}</tbody>
    </table>`;
}

function drawSheet() {
  const list = ctx.list;
  const title = KINDS[opts.kind];
  const sub = ctx.title;
  let body = '';
  if (!list.length) body = '<p class="pr-guide">인쇄할 문장이 없어요.</p>';
  else if (opts.kind === 'cards') body = cardsHTML(list);
  else if (opts.kind === 'sheet') body = sheetHTML(list);
  else if (opts.kind === 'flash') body = flashHTML(list);
  else body = wordsHTML(list);
  $('#printSheet').className = `print-sheet k-${opts.kind}`;
  $('#printSheet').innerHTML = headerHTML(title, sub) + body;
}
