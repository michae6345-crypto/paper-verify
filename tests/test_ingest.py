"""Ingest tests. Entirely offline — nothing here touches the network.

The fixture is the extracted source of arXiv:1706.03762, "Attention Is All You
Need". Every hazard these tests assert on is real: eight files joined by
\\input, macros defined in the main file and used in another, commented-out
definitions that must not enter the macro table.
"""

from __future__ import annotations

import gzip
import io
import sys
import tarfile
from pathlib import Path

import pytest

# No packaging config exists yet, so put `backend/` on the path ourselves. Once
# the orchestrator adds a pyproject with the src layout declared, this goes.
_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from pv.ingest import assemble as assemble_mod
from pv.ingest import (
    assemble,
    expand,
    extract_abstract,
    extract_macros,
    extract_title,
    fetch_source,
    find_main_file,
    ingest_directory,
    load_directory,
    macro_table,
    normalize_arxiv_id,
    source_hash,
)
from pv.ingest.fetch import is_safe_member_name, unpack
from pv.models import ReasonCode, SourceDocument

PAPERS = Path(__file__).resolve().parents[1] / "fixtures" / "papers"
FIXTURE = PAPERS / "1706.03762"

# The validation corpus, hand-checked by the orchestrator (fixtures/GROUND_TRUTH.md).
# Each row: arxiv id, main file, how many files the document actually consumes,
# the title, and a number that must survive into the abstract verbatim.
CORPUS = [
    ("1409.1556", "ilsvrc14.tex", 1,
     "Very Deep Convolutional Networks for Large-Scale Image Recognition", "16"),
    ("1502.03167", "arx.tex", 1,
     "Batch Normalization: Accelerating Deep Network Training by Reducing "
     "Internal Covariate Shift", "4.9%"),
    ("1512.03385", "residual_v1_arxiv_release.tex", 1,
     "Deep Residual Learning for Image Recognition", "3.57%"),
    ("1608.06993", "main.tex", 11, "Densely Connected Convolutional Networks", "100"),
    ("1706.03762", "ms.tex", 8, "Attention Is All You Need", "41.8"),
    ("1802.05365", "deep_representations_bilm.tex", 1,
     "Deep contextualized word representations", "2"),
    ("1810.04805", "main.tex", 20,
     "BERT: Pre-training of Deep Bidirectional Transformers for Language "
     "Understanding", "80.5%"),
    ("1907.11692", "main.tex", 20,
     "RoBERTa: A Robustly Optimized BERT Pretraining Approach", "BERT"),
    ("2010.11929", "main.tex", 9,
     "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
     "CIFAR-100"),
    ("2103.00020", "clip_paper.tex", 3,
     "Learning Transferable Visual Models From Natural Language Supervision", "400 million"),
]
CORPUS_IDS = [row[0] for row in CORPUS]


@pytest.fixture(scope="module")
def result():
    return ingest_directory(FIXTURE, arxiv_id="1706.03762")


@pytest.fixture(scope="module")
def document(result) -> SourceDocument:
    return result.document


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------


def test_fixture_is_present():
    assert (FIXTURE / "ms.tex").exists(), "fixture missing; tests are meaningless"


def test_main_file_is_ms_tex():
    files = load_directory(FIXTURE).files
    assert find_main_file(files) == "ms.tex"


def test_commented_documentclass_does_not_win():
    files = {"real.tex": "\\documentclass{article}", "decoy.tex": "% \\documentclass{ieee}"}
    assert find_main_file(files) == "real.tex"


def test_all_eight_inputs_resolve(document: SourceDocument):
    expected = {
        "ms.tex",
        "introduction.tex",
        "background.tex",
        "model_architecture.tex",
        "why_self_attention.tex",
        "training.tex",
        "results.tex",
        "visualizations.tex",
    }
    assert set(document.file_names) == expected
    assert document.file_names[0] == "ms.tex"


def test_commented_input_is_not_followed(document: SourceDocument):
    # ms.tex has `%\input{parameter_attention}` and `%\input{sqrt_d_trick}`.
    assert "parameter_attention.tex" not in document.file_names
    assert "sqrt_d_trick.tex" not in document.file_names


