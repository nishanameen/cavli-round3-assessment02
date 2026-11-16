// Answer engine for the hosted prototype. A line-for-line port of docintel/retrieve.py and docintel/answer.py so the
// hosted and local results can be scored by the same evaluation code. Postgres full-text search (ts_rank) replaces
// SQLite FTS5 BM25 as the candidate generator; the rerank, guardrails, band logic and validator are identical.

export type View = 'main' | 'sim';
export type Row = {
  pid: string; doc_id: string; revision: string; pdf_page: number | null; printed_page: string | null;
  section_no: string | null; section_title: string | null; anchor: string | null; text: string; code: string;
  title: string; doc_type: string; doc_scope: string; url: string; simulated: boolean; status: string | null;
  rank?: number; score?: number; coverage?: number;
  rrf?: number; similarity?: number | null; keyword_rank?: number | null; vector_rank?: number | null;
  semantic?: number; support?: number;
};
export type Claim = { variant: string; pid: string; bands: number[]; doc_id: string; title: string; revision: string;
  printed_page: string | null; section: string | null; excerpt: string };
export type Item = { id: number; kind: string; severity: string; topic: string; summary: string; details: any };
export type Bundle = { claims: Claim[]; review: Item[]; passage_docs: Record<string, string> };
export interface Store {
  // query + model given = hybrid search (keyword + vector, RRF-fused); otherwise keyword only.
  search(view: View, terms: string[], phrases: string[], includeSuperseded: boolean, limit: number,
    query?: string, model?: EmbedModel): Promise<Row[]>;
  passages(view: View, pids: string[]): Promise<Row[]>;
  bundle(view: View): Promise<Bundle>;
}
export type Generator = (question: string, passages: Row[], instruction: string) =>
  Promise<{ status?: string; answer?: string; citations?: unknown[]; _usage?: unknown }>;

const STOP = new Set(`a an the of to for in on at by with and or is are was be been does do did can could should would
what which who whom how when where why this that these those it its i my me we our you your any all there
module c16qs cavli please tell about give list need needs use used using get has have from as into than
long must held hold much many appear appears after before also exactly happen happens bare kind type`.split(/\s+/));

const EXPAND: Record<string, string[]> = {
  reset: ['reset', 'rstn', 'resetn'], restart: ['restart', 'reset', 'reboot'], reboot: ['reboot', 'reset'],
  voltage: ['voltage', 'vbat', 'supply'], supply: ['supply', 'vbat', 'input'], power: ['power', 'supply'],
  band: ['band', 'bands'], bands: ['band', 'bands'], jumper: ['jumper', 'jmp'], jmp: ['jmp', 'jumper'],
  com: ['com', 'ports', 'ttyusb'], ports: ['ports', 'com'], port: ['port', 'com'],
  battery: ['battery', 'consumption', 'sleep', 'hibernate'], life: ['life'],
  temperature: ['temperature'], certified: ['certification', 'certified', 'approval'],
  certification: ['certification', 'certified', 'approval'], antenna: ['antenna', 'antennas'],
  boot: ['boot', 'booted'], operating: ['operating', 'condition'],
};
const CODES = 'WW|NA|EU|IN|EAJ|LA|AN|EA';
const VARIANT_NAMES: [RegExp, string][] = [[/worldwide|global/i, 'WW'], [/india/i, 'IN'], [/north america|\busa\b/i, 'NA'],
  [/europe/i, 'EU'], [/japan|eurasia/i, 'EAJ'], [/latin america/i, 'LA'], [/australia|new zealand/i, 'AN']];
const EVK_HINT = /\bevk\b|evaluation (kit|board)|\bjumper|\bjmp\b|type-?c|com ports?|ttyusb|esp32|dev(elopment)? (kit|board)/i;
const MODULE_HINT = /bare module|\bpin\b|\bpins\b|\blga\b|\bvbat|\bvb\b|\bpad\b|module itself/i;
const UNIT_HINTS: Record<string, RegExp> = {
  voltage: /\d\s?V\b/, volts: /\d\s?V\b/, current: /\d\s?(mA|µA|uA)\b/, consumption: /\d\s?(mA|µA|uA)\b/,
  temperature: /°C|℃/, speed: /\d\s?[MmKk]bps/,
};

