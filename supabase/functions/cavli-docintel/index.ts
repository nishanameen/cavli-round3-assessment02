// Assignment 2 data access. Verifies a 64-hex bearer token against docintel.runtime_keys (SHA-256 hashes only)
// and calls the locked-down public.docintel_* SQL functions with the built-in service role.
// Hybrid search uses gemini-embedding-001 vectors (768 d, computed by the pipeline and the Worker) by default; the
// built-in gte-small model (384 d, embedded here) is kept as an A/B option.
declare namespace Supabase {
  namespace ai {
    class Session {
      constructor(model: string);
      run(text: string, options: { mean_pool: boolean; normalize: boolean }): Promise<number[]>;
    }
  }
}

const model = new Supabase.ai.Session('gte-small');
const base = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const headers = { 'Content-Type': 'application/json', apikey: key ?? '', Authorization: 'Bearer ' + (key ?? '') };
const reply = (data: unknown, status = 200) => Response.json(data, { status });

async function rpc(fn: string, args: Record<string, unknown>) {
  const resp = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!resp.ok) throw new Error(`${fn} failed (${resp.status})`);
  return resp.json();
}

async function embed(text: string) {
  const vector = await model.run(text, { mean_pool: true, normalize: true });
  if (!Array.isArray(vector) || vector.length !== 384 || !vector.every(Number.isFinite)) throw new Error('Embedding unavailable');
  return vector;
}

const isView = (v: unknown) => v === 'main' || v === 'sim';
const strList = (v: unknown, max: number, len: number, pattern?: RegExp) =>
  Array.isArray(v) && v.length <= max &&
  v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= len && (!pattern || pattern.test(x)));
const PID = /^[A-Za-z0-9.\-]{3,80}$/;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (!base || !key) return reply({ error: 'Service configuration unavailable.' }, 503);
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!/^Bearer [0-9a-f]{64}$/.test(auth)) return reply({ error: 'Unauthorized.' }, 401);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.slice(7))));
    const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    const access = await rpc('docintel_key', { p_hash: hash });
    if (!access) return reply({ error: 'Unauthorized.' }, 401);

    const raw = await req.text();
    if (raw.length > (access.can_publish ? 4_000_000 : 40_000)) return reply({ error: 'Request too large.' }, 413);
    let data: Record<string, any>;
    try {
      data = JSON.parse(raw);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    } catch { return reply({ error: 'Invalid request.' }, 400); }

    switch (data.action) {
      case 'search': {
        if (!isView(data.view) || !strList(data.terms ?? [], 40, 60) || !strList(data.phrases ?? [], 10, 60)) break;
        const common = { p_view: data.view, p_terms: data.terms ?? [], p_phrases: data.phrases ?? [],
          p_include_superseded: data.include_superseded === true,
          p_limit: Math.min(Math.max(Number(data.limit) || 60, 1), 100) };
        if (data.hybrid === true) {
          // Gemini: the Worker sends a normalised 768-d query vector. gte-small: embedded here from the question text.
          if (data.model === 'gemini') {
            if (!Array.isArray(data.vector) || data.vector.length !== 768 || !data.vector.every(Number.isFinite)) break;
            const rows = await rpc('docintel_search_hybrid', { ...common, p_embedding: JSON.stringify(data.vector), p_model: 'gemini' });
            return reply({ rows });
          }
          if (typeof data.query !== 'string' || !data.query.trim() || data.query.length > 500) break;
          const started = Date.now();
          const vector = await embed(data.query);
          const embedMs = Date.now() - started;
          const rows = await rpc('docintel_search_hybrid', { ...common, p_embedding: JSON.stringify(vector), p_model: 'gte' });
          return reply({ rows, embed_ms: embedMs });
        }
        return reply({ rows: await rpc('docintel_search', common) });
      }
      case 'passages':
        if (!isView(data.view) || !strList(data.pids, 60, 80, PID)) break;
        return reply({ rows: await rpc('docintel_passages', { p_view: data.view, p_pids: data.pids }) });
      case 'bundle':
        if (!isView(data.view)) break;
        return reply(await rpc('docintel_bundle', { p_view: data.view }));
      case 'sources':
        if (!isView(data.view)) break;
        return reply({ rows: await rpc('docintel_sources', { p_view: data.view }) });
      case 'pipeline':
        if (!isView(data.view)) break;
        return reply(await rpc('docintel_pipeline', { p_view: data.view }));
      case 'review':
        if (!isView(data.view)) break;
        return reply({ rows: await rpc('docintel_review', { p_view: data.view, p_all: data.all === true }) });
      case 'set_review':
        if (!Number.isInteger(data.id) || !['open', 'resolved'].includes(data.status) ||
            !(data.note == null || (typeof data.note === 'string' && data.note.length <= 500))) break;
        return reply({ item: await rpc('docintel_set_review', { p_id: data.id, p_status: data.status, p_note: data.note ?? null }) });
      case 'publish':
        if (!access.can_publish) return reply({ error: 'Forbidden.' }, 403);
        if (!data.payload || typeof data.payload !== 'object') break;
        return reply(await rpc('docintel_publish', { p: data.payload }));
      case 'set_gem_embeddings':
        if (!access.can_publish) return reply({ error: 'Forbidden.' }, 403);
        if (!Array.isArray(data.rows) || data.rows.length > 120) break;
        return reply(await rpc('docintel_set_gem_embeddings', { p: data.rows }));
      case 'embed_pending': {
        // Small batches keep each call inside the edge runtime's CPU limit; the publish command loops.
        if (!access.can_publish) return reply({ error: 'Forbidden.' }, 403);
        const queue: { pid: string; text: string }[] = await rpc('docintel_embed_queue', { p_limit: 3 });
        const rows = [];
        for (const item of queue) rows.push({ pid: item.pid, embedding: await embed(item.text) });
        const result = rows.length ? await rpc('docintel_set_embeddings', { p: rows }) : { updated: 0, remaining: 0 };
        return reply(result);
      }
    }
    return reply({ error: 'Invalid request.' }, 400);
  } catch {
    return reply({ error: 'Documentation service is temporarily unavailable.' }, 503);
  }
});
