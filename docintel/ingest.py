"""Repeatable ingestion: acquire -> verify hash -> extract -> index -> supersede -> diff -> checks."""
import difflib
import hashlib
import json
import re
from datetime import date
from pathlib import Path

from . import checks
from .config import MANIFEST
from .extract import extract_pdf_pages, html_passages, pdf_passages
from .fetch import acquire
from .store import now, upsert_review


def load_manifest(path: Path = MANIFEST) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _version_key(revision: str | None):
    nums = re.findall(r"\d+", revision or "")
    return tuple(int(n) for n in nums[:3]) if nums else ()


def _text_hash(passages: list[dict]) -> str:
    h = hashlib.sha256()
    for p in passages:
        h.update((p["text"] + "\x1f").encode("utf-8"))
    return h.hexdigest()


def _pid(code: str, revision: str, p: dict, n: int) -> str:
    rev = re.sub(r"[^A-Za-z0-9.]+", "-", revision)
    if p["pdf_page"] is not None:
        return f"{code}-v{rev}-p{p['pdf_page']:03d}-{n}"
    return f"{code}-{rev}-s{n:02d}"


def _upsert_document(con, doc: dict, module: str):
    con.execute(
        "INSERT INTO documents (doc_id, code, title, publisher, doc_type, scope, module) VALUES (?,?,?,?,?,?,?) "
        "ON CONFLICT(doc_id) DO UPDATE SET code=excluded.code, title=excluded.title, publisher=excluded.publisher, "
        "doc_type=excluded.doc_type, scope=excluded.scope, module=excluded.module",
        (doc["doc_id"], doc["code"], doc["title"], doc["publisher"], doc["doc_type"], doc["scope"], module))


def _store_revision(con, doc: dict, meta: dict, pages: list[dict], passages: list[dict]) -> tuple[int, str]:
    text_sha = _text_hash(passages)
    existing = con.execute("SELECT rev_id, revision FROM revisions WHERE doc_id = ? AND text_sha256 = ?",
                           (doc["doc_id"], text_sha)).fetchone()
    if existing:
        meta["revision"] = existing["revision"]
        return existing["rev_id"], "unchanged"
    if meta["revision"] is None:                                   # unversioned web page -> dated snapshot
        meta["revision"] = f"snapshot-{date.today():%Y%m%d}-{text_sha[:8]}"
    cur = con.execute(
        "INSERT INTO revisions (doc_id, revision, revision_label, revision_date, date_source, url, host, format, "
        "file_sha256, text_sha256, acquired_via, retrieved_at, ingested_at, simulated, page_count, label_offset, notes) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (doc["doc_id"], meta["revision"], meta.get("revision_label"), meta.get("revision_date"),
         meta.get("date_source"), meta["url"], meta.get("host"), meta["format"], meta.get("file_sha256"),
         text_sha, meta.get("acquired_via"), meta.get("retrieved_at", now()), now(), int(meta.get("simulated", False)),
         len(pages) or None, meta.get("label_offset"), meta.get("notes")))
    rev_id = cur.lastrowid
    for pg in pages:
        con.execute("INSERT INTO pages VALUES (?,?,?,?,?)",
                    (rev_id, pg["pdf_page"], pg["printed_page"], pg["kind"], pg["text"]))
    counters: dict = {}
    for p in passages:
        key = p["pdf_page"]                                        # None for web sections: one running counter
        counters[key] = counters.get(key, 0) + 1
        pid = _pid(doc["code"], meta["revision"], p, counters[key])
        con.execute("INSERT INTO passages VALUES (?,?,?,?,?,?,?,?,?)",
                    (pid, rev_id, doc["doc_id"], p["pdf_page"], p["printed_page"], p["section_no"],
                     p["section_title"], p["anchor"], p["text"]))
        section = " ".join(x for x in (p["section_no"], p["section_title"]) if x)
        con.execute("INSERT INTO passages_fts (pid, section, body) VALUES (?,?,?)", (pid, section, p["text"]))
    return rev_id, "new"


