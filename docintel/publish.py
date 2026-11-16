"""Publish the verified local index to the hosted Supabase `docintel` schema.

Two views are published: "main" (the real sources) and "sim" (main plus the labelled SIMULATED revision, rebuilt
fresh from main every time). Re-publishing is idempotent; an expert's resolution of a review item is preserved.
"""
import json
import os
import shutil
import urllib.error
import urllib.request

from .checks import band_claims, current_passages
from .config import CACHE, SIMULATED
from .ingest import apply_simulated_revision
from .store import connect, now
from .watch import probe
from .embed import publish_gem

BATCH = 120


def _view(con) -> dict:
    revisions = [dict(r) for r in con.execute(
        "SELECT doc_id, revision, revision_label, revision_date, date_source, url, host, format, file_sha256, "
        "text_sha256, acquired_via, ingested_at, simulated, page_count, label_offset, notes, status FROM revisions")]
    passages = [dict(r) for r in con.execute(
        "SELECT p.pid, p.doc_id, r.revision, p.pdf_page, p.printed_page, p.section_no, p.section_title, p.anchor, "
        "p.text AS body FROM passages p JOIN revisions r ON r.rev_id = p.rev_id")]
    reviews = [{"fingerprint": r["fingerprint"], "kind": r["kind"], "severity": r["severity"], "topic": r["topic"],
                "summary": r["summary"], "details": json.loads(r["details"] or "{}"), "status": r["status"]}
               for r in con.execute("SELECT * FROM review_queue ORDER BY id")]
    claims = [{k: c[k] for k in ("variant", "pid", "bands", "doc_id", "title", "revision", "printed_page",
                                 "section", "excerpt")} for c in band_claims(current_passages(con))]
    documents = [dict(r) for r in con.execute("SELECT * FROM documents")]
    return {"documents": documents, "revisions": revisions, "passages": passages, "reviews": reviews, "claims": claims}


def _post(url: str, token: str, payload: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps({"action": "publish", "payload": payload}).encode("utf-8"),
                                 method="POST", headers={"Content-Type": "application/json",
                                                         "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"publish {payload.get('kind')} failed: HTTP {exc.code}") from None


def publish(main_db, log=print) -> dict:
    base = os.environ.get("DOCINTEL_SUPABASE_URL")
    token = os.environ.get("DOCINTEL_PUBLISH_TOKEN")
    if not base or not token:
        raise RuntimeError("Set DOCINTEL_SUPABASE_URL and DOCINTEL_PUBLISH_TOKEN in .env to publish.")
    url = base.rstrip("/") + "/functions/v1/cavli-docintel"

    main_con = connect(main_db)
    sim_path = CACHE / "publish-sim.sqlite"
    main_con.close()
    shutil.copyfile(main_db, sim_path)
    sim_con = connect(sim_path)
    apply_simulated_revision(sim_con, SIMULATED / "c16qs-hardware-manual-5.4-SIMULATED.json", log=lambda *_: None)
    main_con = connect(main_db)
    views = {"main": _view(main_con), "sim": _view(sim_con)}

    revisions: dict = {}
    for name, v in views.items():
        for r in v["revisions"]:
            row = revisions.setdefault((r["doc_id"], r["revision"]), dict(r, status_main=None, status_sim=None))
            row[f"status_{name}"] = r["status"]
    for row in revisions.values():
        row.pop("status", None)
        row["simulated"] = bool(row["simulated"])
        # Change-detection fingerprint for real sources only (the simulated revision has no public URL).
        row["watch"] = None if row["simulated"] else probe(row["url"], row["format"])
    passages = {p["pid"]: p for v in views.values() for p in v["passages"]}

    steps = [("documents", None, views["main"]["documents"]), ("revisions", None, list(revisions.values()))]
    plist = list(passages.values())
    steps += [("passages", None, plist[i:i + BATCH]) for i in range(0, len(plist), BATCH)]
    for name, v in views.items():
        steps += [("reviews", name, v["reviews"]), ("claims", name, v["claims"])]
    for kind, view, rows in steps:
        payload = {"kind": kind, "rows": rows}
        if view:
            payload["view"] = view
        _post(url, token, payload)
    summary = {"published_at": now(), "revisions": len(revisions), "passages": len(passages),
               "views": {n: {"reviews_open": sum(r["status"] == "open" for r in v["reviews"]),
                             "band_claims": len(v["claims"])} for n, v in views.items()},
               "stages": _stages(main_con), "ingest_runs": _ingest_runs(main_con),
               "simulation": {"spec": "sources/simulated/c16qs-hardware-manual-5.4-SIMULATED.json",
                              "revision_changes": [r["summary"] for r in views["sim"]["reviews"]
                                                   if r["kind"] == "revision_change"]}}
    _post(url, token, {"kind": "finish", "pids": list(passages), "summary": summary,
                       "revisions": [list(k) for k in revisions]})
    log(f"Published {summary['revisions']} revisions and {summary['passages']} passages; "
        f"main view {summary['views']['main']}, sim view {summary['views']['sim']}.")
    embed_pending(url, token, log)

    def post(body: dict) -> dict:
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))

    if os.environ.get("GEMINI_API_KEY"):
        publish_gem(post, list(passages.values()), log)
    else:
        log("GEMINI_API_KEY not set: Gemini vectors skipped (hybrid search falls back to keyword for missing vectors).")
    return summary


def embed_pending(url: str, token: str, log=print) -> None:
    """Ask the edge function to embed passages without vectors (new or changed text), a few at a time."""
    calls, remaining = 0, None
    while remaining != 0:
        req = urllib.request.Request(url, data=json.dumps({"action": "embed_pending"}).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                break
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt == 2:
                    raise RuntimeError(f"embedding stopped with {remaining} passages left: {exc}") from None
        calls += 1
        remaining = result["remaining"] if result["updated"] else 0
        if calls % 25 == 0:
            log(f"  embeddings: {remaining} passages left")
    log(f"Embeddings up to date ({calls} edge-function calls).")


def _stages(con) -> list[dict]:
    """Per-document pipeline stages for the current revisions, as shown on the hosted Pipeline tab."""
    rows = con.execute(
        "SELECT d.code, d.doc_id, r.revision, r.format, r.acquired_via, r.page_count, r.label_offset, r.file_sha256, "
        "r.text_sha256, (SELECT count(*) FROM pages g WHERE g.rev_id = r.rev_id AND g.kind = 'toc') AS toc_pages, "
        "(SELECT count(*) FROM passages p WHERE p.rev_id = r.rev_id) AS passages, "
        "(SELECT count(DISTINCT section_no) FROM passages p WHERE p.rev_id = r.rev_id AND section_no IS NOT NULL) AS sections "
        "FROM revisions r JOIN documents d ON d.doc_id = r.doc_id WHERE r.status = 'current' ORDER BY d.code")
    return [dict(r) for r in rows]


def _ingest_runs(con, limit: int = 8) -> list[dict]:
    out = []
    for r in con.execute("SELECT run_id, started_at, finished_at, report FROM ingest_runs WHERE report IS NOT NULL "
                         "ORDER BY run_id DESC LIMIT ?", (limit,)):
        report = json.loads(r["report"])
        out.append({"run_id": r["run_id"], "started_at": r["started_at"], "finished_at": r["finished_at"],
                    "documents": [{k: d.get(k) for k in ("doc_id", "revision", "state", "acquired_via", "passages")}
                                  for d in report.get("documents", [])],
                    "revision_changes": report.get("revision_changes", []), "checks": report.get("checks", {})})
    return out
