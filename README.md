# 곰이난이 블록 스튜디오

마인크래프트 에듀케이션 게임 화면을 캡처해서 **한글 설명 → 영어 문장 → 내 목소리 녹음 → 자막 영상**까지 한 화면에서 만드는 웹앱입니다. 10살 쌍둥이 곰이·난이를 위해 만들었습니다.

- PC(크롬·엣지)와 갤럭시탭(크롬)에서 동작합니다.
- 설치 없이 주소로 열고, 홈 화면·바탕화면에 앱처럼 추가할 수 있습니다(PWA).
- 사진·녹음·글은 모두 **그 기기의 그 브라우저 안**(IndexedDB)에만 저장됩니다.
- AI 영어 도우미는 Supabase Edge Function이 Gemini API를 불러서 동작합니다. Gemini 키는 Supabase에만 있고 앱 코드에는 없습니다.

주소: https://munsongajae.github.io/minedu/

## 쓰는 순서

1. **사진 넣기** — PC는 `Win + Shift + S`로 캡처한 뒤 앱에서 `Ctrl + V`, 또는 파일을 끌어다 놓기. 태블릿은 캡처한 뒤 **사진 고르기**로 갤러리에서 고르기.
   - **포트폴리오 PDF**: 마인크래프트 에듀케이션의 카메라로 찍고 포트폴리오를 PDF로 내보낸 파일을 넣으면, 사진을 모두 꺼내 페이지 순서대로 장면을 만들어요. 폴라로이드 테두리는 자동으로 잘라요. 표지의 월드 이름은 영상 제목이 비어 있을 때 제목으로 들어가요.
2. **한글로 설명** — 사진에서 무엇을 했는지 써요. 타자가 느리면 **말로 쓰기**를 누르고 말하면 글자로 들어가요(크롬·엣지, 인터넷 필요). 할 말이 여러 문장이면 **+ 문장 더하기**로 문장 줄을 늘려요. 문장 줄마다 한글·영어·녹음이 따로 있고, 영상에서는 그 사진이 나오는 동안 문장이 차례대로 나와요.
   - 반대로 한 문장에 사진을 여러 장 보여주려면 **+ 사진 더하기**, 또는 이미 나뉜 장면이면 **아래 장면과 합치기**. 영상에서는 문장이 나오는 동안 사진이 차례로 넘어가요(시간은 사진 수만큼 똑같이 나눔).
3. **영어로 바꾸기** — 장면마다 두 가지 중 골라요.
   - **내가 먼저 써 보기**(기본): 직접 영어로 쓰고 **선생님 확인받기**. 칭찬, 고친 문장, 고친 이유(쉬운 한국어)가 나와요. **이 문장으로 정하기**를 누르면 자막 문장이 돼요.
   - **AI가 번역**: 한글 설명을 10살 수준 영어로 바꾸고, 새 낱말 몇 개를 뜻과 함께 보여줘요.
   - **발음 들어 보기**로 읽기 연습(영상에는 들어가지 않아요).
4. **목소리 녹음** — 문장마다 **녹음 시작**을 누르고 그 문장을 읽어요. 틀린 문장만 다시 녹음하면 돼요. 녹음 파일(m4a, mp3, wav)을 넣어도 됩니다.
5. **영상 만들기** — 제목 화면, 장면별 영어 자막(한글 자막 선택), 목소리, The End 화면이 들어간 영상이 만들어져요. 실제 길이만큼 시간이 걸리니 화면을 켜 두세요.

영상 형식은 브라우저가 지원하는 대로 **mp4**(가능하면) 또는 **webm**으로 저장됩니다.

## 처음 한 번 하는 설정

### 1) GitHub Pages 켜기

1. 이 저장소의 **Settings → Pages**로 갑니다.
2. **Build and deployment → Source**를 `Deploy from a branch`로, 브랜치는 `main`, 폴더는 `/ (root)`로 고르고 **Save**.
3. 1~2분 뒤 https://munsongajae.github.io/minedu/ 주소로 열립니다.

마이크 녹음과 앱 설치는 **https 주소**에서만 됩니다. GitHub Pages 주소는 https라서 그대로 됩니다.