def _refresh_currency(con, doc_id: str) -> list[dict]:
    """Mark the newest revision current and older ones superseded; diff when the current one changes."""
    revs = [dict(r) for r in con.execute("SELECT * FROM revisions WHERE doc_id = ? ORDER BY rev_id", (doc_id,))]
    if not revs:
        return []
    newest = max(revs, key=lambda r: (_version_key(r["revision"]) if not r["revision"].startswith("snapshot")
                                      else (), r["ingested_at"], r["rev_id"]))
    previous = [r for r in revs if r["status"] == "current" and r["rev_id"] != newest["rev_id"]]
    con.execute("UPDATE revisions SET status = CASE WHEN rev_id = ? THEN 'current' ELSE 'superseded' END "
                "WHERE doc_id = ?", (newest["rev_id"], doc_id))
    changes = []
    for old in previous:
        changes.append(_diff_revisions(con, old, newest))
    return changes


def _diff_revisions(con, old: dict, new: dict) -> dict:
    def page_map(rev_id):
        return {r["pdf_page"] or 0: r["text"] for r in con.execute(
            "SELECT pdf_page, text FROM pages WHERE rev_id = ?", (rev_id,))}

    def passages_for(rev_id):
        rows = con.execute("SELECT pid, pdf_page, printed_page, section_no, section_title, text FROM passages "
                           "WHERE rev_id = ?", (rev_id,))
        return [dict(r) for r in rows]

    old_pages, new_pages = page_map(old["rev_id"]), page_map(new["rev_id"])
    changed = []
    if old_pages or new_pages:
        for page in sorted(set(old_pages) | set(new_pages)):
            a, b = old_pages.get(page, ""), new_pages.get(page, "")
            if a == b:
                continue
            diff = [l for l in difflib.unified_diff(a.split("\n"), b.split("\n"), lineterm="", n=0)
                    if l[:1] in "+-" and not l.startswith(("+++", "---"))]
            changed.append({"pdf_page": page, "removed": [l[1:] for l in diff if l[0] == "-"],
                            "added": [l[1:] for l in diff if l[0] == "+"]})
    else:                                                          # web snapshots: compare passage texts
        a = {p["section_title"]: p["text"] for p in passages_for(old["rev_id"])}
        b = {p["section_title"]: p["text"] for p in passages_for(new["rev_id"])}
        for sec in sorted(set(a) | set(b), key=str):
            if a.get(sec) != b.get(sec):
                changed.append({"section": sec, "removed": (a.get(sec) or "").split("\n"),
                                "added": (b.get(sec) or "").split("\n")})

    new_passages = passages_for(new["rev_id"])
    old_passages = passages_for(old["rev_id"])
    for c in changed:
        if "pdf_page" in c:
            c["new_pids"] = [p["pid"] for p in new_passages if p["pdf_page"] == c["pdf_page"]
                             and any(l and l in p["text"] for l in c["added"])]
            c["old_pids"] = [p["pid"] for p in old_passages if p["pdf_page"] == c["pdf_page"]
                             and any(l and l in p["text"] for l in c["removed"])]
            sec = next((p for p in new_passages if p["pid"] in c["new_pids"]), None)
            c["section"] = " ".join(x for x in (sec["section_no"], sec["section_title"]) if x) if sec else None
            c["printed_page"] = sec["printed_page"] if sec else None
    numeric = any(re.search(r"\d", " ".join(c["added"] + c["removed"])) for c in changed)
    summary = (f"{old['doc_id']} revision {new['revision']} supersedes {old['revision']}: "
               f"{len(changed)} changed page(s)/section(s); numeric values changed: {'yes' if numeric else 'no'}.")
    details = {"doc_id": old["doc_id"], "old_revision": old["revision"], "new_revision": new["revision"],
               "new_is_simulated": bool(new["simulated"]), "changes": changed}
    return {"summary": summary, "details": details, "numeric": numeric,
            "fingerprint": f"revision:{old['doc_id']}:{old['text_sha256'][:12]}->{new['text_sha256'][:12]}"}