export type Query = { text: string; keywords: string[]; expanded: string[]; phrases: string[];
  variant: string | null; scope: 'evk' | 'module' | null; band_numbers: number[] };

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function detectVariant(question: string): string | null {
  const m = question.match(new RegExp(`c16qs-(${CODES})\\b`, 'i')) || question.match(new RegExp(`\\b(${CODES})\\b`)) ||
    question.toLowerCase().match(new RegExp(`\\b(${CODES.toLowerCase()})\\s+variant\\b`));
  if (m) return m[1].toUpperCase();
  for (const [pat, code] of VARIANT_NAMES) if (pat.test(question)) return code;
  return null;
}

export function analyze(question: string): Query {
  const low = question.toLowerCase();
  const phrases: string[] = [];
  const j = low.match(/\b(?:jmp|jumper)\s*(\d+)\b/);
  if (j) phrases.push(`jmp ${j[1]}`, `jumper ${j[1]}`);
  for (const m of low.matchAll(/\bat[+$^&]([a-z]+)\b/g)) phrases.push(`at ${m[1]}`);
  const band_numbers = [...low.matchAll(/\b(?:band|b)\s?(\d{1,2})\b/g)].map((m) => Number(m[1]));
  for (const m of low.matchAll(/\bpin\s+(\d{1,3})\b/g)) phrases.push(`pin ${m[1]}`);
  const words = low.match(/[a-z0-9]+/g) ?? [];
  const keywords = uniq(words).filter((w) => !STOP.has(w) && w.length > 1);
  const expanded = uniq(keywords.flatMap((w) => EXPAND[w] ?? [w]));
  const scope = EVK_HINT.test(question) ? 'evk' : MODULE_HINT.test(question) ? 'module' : null;
  return { text: question, keywords, expanded, phrases, variant: detectVariant(question), scope, band_numbers };
}

const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);

export function coverage(q: Query, text: string): number {
  if (!q.keywords.length) return 0;
  const tokens = new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));
  let hit = 0;
  for (const w of q.keywords) {
    const options = [...(EXPAND[w] ?? [w]), w];
    if (options.some((o) => tokens.has(stem(o))) || (UNIT_HINTS[w] && UNIT_HINTS[w].test(text))) hit++;
  }
  return hit / q.keywords.length;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export type EmbedModel = 'gemini' | 'gte';
export type Retrieval = 'keyword' | 'hybrid' | 'hybrid-gte';
// How "is the answer in the documents?" is decided before the model is asked:
// 'coverage' = word-overlap pre-filter (top passage must cover >= 40% of the question's keywords, or the meaning band);
// 'model'    = no pre-filter: the model judges the retrieved passages and may answer not_verified (validator still applies).
export type Gate = 'coverage' | 'model';
const modelOf = (r: Retrieval): EmbedModel | undefined => (r === 'hybrid' ? 'gemini' : r === 'hybrid-gte' ? 'gte' : undefined);

export async function candidates(store: Store, view: View, q: Query, includeSuperseded = false, retrieval: Retrieval = 'keyword') {
  const model = modelOf(retrieval);
  return store.search(view, q.expanded.slice(0, 40), q.phrases.slice(0, 10), includeSuperseded, 60,
    model ? q.text.slice(0, 500) : undefined, model);
}

// Cosine similarity -> 0..1 meaning score per embedding model. Calibrated on eval/cases.json + holdout.json only
// (never the paraphrase sets): LOW = the lowest similarity any expected passage reached, HIGH ~ their median.
// Unanswerable questions reach similar values, so similarity means "on topic", not "answered": the model's
// not_verified option and the validator remain the guard for those.
export const SEMANTIC: Record<EmbedModel, { low: number; high: number }> = {
  gemini: { low: 0.68, high: 0.77 },   // gemini-embedding-001: expected passages 0.685-0.817, median 0.766
  gte: { low: 0.86, high: 0.92 },      // gte-small: expected passages 0.861-0.947, median 0.900
};
export function semanticScore(similarity: number | null | undefined, model: EmbedModel = 'gemini') {
  if (similarity == null) return 0;
  const { low, high } = SEMANTIC[model];
  return Math.min(1, Math.max(0, (similarity - low) / (high - low)));
}

