// 곰이난이 블록 스튜디오 — AI 영어 도우미 + 작품 서버 저장 (Supabase Edge Function)
//
// 1) AI: 앱이 한글 설명이나 아이가 쓴 영어를 보내면 Gemini API를 불러
//    번역(translate) 또는 첨삭(check) 결과를 JSON으로 돌려준다.
// 2) 서버 저장(cloud_*): 작품 내용(JSON)과 사진·녹음·음악 파일을 Supabase 저장소의
//    비공개 버킷에 두어, 다른 기기에서 이어서 편집할 수 있게 한다.
//    큰 파일은 이 함수를 거치지 않고, 이 함수가 만들어 준 서명된 주소로 앱이 저장소에 바로 올린다.
// Gemini API 키와 저장소 비밀 키는 이 함수 안에만 있고, 앱(브라우저)에는 절대 들어가지 않는다.
//
// 필요한 Secret
//   GEMINI_API_KEY   (필수) Google AI Studio에서 받은 키
//   APP_PASSCODE     (권장) 가족 암호. 정해 두면 이 암호를 아는 기기만 AI와 서버 저장을 쓸 수 있다.
//   GEMINI_MODEL     (선택) 기본값 gemini-3.5-flash-lite
//   ALLOWED_ORIGINS  (선택) 쉼표로 구분한 허용 주소. 기본값 https://munsongajae.github.io
//
// 저장소 접근에 쓰는 SUPABASE_URL과 비밀 키(SUPABASE_SECRET_KEYS 또는 SUPABASE_SERVICE_ROLE_KEY)는
// Supabase가 함수에 자동으로 넣어 준다. 버킷(blockstudio, 비공개)은 처음 쓸 때 자동으로 만든다.
//
// 함수 설정: JWT 검증(verify_jwt)을 끈다. 접근은 위의 가족 암호로 막는다.

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
const PASSCODE = Deno.env.get('APP_PASSCODE') ?? '';
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://munsongajae.github.io')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_TEXT = 600;          // 글 한 칸에 받는 최대 글자 수
const RATE_PER_MIN = 30;       // 한 주소에서 1분에 받는 최대 AI 요청 수
const CLOUD_RATE_PER_MIN = 150; // 서버 저장 요청 수(자동 저장이 잦아서 넉넉하게)
const MAX_DOC = 2_000_000;      // 작품 내용 JSON 최대 크기(사진·소리 파일은 따로 올라가므로 작다)
const MAX_HASHES = 400;

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
function rateLimited(key, max = RATE_PER_MIN) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
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

function glossaryPrompt(words, context) {
  return `${STYLE}

Give a short Korean meaning for each English word, as a 10-year-old Korean child would understand it in this context (1 to 4 Korean words, no explanation).
For verbs in past tense, give the past-tense Korean meaning (built → 지었다). Use the context sentences to choose the right meaning.
Return every word exactly as given in "en".

Context sentences:
${context || '(none)'}

Words:
${words.join(', ')}`;
}

const GLOSSARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['en', 'ko'] } }
  },
  required: ['items']
};

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
        maxOutputTokens: 2048
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

// ---------- 작품 서버 저장 ----------
// 저장소 안 모양:
//   docs/<작품 id>.json   작품 내용(글, 순서, 설정). 사진·소리는 { ref: <sha256>, type } 로만 가리킨다.
//   media/<sha256>        사진·녹음·음악 파일. 같은 파일은 한 번만 저장된다.
const BUCKET = 'blockstudio';
const ID_RE = /^[a-z0-9]{6,40}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

let storeReady = null;
function store() {
  if (!storeReady) storeReady = makeStore().catch((e) => { storeReady = null; throw e; });
  return storeReady;
}
async function makeStore() {
  // 시험할 때는 가짜 저장소를 끼울 수 있다(실제 배포에서는 쓰이지 않음).
  if (globalThis.__BLOCK_STUDIO_TEST_STORE__) return globalThis.__BLOCK_STUDIO_TEST_STORE__;
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  let key = '';
  try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch (_) { /* 옛 키 사용 */ }
  key = key || (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  if (!url || !key) throw new Error('storage_not_configured');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error: getErr } = await sb.storage.getBucket(BUCKET);
  if (getErr) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message ?? '')) throw error;
  }
  const B = () => sb.storage.from(BUCKET);
  return {
    async getJSON(path) {
      const { data, error } = await B().download(path);
      if (error || !data) return null;
      try { return JSON.parse(await data.text()); } catch (_) { return null; }
    },
    async putJSON(path, obj) {
      const body = new Blob([JSON.stringify(obj)], { type: 'application/json' });
      const { error } = await B().upload(path, body, { upsert: true, contentType: 'application/json', cacheControl: '0' });
      if (error) throw error;
    },
    async listNames(prefix) {
      const out = [];
      for (let offset = 0; offset < 5000; offset += 1000) {
        const { data, error } = await B().list(prefix, { limit: 1000, offset });
        if (error) throw error;
        (data ?? []).forEach((f) => out.push(f.name));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    async uploadUrl(path) {
      const { data, error } = await B().createSignedUploadUrl(path);
      if (error) throw error;
      return data.signedUrl;
    },
    async downloadUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await B().createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      const out = {};
      (data ?? []).forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
      return out;
    },
    async remove(paths) {
      const { error } = await B().remove(paths);
      if (error) throw error;
    }
  };
}

