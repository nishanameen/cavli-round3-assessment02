// UI for the C16QS documentation prototype. Server text is inserted with textContent only (never innerHTML).
const state = { view: 'main', tab: 'ask', asking: false };
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'i') node.style.setProperty('--i', String(v));          // stagger index (CSSOM, CSP-safe)
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

// Loading state: a Thinking Orb (listening) beside the text; the round spinner remains only if the orb script is missing.
function loading(text, size = 20) {
  const orb = window.ThinkingOrb ? window.ThinkingOrb.create({ state: 'listening', size }) : null;
  return el('p', { class: orb ? 'loading has-orb' : 'loading', role: 'status' }, orb, text);
}

async function api(path, options = {}) {
  const resp = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

const STATUS = { answered: 'Answered', answered_with_flags: 'Answered · see flags', ambiguous: 'Ambiguous · please clarify',
  conflict: 'Conflicting evidence · expert review', not_verified: 'Not verified in available sources' };
const KIND = { conflict: 'Conflicting sources', revision_change: 'Revision change', cross_reference_gap: 'Broken cross-reference',
  outdated_reference: 'Outdated reference' };

function answerNodes(text, citations) {
  const index = new Map(citations.map((c, i) => [c.pid, i + 1]));
  return text.split(/\[([^\]]+)\]/).map((part, i) => {
    if (i % 2 === 0) return part;
    const ids = part.split(',').map((s) => s.trim());
    if (!ids.every((id) => index.has(id))) return `[${part}]`;
    return el('sup', {}, ...ids.map((id) => el('a', { href: `#cite-${index.get(id)}`, title: id }, `[${index.get(id)}]`)));
  });
}

function citationCard(c, n, prefix = 'cite') {
  const status = c.simulated ? el('span', { class: 'badge sim' }, 'SIMULATED')
    : c.revision_status === 'superseded' ? el('span', { class: 'badge old' }, 'Outdated · superseded')
    : el('span', { class: 'badge' }, 'Current');
  const link = c.url.startsWith('simulated:') ? el('span', { class: 'cite-loc' }, 'Simulated revision · no public document')
    : el('a', { class: 'link', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open at this location ↗');
  return el('div', { class: 'cite', id: `${prefix}-${n}`, i: n - 1 },
    el('div', { class: 'cite-head' }, el('span', { class: 'cite-num' }, `[${n}]`), el('span', { class: 'cite-doc' }, c.document), status),
    el('div', { class: 'cite-loc' }, [`Revision ${c.revision}`, c.location, c.section].filter(Boolean).join(' · ')),
    el('blockquote', {}, c.quote),
    el('div', { class: 'cite-foot' }, link, el('span', { class: 'pid' }, c.pid)));
}

// Band answers list one variant or source per line instead of a single run-on sentence.
function bandLines(r) {
  if (r.mode !== 'structured band claims') return r.answer;
  return r.answer.replace(/ \| /g, '\n').replace(/: (?=AN: )/, ':\n').replace(/ Evidence: /, '\nEvidence:\n');
}

function renderResult(r) {
  const card = el('article', { class: 'card', 'data-status': r.status },
    el('div', { class: 'result-head' }, el('span', { class: `pill ${r.status}` }, STATUS[r.status] || r.status),
      el('span', { class: 'meta' }, `${(r.elapsed_ms / 1000).toFixed(2)} s · ${r.retrieval || 'keyword'} search · ${r.gate === 'model' ? 'AI-judged' : 'word-overlap'} answerability · ${r.mode} · ${r.view === 'sim' ? 'simulated view' : 'current sources'}`)),
    el('p', { class: 'question' }, r.question),
    el('p', { class: 'answer' }, ...answerNodes(bandLines(r), r.citations)));
  if (r.clarification) card.append(el('div', { class: 'callout clarify' }, el('strong', {}, 'Clarify'), r.clarification));
  if (r.warnings.length) card.append(el('div', { class: 'callout warn' }, el('strong', {}, 'Warnings'),
    el('ul', {}, r.warnings.map((w) => el('li', {}, w)))));
  if (r.review_flags.length) card.append(el('div', { class: 'callout flag' }, el('strong', {}, 'Expert review flags'),
    el('ul', {}, r.review_flags.map((f) => el('li', {}, `#${f.review_id} ${KIND[f.kind] || f.kind} (${f.severity}): ${f.summary}`)))));
  if (r.citations.length) card.append(el('h2', { class: 'sub' }, `Citations (${r.citations.length})`),
    ...r.citations.map((c, i) => citationCard(c, i + 1)));
  if (r.related_context.length) card.append(el('h2', { class: 'sub' }, 'Related context · not an answer'),
    ...r.related_context.map((c, i) => citationCard(c, i + 1, 'ctx')));
  card.append(el('details', {}, el('summary', {}, `Retrieved passages (${r.retrieved.length}) and validation`),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('tr', {}, ['Passage', 'Score', 'Keyword coverage', 'Meaning similarity', 'Document', 'Rev', 'Page', 'Section'].map((h) => el('th', {}, h))),
      r.retrieved.map((p) => el('tr', {}, el('td', { class: 'mono' }, p.pid), el('td', {}, p.score ?? '–'),
        el('td', {}, p.coverage ?? '–'), el('td', {}, p.similarity ?? '–'), el('td', {}, p.document), el('td', {}, p.revision),
        el('td', {}, p.page ?? '–'), el('td', {}, p.section ?? '–'))))),
    el('pre', { class: 'json' }, JSON.stringify({ validation: r.validation, note: r.note, timing: r.timing, usage: r.usage, query: r.query }, null, 2))));
  $('#result').replaceChildren(card);
}

