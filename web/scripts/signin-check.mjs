// Checks the reviewer sign-in card end to end. Usage: node --env-file=<.env> signin-check.mjs <base-url> <out-dir> "<app heading>"
// The password comes from REVIEWER_PASSWORD or DEMO_ACCESS_SECRET in the environment and is never printed.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const [base, outDir, appHeading] = [process.argv[2].replace(/\/$/, ''), resolve(process.argv[3]), process.argv[4]];
const password = process.env.REVIEWER_PASSWORD || process.env.DEMO_ACCESS_SECRET;
if (!password) throw new Error('Set REVIEWER_PASSWORD or DEMO_ACCESS_SECRET.');
const pw = process.env.CAVLI_PLAYWRIGHT ? pathToFileURL(join(process.env.CAVLI_PLAYWRIGHT, 'index.mjs')).href : 'playwright-core';
const { chromium } = await import(pw);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CAVLI_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const results = [];
const check = async (name, fn) => {
  try { results.push({ name, passed: true, ...(await fn() || {}) }); console.log('PASS ', name); }
  catch (e) { results.push({ name, passed: false, error: String(e.message || e).slice(0, 300) }); console.log('FAIL ', name, '::', e.message); }
};
const expect = (c, m) => { if (!c) throw new Error(m); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text()); });

  await check('Anonymous visit shows the sign-in card (401) with logo and font', async () => {
    const resp = await page.goto(base + '/', { waitUntil: 'networkidle' });
    expect(resp.status() === 401, `status ${resp.status()}`);
    await page.getByRole('heading', { name: 'Welcome, reviewer' }).waitFor();
    expect(await page.getByRole('img', { name: 'Cavli Wireless' }).evaluate((i) => i.complete && i.naturalWidth > 0), 'logo');
    expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Space Grotesk"'); }), 'font');
    await page.screenshot({ path: join(outDir, 'signin-desktop.png') });
    return { status: resp.status() };
  });
  await check('Anonymous API request is refused with JSON 401', async () => {
    const r = await page.request.get(base + '/api/health', { failOnStatusCode: false });
    expect(r.status() === 401 && (await r.json()).error, `status ${r.status()}`);
  });
  await check('Wrong password shows the inline error and keeps the username', async () => {
    await page.getByLabel('Username').fill('reviewer');
    await page.getByLabel('Password').fill('not-the-password');
    const [resp] = await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Sign in' }).click()]);
    expect(resp.status() === 401, `status ${resp.status()}`);
    await page.getByRole('alert').filter({ hasText: 'Incorrect username or password' }).waitFor();
    expect(await page.getByLabel('Username').inputValue() === 'reviewer', 'username not kept');
    expect(await page.getByLabel('Password').getAttribute('aria-invalid') === 'true', 'no aria-invalid');
    await page.screenshot({ path: join(outDir, 'signin-error.png') });
  });
  await check('Correct password opens the app and sets an HttpOnly session cookie', async () => {
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: appHeading }).waitFor({ timeout: 20_000 });
    const cookie = (await ctx.cookies()).find((c) => c.name === 'cavli_review');
    expect(cookie && cookie.httpOnly && cookie.sameSite === 'Lax', 'cookie flags');
    expect(base.startsWith('http://') || cookie.secure, 'cookie not Secure on https');
    const api = await page.request.get(base + '/api/health');
    expect(api.status() === 200, `api ${api.status()}`);
    return { cookie_expires_in_days: Math.round((cookie.expires - Date.now() / 1000) / 86400) };
  });
  await check('Signed-in visit to /login goes straight to the app', async () => {
    await page.goto(base + '/login');
    expect(new URL(page.url()).pathname === '/', `landed on ${page.url()}`);
  });
  await check('Basic credentials sent up front still work (automated checks)', async () => {
    const r = await fetch(base + '/', { headers: { Authorization: 'Basic ' + Buffer.from('reviewer:' + password).toString('base64'), 'User-Agent': 'signin-check' } });
    expect(r.status === 200, `status ${r.status}`);
  });
  await check('Sign-out returns to the sign-in card', async () => {
    await page.goto(base + '/logout');
    await page.getByRole('heading', { name: 'Welcome, reviewer' }).waitFor();
    expect(!(await ctx.cookies()).some((c) => c.name === 'cavli_review' && c.value), 'cookie still set');
  });
  await check('Mobile 390 px: card fits with no horizontal scroll', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    await mp.goto(base + '/', { waitUntil: 'networkidle' });
    await mp.getByRole('heading', { name: 'Welcome, reviewer' }).waitFor();
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await mp.screenshot({ path: join(outDir, 'signin-mobile.png') });
    await m.close();
    expect(overflow <= 0, `overflow ${overflow}`);
  });
  await check('No page or CSP errors', async () => expect(errors.length === 0, errors.join(' | ')));
} finally { await browser.close(); }
const passed = results.filter((r) => r.passed).length;
await writeFile(join(outDir, 'signin-check.json'), JSON.stringify({ base, checked_at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
console.log(`${passed}/${results.length} sign-in checks passed`);
process.exit(passed === results.length ? 0 : 1);
