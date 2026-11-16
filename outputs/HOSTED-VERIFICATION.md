# Hosted verification record

**URL:** https://cavli-assignment-2.nishanameenk.workers.dev. Sign in as `reviewer`; the password is shared separately and is stored as `REVIEWER_PASSWORD` in the git-ignored `.env`.

**Current deployment:** Cloudflare Worker `cavli-assignment-2`, version `e66e6454-96ae-48d3-a1a0-9405590ca617` (16 November 2026). It runs the code of version `aa9e149f`, with a reviewer-password change on top; the script hashes are identical.
- **Defaults:** `RETRIEVAL_DEFAULT = hybrid` (keyword plus Gemini vectors) and `GATE_DEFAULT = model` (the model judges answerability).
- **Answer logic:** the final record runs (rows marked f8d276a4) used version `f8d276a4`. Its successors 729ea59c, 23c967cf and 53c29280 changed only the page: an answerability label, the redesign and the Thinking Orb. On 16 November, two fixes from `docs/FAILURES-REPORT.md` changed the answer logic:
  - F21 (`aa58d4cb`): a validator rejection is reported as such, not as an outage. A revision label such as "5.4" passes the number check when it is written as a revision. Superseded passages are tagged for the model, so it answers from the later revision first.
  - F22 (`aa9e149f`): the supply-voltage split answer follows the outage rule.
  - The F21 and F22 rows in the table below re-check these fixes.
- **Backup key:** a Gemini key from a second Google project, used only after a quota error (HTTP 429).
- **Data:** Supabase project `cavli-assessment` (`bxtofslencddcgxxsmaa`, Mumbai), schema `docintel`, behind edge function `cavli-docintel` (version 3).

**Assignment 1 is untouched.** It has its own Worker, tables, function and password, and still answers anonymous requests with HTTP 401.

## What the hosted system is

| Layer | Detail |
|---|---|
| Web page | Same design as Assignment 1: official Cavli Wireless logo, self-hosted Space Grotesk, and vividsites Prompt Chips on the Ask tab (a chip types its question into the bar; you then send it). Loading states show the Libraries.dev Thinking Orb (MIT, unmodified): 64 px and centred while an answer is checked, 20 px on the other tabs, a still frame with reduced motion. Four tabs: Ask, Review queue, **Pipeline** and Sources. A switch moves between current sources and the simulated revision. Each answer shows its search mode and how answerability was decided. The CSP is strict and server text is inserted as text only. |
| Worker (`web/src`) | `engine.ts` is the answer engine. `retrieval = keyword / hybrid / hybrid-gte` and `gate = coverage / model` can be set per request; the defaults are set by Worker variables. `watch.ts` holds the read-only source-update check. |
| Edge function | Checks the SHA-256 of a bearer token against `docintel.runtime_keys`. The runtime token is read-only. The publish token is the only one that can write or embed, and it expires on 2027-02-12. |
| Postgres | `docintel` schema with RLS enabled and no policies, not exposed through the Data API. Every passage has a full-text index, a gte-small vector (384 d) and a Gemini vector (768 d). Hybrid search uses reciprocal rank fusion. |
| Publishing | `python -m docintel publish` pushes both views and embeds only new or changed text. 5 revisions, 798 passages, both vectors on every passage, 6 open review items per view. |

## Checks against the live site

