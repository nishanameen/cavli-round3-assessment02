"""Resolve each manifest revision to a local file whose hash has been verified."""
import hashlib
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from .config import INBOX, RAW, USER_AGENT


class AcquireError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def _download(url: str, timeout: int = 60) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), resp.headers.get("Content-Type", "")


def _looks_valid(data: bytes, fmt: str) -> bool:
    if fmt == "pdf":
        return data.startswith(b"%PDF")
    return b"<html" in data[:2000].lower()


def acquire(rev: dict, refresh: bool = False, offline: bool = False) -> dict:
    """Return {"path", "sha256", "how", "note"} for one revision entry of the manifest."""
    RAW.mkdir(parents=True, exist_ok=True)
    target = RAW / rev["cache_file"]
    expected = rev.get("sha256")
    fmt = rev["format"]

    if target.exists() and expected and sha256_file(target) == expected:
        return {"path": target, "sha256": expected, "how": "cache (hash verified)", "note": ""}

    # Pages without a pinned hash (the live product page) are re-fetched unless offline.
    if target.exists() and not expected and (offline or not refresh):
        return {"path": target, "sha256": sha256_file(target), "how": "cache", "note": "cached web snapshot"}

    failure = ""
    if not offline:
        try:
            data, ctype = _download(rev["url"])
            if not _looks_valid(data, fmt):
                failure = f"URL returned {ctype or 'unknown type'} instead of {fmt} (likely a browser check)"
            else:
                digest = hashlib.sha256(data).hexdigest()
                if expected and digest != expected:
                    changed = RAW / f"{target.stem}-{digest[:8]}{target.suffix}"
                    changed.write_bytes(data)
                    raise AcquireError(
                        f"{rev['url']} now serves a different file (sha256 {digest[:12]}..., saved as {changed.name}). "
                        "Review it and add a new revision entry to sources/manifest.json before re-ingesting.")
                target.write_bytes(data)
                return {"path": target, "sha256": digest, "how": "downloaded", "note": ""}
        except AcquireError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failure = f"download failed: {getattr(exc, 'code', '')} {getattr(exc, 'reason', exc)}".strip()

    if target.exists() and not expected:
        return {"path": target, "sha256": sha256_file(target), "how": "cache (live fetch failed)", "note": failure}

    if expected and INBOX.exists():
        for candidate in INBOX.iterdir():
            if candidate.is_file() and sha256_file(candidate) == expected:
                shutil.copyfile(candidate, target)
                return {"path": target, "sha256": expected, "how": "inbox (hash verified)", "note": failure}

    raise AcquireError(
        f"Could not obtain {rev['url']} ({failure or 'offline'}). Open the URL in a browser, save the file into "
        f"cache/inbox/, and re-run ingest; the SHA-256 must equal {expected}.")
