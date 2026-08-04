/**
 * The catalogue of checks: the four that run today, the three the brief
 * specifies, and the twenty-eight in the backlog.
 *
 * Sources, so every line here is traceable and nothing is invented:
 *
 *   `runs today`         `backend/pv/checks/*.py`. The four modules that exist.
 *                        `name` and `what` are the modules' own DISPLAY_NAME and
 *                        DESCRIPTION, copied verbatim — not bound, so if they
 *                        change there they must be changed here. Two of the four
 *                        also carry those strings inside the committed reports,
 *                        and the detail screen prefers the report's copy when it
 *                        has one, exactly as `components/site/checks.tsx` does.
 *   `specified`          `docs/BRIEF.md` §9, checks 4, 5 and 7.
 *   `planned`            `docs/CHECKS_BACKLOG.md`, groups A to D.
 *
 * **Nothing outside the first four is built.** The state on every other entry
 * says so in words, the catalogue never gives an unbuilt check a verdict, and no
 * screen in this directory may render one as though it had run. `needs` is what
 * would have to exist first, and it is the honest part of the entry: a check
 * with four unmet prerequisites is a check that is further away than its effort
 * letter suggests.
 */

export type CheckState = "runs" | "specified" | "planned";

export const STATE_LABEL: Record<CheckState, string> = {
  runs: "runs today",
  specified: "specified, not built",
  planned: "not built",
};

export type SectionId =
  | "today"
  | "specified"
  | "internal"
  | "statistical"
  | "integrity"
  | "bibliography";

export type CatalogSection = {
  id: SectionId;
  title: string;
  /** One line under the section heading. Sentence case, no claim of capability. */
  blurb: string;
  source: string;
};

export const SECTIONS: CatalogSection[] = [
  {
    id: "today",
    title: "Running today",
    blurb: "The four checkers that exist. Two of them appear in the committed corpus.",
    source: "backend/pv/checks",
  },
  {
    id: "specified",
    title: "Specified, not built",
    blurb: "Written up in the brief with a method, waiting on the claim miner or on retrieval.",
    source: "docs/BRIEF.md §9",
  },
  {
    id: "internal",
    title: "Internal numerical consistency",
    blurb:
      "Recomputing a stated quantity from other stated quantities. Same shape as the two that run today: no model, no network.",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },
  {
    id: "statistical",
    title: "Statistical validity",
    blurb:
      "The backlog's headline recommendation. Arithmetic on numbers already printed on the page, and the hard part is knowing when it applies.",
    source: "docs/CHECKS_BACKLOG.md, group B",
  },
  {
    id: "integrity",
    title: "Submission integrity",
    blurb:
      "Properties of the compiled document rather than of the LaTeX. All of it waits on a PDF ingest path.",
    source: "docs/CHECKS_BACKLOG.md, group C",
  },
  {
    id: "bibliography",
    title: "Bibliography and artifacts",
    blurb: "Set arithmetic over the reference list, and identifiers resolved against their registries.",
    source: "docs/CHECKS_BACKLOG.md, group D",
  },
];

export type CatalogEntry = {
  slug: string;
  name: string;
  /** The backend checker id, when there is one. Only the four shipped have it. */
  checker?: string;
  state: CheckState;
  section: SectionId;
  /** What it does, in one or two sentences. */
  what: string;
  /** What has to exist before it can run. */
  needs: string[];
  /** What a reader learns from it, stated as a question it answers. */
  tells: string;
  /** The backlog's own effort letter, where it gives one. */
  effort?: "S" | "M" | "L";
  /** Where this entry's description came from. Rendered on the detail screen. */
  source: string;
  /** Its position in the backlog's suggested order, where it has one. */
  queue?: number;
  /**
   * `POLICY_KEYS` from the checker module. An empty list means the check takes no
   * tolerance policy at all, which is a real difference between these four: a
   * link either resolves or it does not, and there is nothing to set a tolerance
   * on.
   */
  policyKeys?: string[];
  /** A caution the source document makes explicitly. Rendered as its own block. */
  caution?: string;
};