def ingest(con, refresh: bool = False, offline: bool = False, log=print) -> dict:
    manifest = load_manifest()
    run = con.execute("INSERT INTO ingest_runs (started_at) VALUES (?)", (now(),)).lastrowid
    report = {"documents": [], "revision_changes": [], "checks": {}}
    for doc in manifest["documents"]:
        _upsert_document(con, doc, manifest["module"])
        for rev in doc["revisions"]:
            acq = acquire(rev, refresh=refresh, offline=offline)
            meta = dict(rev, file_sha256=acq["sha256"], acquired_via=acq["how"],
                        notes=" ".join(x for x in (rev.get("access_note"), acq["note"]) if x))
            if rev["format"] == "pdf":
                pages, offset = extract_pdf_pages(acq["path"])
                passages = pdf_passages(pages)
                meta["label_offset"] = offset
            else:
                pages, passages = [], html_passages(acq["path"], doc.get("html_stop_headings", ("Featured Videos",)))
            rev_id, state = _store_revision(con, doc, meta, pages, passages)
            entry = {"doc_id": doc["doc_id"], "revision": meta["revision"], "state": state, "acquired_via": acq["how"],
                     "pages": len(pages), "passages": len(passages)}
            report["documents"].append(entry)
            log(f"  {doc['code']:<4} {str(meta['revision'] or ''):<28} {state:<9} {len(passages):>4} passages  ({acq['how']})")
        for change in _refresh_currency(con, doc["doc_id"]):
            _record_change(con, change)
            report["revision_changes"].append(change["summary"])
    report["checks"] = checks.run_all(con)
    con.execute("UPDATE ingest_runs SET finished_at = ?, report = ? WHERE run_id = ?",
                (now(), json.dumps(report), run))
    con.commit()
    return report


def _record_change(con, change: dict):
    upsert_review(con, "revision_change", "high" if change["numeric"] else "medium",
                  change["details"]["doc_id"], change["summary"], change["details"], change["fingerprint"])


def apply_simulated_revision(con, spec_path: Path, log=print) -> dict:
    """Create a clearly labelled simulated revision from a stored base revision plus text edits."""
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    base = con.execute("SELECT * FROM revisions WHERE doc_id = ? AND revision = ?",
                       (spec["doc_id"], spec["base_revision"])).fetchone()
    if not base:
        raise RuntimeError(f"Base revision {spec['base_revision']} of {spec['doc_id']} is not ingested yet.")
    pages = [dict(r) for r in con.execute("SELECT pdf_page, printed_page, kind, text FROM pages WHERE rev_id = ? "
                                          "ORDER BY pdf_page", (base["rev_id"],))]
    for edit in spec["edits"]:
        page = next(p for p in pages if p["pdf_page"] == edit["pdf_page"])
        if edit["find"] not in page["text"]:
            raise RuntimeError(f"Simulated edit text not found on PDF page {edit['pdf_page']}: {edit['find']!r}")
        page["text"] = page["text"].replace(edit["find"], edit["replace"], 1)
    doc = dict(con.execute("SELECT * FROM documents WHERE doc_id = ?", (spec["doc_id"],)).fetchone())
    meta = {"revision": spec["revision"], "revision_label": spec["revision_label"], "revision_date": spec["revision_date"],
            "date_source": "Simulated revision (not published by Cavli)",
            "url": f"simulated:sources/simulated/{spec_path.name}", "host": f"local simulation based on {base['url']}",
            "format": "pdf", "file_sha256": None, "acquired_via": f"simulated from {spec['base_revision']} + "
            f"{len(spec['edits'])} edit(s) in {spec_path.name}", "simulated": True, "label_offset": base["label_offset"],
            "notes": spec["purpose"]}
    rev_id, state = _store_revision(con, doc, meta, pages, pdf_passages(pages))
    log(f"  {doc['code']:<4} {spec['revision']:<28} {state:<9} (SIMULATED)")
    changes = _refresh_currency(con, spec["doc_id"])
    for change in changes:
        _record_change(con, change)
    result = {"state": state, "revision_changes": [c["summary"] for c in changes], "checks": checks.run_all(con)}
    con.commit()
    return result
