# Backend: FastAPI + the checker. Needs a persistent host, not serverless —
# SSE streams, multi-second LaTeX parses, and a 3s arXiv rate limit all assume
# a process that stays alive between requests.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so a code change doesn't reinstall the world.
COPY backend/pyproject.toml ./backend/pyproject.toml
RUN pip install --no-cache-dir \
      "pydantic>=2.7" "httpx>=0.27" "TexSoup>=0.3.1" \
      "fastapi>=0.115" "uvicorn>=0.30" "sse-starlette>=2.1"

COPY backend ./backend

# Defaults only. render.yaml overrides both, because where the cache can live
# depends on the instance type: a paid instance mounts a disk at /data, a free
# one has no disk at all and falls back to /tmp. Creating both here means the
# image works either way without a conditional.
ENV ARXIV_CACHE_DIR=/data/.arxivcache \
    HTTP_CACHE_DIR=/data/.httpcache \
    PYTHONPATH=/app/backend
RUN mkdir -p /data/.arxivcache /data/.httpcache /tmp/.arxivcache /tmp/.httpcache

EXPOSE 8000

# Single worker on purpose: runs are held in memory, so a second worker would
# answer /runs/{id} for a run it has never seen. Fix that with a shared store
# before scaling out.
CMD ["sh", "-c", "uvicorn pv.api.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
