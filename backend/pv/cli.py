"""Headless report to stdout. Build-order step 1 (brief §11).

    python -m pv.cli 1706.03762
    python -m pv.cli --fixture ../fixtures/papers/1810.04805 1810.04805
    python -m pv.cli --corpus ../fixtures/papers

Copy follows §7: sentence case, active voice, and the fixed vocabulary
(`matches`, `within tolerance`, `diverges`, `unverifiable`). `not_attempted`
renders as "not checked", matching the §5.5 section name. Nothing here calls a
finding an error, a problem, or misconduct.

Glyphs mirror §2's gutter marks so the terminal output and the UI read the same,
and so verdicts survive being piped somewhere without colour.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pv.models import RunReport, Verdict
from pv.run import DEFAULT_CHECKS, run_paper

GLYPH = {
    Verdict.MATCHES: "—",  # thin horizontal rule
    Verdict.WITHIN_TOLERANCE: "≈",
    Verdict.DIVERGES: "⁄",  # short diagonal stroke
    Verdict.UNVERIFIABLE: "○",  # hollow circle
    Verdict.NOT_ATTEMPTED: "·",
}

LABEL = {
    Verdict.MATCHES: "matches",
    Verdict.WITHIN_TOLERANCE: "within tolerance",
    Verdict.DIVERGES: "diverges",
    Verdict.UNVERIFIABLE: "unverifiable",
    Verdict.NOT_ATTEMPTED: "not checked",
}


def render(report: RunReport, *, verbose: bool = False) -> str:
    lines: list[str] = []
    title = report.title or "(title not found)"
    lines.append(f"{title}")
    lines.append(f"{report.arxiv_id}   {report.tables_parsed} tables parsed")
    lines.append("")

    if not report.checks:
        lines.append("No checks ran.")
    for res in report.checks:
        glyph = GLYPH[res.verdict]
        label = LABEL[res.verdict]
        name = res.display_name or res.checker
        n = len(res.findings)
        count = f"{n} finding{'s' if n != 1 else ''}" if n else ""
        reason = f"  ({res.reason.value})" if res.reason else ""
        lines.append(f"  {glyph} {name:<34} {label:<17}{count}{reason}")

        for f in res.findings:
            lines.append(f"      {f.anchor.human_locator or f.anchor.dom_id}")
            if f.claimed is not None:
                lines.append(f"        claimed   {f.claimed}")
            if f.computed is not None:
                lines.append(f"        computed  {f.computed}")
            if f.delta is not None:
                lines.append(f"        delta     {f.delta}")
            if f.explanation:
                lines.append(f"        {f.explanation}")
            lines.append("")

    # §5.5: the "not checked" section is first-class and must not read as failure.
    lines.append("")
    lines.append(f"Not checked ({len(report.not_checked)})")
    if not report.not_checked:
        lines.append("  Everything the run attempted could be verified.")
    else:
        shown = report.not_checked if verbose else report.not_checked[:12]
        for nc in shown:
            lines.append(f"  {nc.what} — {nc.reason.value}")
            if verbose and nc.detail:
                lines.append(f"      {nc.detail}")
        hidden = len(report.not_checked) - len(shown)
        if hidden > 0:
            lines.append(f"  and {hidden} more; pass --verbose to list them")
    return "\n".join(lines)


def summarise(report: RunReport) -> str:
    """One line per paper, for the corpus run."""
    strip = "".join(GLYPH[c.verdict] for c in report.checks)
    diverges = sum(len(c.findings) for c in report.checks if c.verdict is Verdict.DIVERGES)
    return (
        f"  {report.arxiv_id:<12} {strip:<8} "
        f"{report.tables_parsed:>3} tables  "
        f"{diverges:>3} diverging  {len(report.not_checked):>3} not checked  "
        f"{(report.title or '')[:44]}"
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pv", description="Check a paper's numbers against each other.")
    p.add_argument("arxiv_id", nargs="?", help="arXiv id, e.g. 1706.03762")
    p.add_argument("--fixture", help="run against an on-disk directory instead of fetching")
    p.add_argument("--corpus", help="run every paper directory under this path")
    p.add_argument("--checks", default=",".join(DEFAULT_CHECKS))
    p.add_argument("--offline", action="store_true", help="never touch the network")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args(argv)

    checks = tuple(c.strip() for c in args.checks.split(",") if c.strip())

    if args.corpus:
        root = Path(args.corpus)
        dirs = sorted(d for d in root.iterdir() if d.is_dir())
        print(f"Checking {len(dirs)} papers from {root}\n")
        failures = 0
        for d in dirs:
            try:
                report = run_paper(d.name, from_directory=str(d), checks=checks)
                print(summarise(report))
            except Exception as exc:  # noqa: BLE001 - one bad paper must not stop the run
                failures += 1
                print(f"  {d.name:<12} run failed: {type(exc).__name__}: {exc}")
        print(f"\n{len(dirs) - failures}/{len(dirs)} papers completed")
        return 1 if failures else 0

    if not args.arxiv_id:
        p.error("give an arXiv id, or use --corpus")

    report = run_paper(
        args.arxiv_id,
        from_directory=args.fixture,
        checks=checks,
        allow_network=not args.offline,
    )
    print(render(report, verbose=args.verbose))
    return 0


if __name__ == "__main__":
    sys.exit(main())
