/**
 * Pulls an arXiv ID out of whatever the user pasted: a bare ID, `arXiv:1706.03762`,
 * an abs/pdf URL, with or without a version suffix.
 *
 * Returns null rather than guessing. A wrong ID here would run checks against the
 * wrong paper and attribute the result to the wrong authors — the same shape of
 * defect as the citation-title match in CLAUDE.md, so the parse stays strict.
 */
export function parseArxivId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // Modern IDs: 4 digits, dot, 4–5 digits, optional vN.
  const modern = text.match(/(?:^|arxiv[:.\/]|abs\/|pdf\/)(\d{4}\.\d{4,5})(v\d+)?/i);
  if (modern) return modern[1];

  // Legacy IDs: archive/YYMMNNN, e.g. hep-th/9901001.
  const legacy = text.match(/(?:^|arxiv[:.\/]|abs\/|pdf\/)([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  if (legacy) return legacy[1];

  return null;
}
