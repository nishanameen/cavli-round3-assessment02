"""Turn source files into page records and citeable passages.

Every passage keeps its PDF page index, the printed page label (only when one is printed on that
page and agrees with the document's label offset), and the section heading in force.
"""
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

MAX_CHARS = 1400

_CHAR_FIXES = {
    "￾": " - ", "": "-", "­": "", "\r": "",
    " ": " ", " ": " ", " ": " ", "～": "~",
}
_HEADER_JUNK = [
    re.compile(r"^ManualCC\w*$"),                      # AT manual running header artefact
    re.compile(r"^s?\s*D MANUAL\s*$"),
]
_HEADER_PREFIX = re.compile(r"^s?\s*D MANUAL\s+")      # AT manual header glued to a heading
_LABEL_PATTERNS = [
    re.compile(r"^(\d{1,3})\s+www\.cavliwireless\.com$"),
    re.compile(r"^www\.cavliwireless\.com\s+(\d{1,3})$"),
    re.compile(r"^(\d{1,3})$"),
]
_HEADING = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,3})\s*([A-Z][^\n]{1,78})$")
_DATE = re.compile(r"(\d{2}[/-]\d{2}[/-]\d{4}|\d{2}[-–]\w{3}[-–]\d{4})\s*$")


def normalize(text: str) -> str:
    for bad, good in _CHAR_FIXES.items():
        text = text.replace(bad, good)
    text = re.sub(r"(\d+)\s*\n\s*(st|nd|rd|th)\b", r"\1\2", text)   # "15\nth pin" -> "15th pin"
    text = re.sub(r"[ \t]+", " ", text)
    return "\n".join(line.strip() for line in text.split("\n"))


def _is_toc(lines: list[str]) -> bool:
    dotted = sum(1 for l in lines if "....." in l)
    return dotted >= 5 or (lines and dotted / len(lines) > 0.3)


def extract_pdf_pages(path: Path) -> tuple[list[dict], int | None]:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(str(path))
    raw = []
    for i in range(len(doc)):
        page = doc[i]
        raw.append(normalize(page.get_textpage().get_text_range()))
        page.close()
    doc.close()

    # Running headers/footers: short lines repeated near the top or bottom of most pages.
    edge = Counter()
    for text in raw:
        lines = [l for l in text.split("\n") if l]
        for l in set(lines[:4] + lines[-3:]):
            edge[l] += 1
    repeated = {l for l, n in edge.items() if n >= max(3, 0.4 * len(raw)) and len(l) < 60}

    labels = []
    for text in raw:
        found = None
        for l in [l for l in text.split("\n") if l][:2]:
            for pat in _LABEL_PATTERNS:
                m = pat.match(l)
                if m:
                    found = int(m.group(1))
                    break
            if found is not None:
                break
        labels.append(found)
    offsets = Counter(lab - (i + 1) for i, lab in enumerate(labels) if lab is not None)
    offset = offsets.most_common(1)[0][0] if offsets else None

    pages = []
    for i, text in enumerate(raw):
        pdf_page = i + 1
        printed = labels[i] if (labels[i] is not None and labels[i] - pdf_page == offset) else None
        lines = []
        for l in text.split("\n"):
            if not l or l in repeated or "www.cavliwireless.com" == l:
                continue
            if any(p.match(l) for p in _HEADER_JUNK):
                continue
            if printed is not None and l == str(printed) and not lines:
                continue
            l = _HEADER_PREFIX.sub("", l)
            if re.fullmatch(r"\d{1,3}\s+www\.cavliwireless\.com|www\.cavliwireless\.com\s+\d{1,3}", l):
                continue
            lines.append(l)
        pages.append({
            "pdf_page": pdf_page,
            "printed_page": str(printed) if printed is not None else None,
            "kind": "toc" if _is_toc(lines) else "body",
            "text": "\n".join(lines),
        })
    return pages, offset


def _heading(line: str, current: tuple | None):
    m = _HEADING.match(line)
    if not m:
        return None
    number, title = m.group(1), m.group(2).strip()
    if "...." in title or _DATE.search(title) or title.startswith(("•", "✓")):
        return None
    parts = tuple(int(x) for x in number.split("."))
    if len(parts) == 1:
        if not re.fullmatch(r"[A-Za-z&,\- ]{4,60}", title):
            return None
        ok = current is None and parts[0] <= 2 or current is not None and parts[0] == current[0] + 1
    else:
        if current is None:
            ok = parts[0] <= 2
        elif parts[0] == current[0]:
            ok = parts > current and all(
                b <= a + 2 for a, b in zip(current + (0,) * 4, parts))
        else:
            ok = parts[0] == current[0] + 1 and all(p <= 2 for p in parts[1:])
    return (parts, number, title) if ok else None


