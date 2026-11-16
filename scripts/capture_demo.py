"""Run the demo commands for real, save their output, and render one 1280x720 terminal frame per chapter.

Usage (from round3-assignment2):  python scripts/capture_demo.py
Writes outputs/demo/NN-*.txt (actual CLI output), outputs/demo/frames/NN.png and outputs/DEMO-TRANSCRIPT.md.
"""
import html
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "demo"
FRAMES = OUT / "frames"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
DEMO_DB = "cache/demo-revision.sqlite"

CHAPTERS = [
    ("01-sources", "01 / Sources and revisions", [["sources"]], 40),
    ("02-ingest", "02 / Repeatable ingest and review queue", [["ingest", "--refresh"], ["review"]], 46),
    ("03-cited", "03 / Cited answer with page and section", [["ask", "Which pin resets the bare C16QS module, and how long must it be held low?"]], 44),
    ("04-ambiguous", "04 / Ambiguous scope: module or EVK?", [["ask", "What supply voltage does the C16QS need?"]], 44),
    ("05-conflict", "05 / Conflicting evidence goes to review", [["ask", "Does the C16QS-WW support LTE Band 38?"]], 40),
    ("06-revision", "06 / Re-indexing a SIMULATED revision", [["--db", DEMO_DB, "simulate-revision"],
                                                              ["--db", DEMO_DB, "ask", "How long must the C16QS reset pin be held low?"]], 44),
    ("07-unsupported", "07 / Not verified: unsupported questions", [["ask", "Is the C16QS certified for use with my custom-designed antenna?"],
                                                                   ["ask", "What is the MTBF of the C16QS module?"]], 44),
]