export function rerank(source: Row[], q: Query, k: number, scopeFilter: string | null = null, model: EmbedModel = 'gemini'): Row[] {
  if (!source.length) return [];
  const rows = source.map((r) => ({ ...r }));
  const hybrid = rows.some((r) => r.rrf != null);
  // Hybrid: relevance is the fused RRF rank; support may come from meaning (vector) as well as keyword overlap.
  const best = Math.max(...rows.map((r) => (hybrid ? r.rrf ?? 0 : r.rank ?? 0)));
  const wantsAt = /\bat\b|command/i.test(q.text);
  const wantsHistory = /version|revision|history|changed|updated/i.test(q.text);
  for (const r of rows) {
    const text = (r.section_title ?? '') + '\n' + r.text;
    r.coverage = round(coverage(q, text), 3);
    r.semantic = round(semanticScore(r.similarity, model), 3);
    r.support = Math.max(r.coverage, hybrid ? r.semantic : 0);
    const flat = text.toLowerCase().replace(/\s+/g, ' ');
    const phrase = q.phrases.some((p) => flat.includes(p));
    const relevance = best ? (hybrid ? r.rrf ?? 0 : r.rank ?? 0) / best : 0;
    let score = 0.45 * relevance + 0.45 * r.support + (phrase ? 0.3 : 0);
    if (q.scope && (r.doc_scope === 'evk' || r.doc_scope === 'module')) score += r.doc_scope === q.scope ? 0.15 : -0.15;
    if (r.doc_type === 'at_command_manual' && !wantsAt) score -= 0.15;
    if (r.pdf_page && !r.section_no && !wantsHistory) score -= 0.25;
    if (q.band_numbers.length && ['hardware_manual', 'product_page'].includes(r.doc_type) && /\b\d{1,2}\s*\//.test(r.text)) score += 0.1;
    r.score = round(score, 4);
  }
  const pool = (scopeFilter ? rows.filter((r) => r.doc_scope === scopeFilter) : rows).sort((a, b) => b.score! - a.score!);
  const seen = new Set<string>();
  const picked: Row[] = [];
  for (const r of pool) {
    const key = [r.doc_id, r.revision, r.pdf_page, r.section_title].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(r);
    if (picked.length === k) break;
  }
  return picked;
}

// ---- answering ---------------------------------------------------------------------------------------------

const NOT_VERIFIED = 'Not verified in the available C16QS sources.';
const GUARDRAILS = [
  {
    id: 'battery_life',
    match: /battery (life|last)|how long .*battery|battery .*(last|life|days|months|years)/i,
    unless: /duty cycle|every \d+|per (hour|day)|mah|\bmA\b.*\bs\b/i as RegExp | null,
    reason: "None of the sources states a battery life. It depends on the device's duty cycle, network conditions and " +
      'battery capacity, none of which is given. The hardware manual lists current per operating mode, which an ' +
      'engineer could use with a measured usage profile.',
    related: 'power consumption current sleep hibernate idle mode',
    escalate: 'Share the intended duty cycle and battery capacity with Cavli support for a power estimate.',
  },
  {
    id: 'custom_certification',
    match: /(certif|approv|fcc|ce mark|ptcrb|compliance).*(custom|my|own|our|third.party)|(custom|my|own|our|third.party).*(certif|approv)/i,
    unless: null as RegExp | null,
    reason: "The sources do not certify any specific custom antenna or end product. The hardware manual only states " +
      "the conditions under which the module's FCC authorization stays valid, and it names no approved antenna models.",
    related: 'module certification OEM integration antenna FCC authorization conditions',
    escalate: 'Escalate to Cavli support and a certification specialist; human approval is required.',
  },
];
const SCOPE_SENSITIVE = /\b(voltage|supply|power input|input power|power source|volts?)\b/i;
const BAND_TOPIC = /\b(lte )?bands?\b|\bb\d{1,2}\b/i;

function quote(text: string, limit = 420) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(' ')) + ' ...';
}

function cite(p: Row) {
  const loc: string[] = [];
  if (p.printed_page) loc.push(`p. ${p.printed_page}`);
  if (p.pdf_page && String(p.printed_page) !== String(p.pdf_page)) loc.push(`PDF page ${p.pdf_page}`);
  const location = p.pdf_page && !p.printed_page ? `PDF page ${p.pdf_page} (no printed page label)`
    : loc.length ? loc.join(', ') : 'web page (no page numbers)';
  const section = [p.section_no, p.section_title].filter(Boolean).join(' ');
  const url = p.url + (p.pdf_page ? `#page=${p.pdf_page}` : p.anchor ? `#${p.anchor}` : '');
  return {
    pid: p.pid, document: p.title, revision: p.status === 'superseded' ? `${p.revision} (OUTDATED)` : p.revision,
    revision_status: p.status ?? 'current', simulated: Boolean(p.simulated), location, section: section || null,
    url, quote: quote(p.text),
  };
}

