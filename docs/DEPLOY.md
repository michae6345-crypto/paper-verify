# Deploying

Two pieces, deployed separately: a persistent backend and a static frontend.

Nothing here can be run from an automated session. Every host requires an interactive
login. The configuration is written and committed; the deploy itself is three commands
once you are logged in.

---

## Why the backend is not on Vercel

The brief (§8) puts the frontend on Vercel, and that still holds. The API does not
belong there:

- SSE streaming. Checks stream one event at a time (§5.3), and serverless functions
  have execution ceilings and buffer responses.
- Multi-second parses. TexSoup takes 0.9–5.8s per paper. That is a request timeout
  on most function platforms.
- The arXiv rate limit. One request per three seconds, enforced in-process. A
  function that cold-starts per request cannot hold a token bucket, and CLAUDE.md is
  explicit that we get IP-banned for ignoring this.
- Caches must persist. `.arxivcache` and `.httpcache` on ephemeral disk means
  re-fetching arXiv after every deploy.

So: backend on Render (or Railway/Fly, same Dockerfile), frontend on Vercel.

---

## Backend on Render

```bash
# 1. Push this repo to GitHub (done).
# 2. In the Render dashboard: New > Blueprint, point it at the repo.
#    render.yaml is picked up automatically.
# 3. Set the three secrets it asks for:
#      PV_CORS_ORIGINS   https://<your-vercel-domain>
#      CONTACT_EMAIL     a real address (arXiv and Crossref both ask)
#      GITHUB_TOKEN      a PAT with no scopes; raises 60/hr to 5,000/hr
```

Verify:

```bash
curl -s https://<api-host>/runs
curl -s -X POST https://<api-host>/runs \
     -H 'content-type: application/json' \
     -d '{"arxiv_id":"1706.03762"}'
```

The first run of any paper fetches from arXiv and takes a few seconds. Subsequent runs
are served from the mounted cache.

## Frontend on Vercel

```bash
cd frontend
npx vercel            # interactive login, then link the project
npx vercel --prod
```

Set `NEXT_PUBLIC_API_URL` to the Render URL in the Vercel project settings, then
redeploy so it is baked into the client bundle.

---

## What is not production-ready

Be honest about these rather than discover them live.

Runs are held in memory. `pv/api/store.py` keeps them in a process-local dict. Any
restart or redeploy loses every run, so §5.5 permalinks return 404. This is the single
biggest gap between the MVP and something you can send a link to. The fix is the
Postgres schema in §10, deferred because Docker is not installed locally and because
build-order step 1 deliberately needed no database.

One worker only. The Dockerfile pins `--workers 1`. With runs in memory, a second
worker would answer `GET /runs/{id}` for a run it has never seen. Do not scale out
before the store is shared.

No auth. §8 specifies Supabase Auth; local mode is single-user with no login. A
public deployment is open to anyone, and every run costs an arXiv fetch. Consider a
rate limit at the edge before publicising the URL.

Permalinks are public by default. The primary user (§1) is a researcher checking
their own unsubmitted draft. A public permalink asserting that a named paper `diverges`
is a different product from a private pre-submission check, and §8's reasoning about
liability applies directly. Decide this deliberately.

LLM checks are off. `LLM_ENABLED=false` in the blueprint. Checks 1, 2, 3 and 6 are
the entire first release and none of them call a model (§13), so the deployment is fully
functional without an OpenRouter key. Turning it on needs `OPENROUTER_API_KEY`, and the
free tier is 50 requests/day unless the account has bought $10 of credits lifetime.

---

## Free-tier notes

Render's free web services sleep after inactivity and cold-start in ~30s. For a demo
that is usually fine; the first request after a sleep will look slow. The mounted disk
survives sleeps, so caches are not lost.
