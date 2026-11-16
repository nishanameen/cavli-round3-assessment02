"""Question answering with citations, scope/ambiguity handling, guardrails and review-queue flags."""
import json
import re
import time

from . import llm
from .checks import band_claims, current_passages
from .retrieve import analyze, coverage, retrieve

NOT_VERIFIED = "Not verified in the available C16QS sources."

# Questions that need information the documentation cannot provide; related passages are shown as context only.
GUARDRAILS = [
    {
        "id": "battery_life",
        "match": re.compile(r"battery (life|last)|how long .*battery|battery .*(last|life|days|months|years)", re.I),
        "unless": re.compile(r"duty cycle|every \d+|per (hour|day)|mah|\bmA\b.*\bs\b", re.I),
        "reason": ("None of the sources states a battery life. It depends on the device's duty cycle, network "
                   "conditions and battery capacity, none of which is given. The hardware manual lists current "
                   "per operating mode, which an engineer could use with a measured usage profile."),
        "related": "power consumption current sleep hibernate idle mode",
        "escalate": "Share the intended duty cycle and battery capacity with Cavli support for a power estimate.",
    },
    {
        "id": "custom_certification",
        "match": re.compile(r"(certif|approv|fcc|ce mark|ptcrb|compliance).*(custom|my|own|our|third.party)|"
                            r"(custom|my|own|our|third.party).*(certif|approv)", re.I),
        "unless": None,
        "reason": ("The sources do not certify any specific custom antenna or end product. The hardware manual "
                   "only states the conditions under which the module's FCC authorization stays valid, and it "
                   "names no approved antenna models."),
        "related": "module certification OEM integration antenna FCC authorization conditions",
        "escalate": "Escalate to Cavli support and a certification specialist; human approval is required.",
    },
]
SCOPE_SENSITIVE = re.compile(r"\b(voltage|supply|power input|input power|power source|volts?)\b", re.I)
BAND_TOPIC = re.compile(r"\b(lte )?bands?\b|\bb\d{1,2}\b", re.I)


def _cite(p: dict) -> dict:
    loc = []
    if p.get("printed_page"):
        loc.append(f"p. {p['printed_page']}")
    if p.get("pdf_page") and str(p.get("printed_page")) != str(p["pdf_page"]):
        loc.append(f"PDF page {p['pdf_page']}")
    if p.get("pdf_page") and not p.get("printed_page"):
        loc = [f"PDF page {p['pdf_page']} (no printed page label)"]
    section = " ".join(x for x in (p.get("section_no"), p.get("section_title")) if x)
    url = p["url"] + (f"#page={p['pdf_page']}" if p.get("pdf_page") else (f"#{p['anchor']}" if p.get("anchor") else ""))
    if p.get("status") == "superseded":
        p = dict(p, revision=f"{p['revision']} (OUTDATED)")
    return {
        "pid": p["pid"], "document": p["title"], "revision": p["revision"],
        "revision_status": p.get("status", "current"), "simulated": bool(p.get("simulated")),
        "location": ", ".join(loc) if loc else "web page (no page numbers)", "section": section or None,
        "url": url, "quote": _quote(p["text"]),
    }


def _quote(text: str, limit: int = 420) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= limit else flat[:limit].rsplit(" ", 1)[0] + " ..."


def _best_lines(q, text: str, n: int = 3) -> str:
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines:
        return ""
    scores = [coverage(q, l) for l in lines]
    anchored = [i for i, l in enumerate(lines) if any(ph in l.lower() for ph in q.phrases)]
    best, best_i = -1.0, 0
    for i in anchored or range(len(lines)):
        s = sum(scores[i:i + n])
        if s > best:
            best, best_i = s, i
    start = best_i - 1 if best_i > 0 and re.search(r"\b(min|typ|max|parameter|pin no|description)\b",
                                                     lines[best_i - 1], re.I) else best_i
    return " ".join(lines[start:best_i + n])


def extractive(q, passages: list[dict], k: int = 2) -> tuple[str, list[str]]:
    parts, cited = [], []
    for p in passages[:k]:
        snippet = _best_lines(q, p["text"])
        heading = " ".join(x for x in (p.get("section_no"), p.get("section_title")) if x)
        if snippet and heading and heading not in snippet:        # keep the section name with the quote
            snippet = f"{heading}: {snippet}"
        if snippet:
            parts.append(f"“{snippet}” [{p['pid']}]")
            cited.append(p["pid"])
    return " ".join(parts), cited


