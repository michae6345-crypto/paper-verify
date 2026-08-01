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
    # Check 3: the stated average cannot be reproduced by the unweighted mean, but a
    # plausible weighting or subset could produce it, so we cannot call it wrong.
    # The comparison is still attached as evidence — see CheckResult.findings.
    AVERAGE_DENOMINATOR_AMBIGUOUS = "average_denominator_ambiguous"
    # The checker itself raised. Never fails the run.
    CHECKER_ERROR = "checker_error"
    # Check 6: present in neither Crossref nor OpenAlex. The most common citation
    # outcome and NOT evidence of a bad reference — workshop papers, theses, and
    # arXiv-only preprints are routinely absent from both.
    REFERENCE_NOT_INDEXED = "reference_not_indexed"
    # Check 1: the bolded cell holds several numbers (BERT bolds "86.7/85.9"), so
    # there is no single value to be the best of. Never skip such a cell silently —
    # if we decline to judge it, the report has to say so.
    CELL_HAS_MULTIPLE_VALUES = "cell_has_multiple_values"
    # The paper contains nothing this check applies to — no average columns, no
    # URLs, no bibliography. Pairs with Verdict.NOT_ATTEMPTED. A normal outcome,
    # not a failure, and it must not read as one.
    NO_APPLICABLE_CLAIMS = "no_applicable_claims"
    # The submitted identifier is not a well-formed arXiv id. Distinct from
    # NO_LATEX_SOURCE, which means a real paper that ships no LaTeX.
    INVALID_PAPER_ID = "invalid_paper_id"


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
    # The cell's single value, when it has exactly one. None for empty cells
    # ("not reported", never zero) and for cells holding several numbers.
    value: float | None = None
    # Every number in the cell, in order. A cell may legitimately hold more than
    # one: BERT's GLUE table writes MNLI matched/mismatched as "86.7/85.9", and
    # its Average column is the mean of nine values across eight columns.
    # Reading only the first produces five false divergences on that table.
    # Invariant: when len(values) == 1, value == values[0].
    values: list[float] = Field(default_factory=list)
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
    # How the header row was established: "rule" | "inferred" | "none".
    # Mirrors Column.direction_source. Deliberately NOT a parse_warning — a
    # warning here would suppress the very checks the inference exists to recover.
    header_source: str = "none"
    # True for a tabular nested inside another table's cell. Authors use these to
    # stack two lines of text, not to present data: DenseNet has seven. They carry
    # no findings, and counting them makes `tables_parsed` overstate the paper.
    is_nested: bool = False
    # Set when the parser could not fully resolve the structure. Checks must
    # return unverifiable/TABLE_STRUCTURE_NOT_PARSED rather than guess.
    parse_warnings: list[str] = Field(default_factory=list)

    def column_cells(self, col: int) -> list[Cell]:
        return [c for c in self.cells if c.col == col and not c.is_header]


class Artifact(BaseModel):
    """A code repository found in the paper. Feeds the §5.2 confirmation screen,
    which shows repo path, stars, last commit, and where the link appeared."""

    kind: Literal["github", "gitlab", "other"] = "github"
    url: str
    # "tensorflow/tensor2tensor" — shown in mono as the primary label.
    path: str = ""
    stars: int | None = None
    last_commit: datetime | None = None
    # Left None until a repository is confirmed: resolving it costs a second
    # GitHub request per candidate, against a 60/hour unauthenticated budget.
    commit_sha: str | None = None
    # An archived repository is a meaningful signal when choosing one to run against.
    archived: bool | None = None
    # Where in the paper the link appeared, e.g. "§4.1, footnote 3".
    found_at: str = ""
    anchor: Anchor | None = None
    # 0..1. The highest-confidence candidate is preselected when confidence is high.
    confidence: float = 0.0
    # Set when metadata lookup failed (e.g. GitHub 403 without a token). The
    # candidate stays in the list; the UI just shows no stars.
    lookup_error: str | None = None


ClaimKind = Literal["abstract_number", "body_number", "comparative", "citation", "link"]


