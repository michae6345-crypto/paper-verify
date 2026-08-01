"""Readable summary of what ingest produced.

    python -m pv.ingest.cli 1706.03762
    python -m pv.ingest.cli --dir fixtures/papers/1706.03762 --offline
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .fetch import DEFAULT_CACHE_DIR
from .pipeline import IngestResult, ingest, ingest_directory


def summarize(result: IngestResult) -> str:
    doc = result.document
    lines: list[str] = []
    lines.append(f"arXiv id      {doc.arxiv_id}{doc.version or ''}")
    lines.append(f"Title         {doc.title or '(not found)'}")
    lines.append(f"Source hash   {doc.source_hash or '(none)'}")
    if result.from_cache:
        origin = "cache"
    elif doc.fetched_at is not None:
        origin = "fetched from arXiv"
    else:
        origin = "local directory"
    lines.append(f"Source        {origin}")
    if doc.fetched_at is not None:
        lines.append(f"Fetched at    {doc.fetched_at.isoformat()}")

    if result.reason is not None:
        lines.append(f"Reason        {result.reason.value}")
        if result.detail:
            lines.append(f"Detail        {result.detail}")
        return "\n".join(lines)

    lines.append(f"Assembled     {len(doc.assembled_latex):,} characters")
    lines.append(f"Files ({len(doc.file_names)})")
    for name in doc.file_names:
        lines.append(f"  {name}")

    lines.append(f"Macros ({len(doc.macro_defs)})")
    for name in sorted(doc.macro_defs):
        macro = doc.macro_defs[name]
        args = f"[{macro.n_args}]" if macro.n_args else ""
        body = macro.body.replace("\n", " ")
        if len(body) > 58:
            body = body[:55] + "..."
        lines.append(f"  \\{name}{args} -> {body}")

    if result.assembled and result.assembled.missing_inputs:
        lines.append("Unresolved inputs")
        for name in result.assembled.missing_inputs:
            lines.append(f"  {name}")

    abstract = doc.abstract
    lines.append(f"Abstract ({len(abstract)} characters)")
    lines.append("  " + (abstract[:400] + ("..." if len(abstract) > 400 else "")))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m pv.ingest.cli",
        description="Assemble an arXiv paper's LaTeX source into a SourceDocument.",
    )
    parser.add_argument("arxiv_id", nargs="?", help="e.g. 1706.03762 or 1706.03762v5")
    parser.add_argument("--dir", type=Path, help="read an already-extracted source tree instead")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="never hit the network; fail if the paper is not cached",
    )
    args = parser.parse_args(argv)

    if args.dir is not None:
        result = ingest_directory(args.dir, arxiv_id=args.arxiv_id or args.dir.name)
    elif args.arxiv_id:
        result = ingest(
            args.arxiv_id, cache_dir=args.cache_dir, allow_network=not args.offline
        )
    else:
        parser.error("give an arXiv id or --dir")
        return 2

    print(summarize(result))
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
