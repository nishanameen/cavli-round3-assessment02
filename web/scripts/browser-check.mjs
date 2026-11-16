// End-to-end UI check with Playwright + the installed Chrome.
// Usage (from web/):  node scripts/browser-check.mjs [base-url]      default http://127.0.0.1:8790
// For a workers.dev URL the reviewer password is read from ../.env (REVIEWER_PASSWORD) and never printed.
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const base = (process.argv[2] || 'http://127.0.0.1:8790').replace(/\/$/, '');
const hosted = base.includes('.workers.dev');
const label = hosted ? 'hosted' : 'local';
const shots = new URL(`../../outputs/browser/${label}/`, import.meta.url);
await mkdir(shots, { recursive: true });
const chrome = process.env.CAVLI_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!existsSync(chrome)) throw new Error('Set CAVLI_CHROME to a Chrome executable.');

let password = process.env.REVIEWER_PASSWORD;
if (hosted && !password) {
  const env = await readFile(new URL('../../.env', import.meta.url), 'utf8');
  password = env.match(/^REVIEWER_PASSWORD=(.+)$/m)?.[1]?.trim();
}
const credentials = hosted ? { username: 'reviewer', password } : undefined;

const results = [];
const consoleErrors = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    results.push({ name, passed: true, ms: Date.now() - started, ...(details || {}) });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, passed: false, ms: Date.now() - started, error: String(err.message || err).slice(0, 400) });
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}
function expect(cond, message) { if (!cond) throw new Error(message); }

const browser = await chromium.launch({ executablePath: chrome, headless: true });
// Reduced motion holds the prompt-chip rows still (upstream behaviour), so screenshots are stable.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, httpCredentials: credentials, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// A chip may have drifted outside the visible part of its row, so the click is dispatched on the chip itself;
// the row's own click handler still runs. The chip types its question into the bar, then Enter sends it.
async function pickChip(p, text) {
  await p.locator(`.vs-prompt-chips-chip:not([aria-hidden])[data-prompt="${text}"]`).dispatchEvent('click');
  await p.waitForFunction((t) => document.querySelector('#question').value === t, text, { timeout: 10_000 });
  await p.locator('#question').press('Enter');
}
async function askChip(text) {
  await pickChip(page, text);
  await page.locator('#result .card .question', { hasText: text }).waitFor({ timeout: 90_000 });
  return page.locator('#result .card');
}
const pill = () => page.locator('#result .pill').innerText();
const shot = (name) => page.screenshot({ path: new URL(`${name}.png`, shots).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true, animations: 'disabled' });

if (hosted) {
  await check('Reviewer gate rejects anonymous requests', async () => {
    const anon = await fetch(base + '/');
    const api = await fetch(base + '/api/review?view=main');
    expect(anon.status === 401 && api.status === 401, `expected 401/401, got ${anon.status}/${api.status}`);
    return { page_status: anon.status, api_status: api.status };
  });
}

await check('Page loads with logo, header, view switch, tabs and prompt chips', async () => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  expect((await page.title()) === 'C16QS Documentation Intelligence', 'title');
  expect(await page.locator('h1').isVisible(), 'h1');
  expect(await page.getByRole('img', { name: 'Cavli Wireless' }).evaluate(async (i) => { await i.decode(); return i.naturalWidth > 0; }), 'logo');
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Space Grotesk"'); }), 'font');
  const groups = await page.locator('.vs-prompt-chips-chip:not([aria-hidden])').count();
  expect(groups === 13, `expected 13 suggestion chips, got ${groups}`);
  expect((await page.locator('#view-switch button[aria-pressed="true"]').innerText()) === 'Current sources', 'default view');
  await shot('01-home');
  return { suggestion_chips: groups };
});

