"""Keyword retrieval: SQLite FTS5 BM25 candidates, then a transparent lexical rerank."""
import re
from dataclasses import dataclass, field

STOP = set("""a an the of to for in on at by with and or is are was be been does do did can could should would
what which who whom how when where why this that these those it its i my me we our you your any all there
module c16qs cavli please tell about give list need needs use used using get has have from as into than
long must held hold much many appear appears after before also exactly happen happens bare kind type""".split())

EXPAND = {
    "reset": ["reset", "rstn", "resetn"], "restart": ["restart", "reset", "reboot"], "reboot": ["reboot", "reset"],
    "voltage": ["voltage", "vbat", "supply"], "supply": ["supply", "vbat", "input"], "power": ["power", "supply"],
    "band": ["band", "bands"], "bands": ["band", "bands"], "jumper": ["jumper", "jmp"], "jmp": ["jmp", "jumper"],
    "com": ["com", "ports", "ttyusb"], "ports": ["ports", "com"], "port": ["port", "com"],
    "battery": ["battery", "consumption", "sleep", "hibernate"], "life": ["life"],
    "temperature": ["temperature"], "certified": ["certification", "certified", "approval"],
    "certification": ["certification", "certified", "approval"], "antenna": ["antenna", "antennas"],
    "boot": ["boot", "booted"], "operating": ["operating", "condition"],
}
CODES = "WW|NA|EU|IN|EAJ|LA|AN|EA"
VARIANT_NAMES = [(r"worldwide|global", "WW"), (r"india", "IN"), (r"north america|\busa\b", "NA"),
                 (r"europe", "EU"), (r"japan|eurasia", "EAJ"), (r"latin america", "LA"),
                 (r"australia|new zealand", "AN")]


def detect_variant(question: str) -> str | None:
    """Explicit variant mentions only: a SKU, an upper-case region code, 'xx variant', or a region name."""
    m = (re.search(rf"c16qs-({CODES})\b", question, re.I)
         or re.search(rf"\b({CODES})\b", question)                       # upper-case code, e.g. "WW"
         or re.search(rf"\b({CODES.lower()})\s+variant\b", question.lower()))
    if m:
        return m.group(1).upper()
    for pat, code in VARIANT_NAMES:
        if re.search(pat, question, re.I):
            return code
    return None


EVK_HINT = re.compile(r"\bevk\b|evaluation (kit|board)|\bjumper|\bjmp\b|type-?c|com ports?|ttyusb|esp32|dev(elopment)? (kit|board)", re.I)
MODULE_HINT = re.compile(r"bare module|\bpin\b|\bpins\b|\blga\b|\bvbat|\bvb\b|\bpad\b|module itself", re.I)


@dataclass
class Query:
    text: str
    keywords: list = field(default_factory=list)
    expanded: list = field(default_factory=list)
    phrases: list = field(default_factory=list)
    variant: str | None = None
    scope: str | None = None          # "evk" | "module" | None
    band_numbers: list = field(default_factory=list)


def analyze(question: str) -> Query:
    q = Query(text=question)
    low = question.lower()
    m = re.search(r"\b(?:jmp|jumper)\s*(\d+)\b", low)
    if m:
        q.phrases += [f"jmp {m.group(1)}", f"jumper {m.group(1)}"]
    for m in re.finditer(r"\bat[+$^&]([a-z]+)\b", low):
        q.phrases.append(f"at {m.group(1)}")
    for m in re.finditer(r"\b(?:band|b)\s?(\d{1,2})\b", low):
        q.band_numbers.append(int(m.group(1)))
    for m in re.finditer(r"\bpin\s+(\d{1,3})\b", low):
        q.phrases.append(f"pin {m.group(1)}")
    words = re.findall(r"[a-z0-9]+", low)
    q.variant = detect_variant(question)
    q.keywords = [w for w in dict.fromkeys(words) if w not in STOP and len(w) > 1]
    exp = []
    for w in q.keywords:
        exp += EXPAND.get(w, [w])
    q.expanded = list(dict.fromkeys(exp))
    if EVK_HINT.search(question):
        q.scope = "evk"
    elif MODULE_HINT.search(question):
        q.scope = "module"
    return q


