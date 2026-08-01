"""Numeric extraction from cleaned cell content.

Every number in a cell is reported, in source order, and the scalar `Cell.value`
is set only when there is exactly one of them. `86.7/85.9` (BERT's MNLI-(m/mm)
column) yields `values=[86.7, 85.9]` and `value=None`: silently taking the first
number makes the Average column a mean of eight values instead of nine and
produces five false `diverges` on BERT — see fixtures/GROUND_TRUTH.md case 2.
"""

from __future__ import annotations

import re

# A number never starts or ends flush against a letter: `ConvS2S` is a model
# name, not the value 2, and `10^20` is handled by the exponent patterns below.
_NUM = r"[-+]?\d+(?:\.\d+)?"
# Also excludes digits and `.` so a match cannot start part-way through a number.
_NOT_LETTER_BEFORE = r"(?<![A-Za-z0-9.])"
_NOT_LETTER_AFTER = r"(?![A-Za-z])"

# 3.3\cdot10^{18}, 2.3\times10^19, 1.0 * 10^20, 1.0·10^20
_SCI = re.compile(
    rf"{_NOT_LETTER_BEFORE}({_NUM})\s*(?:\\cdot|\\times|\*|×|·)\s*10\s*\^\s*\{{?\s*([-+]?\d+)\s*\}}?"
)
# 1.0e20, 3E-4
_ENOT = re.compile(rf"{_NOT_LETTER_BEFORE}({_NUM})[eE]([-+]?\d+)(?![\d.A-Za-z])")
# a bare 10^{6}, as in a "params $\times10^6$" header
_POW = re.compile(rf"{_NOT_LETTER_BEFORE}10\s*\^\s*\{{?\s*([-+]?\d+)\s*\}}?")
# 100K, 8.5k, 1.2M — standard magnitude suffixes. Reading k as 10^3 is a
# convention, not an inference about what the number means.
_SUFFIX = re.compile(rf"{_NOT_LETTER_BEFORE}({_NUM})\s*([KkMmGgBb])(?![A-Za-z0-9])")
_PLAIN = re.compile(rf"{_NOT_LETTER_BEFORE}{_NUM}{_NOT_LETTER_AFTER}")

_SUFFIX_EXP = {"k": 3, "m": 6, "g": 9, "b": 9}

_PLACEHOLDER = "\x00"


def _is_name_suffix(m: re.Match[str]) -> bool:
    """True when a bare number is the tail of a name: the `2` of `SST-2`, the `1`
    of `top-1`, the `101` of `ResNet-101`. The hyphen is part of the identifier,
    not a minus sign, so there is no value here to report."""
    start = m.start()
    text = m.string
    return start >= 2 and text[start - 1] in "-+" and text[start - 2].isalpha()


def find_values(math_text: str) -> list[float]:
    """All numeric expressions in `math_text`, in source order.

    `math_text` must come from `clean_latex(..., math=True)` so that `\\cdot`,
    `\\times` and `^` survive. Junk such as `\\rule{0pt}{2.0ex}` must already be
    gone, or its `0` and `2.0` would be counted.
    """
    # Fold the multiplication commands to their symbols first, so that the
    # "not preceded by a letter" guards see `×` rather than the `s` of `\times`.
    s = math_text.replace("\\cdot", "·").replace("\\times", "×")
    found: list[tuple[int, float]] = []

    def take(pattern: re.Pattern[str], to_value, skip=None) -> None:
        nonlocal s
        out = []
        last = 0
        for m in pattern.finditer(s):
            if skip is not None and skip(m):
                continue
            try:
                value = to_value(m)
            except (ValueError, OverflowError):
                continue
            found.append((m.start(), value))
            out.append(s[last : m.start()])
            out.append(_PLACEHOLDER * (m.end() - m.start()))
            last = m.end()
        out.append(s[last:])
        s = "".join(out)

    # Composed as a literal rather than multiplied: 1.4 * 10**20 lands on
    # 1.3999999999999998e20, which would surface in a finding as a bogus delta.
    take(_SCI, lambda m: float(f"{m.group(1)}e{int(m.group(2))}"))
    take(_ENOT, lambda m: float(f"{m.group(1)}e{int(m.group(2))}"))
    take(_POW, lambda m: float(f"1e{int(m.group(1))}"))
    take(_SUFFIX, lambda m: float(f"{m.group(1)}e{_SUFFIX_EXP[m.group(2).lower()]}"))
    take(_PLAIN, lambda m: float(m.group(0)), skip=_is_name_suffix)

    return [v for _, v in sorted(found)]


def extract(math_text: str) -> tuple[float | None, list[float]]:
    """Return (value, all_values). `value` is set only when there is exactly one."""
    values = find_values(math_text)
    return (values[0] if len(values) == 1 else None, values)