def pdf_passages(pages: list[dict]) -> list[dict]:
    """Split body pages at detected section headings; long segments are split on line boundaries."""
    passages = []
    current, number, title = None, None, None
    for page in pages:
        if page["kind"] != "body" or not page["text"].strip():
            continue
        segments = [[number, title, []]]
        for line in page["text"].split("\n"):
            h = _heading(line, current)
            if h:
                current, number, title = h
                segments.append([number, title, [line]])
            else:
                segments[-1][2].append(line)
        for sec_no, sec_title, lines in segments:
            for chunk in _split(lines):
                passages.append({
                    "pdf_page": page["pdf_page"],
                    "printed_page": page["printed_page"],
                    "section_no": sec_no,
                    "section_title": sec_title,
                    "anchor": None,
                    "text": chunk,
                })
    return passages


def _split(lines: list[str]) -> list[str]:
    text = "\n".join(lines).strip()
    if not text:
        return []
    if len(text) <= MAX_CHARS:
        return [text]
    chunks, buf = [], []
    for line in lines:
        if buf and sum(len(l) + 1 for l in buf) + len(line) > MAX_CHARS * 0.7:
            chunks.append("\n".join(buf))
            buf = buf[-1:]                                   # one line of overlap
        buf.append(line)
    if buf:
        chunks.append("\n".join(buf))
    return [c for c in chunks if c.strip()]


class _ProductPage(HTMLParser):
    BLOCK = {"p", "div", "li", "tr", "h1", "h2", "h3", "h4", "br", "ul", "table"}

    def __init__(self, stop_headings):
        super().__init__(convert_charrefs=True)
        self.stop = set(stop_headings)
        self.skip = 0
        self.started = self.stopped = False
        self.heading_tag = None
        self.heading_buf = []
        self.capture_sub = False
        self.anchor = None
        self.section, self.sub = None, None
        self.blocks = []          # [section, sub, anchor, [text]]

    def _new_block(self):
        self.blocks.append([self.section, self.sub, self.anchor, []])

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
            return
        if attrs.get("id") and tag in ("div", "section"):
            self.pending_anchor = attrs["id"]
        if tag in ("h1", "h2", "h3", "h4"):
            self.heading_tag, self.heading_buf = tag, []
        if "box-one" in (attrs.get("class") or ""):
            self.capture_sub = True
        if self.blocks and tag in self.BLOCK:
            self.blocks[-1][3].append("\n")
        if self.blocks and tag in ("td", "th"):
            self.blocks[-1][3].append(" | ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip -= 1
            return
        if tag == self.heading_tag:
            text = " ".join("".join(self.heading_buf).split())
            self.heading_tag = None
            if text in self.stop and self.started:
                self.stopped = True
            if self.stopped or not text:
                return
            if tag == "h1":
                self.started = True
            if not self.started:
                return
            if tag in ("h1", "h2", "h3"):
                self.section, self.sub = text, None
                self.anchor = getattr(self, "pending_anchor", None)
            else:
                self.sub = text
            self._new_block()
            self.blocks[-1][3].append(text + "\n")

    def handle_data(self, data):
        if self.skip:
            return
        if self.heading_tag:
            self.heading_buf.append(data)
            return
        if not self.started or self.stopped or not data.strip():
            return
        if self.capture_sub:
            self.capture_sub = False
            self.sub = " ".join(data.split())
            self._new_block()
        if not self.blocks:
            self._new_block()
        self.blocks[-1][3].append(data.strip() + " ")


def html_passages(path: Path, stop_headings=("Featured Videos",)) -> list[dict]:
    parser = _ProductPage(stop_headings)
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    merged: dict[tuple, dict] = {}
    for section, sub, anchor, parts in parser.blocks:
        text = normalize("".join(parts))
        text = re.sub(r"\n\s*\n+", "\n", text).strip()
        if not text:
            continue
        key = (section, sub)
        if key not in merged:
            merged[key] = {"section_title": section if not sub else f"{section} > {sub}",
                           "anchor": anchor, "lines": []}
        merged[key]["lines"].extend(text.split("\n"))
    passages = []
    for item in merged.values():
        for chunk in _split(item["lines"]):
            passages.append({"pdf_page": None, "printed_page": None, "section_no": None,
                             "section_title": item["section_title"], "anchor": item["anchor"], "text": chunk})
    return passages
