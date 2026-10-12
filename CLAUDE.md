# CLAUDE.md — 곰이난이 블록 스튜디오

이 저장소에서 작업하는 Claude Code가 먼저 읽는 안내입니다.

## 무엇을 만드는가

10살 쌍둥이(곰이, 난이)가 마인크래프트 에듀케이션 게임 화면으로 영어 영상을 만드는 웹앱.
흐름: 캡처 사진 → 한글 설명 → 영어 문장(아이가 먼저 쓰고 AI 선생님이 확인, 또는 AI 번역) → 아이 목소리 녹음 → 자막 영상 파일.
아이가 혼자 쓸 수 있어야 한다. 화면 글은 쉬운 해요체 한국어, 버튼은 크게.

## 대상 환경

- Windows PC의 크롬·엣지, 갤럭시탭의 크롬(안드로이드). 둘 다에서 확인할 것.
- GitHub Pages(https)로 배포하는 정적 사이트(https://munsongajae.github.io/minedu/).
- 서버 쪽은 Supabase Edge Function `coach` 하나뿐(`supabase/functions/coach/index.ts`, Deno). 앱은 `js/config.js`의 `COACH_URL`로 부른다. Gemini API(`generateContent`, JSON 스키마 출력)를 부른다. 프로젝트 ref: `uwqakkbwaqtrrqvhzzvz`.
- 마이크(getUserMedia)는 https나 localhost에서만 된다.

## AI 영어 도우미

- 앱 → `js/ai.js`의 `coach(action, payload)` → POST `COACH_URL`(`js/config.js`). 헤더 `x-family-code`에 가족 암호(기기 localStorage).
- action: `ping`, `translate {ko}` → `{english, words[]}`, `check {ko, attempt}` → `{corrected, praise, fixes[]}`.
- 함수는 `verify_jwt = false`. 대신 Secret `APP_PASSCODE`와 비교하고, CORS는 `ALLOWED_ORIGINS`(기본 GitHub Pages 주소) + localhost만 허용, 글 600자 제한, 간단한 분당 횟수 제한.
- Gemini 키(`GEMINI_API_KEY`)는 Supabase Secret에만 둔다. 브라우저 코드나 저장소에 절대 넣지 않는다.
- 모델은 Secret `GEMINI_MODEL`(기본 `gemini-3.5-flash-lite`). 모델 이름은 바뀔 수 있으니 바꿀 때 Google 문서에서 현재 안정판을 확인한다.
- 함수 코드를 고치면 Supabase에 다시 배포해야 반영된다(대시보드에서 coach 함수 편집기에 붙여 넣고 Deploy updates).
- 아이에게 보이는 AI 글(칭찬, 고친 이유)은 쉬운 해요체 한국어. 프롬프트는 함수 안 `STYLE`, `translatePrompt`, `checkPrompt`.

## 기술 원칙

- 빌드 도구·프레임워크 없이 순수 HTML/CSS/JS(ES 모듈). npm 의존성을 추가하지 않는다.
- 데이터는 IndexedDB(`js/storage.js`)에만. 프로젝트 객체 안에 이미지·오디오 Blob을 그대로 저장한다.
- 영상은 `js/video.js`에서 캔버스(1280×720)에 그리고 `canvas.captureStream` + Web Audio(`MediaStreamDestination`) + `MediaRecorder`로 실시간 녹화한다. 그리기 시계는 `AudioContext.currentTime`.
- 영상 녹화 주의: 소리 트랙에 소리가 끊기면 mp4 녹화가 앞부분(약 1~2초)만 저장되는 문제가 있어서, 들리지 않는 아주 작은 소리(`hum`)를 늘 흘린다. 그리기는 requestAnimationFrame 흐름 하나만 돌리고, 느린 타이머는 그리기가 멈췄을 때만 대신 그린다.
- 시험: `/opt/pw-browsers`의 Chromium + Python Playwright로 PDF 넣기 → 영상 만들기 → 저장까지 돌릴 수 있다(오픈소스 Chromium이라 mp4가 H.264가 아닌 VP9로 나오는 건 정상).
- 색과 글꼴은 `css/style.css` 맨 위 `:root` 토큰만 쓴다. 다크 모드 값은 바로 아래 미디어 쿼리.
- 앱 파일을 바꾸면 `sw.js`의 `CACHE` 이름 숫자를 올린다(안 올리면 기기에 옛 버전이 남을 수 있음). 새 JS 파일을 만들면 `ASSETS`에도 넣는다.
- 상표 보호: 마인크래프트 로고·캐릭터·공식 블록 텍스처를 그리거나 넣지 않는다. 블록 풍경은 직접 만든 일반 그림만.

## 포트폴리오 PDF 가져오기

- `js/pdf-import.js`. 라이브러리 없이 PDF 바이트를 직접 읽는다(Haru PDF Library가 만든 단순한 PDF 1.3: 압축 안 된 객체, 페이지마다 DCTDecode JPEG 한 장).
- 페이지 트리 순서대로 JPEG를 꺼낸다. 구조를 못 읽으면 객체 번호 순서로 모든 JPEG(200px 이상).
- 표지(사진 없는 첫 페이지)의 글에서 월드 이름을 골라 빈 제목에 넣는다. 사진 페이지에 글이 있으면 설명 글로 넣는다(한글이면 `ko`, 아니면 `attempt`).
- 사진은 1010×1010에 폴라로이드 테두리가 있고, 게임 화면은 (77,77)–(933,820) 자리(약 856×743). `findPhotoRect`가 밝은 회색 테두리를 찾아 자르고, 정사각형 사진에서 결과가 어긋나면 표준 위치(`STD`)를 쓴다.
- 영상(`video.js`)에서 16:9와 많이 다른 사진은 흐린 배경(`makeBackdrop`, 한 번만 만들어 둠) 위에 사진 전체를 보여준다.

## 데이터 모양

장면 = 사진 한 장 + 문장 줄 여러 개. 녹음·AI·자막은 모두 문장 줄 단위.

```js
project = {
  id, title, makers, createdAt, updatedAt,
  opts: { title: bool, ko: bool, end: bool },   // 제목 화면, 한글 자막, The End 화면
  scenes: [{
    id, image: Blob, example?,
    lines: [{
      id, ko, en,                            // en = 자막에 들어가는 최종 영어 문장
      mode: 'self'|'ai', attempt,            // 영어 만드는 방법, 아이가 먼저 쓴 영어
      feedback: {corrected, praise, fixes[]}|null, words: [{en, ko}],
      audio: Blob|null, audioName, audioDur
    }]
  }]
}
// 예전 모양(장면에 ko/en/audio가 바로 있던 것)은 app.js의 fixScene()이 lines 하나로 바꾼다.
```

영상 타이밍(`video.js`): 장면 길이 = LEAD + 문장들 길이 합 + 문장 사이 GAP + TAIL. 문장 길이는 녹음 길이,
녹음이 없으면 `textDur(en)`(낱말 수로 2.5~7초). 자막은 지금 읽는 문장 하나만 보여준다.

## 실행과 확인

```bash
python3 -m http.server 8080   # http://localhost:8080
```

바꾼 뒤에는 최소한: 예시 장면으로 영상 만들기 → 재생 → 저장, 새 영상에서 사진 넣기 → 문장 더하기 → 문장마다 녹음 → 영상 만들기.

## 다음에 하면 좋은 것 (아직 안 함)

- 프로젝트 백업·옮기기: 프로젝트를 zip 하나로 내보내고 다른 기기에서 불러오기(PC ↔ 태블릿).
- 장면 순서 끌어서 바꾸기, 장면별 길이 조절, 배경 음악.
