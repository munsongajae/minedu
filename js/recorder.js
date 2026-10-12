// 마이크 녹음. https 주소(또는 localhost)에서만 동작한다.

export function canRecord() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
}

function pickAudioMime() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* 다음 */ }
  }
  return '';
}

/**
 * 녹음을 시작한다. 돌려받은 stop()을 부르면 Blob으로 끝난다.
 * 마이크를 쓸 수 없으면 예외를 던진다(e.name === 'NotAllowedError' 등).
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const mime = pickAudioMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
    };
  });
  rec.start();
  const startedAt = Date.now();
  return {
    startedAt,
    stop() { if (rec.state !== 'inactive') rec.stop(); return done; }
  };
}

export function micErrorMessage(e) {
  const name = e && e.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 사용이 막혀 있어요. 주소창 옆 자물쇠 아이콘을 눌러 마이크를 허용해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '마이크를 찾을 수 없어요. 마이크가 연결돼 있는지 확인해 주세요.';
  if (name === 'NotReadableError') return '다른 앱이 마이크를 쓰고 있어요. 그 앱을 닫고 다시 해 보세요.';
  return '녹음을 시작하지 못했어요. 녹음 파일을 골라서 넣어도 돼요.';
}
