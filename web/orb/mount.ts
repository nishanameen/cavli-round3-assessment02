// Framework-free mount for the Libraries.dev Thinking Orb (vendor/thinking-orbs, MIT, unmodified).
// It mirrors the upstream React component's effect: device-pixel-ratio canvas, one shared clock, a static frame for
// reduced motion, and pausing while offscreen or while the tab is hidden. Bundled to public/thinking-orb.js by
// scripts/build-orb.mjs and exposed as window.ThinkingOrb.create({ state, size }).
import { MODE_DRAWS } from '../vendor/thinking-orbs/src/engine/registry';
import { resolvePreset } from '../vendor/thinking-orbs/src/presets';
import type { OrbSize, OrbState } from '../vendor/thinking-orbs/src/types';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function create({ state = 'listening', size = 64, speed = 1, dark = false }:
  { state?: OrbState; size?: OrbSize; speed?: number; dark?: boolean } = {}): HTMLCanvasElement {
  size = size === 20 ? 20 : 64;                          // the orb ships tuned for 64 px and 20 px only
  const canvas = document.createElement('canvas');
  canvas.className = 'thinking-orb';
  canvas.setAttribute('aria-hidden', 'true');           // the loading text next to it carries the meaning
  canvas.style.width = canvas.style.height = `${size}px`;  // CSSOM, allowed by the strict CSP
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { mode, speed: baseSpeed, opts } = resolvePreset(state, size);
  const draw = MODE_DRAWS[mode];
  const frame = (t: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size, t, dark, opts);
  };
  if (reduce.matches) { frame(0.6); return canvas; }   // reduced motion: one static, deterministic frame

  let raf = 0, running = false, visible = true;
  const loop = () => {
    if (!canvas.isConnected && seen) { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); return; }
    frame((performance.now() / 1000) * baseSpeed * speed);
    if (running) raf = requestAnimationFrame(loop);
  };
  let seen = false;
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const io = new IntersectionObserver(([e]) => {
    seen = true; visible = e.isIntersecting;
    if (visible && document.visibilityState !== 'hidden') start(); else stop();
    if (!canvas.isConnected) { io.disconnect(); document.removeEventListener('visibilitychange', onVis); }
  });
  const onVis = () => { if (document.visibilityState === 'hidden') stop(); else if (visible) start(); };
  frame((performance.now() / 1000) * baseSpeed * speed);
  io.observe(canvas);
  document.addEventListener('visibilitychange', onVis);
  return canvas;
}

(window as unknown as { ThinkingOrb: { create: typeof create } }).ThinkingOrb = { create };
