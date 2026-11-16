"""Run eval/cases.json against the index and record observed results.

Citation validity is checked independently of the index: each cited PDF page is re-extracted from the
hash-verified source file and the quoted text and printed page label must match.
"""
import json
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from .answer import answer
from .config import EVAL, OUTPUTS, RAW, SIMULATED
from .extract import extract_pdf_pages, html_passages
from .ingest import apply_simulated_revision, load_manifest
from .store import connect

_SOURCE_CACHE: dict = {}


def _norm(text: str) -> str:
    text = text.replace("\u2013", "-").replace("\u2212", "-").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


def _source_pages(doc_id: str):
    """Fresh extraction from the hash-verified cached file (independent of the SQLite index)."""
    if doc_id in _SOURCE_CACHE:
        return _SOURCE_CACHE[doc_id]
    doc = next(d for d in load_manifest()["documents"] if d["doc_id"] == doc_id)
    rev = doc["revisions"][-1]
    path = RAW / rev["cache_file"]
    if rev["format"] == "pdf":
        pages, _ = extract_pdf_pages(path)
        data = {"kind": "pdf", "pages": {p["pdf_page"]: p for p in pages}}
    else:
        data = {"kind": "html", "text": _norm(" ".join(p["text"] for p in html_passages(path)))}
    _SOURCE_CACHE[doc_id] = data
    return data


def check_citation(con, c: dict) -> dict:
    row = con.execute("SELECT p.*, r.simulated, r.revision FROM passages p JOIN revisions r ON r.rev_id = p.rev_id "
                      "WHERE p.pid = ?", (c["pid"],)).fetchone()
    if not row:
        return {"valid": False, "reason": "passage id not in index"}
    quote = _norm(c["quote"].replace(" ...", ""))
    probe = quote[:80]
    src = _source_pages(row["doc_id"])
    if row["simulated"]:
        stored = con.execute("SELECT text FROM pages WHERE rev_id = ? AND pdf_page = ?",
                             (row["rev_id"], row["pdf_page"])).fetchone()
        ok = stored and probe in _norm(stored["text"])
        return {"valid": bool(ok), "reason": "simulated revision: quote matches the simulated page text, not a real PDF"
                if ok else "quote not found in simulated page"}
    if src["kind"] == "pdf":
        page = src["pages"].get(row["pdf_page"])
        if not page:
            return {"valid": False, "reason": f"PDF page {row['pdf_page']} does not exist"}
        if probe not in _norm(page["text"]):
            return {"valid": False, "reason": f"quote not found on PDF page {row['pdf_page']}"}
        if (page["printed_page"] or None) != (row["printed_page"] or None):
            return {"valid": False, "reason": "printed page label mismatch"}
        return {"valid": True, "reason": f"quote found on PDF page {row['pdf_page']} (printed {page['printed_page']})"}
    return ({"valid": True, "reason": "quote found in re-extracted product page"} if probe in src["text"]
            else {"valid": False, "reason": "quote not found in product page"})


def _matches_source(item: dict, expected: list[dict]) -> bool:
    for e in expected:
        if item.get("doc_id") != e["doc_id"]:
            continue
        if e.get("revision") and item.get("revision") != e["revision"]:
            continue
        if "pages" not in e and "sections" not in e:          # any location in that document is acceptable
            return True
        if "pages" in e and str(item.get("page")) in e["pages"]:
            return True
        if "sections" in e and any(s in (item.get("section") or "") for s in e["sections"]):
            return True
    return False


def _contains(answer_text: str, alt: str) -> bool:
    if alt.isupper() and len(alt) <= 4:
        return re.search(rf"\b{re.escape(alt)}\b", answer_text) is not None
    return _norm(alt) in _norm(answer_text)


