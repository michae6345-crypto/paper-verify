# Corpus provenance

Ten papers' LaTeX source, fetched from arXiv and committed here as test fixtures. They
are the ground truth the checkers are validated against (brief §11: "verify against 10
papers by hand before writing any UI").

Only `.tex`, `.bbl`, `.bib`, `.sty` and `.cls` are kept. Figures are discarded.

| arXiv ID | Paper | Why it is in the corpus |
| --- | --- | --- |
| [1706.03762](https://arxiv.org/abs/1706.03762) | Attention Is All You Need | Block-segmented table, spacer column, `\boldmath` inside a `\multicolumn`, and a real abstract-vs-body divergence |
| [1810.04805](https://arxiv.org/abs/1810.04805) | BERT | GLUE table with an `Average` column over nine values in eight columns — the check 3 trap |
| [1512.03385](https://arxiv.org/abs/1512.03385) | Deep Residual Learning | Error rates: lower-is-better, with no direction marker in the header |
| [1907.11692](https://arxiv.org/abs/1907.11692) | RoBERTa | Averaged columns, many bolded bests |
| [1409.1556](https://arxiv.org/abs/1409.1556) | VGG | Old-style tables, top-1/top-5 error |
| [2010.11929](https://arxiv.org/abs/2010.11929) | ViT | `mean ± std` cells that are not bare numbers |
| [1802.05365](https://arxiv.org/abs/1802.05365) | ELMo | "All layers" grouping header — the check 3 keyword trap |
| [1502.03167](https://arxiv.org/abs/1502.03167) | Batch Normalization | Steps-to-accuracy tables, mixed units |
| [1608.06993](https://arxiv.org/abs/1608.06993) | DenseNet | Nested line-break tabulars that steal their parent's label |
| [2103.00020](https://arxiv.org/abs/2103.00020) | CLIP | 20 tables, 2,666 valued cells — the parser stress test |

## Licensing

Each paper is covered by whatever licence its authors selected on submission. arXiv
offers several, and the default — the arXiv.org perpetual non-exclusive licence — grants
arXiv the right to distribute but **does not automatically grant redistribution rights to
third parties**. Some of these papers are CC-BY; others are not.

They are included here as unmodified test fixtures for verifying a research tool, with
attribution above. If you would rather not redistribute them, delete
`fixtures/papers/*/` and run:

```bash
python fixtures/fetch_corpus.py
```

which re-fetches everything from arXiv into the same layout, politely (one request per
four seconds, real User-Agent, cached). The test suite then passes unchanged. Nothing in
the codebase depends on these files being in version control — only on their being on
disk.

If you are an author here and would like your source removed, open an issue and it will
be taken out.