def test_input_tokens_are_gone_from_the_assembled_text(document: SourceDocument):
    for name in ("introduction", "background", "results"):
        assert f"\\input{{{name}}}" not in document.assembled_latex


def test_included_content_is_actually_present(document: SourceDocument):
    # A sentence unique to results.tex, which is only reachable via \input.
    assert "English constituency parsing" in document.assembled_latex
    # And one from the deepest file in the chain.
    assert "Extended Neural GPU" in document.assembled_latex


def test_offsets_into_assembled_text_are_meaningful(document: SourceDocument):
    """Anchor.char_start/char_end index into this string, so a slice must be
    the text it claims to be."""
    text = document.assembled_latex
    needle = "\\begin{abstract}"
    start = text.index(needle)
    assert text[start : start + len(needle)] == needle
    # Content from an \input'ed file is addressable the same way.
    body = text.index("English constituency parsing")
    assert text[body : body + 5] == "Engli"


def test_segments_map_offsets_back_to_files(result):
    text = result.document.assembled_latex
    assembled = result.assembled
    # A phrase that occurs only in results.tex — "English constituency parsing"
    # would not do, because the abstract in ms.tex says it first.
    assert assembled.file_at(text.index("Section 22 development set")) == "results.tex"
    assert assembled.file_at(text.index("\\documentclass")) == "ms.tex"


def test_segments_cover_the_whole_string(result):
    root = [s for s in result.assembled.segments if s.file_name == "ms.tex"][0]
    assert root.start == 0
    assert root.end == len(result.document.assembled_latex)


def test_input_without_extension_and_with_extension_both_resolve():
    files = {
        "main.tex": "\\documentclass{article}\nA\\input{one}B\\input{two.tex}C",
        "one.tex": "[ONE]",
        "two.tex": "[TWO]",
    }
    out = assemble(files)
    assert "[ONE]" in out.text and "[TWO]" in out.text
    assert set(out.file_names) == {"main.tex", "one.tex", "two.tex"}


def test_input_from_a_subdirectory_resolves():
    files = {
        "main.tex": "\\documentclass{a}\n\\input{sections/intro}",
        "sections/intro.tex": "[INTRO]",
    }
    assert "[INTRO]" in assemble(files).text


def test_cycles_do_not_hang():
    files = {
        "main.tex": "\\documentclass{a}\nM\\input{loop}",
        "loop.tex": "L\\input{main}",
    }
    out = assemble(files)
    assert "L" in out.text
    assert out.text.count("L") == 1


def test_missing_input_is_recorded_not_fatal():
    files = {"main.tex": "\\documentclass{a}\n\\input{nowhere}"}
    out = assemble(files)
    assert out.missing_inputs == ["nowhere"]
    assert "\\input{nowhere}" in out.text


def test_inputenc_is_not_mistaken_for_an_input():
    files = {"main.tex": "\\documentclass{a}\n\\inputencoding{utf8}\nbody"}
    out = assemble(files)
    assert out.missing_inputs == []
    assert "\\inputencoding{utf8}" in out.text


def test_assemble_without_documentclass_raises():
    with pytest.raises(ValueError):
        assemble({"a.tex": "no class here"})


# --------------------------------------------------------------------------
# Macros
# --------------------------------------------------------------------------


def test_fixture_macros_are_found(document: SourceDocument):
    for name in ("\\dmodel", "\\dff", "\\mbf"):
        assert name in document.macros, f"{name} missing from the macro table"
    assert document.macros["\\dmodel"] == "d_{\\text{model}}"
    assert document.macros["\\dff"] == "d_{\\text{ff}}"
    assert document.macros["\\mbf"] == "\\mathbf{#1}"


def test_mbf_argument_count(result):
    assert result.macro_objects["mbf"].n_args == 1
    assert result.macro_objects["dmodel"].n_args == 0


