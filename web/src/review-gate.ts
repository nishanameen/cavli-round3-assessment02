// Reviewer sign-in for the hosted prototype. A server-rendered sign-in card (no scripts, so it works under the strict
// CSP) checks the shared reviewer password and sets a signed, HttpOnly session cookie. Automated checks may instead send
// "Authorization: Basic reviewer:<password>" with each request. Layout follows the Astryx "login-card" template
// (logo and product above a centred card, heading, large fields, primary button, a supporting line below), rebuilt in
// plain HTML and CSS because the template is React-only.

export type GateConfig = { product: string; assignment: string };

const COOKIE = 'cavli_review';
const MAX_AGE = 7 * 24 * 3600;            // seconds
const USERNAME = 'reviewer';
// Files the sign-in page itself needs; everything else stays behind the gate.
const PUBLIC = /^\/(?:login\.css|cavli-logo\.svg|fonts\/space-grotesk-latin-[456]00-normal\.woff2)$/;
const encoder = new TextEncoder();

function fixedEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode('cavli-review-session:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hasSession(request: Request, secret: string) {
  const cookie = (request.headers.get('Cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  const [exp, sig] = (cookie?.slice(COOKIE.length + 1) ?? '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return fixedEqual(sig, await sign(secret, `review:${exp}`));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
    "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function signInPage(cfg: GateConfig, status: number, opts: { error?: boolean; username?: string } = {}) {
  const error = opts.error;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Sign in · ${escapeHtml(cfg.product)}</title>
  <link rel="icon" href="/cavli-logo.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/space-grotesk-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/login.css">
</head>
<body>
  <main class="auth">
    <div class="auth-column">
      <div class="auth-brand">
        <img src="/cavli-logo.svg" alt="Cavli Wireless" width="132" height="71">
        <p>${escapeHtml(cfg.product)}</p>
      </div>
      <form class="auth-card" method="post" action="/login">
        <div class="auth-head">
          <h1>Welcome, reviewer</h1>
          <p>Sign in to open the ${escapeHtml(cfg.assignment)} prototype.</p>
        </div>
        <div class="auth-fields">
          <label class="sr-only" for="username">Username</label>
          <input id="username" name="username" type="text" placeholder="Username" autocomplete="username" autocapitalize="none"
            spellcheck="false" required value="${escapeHtml(opts.username ?? '')}">
          <label class="sr-only" for="password">Password</label>
          <input id="password" name="password" type="password" placeholder="Password" autocomplete="current-password" required
            ${error ? 'aria-invalid="true" aria-describedby="signin-error" autofocus' : ''}>
          ${error ? '<p class="auth-error" id="signin-error" role="alert">Incorrect username or password. Try again.</p>' : ''}
        </div>
        <button type="submit">Sign in</button>
      </form>
      <p class="auth-note">Reviewer access for Cavli&rsquo;s Round 3 technical assessment.<br>The login is on the submission sheet.</p>
    </div>
  </main>
</body>
</html>`;
  return new Response(html, { status, headers: pageHeaders });
}

const redirect = (location: string, cookie?: string) => {
  const headers: Record<string, string> = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
};

/**
 * Returns a Response when the request is handled by the gate (sign-in page, sign-in form, sign-out, public sign-in assets,
 * or a refusal), or null when the request is signed in and should continue to the app.
 */
export async function reviewGate(request: Request, secret: string | undefined, cfg: GateConfig,
  serveAsset: (request: Request) => Promise<Response>): Promise<Response | null> {
  if (!secret) return null;                                     // local preview without a reviewer password
  const url = new URL(request.url);
  const path = url.pathname;
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  if ((request.method === 'GET' || request.method === 'HEAD') && PUBLIC.test(path)) return serveAsset(request);

  const basic = fixedEqual(request.headers.get('Authorization') ?? '', 'Basic ' + btoa(`${USERNAME}:${secret}`));
  const session = basic || await hasSession(request, secret);

  if (path === '/logout') return redirect('/login', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  if (path === '/login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const username = String(form?.get('username') ?? '').trim();
    const password = String(form?.get('password') ?? '');
    if (fixedEqual(username.toLowerCase(), USERNAME) && fixedEqual(password, secret)) {
      const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
      const value = `${exp}.${await sign(secret, `review:${exp}`)}`;
      return redirect('/', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`);
    }
    return signInPage(cfg, 401, { error: true, username: username.slice(0, 64) });
  }
  if (path === '/login') return session ? redirect('/') : signInPage(cfg, 200);
  if (session) return null;
  if (path.startsWith('/api/')) {
    return Response.json({ error: 'Sign in required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return signInPage(cfg, 401);
}