_NUM = re.compile(r"(?<![A-Za-z\d.])\d+(?:\.\d+)?")


def markers(answer: str) -> list[str]:
    """Passage ids cited inline, including comma-separated groups like [A, B]."""
    ids = []
    for group in re.findall(r"\[([^\]]+)\]", answer):
        ids += [x.strip() for x in group.split(",") if re.fullmatch(r"[A-Z]+-[A-Za-z0-9.\-]+", x.strip())]
    return ids


# Revision labels: a cited passage's revision ("5.3", "5.4" from "5.4-SIMULATED") is exempt from the number check
# only when written as a revision ("revision 5.3 and 5.4", "rev. 5.4", "Manual 5.3", "5.4-SIMULATED", "the 5.4
# simulated revision"). A label followed by a unit ("5.4 V") or on its own is still a value. Same rules as engine.ts.
_REV_LABEL = re.compile(r"^\d+(?:\.\d+)+")
_UNIT_AFTER = r"(?!\s?(?:[mµu]?[VAW]|m?s|[kMG]?Hz|[kMG]?bps|dBm?|mm|[nuµp]F|mAh)(?![A-Za-z]))(?!\s?(?:°C|℃|%))"
_REV_QUALIFIER = r"(?:[Ss]imulated|[Ss]uperseded|[Oo]utdated|[Cc]urrent|[Ee]arlier|[Ll]ater|[Nn]ewer|[Oo]lder)"


def without_revision_labels(body: str, revisions: list[str]) -> str:
    labels = list(dict.fromkeys(m.group(0) for r in revisions if (m := _REV_LABEL.match(r or ""))))
    if not labels:
        return body
    lab = "(?:" + "|".join(map(re.escape, labels)) + r")(?!\d)(?!\.\d)" + _UNIT_AFTER
    rev = rf"v?{lab}(?:-SIMULATED|-[Ss]imulated)?"
    for pat in (rf"\b(?:[Rr]evisions?|[Rr]ev\.?|[Mm]anual)\s+{rev}(?:\s*(?:,|and|or|vs\.?|versus|to)\s*{rev})*",
                rf"(?<![\d.]){rev}(?:\s*\((?:SIMULATED|[Ss]imulated)\))?\s+(?:{_REV_QUALIFIER}\s+)?(?:[Rr]evision|[Mm]anual)s?\b",
                rf"(?<![\d.]){lab}(?:-SIMULATED|-[Ss]imulated)\b"):
        body = re.sub(pat, " ", body)
    return body


def validate(answer: str, cited: list[str], allowed: dict) -> dict:
    """Citations must come from the retrieved set; every number in the answer must occur in a cited passage."""
    inline = markers(answer)
    bad = [c for c in set(cited) | set(inline) if c not in allowed]
    cited_rows = [allowed[c] for c in set(cited) | set(inline) if c in allowed]
    body = without_revision_labels(re.sub(r"\[[^\]]+\]", " ", answer).replace("C16QS", " "),
                                   [str(p.get("revision") or "") for p in cited_rows])
    cited_text = " ".join(re.sub(r"\s+", " ", p["text"]) for p in cited_rows)
    unsupported = [n for n in _NUM.findall(body)
                   if not re.search(rf"(?<![\d.]){re.escape(n)}(?![\d])", cited_text)]
    return {"citations_in_retrieved_set": not bad, "unknown_citations": bad,
            "numbers_supported": not unsupported, "unsupported_numbers": unsupported,
            "passed": not bad and not unsupported and bool(set(cited) | set(inline))}


