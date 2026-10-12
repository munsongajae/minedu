// 블록 풍경 그리기: 예시 장면 사진과, 사진이 없을 때 제목 화면 배경으로 쓴다.

export function drawBlockWorld(ctx, W, H, withHouse) {
  const B = Math.round(W / 32);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6fb2e8');
  sky.addColorStop(1, '#bfe2f6');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(W * 0.78, B * 1.5, B * 2, B * 2);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  [[3, 2, 5], [12, 1, 4], [20, 3, 6]].forEach(([x, y, w]) => {
    ctx.fillRect(x * B, y * B, w * B, B);
    ctx.fillRect((x + 1) * B, (y - 0.5) * B, (w - 2) * B, B * 0.6);
  });

  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cols = Math.ceil(W / B);
  const rows = Math.ceil(H / B);
  const ground = [];
  for (let c = 0; c < cols; c++) ground[c] = 11 + Math.round(Math.sin(c / 4) * 1.2 + (c > 20 ? 1 : 0));

  const block = (c, r, base, spots) => {
    ctx.fillStyle = base;
    ctx.fillRect(c * B, r * B, B, B);
    const s = B / 5;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = spots[i % spots.length];
      ctx.fillRect(c * B + Math.floor(rnd() * 5) * s, r * B + Math.floor(rnd() * 5) * s, s, s);
    }
  };

  for (let c = 0; c < cols; c++) {
    const g = ground[c];
    const water = c >= 22 && c <= 27;
    for (let r = g; r < rows; r++) {
      if (water && r < g + 2) block(c, r, '#3f76e4', ['#5a8cf0', '#3466cc']);
      else if (r === g) block(c, r, '#5da33a', ['#6fb84a', '#4e8f2f']);
      else if (r < g + 3) block(c, r, '#86603c', ['#76532f', '#97704a']);
      else block(c, r, '#7d7d7d', ['#8e8e8e', '#6b6b6b']);
    }
  }

  if (withHouse) {
    const hx = 12, hy = ground[12];
    for (let c = hx; c < hx + 6; c++) for (let r = hy - 4; r < hy; r++) block(c, r, '#b98a53', ['#a77a46', '#c79a62']);
    for (let c = hx - 1; c < hx + 7; c++) block(c, hy - 5, '#7a5230', ['#6a4628', '#8a5f3a']);
    for (let c = hx; c < hx + 6; c++) block(c, hy - 6, '#7a5230', ['#6a4628']);
    ctx.fillStyle = '#5a3b20';
    ctx.fillRect((hx + 2) * B, (hy - 2) * B, B, B * 2);
    ctx.fillStyle = '#a9d8f2';
    ctx.fillRect((hx + 4) * B + B * 0.15, (hy - 3) * B + B * 0.15, B * 0.7, B * 0.7);

    const tx = 6, ty = ground[6];
    for (let r = ty - 4; r < ty; r++) block(tx, r, '#6b4a2b', ['#5a3d22']);
    for (let c = tx - 2; c <= tx + 2; c++) {
      for (let r = ty - 7; r < ty - 4; r++) {
        if (!(Math.abs(c - tx) === 2 && r === ty - 7)) block(c, r, '#3f8a2a', ['#4fa034', '#2f6e1f']);
      }
    }
  }
}

export function makeExampleImage() {
  return new Promise(resolve => {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    drawBlockWorld(c.getContext('2d'), 1280, 720, true);
    c.toBlob(b => resolve(b), 'image/png');
  });
}
