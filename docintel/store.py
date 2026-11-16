import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY, code TEXT, title TEXT, publisher TEXT, doc_type TEXT, scope TEXT, module TEXT);
CREATE TABLE IF NOT EXISTS revisions (
  rev_id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT REFERENCES documents(doc_id), revision TEXT, revision_label TEXT, revision_date TEXT,
  date_source TEXT, url TEXT, host TEXT, format TEXT, file_sha256 TEXT, text_sha256 TEXT,
  acquired_via TEXT, retrieved_at TEXT, ingested_at TEXT, status TEXT DEFAULT 'current',
  simulated INTEGER DEFAULT 0, page_count INTEGER, label_offset INTEGER, notes TEXT,
  UNIQUE (doc_id, text_sha256));
CREATE TABLE IF NOT EXISTS pages (
  rev_id INTEGER REFERENCES revisions(rev_id), pdf_page INTEGER, printed_page TEXT, kind TEXT, text TEXT,
  PRIMARY KEY (rev_id, pdf_page));
CREATE TABLE IF NOT EXISTS passages (
  pid TEXT PRIMARY KEY, rev_id INTEGER REFERENCES revisions(rev_id), doc_id TEXT,
  pdf_page INTEGER, printed_page TEXT, section_no TEXT, section_title TEXT, anchor TEXT, text TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(
  pid UNINDEXED, section, body, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, severity TEXT, topic TEXT, summary TEXT,
  details TEXT, status TEXT DEFAULT 'open', resolution TEXT, fingerprint TEXT UNIQUE,
  created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS ingest_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, finished_at TEXT, report TEXT);
"""


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def upsert_review(con, kind, severity, topic, summary, details, fingerprint) -> str:
    """Insert a review item once; re-detection keeps the existing status (e.g. an expert's resolution)."""
    row = con.execute("SELECT id, status FROM review_queue WHERE fingerprint = ?", (fingerprint,)).fetchone()
    if row:
        status = "open" if row["status"] == "auto-closed" else row["status"]
        con.execute("UPDATE review_queue SET status = ?, updated_at = ?, details = ?, summary = ? WHERE id = ?",
                    (status, now(), json.dumps(details), summary, row["id"]))
        return "existing"
    con.execute(
        "INSERT INTO review_queue (kind, severity, topic, summary, details, fingerprint, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (kind, severity, topic, summary, json.dumps(details), fingerprint, now(), now()))
    return "new"
