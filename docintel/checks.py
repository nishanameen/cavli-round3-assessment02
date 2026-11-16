"""Post-ingest consistency checks. Findings go to the expert review queue; nothing is auto-corrected."""
import hashlib
import re

from .store import upsert_review

VARIANTS = {"E.A.J": "EAJ", "N.A": "NA", "A.N": "AN", "L.A": "LA", "W.W": "WW", "E.A": "EA", "E.U": "EU",
            "I.N": "IN", "EAJ": "EAJ", "NA": "NA", "AN": "AN", "LA": "LA", "WW": "WW", "EA": "EA", "EU": "EU",
            "IN": "IN"}
_DOTTED = r"E\.A\.J|N\.A|A\.N|L\.A|W\.W|E\.A|E\.U|I\.N"
_PLAIN = r"EAJ|EU|NA|AN|LA|IN|WW|EA"
_TABLE = re.compile(rf"(?<![A-Za-z.])({_DOTTED})\s*:\s*-?\s*((?:\d{{1,2}}\s*/\s*)+\d{{1,2}}/?)")
_INLINE = re.compile(rf"((?:\d{{1,2}}\s*/\s*)+\d{{1,2}})\s*\(({_DOTTED})\)")
_WEB = re.compile(rf"(?<![A-Za-z])({_PLAIN})\s*:\s*((?:\d{{1,2}}\s*/\s*)+\d{{1,2}}/?)")
_AT = re.compile(r"\bAT[+$^&][A-Z][A-Z0-9]+")


def current_passages(con, doc_types=None):
    sql = ("SELECT p.*, d.code, d.title, d.doc_type, r.revision, r.simulated FROM passages p "
           "JOIN revisions r ON r.rev_id = p.rev_id JOIN documents d ON d.doc_id = p.doc_id "
           "WHERE r.status = 'current'")
    rows = [dict(r) for r in con.execute(sql)]
    return [r for r in rows if not doc_types or r["doc_type"] in doc_types]


def band_claims(passages) -> list[dict]:
    claims = []
    for p in passages:
        flat = re.sub(r"\s+", " ", p["text"])
        patterns = [_WEB] if p["doc_type"] == "product_page" else [_TABLE, _INLINE]
        for pat in patterns:
            for m in pat.finditer(flat):
                variant, bands = (m.group(1), m.group(2)) if pat is not _INLINE else (m.group(2), m.group(1))
                numbers = sorted({int(b) for b in re.findall(r"\d+", bands) if 1 <= int(b) <= 71})
                if len(numbers) >= 3:
                    claims.append({"variant": VARIANTS[variant], "bands": numbers, "pid": p["pid"],
                                   "doc_id": p["doc_id"], "title": p["title"], "revision": p["revision"],
                                   "printed_page": p["printed_page"], "section": p["section_title"],
                                   "excerpt": m.group(0)[:160]})
    return claims


def check_band_lists(con) -> list[str]:
    claims = band_claims(current_passages(con))
    by_variant: dict[str, list] = {}
    for c in claims:
        by_variant.setdefault(c["variant"], []).append(c)
    found = []
    for variant, items in sorted(by_variant.items()):
        distinct = {tuple(c["bands"]) for c in items}
        if len(distinct) < 2:
            continue
        union = sorted(set().union(*map(set, distinct)))
        disputed = [b for b in union if not all(b in s for s in distinct)]
        sources = sorted({c["doc_id"] for c in items})
        scope = "cross-source" if len(sources) > 1 else "within-document"
        summary = (f"{variant} variant LTE band list differs ({scope}); disputed bands: "
                   f"{', '.join(map(str, disputed))}. Do not treat any disputed band as confirmed.")
        details = {"variant": variant, "disputed_bands": disputed, "claims": items}
        fp = "bands:" + variant + ":" + hashlib.sha1(repr(sorted(distinct)).encode()).hexdigest()[:12]
        upsert_review(con, "conflict", "high", f"bands:{variant}", summary, details, fp)
        found.append(fp)
    return found


def check_at_references(con) -> list[str]:
    at_text = " ".join(p["text"] for p in current_passages(con, {"at_command_manual"}))
    if not at_text:
        return []
    documented = set(_AT.findall(at_text))
    found = []
    for p in current_passages(con):
        if p["doc_type"] == "at_command_manual":
            continue
        for cmd in sorted(set(_AT.findall(p["text"]))):
            if cmd in documented:
                continue
            summary = (f"{cmd} is referenced in {p['title']} (rev {p['revision']}, page {p['printed_page']}) "
                       f"but is not documented in the current AT Command Manual.")
            details = {"command": cmd, "referencing_pid": p["pid"], "section": p["section_title"]}
            fp = f"atref:{cmd}:{p['doc_id']}"
            upsert_review(con, "cross_reference_gap", "medium", f"at:{cmd}", summary, details, fp)
            found.append(fp)
    return found


def check_stale_references(con) -> list[str]:
    """A document that cites another without a revision and predates that document's current revision."""
    docs = {r["doc_id"]: dict(r) for r in con.execute(
        "SELECT d.doc_id, d.title, d.doc_type, r.revision, r.revision_date FROM documents d "
        "JOIN revisions r ON r.doc_id = d.doc_id AND r.status = 'current'")}
    found = []
    for p in current_passages(con):
        if not (p["section_title"] or "").lower().startswith("reference"):
            continue
        for other in docs.values():
            if other["doc_id"] == p["doc_id"] or not other["revision_date"]:
                continue
            label = other["doc_type"].replace("_", " ").replace("manual", "Manual").replace("hardware", "Hardware")
            if label.lower() not in p["text"].lower():
                continue
            src = docs[p["doc_id"]]
            if src["revision_date"] and src["revision_date"] < other["revision_date"]:
                summary = (f"{src['title']} {src['revision']} ({src['revision_date']}) is based on an unversioned "
                           f"'{label}' but the current {other['title']} is {other['revision']} "
                           f"({other['revision_date']}). Module statements in it may be outdated.")
                fp = f"stale:{p['doc_id']}:{other['doc_id']}:{other['revision']}"
                upsert_review(con, "outdated_reference", "low", f"stale:{p['doc_id']}", summary,
                              {"referencing_pid": p["pid"], "referenced": other["doc_id"]}, fp)
                found.append(fp)
    return found


def run_all(con) -> dict:
    results = {"band_conflicts": check_band_lists(con), "at_reference_gaps": check_at_references(con),
               "stale_references": check_stale_references(con)}
    live = {fp for fps in results.values() for fp in fps}
    for row in con.execute("SELECT id, fingerprint FROM review_queue WHERE status = 'open' AND kind != 'revision_change'"):
        if row["fingerprint"] not in live:
            con.execute("UPDATE review_queue SET status = 'auto-closed' WHERE id = ?", (row["id"],))
    return {k: len(v) for k, v in results.items()}