def test_commented_out_definitions_are_ignored(result):
    # ms.tex has `% \newcommand\blfootnote[1]{...}` and a commented \kq redefinition.
    assert "blfootnote" not in result.macro_objects
    assert result.macro_objects["kq"].body == "q"


def test_bare_and_starred_newcommand_forms(result):
    assert result.macro_objects["mc"].body == "\\mathcal{#1}"  # \newcommand\mc[1]{...}
    assert "samethanks" in result.macro_objects  # \newcommand*\samethanks[1][...]{...}


def test_expansion_of_the_bold_macro():
    """The reason macro expansion exists: a regex for \\textbf misses this."""
    macros = extract_macros("\\newcommand{\\mbf}[1]{\\mathbf{#1}}")
    assert expand("$\\mbf{41.8}$", macros) == "$\\mathbf{41.8}$"


def test_expansion_is_recursive():
    macros = extract_macros(
        "\\newcommand{\\inner}{7}\\newcommand{\\outer}[1]{\\mathbf{#1\\inner}}"
    )
    assert expand("\\outer{4}", macros) == "\\mathbf{4 7}".replace(" ", "")


def test_expansion_handles_two_arguments():
    macros = extract_macros("\\newcommand{\\pair}[2]{#1 and #2}")
    assert expand("\\pair{a}{b}", macros) == "a and b"


def test_expansion_handles_an_optional_argument():
    macros = extract_macros("\\newcommand{\\greet}[2][hi]{#1 #2}")
    assert expand("\\greet{you}", macros) == "hi you"
    assert expand("\\greet[yo]{you}", macros) == "yo you"


def test_def_form_is_supported():
    macros = extract_macros("\\def\\foo#1{[#1]}")
    assert macros["foo"].n_args == 1
    assert expand("\\foo{x}", macros) == "[x]"


def test_renewcommand_overrides():
    macros = extract_macros("\\newcommand{\\x}{one}\\renewcommand{\\x}{two}")
    assert macros["x"].body == "two"


def test_unknown_commands_survive_expansion():
    macros = extract_macros("\\newcommand{\\x}{1}")
    assert expand("\\textbf{\\unknown} \\x", macros) == "\\textbf{\\unknown} 1"


def test_expansion_does_not_loop_forever():
    macros = extract_macros("\\newcommand{\\a}{\\b}\\renewcommand{\\b}{\\a}")
    expand("\\a", macros)  # bounded by max_passes; the point is that it returns


def test_macro_table_keys_carry_the_backslash():
    table = macro_table(extract_macros("\\newcommand{\\x}{1}"))
    assert table == {"\\x": "1"}


def test_expansion_reaches_a_macro_used_in_another_file(document: SourceDocument):
    """\\dmodel is defined in ms.tex and used in model_architecture.tex — the
    whole reason assembly must precede macro extraction."""
    assert "\\dmodel" in document.assembled_latex


# --------------------------------------------------------------------------
# Title, abstract, hash
# --------------------------------------------------------------------------


def test_title(document: SourceDocument):
    assert document.title == "Attention Is All You Need"


def test_abstract_contains_the_headline_number(document: SourceDocument):
    assert "41.8" in document.abstract
    assert "28.4" in document.abstract


def test_abstract_is_prose_not_latex(document: SourceDocument):
    assert document.abstract.startswith("The dominant sequence transduction models")
    assert "\\" not in document.abstract
    assert "%" not in document.abstract  # the abstract block is full of comments


def test_abstract_excludes_the_end_marker(document: SourceDocument):
    assert "end{abstract}" not in document.abstract


def test_title_strips_thanks_and_footnotes():
    latex = "\\documentclass{a}\\title{Real Title\\thanks{Equal contribution.}}"
    assert extract_title(latex) == "Real Title"


def test_title_with_an_optional_short_form():
    assert extract_title("\\title[Short]{The Long Title}") == "The Long Title"


def test_abstract_command_form():
    assert extract_abstract("\\abstract{We report 41.8 BLEU.}") == "We report 41.8 BLEU."