export const CATALOG: CatalogEntry[] = [
  /* ---------------------------------------------------------------- today -- */
  {
    slug: "bold-extreme",
    checker: "bold_extreme",
    name: "Bolded value is the best in its block",
    state: "runs",
    section: "today",
    what: "Checks that each bolded number is the best value in its column, comparing only within the same rule-delimited block of the table.",
    needs: [
      "LaTeX source with a parseable tabular",
      "the block structure the table's own rules define",
      "a metric direction, from an arrow in the header or the curated lookup",
    ],
    tells: "Whether the value a table emphasises is the best one it prints.",
    source: "backend/pv/checks/bold_extreme.py, v1.0.0",
    policyKeys: ["default"],
    caution:
      "Comparing a bolded value against the whole column instead of against its block produced a false diverges on the Transformer paper. Two bolds in one block returns unverifiable, never a guess.",
  },
  {
    slug: "row-arithmetic",
    checker: "row_arithmetic",
    name: "Average columns match their row",
    state: "runs",
    section: "today",
    what: "Checks that a column labelled average, mean or overall equals the mean of the other numbers in the same row, to the precision they were printed at.",
    needs: [
      "LaTeX source with a parseable tabular",
      "a column the header names as an average",
      "every other number in that row",
    ],
    tells: "Whether a stated average is the mean of the row it sits in.",
    source: "backend/pv/checks/row_arithmetic.py, v1.0.0",
    policyKeys: ["default", "metrics"],
    caution:
      "Reading \"all\" in a column header as \"average\" produced six false findings on ELMo, whose All layers column is a grouping. An unclear denominator returns unverifiable.",
  },
  {
    slug: "dead-links",
    checker: "dead_links",
    name: "Dead links",
    state: "runs",
    section: "today",
    what: "Requests every URL in the paper and reports the ones the server says are gone.",
    needs: ["network access", "at least one URL in the source"],
    tells: "Whether the artifacts a paper points at are still where it says they are.",
    source: "backend/pv/checks/links.py, v1.0.0",
    policyKeys: [],
  },
  {
    slug: "citation-existence",
    checker: "citation_existence",
    name: "Citation existence",
    state: "runs",
    section: "today",
    what: "Looks up each reference in Crossref and OpenAlex and reports confirmed retractions.",
    needs: ["network access", "a parsed bibliography", "Crossref and OpenAlex"],
    tells: "Whether every work cited exists, and whether any of it has been retracted.",
    source: "backend/pv/checks/citations.py, v1.0.0",
    policyKeys: [],
    caution:
      "Matching a citation by title containment once matched \"Attention is all you need\" to \"Is Attention All You Need?\", which would attribute another paper's retraction. Matching is by identifier and scored comparison.",
  },

  /* ------------------------------------------------------------ specified -- */
  {
    slug: "abstract-vs-table",
    name: "Abstract agrees with the tables",
    state: "specified",
    section: "specified",
    what: "Extracts the numbers stated in the abstract, matches each to the cell it refers to, and verifies the difference.",
    needs: [
      "a prose claim miner to bind a sentence to a cell",
      "the model layer, for matching only, never for the verdict",
    ],
    tells: "Whether the headline number in the abstract is the number the table prints.",
    effort: "M",
    source: "docs/BRIEF.md §9, check 4",
    queue: 4,
    caution:
      "The Transformer fixture is the case this is for: the abstract and the results table both say 41.8, and the body of results.tex says 41.0.",
  },
  {
    slug: "missing-variance",
    name: "Missing variance",
    state: "specified",
    section: "specified",
    what: "Detects comparative claims where no seeds, confidence interval or standard deviation is reported.",
    needs: ["claim detection over the body text", "the model layer, for detection only"],
    tells: "Whether a stated improvement comes with any measure of spread.",
    source: "docs/BRIEF.md §9, check 5",
  },
  {
    slug: "baseline-fidelity",
    name: "Baseline fidelity",
    state: "specified",
    section: "specified",
    what: "Compares cited baseline numbers against the values the source paper reports for itself.",
    needs: [
      "retrieval over the cited paper",
      "sentence-transformers, which drags in about 2 GB of torch and is deliberately not installed yet",
      "citation contexts, which Semantic Scholar would supply",
    ],
    tells: "Whether a baseline was copied faithfully out of the work it came from.",
    source: "docs/BRIEF.md §9, check 7",
  },

  /* ------------------------------------------------------------- internal -- */
  {
    slug: "column-totals",
    name: "Column totals",
    state: "planned",
    section: "internal",
    what: "A total row or column equals the sum of its parts. Row arithmetic on the other axis.",
    needs: ["a parsed tabular", "a row or column the header names as a total"],
    tells: "Whether a stated total is the sum of the numbers above it.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group A",
    queue: 1,
  },
  {
    slug: "percentages-sum",
    name: "Percentages sum to 100",
    state: "planned",
    section: "internal",
    what: "Composition tables, ablation splits and confusion-matrix rows add up, within a rounding tolerance.",
    needs: ["a parsed tabular", "a way to tell a composition from a set of unrelated rates"],
    tells: "Whether a set of shares that claims to be exhaustive is exhaustive.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },
  {
    slug: "split-sizes",
    name: "Split sizes sum to the stated total",
    state: "planned",
    section: "internal",
    what: "Train plus validation plus test against the dataset size the paper names.",
    needs: ["the split sizes", "the stated dataset size, which is often in prose rather than a table"],
    tells: "Whether the dataset bookkeeping adds up. Catches leakage-adjacent mistakes.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },
  {
    slug: "same-quantity-twice",
    name: "Same quantity, two places",
    state: "planned",
    section: "internal",
    what: "The same named number reported inconsistently across the abstract, the body and a table.",
    needs: ["a claim miner", "a way to decide two mentions name the same quantity"],
    tells: "Whether a paper says the same thing about itself in every place it says it.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group A",
    caution: "Overlaps check 4. The Transformer fixture's 41.8 against 41.0 is this check's case too.",
  },
  {
    slug: "stated-deltas",
    name: "Stated deltas",
    state: "planned",
    section: "internal",
    what: 'A claim of the form "improves by 2.3 points" against the two cells it refers to.',
    needs: ["a claim miner to find the two cells"],
    tells: "Whether a stated improvement is the difference between the numbers it cites.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },
  {
    slug: "monotonicity",
    name: "Monotonicity claims",
    state: "planned",
    section: "internal",
    what: "A claim that a quantity increases or decreases with another, against the column it cites.",
    needs: ["a claim miner", "the column the claim points at"],
    tells: "Whether a trend the prose asserts is the trend the table shows.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },
  {
    slug: "mean-std-vs-seeds",
    name: "Mean and standard deviation against per-seed numbers",
    state: "planned",
    section: "internal",
    what: "When both the summary and the individual runs are printed, recompute the summary from the runs.",
    needs: ["a table that prints both", "cell parsing that keeps multi-value cells apart"],
    tells: "Whether a reported mean and spread are the mean and spread of the runs beside them.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group A",
    caution: 'Airtight when it applies, which is rarely. Reading "86.7/85.9" as one number is how this check produces a false finding.',
  },
  {
    slug: "parameter-count",
    name: "Parameter count against the architecture table",
    state: "planned",
    section: "internal",
    what: "Derive the parameter count from d_model, d_ff, layers and heads for known architecture families and compare it with the stated count.",
    needs: [
      "a curated table of parameter formulas per architecture family",
      "the architecture hyperparameters, parsed",
    ],
    tells: "Whether the model size a paper states is the size its own architecture table implies.",
    effort: "L",
    source: "docs/CHECKS_BACKLOG.md, group A",
    caution:
      "Deterministic only for architectures whose formula is known, so the default answer is unverifiable and the curated table is the whole check.",
  },
  {
    slug: "compute-claims",
    name: "Compute claims",
    state: "planned",
    section: "internal",
    what: "Stated FLOPs against the 6ND approximation from parameters and tokens.",
    needs: ["a stated parameter count", "a stated token count", "a wide, stated tolerance"],
    tells: "Whether a stated training cost is the right order of magnitude for the model described.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group A",
  },

  /* ---------------------------------------------------------- statistical -- */
  {
    slug: "statcheck",
    name: "statcheck",
    state: "planned",
    section: "statistical",
    what: "Recompute p from the reported test statistic and degrees of freedom. A reported t(38) = 2.1 with p < .01 recomputes to p = .042, and the claim is then wrong.",
    needs: ["the test statistic, its degrees of freedom and the stated p, all parsed from prose"],
    tells: "Whether a reported p-value follows from the statistic the paper prints beside it.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group B",
    queue: 2,
    caution:
      "Run over the psychology literature it found reporting inconsistencies in roughly half of papers. Nobody has pointed it at machine learning at scale.",
  },
  {
    slug: "grim",
    name: "GRIM",
    state: "planned",
    section: "statistical",
    what: "A mean of integer-valued data over n items must be a multiple of 1/n. Reported means that are arithmetically impossible.",
    needs: ["a reported mean", "the n it is over", "evidence that the underlying data are integers"],
    tells: "Whether a reported mean could have come from the data it claims to summarise.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group B",
    queue: 2,
    caution:
      "Designed for integer scales. It does not apply to a mean over continuous measurements, and a checker that runs it anyway produces confident nonsense. Applicability detection is the hard part, not the arithmetic.",
  },
  {
    slug: "grimmer",
    name: "GRIMMER",
    state: "planned",
    section: "statistical",
    what: "The GRIM argument extended to standard deviations.",
    needs: ["a reported standard deviation", "the n", "integer-valued underlying data"],
    tells: "Whether a reported spread is possible for the sample size it claims.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group B",
  },
  {
    slug: "df-vs-n",
    name: "Degrees of freedom against the stated n",
    state: "planned",
    section: "statistical",
    what: "Degrees of freedom imply a sample size; compare that against the n the paper states elsewhere.",
    needs: ["a reported test with its df", "a sample size stated somewhere in the paper"],
    tells: "Whether the sample a test was run on is the sample the paper describes.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group B",
  },
  {
    slug: "effect-size",
    name: "Effect size recomputation",
    state: "planned",
    section: "statistical",
    what: "Cohen's d recomputed from the means and standard deviations printed beside it.",
    needs: ["both group means", "both standard deviations", "both group sizes"],
    tells: "Whether a stated effect size follows from the summary statistics given.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group B",
  },
  {
    slug: "multiple-comparisons",
    name: "Multiple comparisons",
    state: "planned",
    section: "statistical",
    what: "Count the comparisons reported and whether any correction is named.",
    needs: ["a count of reported tests", "a way to recognise a named correction"],
    tells: "Whether the number of tests run is acknowledged anywhere in the paper.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group B",
    caution: "Almost always unverifiable. Worth building for the cases where it is not.",
  },

  /* ------------------------------------------------------------ integrity -- */
  {
    slug: "anonymity",
    name: "Anonymity",
    state: "planned",
    section: "integrity",
    what: "For double-blind venues: an author field still populated, PDF metadata carrying a name, an acknowledgements section, a repository URL containing a username, or a self-citation phrased in the first person.",
    needs: ["a PDF ingest path", "the venue's own anonymity rule"],
    tells: "Whether a submission that is supposed to be anonymous is.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group C",
    queue: 3,
    caution:
      "One of the two most defensible checks in the backlog: binary, currently done by hand or not at all, and it says nothing about the quality of the work.",
  },
  {
    slug: "page-limit",
    name: "Page limit",
    state: "planned",
    section: "integrity",
    what: "Pages excluding references and appendix, counted by the venue's own rule.",
    needs: ["a PDF ingest path", "a venue policy registry, versioned per venue per year"],
    tells: "Whether a submission is within the length its venue allows.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group C",
  },
  {
    slug: "format-compliance",
    name: "Format compliance",
    state: "planned",
    section: "integrity",
    what: "The venue's style file unmodified, margins and font size untouched, and no vertical-space abuse compressing the paper under the limit.",
    needs: ["a PDF ingest path", "the venue's published style file to compare against"],
    tells: "Whether the template was followed or edited.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group C",
  },
  {
    slug: "prompt-injection",
    name: "Prompt injection scan",
    state: "planned",
    section: "integrity",
    what: "Text hidden at zero point size, in white, or positioned off-page, written to steer a model that reads the submission.",
    needs: ["a PDF ingest path with text positions and render properties"],
    tells: "Whether a submission carries instructions meant for a machine reader rather than a human one.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group C",
    queue: 5,
  },
  {
    slug: "checklist-consistency",
    name: "Checklist consistency",
    state: "planned",
    section: "integrity",
    what: 'A submission checklist against the paper. "We report error bars: yes" against whether any table has them.',
    needs: ["the checklist as data, which OpenReview holds", "table parsing that recognises a spread"],
    tells: "Whether the answers a checklist gives are answers the paper supports.",
    effort: "L",
    source: "docs/CHECKS_BACKLOG.md, group C",
  },
  {
    slug: "required-sections",
    name: "Required sections",
    state: "planned",
    section: "integrity",
    what: "An ethics or broader-impact statement present where the venue requires one.",
    needs: ["a venue policy registry"],
    tells: "Whether a section the venue mandates is in the document.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group C",
  },

  /* --------------------------------------------------------- bibliography -- */
  {
    slug: "uncited-references",
    name: "Uncited references",
    state: "planned",
    section: "bibliography",
    what: "A reference in the bibliography that no citation in the body points at, and the reverse.",
    needs: ["the parsed bibliography", "every citation command in the body"],
    tells: "Whether the reference list and the body agree about what this paper cites.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group D",
    queue: 1,
    caution:
      "The cheapest item in the backlog and one of the most topical: it is set arithmetic over two lists both present in the source, and it catches fabricated bibliographies.",
  },
  {
    slug: "doi-resolves",
    name: "DOI resolves and matches",
    state: "planned",
    section: "bibliography",
    what: "Look up the DOI and compare the registry's metadata with the printed reference, by identifier and scored comparison.",
    needs: ["network access", "a DOI on the reference"],
    tells: "Whether a reference describes the work its identifier points at.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group D",
    caution: "Never by title containment. That is how one paper's retraction gets attributed to another.",
  },
  {
    slug: "preprint-superseded",
    name: "Preprint superseded",
    state: "planned",
    section: "bibliography",
    what: "A cited arXiv preprint has since been published with different numbers.",
    needs: ["network access", "version history for the cited preprint"],
    tells: "Whether a cited number has been revised since it was cited.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group D",
  },
  {
    slug: "repository-pinned",
    name: "Repository resolves and is pinned",
    state: "planned",
    section: "bibliography",
    what: "The repository exists, and a commit is named. Extends the existing repository adapter.",
    needs: ["network access", "a GITHUB_TOKEN, because unauthenticated is 60 requests an hour"],
    tells: "Whether the code a paper points at can still be fetched at the state the paper used.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group D",
    caution: "An unpinned repository is unverifiable by construction, and says so rather than passing.",
  },
  {
    slug: "dataset-availability",
    name: "Dataset availability",
    state: "planned",
    section: "bibliography",
    what: "Named datasets resolve to a DOI or a known registry.",
    needs: ["network access", "DataCite or Zenodo", "a way to recognise a dataset name in prose"],
    tells: "Whether the data a paper names can be found by anyone else.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group D",
  },
  {
    slug: "checkpoint-links",
    name: "Checkpoint links resolve",
    state: "planned",
    section: "bibliography",
    what: "Model and dataset links checked against the HuggingFace Hub API.",
    needs: ["network access", "the HuggingFace Hub API"],
    tells: "Whether a published checkpoint is still published.",
    effort: "S",
    source: "docs/CHECKS_BACKLOG.md, group D",
  },
  {
    slug: "declared-dependencies",
    name: "Declared dependencies",
    state: "planned",
    section: "bibliography",
    what: "A stated dependency version against the repository's own requirements file.",
    needs: ["network access", "a resolved repository", "a machine-readable dependency file"],
    tells: "Whether the environment a paper describes is the environment its code declares.",
    effort: "M",
    source: "docs/CHECKS_BACKLOG.md, group D",
  },
];

export function entriesInSection(section: SectionId): CatalogEntry[] {
  return CATALOG.filter((entry) => entry.section === section);
}

export function entryBySlug(slug: string): CatalogEntry | null {
  return CATALOG.find((entry) => entry.slug === slug) ?? null;
}

export const CATALOG_COUNTS = {
  total: CATALOG.length,
  runs: CATALOG.filter((e) => e.state === "runs").length,
  specified: CATALOG.filter((e) => e.state === "specified").length,
  planned: CATALOG.filter((e) => e.state === "planned").length,
};
