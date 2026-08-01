"""Fetch the validation corpus (brief §11: verify against 10 papers by hand).

Orchestrator-owned. Writes only into fixtures/papers/<id>/, keeping .tex/.bbl/.bib
and discarding figures so the repo stays small.

Deliberately separate from backend/pv/ingest — Agent A owns that and its cache lives
in .arxivcache/. This script exists to produce ground truth, not to be production code.

Polite: one request per PAUSE seconds, single connection, real User-Agent.
"""

from __future__ import annotations

import gzip
import io
import os
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

PAUSE = 4.0  # arXiv asks for >= 3s; leave headroom since agents may also be fetching
KEEP = {".tex", ".bbl", ".bib", ".sty", ".cls"}
ROOT = Path(__file__).parent / "papers"
UA = f"paper-verify-corpus/0.1 (+{os.environ.get('CONTACT_EMAIL', 'michae6345@gmail.com')})"

# Chosen for coverage of the cases that break naive checks, not for fame:
CORPUS = [
    ("1706.03762", "Transformer. Block-segmented table, spacer column, \\boldmath in a "
                   "multicolumn, and a real abstract-vs-body divergence (41.8 vs 41.0)."),
    ("1810.04805", "BERT. GLUE table has an 'Average' column -- the canonical check 3 case."),
    ("1512.03385", "ResNet. Error rates: lower-is-better throughout, so a naive 'column max' "
                   "check inverts."),
    ("1907.11692", "RoBERTa. GLUE/SQuAD tables, averaged columns, many bolded bests."),
    ("1409.1556", "VGG. Old-style tables, top-1/top-5 error, lower-is-better."),
    ("2010.11929", "ViT. Mean +/- std cells -- variance reporting, and cells that are not "
                   "bare numbers."),
    ("1802.05365", "ELMo. Baseline-vs-ours tables with increase columns."),
    ("1502.03167", "Batch normalisation. Steps-to-accuracy tables, mixed units."),
    ("1608.06993", "DenseNet. Multi-block tables with bolded per-block winners."),
    ("2103.00020", "CLIP. Very large, many tables; a stress test for the parser."),
]


def fetch(arxiv_id: str) -> tuple[bool, str]:
    dest = ROOT / arxiv_id
    if dest.exists() and any(dest.glob("*.tex")):
        return True, "cached"

    req = urllib.request.Request(
        f"https://arxiv.org/e-print/{arxiv_id}", headers={"User-Agent": UA}
    )
    try:
        raw = urllib.request.urlopen(req, timeout=120).read()
    except Exception as exc:  # noqa: BLE001 - report and continue to the next paper
        return False, f"fetch failed: {exc}"

    dest.mkdir(parents=True, exist_ok=True)
    kept = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
            for m in tar.getmembers():
                if not m.isfile():
                    continue
                name = Path(m.name)
                if name.suffix.lower() not in KEEP:
                    continue
                # Guard against path traversal in tar members.
                if name.is_absolute() or ".." in name.parts:
                    continue
                out = dest / name.name
                data = tar.extractfile(m)
                if data is None:
                    continue
                out.write_bytes(data.read())
                kept += 1
    except tarfile.ReadError:
        # Some submissions are a single gzipped .tex rather than a tarball.
        try:
            text = gzip.decompress(raw)
        except Exception:  # noqa: BLE001
            return False, "not a tarball or gzip (likely PDF-only, no LaTeX source)"
        (dest / "main.tex").write_bytes(text)
        kept = 1

    if kept == 0:
        return False, "archive contained no .tex"
    return True, f"{kept} files"


def main() -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    failures = 0
    for i, (arxiv_id, note) in enumerate(CORPUS):
        ok, detail = fetch(arxiv_id)
        print(f"[{'ok ' if ok else 'FAIL'}] {arxiv_id:12s} {detail:38s} {note}", flush=True)
        if not ok:
            failures += 1
        if detail != "cached" and i < len(CORPUS) - 1:
            time.sleep(PAUSE)
    print(f"\n{len(CORPUS) - failures}/{len(CORPUS)} papers available")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