await check('Answerable: reset pin answer cites HW p. 31 with a working deep link', async () => {
  const card = await askChip('Which pin resets the bare C16QS module, and how long must it be held low?');
  const status = await pill();
  const answer = await card.locator('.answer').innerText();
  expect(status.startsWith('Answered'), `status ${status}`);
  expect(/17/.test(answer) && /100.500/.test(answer), 'answer lacks pin 17 / 100-500 ms');
  const links = await card.locator('.cite a.link').evaluateAll((as) => as.map((a) => a.href));
  expect(links.some((h) => h.endsWith('#page=31')), 'no #page=31 link');
  const sup = card.locator('.answer sup a').first();
  if (await sup.count()) { await sup.click(); expect(await page.locator('.cite:target').count() === 1, 'superscript does not target a citation'); }
  await shot('02-answerable');
  return { status, answer, citation_links: links };
});

await check('Retrieved passages and validation expand', async () => {
  await page.locator('#result details summary').click();
  const rows = await page.locator('#result details table tr').count();
  expect(rows > 1, 'no retrieved rows');
  const json = await page.locator('#result pre.json').innerText();
  expect(json.includes('"validation"'), 'validation block missing');
  return { retrieved_rows: rows - 1 };
});

await check('Ambiguous: supply voltage asks module vs EVK and cites both', async () => {
  const card = await askChip('What supply voltage does the C16QS need?');
  const status = await pill();
  expect(status.startsWith('Ambiguous'), `status ${status}`);
  expect(await card.locator('.callout.clarify').isVisible(), 'no clarifying question');
  const docs = await card.locator('.cite-doc').allInnerTexts();
  expect(docs.some((d) => d.includes('Hardware Manual')) && docs.some((d) => d.includes('EVK')), 'not both scopes cited');
  await shot('03-ambiguous');
  return { status, cited_documents: [...new Set(docs)] };
});

await check('Conflict: WW Band 38 shows both sources and a review flag', async () => {
  const card = await askChip('Does the C16QS-WW support LTE Band 38?');
  const status = await pill();
  expect(status.startsWith('Conflicting'), `status ${status}`);
  const flags = await card.locator('.callout.flag li').allInnerTexts();
  expect(flags.some((f) => f.includes('Conflicting sources') && f.includes('WW')), 'no WW conflict flag');
  const links = await card.locator('.cite a.link').evaluateAll((as) => as.map((a) => a.href));
  expect(links.some((h) => h.endsWith('#technical-data')), 'no product page anchor link');
  await shot('04-conflict');
  return { status, flags };
});

await check('Not verified: custom antenna shows related context only', async () => {
  const card = await askChip('Is the C16QS certified for use with my custom-designed antenna?');
  const status = await pill();
  expect(status.startsWith('Not verified'), `status ${status}`);
  expect((await card.locator('.cite[id^="cite-"]').count()) === 0, 'should not cite as answer');
  expect((await card.locator('.cite[id^="ctx-"]').count()) > 0, 'no related context');
  await shot('05-not-verified');
  return { status };
});

await check('Not verified: MTBF is refused', async () => {
  await askChip('What is the MTBF of the C16QS module?');
  const status = await pill();
  expect(status.startsWith('Not verified'), `status ${status}`);
  return { status, mode: await page.locator('#result .meta').innerText() };
});

await check('Keyboard: Enter submits a typed question', async () => {
  await page.locator('#question').fill('What type of SIM card socket does the C16QS EVK use?');
  await page.locator('#question').press('Enter');
  await page.locator('#result .card .question', { hasText: 'SIM card socket' }).waitFor({ timeout: 90_000 });
  const answer = await page.locator('#result .answer').innerText();
  expect(/micro/i.test(answer), 'answer lacks micro SIM');
  return { answer };
});

