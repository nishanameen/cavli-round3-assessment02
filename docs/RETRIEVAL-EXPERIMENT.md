# Retrieval and answerability experiment (15 November 2026)

## Question

The brief allows "semantic, keyword or hybrid retrieval". The first prototype used keyword search (BM25 / Postgres full text plus a rerank) and passed all 24 evaluation questions. **Can it answer real-world wording better without losing its refusals?**

## Why

The 24 evaluation questions use the manuals' own words. Questions phrased the way an engineer might ask them failed:
- "thickness" and "How big is the module?" (the manual says "26.5mm x 22.5mm x 2.3mm")
- "lowest current" (it says "Shutdown 1 µA")
- "maximum upload speed" (it says "UL 5Mbps").

## Method

| Set | Size | Role |
|---|---|---|
| `eval/cases.json` + `eval/holdout.json` | 14 + 10 | Regression checks, including 5 questions that must be refused. Also the **only** data used to calibrate similarity thresholds. |
| `eval/paraphrase.json` (set A) | 14 | Written before any change; later used to diagnose, so it is the development set. |
| `eval/paraphrase-b.json` (set B) | 12 | Written after the first diagnosis; the test set for step 2. |
| `eval/paraphrase-c.json` (set C) | 10 + 6 | Written **before** step 3 with its decision rule inside the file: 10 answerable questions plus 6 the documents cannot answer (warranty, weight, lead time, AT&T, IP rating, altitude). The test set for step 3. |

Each step had a decision rule fixed before measuring. Every run used the live site and was scored by the same code, which re-extracts each cited page from the source PDF. The Worker accepts `retrieval = keyword | hybrid | hybrid-gte` and `gate = coverage | model` per request, so every mode ran on the same deployment and data.

**Hybrid search:**
1. Postgres full text gives keyword candidates.
2. pgvector cosine similarity gives meaning candidates.
3. The two lists are merged with reciprocal rank fusion (k = 60).
4. The same rerank, guardrails, band logic and validator then apply.

**The answerability "gate" decides whether a question goes to the model at all:**
- `coverage`: a word-overlap pre-filter. If the best passage covers less than 40% of the question's keywords (or sits below the calibrated meaning band), the answer is "not verified" and the model is never asked.
- `model`: no pre-filter. The model reads the retrieved passages and either answers with citations or returns "not verified". The validator still checks every citation and number. If the model is unavailable, the answer is "not verified", with the passages shown as context only.

## Results (live site)

| Configuration | Set A | Set B | Set C answerable | Set C must-refuse | Main | Held-out |
|---|---|---|---|---|---|---|
| Keyword + word-overlap gate (old default) | 7/14 | 10/12 | 8/10 | 5/6 * | 14/14 | 10/10 |
| Hybrid gte-small + word-overlap gate | 5/14 | 10/12 | – | – | 14/14 † | 10/10 † |
| Hybrid Gemini + word-overlap gate | 6/14 | 10/12 | 9/10 | 6/6 | 14/14 | 10/10 |
| **Hybrid Gemini + model-judged gate (new default)** | **11/14** | **12/12** | **10/10** | **6/6** | **13/14 ‡** | **10/10** |

\* C14 (AT&T): Gemini timed out, and the old quote fallback presented passages as an answer.
† Local Worker run against the live data.
‡ Final version: E06 was refused safely because Gemini timed out ("model unavailable"). The candidate run before the switch scored 14/14.

Retrieval alone (set A, is the expected passage in the vector top 5?): Gemini 12/14, gte-small 9/14.

## What each step showed

1. **Step 1: gte-small hybrid made answers worse** (set A 5/14 vs 7/14). On these table-heavy manuals its similarities are compressed: unrelated pages score as high as correct ones (0.86–0.95). Fusing its results pushed good keyword hits out of the top six.
2. **Step 2: Gemini embeddings found more passages, but answers did not improve** (set B tie at 10/12; set A 6/14). The right passage was often found and then refused by the word-overlap gate. Similarity can't replace that gate, because unanswerable questions score in the same range (Gemini 0.70–0.80). This showed that the bottleneck had moved from retrieval to the answerability decision.
3. **Step 3: letting the model judge answerability fixed it.**
   - On fresh set C it answered 10/10 and refused 6/6, against 8/10 and 5/6 for the old default.
   - It also lifted set B to 12/12 and set A to 11/14.
   - The main and held-out sets stayed intact, and the questions that must be refused (pricing, MTBF, Verizon) were still refused.
   - The decision rule was met, so this became the live default.

## Decision and safeguards

- **Live default:** `RETRIEVAL_DEFAULT = hybrid` (Gemini vectors) and `GATE_DEFAULT = model`.
- **Safeguards that remain:**
  - deterministic guardrails (battery life, custom certification)
  - structured band answers, never from the model
  - the citation and number validator
  - the rule that a refusal never shows citations as support
  - **if the model is unavailable, "not verified"**. This was added after the first live check, when a Gemini outage let quotes stand in for an answer about warranty.
- **Costs:**
  - **Model calls:** every question that isn't handled by a guardrail or band rule now uses an embedding call and a model call, including questions that will be refused.
  - **Speed:** the median answer takes about 2 s.
  - **Quota:** the free tier allows 1,000 embedding requests a day per Google project. A backup key from a second project takes over automatically after a quota error. If vectors are unavailable, search falls back to keyword.
- **The local CLI keeps keyword search with the word-overlap gate**, so it works offline with no vector store.

## Remaining gaps

- **Set A still misses three questions.** "thickness", "How big is the module?" and "peak transmit current" never reach the top passages. The dimension and power tables are long mixed tables whose embeddings are dominated by other content. Splitting tables into row-level passages is the next lever.
- **These are smoke tests, not benchmarks.** 66 questions were run once per configuration, and Gemini answers vary slightly between runs.

**Interview summary:** I measured each change against questions written before it, with the decision rule fixed in advance. Vector search alone didn't help, and the data showed why: the limit was the rule deciding when evidence is enough, not search. Letting the model judge that, with guardrails, the validator and a safe outage rule kept, answered every fresh question and refused every unanswerable one.
