# The dashboard

Design spec for the authenticated product surface. **Nothing here is built.** This
document exists to be argued with before any of it is.

The left rail (`frontend/src/components/shell/nav-rail.tsx`) currently holds two
items: *Check a paper* and *Recently checked*. That is a tool, not a product. A
conference author checks a paper three times a year; a chair reads fifty in a week.
Neither of them has a home screen.

---

## What already exists, and has no screen

Worth stating first, because most of the work below is surfacing things the backend
already does rather than building new capability.

| Endpoint | What it serves | Screen today |
| --- | --- | --- |
| `GET /runs` | Every run, with state | none |
| `GET /runs/{id}/review` | The held-finding queue | **none** |
| `POST .../review/release`, `.../suppress` | The gate controls | **none** |
| `GET /runs/{id}/amendments` | Contests and their status | **none** |
| `POST /runs/{id}/amendments` | File a contest | none |
| `GET /runs/{id}/findings` | Finding index by fingerprint | partial, inside the report |
| `GET /runs/{id}/report/public` | The redacted permalink | `/reports/[id]` |
| repository candidates | §5.2 artifact confirmation | `/submit` |

The review queue is the largest gap. The gate is the mechanism that stops this
product publishing an unread accusation about a named researcher, and it is
currently operable only by `curl`.

---

## The rail

Eight positions. Wordmark, six destinations, account at the foot.

```
pv          wordmark, /
--
Check       /check                new run
Runs        /runs                 process: what is in flight
Reports     /reports              artifact: what is finished and shareable
Review      /review               held findings, badged with a count
Amendments  /amendments           contests, filed and received
Venues      /venues               policy profiles  (roadmap, see below)
--
Account     /account              at the foot, ruled off
```

**Runs and Reports are deliberately two items.** A run is a process with a state
machine and a stream; a report is an immutable artifact with a permalink. Merging
them is how you end up with a screen that cannot decide whether its rows are jobs
or documents. The §14 orchestrator already treats them as different objects.

**Review is badged.** It is the only item in the rail that carries a count, because
it is the only one where an unattended item has a cost: a finding sitting unread is
a finding not published, and the author is waiting. Badge shows held findings for
runs the signed-in account owns.

The badge must not use a verdict colour. §3 and the style rules put verdict colour
off chrome entirely; the badge is chrome. Use `--chrome-raised` with ink text.

---

## The screens

### `/runs` — what is in flight

A table, not cards. Columns: paper, submitted, stage, elapsed, verdict summary.

- Stage is the live `RunStage`. Rows for active runs subscribe to the existing SSE
  endpoint rather than polling.
- Verdict summary is the four counts as glyphs and numbers, never a percentage and
  never a score. `8 matches · 1 within tolerance · 9 unverifiable · 2 not checked`.
- Sort by submitted, newest first. Filter by stage.
- Empty state points at `/check` and says nothing else.

Feeds from `GET /runs`. Needs a `state` and a per-verdict count on the list
envelope; if `RunList` does not carry them, that is a contract change and goes
through the orchestrator, not through a client-side fetch of every report.

### `/reports` — what is finished

The library. Same rows, but only terminal runs, and every row is a permalink with a
copy action. This is the screen an author is on the day before a deadline.

Each row shows whether anything is currently held, because an author who copies a
permalink needs to know the version a chair will open is not the version they are
looking at. `PublicReport.notice` already says this; the row needs the boolean.

### `/review` — the gate

The screen that matters most, and the one with the clearest backend.

Each held finding is a card: the paper, the locator, claimed against computed, the
delta, the checker and its version, and the policy version the tolerance came from.
Two controls, **release** and **suppress**, both requiring a reason string.

Rules the screen has to enforce, not merely display:

1. **Holding is the default.** A finding with no decision recorded is held. The
   screen must never present "no decision" as a state that resolves itself by
   waiting.
2. **Suppress is not delete.** A suppressed finding stays in `GET /runs/{id}/report`
   and stays out of `/report/public`. The screen says which of the two a reader is
   looking at, always.
3. **The reason is part of the record.** Both controls write a reason. A gate whose
   decisions carry no justification is a gate that will be operated carelessly.
4. **No bulk release.** One at a time. A "release all" button is how a queue of
   twelve becomes twelve unread accusations. This is a deliberate refusal to add an
   affordance, and it should be commented as one in the code.

### `/amendments` — contests

Two lists in one screen: contests filed against reports the account owns, and
contests the account has filed against others.

Each shows the finding it answers, the author statement, the corrected value if one
was given, the status (`open`, `recheck_requested`, `resolved`, `withdrawn`) and the
recheck result if it ran. `Amendment` already carries all of this.

The screen must show that an amendment supersedes rather than edits. The finding and
the contest sit side by side; neither is struck through.

### `/venues` — policy profiles

**Roadmap, and the only screen here with no backend at all.** Named because it is
what turns this from a tool into a conference product, and because the rail should
be designed around where it is going.

A venue profile is data, not code: page limit, anonymity policy, checklist
requirements, style file, deadline. Versioned per venue per year exactly the way the
tolerance policy is versioned, and for the same reason: a report has to say which
rules it was checked against, or the report is not re-derivable.

Depends on the anonymity, page-limit and format checks in `CHECKS_BACKLOG.md`, which
depend on a PDF ingest path that does not exist yet.

---

## What has to change underneath

1. **Real auth.** Every screen here is scoped to an owner. The session is currently
   `localStorage` with no server check, and the amendment and review endpoints are
   unauthenticated. `/review` in particular cannot ship on a fake session: it would
   let anyone release anyone's held finding.
2. **`DATABASE_URL`.** Runs are in memory. A dashboard listing runs that vanish on
   deploy is worse than no dashboard.
3. **List envelopes that carry summary state.** So `/runs` and `/reports` do not
   fetch N reports to render N rows.
4. **An ownership column** on runs, and RLS policies that actually express it. The
   ten tables currently have RLS on with zero policies, which is correct while
   nothing reads them and wrong the moment a dashboard does.

Order: auth, then database, then `/review`, then `/runs` and `/reports`, then
`/amendments`. `/venues` last, behind the checks it displays.