| Check | Version | Result | Evidence |
|---|---|---|---|
| Anonymous page and API | e66e6454 | 401 / 401 | `browser-check-hosted.json` |
| Main set (14), default | f8d276a4 | **13/14**, 31/31 citations valid. E06 was refused because Gemini timed out ("model unavailable"); the pre-switch candidate run (694e364e) scored 14/14. | `EVALUATION-hosted-gemini-judge.md` |
| Held-out set (10), default | f8d276a4 | **10/10**, 23/23 | `EVALUATION-holdout-hosted-gemini-judge.md` |
| Set C (16: 10 answerable, 6 must-refuse), default | f8d276a4 | **16/16**, 19/19 | `EVALUATION-paraphrase-c-hosted-gemini-judge.md` |
| Set B (12), default | f8d276a4 | **12/12**, 22/22 | `EVALUATION-paraphrase-b-hosted-gemini-judge.md` |
| Set A (14), default | f8d276a4 | 11/14, 30/30 | `EVALUATION-paraphrase-hosted-gemini-judge.md` |
| F21 re-check before deploying: main, held-out, C, B and A on a local Worker (`wrangler dev`, live data, default settings) | aa58d4cb code | 14/14, 10/10, 16/16, 12/12, 11/14 (P02, P09, P13 as before); no fallbacks or rejections | `EVALUATION-*-f21-local-worker.md` |
| F21 live: main and held-out, default | aa58d4cb | 12/14 and 8/10, 60/60 citations valid. Gemini was returning HTTP 503s and timeouts; all four misses (E01, E06, H04, H07) were safe "model unavailable" refusals with context. Every answer the model returned passed. | `EVALUATION-f21-hosted.md`, `EVALUATION-holdout-f21-hosted.md` |
| F21 local CLI with Gemini (keyword + word-overlap gate): main and held-out | — | 14/14 and 10/10, as recorded | `EVALUATION-f21-cli.md`, `EVALUATION-holdout-f21-cli.md` |
| F21 audit question: "How long must the C16QS reset pin be held low? (audit)", simulated view, superseded revisions on | aa58d4cb, e66e6454 | `answered_with_flags`: 150-500 ms from the simulated 5.4 revision first, superseded 5.3 (100-500 ms) given as the earlier wording, revision-change flag #13. It was "model unavailable" before F21. | `docs/FAILURES-REPORT.md` F21 |
| F22 supply-voltage split answer during an outage | aa9e149f code on a local Worker; e66e6454 live | Local: H06 hit a real Gemini 503 on both halves and came back "not verified" with 4 context passages, no quotes presented as an answer. E08 answered as before. Live: E08 hit a timeout on the module half. It came back "Bare module: Not verified: The answer model is unavailable…", with the EVK half answered and cited and the module passages as context (mode `model unavailable / gemini:… (per scope)`). | `docs/FAILURES-REPORT.md` F22 |
| Old default (keyword + word-overlap gate): main, held-out, A, B, C | 26355e63 | 14/14, 10/10, 7/14, 10/12, 13/16 | `EVALUATION-*-hosted-keyword.md` |
| Gemini hybrid + word-overlap gate: main, held-out, A, B, C | 26355e63 | 14/14, 10/10, 6/14, 10/12, 15/16 | `EVALUATION-*-hosted-gemini.md` |
| gte-small hybrid (sets A and B) | e28f6d58 | 5/14 and 10/12 | `EVALUATION-paraphrase(-b)-hosted-gte.md` |
| Playwright on the redesigned page, desktop and 375 px, 18 checks including logo, font, prompt chips, the Pipeline tab and update check | 53c29280 | **18/18**, no console errors | `browser-check-hosted-53c29280.json` |
| Playwright, same 18 checks, after F21 | aa58d4cb | **18/18**, no console errors | `browser-check-hosted-aa58d4cb.json` |
| Playwright, same 18 checks, current deployment | e66e6454 | 15/18, no console errors. Gemini was returning HTTP 503s and timeouts. The three checks that need a model answer (reset pin, supply voltage, simulated reset) got safe "not verified" refusals, confirmed through the API straight afterwards. Every check that does not need the model passed. An earlier run, during the reviewer-password rollout, got HTTP 401s and is not counted. | `browser-check-hosted.json`, `browser/hosted/` (screenshots of checks that failed here are from the aa58d4cb run) |
| Thinking Orb loading state: desktop, 390 px and reduced motion (animates, sharp at 2x, centred, removed when the answer arrives) | e66e6454 | Passed, no errors (also passed on 53c29280) | `orb-check-hosted.json`, `browser/hosted/orb-*.png` |
| Source update check | e66e6454 | AT, EVK and Web: unchanged. HW (TME): cannot tell from headers. Nothing re-indexed. | browser check step 15 |
| Review resolve and reopen | e66e6454 | Passed; restored afterwards (item #13) | browser check step 12 |
| Supabase security advisor | — | INFO only: "RLS enabled, no policy", the intended deny-all | — |
| First hosted release (keyword-only engine) | 8fa59315 | 14/14 and 10/10 | `EVALUATION-hosted-release1.md`, `EVALUATION-holdout-hosted-release1.md` |

The step-by-step comparison and the decision rules are in `docs/RETRIEVAL-EXPERIMENT.md`.

## Observations from these runs

- **Default changed by a rule fixed in advance.** On fresh set C, model-judged answerability answered 10/10 and refused 6/6, against 8/10 and 5/6 for the old default, with no main or held-out regression. That met the rule written into `eval/paraphrase-c.json`.
- **Outage behaviour (fixed).** On the first check after the switch, Gemini was timing out on both keys. A warranty question then came back as quotes presented as an answer. Now, when the model is the judge and is unavailable, the answer is "not verified", with the passages shown only as context. No measured pass relied on that path.
- **Refusal citations bug (fixed earlier).** A "not verified" answer shows checked passages only as related context, never as citations.
- **Scorer bug (fixed earlier).** Document-level expected sources now match any page; only B12 changed.
- **Provider availability.** Gemini Flash-Lite had spells of 40-second timeouts on 15 November and of HTTP 503 ("overloaded") on 16 November. Each affected answer is recorded as it happened (E06 "model unavailable", P14 quote fallback; the F21 live runs and the e66e6454 Playwright run) rather than re-run until clean. The backup key is used only after HTTP 429, so it does not help with a 503.
- **Latency with the new default.** The median is about 2.2 s per question. The slowest tenth take about 11 s or more, when a retry or slow provider response occurs. Band and guardrail answers take 0.2–0.3 s.
