"""Shared data model. This file is the contract between every part of the system.

Owned by the orchestrator. No agent may edit this file directly — propose changes
to the orchestrator instead. Everything else in the codebase depends on it.

Design rules encoded here, from the brief:
  - There is no boolean pass/fail anywhere. Only `Verdict`.
  - A check that cannot be made deterministic returns `unverifiable` with a
    `ReasonCode`. It never guesses.
  - Results are append-only: supersede with a later `checker_version`, never update.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

# Bump when the meaning of a stored result changes.
SCHEMA_VERSION = 1

# Single source of truth for the pgvector column width (§13).
EMBEDDING_DIM = 384


class Verdict(str, Enum):
    MATCHES = "matches"
    WITHIN_TOLERANCE = "within_tolerance"
    DIVERGES = "diverges"
    UNVERIFIABLE = "unverifiable"
    NOT_ATTEMPTED = "not_attempted"


class ReasonCode(str, Enum):
    """Why something could not be checked. Surfaced verbatim in the §5.5
    "not checked" section, so every value needs a human-readable label in the UI."""

    NO_CODE_REPOSITORY = "no_code_repository"
    DATASET_NOT_PUBLIC = "dataset_not_public"
    TABLE_STRUCTURE_NOT_PARSED = "table_structure_not_parsed"
    NO_LATEX_SOURCE = "no_latex_source"
    LLM_DISABLED = "llm_disabled"
    RATE_LIMITED = "rate_limited"
    # Check 1 specific — see CLAUDE.md "metric direction".
    METRIC_DIRECTION_UNKNOWN = "metric_direction_unknown"
    MULTIPLE_BOLD_IN_COLUMN = "multiple_bold_in_column"
    CELL_SPANS_COLUMNS = "cell_spans_columns"
    NO_NUMERIC_VALUES = "no_numeric_values"
    NETWORK_ERROR = "network_error"


class Direction(str, Enum):
    """Whether a higher or lower value is better for a metric column."""

    HIGHER_IS_BETTER = "higher_is_better"
    LOWER_IS_BETTER = "lower_is_better"
    UNKNOWN = "unknown"


class Severity(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# --------------------------------------------------------------------------
# Anchors — how a finding points at a location in the document.
# The gutter (§2) and the jump-to-anchor behaviour (§5.4) both depend on the
# `dom_id` here matching an element the document renderer emits. Keep them in sync.
# --------------------------------------------------------------------------

AnchorKind = Literal["table_cell", "table", "sentence", "reference", "link"]


class Anchor(BaseModel):
    kind: AnchorKind
    # Stable, human-readable, and URL-safe. Conventions:
    #   table_cell -> "tab:wmt-results/r7/c2"
    #   table      -> "tab:wmt-results"
    #   sentence   -> "sec:results/s14"
    dom_id: str
    table_label: str | None = None
    row: int | None = None
    col: int | None = None
    # Character offsets into the assembled source, for sentence anchors.
    char_start: int | None = None
    char_end: int | None = None
    # What the user should see quoted, e.g. 'Table 3, row 2, column "Ours"'.
    human_locator: str = ""


# --------------------------------------------------------------------------
# Parsed document structures
# --------------------------------------------------------------------------


class Cell(BaseModel):
    """One `tabular` cell after macro expansion and cleanup.

    `value` is None when the cell holds no parseable number — including empty
    cells, which in ML tables mean "not reported", never zero.
    """

    row: int
    col: int
    raw_latex: str
    # Cleaned text with spacing macros (\rule, \vspace) and \citep{...} removed.
    text: str
    value: float | None = None
    is_bold: bool = False
    # How the bold was expressed: textbf | mathbf | boldmath | bf | macro:<name>
    bold_source: str | None = None
    colspan: int = 1
    rowspan: int = 1
    # Index of the rule-delimited block this row belongs to. Check 1 compares
    # only within a block — see CLAUDE.md.
    block: int = 0
    is_header: bool = False


class Column(BaseModel):
    index: int
    header: str = ""
    # Metric name parsed from the header, e.g. "BLEU", "PPL", "FID".
    metric: str | None = None
    direction: Direction = Direction.UNKNOWN
    # How direction was established: arrow | lookup | caption | none
    direction_source: str | None = None
    # True for layout spacer columns, which carry no data and must not be
    # compared. Real tables use these (see the Transformer fixture).
    is_spacer: bool = False


class Table(BaseModel):
    label: str | None = None
    caption: str = ""
    anchor: Anchor
    columns: list[Column] = Field(default_factory=list)
    cells: list[Cell] = Field(default_factory=list)
    n_rows: int = 0
    n_cols: int = 0
    latex_source: str = ""
    # Set when the parser could not fully resolve the structure. Checks must
    # return unverifiable/TABLE_STRUCTURE_NOT_PARSED rather than guess.
    parse_warnings: list[str] = Field(default_factory=list)

    def column_cells(self, col: int) -> list[Cell]:
        return [c for c in self.cells if c.col == col and not c.is_header]


class Claim(BaseModel):
    kind: Literal["abstract_number", "body_number", "comparative", "citation"]
    locator: str
    verbatim: str
    anchor: Anchor
    value: float | None = None
    normalized: dict = Field(default_factory=dict)


class SourceDocument(BaseModel):
    """Output of the ingest stage: one paper's LaTeX, fully assembled."""

    arxiv_id: str
    version: str | None = None
    title: str = ""
    abstract: str = ""
    # All \input/\include resolved into one string.
    assembled_latex: str = ""
    # name -> expansion, from \newcommand/\def. Needed for bold detection.
    macros: dict[str, str] = Field(default_factory=dict)
    source_hash: str = ""
    fetched_at: datetime | None = None
    file_names: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Run / check / finding
# --------------------------------------------------------------------------


class Finding(BaseModel):
    severity: Severity = Severity.MEDIUM
    claimed: str | None = None
    computed: str | None = None
    delta: str | None = None
    anchor: Anchor
    # One line of plain English. Shown in the verdict pane (§5.4).
    explanation: str = ""


class CheckResult(BaseModel):
    """One check's terminal result. Append-only — never mutated.

    Pending/running are UI states derived from the run manifest, not stored here.
    """

    checker: str
    checker_version: str
    verdict: Verdict
    reason: ReasonCode | None = None
    findings: list[Finding] = Field(default_factory=list)
    # Human-readable name and one-line description, shown in the run rail.
    display_name: str = ""
    description: str = ""
    duration_ms: int | None = None
    created_at: datetime | None = None


class NotChecked(BaseModel):
    what: str
    reason: ReasonCode
    detail: str = ""


class RunReport(BaseModel):
    """What the headless CLI prints and what the API returns for a run."""

    arxiv_id: str
    title: str = ""
    schema_version: int = SCHEMA_VERSION
    checks: list[CheckResult] = Field(default_factory=list)
    not_checked: list[NotChecked] = Field(default_factory=list)
    tables_parsed: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None


# --------------------------------------------------------------------------
# Checker interface. Every check implements this. The runner discovers them.
# --------------------------------------------------------------------------


class CheckContext(BaseModel):
    """Everything a checker is allowed to see. If a checker needs something not
    on here, ask the orchestrator to add it rather than reaching outside."""

    document: SourceDocument
    tables: list[Table] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    llm_enabled: bool = True