def _fts_query(q: Query) -> str:
    terms = [f'"{t}"' for t in q.expanded] + [f'"{p}"' for p in q.phrases]
    return " OR ".join(dict.fromkeys(terms)) or '""'


def _stem(w: str) -> str:
    return w[:5] if len(w) > 5 else w


UNIT_HINTS = {  # a value with the right unit counts as mentioning the quantity
    "voltage": re.compile(r"\d\s?V\b"), "volts": re.compile(r"\d\s?V\b"),
    "current": re.compile(r"\d\s?(mA|µA|uA)\b"), "consumption": re.compile(r"\d\s?(mA|µA|uA)\b"),
    "temperature": re.compile(r"°C|℃"), "speed": re.compile(r"\d\s?[MmKk]bps"),
}


def coverage(q: Query, text: str) -> float:
    """Share of question keywords (or one of their expansions) found in the passage."""
    if not q.keywords:
        return 0.0
    low = text.lower()
    tokens = set(_stem(t) for t in re.findall(r"[a-z0-9]+", low))
    hit = 0
    for w in q.keywords:
        options = EXPAND.get(w, [w]) + [w]
        if any(_stem(o) in tokens for o in options) or (w in UNIT_HINTS and UNIT_HINTS[w].search(text)):
            hit += 1
    return hit / len(q.keywords)


def retrieve(con, q: Query, k: int = 8, include_superseded: bool = False, scope_filter: str | None = None) -> list[dict]:
    status = "" if include_superseded else "AND r.status = 'current'"
    sql = f"""
      SELECT p.*, d.code, d.title, d.doc_type, d.scope AS doc_scope, r.revision, r.revision_date, r.status,
             r.simulated, r.url, bm25(passages_fts, 0.0, 2.0, 1.0) AS bm25
      FROM passages_fts JOIN passages p ON p.pid = passages_fts.pid
      JOIN revisions r ON r.rev_id = p.rev_id JOIN documents d ON d.doc_id = p.doc_id
      WHERE passages_fts MATCH ? {status}
      ORDER BY bm25 LIMIT 60"""
    rows = [dict(r) for r in con.execute(sql, (_fts_query(q),))]
    if not rows:
        return []
    best = min(r["bm25"] for r in rows)
    wants_at = bool(re.search(r"\bat\b|command", q.text, re.I))
    wants_history = bool(re.search(r"version|revision|history|changed|updated", q.text, re.I))
    for r in rows:
        text = (r["section_title"] or "") + "\n" + r["text"]
        r["coverage"] = round(coverage(q, text), 3)
        phrase = any(p in re.sub(r"\s+", " ", text.lower()) for p in q.phrases)
        score = 0.45 * (r["bm25"] / best if best else 0) + 0.45 * r["coverage"] + (0.3 if phrase else 0)
        if q.scope and r["doc_scope"] in ("evk", "module"):
            score += 0.15 if r["doc_scope"] == q.scope else -0.15
        if r["doc_type"] == "at_command_manual" and not wants_at:
            score -= 0.15
        if r["pdf_page"] and not r["section_no"] and not wants_history:   # cover, copyright, version history
            score -= 0.25
        if q.band_numbers and r["doc_type"] in ("hardware_manual", "product_page") and re.search(r"\b\d{1,2}\s*/", r["text"]):
            score += 0.1
        r["score"] = round(score, 4)
    if scope_filter:
        rows = [r for r in rows if r["doc_scope"] == scope_filter]
    rows.sort(key=lambda r: r["score"], reverse=True)
    picked, per_page = [], {}
    for r in rows:
        key = (r["doc_id"], r["revision"], r["pdf_page"], r["section_title"])
        if per_page.get(key, 0) >= 1:
            continue
        per_page[key] = per_page.get(key, 0) + 1
        picked.append(r)
        if len(picked) == k:
            break
    return picked