def test_missing_title_and_abstract_are_empty_not_errors():
    assert extract_title("\\documentclass{a}") == ""
    assert extract_abstract("\\documentclass{a}") == ""


def test_source_hash_is_sha256_of_the_assembled_latex(document: SourceDocument):
    assert document.source_hash == source_hash(document.assembled_latex)
    assert len(document.source_hash) == 64


def test_source_hash_is_stable_across_runs(document: SourceDocument):
    again = ingest_directory(FIXTURE, arxiv_id="1706.03762")
    assert again.document.source_hash == document.source_hash


def test_document_is_the_contract_type(document: SourceDocument):
    assert isinstance(document, SourceDocument)
    assert document.arxiv_id == "1706.03762"
    SourceDocument.model_validate(document.model_dump())


# --------------------------------------------------------------------------
# Fetch: payload shapes, safety, cache. No network.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1706.03762", ("1706.03762", None)),
        ("1706.03762v5", ("1706.03762", "v5")),
        ("arXiv:1706.03762", ("1706.03762", None)),
        ("https://arxiv.org/abs/1706.03762", ("1706.03762", None)),
        ("https://arxiv.org/pdf/1706.03762v2.pdf", ("1706.03762", "v2")),
        ("cs.CL/0701001", ("cs.CL/0701001", None)),
    ],
)
def test_normalize_arxiv_id(raw, expected):
    assert normalize_arxiv_id(raw) == expected


def test_normalize_rejects_nonsense():
    with pytest.raises(ValueError):
        normalize_arxiv_id("not-a-paper")


def test_pdf_payload_returns_no_latex_source_rather_than_raising():
    files, reason, detail = unpack(b"%PDF-1.5\nbinary junk")
    assert files == {}
    assert reason is ReasonCode.NO_LATEX_SOURCE
    assert detail


def test_gzipped_pdf_payload_also_returns_no_latex_source():
    files, reason, _ = unpack(gzip.compress(b"%PDF-1.5\nbinary junk"))
    assert reason is ReasonCode.NO_LATEX_SOURCE


def test_bare_gzipped_single_tex_payload():
    files, reason, _ = unpack(gzip.compress(b"\\documentclass{article}\nHello"))
    assert reason is None
    assert list(files) == ["main.tex"]
    assert "Hello" in files["main.tex"]


def test_gzipped_tarball_payload():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, body in [("ms.tex", b"\\documentclass{a}\n\\input{sec}"), ("sec.tex", b"S")]:
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    files, reason, _ = unpack(gzip.compress(buf.getvalue()))
    assert reason is None
    assert set(files) == {"ms.tex", "sec.tex"}


def test_tarball_figures_are_dropped():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, body in [("ms.tex", b"\\documentclass{a}"), ("fig.pdf", b"%PDF-1.4")]:
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    files, _, _ = unpack(buf.getvalue())
    assert set(files) == {"ms.tex"}


@pytest.mark.parametrize(
    "name", ["../escape.tex", "/etc/passwd", "a/../../b.tex", "C:/win.tex", ""]
)
def test_path_traversal_member_names_are_rejected(name):
    assert not is_safe_member_name(name)


@pytest.mark.parametrize("name", ["ms.tex", "sections/intro.tex", "./ms.tex"])
def test_ordinary_member_names_are_accepted(name):
    assert is_safe_member_name(name)


def test_traversing_tar_member_is_not_extracted():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, body in [("../evil.tex", b"bad"), ("ms.tex", b"\\documentclass{a}")]:
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    files, _, _ = unpack(buf.getvalue())
    assert set(files) == {"ms.tex"}


def test_offline_fetch_of_an_uncached_paper_reports_network_error(tmp_path):
    out = fetch_source("1234.56789", cache_dir=tmp_path, allow_network=False)
    assert out.reason is ReasonCode.NETWORK_ERROR
    assert out.files == {}