def score(case: dict, res: dict, con) -> dict:
    pid_doc = {r["pid"]: r for r in (dict(x) for x in con.execute(
        "SELECT p.pid, p.doc_id, p.printed_page AS page, p.section_title AS section, r.revision "
        "FROM passages p JOIN revisions r ON r.rev_id = p.rev_id"))}
    cited = [pid_doc[c["pid"]] for c in res["citations"] if c["pid"] in pid_doc]
    shown = [pid_doc[r["pid"]] for r in res["retrieved"] if r["pid"] in pid_doc]
    related = [pid_doc[c["pid"]] for c in res.get("related_context", []) if c["pid"] in pid_doc]
    answer_sources = [e for e in case["expected_sources"] if e.get("as") != "related"]
    related_sources = [e for e in case["expected_sources"] if e.get("as") == "related"]

    validity = [dict(pid=c["pid"], **check_citation(con, c)) for c in res["citations"] + res.get("related_context", [])]
    status_ok = res["status"] in case["expected_status"]
    retrieval_hit = (not case["expected_sources"]) or any(
        _matches_source(x, case["expected_sources"]) for x in shown + related)
    source_ok = (any(_matches_source(x, answer_sources) for x in cited) if answer_sources else not cited)
    if related_sources:
        source_ok = source_ok and any(_matches_source(x, related_sources) for x in related)
    facts_missing = [g for g in case.get("must_include", []) if not any(_contains(res["answer"], a) for a in g)]
    flag_kinds = {f["kind"] for f in res["review_flags"]}
    flags_missing = [k for k in case.get("expected_flags", []) if k not in flag_kinds]
    all_valid = all(v["valid"] for v in validity)

    exp = case["expected_status"][0]
    if not status_ok:
        if exp == "not_verified":
            category = "unsupported_answer"
        elif res["status"] == "not_verified":
            category = "retrieval_miss" if not retrieval_hit else "over_refusal"
        elif exp == "ambiguous":
            category = "missed_ambiguity"
        elif exp == "conflict":
            category = "missed_conflict"
        else:
            category = f"wrong_status ({res['status']})"
    elif not all_valid:
        category = "citation_invalid"
    elif not source_ok:
        category = "wrong_source" if retrieval_hit else "retrieval_miss"
    elif facts_missing:
        category = "incomplete_answer"
    elif flags_missing:
        category = "missing_flag"
    else:
        category = "none"
    return {
        "status_ok": status_ok, "retrieval_hit": retrieval_hit, "expected_source_cited": source_ok,
        "citations_valid": all_valid if validity else None, "citation_checks": validity,
        "facts_missing": facts_missing, "flags_missing": flags_missing,
        "passed": category == "none", "failure_category": category,
    }


def _loc(c: dict) -> str:
    short = {"Cavli C16QS LTE CAT1.bis Module Hardware Manual": "HW", "Cavli C16QS EVK User Manual (Connection Manual)":
             "EVK", "Cavli C16QS LTE Cat 1.bis AT Command Manual": "AT",
             "Cavli C16QS LTE Cat 1bis IoT Module product page": "Web"}.get(c["document"], c["document"])
    where = c["location"].replace("web page (no page numbers)", c["section"] or "")
    return f"{short} {c['revision']} {where}".replace("snapshot-", "")


def hosted_answer(base: str, question: str, view: str, retrieval: str = "hybrid", gate: str = "coverage") -> dict:
    """Ask the deployed (or `wrangler dev`) Worker. Reviewer credentials come from REVIEWER_PASSWORD in .env."""
    import base64
    import os
    import urllib.request
    headers = {"Content-Type": "application/json", "User-Agent": "cavli-docintel-eval/1.0"}  # Cloudflare blocks the urllib default
    if os.environ.get("REVIEWER_PASSWORD") and not base.startswith("http://localhost"):
        token = base64.b64encode(f"reviewer:{os.environ['REVIEWER_PASSWORD']}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    req = urllib.request.Request(base.rstrip("/") + "/api/ask", method="POST", headers=headers,
                                 data=json.dumps({"question": question, "view": view, "retrieval": retrieval,
                                                  "gate": gate}).encode("utf-8"))
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=90) as resp:
        res = json.loads(resp.read().decode("utf-8"))
    res["client_ms"] = round((time.perf_counter() - started) * 1000)
    return res


