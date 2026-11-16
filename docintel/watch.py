"""Change-detection fingerprints recorded at publish time.

The hosted "Check sources for updates" button repeats these probes and compares. It only detects change; re-indexing
stays in the controlled pipeline (ingest -> review -> publish) because it needs human approval.
The HTML fingerprint must stay identical to web/src/watch.ts.
"""
import hashlib
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (compatible; cavli-docintel-watch/1.0)"
START, END = 'id="technical-data"', 'id="related-case-studies"'


def fingerprint_html(html: str) -> str:
    """Hash of the visible text in the product page's Technical Data and Variants sections."""
    start, end = html.find(START), html.find(END)
    region = html[start:end] if start >= 0 and end > start else html
    region = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", region, flags=re.I)
    region = re.sub(r"<[^>]+>", " ", region)
    region = re.sub(r"\s+", " ", region).strip()
    return hashlib.sha256(region.encode("utf-8")).hexdigest()


def probe(url: str, fmt: str, timeout: int = 30) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    req = urllib.request.Request(url, method="GET" if fmt == "html" else "HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            out = {"checked_at": now, "http_status": resp.status, "content_type": resp.headers.get("Content-Type"),
                   "etag": resp.headers.get("ETag"), "last_modified": resp.headers.get("Last-Modified"),
                   "content_length": resp.headers.get("Content-Length")}
            if fmt == "html":
                out["fingerprint"] = fingerprint_html(resp.read().decode("utf-8", "replace"))
            elif "pdf" not in (out["content_type"] or ""):
                out["note"] = "host answered with a non-PDF response (likely a browser check)"
            return out
    except urllib.error.HTTPError as exc:
        return {"checked_at": now, "http_status": exc.code, "note": "host blocked the automated check"
                if exc.code in (401, 403, 429) else f"HTTP {exc.code}"}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"checked_at": now, "http_status": None, "note": f"unreachable: {getattr(exc, 'reason', exc)}"}