def test_cache_is_read_without_network(tmp_path, monkeypatch):
    """A cached paper must never reach `_download`. This is the rule that keeps
    us off arXiv's ban list."""
    from pv.ingest import fetch as fetch_mod

    def explode(*args, **kwargs):  # pragma: no cover - must not run
        raise AssertionError("network access attempted for a cached paper")

    payload = gzip.compress(b"\\documentclass{article}\n\\title{Cached}\nbody")
    monkeypatch.setattr(fetch_mod, "_download", lambda *a, **k: (payload, ""))
    first = fetch_source("1706.03762", cache_dir=tmp_path)
    assert not first.from_cache

    monkeypatch.setattr(fetch_mod, "_download", explode)
    second = fetch_source("1706.03762", cache_dir=tmp_path)
    assert second.from_cache
    assert second.files == first.files


def test_versioned_and_unversioned_ids_cache_separately(tmp_path, monkeypatch):
    from pv.ingest import fetch as fetch_mod

    monkeypatch.setattr(
        fetch_mod, "_download", lambda *a, **k: (gzip.compress(b"\\documentclass{a}"), "")
    )
    fetch_source("1706.03762", cache_dir=tmp_path)
    assert (tmp_path / "1706.03762" / "meta.json").exists()
    fetch_source("1706.03762v3", cache_dir=tmp_path)
    assert (tmp_path / "1706.03762v3" / "meta.json").exists()


def test_pdf_only_paper_ingests_to_a_document_carrying_the_reason(tmp_path, monkeypatch):
    from pv.ingest import fetch as fetch_mod
    from pv.ingest import ingest as ingest_paper

    monkeypatch.setattr(fetch_mod, "_download", lambda *a, **k: (b"%PDF-1.5 junk", ""))
    out = ingest_paper("1706.03762", cache_dir=tmp_path)
    assert out.reason is ReasonCode.NO_LATEX_SOURCE
    assert out.document.assembled_latex == ""
    assert not out.ok


def test_user_agent_carries_the_contact_email(monkeypatch):
    from pv.ingest.fetch import user_agent

    monkeypatch.setenv("CONTACT_EMAIL", "someone@example.com")
    assert "someone@example.com" in user_agent()


def test_rate_limiter_enforces_three_seconds(monkeypatch):
    from pv.ingest.fetch import MIN_REQUEST_INTERVAL_S, _RateLimiter

    assert MIN_REQUEST_INTERVAL_S >= 3.0
    slept: list[float] = []
    limiter = _RateLimiter(interval=3.0)
    monkeypatch.setattr("pv.ingest.fetch.time.sleep", slept.append)
    limiter.wait()
    limiter.wait()
    assert slept and slept[-1] > 2.5


def test_load_directory_never_reaches_the_network():
    out = load_directory(FIXTURE, arxiv_id="1706.03762")
    assert out.reason is None
    assert "ms.tex" in out.files


def test_empty_directory_reports_no_latex_source(tmp_path):
    assert load_directory(tmp_path).reason is ReasonCode.NO_LATEX_SOURCE


# --------------------------------------------------------------------------
# The ten-paper validation corpus. Offline; the papers are already on disk.
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def corpus() -> dict:
    return {row[0]: ingest_directory(PAPERS / row[0], arxiv_id=row[0]) for row in CORPUS}


@pytest.mark.parametrize("arxiv_id,main,n_files,title,number", CORPUS, ids=CORPUS_IDS)
def test_corpus_assembles(corpus, arxiv_id, main, n_files, title, number):
    out = corpus[arxiv_id]
    assert out.ok, out.detail
    assert out.assembled.main_file == main
    assert len(out.document.file_names) == n_files
    assert out.document.file_names[0] == main


@pytest.mark.parametrize("arxiv_id,main,n_files,title,number", CORPUS, ids=CORPUS_IDS)
def test_corpus_titles(corpus, arxiv_id, main, n_files, title, number):
    assert corpus[arxiv_id].document.title == title


