"""Offline tests for the network checks. Nothing here touches the network:
every HTTP call goes through `FakeClient`.

The fixture is the Transformer paper (`fixtures/papers/1706.03762/`), which has a
real `\\url{...}`, a commented-out duplicate of it, and 40-odd `\\bibitem` entries.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.pv.adapters.http import ErrorKind, FakeClient, HostRateLimiter, ResponseCache, network_error, ok
from backend.pv.checks import citations, links, repos
from backend.pv.models import CheckContext, SourceDocument, ReasonCode, Verdict

FIXTURE = ROOT / "fixtures" / "papers" / "1706.03762"


@pytest.fixture(scope="module")
def transformer_latex() -> str:
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted(FIXTURE.glob("*.tex")))


def context(latex: str) -> CheckContext:
    return CheckContext(document=SourceDocument(arxiv_id="1706.03762", assembled_latex=latex))


# --------------------------------------------------------------------------
# URL extraction
# --------------------------------------------------------------------------


def test_extracts_url_command():
    found = links.extract_urls(r"See \url{https://example.org/a} for details.")
    assert [u.url for u in found] == ["https://example.org/a"]
    assert found[0].source == "url"


def test_extracts_href_and_ignores_link_text():
    found = links.extract_urls(r"\href{https://example.org/x}{the code}")
    assert [u.url for u in found] == ["https://example.org/x"]
    # The link text must be inside the span, so a bare-URL pass cannot double count.
    assert found[0].char_end == len(r"\href{https://example.org/x}{the code}")


def test_extracts_bare_url_and_strips_sentence_punctuation():
    found = links.extract_urls("Available at https://example.org/a/b. Next sentence.")
    assert [u.url for u in found] == ["https://example.org/a/b"]


def test_latex_escapes_inside_urls_are_undone():
    raw = r"\url{https://example.org/a\_b/c\&d\#e\%f}"
    assert links.extract_urls(raw)[0].url == "https://example.org/a_b/c&d#e%f"


def test_line_wrapped_url_is_rejoined():
    raw = "\\url{https://example.org/very/long/\npath/here}"
    assert links.extract_urls(raw)[0].url == "https://example.org/very/long/path/here"


def test_url_wrapped_in_parentheses_keeps_its_own_parens():
    found = links.extract_urls("(see https://example.org/a(b)c) end")
    assert found[0].url == "https://example.org/a(b)c"


def test_commented_out_urls_are_not_extracted():
    latex = "% \\blfootnote{Code at \\url{https://example.org/hidden}}\nReal \\url{https://example.org/real}"
    assert [u.url for u in links.extract_urls(latex)] == ["https://example.org/real"]


def test_escaped_percent_does_not_start_a_comment():
    assert links.extract_urls(r"\url{https://example.org/a\%20b}")[0].url == "https://example.org/a%20b"


def test_no_duplicate_from_url_command_and_bare_pass():
    assert len(links.extract_urls(r"\url{https://example.org/a}")) == 1


def test_locator_reports_section_and_footnote():
    latex = (
        "\\section{One}\ntext\n\\section{Two}\n\\subsection{Deeper}\n"
        "body \\footnote{see \\url{https://example.org/x}} more"
    )
    found = links.extract_urls(latex)
    assert found[0].locator == "§2.1 Deeper, footnote 1"


def test_locator_reports_abstract():
    latex = "\\begin{abstract}Code at \\url{https://example.org/x}\\end{abstract}"
    assert links.extract_urls(latex)[0].locator == "abstract"


def test_transformer_fixture_urls(transformer_latex):
    found = links.extract_urls(transformer_latex)
    urls = {u.url for u in found}
    assert urls == {"https://github.com/tensorflow/tensor2tensor"}
    # The paper mentions it twice, but one of those is commented out.
    assert len(found) == 1
    assert found[0].locator.startswith("§7")


# --------------------------------------------------------------------------
# Liveness classification
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_2xx_is_alive():
    client = FakeClient({"example.org": ok(status=200)})
    result = await links.check_url(client, "https://example.org/a")
    assert result.verdict is Verdict.MATCHES


@pytest.mark.asyncio
async def test_redirect_to_a_live_page_is_alive():
    client = FakeClient({"example.org": ok(status=200, final_url="https://example.org/new")})
    result = await links.check_url(client, "https://example.org/old")
    assert result.verdict is Verdict.MATCHES
    assert result.redirected


@pytest.mark.asyncio
async def test_head_rejection_falls_back_to_get():
    def route(method: str, url: str):
        return ok(status=200) if method == "GET" else ok(status=405)

    client = FakeClient({"example.org": route})
    result = await links.check_url(client, "https://example.org/a")
    assert result.verdict is Verdict.MATCHES
    assert [m for m, _ in client.calls] == ["HEAD", "GET"]


@pytest.mark.asyncio
async def test_403_on_head_falls_back_to_get():
    def route(method: str, url: str):
        return ok(status=200) if method == "GET" else ok(status=403)

    client = FakeClient({"example.org": route})
    assert (await links.check_url(client, "https://example.org/a")).verdict is Verdict.MATCHES


@pytest.mark.asyncio
async def test_404_is_confirmed_with_a_get_before_being_called_dead():
    client = FakeClient({"example.org": ok(status=404)})
    result = await links.check_url(client, "https://example.org/gone")
    assert result.verdict is Verdict.DIVERGES
    assert [m for m, _ in client.calls] == ["HEAD", "GET"]


@pytest.mark.asyncio
async def test_404_on_head_but_200_on_get_is_alive():
    def route(method: str, url: str):
        return ok(status=200) if method == "GET" else ok(status=404)

    client = FakeClient({"example.org": route})
    assert (await links.check_url(client, "https://example.org/a")).verdict is Verdict.MATCHES


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", [ErrorKind.TIMEOUT, ErrorKind.DNS, ErrorKind.TLS,
                                  ErrorKind.CONNECTION, ErrorKind.SERVER_ERROR, ErrorKind.OFFLINE])
async def test_network_failure_is_never_dead(kind):
    client = FakeClient({"example.org": network_error(kind)})
    result = await links.check_url(client, "https://example.org/a")
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.NETWORK_ERROR


@pytest.mark.asyncio
async def test_rate_limited_is_unverifiable_with_its_own_reason():
    client = FakeClient({"example.org": network_error(ErrorKind.RATE_LIMITED)})
    result = await links.check_url(client, "https://example.org/a")
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.RATE_LIMITED


@pytest.mark.asyncio
async def test_401_is_unverifiable_not_dead():
    client = FakeClient({"example.org": ok(status=401)})
    assert (await links.check_url(client, "https://example.org/a")).verdict is Verdict.UNVERIFIABLE


@pytest.mark.asyncio
async def test_repeated_url_is_requested_once():
    client = FakeClient({"example.org": ok(status=200)})
    found = links.extract_urls(r"\url{https://example.org/a} and again \url{https://example.org/a}")
    results = await links.check_urls(client, found)
    assert len(results) == 1
    assert len(results[0].occurrences) == 2


@pytest.mark.asyncio
async def test_run_async_reports_dead_link_with_anchor():
    client = FakeClient({"example.org": ok(status=410)})
    latex = "\\section{Results}\nSee \\url{https://example.org/gone}."
    result = await links.run_async(context(latex), client)
    assert result.verdict is Verdict.DIVERGES
    assert result.checker == links.CHECKER_NAME
    assert result.findings[0].anchor.kind == "link"
    assert "§1 Results" in result.findings[0].anchor.human_locator


@pytest.mark.asyncio
async def test_run_async_unverifiable_when_the_network_is_down(transformer_latex):
    client = FakeClient({}, default=network_error(ErrorKind.DNS))
    result = await links.run_async(context(transformer_latex), client)
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.NETWORK_ERROR
    assert result.findings == []


@pytest.mark.asyncio
async def test_run_async_not_attempted_without_links():
    result = await links.run_async(context("no links here"), FakeClient())
    assert result.verdict is Verdict.NOT_ATTEMPTED


# --------------------------------------------------------------------------
# Bibliography parsing
# --------------------------------------------------------------------------


def test_parses_bibitems_from_the_transformer_fixture(transformer_latex):
    refs = citations.parse_bibliography(transformer_latex)
    keys = {r.key for r in refs}
    assert len(refs) >= 40
    assert "layernorm2016" in keys
    by_key = {r.key: r for r in refs}
    assert by_key["layernorm2016"].title == "Layer normalization"
    assert by_key["layernorm2016"].year == "2016"
    assert by_key["bahdanau2014neural"].title.lower().startswith("neural machine translation")
    # arXiv identifiers come through both the `arXiv:` and the `abs/` spellings.
    assert by_key["layernorm2016"].arxiv_id == "1607.06450"
    assert by_key["bahdanau2014neural"].arxiv_id == "1409.0473"


def test_bibitem_titles_are_stripped_of_markup():
    entry = (
        "\\begin{thebibliography}{10}\n"
        "\\bibitem{k}\nA.~Author and B.~Author.\n"
        "\\newblock {\\em Deep learning with $\\alpha$ tricks}.\n"
        "\\newblock In {\\em Proc. of NAACL}, 2016.\n"
        "\\end{thebibliography}"
    )
    ref = citations.parse_bibliography(entry)[0]
    assert ref.title == "Deep learning with tricks"
    assert ref.year == "2016"


def test_parses_doi_from_bibitem():
    entry = "\\bibitem{k}\nA.~Author.\n\\newblock A title.\n\\newblock doi:10.1145/3292500.3330701, 2019."
    assert citations.parse_bibliography(entry)[0].doi == "10.1145/3292500.3330701"


def test_parses_bibtex_entries():
    bib = '@article{smith2020, title = {A study of things}, doi = {10.1000/xyz}, year = {2020}}'
    ref = citations.parse_bibliography(bib)[0]
    assert (ref.key, ref.title, ref.doi, ref.year) == ("smith2020", "A study of things", "10.1000/xyz", "2020")


def test_title_matching_rejects_a_different_paper():
    assert citations.titles_match("Attention is all you need", "Attention is all you need")
    assert not citations.titles_match("Attention is all you need", "Layer normalization")


def test_title_matching_rejects_a_longer_title_that_merely_contains_it():
    # Both of these are what the live indexes actually returned for this query.
    assert not citations.titles_match(
        "Attention is all you need",
        "Is Space-Time Attention All You Need for Video Understanding?",
    )


@pytest.mark.asyncio
async def test_a_wrong_paper_match_does_not_count_as_found():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([
            {"title": ["Is Space-Time Attention All You Need for Video Understanding?"], "DOI": "10.1000/999"},
        ])),
        r"api\.openalex\.org": ok(json.dumps({"results": []})),
    })
    ctx = context("\\bibitem{a}\nA.~Vaswani.\n\\newblock Attention is all you need.\n\\newblock 2017.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.UNVERIFIABLE


@pytest.mark.asyncio
async def test_a_candidate_from_the_wrong_decade_is_rejected():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([
            {"title": ["A study of things"], "issued": {"date-parts": [[1997]]}, "DOI": "10.1000/5"},
        ])),
        r"api\.openalex\.org": ok(json.dumps({"results": []})),
    })
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A study of things.\n\\newblock 2020.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.UNVERIFIABLE


@pytest.mark.asyncio
async def test_a_retraction_on_a_weak_title_match_is_not_reported():
    """The retraction is real; which work it belongs to is not established."""
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([{
            "title": ["A study of things in mice"],
            "issued": {"date-parts": [[2020]]},
            "DOI": "10.1000/6",
            "updated-by": [{"type": "retraction", "DOI": "10.1000/7"}],
        }])),
        r"api\.openalex\.org": ok(json.dumps({"results": []})),
    })
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A study of things.\n\\newblock 2020.")
    result = await citations.run_async(ctx, client)
    assert citations.titles_match("A study of things", "A study of things in mice")
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.findings == []


# --------------------------------------------------------------------------
# Citation lookups
# --------------------------------------------------------------------------


def _crossref(items: list[dict]) -> str:
    import json

    return json.dumps({"message": {"items": items}})


def _crossref_work(work: dict) -> str:
    import json

    return json.dumps({"message": work})


@pytest.mark.asyncio
async def test_reference_found_in_both_indexes_matches():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([{"title": ["Layer normalization"], "DOI": "10.1/x"}])),
        r"api\.openalex\.org": ok(json.dumps({"results": [{"title": "Layer normalization", "id": "W1"}]})),
    })
    ctx = context("\\bibitem{a}\nJ.~Ba.\n\\newblock Layer normalization.\n\\newblock arXiv, 2016.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.MATCHES


@pytest.mark.asyncio
async def test_unindexed_reference_is_unverifiable_never_a_finding():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([])),
        r"api\.openalex\.org": ok(json.dumps({"results": []})),
    })
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A workshop paper nobody indexed.\n\\newblock 2011.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.findings == []


@pytest.mark.asyncio
async def test_crossref_retraction_is_a_finding():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref_work({
            "title": ["A retracted result"], "DOI": "10.1000/182",
            "updated-by": [{"type": "retraction", "DOI": "10.1000/183"}],
        })),
        r"api\.openalex\.org": ok(json.dumps({"id": "W2", "title": "A retracted result"})),
    })
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A retracted result.\n\\newblock doi:10.1000/182, 2015.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.DIVERGES
    assert result.findings[0].anchor.dom_id == "ref/a"
    assert result.findings[0].anchor.kind == "reference"


@pytest.mark.asyncio
async def test_openalex_retraction_flag_is_a_finding():
    import json

    client = FakeClient({
        r"api\.crossref\.org": ok(_crossref([])),
        r"api\.openalex\.org": ok(json.dumps({"id": "W3", "title": "A retracted result", "is_retracted": True})),
    })
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A retracted result.\n\\newblock doi:10.1000/182, 2015.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.DIVERGES


@pytest.mark.asyncio
async def test_index_outage_never_produces_a_finding():
    client = FakeClient({}, default=network_error(ErrorKind.TIMEOUT))
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A title.\n\\newblock 2015.")
    result = await citations.run_async(ctx, client)
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.NETWORK_ERROR
    assert result.findings == []


@pytest.mark.asyncio
async def test_lookups_include_mailto_for_the_polite_pool(monkeypatch):
    import json

    monkeypatch.setenv("CONTACT_EMAIL", "someone@example.org")
    client = FakeClient({r"api\.crossref\.org": ok(_crossref([])),
                         r"api\.openalex\.org": ok(json.dumps({"results": []}))})
    ctx = context("\\bibitem{a}\nA.~Author.\n\\newblock A title here.\n\\newblock 2015.")
    await citations.run_async(ctx, client)
    assert all("mailto=someone%40example.org" in url or "mailto=someone@example.org" in url
               for _, url in client.calls)


# --------------------------------------------------------------------------
# Repository candidates
# --------------------------------------------------------------------------


def test_finds_the_transformer_repository(transformer_latex):
    document = SourceDocument(arxiv_id="1706.03762", assembled_latex=transformer_latex)
    candidates = repos.find_repository_candidates(document)
    assert [c.full_name for c in candidates] == ["tensorflow/tensor2tensor"]
    top = candidates[0]
    assert top.host == "github"
    assert top.near_availability_phrase  # "The code we used ... is available at"
    assert top.confidence >= 0.7
    assert top.locator.startswith("§7")


def test_repo_in_bibliography_ranks_below_one_in_the_body():
    latex = (
        "\\section{Experiments}\nOur code is available at \\url{https://github.com/us/ours}.\n"
        "\\begin{thebibliography}{1}\n\\bibitem{x}\nSomeone.\n"
        "\\newblock A tool.\n\\newblock \\url{https://github.com/them/theirs}, 2019.\n"
        "\\end{thebibliography}"
    )
    candidates = repos.find_repository_candidates(SourceDocument(arxiv_id="x", assembled_latex=latex))
    assert [c.full_name for c in candidates] == ["us/ours", "them/theirs"]
    assert candidates[0].confidence > candidates[1].confidence
    assert candidates[1].in_bibliography


def test_deep_links_collapse_to_the_repository():
    latex = r"See \url{https://github.com/org/proj/blob/main/train.py} and \url{https://github.com/org/proj}."
    candidates = repos.find_repository_candidates(SourceDocument(arxiv_id="x", assembled_latex=latex))
    assert [c.full_name for c in candidates] == ["org/proj"]
    assert candidates[0].occurrences == 2
    assert candidates[0].url == "https://github.com/org/proj"


def test_non_repository_github_urls_are_ignored():
    latex = r"\url{https://github.com/features/actions} and \url{https://example.org/x}"
    assert repos.find_repository_candidates(SourceDocument(arxiv_id="x", assembled_latex=latex)) == []


@pytest.mark.asyncio
async def test_github_metadata_is_attached():
    import json

    client = FakeClient({r"api\.github\.com": ok(json.dumps({
        "stargazers_count": 1234, "pushed_at": "2020-06-01T10:00:00Z",
        "default_branch": "master", "archived": False, "description": "A library",
    }))})
    document = SourceDocument(arxiv_id="x", assembled_latex=r"\url{https://github.com/org/proj}")
    candidates = await repos.find_repositories(document, client)
    assert candidates[0].stars == 1234
    assert candidates[0].last_commit.year == 2020
    assert candidates[0].lookup_error == ""


@pytest.mark.asyncio
async def test_missing_github_token_degrades_without_dropping_the_candidate():
    client = FakeClient({r"api\.github\.com": ok(status=403)})
    document = SourceDocument(arxiv_id="x", assembled_latex=r"\url{https://github.com/org/proj}")
    candidates = await repos.find_repositories(document, client)
    assert len(candidates) == 1
    assert candidates[0].stars is None
    assert "rate limit" in candidates[0].lookup_error


@pytest.mark.asyncio
async def test_github_token_is_sent_when_present(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_test")
    assert repos._github_headers()["Authorization"] == "Bearer ghp_test"


# --------------------------------------------------------------------------
# The adapter itself
# --------------------------------------------------------------------------


def test_rate_limiter_uses_the_arxiv_floor_and_inherits_subdomains():
    limiter = HostRateLimiter(default_interval=0.5)
    assert limiter.interval_for("arxiv.org") == 3.0
    assert limiter.interval_for("api.github.com") == 1.0
    assert limiter.interval_for("raw.githubusercontent.com") == 0.5
    assert limiter.interval_for("example.org") == 0.5


@pytest.mark.asyncio
async def test_rate_limiter_spaces_requests_to_one_host():
    import time

    limiter = HostRateLimiter(default_interval=0.05)
    started = time.monotonic()
    for _ in range(3):
        async with await limiter.acquire("example.org"):
            pass
    assert time.monotonic() - started >= 0.1


def test_cache_round_trip_and_skips_transient_statuses(tmp_path):
    from backend.pv.adapters.http import HttpResponse

    cache = ResponseCache(tmp_path, ttl_seconds=3600)
    good = HttpResponse(url="https://example.org/a", method="GET", status=200, text="hello")
    cache.put(good)
    restored = cache.get("GET", "https://example.org/a")
    assert restored is not None and restored.text == "hello" and restored.from_cache

    cache.put(HttpResponse(url="https://example.org/b", method="GET", status=503))
    assert cache.get("GET", "https://example.org/b") is None


def test_user_agent_carries_the_contact_email(monkeypatch):
    from backend.pv.adapters import http

    monkeypatch.setenv("CONTACT_EMAIL", "someone@example.org")
    assert "someone@example.org" in http.user_agent()


@pytest.mark.asyncio
async def test_offline_backend_answers_nothing(monkeypatch):
    from backend.pv.adapters import http

    monkeypatch.setenv("HTTP_BACKEND", "offline")
    client = http.get_http_client()
    response = await client.get("https://example.org/a")
    assert response.failed and response.error_kind is ErrorKind.OFFLINE


def test_checks_expose_the_registry_interface():
    for module in (links, citations):
        assert isinstance(module.CHECKER_NAME, str) and module.CHECKER_NAME
        assert isinstance(module.CHECKER_VERSION, str)
        assert module.DISPLAY_NAME and module.DESCRIPTION
        assert callable(module.run)