await check('Simulated view: banner, SIMULATED citation and previous wording', async () => {
  await page.getByRole('button', { name: 'Simulated revision 5.4' }).click();
  expect(await page.locator('#sim-banner').isVisible(), 'banner hidden');
  const card = await askChip('How long must the C16QS reset pin be held low?');
  const answer = await card.locator('.answer').innerText();
  expect(/150.500/.test(answer), 'answer lacks 150-500 ms');
  expect((await card.locator('.badge.sim').count()) > 0, 'no SIMULATED badge');
  const warnings = await card.locator('.callout.warn li').allInnerTexts();
  expect(warnings.some((w) => w.includes('Passage changed')), 'no previous-wording warning');
  expect((await card.locator('.cite-loc', { hasText: 'no public document' }).count()) > 0, 'simulated citation should not link out');
  await shot('06-simulated');
  return { answer, warnings };
});

await check('Audit mode: superseded 5.3 passage is labelled outdated', async () => {
  await page.locator('#all-revisions').check();
  await page.locator('#question').fill('How long must the C16QS reset pin be held low? (audit)');
  await page.locator('#ask-btn').click();
  await page.locator('#result .card .question', { hasText: '(audit)' }).waitFor({ timeout: 90_000 });
  const retrieved = await page.locator('#result details table td.mono').allTextContents();
  const badges = await page.locator('#result .badge').allInnerTexts();
  await page.locator('#all-revisions').uncheck();
  expect(retrieved.some((p) => p.startsWith('HW-v5.3-')) && retrieved.some((p) => p.startsWith('HW-v5.4-SIMULATED')),
    'audit retrieval did not include both revisions');
  return { retrieved, badges };
});

await check('Review queue (simulated view): revision diff, inline validation, resolve and reopen', async () => {
  await page.getByRole('tab', { name: /Review queue/ }).click();
  await page.locator('#review-list .item').first().waitFor();
  const item = page.locator('#review-list .item', { hasText: 'Revision change' }).first();
  await item.locator('summary').click();
  const diff = await item.locator('.diff-del, .diff-add').allInnerTexts();
  expect(diff.some((l) => l.includes('100-500ms')) && diff.some((l) => l.includes('150-500ms')), 'diff lines missing');
  await item.getByRole('button', { name: 'Mark resolved' }).click();
  expect((await item.locator('input').getAttribute('aria-invalid')) === 'true', 'empty note not rejected');
  const id = (await item.locator('.item-id').innerText()).trim();
  await item.locator('input').fill('Browser check: reviewed simulated change (reopened immediately).');
  await item.getByRole('button', { name: 'Mark resolved' }).click();
  const resolved = page.locator('#review-list .item', { hasText: id });
  await page.locator('#review-all').check();
  await resolved.locator('.status-tag.resolved').first().waitFor({ timeout: 20_000 });
  await shot('07-review-resolved');
  await resolved.getByRole('button', { name: 'Reopen' }).click();
  await page.locator('#review-list .item', { hasText: id }).locator('.status-tag.open').waitFor({ timeout: 20_000 });
  await page.locator('#review-all').uncheck();
  return { item: id, diff };
});

await check('Sources (simulated view): 5 revisions incl. superseded 5.3 and SIMULATED 5.4', async () => {
  await page.getByRole('tab', { name: 'Sources' }).click();
  await page.locator('#sources-list .item').first().waitFor();
  const n = await page.locator('#sources-list .item').count();
  const text = await page.locator('#sources-list').innerText();
  expect(n === 5 && /superseded/.test(text) && /Simulated/.test(text), `got ${n} sources`);
  return { sources: n };
});

await check('Main view: 6 open review items, disputed bands bold, 4 sources with EVK page offset', async () => {
  await page.getByRole('button', { name: 'Current sources' }).click();
  await page.getByRole('tab', { name: /Review queue/ }).click();
  await page.locator('#review-list .item').first().waitFor();
  const items = await page.locator('#review-list .item').count();
  const ww = page.locator('#review-list .item', { hasText: 'bands:WW' });
  await ww.locator('summary').click();
  const bold = await ww.locator('table strong').allInnerTexts();
  expect(items === 6, `expected 6 open items, got ${items}`);
  expect(bold.includes('13') && bold.includes('38'), 'disputed bands not bold');
  await shot('08-review-main');
  await page.getByRole('tab', { name: 'Sources' }).click();
  await page.locator('#sources-list .item').first().waitFor();
  const n = await page.locator('#sources-list .item').count();
  const text = await page.locator('#sources-list').innerText();
  expect(n === 4 && text.includes('printed page = PDF page + 1') && /[0-9a-f]{64}/.test(text), `sources ${n}`);
  await shot('09-sources');
  return { open_items: items, sources: n };
});