@pytest.mark.parametrize("arxiv_id,main,n_files,title,number", CORPUS, ids=CORPUS_IDS)
def test_corpus_abstracts_are_expanded_prose(corpus, arxiv_id, main, n_files, title, number):
    """Abstracts carry macros — DenseNet's is written entirely in terms of
    `\\methodnamecap{}` and `\\methodnameshort{}`. Check 4 compares abstract
    numbers to table cells, so it must never see a control sequence."""
    abstract = corpus[arxiv_id].document.abstract
    assert len(abstract) > 300
    assert "\\" not in abstract, "unexpanded LaTeX left in the abstract"
    assert number in abstract


@pytest.mark.parametrize("arxiv_id,main,n_files,title,number", CORPUS, ids=CORPUS_IDS)
def test_corpus_titles_are_expanded_prose(corpus, arxiv_id, main, n_files, title, number):
    assert "\\" not in corpus[arxiv_id].document.title


@pytest.mark.parametrize("arxiv_id,main,n_files,title,number", CORPUS, ids=CORPUS_IDS)
def test_corpus_hashes_are_populated(corpus, arxiv_id, main, n_files, title, number):
    doc = corpus[arxiv_id].document
    assert len(doc.source_hash) == 64
    assert doc.source_hash == source_hash(doc.assembled_latex)


def test_corpus_hashes_are_all_distinct(corpus):
    hashes = {out.document.source_hash for out in corpus.values()}
    assert len(hashes) == len(CORPUS)


def test_densenet_excludes_stale_files_from_another_paper(corpus):
    """The DenseNet tarball ships `office-31.tex` and `svn-mnist.tex`, leftovers
    that `main.tex` never inputs. Globbing *.tex would pull in another paper's
    tables and hand the checkers claims the authors never made."""
    out = corpus["1608.06993"]
    on_disk = set(load_directory(PAPERS / "1608.06993").files)
    assert {"office-31.tex", "svn-mnist.tex"} <= on_disk
    assert "office-31.tex" not in out.document.file_names
    assert "svn-mnist.tex" not in out.document.file_names
    assert "office-31" not in out.document.assembled_latex


def test_densenet_abstract_macros_are_expanded(corpus):
    """`\\methodnamecap{}` is defined in macros.tex and used in abstract.tex —
    two files, neither of which is the main file."""
    doc = corpus["1608.06993"].document
    assert doc.macros["\\methodnamecap"] == "Dense Convolutional Network"
    assert "Dense Convolutional Network" in doc.abstract
    assert "DenseNet" in doc.abstract
    assert "methodname" not in doc.abstract


def test_bert_abstract_macro_spacing(corpus):
    """`\\newcommand\\bert{BERT\\xspace}` used as `\\bert is designed` must not
    come out as "BERTis designed"."""
    assert "BERT is designed" in corpus["1810.04805"].document.abstract


def test_clip_title_comes_from_icmltitle(corpus):
    """CLIP never calls `\\title`; the ICML style uses `\\icmltitle`."""
    assert "\\title{" not in corpus["2103.00020"].document.assembled_latex


def test_unreachable_files_are_excluded_across_the_corpus(corpus):
    """Anything not reachable from the main file is not part of the document."""
    unreachable = {
        "1608.06993": {"office-31.tex", "svn-mnist.tex"},
        "1907.11692": {"roberta_swag.tex"},
        "2103.00020": {"math_commands.tex"},
    }
    for arxiv_id, expected in unreachable.items():
        on_disk = {f for f in load_directory(PAPERS / arxiv_id).files if f.endswith(".tex")}
        consumed = set(corpus[arxiv_id].document.file_names)
        assert on_disk - consumed == expected


def test_multi_file_papers_actually_inline_their_sections(corpus):
    for arxiv_id in ("1810.04805", "1907.11692", "2010.11929", "1608.06993"):
        text = corpus[arxiv_id].document.assembled_latex
        assert "\\input{" not in text, f"{arxiv_id} left an unresolved \\input"


def test_tex_root_magic_comment_breaks_a_tie():
    files = {
        "main.tex": "\\documentclass{a}\nreal",
        "old_draft.tex": "\\documentclass{a}\ndraft",
        "sec.tex": "%!TEX root=main.tex\ntext",
    }
    assert find_main_file(files) == "main.tex"
