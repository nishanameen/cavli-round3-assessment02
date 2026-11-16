// vs-prompt-chips (vividsites "Prompt Chips"), upstream script unchanged.
// Prompt suggestions drift past in endless rows, ease to a stop on hover, glide when flicked; a clicked chip springs
// along an arc into the input and the full prompt types itself in. Events: "vs-prompt-chips:pick", "vs-prompt-chips:submit".
(() => {
  if (window.vsPromptChips) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const ICONS = {
    write: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    learn: '<path d="M4 19V6a2 2 0 0 1 2-2h13v13H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13"/>',
    code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
    idea: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    trip: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7.5l8 5.5 8-5.5"/>',
    chart: '<path d="M5 20v-8M11 20V5M17 20v-5M3 20h18"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.idea}</svg>`;

  // one shared rAF ticker
  const live = new Set(); let raf = 0, last = 0;
  const tick = now => {
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    for (const f of live) if (!f(dt)) live.delete(f);
    raf = live.size ? requestAnimationFrame(tick) : 0;
  };
  const wake = f => { live.add(f); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  function mount(root, opts = {}) {
    if (root.__vsPC) return root.__vsPC;
    const form = root.querySelector('.vs-prompt-chips-bar');
    const input = opts.input || (root.dataset.target && document.querySelector(root.dataset.target)) || root.querySelector('.vs-prompt-chips-input');
    const send = root.querySelector('.vs-prompt-chips-send');
    const speed = () => reduce.matches ? 0 : parseFloat(getComputedStyle(root).getPropertyValue('--vs-prompt-chips-speed')) || 0;
    root.querySelectorAll('.vs-prompt-chips-chip').forEach(c => {
      c.type = 'button';
      if (c.dataset.icon && !c.querySelector('svg')) c.insertAdjacentHTML('afterbegin', svg(c.dataset.icon));
    });
    let visible = true, typing = 0;
    const grow = () => { if (input.tagName !== 'TEXTAREA') return; input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
    const sync = () => { grow(); if (send) send.disabled = !input.value.trim(); };

    // ---------- rows: an endless track per row, with drag + inertia ----------
    const rows = [...root.querySelectorAll('.vs-prompt-chips-row')].map(row => {
      const dir = (+row.dataset.dir || -1) < 0 ? -1 : 1, mul = +row.dataset.speed || 1;
      const track = document.createElement('div'); track.className = 'vs-prompt-chips-track';
      const originals = [...row.children]; originals.forEach(c => track.append(c)); row.append(track);
      if (!row.hasAttribute('aria-label')) row.setAttribute('aria-label', 'Suggestions');
      let clones = [], W = 1;
      const R = { x: 0, v: dir * speed() * mul, hover: false, focus: false, drag: null, shift: 0 };
      function layout() {
        clones.forEach(c => c.remove()); clones = [];
        const add = () => originals.forEach(o => {
          const c = o.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; track.append(c); clones.push(c);
        });
        add(); W = Math.max(1, clones[0].offsetLeft - originals[0].offsetLeft);
        for (let n = 1; W * n < row.clientWidth + 2 && n < 12; n++) add();
        R.x = ((R.x % W) - W) % W;
      }
      layout(); new ResizeObserver(() => layout()).observe(row);
      const target = () => (R.hover || R.focus || typing) ? 0 : dir * speed() * mul;
      R.step = dt => {
        if (!R.drag) {
          // momentum with linear drag toward the cruise speed (a flick glides, then settles)
          R.v = target() + (R.v - target()) * Math.exp(-(R.hover ? 7 : 2.6) * dt);
          R.x += R.v * dt;
          if (R.shift) { const d = R.shift * (1 - Math.exp(-12 * dt)); R.x += d; R.shift -= d; if (Math.abs(R.shift) < .3) { R.x += R.shift; R.shift = 0; } }
        }
        R.x = ((R.x % W) - W) % W;
        track.style.transform = `translate3d(${R.x.toFixed(2)}px,0,0)`;
      };
      row.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') R.hover = true; });
      row.addEventListener('pointerleave', () => { R.hover = false; });
      row.addEventListener('focusin', e => {
        R.focus = true;
        const rr = row.getBoundingClientRect(), cr = e.target.getBoundingClientRect(), pad = rr.width * .14;
        if (cr.left < rr.left + pad) R.shift = rr.left + pad - cr.left;
        else if (cr.right > rr.right - pad) R.shift = rr.right - pad - cr.right;
      });
      row.addEventListener('focusout', () => { R.focus = false; });
      row.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        R.drag = { id: e.pointerId, x0: e.clientX, px: R.x, lx: e.clientX, t: performance.now(), v: 0, on: false };
        R.v = 0;
      });
      row.addEventListener('pointermove', e => {
        const d = R.drag; if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x0;
        if (!d.on && Math.abs(dx) > 6) { d.on = true; row.classList.add('is-dragging'); try { row.setPointerCapture(e.pointerId); } catch (_) {} }
        if (!d.on) return;
        const now = performance.now(), dtm = Math.max(1, now - d.t);
        d.v = d.v * .5 + ((e.clientX - d.lx) / (dtm / 1000)) * .5; d.t = now; d.lx = e.clientX;
        R.x = d.px + dx;
      });
      const up = e => {
        const d = R.drag; if (!d || d.id !== e.pointerId) return;
        R.drag = null; row.classList.remove('is-dragging');
        if (d.on) { R.v = Math.max(-2600, Math.min(2600, performance.now() - d.t > 80 ? 0 : d.v)); row.__vsPCdragged = true; setTimeout(() => row.__vsPCdragged = false, 0); }
        if (e.pointerType !== 'mouse') R.hover = false;
      };
      row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up);
      row.addEventListener('click', e => {
        const chip = e.target.closest('.vs-prompt-chips-chip');
        if (!chip) return;
        if (row.__vsPCdragged) { e.preventDefault(); e.stopPropagation(); return; }
        pick(chip);
      }, true);
      return R;
    });
    const loop = dt => { rows.forEach(r => r.step(dt)); return visible; };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(loop); }).observe(root);
    wake(loop);

    // ---------- pick: fly a copy of the chip into the input, then type the prompt ----------
    function type(text) {
      const my = ++typing, cps = Math.max(70, text.length / .85);
      input.value = ''; sync();
      if (reduce.matches) { input.value = text; done(); return; }
      const t0 = performance.now();
      const f = () => {
        if (my !== typing) return false;
        const n = Math.min(text.length, Math.ceil((performance.now() - t0) / 1000 * cps));
        input.value = text.slice(0, n); sync();
        if (n >= text.length) { done(); return false; }
        return true;
      };
      wake(f);
      function done() {
        typing = 0; sync();
        if (form) { form.classList.remove('is-filled'); void form.offsetWidth; form.classList.add('is-filled'); }
        const mode = root.dataset.focus || 'auto';
        if (mode === 'always' || (mode === 'auto' && !coarse.matches)) { input.focus({ preventScroll: true }); try { input.setSelectionRange(text.length, text.length); } catch (_) {} }
      }
    }
    function pick(chip) {
      const label = chip.textContent.trim(), prompt = chip.dataset.prompt || label;
      const ev = new CustomEvent('vs-prompt-chips:pick', { bubbles: true, cancelable: true, detail: { label, prompt, chip } });
      if (!root.dispatchEvent(ev)) return;
      if (reduce.matches || !input.getBoundingClientRect().width) return type(prompt);
      const cr = chip.getBoundingClientRect(), ir = input.getBoundingClientRect(), ic = chip.querySelector('svg');
      const textOff = ic ? ic.getBoundingClientRect().right - cr.left + 8.8 : parseFloat(getComputedStyle(chip).paddingLeft);
      const g = chip.cloneNode(true); g.removeAttribute('aria-hidden'); g.setAttribute('aria-hidden', 'true');
      g.classList.add('vs-prompt-chips-ghost'); g.style.width = cr.width + 'px'; g.style.height = cr.height + 'px';
      root.append(g);
      const lh = parseFloat(getComputedStyle(input).lineHeight) || 24, pt = parseFloat(getComputedStyle(input).paddingTop) || 0;
      const tx = ir.left - textOff, ty = ir.top + pt + lh / 2 - cr.height / 2;
      const X = { x: cr.left, v: 0, g: tx }, Y = { x: cr.top, v: -420, g: ty };   // a small upward kick gives the path an arc
      const dist0 = Math.hypot(tx - cr.left, ty - cr.top) || 1;
      let typed = false, fade = 1;
      const f = dt => {
        const n = 4, h = dt / n;
        for (let i = 0; i < n; i++) {
          X.v += (-170 * (X.x - X.g) - 24 * X.v) * h; X.x += X.v * h;
          Y.v += (-260 * (Y.x - Y.g) - 30 * Y.v) * h; Y.x += Y.v * h;
        }
        const d = Math.hypot(X.x - X.g, Y.x - Y.g);
        if (!typed && d < dist0 * .16) { typed = true; type(prompt); }
        if (typed) fade -= dt * 7.5;
        const s = 1 - (1 - Math.max(0, fade)) * .06;
        g.style.transform = `translate3d(${X.x.toFixed(1)}px,${Y.x.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
        g.style.opacity = Math.max(0, fade).toFixed(3);
        if (fade <= 0) { g.remove(); return false; }
        return true;
      };
      f(0); wake(f);
    }

    input.addEventListener('input', () => { typing = 0; sync(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && form) { e.preventDefault(); form.requestSubmit(); } });
    if (form) form.addEventListener('submit', e => {
      e.preventDefault();
      const prompt = input.value.trim(); if (!prompt) return;
      const ev = new CustomEvent('vs-prompt-chips:submit', { bubbles: true, cancelable: true, detail: { prompt } });
      if (!root.dispatchEvent(ev)) return;
      const clear = () => { input.value = ''; input.style.opacity = ''; input.style.transform = ''; sync(); };
      if (reduce.matches || !input.animate) return clear();
      input.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-10px,0)' }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)' }).finished.then(clear);
    });
    sync();
    const api = { pick: i => { const c = root.querySelectorAll('.vs-prompt-chips-chip:not([aria-hidden])')[i]; c && pick(c); }, fill: type, get input() { return input; } };
    root.__vsPC = api;
    return api;
  }
  const init = () => document.querySelectorAll('.vs-prompt-chips').forEach(el => mount(el));
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  window.vsPromptChips = { mount };
})();
