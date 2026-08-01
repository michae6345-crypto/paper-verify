"""Discovery and execution of checks.

Every check module exposes:

    CHECKER_NAME: str
    CHECKER_VERSION: str
    DISPLAY_NAME: str
    DESCRIPTION: str          # one plain-English line, shown in the UI (BRIEF §5.4)
    run(ctx: CheckContext) -> CheckResult

`run_all` executes them in a fixed order and never lets one check take down a run:
a module that does not exist yet is skipped, and a check that raises is converted to
`unverifiable` rather than propagating.
"""

from __future__ import annotations

import importlib
import time
from datetime import datetime, timezone
from types import ModuleType

from ..models import CheckContext, CheckResult, Verdict

# Fixed order so a run report reads the same way every time. Modules that do not
# exist yet are simply absent — other workstreams are still landing theirs.
CHECK_MODULES: tuple[str, ...] = (
    "bold_extreme",
    "row_arithmetic",
    "links",
    "citations",
    "repos",
)

_REQUIRED = ("CHECKER_NAME", "CHECKER_VERSION", "run")


def _is_check_module(module: ModuleType) -> bool:
    return all(hasattr(module, attribute) for attribute in _REQUIRED) and callable(module.run)


def discover(names: tuple[str, ...] = CHECK_MODULES) -> list[ModuleType]:
    """Import the check modules that are present and complete.

    Missing modules and half-written stubs are skipped rather than raising, so
    the arithmetic checks can run before the rest of the suite exists.
    """
    modules: list[ModuleType] = []
    for name in names:
        try:
            module = importlib.import_module(f"{__package__}.{name}")
        except ImportError:
            continue
        if _is_check_module(module):
            modules.append(module)
    return modules


def _unverifiable(module: ModuleType, detail: str, elapsed_ms: int) -> CheckResult:
    return CheckResult(
        checker=getattr(module, "CHECKER_NAME", module.__name__.rsplit(".", 1)[-1]),
        checker_version=getattr(module, "CHECKER_VERSION", "0"),
        verdict=Verdict.UNVERIFIABLE,
        # No ReasonCode covers "the checker itself failed" — see the final report.
        reason=None,
        display_name=getattr(module, "DISPLAY_NAME", ""),
        description=detail,
        duration_ms=elapsed_ms,
        created_at=datetime.now(timezone.utc),
    )


def run_check(module: ModuleType, ctx: CheckContext) -> CheckResult:
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
    return [run_check(module, ctx) for module in discover(names)]


__all__ = ["CHECK_MODULES", "discover", "run_all", "run_check"]
