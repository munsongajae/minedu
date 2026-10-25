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
- action: `ping`, `translate {ko}` → `{english, words[]}`, `check {ko, attempt}` → `{corrected, praise, fixes[]}`, `glossary`, 그리고 서버 저장용 `cloud_*`(아래).
- 함수는 `verify_jwt = false`. 대신 Secret `APP_PASSCODE`와 비교하고, CORS는 `ALLOWED_ORIGINS`(기본 GitHub Pages 주소) + localhost만 허용, 글 600자 제한, 간단한 분당 횟수 제한.
- Gemini 키(`GEMINI_API_KEY`)는 Supabase Secret에만 둔다. 브라우저 코드나 저장소에 절대 넣지 않는다.
- 모델은 Secret `GEMINI_MODEL`(기본 `gemini-3.5-flash-lite`). 모델 이름은 바뀔 수 있으니 바꿀 때 Google 문서에서 현재 안정판을 확인한다.
- 함수 코드를 고치면 Supabase에 다시 배포해야 반영된다(대시보드에서 coach 함수 편집기에 붙여 넣고 Deploy updates).
- 아이에게 보이는 AI 글(칭찬, 고친 이유)은 쉬운 해요체 한국어. 프롬프트는 함수 안 `STYLE`, `translatePrompt`, `checkPrompt`.

## 기술 원칙

- 빌드 도구·프레임워크 없이 순수 HTML/CSS/JS(ES 모듈). npm 의존성을 추가하지 않는다.
- 데이터는 기기의 IndexedDB(`js/storage.js`, 저장소 projects·progress·meta)가 기본. 프로젝트 객체 안에 이미지·오디오 Blob을 그대로 저장한다. 가족 암호가 있으면 서버(Supabase Storage)에도 자동으로 올린다.
- 영상은 `js/video.js`에서 캔버스(1280×720)에 그리고 `canvas.captureStream` + Web Audio(`MediaStreamDestination`) + `MediaRecorder`로 실시간 녹화한다. 그리기 시계는 `AudioContext.currentTime`.
- 화면 효과(사용자 요청 2026-10-18, `js/fx.js` + video.js): 영상 전체는 `project.opts.fx = { trans, move, sub, cards }`(기본 auto·auto·rise·true, `fxOf`), 장면마다 `scene.fx = { trans?, move? }`(없으면 영상 설정대로). 만들기 판의 `#fxBox`와 장면 카드의 '이 장면 효과'(`sceneFxHTML`)에서 고른다.
  - 장면 넘김 `TRANS`: fade 스르륵 / slide 옆으로 밀기 / circle 동그랗게 / blocks 블록 조각(80px 블록이 톡 놓임) / black 까맣게 / cut 바로, auto는 fade→slide→circle→blocks 차례. 새 장면 앞부분 `TRANS_DUR`(0.7~1초) 동안 앞 장면(계속 움직이는 채로, `drawSeg(prev, prev.dur + tl)`)과 새 장면을 두 캔버스에 따로 그려 `compose`로 합친다. 영상 맨 처음·끝만 까맣게(`FADE`).
  - 사진 움직임 `MOVES`: in 다가가기 / out 멀어지기 / pan 옆으로 훑기(사진마다 방향 번갈아) / still 가만히, auto는 사진마다 in→pan→out→panL. 18%(16:9가 아닌 사진은 10%), 처음·끝은 천천히(`glide`).
  - 자막 `SUBS`: plain / rise 아래에서 쏙 / pop 낱말 톡톡 / karaoke 읽는 낱말 칠하기(녹음 길이를 글자 수로 나눈 대강 맞춤, 다이아몬드색). 자막은 목소리보다 `SUB_LEAD` 0.25초 먼저.
  - 제목·끝 화면(`cards`): 글자가 블록처럼 하나씩 떨어져 쌓이고(가루), 작은 글이 올라오고, 배경이 천천히 다가감. 끝 화면은 픽셀이 펑 흩어지고 별이 반짝임(`drawSparkles`). 무작위는 `rand(n)`(프레임마다 같은 값).
  - '미리 보기'(`previewVideo`, `#fxPreview`): 녹화 없이 #screen에 목소리·배경 음악과 함께 재생(소리 시계는 AudioContext, 목소리·음악은 영상 만들기와 같은 `scheduleAudio`), 멈추면 원래 화면(만든 영상)을 되돌린다. 음악 칸의 '목소리랑 같이 들어 보기'(`#musicPreview`, `fromVoice`)는 첫 목소리 1초 전부터. 미리 보기 중에 음악 크기 막대를 움직이면 `setMusicVol`로 바로 바뀐다(음악은 크기 곡선 `env` 뒤에 음악 크기 `level` 노드). 녹음을 시작하거나 음악을 빼면 멈춘다. 시험은 `makePlan(project)` + `drawFrame(ctx, plan, t)`로 프레임을 뽑고, 실제 영상은 ffmpeg로 프레임을 꺼내 본다.