function bestLines(q: Query, text: string, n = 3) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return '';
  const scores = lines.map((l) => coverage(q, l));
  const anchored = lines.map((l, i) => (q.phrases.some((ph) => l.toLowerCase().includes(ph)) ? i : -1)).filter((i) => i >= 0);
  let best = -1, bestI = 0;
  for (const i of anchored.length ? anchored : lines.map((_, i) => i)) {
    const s = scores.slice(i, i + n).reduce((a, b) => a + b, 0);
    if (s > best) { best = s; bestI = i; }
  }
  const start = bestI > 0 && /\b(min|typ|max|parameter|pin no|description)\b/i.test(lines[bestI - 1]) ? bestI - 1 : bestI;
  return lines.slice(start, bestI + n).join(' ');
}

function extractive(q: Query, passages: Row[], k = 2) {
  const parts: string[] = [], cited: string[] = [];
  for (const p of passages.slice(0, k)) {
    let snippet = bestLines(q, p.text);
    const heading = [p.section_no, p.section_title].filter(Boolean).join(' ');
    if (snippet && heading && !snippet.includes(heading)) snippet = `${heading}: ${snippet}`;   // keep the section name
    if (snippet) { parts.push(`“${snippet}” [${p.pid}]`); cited.push(p.pid); }
  }
  return { text: parts.join(' '), cited };
}

export function markers(answer: string) {
  const ids: string[] = [];
  for (const m of answer.matchAll(/\[([^\]]+)\]/g)) {
    for (const x of m[1].split(',')) if (/^[A-Z]+-[A-Za-z0-9.\-]+$/.test(x.trim())) ids.push(x.trim());
  }
  return ids;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Revision labels. With superseded revisions included, the model may say which revision a value comes from
// ("revision 5.4"). Such a label is not a spec value, so it is exempt from the number check, but only when it is the
// revision of a cited passage AND it is written as a revision: "revision 5.3 and 5.4", "rev. 5.4", "Manual 5.3",
// "5.4-SIMULATED", "the 5.4 simulated revision". A label followed by a unit ("5.4 V") or standing on its own is
// still a value and must occur in the cited text. Matching is case-sensitive so units cannot be confused.
const UNIT_AFTER = String.raw`(?!\s?(?:[mµu]?[VAW]|m?s|[kMG]?Hz|[kMG]?bps|dBm?|mm|[nuµp]F|mAh)(?![A-Za-z]))(?!\s?(?:°C|℃|%))`;
const REV_QUALIFIER = '(?:[Ss]imulated|[Ss]uperseded|[Oo]utdated|[Cc]urrent|[Ee]arlier|[Ll]ater|[Nn]ewer|[Oo]lder)';
export function withoutRevisionLabels(body: string, revisions: string[]) {
  const labels = uniq(revisions.map((r) => /^\d+(?:\.\d+)+/.exec(r ?? '')?.[0]).filter((l): l is string => Boolean(l)));
  if (!labels.length) return body;
  const lab = String.raw`(?:${labels.map(escapeRe).join('|')})(?!\d)(?!\.\d)${UNIT_AFTER}`;
  const rev = String.raw`v?${lab}(?:-SIMULATED|-[Ss]imulated)?`;
  return [
    String.raw`\b(?:[Rr]evisions?|[Rr]ev\.?|[Mm]anual)\s+${rev}(?:\s*(?:,|and|or|vs\.?|versus|to)\s*${rev})*`,
    String.raw`(?<![\d.])${rev}(?:\s*\((?:SIMULATED|[Ss]imulated)\))?\s+(?:${REV_QUALIFIER}\s+)?(?:[Rr]evision|[Mm]anual)s?\b`,
    String.raw`(?<![\d.])${lab}(?:-SIMULATED|-[Ss]imulated)\b`,
  ].reduce((text, pat) => text.replace(new RegExp(pat, 'g'), ' '), body);
}

export function validate(answer: string, cited: string[], allowed: Map<string, Row>) {
  const all = uniq([...cited, ...markers(answer)]);
  const bad = all.filter((c) => !allowed.has(c));
  const citedRows = all.filter((c) => allowed.has(c)).map((c) => allowed.get(c)!);
  const body = withoutRevisionLabels(answer.replace(/\[[^\]]+\]/g, ' ').replace(/C16QS/g, ' '), citedRows.map((r) => r.revision));
  const citedText = citedRows.map((r) => r.text.replace(/\s+/g, ' ')).join(' ');
  const nums = body.match(/(?<![A-Za-z\d.])\d+(?:\.\d+)?/g) ?? [];
  const unsupported = nums.filter((n) => !new RegExp(`(?<![\\d.])${escapeRe(n)}(?!\\d)`).test(citedText));
  return { citations_in_retrieved_set: !bad.length, unknown_citations: bad, numbers_supported: !unsupported.length,
    unsupported_numbers: unsupported, passed: !bad.length && !unsupported.length && all.length > 0 };
}

