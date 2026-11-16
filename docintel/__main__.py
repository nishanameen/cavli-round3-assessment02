"""CLI: python -m docintel <command>. Run with no arguments for help."""
import argparse
import json
import sys
import textwrap
from pathlib import Path

from .config import DEFAULT_DB, SIMULATED, load_env
from .store import connect, now

STATUS_LABEL = {
    "answered": "ANSWERED", "answered_with_flags": "ANSWERED - see review flags", "ambiguous": "AMBIGUOUS - clarify",
    "conflict": "CONFLICTING EVIDENCE - expert review", "not_verified": "NOT VERIFIED IN AVAILABLE SOURCES",
}


def _wrap(text, indent="  "):
    return textwrap.fill(text or "", width=100, initial_indent=indent, subsequent_indent=indent)


def print_answer(res: dict):
    print(f"\nQ: {res['question']}")
    print(f"[{STATUS_LABEL.get(res['status'], res['status'])}]  mode={res['mode']}  {res['elapsed_ms']} ms")
    print(_wrap(res["answer"]))
    if res.get("clarification"):
        print(_wrap("Clarify: " + res["clarification"]))
    for w in res.get("warnings", []):
        print(f"  ! {w}")
    if res["citations"]:
        print("Citations:")
        for c in res["citations"]:
            sim = " [SIMULATED]" if c["simulated"] else ""
            print(f"  [{c['pid']}] {c['document']}, rev {c['revision']}{sim} ({c['revision_status']}), "
                  f"{c['location']}{', ' + c['section'] if c['section'] else ''}")
            print(f"      {c['url']}")
            print(_wrap('"' + c["quote"] + '"', "      "))
    if res.get("related_context"):
        print("Related context (not an answer):")
        for c in res["related_context"]:
            print(f"  [{c['pid']}] {c['document']} rev {c['revision']}, {c['location']}, {c['section']}")
    for f in res.get("review_flags", []):
        print(_wrap(f"Review #{f['review_id']} ({f['kind']}, {f['severity']}): {f['summary']}", "  ~ "))
    print("Retrieved:", ", ".join(f"{r['pid']}({r['score']})" for r in res["retrieved"]))


def cmd_ingest(con, args):
    from .ingest import ingest
    print("Ingesting sources from sources/manifest.json")
    rep = ingest(con, refresh=args.refresh, offline=args.offline)
    for line in rep["revision_changes"]:
        print("  revision:", line)
    print("Checks:", json.dumps(rep["checks"]))


def cmd_simulate(con, args):
    from .ingest import apply_simulated_revision
    print(f"Applying SIMULATED revision {args.spec.name}")
    rep = apply_simulated_revision(con, args.spec)
    for line in rep["revision_changes"]:
        print("  revision:", line)


def cmd_ask(con, args):
    from .answer import answer
    res = answer(con, args.question, use_llm=not args.extractive, include_superseded=args.all_revisions)
    print(json.dumps(res, indent=2, ensure_ascii=False)) if args.json else print_answer(res)


def cmd_sources(con, args):
    rows = con.execute("SELECT d.code, d.title, d.doc_type, r.revision, r.revision_date, r.status, r.simulated, "
                       "r.page_count, r.label_offset, r.file_sha256, r.text_sha256, r.acquired_via, r.url, "
                       "(SELECT count(*) FROM passages p WHERE p.rev_id = r.rev_id) AS passages "
                       "FROM revisions r JOIN documents d ON d.doc_id = r.doc_id ORDER BY d.code, r.rev_id")
    for r in rows:
        sim = " SIMULATED" if r["simulated"] else ""
        print(f"{r['code']:<4} rev {r['revision']:<28}{sim} {r['status']:<10} date={r['revision_date'] or 'not stated':<11} "
              f"pages={r['page_count'] or '-':<4} passages={r['passages']:<4} via={r['acquired_via']}")
        print(f"     {r['title']} ({r['doc_type']})  {r['url']}")


def cmd_review(con, args):
    if args.resolve:
        con.execute("UPDATE review_queue SET status = 'resolved', resolution = ?, updated_at = ? WHERE id = ?",
                    (args.note or "resolved by expert", now(), args.resolve))
        con.commit()
        print(f"Review item #{args.resolve} marked resolved.")
        return
    where = "" if args.all else "WHERE status = 'open'"
    for r in con.execute(f"SELECT * FROM review_queue {where} ORDER BY id"):
        print(f"#{r['id']} [{r['status']}] {r['kind']} ({r['severity']}) {r['topic']}")
        print(_wrap(r["summary"]))
        if args.details:
            print(textwrap.indent(json.dumps(json.loads(r["details"]), indent=2, ensure_ascii=False), "    "))


