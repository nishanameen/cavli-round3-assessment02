import { answer, type Bundle, type EmbedModel, type Gate, type Generator, type Retrieval, type Row, type Store, type View } from './engine';
import { checkSource, type SourceRow } from './watch';

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DOCINTEL_SUPABASE_URL?: string;
  DOCINTEL_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BACKUP_KEY?: string;   // second Google project, used only when the first key hits a quota (HTTP 429)
  GEMINI_MODEL?: string;
  DEMO_ACCESS_SECRET?: string;
  RETRIEVAL_DEFAULT?: string;   // keyword | hybrid (Gemini vectors) | hybrid-gte; chosen from measured results
  GATE_DEFAULT?: string;        // coverage | model; chosen from measured results
};

const SYSTEM = `You answer technical questions about the Cavli C16QS LTE Cat 1bis module using ONLY the numbered
passages supplied. Rules:
- Every factual sentence must end with one or more citations in square brackets using the passage ids, e.g. [HW-v5.3-p031-2].
- Copy numbers, units, pin numbers and command names exactly as written in the passages. Never compute, convert or estimate.
- Do not infer compatibility, certification, battery life or behaviour that the passages do not state.
- If the passages do not contain the answer, set status to "not_verified" and say what is missing.
- If a passage is marked SIMULATED, mention that the value comes from a simulated revision.
- If a passage is marked SUPERSEDED, answer from the later revision first; give the superseded value only as the earlier wording.
- At most 110 words. Plain text, no markdown headings.
Return JSON: {"status": "answered" | "not_verified", "answer": string, "citations": [passage ids]}`;

const geminiKeys = (env: Env) => [env.GEMINI_API_KEY, env.GEMINI_BACKUP_KEY].filter((k): k is string => Boolean(k));

function supabaseStore(env: Env): Store & { call(body: object): Promise<any> } {
  // gemini-embedding-001 query vectors (768 d, normalised), same settings as docintel/embed.py; cached per request.
  const vectors = new Map<string, Promise<number[]>>();
  const embedQuery = (text: string) => {
    if (!vectors.has(text)) vectors.set(text, (async () => {
      let status = 0;
      for (const key of geminiKeys(env)) {            // next key only when this one is out of quota
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }),
        });
        status = resp.status;
        if (resp.status === 429) continue;
        if (!resp.ok) break;
        const values: number[] = ((await resp.json()) as any).embedding.values;
        const norm = Math.sqrt(values.reduce((a, x) => a + x * x, 0));
        return values.map((x) => Math.round((x / norm) * 1e6) / 1e6);
      }
      throw new Error(status ? `embedding HTTP ${status}` : 'no embedding key');
    })());
    return vectors.get(text)!;
  };
  const call = async (body: object): Promise<any> => {
    const resp = await fetch(env.DOCINTEL_SUPABASE_URL + '/functions/v1/cavli-docintel', {
      method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.DOCINTEL_TOKEN },
    });
    if (!resp.ok) throw new Error(`documentation store HTTP ${resp.status}`);
    return resp.json();
  };
  return {
    call,
    async search(view, terms, phrases, include_superseded, limit, query, model?: EmbedModel) {
      const base = { action: 'search', view, terms, phrases, include_superseded, limit };
      if (!query || !model) return ((await call(base)).rows ?? []) as Row[];
      if (model === 'gte') return ((await call({ ...base, hybrid: true, query })).rows ?? []) as Row[];
      const vector = await embedQuery(query);
      return ((await call({ ...base, hybrid: true, model: 'gemini', vector })).rows ?? []) as Row[];
    },
    async passages(view, pids) {
      return ((await call({ action: 'passages', view, pids })).rows ?? []) as Row[];
    },
    async bundle(view) {
      return (await call({ action: 'bundle', view })) as Bundle;
    },
  };
}