def compose(q, passages: list[dict], use_llm: bool, instruction: str = "") -> dict:
    allowed = {p["pid"]: p for p in passages}
    if use_llm and llm.available() and passages:
        try:
            out = llm.generate(q.text, passages, instruction)
            cited = [c for c in out.get("citations", []) if isinstance(c, str)]
            check = validate(out.get("answer", ""), cited, allowed)
            if out.get("status") == "not_verified":
                return {"status": "not_verified", "text": out.get("answer", ""), "cited": cited,
                        "mode": f"gemini:{llm.model_name()}", "validation": check, "usage": out.get("_usage")}
            if check["passed"]:
                return {"status": "answered", "text": out["answer"], "cited": list(dict.fromkeys(cited + markers(out["answer"]))),
                    "mode": f"gemini:{llm.model_name()}", "validation": check, "usage": out.get("_usage")}
            fallback_reason = f"generated answer rejected by validator: {json.dumps(check)}"
        except Exception as exc:                               # network, quota, malformed JSON
            fallback_reason = f"generation unavailable ({exc})"
    else:
        fallback_reason = "no model key configured" if use_llm else "extractive mode requested"
    text, cited = extractive(q, passages)
    return {"status": "answered" if text else "not_verified", "text": text, "cited": cited, "mode": "extractive",
            "validation": validate(text, cited, allowed), "note": fallback_reason}


def review_flags(con, pids: list[str], question: str) -> list[dict]:
    """Attach open review items that concern what was cited and what was asked."""
    pids = set(pids)
    docs = {r["doc_id"] for r in con.execute(
        f"SELECT doc_id FROM passages WHERE pid IN ({','.join('?' * len(pids))})", tuple(pids))} if pids else set()
    flags = []
    for row in con.execute("SELECT * FROM review_queue WHERE status = 'open'"):
        d = json.loads(row["details"] or "{}")
        if row["kind"] == "conflict":                      # band-list conflicts matter only for band questions
            hit = bool(BAND_TOPIC.search(question)) and any(c["pid"] in pids for c in d.get("claims", []))
        elif row["kind"] == "revision_change":
            hit = any(set(c.get("new_pids", [])) & pids for c in d.get("changes", []))
        elif row["kind"] == "cross_reference_gap":
            hit = d.get("referencing_pid") in pids
        elif row["kind"] == "outdated_reference":            # any answer drawn from the older dependent document
            ref = con.execute("SELECT doc_id FROM passages WHERE pid = ?", (d.get("referencing_pid"),)).fetchone()
            hit = bool(ref) and ref["doc_id"] in docs
        else:
            hit = False
        if hit:
            flags.append({"review_id": row["id"], "kind": row["kind"], "severity": row["severity"],
                          "topic": row["topic"], "summary": row["summary"]})
    return flags


def _where(claims: list[dict]) -> str:
    """'Title rev (pp. 12, 14)' per document revision, or its web section."""
    groups: dict = {}
    for c in claims:
        groups.setdefault((c["title"], c["revision"]), []).append(c)
    out = []
    for (title, rev), cs in groups.items():
        pages = sorted({int(c["printed_page"]) for c in cs if c["printed_page"]})
        loc = ("p. " if len(pages) == 1 else "pp. ") + ", ".join(map(str, pages)) if pages else cs[0]["section"]
        out.append(f"{title} {rev} ({loc})")
    return "; ".join(out)