def cmd_inventory(con, args):
    """Write outputs/source-inventory.json: manifest metadata, indexed revisions and sample passages."""
    from .config import OUTPUTS
    from .ingest import load_manifest
    manifest = load_manifest()
    revisions = [dict(r) for r in con.execute(
        "SELECT r.doc_id, r.revision, r.revision_label, r.revision_date, r.date_source, r.url, r.host, r.format, "
        "r.file_sha256, r.text_sha256, r.acquired_via, r.retrieved_at, r.status, r.simulated, r.page_count, "
        "r.label_offset, (SELECT count(*) FROM passages p WHERE p.rev_id = r.rev_id) AS passages "
        "FROM revisions r ORDER BY r.doc_id, r.rev_id")]
    # Representative passages: section-numbered table, offset page labels (EVK), AT command, web anchor.
    samples = [dict(r) for r in con.execute(
        "SELECT p.pid, p.doc_id, r.revision, p.pdf_page, p.printed_page, p.section_no, p.section_title, p.anchor, "
        "substr(p.text, 1, 240) AS text_excerpt FROM passages p JOIN revisions r ON r.rev_id = p.rev_id "
        "WHERE r.status = 'current' AND (p.pid IN ('HW-v5.3-p031-2', 'HW-v5.3-p020-2', 'EVK-v1.1-p012-1', "
        "'AT-v3.1-p193-2') OR p.section_title = 'Technical Data > Cellular Bands Supported') ORDER BY p.doc_id")]
    out = {"module": manifest["module"], "verified_on": manifest["verified_on"], "documents": manifest["documents"],
           "candidates_not_ingested": manifest["candidates_not_ingested"], "indexed_revisions": revisions,
           "passage_metadata_sample": samples,
           "review_queue": [dict(r, details=json.loads(r["details"])) for r in con.execute(
               "SELECT id, kind, severity, topic, summary, details, status FROM review_queue ORDER BY id")]}
    OUTPUTS.mkdir(exist_ok=True)
    (OUTPUTS / "source-inventory.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote outputs/source-inventory.json ({len(revisions)} revisions, {len(samples)} sample passages)")


def cmd_publish(con, args):
    from .publish import publish
    con.close()
    publish(args.db)


def cmd_eval(con, args):
    from .evaluate import run
    run(args.db, use_llm=not args.extractive, cases_file=args.cases, hosted=args.hosted, retrieval=args.retrieval,
        gate=args.gate)


def main(argv=None):
    load_env()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="python -m docintel", description=__doc__)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite index path (default cache/index.sqlite)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("ingest", help="acquire, verify, extract and index all manifest sources (idempotent)")
    p.add_argument("--refresh", action="store_true", help="re-fetch the live product page")
    p.add_argument("--offline", action="store_true", help="use cached/inbox files only")
    p = sub.add_parser("simulate-revision", help="ingest a clearly labelled simulated revision")
    p.add_argument("--spec", type=Path, default=SIMULATED / "c16qs-hardware-manual-5.4-SIMULATED.json")
    p = sub.add_parser("ask", help="answer a question with citations")
    p.add_argument("question")
    p.add_argument("--extractive", action="store_true", help="do not call the model")
    p.add_argument("--all-revisions", action="store_true", help="also retrieve superseded revisions (audit)")
    p.add_argument("--json", action="store_true")
    sub.add_parser("sources", help="source inventory with revision status")
    sub.add_parser("inventory", help="write outputs/source-inventory.json (metadata sample)")
    sub.add_parser("publish", help="push the verified index (main + simulated view) to the hosted Supabase schema")
    p = sub.add_parser("review", help="expert review queue")
    p.add_argument("--all", action="store_true")
    p.add_argument("--details", action="store_true")
    p.add_argument("--resolve", type=int, metavar="ID")
    p.add_argument("--note")
    p = sub.add_parser("eval", help="run the evaluation set and write outputs/")
    p.add_argument("--extractive", action="store_true")
    p.add_argument("--cases", default="cases.json", help="case file inside eval/ (cases.json or holdout.json)")
    p.add_argument("--hosted", metavar="URL", help="ask the deployed Worker instead of the local engine")
    p.add_argument("--retrieval", choices=["hybrid", "keyword", "hybrid-gte"], default="hybrid",
                   help="hosted retrieval mode (A/B): hybrid = keyword + Gemini vectors")
    p.add_argument("--gate", choices=["coverage", "model"], default="coverage",
                   help="answerability decision: word-overlap pre-filter, or let the model judge")
    args = ap.parse_args(argv)
    con = connect(args.db)
    {"ingest": cmd_ingest, "simulate-revision": cmd_simulate, "ask": cmd_ask, "sources": cmd_sources,
     "review": cmd_review, "eval": cmd_eval, "inventory": cmd_inventory, "publish": cmd_publish}[args.cmd](con, args)


if __name__ == "__main__":
    main()