type Validation = ReturnType<typeof validate>;
type Composed = { status: string; text: string; cited: string[]; mode: string; validation?: unknown; note?: string;
  usage?: unknown; clarification?: string; related?: string[]; model_ms?: number;
  rejected?: Validation };   // set when the model answered but the validator rejected it (not an outage)

async function compose(q: Query, passages: Row[], generate: Generator | null, model: string, instruction = ''): Promise<Composed> {
  const allowed = new Map(passages.map((p) => [p.pid, p]));
  let reason: string;
  let rejected: Validation | undefined;
  if (generate && passages.length) {
    const started = Date.now();
    try {
      const out = await generate(q.text, passages, instruction);
      const cited = (out.citations ?? []).filter((c): c is string => typeof c === 'string');
      const check = validate(out.answer ?? '', cited, allowed);
      const model_ms = Date.now() - started;
      if (out.status === 'not_verified') {
        return { status: 'not_verified', text: out.answer ?? '', cited, mode: `gemini:${model}`, validation: check, usage: out._usage, model_ms };
      }
      if (check.passed) {
        return { status: 'answered', text: out.answer!, cited: uniq([...cited, ...markers(out.answer!)]),
          mode: `gemini:${model}`, validation: check, usage: out._usage, model_ms };
      }
      reason = `generated answer rejected by validator: ${JSON.stringify(check)}`;
      rejected = check;
    } catch (err) {
      reason = `generation unavailable (${(err as Error).message})`;
    }
  } else {
    reason = generate ? 'no passages' : 'extractive mode (no model key or extractive requested)';
  }
  const ex = extractive(q, passages);
  return { status: ex.text ? 'answered' : 'not_verified', text: ex.text, cited: ex.cited, mode: 'extractive',
    validation: validate(ex.text, ex.cited, allowed), note: reason, rejected };
}

// Under the model gate, compose() falling back to quotes means there is no model-checked answer. Say why: either the
// validator rejected the model's answer (a citation or number not in the cited passages), or the model was unavailable.
// A rejection is not an outage, and retrying at temperature 0 would not change it (F21).
function unchecked(c: Composed) {
  const bad = c.rejected;
  if (!bad) return { mode: 'model unavailable', validation: undefined, retry: true,
    reason: 'The answer model is unavailable right now, so no answer could be checked.' };
  const why = [
    bad.unknown_citations.length ? `it cited passages outside the retrieved set: ${bad.unknown_citations.join(', ')}` : '',
    bad.unsupported_numbers.length ? `it contained numbers not found in the cited passages: ${bad.unsupported_numbers.join(', ')}` : '',
  ].filter(Boolean).join('; ') || 'it cited no passages';
  return { mode: 'validator rejected', validation: bad, retry: false,
    reason: `The model's answer was withheld because the citation and number check rejected it (${why}).` };
}

function reviewFlags(bundle: Bundle, pids: string[], rows: Map<string, Row>, question: string) {
  const set = new Set(pids);
  const docs = new Set(pids.map((p) => rows.get(p)?.doc_id).filter(Boolean));
  const flags = [];
  for (const item of bundle.review) {
    const d = item.details ?? {};
    let hit = false;
    if (item.kind === 'conflict') hit = BAND_TOPIC.test(question) && (d.claims ?? []).some((c: Claim) => set.has(c.pid));
    else if (item.kind === 'revision_change') hit = (d.changes ?? []).some((c: any) => (c.new_pids ?? []).some((p: string) => set.has(p)));
    else if (item.kind === 'cross_reference_gap') hit = set.has(d.referencing_pid);
    else if (item.kind === 'outdated_reference') hit = docs.has(bundle.passage_docs[d.referencing_pid]);
    if (hit) flags.push({ review_id: item.id, kind: item.kind, severity: item.severity, topic: item.topic, summary: item.summary });
  }
  return flags;
}

