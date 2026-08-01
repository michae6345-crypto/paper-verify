/**
 * GENERATED FILE — do not edit.
 *
 * Source: fixtures/reports/run-report.schema.json (emitted from backend/pv/models.py).
 * Regenerate with: npm run types:generate
 */

export type ArxivId = string;
export type Title = string;
export type SchemaVersion = number;
export type Checker = string;
export type CheckerVersion = string;
export type Verdict = "matches" | "within_tolerance" | "diverges" | "unverifiable" | "not_attempted";
/**
 * Why something could not be checked. Surfaced verbatim in the §5.5
 * "not checked" section, so every value needs a human-readable label in the UI.
 */
export type ReasonCode =
  | "no_code_repository"
  | "dataset_not_public"
  | "table_structure_not_parsed"
  | "no_latex_source"
  | "llm_disabled"
  | "rate_limited"
  | "metric_direction_unknown"
  | "multiple_bold_in_column"
  | "cell_spans_columns"
  | "no_numeric_values"
  | "network_error"
  | "average_denominator_ambiguous"
  | "checker_error"
  | "reference_not_indexed"
  | "cell_has_multiple_values"
  | "no_applicable_claims"
  | "invalid_paper_id";
export type Severity = "high" | "medium" | "low";
export type Claimed = string | null;
export type Computed = string | null;
export type Delta = string | null;
export type Kind = "table_cell" | "table" | "sentence" | "reference" | "link";
export type DomId = string;
export type TableLabel = string | null;
export type Row = number | null;
export type Col = number | null;
export type CharStart = number | null;
export type CharEnd = number | null;
export type HumanLocator = string;
export type Verbatim = string;
export type Explanation = string;
export type Findings = Finding[];
export type DisplayName = string;
export type Description = string;
export type DurationMs = number | null;
export type CreatedAt = string | null;
export type Checks = CheckResult[];
export type What = string;
export type Detail = string;
export type NotChecked = NotChecked1[];
export type Label = string | null;
export type Caption = string;
export type Index = number;
export type Header = string;
export type Metric = string | null;
/**
 * Whether a higher or lower value is better for a metric column.
 */
export type Direction = "higher_is_better" | "lower_is_better" | "unknown";
export type DirectionSource = string | null;
export type IsSpacer = boolean;
export type Columns = Column[];
export type Row1 = number;
export type Col1 = number;
export type RawLatex = string;
export type Text = string;
export type Value = number | null;
export type Values = number[];
export type IsBold = boolean;
export type BoldSource = string | null;
export type Colspan = number;
export type Rowspan = number;
export type Block = number;
export type IsHeader = boolean;
export type Cells = Cell[];
export type NRows = number;
export type NCols = number;
export type LatexSource = string;
export type HeaderSource = string;
export type IsNested = boolean;
export type ParseWarnings = string[];
export type Tables = Table[];
export type TablesParsed = number;
export type StartedAt = string | null;
export type FinishedAt = string | null;

/**
 * What the headless CLI prints and what the API returns for a run.
 */
export interface RunReport {
  arxiv_id: ArxivId;
  title?: Title;
  schema_version?: SchemaVersion;
  checks?: Checks;
  not_checked?: NotChecked;
  tables?: Tables;
  tables_parsed?: TablesParsed;
  started_at?: StartedAt;
  finished_at?: FinishedAt;
}
/**
 * One check's terminal result. Append-only — never mutated.
 *
 * Pending/running are UI states derived from the run manifest, not stored here.
 */
export interface CheckResult {
  checker: Checker;
  checker_version: CheckerVersion;
  verdict: Verdict;
  reason?: ReasonCode | null;
  findings?: Findings;
  display_name?: DisplayName;
  description?: Description;
  duration_ms?: DurationMs;
  created_at?: CreatedAt;
}
export interface Finding {
  severity?: Severity;
  claimed?: Claimed;
  computed?: Computed;
  delta?: Delta;
  anchor: Anchor;
  verbatim?: Verbatim;
  explanation?: Explanation;
}
export interface Anchor {
  kind: Kind;
  dom_id: DomId;
  table_label?: TableLabel;
  row?: Row;
  col?: Col;
  char_start?: CharStart;
  char_end?: CharEnd;
  human_locator?: HumanLocator;
}
export interface NotChecked1 {
  what: What;
  reason: ReasonCode;
  detail?: Detail;
}
export interface Table {
  label?: Label;
  caption?: Caption;
  anchor: Anchor;
  columns?: Columns;
  cells?: Cells;
  n_rows?: NRows;
  n_cols?: NCols;
  latex_source?: LatexSource;
  header_source?: HeaderSource;
  is_nested?: IsNested;
  parse_warnings?: ParseWarnings;
}
export interface Column {
  index: Index;
  header?: Header;
  metric?: Metric;
  direction?: Direction;
  direction_source?: DirectionSource;
  is_spacer?: IsSpacer;
}
/**
 * One `tabular` cell after macro expansion and cleanup.
 *
 * `value` is None when the cell holds no parseable number — including empty
 * cells, which in ML tables mean "not reported", never zero.
 */
export interface Cell {
  row: Row1;
  col: Col1;
  raw_latex: RawLatex;
  text: Text;
  value?: Value;
  values?: Values;
  is_bold?: IsBold;
  bold_source?: BoldSource;
  colspan?: Colspan;
  rowspan?: Rowspan;
  block?: Block;
  is_header?: IsHeader;
}
