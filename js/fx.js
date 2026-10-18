// 영상 화면 효과: 장면 넘김, 사진 움직임, 그리고 효과에 쓰는 작은 계산들.
// video.js의 drawFrame이 부른다(자막·제목 화면 효과는 글자 배치가 필요해서 video.js에 있다).
// 고른 값: project.opts.fx = { trans, move, sub, cards }, 장면마다 scene.fx = { trans, move } ('' = 영상 설정대로)

export const TRANS = { auto: '돌아가며', fade: '스르륵', slide: '옆으로 밀기', circle: '동그랗게', blocks: '블록 조각', black: '까맣게', cut: '바로' };
export const MOVES = { auto: '돌아가며', in: '다가가기', out: '멀어지기', pan: '옆으로 훑기', still: '가만히' };
export const SUBS = { plain: '그냥', rise: '아래에서 쏙', pop: '낱말 톡톡', karaoke: '읽는 낱말 칠하기' };
export const FX_DEFAULT = { trans: 'auto', move: 'auto', sub: 'rise', cards: true };

export function fxOf(project) {
  const f = { ...FX_DEFAULT, ...((project.opts && project.opts.fx) || {}) };
  if (!TRANS[f.trans]) f.trans = FX_DEFAULT.trans;
  if (!MOVES[f.move]) f.move = FX_DEFAULT.move;
  if (!SUBS[f.sub]) f.sub = FX_DEFAULT.sub;
  f.cards = f.cards !== false;
  return f;
}

// 장면 넘김에 걸리는 시간(새 장면의 앞부분에서 앞 장면과 겹친다)
export const TRANS_DUR = { fade: 0.7, slide: 0.7, circle: 0.8, blocks: 1.0, black: 0.8, cut: 0 };
const AUTO_TRANS = ['fade', 'slide', 'circle', 'blocks'];
const AUTO_MOVES = ['in', 'pan', 'out', 'panL'];

/** 장면마다 넘김 효과, 사진마다 움직임을 정한다. '돌아가며'는 차례로 바꿔 쓴다. */
export function resolveFx(project, scenes) {
  const base = fxOf(project);
  let g = 0;
  const per = scenes.map((s, i) => {
    const own = s.fx || {};
    let trans = TRANS[own.trans] ? own.trans : base.trans;
    if (trans === 'auto') trans = AUTO_TRANS[i % AUTO_TRANS.length];
    const mv = MOVES[own.move] ? own.move : base.move;
    const moves = s.images.map(() => {
      const m = mv === 'auto' ? AUTO_MOVES[g % AUTO_MOVES.length] : mv === 'pan' ? (g % 2 ? 'panL' : 'pan') : mv;
      g++;
      return m;
    });
    return { trans, moves };
  });
  const endTrans = base.trans === 'auto' ? AUTO_TRANS[scenes.length % AUTO_TRANS.length] : base.trans;
  return { sub: base.sub, cards: base.cards, scenes: per, endTrans };
}

/* ---------- 작은 계산 ---------- */
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeInOut = (p) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p));
export const easeOut = (p) => 1 - Math.pow(1 - clamp01(p), 3);
export function backOut(p) {
  p = clamp01(p);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}
// 늘 같은 값을 주는 가짜 무작위(프레임마다 같은 모양이 나오게)
export const rand = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// 사진 움직임: 처음과 끝은 천천히, 가운데는 조금 빠르게. 1을 넘으면(다음 장면과 겹칠 때) 같은 빠르기로 조금 더 간다.
function glide(p) {
  if (p <= 0) return 0;
  if (p <= 1) return 0.4 * p + 0.6 * easeInOut(p);
  return Math.min(1.08, 1 + 0.4 * (p - 1));
}

/**
 * 사진 움직임: s = 크기(1 = 화면에 꽉), dx = 보이는 곳(-1 왼쪽 끝 ~ 1 오른쪽 끝)
 * soft = 16:9가 아닌 사진(흐린 배경 위에 전체를 보여 줌)은 덜 키운다(위아래가 덜 잘리게).
 */
export function motionAt(m, p, soft) {
  const A = soft ? 0.1 : 0.18;
  const e = glide(p);
  const lim = (v) => Math.max(-1, Math.min(1, v));
  switch (m) {
    case 'in': return { s: 1 + A * e, dx: 0 };
    case 'out': return { s: 1 + A * Math.max(0, 1 - e), dx: 0 };
    case 'pan': return { s: 1 + A * 0.85, dx: lim(-1 + 2 * e) };
    case 'panL': return { s: 1 + A * 0.85, dx: lim(1 - 2 * e) };
    default: return { s: 1, dx: 0 };
  }
}

/* ---------- 장면 넘김 ---------- */
/**
 * 앞 장면(A)과 새 장면(B)을 합쳐 그린다. p = 0(앞 장면) ~ 1(새 장면).
 * A, B는 W×H 캔버스.
 */
export function compose(ctx, kind, p, A, B, W, H) {
  const e = easeInOut(p);
  ctx.save();
  if (kind === 'slide') {
    ctx.drawImage(A, -e * W, 0);
    ctx.drawImage(B, (1 - e) * W, 0);
    // 두 장면 사이 얇은 그림자
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect((1 - e) * W - 6, 0, 6, H);
  } else if (kind === 'circle') {
    ctx.drawImage(A, 0, 0);
    const R = Math.hypot(W / 2, H / 2) * 1.02 * e;
    if (R > 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1 - e;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'blocks') {
    drawBlocks(ctx, p, A, B, W, H);
  } else if (kind === 'black') {
    if (p < 0.5) { ctx.drawImage(A, 0, 0); ctx.fillStyle = `rgba(0,0,0,${(easeInOut(p * 2)).toFixed(3)})`; }
    else { ctx.drawImage(B, 0, 0); ctx.fillStyle = `rgba(0,0,0,${(1 - easeInOut((p - 0.5) * 2)).toFixed(3)})`; }
    ctx.fillRect(0, 0, W, H);
  } else if (kind === 'cut') {
    ctx.drawImage(B, 0, 0);
  } else {
    // 스르륵 겹치기
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = e;
    ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
}

// 블록 조각: 80px 네모 블록이 왼쪽 위부터 하나씩 톡 놓이며 새 장면이 된다(가운데에서 커지며 살짝 튀어나옴).
const CELL = 80;
function drawBlocks(ctx, p, A, B, W, H) {
  ctx.drawImage(A, 0, 0);
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const POP = 0.22;
  const pending = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const th = ((c + r) / (cols + rows - 2)) * 0.58 + rand(c * 31 + r * 7) * (1 - 0.58 - POP);
      const q = (p - th) / POP;
      if (q <= 0) continue;
      const x = c * CELL, y = r * CELL;
      if (q >= 1) ctx.drawImage(B, x, y, CELL, CELL, x, y, CELL, CELL);
      else pending.push([x, y, q]);
    }
  }
  // 놓이는 중인 블록은 다 놓인 블록 위에 그린다(살짝 크게 튀었다가 제자리).
  for (const [x, y, q] of pending) {
    const k = backOut(q);
    const s = CELL * k;
    const dx = x + (CELL - s) / 2, dy = y + (CELL - s) / 2;
    ctx.drawImage(B, x, y, CELL, CELL, dx, dy, s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(20,20,20,${(0.7 * (1 - q)).toFixed(3)})`;
    ctx.strokeRect(dx + 1.5, dy + 1.5, s - 3, s - 3);
  }
}