- 영상 녹화 주의: 소리 트랙에 소리가 끊기면 mp4 녹화가 앞부분(약 1~2초)만 저장되는 문제가 있어서, 들리지 않는 아주 작은 소리(`hum`)를 늘 흘린다. 그리기는 requestAnimationFrame 흐름 하나만 돌리고, 느린 타이머는 그리기가 멈췄을 때만 대신 그린다.
- 시험: `/opt/pw-browsers`의 Chromium + Python Playwright로 PDF 넣기 → 영상 만들기 → 저장까지 돌릴 수 있다(오픈소스 Chromium이라 mp4가 H.264가 아닌 VP9로 나오는 건 정상).
- 색과 글꼴은 `css/style.css` 맨 위 `:root` 토큰만 쓴다. 다크 모드 값은 바로 아래 미디어 쿼리.
- 앱 파일을 바꾸면 `sw.js`의 `CACHE` 이름 숫자를 올린다(안 올리면 기기에 옛 버전이 남을 수 있음). 새 JS 파일을 만들면 `ASSETS`에도 넣는다.
- 그림: 블록 풍경·집·수레는 직접 만든 그림을 쓴다. 밤을 지켜라는 사용자 요청(2026-10-13)에 따라 마인크래프트 좀비·스켈레톤·크리퍼를 직접 그린 픽셀 SVG로 쓴다. 공식 로고·블록 텍스처는 넣지 않는다.

## 문장 연습·단어 게임·부모님 대시보드 (practice.html, words.html, parent.html)