function setBusy(busy) {
  state.asking = busy;
  $('#ask-chips').setAttribute('aria-busy', String(busy));
}

async function ask(text) {
  const question = (text ?? $('#question').value).trim();
  if (question.length < 2 || state.asking) return;
  setBusy(true);
  $('#result').replaceChildren(loading('Searching the manuals and validating citations…', 64));
  try {
    renderResult(await api('/api/ask', { method: 'POST',
      body: JSON.stringify({ question, view: state.view, all_revisions: $('#all-revisions').checked }) }));
  } catch (err) {
    $('#result').replaceChildren(el('p', { class: 'error', role: 'alert' }, err.message));
  } finally { setBusy(false); }
}

function reviewDetails(item) {
  const d = item.details || {};
  if (item.kind === 'conflict' && d.claims) {
    return el('div', { class: 'table-wrap' }, el('table', {}, el('tr', {}, ['Source', 'Location', 'Bands (disputed in bold)'].map((h) => el('th', {}, h))),
      d.claims.map((c) => el('tr', {}, el('td', {}, `${c.title} ${c.revision}`),
        el('td', {}, c.printed_page ? `p. ${c.printed_page}` : c.section || '–'),
        el('td', {}, c.bands.flatMap((b, i) => [(d.disputed_bands || []).includes(b) ? el('strong', {}, String(b)) : String(b), i < c.bands.length - 1 ? ', ' : ''].filter(Boolean)))))));
  }
  if (item.kind === 'revision_change' && d.changes) {
    return el('div', {}, d.changes.map((c) => el('div', {},
      el('p', { class: 'meta' }, `PDF page ${c.pdf_page ?? '–'}${c.section ? ' · ' + c.section : ''}`),
      ...(c.removed || []).map((l) => el('div', { class: 'diff-del mono' }, `− ${l}`)),
      ...(c.added || []).map((l) => el('div', { class: 'diff-add mono' }, `+ ${l}`)))));
  }
  return el('pre', { class: 'json' }, JSON.stringify(d, null, 2));
}

function reviewAction(item) {
  if (item.status === 'auto-closed') return el('span', { class: 'status-tag' }, 'Auto-closed: no longer detected after the latest ingest');
  if (item.status === 'resolved') {
    return el('div', { class: 'resolve' }, el('span', { class: 'status-tag resolved' }, `Resolved: ${item.resolution || ''}`),
      el('button', { type: 'button', class: 'secondary press', onclick: (e) => setReview(item.id, 'open', null, e.currentTarget) }, 'Reopen'));
  }
  const note = el('input', { type: 'text', maxlength: '500', 'aria-label': `Expert note for review item ${item.id}`,
    placeholder: 'Expert note, e.g. confirmed with Cavli product team…' });
  const hint = el('span', { class: 'hint', hidden: true }, 'Add a short note before resolving.');
  note.addEventListener('input', () => { note.removeAttribute('aria-invalid'); hint.hidden = true; });
  return el('div', { class: 'resolve' }, note, el('button', { type: 'button', class: 'secondary press', onclick: (e) => {
    if (!note.value.trim()) { note.setAttribute('aria-invalid', 'true'); hint.hidden = false; note.focus(); return; }
    setReview(item.id, 'resolved', note.value.trim(), e.currentTarget);
  } }, 'Mark resolved'), hint);
}

