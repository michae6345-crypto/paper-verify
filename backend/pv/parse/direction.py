"""Metric name and optimisation direction, from the column header only.

Order of resolution, per CLAUDE.md:

  1. `↑` / `↓` arrows in the header  -> direction_source "arrow"
  2. an explicit "(higher is better)" / "(lower is better)" phrase -> "caption"
  3. a curated metric-name lookup   -> direction_source "lookup"
  4. otherwise Direction.UNKNOWN, direction_source None

The caption is deliberately *not* consulted for step 3. ResNet's headers are
literally `plain` and `ResNet`; the word "error" appears only in its caption and
prose. Reading direction out of that is inference, not parsing, so the honest
answer is UNKNOWN and check 1 returns unverifiable /
METRIC_DIRECTION_UNKNOWN — see fixtures/GROUND_TRUTH.md case 3.
"""

from __future__ import annotations

import re

from pv.models import Direction

# Curated lookup. Keys are matched as whole words (or as substrings for the
# multi-word entries) against the assembled column header, lower-cased.
HIGHER_IS_BETTER: tuple[str, ...] = (
    "bleu",
    "rouge",
    "meteor",
    "chrf",
    "accuracy",
    "acc",
    "top-1 acc",
    "top-5 acc",
    "f1",
    "auc",
    "auroc",
    "map",
    "miou",
    "iou",
    "dice",
    "precision",
    "recall",
    "psnr",
    "ssim",
    "spearman",
    "pearson",
    "correlation",
    "score",
    "win rate",
    "pass@1",
    "exact match",
    "em",
    "r@1",
    "recall@1",
    "mrr",
    "ndcg",
)

LOWER_IS_BETTER: tuple[str, ...] = (
    "ppl",
    "perplexity",
    "fid",
    "wer",
    "cer",
    "per",
    "mse",
    "rmse",
    "mae",
    "nll",
    "loss",
    "error",
    "err",
    "error rate",
    "eer",
    "latency",
    "flops",
    "training cost",
    "params",
    "parameters",
    "memory",
    "runtime",
    "inference time",
    "bpc",
    "bits per character",
)

_WORD = re.compile(r"[a-z0-9@+_.-]+")

_ARROW_UP = ("\\uparrow", "↑", "\\Uparrow")
_ARROW_DOWN = ("\\downarrow", "↓", "\\Downarrow")

_PHRASE_UP = ("higher is better", "larger is better", "higher the better")
_PHRASE_DOWN = ("lower is better", "smaller is better", "lower the better")


def _tokens(header: str) -> set[str]:
    return set(_WORD.findall(header.lower()))


def _match(header_lower: str, tokens: set[str], names: tuple[str, ...]) -> str | None:
    for name in names:
        if " " in name:
            if name in header_lower:
                return name
        elif name in tokens:
            return name
    return None


def resolve(raw_header: str, clean_header: str) -> tuple[str | None, Direction, str | None]:
    """Return (metric, direction, direction_source).

    `raw_header` is the header with LaTeX intact, so `\\uparrow` is still visible.
    `clean_header` is the display text.
    """
    lower = clean_header.lower()
    tokens = _tokens(clean_header)

    up = _match(lower, tokens, HIGHER_IS_BETTER)
    down = _match(lower, tokens, LOWER_IS_BETTER)
    metric = (up or down or "").upper() or None
    if metric:
        metric = metric.strip("-").upper()

    # 1. arrows
    has_up = any(a in raw_header for a in _ARROW_UP) or "↑" in clean_header
    has_down = any(a in raw_header for a in _ARROW_DOWN) or "↓" in clean_header
    if has_up and not has_down:
        return metric, Direction.HIGHER_IS_BETTER, "arrow"
    if has_down and not has_up:
        return metric, Direction.LOWER_IS_BETTER, "arrow"
    if has_up and has_down:
        # Contradictory. Refuse to choose.
        return metric, Direction.UNKNOWN, None

    # 2. explicit phrase in the header
    if any(p in lower for p in _PHRASE_UP):
        return metric, Direction.HIGHER_IS_BETTER, "caption"
    if any(p in lower for p in _PHRASE_DOWN):
        return metric, Direction.LOWER_IS_BETTER, "caption"

    # 3. curated lookup
    if up and down:
        # e.g. a header naming both "accuracy" and "error". Do not guess.
        return metric, Direction.UNKNOWN, None
    if up:
        return metric, Direction.HIGHER_IS_BETTER, "lookup"
    if down:
        return metric, Direction.LOWER_IS_BETTER, "lookup"

    return None, Direction.UNKNOWN, None