- 네 페이지 위쪽 메뉴(`.topnav`): 만들기(index.html) / 문장 연습 / 단어 게임 / 부모님 보기(parent.html). 공통 코드는 `js/learn.js`.
- 아이 고르기: `CHILDREN = ['곰이', '난이']`, 마지막 선택은 localStorage(`block-studio-child`). 연습 기록은 아이별로 따로: IndexedDB `progress` 저장소(DB v2) `{ id: 아이, sentences: {줄id: item}, words: {단어: item}, emeralds, days, free: {day, gems} }`.
- 문장 모음: 모든 영상의 영어가 있는 문장 줄(`loadSentences`). 예시 영상은 다른 문장이 없을 때만. 아이를 고르면 그 아이가 만든 영상의 문장만 쓴다(사용자 요청 2026-10-25, `madeBy`, 아래 단어 게임과 같은 기준): practice.js는 `everything`(전부)에서 `applyChild()`로 `all`을 만들어 오늘의 연습·자유 연습·말하며 외우기·발표 테스트·한꺼번에 보기·인쇄가 모두 그것만 쓰고, '모든 영상' 칸 이름은 '<아이>가 만든 영상 모두'. 부모님 보기(parent.js `sentsOf(kid)`)의 문장·단어 수와 비교도 아이별 영상 기준.
- 복습 상자(라이트너, `grade`/`todayQueue`): 맞히면 다음 상자, 틀리면 1번. 상자별 다시 나오는 간격 `BOX_DAYS` 1:0, 2:1, 3:3, 4:7, 5:14일. 한 번에 최대 8문장, 새 문장 3개까지(하루 한도가 아니라 한 번 연습할 때마다). 차례인 문장이 없으면 '오늘의 연습' 버튼을 끄고 `nextDueDays`로 다음 날짜를 알려 준다.
- 문장 연습 단계(`practice.js`, 상자에 따라): 1번 듣고 따라 말하기 → 블록 쌓기, 2번 블록 쌓기, 3번 빈칸 채우기, 4·5번 한글 보고 말해 보기(정답 보고 스스로 맞음/어려움). 말하기 채점(음성 인식)은 넣지 않는다. 틀린 문장은 그 연습 끝에 한 번 더. 블록 쌓기·빈칸 채우기에는 '← 앞 단계로'(듣고 따라 말하기로 돌아갔다가 같은 활동으로 다시, `runListen(s, then)`)가 있다. 듣기부터 시작한 카드(1번 상자)는 그냥 돌아가고, 그 밖의 카드에서 누르면 `peeked`: 맞혀도 복습 상자를 올리지 않고 에메랄드도 없다('다음에 한 번 더 나와요'). 예전 '처음부터 다시'는 뺐다(마지막 블록을 놓으면 바로 채점돼서 쓸 일이 없었음).
- 자유 연습(`startFree`, 언제든): 상자가 낮은 문장이 더 자주 나오게 무작위로 8개. 활동은 상자 단계 안에서 섞는다(`freeModeFor`: 새 문장은 듣기→블록, 2번부터 빈칸, 3번부터 한글 보고 말하기). `grade`를 부르지 않아 복습 날짜는 그대로. 에메랄드는 하루 `FREE_GEMS`(5)개까지(`takeFreeGem`, `progress.free`), 연습한 날은 센다. 서버 맞추기는 같은 날이면 큰 값.
- 발표 테스트(`js/ptest.js`, 첫 화면 `#ptOpen`, CSS는 `.pt-*`): 영상을 발표하듯 사진만 보고 문장을 말해 보는 시험. 음성 인식은 쓰지 않는다. 준비 화면에서 영상(문장 있는 영상 + 모든 영상), 순서(발표 순서=장면 순서 / 섞어서), 처음에 보여 줄 것(사진만 ★3 / 사진+첫 단어 ★2), 채점(스스로 확인 / 부모님 채점 O·X), 녹음 비교(마이크 되면) — 고른 값은 localStorage `block-studio-ptest`. 힌트 사다리 `STARS` 3·2·1·1: 0 사진만 → 1 첫 단어(나머지는 글자 수만큼 빈칸) → 2 모든 낱말 첫 글자 → 3 한글 뜻. '모르겠어요'는 정답을 보여 주고 0점. 장면에 사진이 여러 장이면 눌러서 넘겨 보고, 문장이 여러 개면 '이 사진의 문장 N개 중 M번째', 발표 순서면 같은 장면의 앞 문장을 보여 준다. 정답 확인에서 정답 읽기·방금 녹음한 내 목소리·영상 속 녹음을 들을 수 있다. 복습 상자: 힌트 없이 맞히면 `grade(true)`, 틀리거나 모르겠어요면 `grade(false)`, 힌트 보고 맞힌 것은 그대로. 결과: 문장별 별·쓴 힌트, 점수(별/최대), 메달(90% 금·70% 은·40% 동), '못한 문장만 다시'(틀렸거나 처음보다 힌트를 더 본 문장, 연습 판이라 기록·에메랄드 없음). 끝까지 한 판이면 `progress.tests[영상 id | 'all'] = { best, bestStars, max, last, t, runs, gemDay, lastScore }`에 남기고, 에메랄드는 별 3개마다 1개(최대 8), 같은 영상은 하루 한 번(`gemDay`). 서버 맞추기는 `mergeTests`(최고 점수는 큰 값, 나머지는 나중 기록). PC 키: Enter 정답 확인·다음, H 힌트, 1 맞았어요, 2 틀렸어요. `loadSentences`의 문장에는 `sceneId, sceneNo, lineNo, lineCount, images`가 있다.
- 한꺼번에 보기(`renderAllSentences`, CSS `.all-*`): 한 줄에 카드 하나. 왼쪽에 큰 사진(220~320px, `.all-card-thumb`), 오른쪽 `.all-card-main`에 번호·영상·상자, 영어 문장(27px, 한 줄로·넘치면 옆으로 밀기), 한글 뜻, 단어, 버튼. 700px 이하는 사진이 위, 문장은 줄바꿈.
- 인쇄하기(`js/print.js`, 한꺼번에 보기의 `#allPrint` → `#printView`, CSS `.print-*`·`.pr-*`): 한꺼번에 보기에서 고른 영상·검색 결과 그대로(`allViewList`) 인쇄용 화면을 만들고(인쇄 화면 맨 위 `#prProj`에서 영상을 다시 고를 수 있음, `listFor`가 한꺼번에 보기 칸도 같이 바꿈) `window.print()`(인쇄 창에서 'PDF로 저장'도 가능). 모양 4가지: 문장 카드(크게 한 줄 하나/작게 두 개씩, 같은 사진(장면)의 문장 여러 개는 카드 하나에 번호와 함께 모음 — `byScene`), 외우기 학습지(첫 단어만/첫 글자만/빈 줄만 + 쓰는 줄 2개, 정답은 다음 장), 접는 플래시카드(위 칸 사진+뜻, 아래 칸 영어를 거꾸로 — 가운데 점선에서 접음, 한 장에 4개), 단어장(`collectWords` + glossary, 써 보기 칸). 고르기: 한글 뜻, 사진(크게/작게/빼기 = 문장만, 플래시카드는 넣기/빼기), 이름·날짜 칸(아이를 골랐으면 이름이 들어감). 고른 값은 localStorage `block-studio-print`. 종이 색은 `--paper*` 토큰(다크 모드에서도 흰 종이), `@media print`에서 인쇄용 화면만 남기고 A4 12mm 여백, 카드·줄은 페이지에서 잘리지 않게. 시험은 Playwright `emulate_media(print)` + `page.pdf()`.
- 말하며 외우기(`startMemorize`/`runMemorize`, 언제든): 덜 외운 문장부터 10개. 1단계 영어 보며 말하기 → 2단계 세 글자 이상 낱말을 하나 건너 하나 첫 글자만 남기고 가리기(눌러서 1.5초 엿보기) → 3단계 모두 가리고 한글 뜻만 보고 말하기(첫 글자 힌트 가능) → 정답 보기 → 스스로 '외웠어요/더 연습할래요'. 결과는 복습 상자에도 반영(`record`).
- 단어 게임(`words.html`, `words.js`, CSS는 `.wg-*`): 마인크래프트 테마 5종 게임. 첫 화면은 맨 위에 넓은 판 하나(`.wide`, 광산 수레 달리기) + 2×2 격자(단어 광산 / 밤을 지켜라 / 조합대 제작소 / 짝 맞추기). 판 색은 `.g-cart`·`.g-mine`·`.g-night`·`.g-craft`·`.g-match`. 판 안의 버튼을 누르면 바로 시작한다(따로 '시작' 버튼·옵션 줄 없음). 에메랄드·연속 연습은 이름 옆에 작게. 끝 화면은 받은 에메랄드가 하나씩 튀어나오는 움직임 하나만.
- 단어 광산(`js/mine.js`, CSS는 `.mine-*`): 1분(`DUR`) 동안 간판의 한글 뜻(`ko`) 또는 들려준 영어(`listen`)에 맞는 단어 블록을 세 번(`HITS`) 두드려 캔다. 실제 마인크래프트 채굴 애니메이션 적용: 다이아몬드 곡괭이의 스냅 타격·반동 회전(`mine-mc-swing`), 16×16 픽셀 블록 균열(`CRACK`), 타격 시 블록 표면 픽셀 파편(`hitBits`), 파괴 시 28개 3D 큐브 느낌 파편의 포물선 중력 낙하 폭발(`bits`), 캔 광물이 제자리에서 톡 튀어오른 뒤 핫바로 빨려 들어가는 자석 흡수 연출(`flyItem`)과 +1 픽셀 플로팅·아이템 획득 딩동 소리. 틀린 블록은 흔들리고 그 단어 뜻을 잠깐 보여 줌(0.5초 쉼). 7초(`HINT_AFTER`) 못 찾으면 맞는 블록이 반짝임. 하늘이 낮→저녁으로 바뀌며 시간 표시. 에메랄드는 캔 수/3(올림, 최대 8) + 6개 이상을 한 번도 안 틀리면 1.
- 밤을 지켜라(`js/night.js`, CSS는 `.ng-*`): 마인크래프트 1인칭 3D 활 쏘기 디펜스(`three.module.min.js` 기반 리얼 3D 복셀 모델링). 플레이어가 집 앞 발판에서 전방을 바라보는 1인칭 시점(하단에 마인크래프트 활 & 스티브 팔). 어두운 밤 평원 저 멀리서 한글 뜻/영어 단어 간판을 든 좀비·스켈레톤·크리퍼·엔더맨이 3D 큐브 관절(팔다리 흔들림)로 걸어온다. 줄 3개(`LANE_X`), 동시에 최대 3마리(`MAX_ALIVE`), 모두 12마리(`TOTAL`). 아래 4개 보기(PC 숫자키 1~4)나 3D 간판 터치로 답을 맞히면, 1인칭 활시위가 당겨지며 포물선 화살이 3D 공간을 가르고 날아가 명중! 피격 시 붉은색 플래시+넉백, 사망 시 옆으로 쓰러지며 펑! 연기 파티클과 드랍 아이템(썩은고기/뼈/화약/엔더진주) 획득. 크리퍼는 집 앞 도달 시 하얗게 부풀어 오르며 취이이익- 쾅! 자폭(카메라 쉐이크). 몹이 도달하면 하트 -1(3개). 12마리를 막아내면 밤하늘에 새벽 해가 떠오르며 '아침이 왔어요!'. 빠르기 `SPEEDS` slow 17초/4.6초 간격, normal 13/3.6, fast 10/2.8. '몹 부르기'(Space/Enter). 에메랄드: 클리어 시 물리친 수/2(올림, 최대 8) + 하트 3개 유지 시 1.
- 광산 수레 달리기(`js/cart.js`, CSS는 `.cart-*`): 수레(앞면과 윗면이 보이는 직접 만든 일반 블록 SVG, 네모난 플레이어가 타고 맞힌 만큼 보석이 쌓임)가 선로 3줄(`LANE_Y`) 중 하나를 달리고, 갈림길이 오른쪽에서 다가온다. 줄마다 영어 단어 간판(답 1 + 길이 비슷한 오답 2). 위 간판의 한글 뜻(`ko`) 또는 들려준 영어(`listen`)에 맞는 줄로 수레를 옮겨 둔다: 아래 단어 버튼(줄 색 금·청록·초록, 600px 이하는 세로로), 선로를 직접 누르기, PC는 1·2·3 / ↑·↓. 간판이 수레 앞에 닿을 때 판정: 맞으면 딩 + 보석이 수레로 날아가고 단어를 읽어 줌, 틀리면 돌 블록에 쿵 + 하트 -1(3개) + 정답 표시. 갈림길 12개(`TOTAL`)를 지나면 '도착했어요!'. 판 버튼은 천천히·보통·빨리(뜻 보고) + 듣고 달리기(보통). 갈림길이 수레에 닿기까지 `SPEEDS` slow 6.0→최소 4.2초, normal 4.6→3.0, fast 3.4→2.2, 맞힐 때마다 0.2초씩 빨라지고 틀리면 느려짐. 줄을 골랐으면 '출발!' 버튼(PC는 Space·Enter·→)으로 지금 갈림길을 4배(`DASH`) 빨리 당겨 온다(줄무늬 효과). 갈림길 사이 쉬는 시간 `GAP` 0.45초. 도착하면 걸린 시간을 보여 준다(둘이 기록 겨루기). 돌 블록·광석·나무 지지대·벽 횃불을 직접 그린 SVG 갱도가 흐른다. 횃불 불꽃과 벽의 불빛이 흔들리고, 바퀴 살은 이동 거리/바퀴 반지름에 맞춰 실제로 회전한다. 바퀴 접점에서 픽셀 불꽃이 뒤로 날아가며 출발 중에는 더 자주 튄다. 갈림길은 큰 단어 간판이다(PC 26px/600px 이하 21px). 사용자의 요청으로 블록 터널 입구만 되돌렸고, 입체 수레·바퀴 회전·횃불·불꽃은 유지한다. 줄 높이는 LANE_Y 0.33/0.62/0.91, 갱도 높이는 PC 330px/600px 이하 285px. 회전·불꽃은 RAF와 함께 끝나고 횃불은 moving 클래스로 멈춘다. 동작 줄이기에서는 회전·불꽃·횃불 흔들림을 끈다. 나무 침목과 철 레일, 가운데 동력 레일이 있고 출발하면 선택한 레일이 켜진다. 갱도 무늬·지지대·침목은 다른 빠르기로 흘러간다(`--s`, `--rock-shift`, `--prop-shift`). 에메랄드: 도착하면 맞힌 수/2(올림, 최대 8) + 하트 3개 그대로면 1, 멈추면 맞힌 수/3(올림).
- 조합대 제작소(`js/craft.js`, CSS는 `.craft-*`): 3×3 마인크래프트 작업대에 레시피 모양대로 단어 재료 블록을 배치하여 전설의 장비(다이아몬드 검·곡괭이·도끼·투구·갑옷·황금 사과 등)를 완성하는 제작 게임. 문제당 10초 제한시간 타이머(`QUESTION_TIME = 10`, 상단 숫자 표시 및 간판 게이지 바, 3초 이하 경고 점멸). 시간 초과 시 하트 -1 및 정답 표시 후 자동 배치 진행. 문제 12개(4개 레시피 × 3단계), 빈칸 칸에 들어갈 맞는 단어를 아래 4개 보기 중에서 골라 채운다. 완성 시 빛나는 완성 연출과 효과음. 에메랄드: 클리어 시 맞힌 수/2(올림, 최대 8) + 하트 3개 유지 시 1.
- 단어 게임의 단어도 고른 아이가 만든 영상에서만 가져온다(사용자 요청 2026-10-25): `madeBy(p, child)`(learn.js) = 영상의 '만든 사람'(`project.makers`, 문장에는 `makers`)에 그 이름이 들어 있으면(둘이 같이 = 둘 다), 비어 있으면 둘 다. '단어 가져올 영상'(`#proj`, `renderProjOptions`)도 그 아이 영상만, 아이를 바꾸면 다시 만든다. 그 아이 영상이 없으면 '만든 사람'을 고르라고 알려 준다.
- 단어 짝 맞추기: 문장의 AI 낱말(`words`) + 문장 속 단어(쉬운 낱말 제외). 뜻이 없으면 `coach`의 `glossary`(Gemini, 40개씩)로 채워 IndexedDB `meta`의 `glossary`에 둔다. 4/6/8쌍, 잘 모르는 단어 먼저.
- 게임별 배경음악(`js/bgm.js`): 대용량 오디오 다운로드 없이 Web Audio API 신디사이저로 마인크래프트 감성의 게임별 맞춤 BGM 실시간 연주(광산 수레 달리기 128BPM 칩튠 레일비트, 단어 광산 106BPM 크리스탈 칼림바, 밤을 지켜라 96BPM 서스펜스 다크디펜스, 조합대 제작소 86BPM 포근한 공방 왈츠, 내 월드 탐험 68BPM C418 스타일 앰비언트 피아노, 짝 맞추기 100BPM 차임벨). 상단 헤더에 음소거 토글 버튼(`bgmBtn`), 단어 발음 시 오디오 더킹(`duckBgm`), 화면 전환 시 부드러운 페이드인/페이드아웃.
- 부모님 대시보드(`parent.html`, `js/parent.js`): 곰이·난이 탭 및 둘 다 비교하기. 에메랄드·연속 학습일·총 학습일·완전 정복 문장 수·마스터 단어 수 KPI 요약, 최근 28일 출석 잔디밭(연습한 날 잔디 블록 🌱, 안 한 날 흙 블록), 라이트너 5단계 복습 상자 진행 바 및 문장별 복습 상태(오늘 차례, N일 뒤, 마스터), 취약 단어(오답 많은 단어 TOP) 및 칭찬 지도 팁, 아이가 만든 영상 작품 목록, 기기 및 서버 연동 상태 안내. 하단에 **학습 기록 초기화** 기능 탑재(만든 영상 작품은 안전하게 유지하고, 곰이·난이의 에메랄드/연속일/복습상자/단어기록/서버progress만 초기화).
- 연습 기록은 서버에도 `cloud_get`/`cloud_put`(kv/progress-<아이 이름 UTF-8 hex>.json)로 올리고, 기기끼리는 문장·단어마다 더 나중 기록, 에메랄드는 큰 값, 연습한 날은 합쳐서 맞춘다(`mergeProgress`).