### 2) AI 영어 도우미 켜기 (Supabase + Gemini)

1. **Gemini API 키 받기** — https://aistudio.google.com 에서 API 키를 만듭니다.
2. **Supabase에 비밀값 넣기** — 프로젝트 대시보드의 Edge Functions → **Secrets**에 아래를 추가합니다.

   | 이름 | 값 |
   |---|---|
   | `GEMINI_API_KEY` | 1번에서 받은 키 |
   | `APP_PASSCODE` | 가족 암호(아무 문장이나. 이걸 아는 기기만 AI를 쓸 수 있어요) |
   | `GEMINI_MODEL` | (선택) 기본값 `gemini-3.5-flash-lite` |

3. **함수 코드 넣기** — 이 프로젝트의 함수 이름은 `coach`입니다. 그 함수의 편집기에 이 저장소의 `supabase/functions/coach/index.ts` 내용을 통째로 붙여 넣고 **Deploy**. (함수를 새로 만들면 그 이름에 맞춰 `js/config.js`의 `COACH_URL`도 바꿉니다.)
4. **JWT 검증 끄기** — `coach` 함수의 설정(Details)에서 **Verify JWT / Enforce JWT verification**을 끄고 저장합니다. 앱은 로그인 없이 부르고, 대신 가족 암호로 막습니다.
5. **기기마다 암호 넣기** — 앱 맨 아래 **부모님 설정 → 가족 암호**에 `APP_PASSCODE`와 같은 값을 넣고 **저장하고 연결 확인**. "연결됐어요"가 나오면 끝.

Supabase CLI를 쓴다면 3·4번 대신:

```bash
supabase secrets set GEMINI_API_KEY=... APP_PASSCODE=... --project-ref uwqakkbwaqtrrqvhzzvz
supabase functions deploy coach --project-ref uwqakkbwaqtrrqvhzzvz --no-verify-jwt
```

함수 주소는 `js/config.js`의 `COACH_URL`에 있습니다. 비워 두면 AI 기능이 꺼지고 파파고 도움 버튼이 대신 나옵니다.

## 기기에 앱처럼 설치하기

- **갤럭시탭(크롬)**: 주소를 연 뒤 오른쪽 위 ⋮ → **홈 화면에 추가**(또는 **앱 설치**).
- **PC(크롬)**: 주소창 오른쪽의 설치 아이콘, 또는 ⋮ → 저장 및 공유 → **페이지를 앱으로 설치**.
- **PC(엣지)**: ⋯ → 앱 → **이 사이트를 앱으로 설치**.

처음 녹음할 때 마이크 허용 창이 뜨면 **허용**을 누르세요.

## 내 컴퓨터에서 실행해 보기 (개발용)

```bash
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080
```

빌드 도구가 없는 순수 HTML·CSS·JS(ES 모듈)입니다. 파일을 고치고 새로고침하면 바로 반영됩니다. AI 함수는 `localhost` 주소에서 부르는 것도 허용합니다.

## 폴더 구조

```
index.html                       화면 뼈대
css/style.css                    디자인(색·글꼴 토큰은 맨 위 :root)
js/app.js                        화면 그리기와 버튼 동작
js/ai.js                         AI 영어 도우미 호출, 가족 암호
js/config.js                     AI 함수 주소
js/pdf-import.js                 포트폴리오 PDF에서 사진 꺼내기·테두리 자르기
js/dictation.js                  말로 쓰기(브라우저 음성 인식)
js/storage.js                    IndexedDB 저장
js/recorder.js                   마이크 녹음
js/video.js                      캔버스 + MediaRecorder로 영상 만들기
js/world.js                      예시 장면용 블록 풍경 그림
sw.js                            오프라인 캐시(앱 파일을 고치면 CACHE 숫자 올리기)
manifest.webmanifest             앱 설치 정보
icons/                           앱 아이콘
supabase/functions/coach/        AI 영어 도우미 서버 함수(Gemini 호출)
supabase/config.toml             CLI 배포 설정(verify_jwt = false)
CLAUDE.md                        Claude Code로 이어서 개발할 때 읽는 안내
```
