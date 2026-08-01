"""Discovery and execution of checks.

Every check module exposes:

    CHECKER_NAME: str
    CHECKER_VERSION: str
    DISPLAY_NAME: str
    DESCRIPTION: str          # one plain-English line, shown in the UI (BRIEF §5.4)
    POLICY_KEYS: tuple[str, ...]              # tolerance entries it reads (§14.3)
    applies(claim: Claim, ctx: CheckContext) -> bool
    observe(claim: Claim, ctx: CheckContext) -> Observation
    run(ctx: CheckContext) -> CheckResult

`run_all` executes them in a fixed order and never lets one check take down a run:
a check that raises is converted to `unverifiable`, and a module that is missing or
malformed is converted to `not_attempted / checker_error` rather than propagating.

**A check never vanishes.** Discovery used to drop an absent or half-written module
silently, which is the recurring defect of this codebase (CLAUDE.md) one layer up:
a lossy reading of the inputs — here, of which checks exist — producing a report
that reads complete when it is not. §14.0 calls it the most urgent gap. A name that
does not resolve to a usable module now comes back as `MissingChecker`, which
behaves like a module and returns a row saying exactly what happened.
"""

from __future__ import annotations

import importlib
import time
from datetime import datetime, timezone
from types import ModuleType

from ..models import CheckContext, CheckResult, ReasonCode, Verdict

# Fixed order so a run report reads the same way every time. Every name here is a
# check: a name that does not resolve produces a `not_attempted` row, so this
# tuple is a promise about what a run reports on, not a wish list.
#
# `repos` is deliberately absent. It proposes candidate repositories for the §5.2
# confirmation screen and exposes no `run(ctx)` by design — it is not a check and
# never produces a verdict, so listing it here would manufacture a `checker_error`
# row for a module that is working exactly as intended.
CHECK_MODULES: tuple[str, ...] = (
    "bold_extreme",
    "row_arithmetic",
    "links",
    "citations",
)

_REQUIRED = ("CHECKER_NAME", "CHECKER_VERSION", "run")


class MissingChecker:
    """A check module that could not be loaded, in the shape of one.

    Quacks like a check module — `CHECKER_NAME`, `run(ctx)` and the rest — so that
    every caller of `discover` reports it without needing to know it is a stand-in.
    That is the point: the row appears in the CLI report, in the API manifest and in
    the SSE stream through the code paths that already exist.

    The verdict is `not_attempted`, not `unverifiable`: nothing about the paper was
    examined, so there is nothing to be unable to verify. §5.5 renders it as
    "not checked", which is what actually happened.
    """

    CHECKER_VERSION = "0"
    DISPLAY_NAME = ""
    POLICY_KEYS: tuple[str, ...] = ()

    def __init__(self, name: str, detail: str) -> None:
        self.CHECKER_NAME = name
        self.__name__ = name
        self.DESCRIPTION = detail
        self.detail = detail

    def applies(self, claim, ctx: CheckContext) -> bool:  # noqa: ARG002
        return False

    def run(self, ctx: CheckContext) -> CheckResult:  # noqa: ARG002
        return CheckResult(
            checker=self.CHECKER_NAME,
            checker_version=self.CHECKER_VERSION,
            verdict=Verdict.NOT_ATTEMPTED,
            reason=ReasonCode.CHECKER_ERROR,
            description=self.detail,
        )


# A discovered check is either a real module or the stand-in for one that is not.
Checker = ModuleType | MissingChecker


def _is_check_module(module: ModuleType) -> bool:
    return all(hasattr(module, attribute) for attribute in _REQUIRED) and callable(module.run)


def _missing(name: str, reason: str) -> MissingChecker:
    return MissingChecker(name, f"This check could not be loaded: {reason}.")


def discover(names: tuple[str, ...] = CHECK_MODULES) -> list[Checker]:
    """Resolve check names to modules, one entry per name, in the order given.

    A name that does not import, or that imports to something missing part of the
    checker interface, yields a `MissingChecker` rather than nothing. Discovery
    returns as many entries as it was asked for — always.
    """
    found: list[Checker] = []
    for name in names:
        try:
            module = importlib.import_module(f"{__package__}.{name}")
        except Exception as exc:  # noqa: BLE001 — a bad module must not fail the run.
            # ImportError for absent, SyntaxError and friends for half-written.
            found.append(_missing(name, f"{type(exc).__name__} on import"))
            continue
        if not _is_check_module(module):
            absent = [a for a in _REQUIRED if not hasattr(module, a)]
            found.append(
                _missing(
                    name,
                    "the module does not implement the checker interface"
                    + (f" (missing {', '.join(absent)})" if absent else ""),
                )
            )
            continue
        found.append(module)
    return found


def _unverifiable(module: Checker, detail: str, elapsed_ms: int) -> CheckResult:
    return CheckResult(
        checker=getattr(module, "CHECKER_NAME", module.__name__.rsplit(".", 1)[-1]),
        checker_version=getattr(module, "CHECKER_VERSION", "0"),
        verdict=Verdict.UNVERIFIABLE,
        reason=ReasonCode.CHECKER_ERROR,
        display_name=getattr(module, "DISPLAY_NAME", ""),
        description=detail,
        duration_ms=elapsed_ms,
        created_at=datetime.now(timezone.utc),
    )


def run_check(module: Checker, ctx: CheckContext) -> CheckResult:
    """Run one check, converting any failure into an `unverifiable` result."""
    started = time.perf_counter()
    try:
        result = module.run(ctx)
    except Exception as exc:  # noqa: BLE001 — one check must never fail the run.
        elapsed = int((time.perf_counter() - started) * 1000)
        return _unverifiable(
            module,
            f"This check could not be completed: {type(exc).__name__}.",
            elapsed,
        )

    elapsed = int((time.perf_counter() - started) * 1000)
    if not isinstance(result, CheckResult):
        return _unverifiable(module, "This check returned no usable result.", elapsed)

    if result.duration_ms is None:
        result = result.model_copy(update={"duration_ms": elapsed})
    if result.created_at is None:
        result = result.model_copy(update={"created_at": datetime.now(timezone.utc)})
    if not result.display_name:
        result = result.model_copy(
            update={"display_name": getattr(module, "DISPLAY_NAME", "")}
        )
    if not result.description:
        result = result.model_copy(
            update={"description": getattr(module, "DESCRIPTION", "")}
        )
    return result


def run_all(ctx: CheckContext, names: tuple[str, ...] = CHECK_MODULES) -> list[CheckResult]:
    """One `CheckResult` per requested name, in order. Never fewer."""
    return [run_check(module, ctx) for module in discover(names)]


__all__ = ["CHECK_MODULES", "Checker", "MissingChecker", "discover", "run_all", "run_check"]