## 서버 저장(다른 기기에서 이어서 하기)

- 로그인 없이 가족 암호로 연다. `coach` 함수의 `cloud_*` 동작: `cloud_list`, `cloud_head {id}`, `cloud_need {hashes}`, `cloud_save {id, doc, baseRev, device, force?}`, `cloud_load {id}`, `cloud_delete {id}`, `cloud_get`/`cloud_put {key, doc}`(kv), `cloud_reset {confirm}`.
- 저장소: Supabase Storage 비공개 버킷 `blockstudio`(함수가 처음 쓸 때 만듦). `docs/<id>.json` = 작품 내용(사진·소리는 `{ref: sha256, type}`), `media/<sha256>` = 파일. 같은 파일은 한 번만 올라간다.
- 큰 파일은 함수를 거치지 않는다: `cloud_need`가 없는 파일만 서명된 업로드 주소를 주고, 앱이 그 주소로 바로 PUT(FormData)한다. 내려받기도 서명된 주소(1시간).
- 엇갈림: 서버 문서의 `rev`와 앱이 아는 `project.cloud.rev`가 다르면 409 `conflict`. 앱은 "그 기기 것 불러오기"(이 기기 것은 '(이 기기 사본)'으로 남김) 또는 "이 기기 것으로 덮어쓰기"(`force`)를 고르게 한다.
- 앱(`js/cloud.js`, app.js의 '서버 저장' 부분): 고칠 때마다 `project.cloud.dirty`를 켜고 3초 뒤 자동으로 올린다. 열 때·다시 돌아왔을 때 `cloud_head`로 확인해서, 이 기기에 안 올린 고침이 없으면 새 내용을 저절로 받고, 있으면 엇갈림을 묻는다. 예시 영상(`project.example`)은 올리지 않는다.
- 모든 기록 지우기(부모님 설정 맨 아래, `js/reset.js`): 칸에 '지우기'라고 써야 버튼이 켜진다. 서버는 `cloud_reset {confirm:'erase-all'}`(docs·media·kv 전부 삭제, 함수를 다시 배포해야 생김). 옛 함수면 대신 작품을 하나씩 `cloud_delete`하고 아이별 연습 기록을 빈 것으로 `cloud_put`(이때 media 파일은 서버에 남지만 쓰이지 않음). 끝에 서버에 `kv/reset.json {at}`을 남기고, 모든 페이지가 시작할 때 `checkReset()`(2.5초 안에)으로 이걸 보고 `at` 전에 고친 영상·연습 기록·단어 뜻 모음을 그 기기에서도 지운다(지운 뒤 새로 만든 것은 남김, 기기 표시는 localStorage `block-studio-reset`). 이렇게 해야 다른 기기의 옛 데이터가 다시 올라가지 않는다. 가족 암호·기기 이름·발음 빠르기는 남긴다.
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
- '한 단어씩'은 저절로 흘러가지 않는다(사용자 요청 2026-10-18): 만들기 화면에서 누르면 낱말 버튼 줄(`followHTML`, `.follow .fw`)을 열어 두고, 아이가 누른 낱말 하나만 `speakWord`로 읽는다('■ 단어 닫기'로 닫음). 혼자 읽으면 글자 이름·힘준 소리가 되는 낱말은 `sayAlone`으로 바꿔 읽힌다(화면 글자는 그대로): a → 'uh', an → 'un', the → 다음 낱말 버튼이 모음 소리로 시작하면 'thee'(디), 아니면 'duh'(더, 'thuh'는 크롬 목소리가 '두'로 읽었음). 모음 소리 판단 `startsWithVowelSound`(u로 시작해도 '유' 소리·one은 자음, hour·honest는 모음). `speakWord`에 버튼을 주면 다음 버튼을 찾아 쓴다. 문장 연습(`#activity`)과 발표 테스트 정답(`#ptAnswer`)의 따라 읽기 줄도 같은 낱말 버튼이라 누르면 그 낱말만 들린다(문장 연습에는 '한 단어씩' 버튼 대신 '단어를 누르면 그 단어만 들려요' 안내). 문장을 통째로 읽을 때는 목소리가 boundary 이벤트를 주면 지금 낱말을 칠한다.
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
  opts: { title: bool, ko: bool, end: bool, fx?: { trans, move, sub, cards } },   // 제목 화면, 한글 자막, The End 화면, 화면 효과
  music: null | { blob, name, dur, vol, credit },
  scenes: [{
    id, images: [Blob], example?, fx?: { trans?, move? },   // 사진 순서 = 영상에 나오는 순서, 이 장면 효과
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
- 단어 게임 더하기(단어 광산 둘이 대결, 스펠링 제작대, 아이가 그린 몬스터를 밤을 지켜라에).
- 발표 테스트 2단계: 부모님 보기에 영상별 최고 점수·마지막 테스트, '처음부터 끝까지 발표하기'(장면 자동 넘김, 힌트 없음).
