// Checks the Thinking Orb loading state on a deployed (or local) A02 site.
// Usage (from web/): node scripts/orb-check.mjs [base-url]. The reviewer password is read from ../.env and never printed.
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';

const base = (process.argv[2] || 'https://cavli-assignment-2.nishanameenk.workers.dev').replace(/\/$/, '');
const hosted = base.includes('.workers.dev');
let password;
if (hosted) password = (await readFile(new URL('../../.env', import.meta.url), 'utf8')).match(/^REVIEWER_PASSWORD=(.+)$/m)?.[1]?.trim();
const browser = await chromium.launch({ executablePath: process.env.CAVLI_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
// The site shows its own sign-in page (no browser credentials challenge), so each browser context signs in through the
// real form first; the context's request client shares its cookies with the pages.
async function signIn(ctx, origin, password) {
  const r = await ctx.request.post(origin + '/login', { form: { username: 'reviewer', password }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`sign-in failed (HTTP ${r.status()})`);
}
const results = {};
try {
  for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ['reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }]]) {
    const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 2 });
    if (hosted) await signIn(ctx, base, password);
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    // Hold the answer back briefly so the loading state can be measured; the request itself is unchanged.
    await p.route((url) => url.pathname === '/api/ask', async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.locator('#question').fill('Which AT command restarts the C16QS?');
    await p.locator('#ask-btn').click();
    await p.locator('#result .thinking-orb').waitFor({ timeout: 5000 });
    await p.waitForTimeout(500);
    const frame = () => p.evaluate(() => document.querySelector('#result .thinking-orb').toDataURL());
    const a = await frame(); await p.waitForTimeout(300); const b = await frame();
    const geo = await p.evaluate(() => {
      const o = document.querySelector('#result .thinking-orb'), r = o.getBoundingClientRect(), bar = document.querySelector('.vs-prompt-chips-bar').getBoundingClientRect();
      return { css_px: Math.round(r.width), canvas_px: o.width, centred: Math.abs((r.left + r.width / 2) - (bar.left + bar.width / 2)) < 2 || innerWidth > 640,
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    await p.locator('#result > .loading').scrollIntoViewIfNeeded();
    await p.screenshot({ path: new URL(`../../outputs/browser/hosted/orb-${name}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
    await p.locator('#result .card').waitFor({ timeout: 90_000 });
    const orbsLeft = await p.locator('.thinking-orb').count();
    results[name] = { animating: a !== b, ...geo, removed_after_answer: orbsLeft === 0, errors };
    await ctx.close();
  }
} finally { await browser.close(); }
const passed = Object.entries(results).every(([n, r]) => r.css_px === 64 && r.canvas_px === 128 && r.overflow <= 0 && r.removed_after_answer
  && r.errors.length === 0 && (n === 'reduced-motion' ? !r.animating : r.animating));
await writeFile(new URL(`../../outputs/orb-check-${hosted ? 'hosted' : 'local'}.json`, import.meta.url), JSON.stringify({ base, checked_at: new Date().toISOString(), passed, results }, null, 2));
console.log(JSON.stringify(results, null, 1));
console.log(passed ? 'PASS orb check' : 'FAIL orb check');
process.exit(passed ? 0 : 1);