async function setReview(id, status, note, button) {
  button.disabled = true;
  try {
    await api(`/api/review/${id}`, { method: 'POST', body: JSON.stringify({ status, note }) });
    await loadReview();
  } catch (err) {
    button.disabled = false;
    button.after(el('span', { class: 'hint', role: 'alert' }, err.message));
  }
}

async function loadReview() {
  const box = $('#review-list');
  if (!box.children.length) box.replaceChildren(loading('Loading review queue…'));
  try {
    const items = await api(`/api/review?view=${state.view}&all=${$('#review-all').checked ? 1 : 0}`);
    const open = items.filter((i) => i.status === 'open').length;
    $('#review-count').textContent = open ? String(open) : '';
    if (!items.length) { box.replaceChildren(el('p', { class: 'empty' }, 'No open review items in this view.')); return; }
    box.replaceChildren(...items.map((item, n) => el('div', { class: 'item', 'data-status': item.status, i: n },
      el('div', { class: 'item-head' }, el('span', { class: 'item-id' }, `#${item.id}`), el('span', { class: 'kind' }, KIND[item.kind] || item.kind),
        el('span', { class: `sev ${item.severity}` }, item.severity), el('span', { class: 'meta' }, item.topic),
        el('span', { class: `status-tag ${item.status}` }, item.status)),
      el('p', {}, item.summary),
      el('details', {}, el('summary', {}, 'Evidence'), reviewDetails(item)),
      reviewAction(item))));
  } catch (err) { box.replaceChildren(el('p', { class: 'error', role: 'alert' }, err.message)); }
}

async function loadSources() {
  const box = $('#sources-list');
  box.replaceChildren(loading('Loading sources…'));
  try {
    const rows = await api(`/api/sources?view=${state.view}`);
    box.replaceChildren(...rows.map((r, n) => el('div', { class: 'item src', i: n },
      el('div', { class: 'item-head' }, el('span', { class: 'item-id' }, r.code), el('span', { class: 'kind' }, r.title),
        el('span', { class: r.simulated ? 'badge sim' : r.status === 'superseded' ? 'badge old' : 'badge' },
          (r.simulated ? 'Simulated · ' : '') + r.status)),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('tr', {}, el('th', {}, 'Revision'), el('td', {}, `${r.revision}${r.revision_label ? ' · ' + r.revision_label : ''}`)),
        el('tr', {}, el('th', {}, 'Date'), el('td', {}, r.revision_date ? `${r.revision_date} (${r.date_source})` : r.date_source || 'Not stated')),
        el('tr', {}, el('th', {}, 'Host'), el('td', {}, r.host || '–')),
        el('tr', {}, el('th', {}, 'Pages · passages'), el('td', {}, `${r.page_count ?? '–'} · ${r.passages}` +
          (r.label_offset ? ` · printed page = PDF page + ${r.label_offset}` : ''))),
        el('tr', {}, el('th', {}, 'Acquired'), el('td', {}, r.acquired_via || '–')),
        el('tr', {}, el('th', {}, 'File SHA-256'), el('td', { class: 'mono' }, r.file_sha256 || '–')),
        el('tr', {}, el('th', {}, 'Text SHA-256'), el('td', { class: 'mono' }, r.text_sha256)),
        el('tr', {}, el('th', {}, 'Link'), el('td', {}, r.url.startsWith('simulated:') ? r.url
          : el('a', { class: 'link', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.url))))))));
  } catch (err) { box.replaceChildren(el('p', { class: 'error', role: 'alert' }, err.message)); }
}

const RESULT = { unchanged: 'Unchanged', changed: 'Changed · re-ingest needed', blocked: 'Host blocked check',
  unknown: 'Cannot tell from headers', unreachable: 'Unreachable' };
const STATE_LABEL = { new: 'new', unchanged: 'unchanged' };
const short = (h) => (h ? h.slice(0, 12) : '–');
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–');

