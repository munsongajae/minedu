// 곰이난이 블록 스튜디오 — AI 영어 도우미 (Supabase Edge Function)
//
// 앱이 이 함수에 한글 설명이나 아이가 쓴 영어를 보내면, 이 함수가 Gemini API를 불러
// 번역(translate) 또는 첨삭(check) 결과를 JSON으로 돌려준다.
// Gemini API 키는 이 함수의 비밀값(Secret)에만 있고, 앱(브라우저)에는 절대 들어가지 않는다.
//
// 필요한 Secret
//   GEMINI_API_KEY   (필수) Google AI Studio에서 받은 키
//   APP_PASSCODE     (권장) 가족 암호. 정해 두면 이 암호를 아는 기기만 AI를 쓸 수 있다.
//   GEMINI_MODEL     (선택) 기본값 gemini-3.5-flash-lite
//   ALLOWED_ORIGINS  (선택) 쉼표로 구분한 허용 주소. 기본값 https://munsongajae.github.io
//
// 함수 설정: JWT 검증(verify_jwt)을 끈다. 접근은 위의 가족 암호로 막는다.

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
const PASSCODE = Deno.env.get('APP_PASSCODE') ?? '';
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://munsongajae.github.io')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_TEXT = 600;          // 글 한 칸에 받는 최대 글자 수
const RATE_PER_MIN = 30;       // 한 주소에서 1분에 받는 최대 요청 수

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Headers': 'content-type, x-family-code',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// 함수 인스턴스 안에서만 세는 간단한 속도 제한 (완벽하지 않지만 실수로 버튼을 연타하는 정도는 막는다)
const hits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_PER_MIN;
}

function sameCode(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// ---------- 프롬프트 ----------
const STYLE = `You are a warm English helper for 10-year-old Korean twins who make short English videos about screenshots from Minecraft Education.
Use simple, natural English a 10-year-old can read aloud (about CEFR A2: short sentences, common words).
Use standard English game terms for Minecraft things (크리퍼 → creeper, 레드스톤 → redstone, 곡괭이 → pickaxe, 네더 → the Nether).
Keep everything friendly and suitable for children.`;

function translatePrompt(ko) {
  return `${STYLE}

Translate the child's Korean description into English. Keep the child's meaning, order and voice (first person if they used it). Do not add new ideas.
Also pick up to 4 words from your English that may be new to the child, each with a short Korean meaning.

Korean description:
${ko}`;
}

function checkPrompt(ko, attempt) {
  return `${STYLE}

The child described the screenshot in Korean, then tried to write it in English by themselves.
Check the English attempt. Fix grammar, spelling and unnatural words, but keep the child's own words and ideas wherever they already work.
If the Korean says something important the English left out, you may add it simply.
Write "praise" and every "why" in friendly, easy Korean for a 10-year-old (다정한 해요체, one short sentence each). Praise something specific they did well.
List at most 4 fixes, each a small piece of text before and after. If the attempt is already good, return it unchanged as "corrected" and an empty "fixes" list.

Korean description:
${ko || '(없음)'}

Child's English attempt:
${attempt}`;
}

const TRANSLATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    english: { type: 'STRING' },
    words: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['en', 'ko'] }
    }
  },
  required: ['english', 'words']
};

const CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    corrected: { type: 'STRING' },
    praise: { type: 'STRING' },
    fixes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { before: { type: 'STRING' }, after: { type: 'STRING' }, why: { type: 'STRING' } },
        required: ['before', 'after', 'why']
      }
    }
  },
  required: ['corrected', 'praise', 'fixes']
};

// ---------- Gemini 호출 ----------
async function askGemini(prompt, schema) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.3,
        maxOutputTokens: 1024
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Gemini error', res.status, detail.slice(0, 500));
    throw new Error(res.status === 429 ? 'ai_busy' : 'ai_error');
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  return parseJSON(text);
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch (_) { /* 아래에서 다시 */ }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch (_) { /* 실패 */ }
  }
  throw new Error('ai_error');
}

// ---------- 결과 다듬기 ----------
function shapeTranslate(r) {
  const english = clean(r?.english);
  if (!english) throw new Error('ai_error');
  const words = Array.isArray(r?.words) ? r.words : [];
  return {
    english,
    words: words.map((w) => ({ en: clean(w?.en), ko: clean(w?.ko) })).filter((w) => w.en && w.ko).slice(0, 4)
  };
}

function shapeCheck(r, attempt) {
  const fixes = Array.isArray(r?.fixes) ? r.fixes : [];
  return {
    corrected: clean(r?.corrected) || attempt,
    praise: clean(r?.praise) || '잘 썼어요!',
    fixes: fixes.map((f) => ({ before: clean(f?.before), after: clean(f?.after), why: clean(f?.why) }))
      .filter((f) => f.before || f.after).slice(0, 4)
  };
}

// ---------- 요청 처리 ----------
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'method' });
  if (!originAllowed(origin)) return reply(origin, 403, { error: 'origin' });
  if (!GEMINI_KEY) return reply(origin, 500, { error: 'not_configured' });

  if (PASSCODE && !sameCode(req.headers.get('x-family-code') ?? '', PASSCODE)) {
    return reply(origin, 401, { error: 'bad_code' });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return reply(origin, 429, { error: 'rate_limited' });

  let body;
  try { body = await req.json(); } catch (_) { return reply(origin, 400, { error: 'bad_request' }); }
  const action = body?.action;
  const ko = String(body?.ko ?? '').trim();
  const attempt = String(body?.attempt ?? '').trim();
  if (ko.length > MAX_TEXT || attempt.length > MAX_TEXT) return reply(origin, 400, { error: 'too_long' });

  try {
    if (action === 'ping') return reply(origin, 200, { ok: true, model: MODEL });
    if (action === 'translate') {
      if (!ko) return reply(origin, 400, { error: 'empty' });
      return reply(origin, 200, shapeTranslate(await askGemini(translatePrompt(ko), TRANSLATE_SCHEMA)));
    }
    if (action === 'check') {
      if (!attempt) return reply(origin, 400, { error: 'empty' });
      return reply(origin, 200, shapeCheck(await askGemini(checkPrompt(ko, attempt), CHECK_SCHEMA), attempt));
    }
    return reply(origin, 400, { error: 'bad_request' });
  } catch (e) {
    const code = e instanceof Error && e.message === 'ai_busy' ? 'ai_busy' : 'ai_error';
    return reply(origin, code === 'ai_busy' ? 429 : 502, { error: code });
  }
});