def run(args: list[str]) -> str:
    proc = subprocess.run([sys.executable, "-m", "docintel", *args], cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
    return proc.stdout + (proc.stderr if proc.returncode else "")


def frame_html(title: str, blocks: list[tuple[str, str]], max_lines: int) -> str:
    body = []
    for cmd, out in blocks:
        body.append(f'<div class="cmd">&gt; python -m docintel {html.escape(cmd)}</div>')
        lines = [l for l in out.rstrip().split("\n") if l.strip()]
        if len(lines) > max_lines:
            lines = lines[:max_lines] + [f"   ... ({len(lines) - max_lines} more lines in outputs/demo)"]
        body.append('<pre>' + html.escape("\n".join(lines)) + '</pre>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;width:1280px;height:720px;background:#10161d;color:#d8e1e8;font-family:Consolas,monospace;overflow:hidden}}
.bar{{height:44px;background:#0f6b5c;color:#fff;font:600 20px 'Segoe UI',Arial;display:flex;align-items:center;padding:0 24px}}
.wrap{{padding:12px 24px}} .cmd{{color:#7fe0c3;font-size:15px;margin:6px 0 4px}}
pre{{margin:0 0 6px;font-size:12.6px;line-height:1.34;white-space:pre-wrap;word-break:break-word}}
</style></head><body><div class="bar">{html.escape(title)}</div><div class="wrap">{''.join(body)}</div></body></html>"""


def main():
    if not (ROOT / "cache" / "index.sqlite").exists():
        sys.exit("Run `python -m docintel ingest` first.")
    shutil.copyfile(ROOT / "cache" / "index.sqlite", ROOT / DEMO_DB)
    FRAMES.mkdir(parents=True, exist_ok=True)
    transcript = ["# Demo transcript (actual CLI output)", "",
                  "Captured by `python scripts/capture_demo.py`. Chapter 06 uses a copy of the index "
                  "(`cache/demo-revision.sqlite`) so the SIMULATED revision never touches the main index.", ""]
    for slug, title, commands, max_lines in CHAPTERS:
        blocks = []
        for args in commands:
            out = run(args)
            shown = " ".join(a if " " not in a else f'"{a}"' for a in args)
            blocks.append((shown, out))
        (OUT / f"{slug}.txt").write_text("\n\n".join(f"> python -m docintel {c}\n{o}" for c, o in blocks), encoding="utf-8")
        page = OUT / f"{slug}.html"
        page.write_text(frame_html(title, blocks, max_lines // len(blocks) + (6 if len(blocks) > 1 else 0)), encoding="utf-8")
        png = FRAMES / f"{slug[:2]}.png"
        subprocess.run([str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                        "--window-size=1280,720", page.as_uri()], capture_output=True)
        page.unlink()
        transcript += [f"## {title}", ""] + [f"```text\n> python -m docintel {c}\n{o.rstrip()}\n```\n" for c, o in blocks]
        print(f"captured {slug}")
    summary_frame()
    (ROOT / "outputs" / "DEMO-TRANSCRIPT.md").write_text("\n".join(transcript), encoding="utf-8")


def summary_frame():
    """Chapter 08: evaluation results read from outputs/eval-results*.json plus the documentation findings."""
    import json
    rows = []
    for name, label in [("eval-results.json", "Main set, Gemini + validator (run 2)"),
                        ("eval-results-run1-no-retry.json", "Main set, run 1 (before retry)"),
                        ("eval-results-extractive.json", "Main set, extractive only"),
                        ("eval-results-holdout.json", "Held-out set, single run")]:
        s = json.loads((ROOT / "outputs" / name).read_text(encoding="utf-8"))["summary"]
        rows.append(f"<tr><td>{label}</td><td>{s['passed']}/{s['cases']}</td>"
                    f"<td>{s['citations_valid']}/{s['citations_checked']}</td></tr>")
    findings = ["WW/EAJ Band 38 and WW/NA Band 13: hardware manual 5.3 vs product page",
                "L.A Band 28 on p. 14 but not pp. 12 / 54 of the same manual",
                "AT+TRB (HW p. 31) missing from AT manual 3.1; AT$QCRST documented instead",
                "FCC text: 'internal on-board antenna only' vs external antenna interface; FCC ID placeholder",
                "No B13/B38 rows in the power table; product-page code legend SOON vs S00N",
                "No official versioned download URL; product page has no revision or date"]
    style = ("body{margin:0;width:1280px;height:720px;background:#f7f8f5;color:#1b2430;font-family:'Segoe UI',Arial;"
             "overflow:hidden}.bar{height:44px;background:#0f6b5c;color:#fff;font-weight:600;font-size:20px;display:flex;"
             "align-items:center;padding:0 24px}.wrap{display:flex;gap:28px;padding:22px 28px}.col{flex:1}"
             "h2{font-size:19px;color:#0f6b5c;margin:0 0 10px}table{border-collapse:collapse;width:100%;font-size:17px}"
             "td,th{border-bottom:1px solid #d7dde4;padding:8px 6px;text-align:left}th{background:#e6efec}"
             "li{font-size:16.5px;margin:0 0 11px;line-height:1.35}ul{padding-left:20px;margin:0}"
             ".note{font-size:14px;color:#5b6675;margin-top:14px;line-height:1.4}")
    items = "".join(f"<li>{html.escape(f)}</li>" for f in findings)
    page = OUT / "08.html"
    page.write_text(
        f'<!doctype html><html><head><meta charset="utf-8"><style>{style}</style></head><body>'
        '<div class="bar">08 / Evaluation results and documentation improvements</div><div class="wrap">'
        '<div class="col"><h2>Observed evaluation runs</h2><table><tr><th>Run</th><th>Passed</th>'
        f'<th>Citations valid</th></tr>{"".join(rows)}</table><div class="note">Cases cover answerable, ambiguous, '
        'conflict, unanswerable and simulated-revision questions. Every citation is re-checked by re-extracting the '
        'cited page from the hash-verified source file. Full tables: outputs/EVALUATION*.md.</div></div>'
        f'<div class="col"><h2>Documentation findings (expert review)</h2><ul>{items}</ul></div></div></body></html>',
        encoding="utf-8")
    subprocess.run([str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--screenshot={FRAMES / '08.png'}", "--window-size=1280,720", page.as_uri()], capture_output=True)
    page.unlink()


if __name__ == "__main__":
    main()
