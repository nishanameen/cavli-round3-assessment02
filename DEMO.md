# Demo script

## Hosted site (about 6 minutes)

There is a recorded version at [`outputs/Cavli_A02_hosted_demo.mp4`](outputs/Cavli_A02_hosted_demo.mp4): 5 min 57 s, narrated, made from frames that `web/scripts/capture-hosted-demo.mjs` captured on the live site on 14 November. It predates the Pipeline tab; a new recording is planned. For a live demo, open https://cavli-assignment-2.nishanameenk.workers.dev and sign in as `reviewer`. Then:

1. **Home (40 s).** Show the drifting prompt-chip rows (one row per case type: answerable, ambiguous and conflicting, should refuse), hover to stop a row, the view switch and the tabs.
2. **Cited answer (45 s).** Click the "Reset pin and hold time" chip; it types the full question into the bar. Press Enter. Show the numbered citations, open "Open at this location" (p. 31), and point out the AT+TRB review flag.
3. **Audit panel (30 s).** Expand "Retrieved passages and validation" to show the scores, the coverage and the validator result.
4. **Ambiguous (35 s).** Ask the supply-voltage question. It gives separately cited module and EVK answers, then a clarifying question.
5. **Conflict (40 s).** Ask about WW Band 38. Both sources are shown, nothing is confirmed, and review item #4 is linked.
6. **Not verified (30 s).** Ask the custom-antenna question to show the related context and the escalation route.
7. **Simulated revision (40 s).** Switch to "Simulated revision 5.4" and ask the revision question. Point out the SIMULATED badge and the earlier 5.3 wording. Tick "Include superseded revisions" to see the outdated passage next to it.
8. **Review queue (60 s).** Expand the revision-change diff. Enter a note, mark the item resolved, then reopen it. In the current view, open the WW conflict evidence.
9. **Pipeline (60 s).** Open the Pipeline tab and walk through the five stages with real counts and the per-document table. Click "Check sources for updates": AT, EVK and the product page come back unchanged, and TME "cannot tell from headers", the honest answer. Point out that nothing is re-indexed from the website, because that needs human approval. Show the revision timeline and the run history (run #1 "new", later runs "unchanged").
10. **Sources (30 s).** Show each revision's hashes and acquisition route.
11. **Retrieval experiment (optional, 60 s).** Show `docs/RETRIEVAL-EXPERIMENT.md`, which covers the three measured steps:
    - gte-small hybrid made answers worse
    - Gemini hybrid found more passages, but the word-overlap gate refused them
    - letting the model judge answerability scored 16/16 on fresh set C, so it became the default.

    Point to the "hybrid search · AI-judged answerability" label on each answer, and to the safe refusal when the model is unavailable.

## CLI (about 7–8 minutes)

There is a recorded version at [`outputs/Cavli_A02_demo.mp4`](outputs/Cavli_A02_demo.mp4): 7 min 26 s, narrated, made from real CLI output. Its frames and the actual command output are in `outputs/demo/` and [`outputs/DEMO-TRANSCRIPT.md`](outputs/DEMO-TRANSCRIPT.md). For a live demo, run the commands below from `round3-assignment2` after `python -m docintel ingest`.

1. **Scope and sources (45 s).** `python -m docintel sources`. Point out document identity versus revision, the hash-verified acquisition, the EVK page-label offset (printed page = PDF page + 1), and that the PDFs aren't bundled because of their copyright notice. Show `docs/SOURCES.md`.
2. **Repeatable ingest and review queue (50 s).** Run `python -m docintel ingest --refresh` and show that every source is `unchanged`. Then `python -m docintel review` lists the six automatic findings: four band conflicts, the AT+TRB gap and the stale EVK reference.
3. **Cited answer (50 s).** `python -m docintel ask "Which pin resets the bare C16QS module, and how long must it be held low?"`. Open the `#page=31` link and show §3.4.2. Explain the validator: citations must come from retrieved passages, and every number must appear in the cited text.
4. **Ambiguity (45 s).** `python -m docintel ask "What supply voltage does the C16QS need?"`. Show the two separately cited scopes (module VBAT, EVK input) and the clarifying question.
5. **Conflict (45 s).** `python -m docintel ask "Does the C16QS-WW support LTE Band 38?"`. Both sources give bands per regional variant, so this is a same-scope conflict. Nothing is confirmed, and the answer links review item #4. Optionally run `python -m docintel review --details`.
6. **Revision (60 s).** `copy cache\index.sqlite cache\demo-revision.sqlite`, then `python -m docintel --db cache/demo-revision.sqlite simulate-revision`, then `python -m docintel --db cache/demo-revision.sqlite ask "How long must the C16QS reset pin be held low?"`. Show the SIMULATED warning, the earlier 5.3 wording and review item #7. Add `--all-revisions --extractive` to show the outdated and current passages side by side.
7. **Not verified (40 s).** Ask about certification for a custom antenna (guardrail with related context and escalation) and about MTBF (coverage threshold, no model call).
8. **Evaluation and documentation fixes (60 s).** Open `outputs/EVALUATION.md` (14/14), `outputs/EVALUATION-holdout.md` (10/10), the run-1 and extractive comparisons, and `docs/FAILURES-REPORT.md`.