def _band_answer(con, q) -> dict | None:
    claims = band_claims(current_passages(con))
    if not claims:
        return None
    by_variant: dict = {}
    for c in claims:
        by_variant.setdefault(c["variant"], []).append(c)
    open_items = {r["topic"]: dict(r) for r in con.execute("SELECT * FROM review_queue WHERE status='open' AND kind='conflict'")}

    def sources_line(items):
        seen, out = set(), []
        for c in items:
            key = (c["doc_id"], tuple(c["bands"]))
            if key in seen:
                continue
            seen.add(key)
            where = f"p. {c['printed_page']}" if c["printed_page"] else c["section"]
            out.append(f"{c['title']} {c['revision']} ({where}): {', '.join(map(str, c['bands']))} [{c['pid']}]")
        return out

    if not q.variant:
        lines, cited = [], []
        for variant in sorted(by_variant):
            items = by_variant[variant]
            sets = {tuple(c["bands"]) for c in items}
            agreed = sorted(set.intersection(*map(set, sets)))
            disputed = sorted(set.union(*map(set, sets)) - set(agreed))
            lines.append(f"{variant}: {', '.join(map(str, agreed))}" + (f"; disputed between sources: "
                         f"{', '.join(map(str, disputed))}" if disputed else ""))
            cited += [c["pid"] for c in items]
        return {"status": "ambiguous",
                "text": ("LTE band support depends on the C16QS regional variant, so there is no single answer. "
                         "Bands listed by every current source, per variant: " + " | ".join(lines) + "."),
                "clarification": "Which variant or SKU do you mean (for example C16QS-WW-GNAH or C16QS-IN-GNAN)?",
                "cited": list(dict.fromkeys(cited)), "mode": "structured band claims"}

    items = by_variant.get(q.variant)
    if not items:
        return {"status": "not_verified", "text": f"{NOT_VERIFIED} No band list was found for the {q.variant} variant.",
                "cited": [], "mode": "structured band claims"}
    sets = {tuple(c["bands"]) for c in items}
    cited = [c["pid"] for c in items]
    review = open_items.get(f"bands:{q.variant}")
    if q.band_numbers:
        verdicts, status = [], "answered"
        for b in q.band_numbers:
            listed = [b in s for s in sets]
            if all(listed):
                verdicts.append(f"Band {b} is listed for {q.variant} in every current source.")
            elif not any(listed):
                verdicts.append(f"Band {b} is not listed for {q.variant} in any current source; support is not verified.")
                status = "not_verified" if status == "answered" else status
            else:
                with_b = _where([c for c in items if b in c["bands"]])
                without = _where([c for c in items if b not in c["bands"]])
                verdicts.append(
                    f"Conflicting evidence for Band {b} on {q.variant}: listed in {with_b}, but not listed in "
                    f"{without}. It is not treated as confirmed"
                    + (f" and is queued for expert review (item #{review['id']})." if review else "."))
                status = "conflict"
        text = " ".join(verdicts) + " Evidence: " + " | ".join(sources_line(items))
        return {"status": status, "text": text, "cited": list(dict.fromkeys(cited)), "mode": "structured band claims"}
    lines = sources_line(items)
    status = "conflict" if len(sets) > 1 else "answered"
    text = f"LTE bands listed for the {q.variant} variant: " + " | ".join(lines)
    if len(sets) > 1:
        text += (". The sources disagree; disputed bands are not confirmed"
                 + (f" (expert review item #{review['id']})." if review else "."))
    return {"status": status, "text": text, "cited": list(dict.fromkeys(cited)), "mode": "structured band claims"}


