"""Optional Gemini call. The key is read from the environment and never logged or returned."""
import json
import os
import time
import urllib.error
import urllib.request

from .config import gemini_keys

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM = """You answer technical questions about the Cavli C16QS LTE Cat 1bis module using ONLY the numbered
passages supplied. Rules:
- Every factual sentence must end with one or more citations in square brackets using the passage ids, e.g. [HW-v5.3-p031-2].
- Copy numbers, units, pin numbers and command names exactly as written in the passages. Never compute, convert or estimate.
- Do not infer compatibility, certification, battery life or behaviour that the passages do not state.
- If the passages do not contain the answer, set status to "not_verified" and say what is missing.
- If a passage is marked SIMULATED, mention that the value comes from a simulated revision.
- If a passage is marked SUPERSEDED, answer from the later revision first; give the superseded value only as the earlier wording.
- At most 110 words. Plain text, no markdown headings.
Return JSON: {"status": "answered" | "not_verified", "answer": string, "citations": [passage ids]}"""


def available() -> bool:
    return bool(gemini_keys())


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")


def generate(question: str, passages: list[dict], extra_instruction: str = "", timeout: int = 20) -> dict:
    blocks = []
    for p in passages:
        # Superseded passages appear only with --all-revisions; say which revision is outdated (same as worker.ts).
        tag = ((" (SIMULATED revision - not a Cavli publication)" if p.get("simulated") else "")
               + (" (SUPERSEDED revision - outdated, replaced by a later revision)"
                  if p.get("status") == "superseded" else ""))
        where = f"page {p['printed_page']}" if p.get("printed_page") else "web page section"
        blocks.append(f"[{p['pid']}] {p['title']}, revision {p['revision']}{tag}, {where}, "
                      f"section: {p.get('section_title') or 'n/a'}\n{p['text']}")
    prompt = f"Question: {question}\n{extra_instruction}\n\nPassages:\n\n" + "\n\n---\n\n".join(blocks)
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "maxOutputTokens": 600},
    }
    data, last_error = None, ""
    for key in gemini_keys():                           # next key only when this one is out of quota (429)
        req = urllib.request.Request(
            ENDPOINT.format(model=model_name()), data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": key})
        for attempt in range(2):                        # one retry for transient provider errors
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                last_error = f"Gemini HTTP {exc.code}"
                if exc.code == 429 or exc.code not in (500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError) as exc:
                last_error = f"Gemini unreachable: {getattr(exc, 'reason', exc)}"
            if attempt == 0:
                time.sleep(2)
        if data is not None or last_error != "Gemini HTTP 429":
            break
    if data is None:
        raise RuntimeError(f"{last_error} (after retry)")
    text = "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"])
    out = json.loads(text)
    usage = data.get("usageMetadata", {})
    out["_usage"] = {"input_tokens": usage.get("promptTokenCount"), "output_tokens": usage.get("candidatesTokenCount")}
    return out
