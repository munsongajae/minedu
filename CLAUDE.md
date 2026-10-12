# CLAUDE.md — 곰이난이 블록 스튜디오

이 저장소에서 작업하는 Claude Code가 먼저 읽는 안내입니다.

## 무엇을 만드는가

10살 쌍둥이(곰이, 난이)가 마인크래프트 에듀케이션 게임 화면으로 영어 영상을 만드는 웹앱.
흐름: 캡처 사진 → 한글 설명 → 영어 문장(아이가 직접 씀) → 아이 목소리 녹음 → 자막 영상 파일.
아이가 혼자 쓸 수 있어야 한다. 화면 글은 쉬운 해요체 한국어, 버튼은 크게.

## 대상 환경

- Windows PC의 크롬·엣지, 갤럭시탭의 크롬(안드로이드). 둘 다에서 확인할 것.
- GitHub Pages(https)로 배포하는 정적 사이트. 서버 없음.
- 마이크(getUserMedia)는 https나 localhost에서만 된다.

## 기술 원칙

- 빌드 도구·프레임워크 없이 순수 HTML/CSS/JS(ES 모듈). npm 의존성을 추가하지 않는다.
- 데이터는 IndexedDB(`js/storage.js`)에만. 프로젝트 객체 안에 이미지·오디오 Blob을 그대로 저장한다.
- 영상은 `js/video.js`에서 캔버스(1280×720)에 그리고 `canvas.captureStream` + Web Audio(`MediaStreamDestination`) + `MediaRecorder`로 실시간 녹화한다. 그리기 시계는 `AudioContext.currentTime`.
- 색과 글꼴은 `css/style.css` 맨 위 `:root` 토큰만 쓴다. 다크 모드 값은 바로 아래 미디어 쿼리.
- 앱 파일을 바꾸면 `sw.js`의 `CACHE` 이름 숫자를 올린다(안 올리면 기기에 옛 버전이 남을 수 있음). 새 JS 파일을 만들면 `ASSETS`에도 넣는다.
- 상표 보호: 마인크래프트 로고·캐릭터·공식 블록 텍스처를 그리거나 넣지 않는다. 블록 풍경은 직접 만든 일반 그림만.

## 데이터 모양

```js
project = {
  id, title, makers, createdAt, updatedAt,
  opts: { title: bool, ko: bool, end: bool },   // 제목 화면, 한글 자막, The End 화면
  scenes: [{ id, image: Blob, ko, en, audio: Blob|null, audioName, audioDur, example? }]
}
```

## 실행과 확인

```bash
python3 -m http.server 8080   # http://localhost:8080
```

바꾼 뒤에는 최소한: 예시 장면으로 영상 만들기 → 재생 → 저장, 새 영상에서 사진 넣기 → 녹음 → 영상 만들기.

## 다음에 하면 좋은 것 (아직 안 함)

- AI 번역·교정: Claude API를 쓰려면 API 키를 숨길 작은 서버(예: Cloudflare Workers, Vercel 함수)가 필요하다. 키를 브라우저 코드에 넣지 말 것.
- 프로젝트 백업·옮기기: 프로젝트를 zip 하나로 내보내고 다른 기기에서 불러오기(PC ↔ 태블릿).
- 장면 순서 끌어서 바꾸기, 장면별 길이 조절, 배경 음악.
