# CLAUDE.md — 곰이난이 블록 스튜디오

이 저장소에서 작업하는 Claude Code가 먼저 읽는 안내입니다.

## 무엇을 만드는가

10살 쌍둥이(곰이, 난이)가 마인크래프트 에듀케이션 게임 화면으로 영어 영상을 만드는 웹앱.
흐름: 캡처 사진 → 한글 설명 → 영어 문장(아이가 먼저 쓰고 AI 선생님이 확인, 또는 AI 번역) → 아이 목소리 녹음 → 자막 영상 파일.
아이가 혼자 쓸 수 있어야 한다. 화면 글은 쉬운 해요체 한국어, 버튼은 크게.

## 대상 환경

- Windows PC의 크롬·엣지, 갤럭시탭의 크롬(안드로이드). 둘 다에서 확인할 것. 맥북은 크롬 권장(사파리는 시험 안 함, 사파리는 7일 넘게 안 쓰면 사이트 저장 데이터를 지울 수 있음). 사진 넣기 안내는 맥이면 Cmd+Ctrl+Shift+4 / Cmd+V(`#howMac`).
- GitHub Pages(https)로 배포하는 정적 사이트(https://munsongajae.github.io/minedu/).
- 서버 쪽은 Supabase Edge Function `coach` 하나뿐(`supabase/functions/coach/index.ts`, Deno): AI 도우미 + 작품 서버 저장. 앱은 `js/config.js`의 `COACH_URL`로 부른다. Gemini API(`generateContent`, JSON 스키마 출력)를 부른다. 프로젝트 ref: `uwqakkbwaqtrrqvhzzvz`.
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
- 데이터는 기기의 IndexedDB(`js/storage.js`, 저장소 projects·progress·meta)가 기본. 프로젝트 객체 안에 이미지·오디오 Blob을 그대로 저장한다. 가족 암호가 있으면 서버(Supabase Storage)에도 자동으로 올린다.
- 영상은 `js/video.js`에서 캔버스(1280×720)에 그리고 `canvas.captureStream` + Web Audio(`MediaStreamDestination`) + `MediaRecorder`로 실시간 녹화한다. 그리기 시계는 `AudioContext.currentTime`.
- 영상 녹화 주의: 소리 트랙에 소리가 끊기면 mp4 녹화가 앞부분(약 1~2초)만 저장되는 문제가 있어서, 들리지 않는 아주 작은 소리(`hum`)를 늘 흘린다. 그리기는 requestAnimationFrame 흐름 하나만 돌리고, 느린 타이머는 그리기가 멈췄을 때만 대신 그린다.
- 시험: `/opt/pw-browsers`의 Chromium + Python Playwright로 PDF 넣기 → 영상 만들기 → 저장까지 돌릴 수 있다(오픈소스 Chromium이라 mp4가 H.264가 아닌 VP9로 나오는 건 정상).
- 색과 글꼴은 `css/style.css` 맨 위 `:root` 토큰만 쓴다. 다크 모드 값은 바로 아래 미디어 쿼리.
- 앱 파일을 바꾸면 `sw.js`의 `CACHE` 이름 숫자를 올린다(안 올리면 기기에 옛 버전이 남을 수 있음). 새 JS 파일을 만들면 `ASSETS`에도 넣는다.
- 상표 보호: 마인크래프트 로고·캐릭터·공식 블록 텍스처를 그리거나 넣지 않는다. 블록 풍경은 직접 만든 일반 그림만.

## 문장 연습·단어 게임 (practice.html, words.html)

- 세 페이지 위쪽 메뉴(`.topnav`): 만들기(index.html) / 문장 연습 / 단어 게임. 공통 코드는 `js/learn.js`.
- 아이 고르기: `CHILDREN = ['곰이', '난이']`, 마지막 선택은 localStorage(`block-studio-child`). 연습 기록은 아이별로 따로: IndexedDB `progress` 저장소(DB v2) `{ id: 아이, sentences: {줄id: item}, words: {단어: item}, emeralds, days }`.
- 문장 모음: 모든 영상의 영어가 있는 문장 줄(`loadSentences`). 예시 영상은 다른 문장이 없을 때만.
- 복습 상자(라이트너, `grade`/`todayQueue`): 맞히면 다음 상자, 틀리면 1번. 상자별 다시 나오는 간격 `BOX_DAYS` 1:0, 2:1, 3:3, 4:7, 5:14일. 하루 최대 8문장, 새 문장 3개까지.
- 문장 연습 단계(`practice.js`, 상자에 따라): 1번 듣고 따라 말하기 → 블록 쌓기, 2번 블록 쌓기, 3번 빈칸 채우기, 4·5번 한글 보고 말해 보기(정답 보고 스스로 맞음/어려움). 말하기 채점(음성 인식)은 넣지 않는다. 틀린 문장은 그 연습 끝에 한 번 더.
- 말하며 외우기(`startMemorize`/`runMemorize`, 언제든): 덜 외운 문장부터 10개. 1단계 영어 보며 말하기 → 2단계 세 글자 이상 낱말을 하나 건너 하나 첫 글자만 남기고 가리기(눌러서 1.5초 엿보기) → 3단계 모두 가리고 한글 뜻만 보고 말하기(첫 글자 힌트 가능) → 정답 보기 → 스스로 '외웠어요/더 연습할래요'. 결과는 복습 상자에도 반영(`record`).
- 단어 짝 맞추기(`words.js`): 문장의 AI 낱말(`words`) + 문장 속 단어(쉬운 낱말 제외). 뜻이 없으면 `coach`의 `glossary`(Gemini, 40개씩)로 채워 IndexedDB `meta`의 `glossary`에 둔다. 4/6/8쌍, 잘 모르는 단어 먼저.
- 연습 기록은 서버에도 `cloud_get`/`cloud_put`(kv/progress-<아이 이름 UTF-8 hex>.json)로 올리고, 기기끼리는 문장·단어마다 더 나중 기록, 에메랄드는 큰 값, 연습한 날은 합쳐서 맞춘다(`mergeProgress`).

## 서버 저장(다른 기기에서 이어서 하기)

- 로그인 없이 가족 암호로 연다. `coach` 함수의 `cloud_*` 동작: `cloud_list`, `cloud_head {id}`, `cloud_need {hashes}`, `cloud_save {id, doc, baseRev, device, force?}`, `cloud_load {id}`, `cloud_delete {id}`.
- 저장소: Supabase Storage 비공개 버킷 `blockstudio`(함수가 처음 쓸 때 만듦). `docs/<id>.json` = 작품 내용(사진·소리는 `{ref: sha256, type}`), `media/<sha256>` = 파일. 같은 파일은 한 번만 올라간다.
- 큰 파일은 함수를 거치지 않는다: `cloud_need`가 없는 파일만 서명된 업로드 주소를 주고, 앱이 그 주소로 바로 PUT(FormData)한다. 내려받기도 서명된 주소(1시간).
- 엇갈림: 서버 문서의 `rev`와 앱이 아는 `project.cloud.rev`가 다르면 409 `conflict`. 앱은 "그 기기 것 불러오기"(이 기기 것은 '(이 기기 사본)'으로 남김) 또는 "이 기기 것으로 덮어쓰기"(`force`)를 고르게 한다.
- 앱(`js/cloud.js`, app.js의 '서버 저장' 부분): 고칠 때마다 `project.cloud.dirty`를 켜고 3초 뒤 자동으로 올린다. 열 때·다시 돌아왔을 때 `cloud_head`로 확인해서, 이 기기에 안 올린 고침이 없으면 새 내용을 저절로 받고, 있으면 엇갈림을 묻는다. 예시 영상(`project.example`)은 올리지 않는다.
- `project.cloud = { on, rev, dirty, seq, syncedAt, device, serverAt }`. 기기 이름은 localStorage(`block-studio-device`, 기본 'PC'/'태블릿').
- 함수 코드를 고치면 Supabase에 다시 붙여 넣어야 한다. 시험은 Playwright `context.route`로 함수와 저장소를 흉내 내서 두 기기(컨텍스트)로 한다.

## 배경 음악

- 아이·부모가 무료 음원 사이트(Pixabay Music, YouTube 오디오 보관함, 공유마당 등)에서 받은 파일을 넣는다. 사이트 API로 받아오지는 않는다(대부분 공개 API가 없고 곡마다 이용 조건이 다름).
- `project.music = null | { blob, name, dur, vol(0~1, 기본 0.3), credit }`. 영상 만들기 판의 `#music` 칸.
- `video.js`의 `musicEnvelope()`가 크기 곡선을 만든다: 처음 1.5초 커짐, 끝 2초 작아짐, 목소리 구간은 30%(`MUSIC_DUCK`, 0.8초 안쪽 틈은 이어서 줄임). `setValueCurveAtTime` 한 번으로 건다. 음악이 영상보다 짧으면 반복.
- `credit`가 있으면 The End 화면 아래(끝 화면이 꺼져 있으면 마지막 장면 끝 3초 위쪽)에 작게 쓴다.

## 발음 들어 보기

- `js/speech.js`. 브라우저 음성 합성(speechSynthesis). 목소리 목록이 늦게 준비되는 크롬을 위해 `voiceschanged`를 기다리고(최대 1.5초), `pickVoice`가 en-US 중 Natural/Neural(엣지) → Google → Samsung → 기기 목소리 순으로 고른다.
- 빠르기 3단계 `SPEEDS`(보통 0.9, 천천히 0.7 기본, 아주 천천히 0.5). 기기 localStorage에 기억.
- '한 단어씩'은 낱말마다 따로 읽고 빠르기에 따라 0.25~0.6초 쉰다. 읽는 동안 문장 아래 따라 읽기 표시(`[data-follow]`)에서 지금 낱말을 칠한다(문장 통째로 읽을 때는 목소리가 boundary 이벤트를 줄 때만).
- 녹음·말로 쓰기와 동시에 쓰지 않는다. 시험은 speechSynthesis/SpeechSynthesisUtterance를 가짜로 바꿔서 한다.

## 말로 쓰기(음성 입력)

- `js/dictation.js`. 브라우저 음성 인식(Web Speech API, `SpeechRecognition`/`webkitSpeechRecognition`). 한글 칸은 `ko-KR`, '내가 먼저 영어로 써 보기' 칸(AI가 꺼져 있으면 영어 칸)은 `en-US`(`DICT_FIELDS`, app.js). 크롬·엣지(PC, 안드로이드)에서 되고, 없으면 버튼을 숨긴다.
- `continuous = false`: 한 번 누르면 말이 끝날 때까지 듣고 멈춘다(안드로이드 continuous 모드의 글 겹침 문제 회피). 듣는 동안 글자를 미리 보여주고, 끝나면 기존 글 뒤에 이어 붙인다. 한국어는 마침표, 영어는 첫 글자 대문자·단독 i→I·마침표(`tidyKorean`, `tidyEnglish`). 영어로 말해 고치면 예전 선생님 확인 결과는 지운다.
- 녹음(마이크)과 동시에 쓰지 않는다. 말소리는 브라우저 회사의 인식 서버로 간다(크롬은 Google).
- 시험: Playwright 초기화 스크립트로 `SpeechRecognition`과 `webkitSpeechRecognition` 둘 다 가짜 클래스로 바꿔서 한다.

## 포트폴리오 PDF 가져오기

- `js/pdf-import.js`. 라이브러리 없이 PDF 바이트를 직접 읽는다(Haru PDF Library가 만든 단순한 PDF 1.3: 압축 안 된 객체, 페이지마다 DCTDecode JPEG 한 장).
- 페이지 트리 순서대로 JPEG를 꺼낸다. 구조를 못 읽으면 객체 번호 순서로 모든 JPEG(200px 이상).
- 표지(사진 없는 첫 페이지)의 글에서 월드 이름을 골라 빈 제목에 넣는다. 사진 페이지에 글이 있으면 설명 글로 넣는다(한글이면 `ko`, 아니면 `attempt`).
- 사진은 1010×1010에 폴라로이드 테두리가 있고, 게임 화면은 (77,77)–(933,820) 자리(약 856×743). `findPhotoRect`가 밝은 회색 테두리를 찾아 자르고, 정사각형 사진에서 결과가 어긋나면 표준 위치(`STD`)를 쓴다.
- 영상(`video.js`)에서 16:9와 많이 다른 사진은 흐린 배경(`makeBackdrop`, 한 번만 만들어 둠) 위에 사진 전체를 보여준다.

## 데이터 모양

장면 = 사진 여러 장(`images`) + 문장 줄 여러 개(`lines`). 녹음·AI·자막은 문장 줄 단위, 사진은 장면 시간을 똑같이 나눠 차례로 보여준다(넘어갈 때 0.5초 겹침).

```js
project = {
  id, title, makers, createdAt, updatedAt,
  opts: { title: bool, ko: bool, end: bool },   // 제목 화면, 한글 자막, The End 화면
  music: null | { blob, name, dur, vol, credit },
  scenes: [{
    id, images: [Blob], example?,           // 사진 순서 = 영상에 나오는 순서
    lines: [{
      id, ko, en,                            // en = 자막에 들어가는 최종 영어 문장
      mode: 'self'|'ai', attempt,            // 영어 만드는 방법, 아이가 먼저 쓴 영어
      feedback: {corrected, praise, fixes[]}|null, words: [{en, ko}],
      audio: Blob|null, audioName, audioDur
    }]
  }]
}
// 예전 모양(장면에 image 한 장, ko/en/audio가 바로 있던 것)은 app.js의 fixScene()이 images·lines로 바꾼다.
// '아래 장면과 합치기'는 아래 장면의 사진을 이어 붙이고, 무언가 쓴 문장만 옮긴다.
```

영상 타이밍(`video.js`): 장면 길이 = LEAD + 문장들 길이 합 + 문장 사이 GAP + TAIL. 문장 길이는 녹음 길이,
녹음이 없으면 `textDur(en)`(낱말 수로 2.5~7초). 자막은 지금 읽는 문장 하나만 보여준다.

## 실행과 확인

```bash
python3 -m http.server 8080   # http://localhost:8080
```

바꾼 뒤에는 최소한: 예시 장면으로 영상 만들기 → 재생 → 저장, 새 영상에서 사진 넣기 → 문장 더하기 → 문장마다 녹음 → 영상 만들기.

## 다음에 하면 좋은 것 (아직 안 함)

- 장면 순서 끌어서 바꾸기, 장면별 길이 조절.
- 단어 게임 더하기(스펠링 블록, 듣고 고르기, 둘이 대결), 부모님 보기(아이별 연습 현황).