def answer(con, question: str, use_llm: bool = True, k: int = 6, include_superseded: bool = False) -> dict:
    started = time.perf_counter()
    q = analyze(question)
    result = {"question": question, "query": {"keywords": q.keywords, "phrases": q.phrases, "variant": q.variant,
                                               "scope": q.scope, "bands": q.band_numbers}}
    retrieved = retrieve(con, q, k=k, include_superseded=include_superseded)
    shown = retrieved
    composed = None

    guard = next((g for g in GUARDRAILS if g["match"].search(question)
                  and not (g["unless"] and g["unless"].search(question))), None)
    if guard:
        related = retrieve(con, analyze(guard["related"]), k=3)
        shown = related + [r for r in retrieved if r["pid"] not in {x["pid"] for x in related}][:2]
        context = "; ".join(f"{r['code']} {r['revision']} p. {r['printed_page']} §{r['section_no']} {r['section_title']}"
                            for r in related if r.get("printed_page"))
        composed = {"status": "not_verified",
                    "text": f"{NOT_VERIFIED} {guard['reason']} {guard['escalate']}"
                            + (f" Related passages shown as context only: {context}." if context else ""),
                    "cited": [], "related": [r["pid"] for r in related], "mode": f"guardrail:{guard['id']}"}
    elif BAND_TOPIC.search(question) and not re.search(r"\bpower|current|consumption\b", question, re.I):
        composed = _band_answer(con, q)
        if composed:
            pool = {r["pid"]: r for r in retrieved}
            for pid in composed["cited"]:
                if pid not in pool:
                    row = con.execute(
                        "SELECT p.*, d.code, d.title, d.doc_type, d.scope AS doc_scope, r.revision, r.revision_date, "
                        "r.status, r.simulated, r.url FROM passages p JOIN revisions r ON r.rev_id = p.rev_id "
                        "JOIN documents d ON d.doc_id = p.doc_id WHERE p.pid = ?", (pid,)).fetchone()
                    pool[pid] = dict(row)
            shown = [pool[p] for p in composed["cited"]] + [r for r in retrieved if r["pid"] not in composed["cited"]][:2]
    elif SCOPE_SENSITIVE.search(question) and q.scope is None:
        module = retrieve(con, q, k=4, scope_filter="module")
        evk = retrieve(con, q, k=4, scope_filter="evk")
        if module and evk and max(r["coverage"] for r in evk) >= 0.5:
            mod = compose(q, module, use_llm, "Answer only for the bare C16QS module (VBAT supply), not the EVK.")
            ev = compose(q, evk, use_llm, "Answer only for the C16QS EVK board power input, not the bare module.")
            shown = module + evk
            composed = {"status": "ambiguous",
                        "text": f"This depends on what you are powering. Bare module: {mod['text']} "
                                f"EVK board: {ev['text']}",
                        "clarification": "Do you mean the bare C16QS module (VBAT) or the C16QS EVK board input?",
                        "cited": mod["cited"] + ev["cited"], "mode": f"{mod['mode']} (per scope)",
                        "validation": {"module": mod.get("validation"), "evk": ev.get("validation")}}

    if composed is None:
        top_cov = max((r["coverage"] for r in retrieved), default=0)
        if not retrieved or top_cov < 0.4:
            composed = {"status": "not_verified",
                        "text": f"{NOT_VERIFIED} The closest passages do not cover the question's key terms.",
                        "cited": [], "mode": "coverage threshold"}
        else:
            composed = compose(q, retrieved, use_llm)
            if composed["status"] == "not_verified":
                if not composed["text"].startswith("Not verified"):
                    composed["text"] = f"{NOT_VERIFIED} {composed['text']}"
                # A refusal has no supporting evidence: passages the model checked are context, never citations.
                composed["related"], composed["cited"] = composed.get("cited", []), []

    by_pid = {r["pid"]: r for r in shown}
    cited_pids = [p for p in composed.get("cited", []) if p in by_pid]
    flags = review_flags(con, cited_pids or [r["pid"] for r in shown[:3]], question)
    if composed.get("mode") == "structured band claims" and q.variant:
        flags = [f for f in flags if not f["topic"].startswith("bands:") or f["topic"] == f"bands:{q.variant}"]
    if composed["status"] == "answered" and any(
            f["kind"] in ("conflict", "revision_change")
            or f["kind"] == "cross_reference_gap" and f["topic"].split(":", 1)[1] in composed["text"] for f in flags):
        composed["status"] = "answered_with_flags"
    changed = []
    for row in con.execute("SELECT id, details FROM review_queue WHERE status = 'open' AND kind = 'revision_change'"):
        d = json.loads(row["details"])
        for c in d.get("changes", []):
            if set(c.get("new_pids", [])) & set(cited_pids):
                changed.append(f"Passage changed in {d['new_revision']} vs {d['old_revision']} (p. {c.get('printed_page')}): "
                               f"was “{' '.join(c['removed'])[:200]}” (review #{row['id']}).")
    simulated = any(by_pid[p].get("simulated") for p in cited_pids)
    outdated = [p for p in cited_pids if by_pid[p].get("status") == "superseded"]

    result.update({
        "status": composed["status"],
        "answer": composed["text"],
        "clarification": composed.get("clarification"),
        "citations": [_cite(by_pid[p]) for p in cited_pids],
        "related_context": [_cite(by_pid[p]) for p in composed.get("related", []) if p in by_pid],
        "review_flags": flags,
        "warnings": (["Cites a SIMULATED revision - not a Cavli publication."] if simulated else []) +
                    ([f"Cites superseded revision passage(s): {', '.join(outdated)}"] if outdated else []) + changed,
        "retrieved": [{"pid": r["pid"], "score": r.get("score"), "coverage": r.get("coverage"), "document": r["title"],
                       "revision": r["revision"], "page": r["printed_page"], "section": r["section_title"]}
                      for r in shown],
        "mode": composed.get("mode"),
        "validation": composed.get("validation"),
        "note": composed.get("note"),
        "usage": composed.get("usage"),
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
    })
    return result