await check('Pipeline tab: 5 stages, per-document table, run history and a read-only update check', async () => {
  await page.getByRole('tab', { name: 'Pipeline' }).click();
  await page.locator('#pipeline-view .stage').first().waitFor({ timeout: 30_000 });
  const stages = await page.locator('#pipeline-view .stage .stage-name').allTextContents();
  expect(stages.join(',') === 'Acquire,Extract,Index,Check,Publish', `stages ${stages}`);
  const vectors = await page.locator('#pipeline-view .stage').nth(2).innerText();
  const docRows = await page.locator('#pipeline-view .card-table').first().locator('tr').count();
  const runRows = await page.locator('#pipeline-view .card-table').nth(1).locator('tr').count();
  expect(docRows === 5 && runRows >= 2, `doc rows ${docRows - 1}, ingest runs ${runRows - 1}`);
  await shot('11-pipeline');
  await page.getByRole('button', { name: 'Check sources for updates' }).click();
  await page.locator('#check-results table').waitFor({ timeout: 60_000 });
  const results = await page.locator('#check-results tr').evaluateAll((trs) => trs.slice(1).map((tr) =>
    [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.innerText.trim()).join(' | ')));
  expect(results.length === 4, `expected 4 sources checked, got ${results.length}`);
  expect((await page.locator('#check-results').innerText()).includes('Nothing was re-indexed'), 'read-only note missing');
  await page.evaluate(() => window.scrollTo(0, 0));   // full-page shots are cleanest from the top (sticky header)
  await shot('12-update-check');
  return { stages, index_stage: vectors.replace(/\s+/g, ' '), update_check: results };
});

await check('Answers report the search mode and show keyword and meaning columns', async () => {
  await page.getByRole('tab', { name: 'Ask' }).click();
  await askChip('What is jumper JMP 3 used for on the C16QS EVK?');
  const meta = await page.locator('#result .meta').first().innerText();
  const headers = await page.locator('#result details table tr').first().locator('th').allTextContents();
  expect(/(keyword|hybrid|hybrid-gte) search/.test(meta), `meta: ${meta}`);
  expect(headers.includes('Keyword coverage') && headers.includes('Meaning similarity'), `headers ${headers}`);
  return { meta, headers };
});

await check('Mobile 375 px: no horizontal overflow and answers render', async () => {
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, httpCredentials: credentials, reducedMotion: 'reduce' });
  const m = await mobile.newPage();
  await m.goto(base + '/', { waitUntil: 'networkidle' });
  await pickChip(m, 'Which LTE bands does the C16QS support?');
  await m.locator('#result .card').waitFor({ timeout: 90_000 });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await m.screenshot({ path: new URL('10-mobile.png', shots).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true, animations: 'disabled' });
  await mobile.close();
  expect(overflow <= 0, `horizontal overflow ${overflow}px`);
  return { overflow_px: overflow };
});

await check('No console errors during the run', async () => {
  expect(consoleErrors.length === 0, consoleErrors.join(' | '));
});

await browser.close();
const report = { base, checked_at: new Date().toISOString(), passed: results.filter((r) => r.passed).length, total: results.length, results };
await writeFile(new URL(`../../outputs/browser-check-${label}.json`, import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${report.passed}/${report.total} checks passed. Report: outputs/browser-check-${label}.json`);
process.exit(report.passed === report.total ? 0 : 1);
