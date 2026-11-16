// Captures 1280x720 frames of the live site for the narrated hosted demo (scripts/record-hosted-demo.ps1).
// Usage (from web/): node scripts/capture-hosted-demo.mjs [base-url]   — reviewer password read from ../.env
import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';

const base = (process.argv[2] || 'https://cavli-assignment-2.nishanameenk.workers.dev').replace(/\/$/, '');
const env = await readFile(new URL('../../.env', import.meta.url), 'utf8');
const password = process.env.REVIEWER_PASSWORD || env.match(/^REVIEWER_PASSWORD=(.+)$/m)?.[1]?.trim();
const out = new URL('../../outputs/demo-hosted/frames/', import.meta.url);
await mkdir(out, { recursive: true });
const file = (n) => new URL(`${String(n).padStart(2, '0')}.png`, out).pathname.replace(/^\/([A-Z]:)/, '$1');

const browser = await chromium.launch({ executablePath: process.env.CAVLI_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
// The site shows its own sign-in page (no browser credentials challenge), so each browser context signs in through the
// real form first; the context's request client shares its cookies with the pages.
async function signIn(ctx, origin, password) {
  const r = await ctx.request.post(origin + '/login', { form: { username: 'reviewer', password }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`sign-in failed (HTTP ${r.status()})`);
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
if (base.includes('workers.dev')) await signIn(ctx, base, password);
const page = await ctx.newPage();
let n = 0;
async function frame(target) {
  if (target) {
    await page.locator(target).first().evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -118); });
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: file(++n), animations: 'disabled' });
  console.log('frame', n);
}
async function ask(text) {
  await page.getByRole('button', { name: text, exact: true }).click();
  await page.locator('#result .card .question', { hasText: text }).waitFor({ timeout: 90_000 });
}

await page.goto(base + '/', { waitUntil: 'networkidle' });
await frame();                                                                    // 01 home
await ask('Which pin resets the bare C16QS module, and how long must it be held low?');
await frame('#result .card');                                                     // 02 cited answer
await page.locator('#result details summary').click();
await frame('#result details');                                                   // 03 retrieved + validation
await ask('What supply voltage does the C16QS need?');
await frame('#result .card');                                                     // 04 ambiguous
await ask('Does the C16QS-WW support LTE Band 38?');
await frame('#result .card');                                                     // 05 conflict
await ask('Is the C16QS certified for use with my custom-designed antenna?');
await frame('#result .card');                                                     // 06 not verified
await page.getByRole('button', { name: 'Simulated revision 5.4' }).click();
await ask('How long must the C16QS reset pin be held low?');
await frame('#result .card');                                                     // 07 simulated revision answer (switch shows the view)
await page.getByRole('tab', { name: /Review queue/ }).click();
const rev = page.locator('#review-list .item', { hasText: 'Revision change' }).first();
await rev.waitFor();
await rev.locator('summary').click();
await frame('#review-list .item >> nth=0');                                       // 08 review queue (sim)
await page.getByRole('button', { name: 'Current sources' }).click();
const ww = page.locator('#review-list .item', { hasText: 'bands:WW' });
await ww.waitFor();
await ww.locator('summary').click();
await frame('#review-list .item >> nth=2');                                       // 09 WW conflict evidence
await page.getByRole('tab', { name: 'Sources' }).click();
await page.locator('#sources-list .item').first().waitFor();
await frame('#sources-list');                                                     // 10 sources
await browser.close();