async function loadPipeline() {
  const box = $('#pipeline-view');
  box.replaceChildren(loading('Loading pipeline…'));
  try {
    const data = await api(`/api/pipeline?view=${state.view}`);
    const latest = data.runs[0]?.summary || {};
    const stages = new Map((latest.stages || []).map((s) => [s.code, s]));
    const src = data.sources;
    const sum = (f) => src.reduce((a, r) => a + (Number(r[f]) || 0), 0);
    const tocPages = (latest.stages || []).reduce((a, s) => a + (s.toc_pages || 0), 0);
    const open = (data.reviews || []).filter((r) => r.status === 'open').reduce((a, r) => a + r.items, 0);
    const kinds = (data.reviews || []).filter((r) => r.status === 'open').map((r) => `${r.items} ${(KIND[r.kind] || r.kind).toLowerCase()}`);
    const flow = [
      ['1', 'Acquire', `${src.length} revision${src.length === 1 ? '' : 's'}`, 'Downloaded from public URLs; SHA-256 checked against the manifest'],
      ['2', 'Extract', `${sum('page_count')} pages`, `${tocPages} contents pages skipped; printed page labels kept (EVK = PDF page + 1)`],
      ['3', 'Index', `${sum('passages')} passages`, `${sum('embedded')} / ${sum('passages')} with meaning vectors; full-text index on all`],
      ['4', 'Check', `${open} open review items`, kinds.join(' · ') || 'No open items'],
      ['5', 'Publish', when(data.runs[0]?.published_at), `${latest.revisions ?? '–'} revisions in both views; expert resolutions kept`],
    ];
    const check = el('div', { id: 'check-results' });
    const checkBtn = el('button', { type: 'button', class: 'secondary press', onclick: () => checkUpdates(checkBtn, check) },
      'Check sources for updates');
    const runs = latest.ingest_runs || [];
    const docCode = new Map(src.map((r) => [r.doc_id, r.code]));
    box.replaceChildren(
      el('div', { class: 'flow' }, flow.map(([n, name, big, small], i) => el('div', { class: 'stage', i },
        el('span', { class: 'stage-n' }, n), el('div', { class: 'stage-name' }, name), el('div', { class: 'stage-big' }, big),
        el('div', { class: 'stage-small' }, small)))),
      el('h2', { class: 'sub' }, 'Per document (latest run)'),
      el('div', { class: 'table-wrap card-table' }, el('table', {},
        el('tr', {}, ['Document', 'Revision', 'Status', 'Acquired', 'Pages', 'Contents skipped', 'Passages', 'Sections',
          'Vectors', 'File SHA-256'].map((h) => el('th', {}, h))),
        src.map((r) => {
          const st = stages.get(r.code) || {};
          return el('tr', {}, el('td', {}, el('strong', {}, r.code), ' ', r.title),
            el('td', {}, r.revision), el('td', {}, el('span', { class: r.simulated ? 'badge sim' : r.status === 'superseded' ? 'badge old' : 'badge' },
              (r.simulated ? 'simulated · ' : '') + r.status)),
            el('td', {}, r.acquired_via || '–'), el('td', {}, r.page_count ?? '–'), el('td', {}, st.toc_pages ?? '–'),
            el('td', {}, r.passages), el('td', {}, st.sections ?? '–'), el('td', {}, `${r.embedded}/${r.passages}`),
            el('td', { class: 'mono' }, short(r.file_sha256)));
        }))),
      el('h2', { class: 'sub' }, 'Source updates'),
      el('div', { class: 'item' }, el('p', {}, 'Compares each live source with the fingerprint recorded when it was published ',
        '(ETag and size for PDFs, visible text for the product page). It only detects change; a person then runs the pipeline.'),
        el('div', { class: 'resolve' }, checkBtn), check),
      el('h2', { class: 'sub' }, 'Revision handling (simulated 5.4)'),
      el('ol', { class: 'timeline' },
        el('li', {}, 'Hardware Manual 5.3 ingested from the TME copy; SHA-256 verified; marked current.'),
        el('li', {}, 'A labelled SIMULATED 5.4 is applied from ', el('span', { class: 'mono' }, latest.simulation?.spec || 'sources/simulated/'), ' (not a Cavli publication).'),
        el('li', {}, '5.3 is marked superseded but kept for audit; normal answers read only the current revision.'),
        ...(latest.simulation?.revision_changes || []).map((t) => el('li', {}, t)),
        el('li', {}, 'A revision-change item opens in the review queue, and answers citing p. 31 show the earlier wording.')),
      state.view === 'main' ? el('button', { type: 'button', class: 'secondary press', onclick: () => setView('sim') }, 'Show the simulated view') : null,
      el('h2', { class: 'sub' }, 'Run history'),
      el('div', { class: 'table-wrap card-table' }, el('table', {},
        el('tr', {}, ['Ingest run', 'Finished', 'Documents', 'Checks'].map((h) => el('th', {}, h))),
        runs.map((r) => el('tr', {}, el('td', {}, `#${r.run_id}`), el('td', {}, when(r.finished_at)),
          el('td', {}, r.documents.map((d) => el('span', { class: `chip-state ${d.state}` }, `${docCode.get(d.doc_id) || d.doc_id} ${STATE_LABEL[d.state] || d.state}`))),
          el('td', {}, Object.entries(r.checks || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')))))),
      el('div', { class: 'table-wrap card-table' }, el('table', {},
        el('tr', {}, ['Publish run', 'Published', 'Revisions', 'Passages', 'Open items (main · sim)'].map((h) => el('th', {}, h))),
        data.runs.map((r) => el('tr', {}, el('td', {}, `#${r.id}`), el('td', {}, when(r.published_at)),
          el('td', {}, r.summary.revisions), el('td', {}, r.summary.passages),
          el('td', {}, `${r.summary.views?.main?.reviews_open ?? '–'} · ${r.summary.views?.sim?.reviews_open ?? '–'}`))))));
  } catch (err) { box.replaceChildren(el('p', { class: 'error', role: 'alert' }, err.message)); }
}

async function checkUpdates(button, box) {
  button.disabled = true;
  box.replaceChildren(loading('Contacting the source hosts…'));
  try {
    const data = await api('/api/pipeline/check', { method: 'POST', body: '{}' });
    box.replaceChildren(el('div', { class: 'table-wrap' }, el('table', {},
      el('tr', {}, ['Source', 'Method', 'Result', 'Detail'].map((h) => el('th', {}, h))),
      data.results.map((r) => el('tr', {}, el('td', {}, el('strong', {}, r.code), ` ${r.revision}`), el('td', {}, r.method),
        el('td', {}, el('span', { class: `result ${r.result}` }, RESULT[r.result] || r.result)), el('td', {}, r.detail))))),
      el('p', { class: 'meta' }, `Checked ${when(data.checked_at)}. Nothing was re-indexed.`));
  } catch (err) {
    box.replaceChildren(el('p', { class: 'error', role: 'alert' }, err.message));
  } finally { button.disabled = false; }
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  $('#view-switch').dataset.view = view;
  document.querySelectorAll('#view-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('#sim-banner').hidden = view !== 'sim';
  $('#result').replaceChildren();
  $('#review-list').replaceChildren();
  if (state.tab === 'review') loadReview(); else refreshCount();
  if (state.tab === 'sources') loadSources();
  if (state.tab === 'pipeline') loadPipeline();
}

async function refreshCount() {
  try {
    const items = await api(`/api/review?view=${state.view}`);
    $('#review-count').textContent = items.length ? String(items.length) : '';
  } catch { /* the badge is optional */ }
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  for (const name of ['ask', 'review', 'pipeline', 'sources']) $(`#tab-${name}`).hidden = name !== tab;
  if (tab === 'review') loadReview();
  if (tab === 'pipeline') loadPipeline();
  if (tab === 'sources') loadSources();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#view-switch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // The prompt-chips bar owns the form: Enter or Send fires vs-prompt-chips:submit. Cancelling keeps the text in the field.
  const chips = $('#ask-chips');
  chips.addEventListener('vs-prompt-chips:submit', (e) => {
    if (state.asking || e.detail.prompt.trim().length < 2) { e.preventDefault(); return; }
    ask(e.detail.prompt);
  });
  // The simulated-revision chip switches to the simulated view before its question is typed in.
  chips.addEventListener('vs-prompt-chips:pick', (e) => { if (e.detail.chip.dataset.view === 'sim') setView('sim'); });
  $('#review-all').addEventListener('change', loadReview);
  refreshCount();
});
