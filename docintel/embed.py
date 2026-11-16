"""Gemini document embeddings for hybrid search (gemini-embedding-001, 768 dims, L2-normalised).

Vectors are cached in cache/gemini-embeddings.json keyed by a hash of the embedded text (model, size, title, text), so
re-publishing only embeds new or changed text. The query side is embedded by the Worker with the same model and settings.
"""
import hashlib
import json
import math
import os
import time
import urllib.error
import urllib.request

from .config import CACHE, gemini_keys

MODEL = "gemini-embedding-001"
DIMS = 768
API = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents"
CACHE_FILE = CACHE / "gemini-embeddings.json"


def _doc_text(p: dict) -> tuple[str, str]:
    return (p.get("section_title") or ""), p["body"][:2000]


def _key(p: dict) -> str:
    title, text = _doc_text(p)
    return hashlib.sha256(f"{MODEL}|{DIMS}|{title}|{text}".encode("utf-8")).hexdigest()[:16]


def _batch(passages: list[dict]) -> list[list[float]]:
    reqs = []
    for p in passages:
        title, text = _doc_text(p)
        r = {"model": f"models/{MODEL}", "content": {"parts": [{"text": text}]}, "taskType": "RETRIEVAL_DOCUMENT",
             "outputDimensionality": DIMS}
        if title:
            r["title"] = title
        reqs.append(r)
    keys = gemini_keys()
    for attempt in range(6):
        if not keys:
            break
        req = urllib.request.Request(API, data=json.dumps({"requests": reqs}).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": keys[0]})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                out = json.loads(resp.read().decode("utf-8"))["embeddings"]
            vectors = []
            for e in out:
                v = e["values"]
                n = math.sqrt(sum(x * x for x in v))
                vectors.append([round(x / n, 6) for x in v])
            return vectors
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and len(keys) > 1:      # daily quota on this project: move to the backup key
                keys.pop(0)
                continue
            if exc.code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f"Gemini embedding HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(15 * (attempt + 1))
    raise RuntimeError("Gemini embedding failed after retries")


def embed_passages(passages: list[dict], log=print, batch_size: int = 20) -> dict[str, list[float]]:
    """Content-addressed cache: identical text (e.g. unchanged pages of a new revision) reuses its vector."""
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    todo, seen = [], set()
    for p in passages:
        k = _key(p)
        if k not in cache and k not in seen:
            todo.append(p)
            seen.add(k)
    for i in range(0, len(todo), batch_size):          # small paced batches stay inside free-tier token limits
        chunk = todo[i:i + batch_size]
        for p, v in zip(chunk, _batch(chunk)):
            cache[_key(p)] = v
        CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
        time.sleep(4)
    log(f"Gemini embeddings: {len(todo)} computed, {len(passages) - len(todo)} reused from cache.")
    return {p["pid"]: cache[_key(p)] for p in passages}


def publish_gem(post, passages: list[dict], log=print) -> None:
    """Store Gemini vectors in docintel.passages.embedding_gem through the edge function (publish token)."""
    vectors = embed_passages(passages, log)
    rows = [{"pid": pid, "embedding": v} for pid, v in vectors.items()]
    result = {}
    for i in range(0, len(rows), 60):
        result = post({"action": "set_gem_embeddings", "rows": rows[i:i + 60]})
    log(f"Gemini vectors stored; passages still without one: {result.get('remaining')}.")
