import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
MANIFEST = SOURCES / "manifest.json"
SIMULATED = SOURCES / "simulated"
CACHE = ROOT / "cache"
RAW = CACHE / "raw"
INBOX = CACHE / "inbox"
OUTPUTS = ROOT / "outputs"
EVAL = ROOT / "eval"
DEFAULT_DB = CACHE / "index.sqlite"

USER_AGENT = "Mozilla/5.0 (compatible; cavli-docintel/1.0; assessment prototype)"


def gemini_keys() -> list[str]:
    """Primary key first; GEMINI_BACKUP_KEY (another Google project) is used only after a quota error (HTTP 429)."""
    return [k for k in (os.environ.get("GEMINI_API_KEY"), os.environ.get("GEMINI_BACKUP_KEY")) if k]


def load_env(path: Path = ROOT / ".env") -> None:
    """Read KEY=VALUE lines from a local, git-ignored .env without printing them."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