function where(claims: Claim[]) {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const key = `${c.title}\u0000${c.revision}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()].map(([key, cs]) => {
    const [title, rev] = key.split('\u0000');
    const pages = uniq(cs.filter((c) => c.printed_page).map((c) => Number(c.printed_page))).sort((a, b) => a - b);
    const loc = pages.length ? (pages.length === 1 ? 'p. ' : 'pp. ') + pages.join(', ') : cs[0].section;
    return `${title} ${rev} (${loc})`;
  }).join('; ');
}

function bandAnswer(bundle: Bundle, q: Query): Composed | null {
  if (!bundle.claims.length) return null;
  const byVariant = new Map<string, Claim[]>();
  for (const c of bundle.claims) byVariant.set(c.variant, [...(byVariant.get(c.variant) ?? []), c]);
  const conflicts = new Map(bundle.review.filter((i) => i.kind === 'conflict').map((i) => [i.topic, i]));
  const key = (c: Claim) => c.bands.join(',');
  const distinct = (items: Claim[]) => [...new Map(items.map((c) => [key(c), c.bands])).values()];
  const sourcesLine = (items: Claim[]) => {
    const seen = new Set<string>(), out: string[] = [];
    for (const c of items) {
      const k = c.doc_id + '|' + key(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(`${c.title} ${c.revision} (${c.printed_page ? 'p. ' + c.printed_page : c.section}): ${c.bands.join(', ')} [${c.pid}]`);
    }
    return out;
  };
  if (!q.variant) {
    const lines: string[] = [], cited: string[] = [];
    for (const variant of [...byVariant.keys()].sort()) {
      const items = byVariant.get(variant)!;
      const sets = distinct(items);
      const agreed = sets[0].filter((b) => sets.every((s) => s.includes(b))).sort((a, b) => a - b);
      const disputed = uniq(sets.flat()).filter((b) => !agreed.includes(b)).sort((a, b) => a - b);
      lines.push(`${variant}: ${agreed.join(', ')}` + (disputed.length ? `; disputed between sources: ${disputed.join(', ')}` : ''));
      cited.push(...items.map((c) => c.pid));
    }
    return { status: 'ambiguous', mode: 'structured band claims', cited: uniq(cited),
      text: 'LTE band support depends on the C16QS regional variant, so there is no single answer. ' +
        'Bands listed by every current source, per variant: ' + lines.join(' | ') + '.',
      clarification: 'Which variant or SKU do you mean (for example C16QS-WW-GNAH or C16QS-IN-GNAN)?' };
  }
  const items = byVariant.get(q.variant);
  if (!items) return { status: 'not_verified', text: `${NOT_VERIFIED} No band list was found for the ${q.variant} variant.`,
    cited: [], mode: 'structured band claims' };
  const sets = distinct(items);
  const cited = uniq(items.map((c) => c.pid));
  const review = conflicts.get(`bands:${q.variant}`);
  if (q.band_numbers.length) {
    const verdicts: string[] = [];
    let status = 'answered';
    for (const b of q.band_numbers) {
      const listed = sets.map((s) => s.includes(b));
      if (listed.every(Boolean)) verdicts.push(`Band ${b} is listed for ${q.variant} in every current source.`);
      else if (!listed.some(Boolean)) {
        verdicts.push(`Band ${b} is not listed for ${q.variant} in any current source; support is not verified.`);
        if (status === 'answered') status = 'not_verified';
      } else {
        verdicts.push(`Conflicting evidence for Band ${b} on ${q.variant}: listed in ${where(items.filter((c) => c.bands.includes(b)))}, ` +
          `but not listed in ${where(items.filter((c) => !c.bands.includes(b)))}. It is not treated as confirmed` +
          (review ? ` and is queued for expert review (item #${review.id}).` : '.'));
        status = 'conflict';
      }
    }
    return { status, text: verdicts.join(' ') + ' Evidence: ' + sourcesLine(items).join(' | '), cited, mode: 'structured band claims' };
  }
  let text = `LTE bands listed for the ${q.variant} variant: ` + sourcesLine(items).join(' | ');
  if (sets.length > 1) text += '. The sources disagree; disputed bands are not confirmed' + (review ? ` (expert review item #${review.id}).` : '.');
  return { status: sets.length > 1 ? 'conflict' : 'answered', text, cited, mode: 'structured band claims' };
}

