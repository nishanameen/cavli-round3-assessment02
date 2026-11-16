"""Calibrate the meaning-score thresholds (SEM_LOW / SEM_HIGH in web/src/engine.ts).

Uses only eval/cases.json and eval/holdout.json (never eval/paraphrase.json). For each question it asks the hosted
hybrid search for candidates and records the gte-small cosine similarity of (a) passages at an expected location and
(b) the best passage for unanswerable questions. Writes outputs/semantic-calibration.json.
Usage (from round3-assignment2): python scripts/calibrate_semantic.py [gte|gemini]
"""
import json
import math
import os
import statistics as st
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from docintel.config import gemini_keys, load_env  # noqa: E402
from docintel.retrieve import analyze  # noqa: E402

load_env()
URL = os.environ["DOCINTEL_SUPABASE_URL"].rstrip("/") + "/functions/v1/cavli-docintel"
TOKEN = os.environ["DOCINTEL_RUNTIME_TOKEN"]
MODEL = sys.argv[1] if len(sys.argv) > 1 else "gemini"


def gemini_vector(text: str) -> list[float]:
    body = {"model": "models/gemini-embedding-001", "content": {"parts": [{"text": text}]}, "taskType": "RETRIEVAL_QUERY",
            "outputDimensionality": 768}
    for key in gemini_keys():
        req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
                                     data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            v = json.loads(urllib.request.urlopen(req, timeout=60).read())["embedding"]["values"]
            break
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
    else:
        raise RuntimeError("all Gemini keys are out of embedding quota")
    n = math.sqrt(sum(x * x for x in v))
    return [round(x / n, 6) for x in v]


def search(question: str, view: str) -> list[dict]:
    q = analyze(question)
    body = {"action": "search", "view": view, "terms": q.expanded[:40], "phrases": q.phrases[:10], "limit": 60,
            "hybrid": True}
    body.update({"model": "gemini", "vector": gemini_vector(question)} if MODEL == "gemini" else {"query": question[:500]})
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["rows"]


def matches(row: dict, expected: list[dict]) -> bool:
    for e in expected:
        if row["doc_id"] != e["doc_id"]:
            continue
        if "pages" in e and str(row.get("printed_page")) in e["pages"]:
            return True
        if "sections" in e and any(s in (row.get("section_title") or "") for s in e["sections"]):
            return True
    return False


relevant, best_unrelated, unanswerable = [], [], []
for name in ("cases.json", "holdout.json"):
    for case in json.loads((ROOT / "eval" / name).read_text(encoding="utf-8"))["cases"]:
        rows = [r for r in search(case["question"], "sim" if case.get("setup") else "main") if r.get("similarity") is not None]
        exp = [e for e in case["expected_sources"] if e.get("as") != "related"]
        if case["category"] == "unanswerable" and not exp:
            unanswerable.append({"id": case["id"], "top_similarity": round(max(r["similarity"] for r in rows), 4)})
            continue
        if not exp:
            continue
        hits = [r["similarity"] for r in rows if matches(r, exp)]
        misses = [r["similarity"] for r in rows if not matches(r, exp)]
        if hits:
            relevant.append({"id": case["id"], "best_expected": round(max(hits), 4),
                             "best_other": round(max(misses), 4) if misses else None})

summary = {
    "model": "gemini-embedding-001 (768)" if MODEL == "gemini" else "gte-small (384)",
    "expected_passage_similarity": {"min": min(r["best_expected"] for r in relevant),
                                    "median": st.median(r["best_expected"] for r in relevant),
                                    "max": max(r["best_expected"] for r in relevant)},
    "unanswerable_top_similarity": unanswerable,
    "per_case": relevant,
}
(ROOT / "outputs" / f"semantic-calibration-{MODEL}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in summary.items() if k != "per_case"}, indent=2))
for r in relevant:
    print(r)
