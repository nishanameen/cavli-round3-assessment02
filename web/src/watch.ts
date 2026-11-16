// "Check sources for updates": repeats the probes recorded at publish time (docintel/watch.py) and compares.
// Detection only. Re-indexing stays in the controlled pipeline (ingest -> expert review -> publish).
const START = 'id="technical-data"';
const END = 'id="related-case-studies"';
const UA = 'Mozilla/5.0 (compatible; cavli-docintel-watch/1.0)';

export async function fingerprintHtml(html: string): Promise<string> {
  const s = html.indexOf(START), e = html.indexOf(END);
  let region = s >= 0 && e > s ? html.slice(s, e) : html;
  region = region.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(region));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Watch = { checked_at?: string; http_status?: number | null; etag?: string | null; last_modified?: string | null;
  content_length?: string | null; fingerprint?: string; note?: string } | null;
export type SourceRow = { code: string; title: string; revision: string; url: string; simulated: boolean;
  status: string; text_sha256: string; watch: Watch; doc_type: string };

export async function checkSource(src: SourceRow) {
  const base = { code: src.code, title: src.title, revision: src.revision, url: src.url,
    recorded_at: src.watch?.checked_at ?? null };
  const html = src.doc_type === 'product_page';
  try {
    const resp = await fetch(src.url, { method: html ? 'GET' : 'HEAD', redirect: 'follow',
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if ([401, 403, 429, 503].includes(resp.status)) {
      return { ...base, result: 'blocked', method: html ? 'page text fingerprint' : 'HTTP headers',
        detail: `The host answered HTTP ${resp.status} (automated check blocked). The pipeline's download hash check decides.` };
    }
    if (html) {
      const now = await fingerprintHtml(await resp.text());
      const before = src.watch?.fingerprint;
      if (!before) return { ...base, result: 'unknown', method: 'page text fingerprint', detail: 'No fingerprint recorded at publish.' };
      return { ...base, method: 'page text fingerprint (Technical Data + Variants)',
        result: now === before ? 'unchanged' : 'changed',
        detail: now === before ? 'Visible text matches the indexed snapshot.'
          : 'Visible text differs from the indexed snapshot. Re-run ingest; changed passages go to expert review before publishing.',
        before: before.slice(0, 12), now: now.slice(0, 12) };
    }
    const now = { etag: resp.headers.get('ETag'), content_length: resp.headers.get('Content-Length') };
    const before = { etag: src.watch?.etag ?? null, content_length: src.watch?.content_length ?? null };
    if (!before.etag && !before.content_length) {
      return { ...base, result: 'unknown', method: 'HTTP headers',
        detail: 'This host gives no stable ETag or size, so headers cannot show a change. The pipeline downloads the file and compares its SHA-256.' };
    }
    const same = (!before.etag || before.etag === now.etag) && (!before.content_length || before.content_length === now.content_length);
    return { ...base, method: 'HTTP headers (ETag + size)', result: same ? 'unchanged' : 'changed',
      detail: same ? 'ETag and file size match the indexed revision.'
        : 'ETag or size differs. Ingest will download it; a different SHA-256 stops for a manifest update and review.',
      before, now };
  } catch {
    return { ...base, result: 'unreachable', method: html ? 'page text fingerprint' : 'HTTP headers',
      detail: 'The host did not answer within 15 s.' };
  }
}