const refsOf = (doc) => {
  const out = new Set();
  const add = (r) => { if (r && typeof r.ref === 'string' && HASH_RE.test(r.ref)) out.add(r.ref); };
  add(doc?.music);
  (doc?.scenes ?? []).forEach((sc) => {
    (sc.images ?? []).forEach(add);
    (sc.lines ?? []).forEach((l) => add(l.audio));
  });
  return [...out];
};
const summaryOf = (doc) => ({
  id: doc.id, title: String(doc.title ?? ''), makers: String(doc.makers ?? ''),
  rev: doc.rev ?? 0, updatedAt: doc.updatedAt ?? 0, device: String(doc.device ?? ''),
  scenes: (doc.scenes ?? []).length,
  thumb: doc.scenes?.[0]?.images?.[0]?.ref ?? null
});

async function cloud(action, body) {
  const S = await store();
  const id = String(body?.id ?? '');
  const needId = () => { if (!ID_RE.test(id)) throw new HttpError(400, 'bad_request'); };

  if (action === 'cloud_list') {
    const names = (await S.listNames('docs')).filter((n) => n.endsWith('.json')).slice(0, 200);
    const docs = (await Promise.all(names.map((n) => S.getJSON('docs/' + n)))).filter(Boolean);
    const items = docs.map(summaryOf).sort((a, b) => b.updatedAt - a.updatedAt);
    const thumbs = await S.downloadUrls([...new Set(items.map((i) => i.thumb).filter(Boolean))].map((h) => 'media/' + h));
    items.forEach((i) => { i.thumbUrl = i.thumb ? thumbs['media/' + i.thumb] ?? null : null; delete i.thumb; });
    return { items };
  }
  if (action === 'cloud_head') {
    needId();
    const doc = await S.getJSON(`docs/${id}.json`);
    return doc ? { rev: doc.rev ?? 0, updatedAt: doc.updatedAt ?? 0, device: doc.device ?? '' } : { missing: true };
  }
  if (action === 'cloud_need') {
    const hashes = Array.isArray(body?.hashes) ? [...new Set(body.hashes)] : [];
    if (hashes.length > MAX_HASHES || !hashes.every((h) => HASH_RE.test(h))) throw new HttpError(400, 'bad_request');
    const have = new Set(await S.listNames('media'));
    const missing = hashes.filter((h) => !have.has(h));
    const uploads = await Promise.all(missing.map(async (h) => ({ hash: h, url: await S.uploadUrl('media/' + h) })));
    return { uploads };
  }
  if (action === 'cloud_save') {
    needId();
    const doc = body?.doc;
    if (!doc || typeof doc !== 'object' || doc.id !== id) throw new HttpError(400, 'bad_request');
    if (JSON.stringify(doc).length > MAX_DOC) throw new HttpError(413, 'too_big');
    const prev = await S.getJSON(`docs/${id}.json`);
    const baseRev = Number(body?.baseRev ?? 0);
    if (prev && (prev.rev ?? 0) !== baseRev && !body?.force) {
      throw new HttpError(409, 'conflict', { server: { rev: prev.rev ?? 0, updatedAt: prev.updatedAt ?? 0, device: prev.device ?? '' } });
    }
    const out = { ...doc, rev: (prev?.rev ?? 0) + 1, updatedAt: Date.now(), device: clean(body?.device).slice(0, 30) };
    await S.putJSON(`docs/${id}.json`, out);
    return { rev: out.rev, updatedAt: out.updatedAt };
  }
  if (action === 'cloud_load') {
    needId();
    const doc = await S.getJSON(`docs/${id}.json`);
    if (!doc) throw new HttpError(404, 'not_found');
    const urls = await S.downloadUrls(refsOf(doc).map((h) => 'media/' + h));
    const byHash = {};
    Object.entries(urls).forEach(([path, u]) => { byHash[path.replace(/^media\//, '')] = u; });
    return { doc, urls: byHash };
  }
  // 작은 기록 문서(아이별 연습 기록 등): kv/<key>.json. 합치기는 앱이 한다.
  if (action === 'cloud_get' || action === 'cloud_put') {
    const key = String(body?.key ?? '');
    if (!/^[a-z0-9_-]{1,80}$/.test(key)) throw new HttpError(400, 'bad_request');
    if (action === 'cloud_get') return { doc: await S.getJSON(`kv/${key}.json`) };
    const doc = body?.doc;
    if (!doc || typeof doc !== 'object') throw new HttpError(400, 'bad_request');
    if (JSON.stringify(doc).length > MAX_DOC) throw new HttpError(413, 'too_big');
    await S.putJSON(`kv/${key}.json`, doc);
    return { ok: true };
  }
  if (action === 'cloud_delete') {
    needId();
    await S.remove([`docs/${id}.json`]);
    return { ok: true };
  }
  // 모든 기록 지우기(부모님 설정): 작품·파일·기록 문서를 모두 지운다. 실수로 불리지 않게 확인 글자가 있어야 한다.
  if (action === 'cloud_reset') {
    if (body?.confirm !== 'erase-all') throw new HttpError(400, 'bad_request');
    let removed = 0;
    for (const dir of ['docs', 'media', 'kv']) {
      const paths = (await S.listNames(dir)).filter((n) => n && n !== '.emptyFolderPlaceholder').map((n) => `${dir}/${n}`);
      for (let i = 0; i < paths.length; i += 100) await S.remove(paths.slice(i, i + 100));
      removed += paths.length;
    }
    return { ok: true, removed };
  }
  throw new HttpError(400, 'bad_request');
}

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

// ---------- 요청 처리 ----------
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'method' });
  if (!originAllowed(origin)) return reply(origin, 403, { error: 'origin' });

  if (PASSCODE && !sameCode(req.headers.get('x-family-code') ?? '', PASSCODE)) {
    return reply(origin, 401, { error: 'bad_code' });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  let body;
  try { body = await req.json(); } catch (_) { return reply(origin, 400, { error: 'bad_request' }); }
  const action = String(body?.action ?? '');

  if (action.startsWith('cloud_')) {
    if (rateLimited('cloud:' + ip, CLOUD_RATE_PER_MIN)) return reply(origin, 429, { error: 'rate_limited' });
    try {
      return reply(origin, 200, await cloud(action, body));
    } catch (e) {
      if (e instanceof HttpError) return reply(origin, e.status, { error: e.code, ...(e.extra ?? {}) });
      console.error('cloud error', action, e);
      return reply(origin, 502, { error: 'cloud_error' });
    }
  }

  if (rateLimited('ai:' + ip)) return reply(origin, 429, { error: 'rate_limited' });
  if (action !== 'ping' && !GEMINI_KEY) return reply(origin, 500, { error: 'not_configured' });
  const ko = String(body?.ko ?? '').trim();
  const attempt = String(body?.attempt ?? '').trim();
  if (ko.length > MAX_TEXT || attempt.length > MAX_TEXT) return reply(origin, 400, { error: 'too_long' });

  try {
    if (action === 'ping') return reply(origin, 200, { ok: true, model: MODEL });
    if (action === 'translate') {
      if (!ko) return reply(origin, 400, { error: 'empty' });
      return reply(origin, 200, shapeTranslate(await askGemini(translatePrompt(ko), TRANSLATE_SCHEMA)));
    }
    if (action === 'glossary') {
      const words = Array.isArray(body?.words) ? body.words.map((w) => String(w).trim()).filter((w) => /^[A-Za-z][A-Za-z'’-]{0,29}$/.test(w)).slice(0, 40) : [];
      if (!words.length) return reply(origin, 400, { error: 'empty' });
      const context = String(body?.context ?? '').slice(0, 1500);
      const r = await askGemini(glossaryPrompt(words, context), GLOSSARY_SCHEMA);
      const items = (Array.isArray(r?.items) ? r.items : []).map((it) => ({ en: clean(it?.en), ko: clean(it?.ko).slice(0, 30) })).filter((it) => it.en && it.ko);
      return reply(origin, 200, { items });
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