def run(db_path: Path, use_llm: bool = True, cases_file: str = "cases.json", hosted: str | None = None,
        retrieval: str = "hybrid", gate: str = "coverage") -> dict:
    cases = json.loads((EVAL / cases_file).read_text(encoding="utf-8"))["cases"]
    con = connect(db_path)
    rev_db = db_path.with_name("eval-revision.sqlite")
    shutil.copyfile(db_path, rev_db)
    rev_con = connect(rev_db)
    apply_simulated_revision(rev_con, SIMULATED / "c16qs-hardware-manual-5.4-SIMULATED.json", log=lambda *_: None)
    records = []
    for case in cases:
        c = rev_con if case.get("setup") == "simulated_revision" else con
        if hosted:
            res = hosted_answer(hosted, case["question"], "sim" if case.get("setup") == "simulated_revision" else "main",
                                retrieval, gate)
        else:
            res = answer(c, case["question"], use_llm=use_llm)
        s = score(case, res, c)
        records.append({"case": case, "result": res, "score": s})
        print(f"{case['id']} {case['category']:<12} {res['status']:<20} {'PASS' if s['passed'] else 'FAIL'} "
              f"{s['failure_category']:<18} {res['elapsed_ms']:>6} ms  {res['mode']}")
        if use_llm:
            time.sleep(1)                                   # stay well inside free-tier rate limits
    summary = {
        "run_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "mode": (f"hosted Worker {hosted}, {retrieval} retrieval, {gate} gate" if hosted else
                 "gemini + validator (extractive fallback)" if use_llm else "extractive only"),
        "case_file": f"eval/{cases_file}",
        "cases": len(records), "passed": sum(r["score"]["passed"] for r in records),
        "citations_checked": sum(len(r["score"]["citation_checks"]) for r in records),
        "citations_valid": sum(v["valid"] for r in records for v in r["score"]["citation_checks"]),
        "by_category": {},
    }
    for r in records:
        cat = r["case"]["category"]
        b = summary["by_category"].setdefault(cat, {"cases": 0, "passed": 0})
        b["cases"] += 1
        b["passed"] += r["score"]["passed"]
    suffix = (("" if cases_file == "cases.json" else "-" + Path(cases_file).stem) + ("" if use_llm else "-extractive")
              + ("" if not hosted else "-local-worker" if "localhost" in hosted else "-hosted")
              + ({"keyword": "-keyword", "hybrid-gte": "-gte", "hybrid": "-gemini"}.get(retrieval, "") if hosted else "")
              + ("-judge" if hosted and gate == "model" else ""))
    OUTPUTS.mkdir(exist_ok=True)
    (OUTPUTS / f"eval-results{suffix}.json").write_text(
        json.dumps({"summary": summary, "records": records}, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(summary, records, OUTPUTS / f"EVALUATION{suffix}.md")
    print(f"\n{summary['passed']}/{summary['cases']} passed; {summary['citations_valid']}/{summary['citations_checked']} "
          f"citations valid. Wrote outputs/eval-results{suffix}.json and outputs/EVALUATION{suffix}.md")
    return summary


def rescore(results_file: Path, db_path: Path) -> dict:
    """Re-apply score() to stored results (no new questions asked), e.g. after a scorer fix."""
    data = json.loads(results_file.read_text(encoding="utf-8"))
    con, rev_con = connect(db_path), connect(db_path.with_name("eval-revision.sqlite"))
    for r in data["records"]:
        r["score"] = score(r["case"], r["result"], rev_con if r["case"].get("setup") == "simulated_revision" else con)
    s = data["summary"]
    s["passed"] = sum(r["score"]["passed"] for r in data["records"])
    s["citations_checked"] = sum(len(r["score"]["citation_checks"]) for r in data["records"])
    s["citations_valid"] = sum(v["valid"] for r in data["records"] for v in r["score"]["citation_checks"])
    for b in s["by_category"].values():
        b["passed"] = 0
    for r in data["records"]:
        s["by_category"][r["case"]["category"]]["passed"] += r["score"]["passed"]
    s["rescored_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    results_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    md = results_file.with_name(results_file.name.replace("eval-results", "EVALUATION").replace(".json", ".md"))
    write_markdown(s, data["records"], md)
    return s


def write_markdown(summary: dict, records: list, path: Path):
    def cell(x):
        return str(x).replace("|", "\\|").replace("\n", " ")

    lines = [f"# Evaluation results: {summary['case_file']} ({summary['mode']})", "",
             f"Run at {summary['run_at']} UTC. {summary['passed']}/{summary['cases']} cases passed. "
             f"{summary['citations_valid']}/{summary['citations_checked']} citations (including related-context "
             "citations) were verified by re-extracting the cited page from the source file.", "",
             "| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | "
             "Citation validity | Result | Failure category | Time |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in records:
        case, res, s = r["case"], r["result"], r["score"]
        exp_src = "; ".join(
            f"{e['doc_id'].replace('c16qs-', '')} " + (f"p. {'/'.join(e['pages'])}" if "pages" in e else
                                                       "/".join(e.get("sections", []))) + (" (related)" if e.get("as") else "")
            for e in case["expected_sources"]) or "none (no source should support an answer)"
        cites = "; ".join(_loc(c) for c in res["citations"]) or "none"
        if res.get("related_context"):
            cites += " | related: " + "; ".join(_loc(c) for c in res["related_context"])
        valid = ("n/a" if s["citations_valid"] is None else
                 f"{sum(v['valid'] for v in s['citation_checks'])}/{len(s['citation_checks'])} valid")
        lines.append("| " + " | ".join(cell(x) for x in [
            case["id"], case["category"], case["question"], case["expected_behavior"], exp_src, res["status"], cites,
            valid, "PASS" if s["passed"] else "FAIL", s["failure_category"], f"{res['elapsed_ms']} ms"]) + " |")
    lines += ["", "## Observed answers", ""]
    for r in records:
        case, res, s = r["case"], r["result"], r["score"]
        lines += [f"### {case['id']} - {case['question']}", "",
                  f"Status: **{res['status']}** - mode `{res['mode']}` - {res['elapsed_ms']} ms", "",
                  "> " + cell(res["answer"])]
        if res.get("clarification"):
            lines += [">", "> Clarifying question: " + cell(res["clarification"])]
        lines.append("")
        for w in res.get("warnings", []):
            lines.append(f"- Warning: {cell(w)}")
        for f in res.get("review_flags", []):
            lines.append(f"- Review #{f['review_id']} ({f['kind']}): {cell(f['summary'])}")
        for v in s["citation_checks"]:
            lines.append(f"- Citation `{v['pid']}`: {'valid' if v['valid'] else 'INVALID'} ({v['reason']})")
        if res.get("note"):
            lines.append(f"- Generation note: {cell(res['note'])}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
