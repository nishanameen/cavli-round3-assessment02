// Bundles the Thinking Orb (vendor/thinking-orbs, MIT) with its framework-free mount into public/thinking-orb.js.
// Run from web/: node scripts/build-orb.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['orb/mount.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  outfile: 'public/thinking-orb.js',
  banner: { js: '/* Thinking Orb engine: github.com/Jakubantalik/thinking-orbs (MIT, see vendor/thinking-orbs/LICENSE) */' },
});
console.log('built public/thinking-orb.js');