function gemini(env: Env, model: string): Generator {
  return async (question, passages, instruction) => {
    const blocks = passages.map((p) => {
      // Superseded passages are retrieved only with "Include superseded revisions (audit)"; tell the model which
      // revision is outdated so it does not lead with the old value.
      const tag = (p.simulated ? ' (SIMULATED revision - not a Cavli publication)' : '') +
        (p.status === 'superseded' ? ' (SUPERSEDED revision - outdated, replaced by a later revision)' : '');
      const at = p.printed_page ? `page ${p.printed_page}` : 'web page section';
      return `[${p.pid}] ${p.title}, revision ${p.revision}${tag}, ${at}, section: ${p.section_title || 'n/a'}\n${p.text}`;
    });
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `Question: ${question}\n${instruction}\n\nPassages:\n\n${blocks.join('\n\n---\n\n')}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 600 },
    });
    let lastError = '';
    for (const key of geminiKeys(env)) {                     // next key only when this one is out of quota (429)
      for (let attempt = 0; attempt < 2; attempt++) {        // one retry for transient provider errors
        try {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST', body, signal: AbortSignal.timeout(20000),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          });
          if (resp.ok) {
            const data: any = await resp.json();
            const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
            const out = JSON.parse(text);
            out._usage = { input_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount };
            return out;
          }
          lastError = `Gemini HTTP ${resp.status}`;
          if (resp.status === 429 || ![500, 502, 503, 504].includes(resp.status)) break;
        } catch (err) {
          lastError = (err as Error).name === 'TimeoutError' ? 'Gemini timed out' : 'Gemini unreachable';
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
      }
      if (lastError !== 'Gemini HTTP 429') break;
    }
    throw new Error(`${lastError} (after retry)`);
  };
}

function fixedEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const viewOf = (v: unknown): View => (v === 'sim' ? 'sim' : 'main');

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  const configured = Boolean(env.DOCINTEL_SUPABASE_URL && env.DOCINTEL_TOKEN);
  if (path === '/api/health') return json({ store: configured, generation: geminiKeys(env).length > 0,
    backup_key: Boolean(env.GEMINI_BACKUP_KEY) });
  if (!configured) return json({ error: 'Documentation store is not configured.' }, 503);
  const store = supabaseStore(env);
  try {
    if (path === '/api/ask' && request.method === 'POST') {
      const body: any = await request.json().catch(() => null);
      const question = typeof body?.question === 'string' ? body.question.trim() : '';
      if (question.length < 2 || question.length > 500) return json({ error: 'Enter a question of 2 to 500 characters.' }, 400);
      const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      const generate = geminiKeys(env).length && body.extractive !== true ? gemini(env, model) : null;
      return json(await answer(store, viewOf(body.view), question, {
        generate, model, includeSuperseded: body.all_revisions === true,
        retrieval: (['keyword', 'hybrid', 'hybrid-gte'].includes(body.retrieval) ? body.retrieval
          : env.RETRIEVAL_DEFAULT || 'keyword') as Retrieval,
        gate: (['coverage', 'model'].includes(body.gate) ? body.gate : env.GATE_DEFAULT || 'coverage') as Gate }));
    }
    if (path === '/api/sources' && request.method === 'GET') {
      return json((await store.call({ action: 'sources', view: viewOf(url.searchParams.get('view')) })).rows);
    }
    if (path === '/api/pipeline' && request.method === 'GET') {
      return json(await store.call({ action: 'pipeline', view: viewOf(url.searchParams.get('view')) }));
    }
    if (path === '/api/pipeline/check' && request.method === 'POST') {
      // Read-only: compares live sources with the fingerprints recorded at publish. Never re-indexes.
      const pipeline = await store.call({ action: 'pipeline', view: 'main' });
      const sources = (pipeline.sources as SourceRow[]).filter((s) => s.status === 'current' && !s.simulated);
      return json({ checked_at: new Date().toISOString(), results: await Promise.all(sources.map(checkSource)) });
    }
    if (path === '/api/review' && request.method === 'GET') {
      return json((await store.call({ action: 'review', view: viewOf(url.searchParams.get('view')),
        all: url.searchParams.get('all') === '1' })).rows);
    }
    const m = path.match(/^\/api\/review\/(\d{1,9})$/);
    if (m && request.method === 'POST') {
      const body: any = await request.json().catch(() => null);
      const status = body?.status;
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null;
      if (!['open', 'resolved'].includes(status) || (status === 'resolved' && !note)) {
        return json({ error: 'Resolving needs a short expert note.' }, 400);
      }
      return json((await store.call({ action: 'set_review', id: Number(m[1]), status, note })).item);
    }
    return json({ error: 'Not found.' }, 404);
  } catch {
    return json({ error: 'The documentation service is temporarily unavailable. Please try again.' }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const deployed = new URL(request.url).hostname.endsWith('.workers.dev');
    if (deployed && !env.DEMO_ACCESS_SECRET) return new Response('Reviewer access is not configured.', { status: 503 });
    if (env.DEMO_ACCESS_SECRET) {
      const expected = 'Basic ' + btoa('reviewer:' + env.DEMO_ACCESS_SECRET);
      if (!fixedEqual(request.headers.get('Authorization') ?? '', expected)) {
        return new Response('Reviewer sign-in required.', { status: 401, headers: {
          'WWW-Authenticate': 'Basic realm="Cavli C16QS documentation", charset="UTF-8"', 'Cache-Control': 'no-store' } });
      }
    }
    const resp = await route(request, env);
    const out = new Response(resp.body, resp);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return out;
  },
};