class Claim(BaseModel):
    """One checkable assertion in a paper.

    Mined deterministically by `pv.claims.mine`. Checkers evaluate claims rather
    than re-scanning the document, which is what turns a run into rows worth
    keeping instead of a report that is discarded.
    """

    kind: ClaimKind
    locator: str
    verbatim: str
    anchor: Anchor
    value: float | None = None
    normalized: dict = Field(default_factory=dict)
    # sha256 over (kind, anchor.dom_id, verbatim, value). The identity of the
    # claim itself, independent of when or how it was checked — §14.1's
    # "same inputs, same verdict, forever" rests on this being stable.
    content_hash: str = ""


class Observation(BaseModel):
    """What a checker measured. Carries no judgement (§14.1, invariant 2).

    Splitting this from CheckResult is what lets a tolerance policy be revised
    and replayed over stored observations, instead of re-running every check on
    every paper.
    """

    claim_id: str  # Claim.content_hash
    checker: str
    checker_version: str
    status: Literal["ok", "not_applicable", "insufficient_data", "error"]
    # e.g. {"claimed": 87.4, "computed": 84.1, "unit": "pp"}
    measured: dict = Field(default_factory=dict)
    provenance: list[Anchor] = Field(default_factory=list)
    reason: ReasonCode | None = None
    detail: str = ""


class MacroDef(BaseModel):
    """A \\newcommand/\\def definition. `n_args` is what a flat name->body dict
    cannot express, and bold detection needs it: \\mbf takes an argument, so
    expanding it without consuming that argument corrupts the cell."""

    name: str  # without the leading backslash
    body: str
    n_args: int = 0


class FileSpan(BaseModel):
    """Where one source file landed inside `assembled_latex`, so a character
    offset can be turned back into "results.tex, line 41" for a human locator."""

    file_name: str
    start: int
    end: int


class SourceDocument(BaseModel):
    """Output of the ingest stage: one paper's LaTeX, fully assembled."""

    arxiv_id: str
    version: str | None = None
    title: str = ""
    abstract: str = ""
    # All \input/\include resolved into one string. Only files reachable from the
    # \documentclass file — tarballs routinely carry stale .tex from other papers.
    assembled_latex: str = ""
    # Flat name -> body, kept for convenience. Loses argument counts.
    macros: dict[str, str] = Field(default_factory=dict)
    # Authoritative macro table. Prefer this for expansion.
    macro_defs: dict[str, MacroDef] = Field(default_factory=dict)
    # Offset map for `assembled_latex`, in order.
    segments: list[FileSpan] = Field(default_factory=list)
    source_hash: str = ""
    fetched_at: datetime | None = None
    file_names: list[str] = Field(default_factory=list)
    # Set when the paper was ingested but something is missing — e.g. a PDF-only
    # submission yields a valid document with NO_LATEX_SOURCE. The runner copies
    # this into the run's `not_checked` list.
    ingest_reason: ReasonCode | None = None
    ingest_detail: str = ""


# --------------------------------------------------------------------------
# Run / check / finding
# --------------------------------------------------------------------------


class Finding(BaseModel):
    severity: Severity = Severity.MEDIUM
    claimed: str | None = None
    computed: str | None = None
    delta: str | None = None
    anchor: Anchor
    # The paper's own words, quoted. §5.4 sets this in serif above the comparison
    # block — it is the claim being examined, not our description of it. Distinct
    # from `explanation`, which is the checker's sentence. Empty when the claim is
    # a table cell rather than prose; the anchor locates it either way.
    verbatim: str = ""
    # One line of plain English. Shown in the verdict pane (§5.4).
    explanation: str = ""


class CheckResult(BaseModel):
    """One check's terminal result. Append-only — never mutated.

    Pending/running are UI states derived from the run manifest, not stored here.
    """

    checker: str
    checker_version: str
    # Which tolerance policy produced this verdict. Part of the identity of the
    # judgement: revising the policy must produce a new row, never edit this one.
    policy_version: str = ""
    # sha256 over (claim_id, checker, checker_version, policy_version,
    # artifact_commit) — see pv.fingerprint. Re-running looks these up and
    # executes only the misses, so accuracy compounds without reprocessing.
    fingerprint: str = ""
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
    # The parsed tables, so the document pane can render what the checks examined
    # and give every cell the DOM id its anchor points at. Without this the gutter
    # has nothing to align to. Excludes nested layout tabulars.
    tables: list[Table] = Field(default_factory=list)
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