export async function answer(store: Store, view: View, question: string, opts: {
  generate: Generator | null; model: string; includeSuperseded?: boolean; k?: number; retrieval?: Retrieval; gate?: Gate;
}) {
  const started = Date.now();
  const k = opts.k ?? 6;
  const q = analyze(question);
  const modelGate = opts.gate === 'model' && opts.generate !== null;   // the model judges answerability
  let retrieval: Retrieval = opts.retrieval ?? 'hybrid';
  const [first, bundle] = await Promise.all([
    candidates(store, view, q, opts.includeSuperseded, retrieval).catch(() => null), store.bundle(view)]);
  let retrievalNote: string | null = null;
  let cands = first;
  if (!cands) {                                   // embedding or vector search unavailable: answer from keyword search
    retrievalNote = `${retrieval} search unavailable; fell back to keyword search`;
    retrieval = 'keyword';
    cands = await candidates(store, view, q, opts.includeSuperseded, 'keyword');
  }
  const emb = modelOf(retrieval) ?? 'gemini';
  const retrievalMs = Date.now() - started;
  const retrieved = rerank(cands, q, k, null, emb);
  let shown = retrieved;
  let composed: Composed | null = null;

  const guard = GUARDRAILS.find((g) => g.match.test(question) && !(g.unless && g.unless.test(question)));
  if (guard) {
    const rq = analyze(guard.related);
    const related = rerank(await candidates(store, view, rq, false, retrieval).catch(() => candidates(store, view, rq)), rq, 3, null, emb);
    const relatedIds = new Set(related.map((r) => r.pid));
    shown = [...related, ...retrieved.filter((r) => !relatedIds.has(r.pid)).slice(0, 2)];
    const context = related.filter((r) => r.printed_page)
      .map((r) => `${r.code} ${r.revision} p. ${r.printed_page} §${r.section_no} ${r.section_title}`).join('; ');
    composed = { status: 'not_verified', cited: [], related: related.map((r) => r.pid), mode: `guardrail:${guard.id}`,
      text: `${NOT_VERIFIED} ${guard.reason} ${guard.escalate}` + (context ? ` Related passages shown as context only: ${context}.` : '') };
  } else if (BAND_TOPIC.test(question) && !/\bpower|current|consumption\b/i.test(question)) {
    composed = bandAnswer(bundle, q);
    if (composed) {
      const pool = new Map(retrieved.map((r) => [r.pid, r]));
      const missing = composed.cited.filter((p) => !pool.has(p));
      if (missing.length) for (const r of await store.passages(view, missing.slice(0, 60))) pool.set(r.pid, r);
      const citedSet = new Set(composed.cited);
      shown = [...composed.cited.filter((p) => pool.has(p)).map((p) => pool.get(p)!),
        ...retrieved.filter((r) => !citedSet.has(r.pid)).slice(0, 2)];
    }
  } else if (SCOPE_SENSITIVE.test(question) && q.scope === null) {
    const moduleRows = rerank(cands, q, 4, 'module', emb);
    const evkRows = rerank(cands, q, 4, 'evk', emb);
    if (moduleRows.length && evkRows.length && Math.max(...evkRows.map((r) => r.support!)) >= 0.5) {
      const [mod, ev] = await Promise.all([
        compose(q, moduleRows, opts.generate, opts.model, 'Answer only for the bare C16QS module (VBAT supply), not the EVK.'),
        compose(q, evkRows, opts.generate, opts.model, 'Answer only for the C16QS EVK board power input, not the bare module.'),
      ]);
      shown = [...moduleRows, ...evkRows];
      // Under the model gate, a half that fell back to quotes has no model-checked answer, so it is not presented as
      // one: it says why, and its closest passages are context only. If neither half was checked, the whole answer is
      // "not verified" (the per-scope counterpart of the rule below; F22). Without the model gate nothing changes.
      const halves = [{ c: mod, rows: moduleRows, label: 'module' }, { c: ev, rows: evkRows, label: 'EVK' }]
        .map((h) => ({ ...h, u: modelGate && h.c.mode === 'extractive' ? unchecked(h.c) : null }));
      const part = (h: (typeof halves)[number]) =>
        h.u ? `Not verified: ${h.u.reason} The closest ${h.label} passages are shown as context.` : h.c.text;
      const ok = halves.filter((h) => !h.u);
      composed = { status: ok.length ? 'ambiguous' : 'not_verified',
        text: (ok.length ? '' : `${NOT_VERIFIED} `) +
          `This depends on what you are powering. Bare module: ${part(halves[0])} EVK board: ${part(halves[1])}`,
        clarification: 'Do you mean the bare C16QS module (VBAT) or the C16QS EVK board input?',
        cited: ok.flatMap((h) => h.c.cited),
        related: halves.filter((h) => h.u).flatMap((h) => h.rows.slice(0, 2).map((r) => r.pid)),
        mode: ok.length === 2 ? `${mod.mode} (per scope)`
          : `${uniq(halves.map((h) => (h.u ? h.u.mode : h.c.mode))).join(' / ')} (per scope)`,
        validation: { module: halves[0].u ? halves[0].u.validation ?? null : mod.validation,
          evk: halves[1].u ? halves[1].u.validation ?? null : ev.validation },
        note: [mod.note, ev.note].filter(Boolean).join('; ') || undefined,
        model_ms: Math.max(mod.model_ms ?? 0, ev.model_ms ?? 0) };
    }
  }

  if (!composed) {
    const topSupport = Math.max(0, ...retrieved.map((r) => r.support ?? 0));   // keyword overlap or meaning
    if (!retrieved.length || (!modelGate && topSupport < 0.4)) {
      composed = { status: 'not_verified', text: `${NOT_VERIFIED} The closest passages do not cover the question's key terms.`,
        cited: [], mode: 'coverage threshold' };
    } else {
      composed = await compose(q, retrieved, opts.generate, opts.model);
      if (modelGate && composed.mode === 'extractive') {
        // The model is the judge of answerability here. If it gave no checked answer, never present quotes as an
        // answer: say "not verified", give the actual cause and show the closest passages as context only.
        const u = unchecked(composed);
        composed = { status: 'not_verified', cited: [], related: retrieved.slice(0, 3).map((r) => r.pid), mode: u.mode,
          note: composed.note, validation: u.validation,
          text: `${NOT_VERIFIED} ${u.reason} ${u.retry ? 'The closest passages are shown as context; please try again.'
            : 'The closest passages are shown as context only.'}` };
      }
      if (composed.status === 'not_verified') {
        if (!composed.text.startsWith('Not verified')) composed.text = `${NOT_VERIFIED} ${composed.text}`;
        // A refusal has no supporting evidence: passages the model checked are shown as context, never as citations.
        // Keep context already chosen above (the closest passages), which used to be overwritten here.
        composed.related = uniq([...(composed.related ?? []), ...composed.cited]);
        composed.cited = [];
      }
    }
  }

  const byPid = new Map(shown.map((r) => [r.pid, r]));
  const citedPids = composed.cited.filter((p) => byPid.has(p));
  let flags = reviewFlags(bundle, citedPids.length ? citedPids : shown.slice(0, 3).map((r) => r.pid), byPid, question);
  if (composed.mode === 'structured band claims' && q.variant) {
    flags = flags.filter((f) => !f.topic.startsWith('bands:') || f.topic === `bands:${q.variant}`);
  }
  if (composed.status === 'answered' && flags.some((f) => f.kind === 'conflict' || f.kind === 'revision_change' ||
      (f.kind === 'cross_reference_gap' && composed!.text.includes(f.topic.split(':').slice(1).join(':'))))) {
    composed.status = 'answered_with_flags';
  }
  const changed: string[] = [];
  for (const item of bundle.review.filter((i) => i.kind === 'revision_change')) {
    const d = item.details;
    for (const c of d.changes ?? []) {
      if ((c.new_pids ?? []).some((p: string) => citedPids.includes(p))) {
        changed.push(`Passage changed in ${d.new_revision} vs ${d.old_revision} (p. ${c.printed_page}): was “${(c.removed ?? []).join(' ').slice(0, 200)}” (review #${item.id}).`);
      }
    }
  }
  const outdated = citedPids.filter((p) => byPid.get(p)!.status === 'superseded');
  const warnings = [
    ...(citedPids.some((p) => byPid.get(p)!.simulated) ? ['Cites a SIMULATED revision - not a Cavli publication.'] : []),
    ...(outdated.length ? [`Cites superseded revision passage(s): ${outdated.join(', ')}`] : []),
    ...changed,
  ];
  return {
    question, view,
    query: { keywords: q.keywords, phrases: q.phrases, variant: q.variant, scope: q.scope, bands: q.band_numbers },
    status: composed.status, answer: composed.text, clarification: composed.clarification ?? null,
    citations: citedPids.map((p) => cite(byPid.get(p)!)),
    related_context: (composed.related ?? []).filter((p) => byPid.has(p)).map((p) => cite(byPid.get(p)!)),
    review_flags: flags, warnings,
    retrieval, retrieval_note: retrievalNote, gate: opts.gate === 'model' && opts.generate ? 'model' : 'coverage',
    retrieved: shown.map((r) => ({ pid: r.pid, score: r.score ?? null, coverage: r.coverage ?? null,
      similarity: r.similarity == null ? null : round(r.similarity, 3), keyword_rank: r.keyword_rank ?? null,
      vector_rank: r.vector_rank ?? null, document: r.title, revision: r.revision, page: r.printed_page,
      section: r.section_title })),
    mode: composed.mode, validation: composed.validation ?? null, note: composed.note ?? null, usage: composed.usage ?? null,
    timing: { retrieval_ms: retrievalMs, model_ms: composed.model_ms ?? 0 },
    elapsed_ms: Date.now() - started,
  };
}
