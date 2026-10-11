#!/usr/bin/env bash
# Prepares the bounded Codex review in the Routine's cloud environment and reports
# whether a review can run. Safe to re-run. Never prints a credential.
#
#   bash tooling/codex/setup.sh
#
# Authentication, in order of preference:
#   1. A network secret for api.openai.com held by the platform proxy (the key never enters
#      the VM). Codex still needs a local API-key login to send requests, so a fixed,
#      non-secret placeholder is used; the proxy replaces the Authorization header. The
#      script proves that with one request before trusting it.
#   2. OPENAI_API_KEY in the environment, passed to Codex on stdin.
#
# Exit 0: Codex is installed and requests to api.openai.com are authenticated; reviews may run.
# Exit 3: no working credential; the run must stay in safe stewardship mode (governance/routine.md).
# Exit 1: installation failed.
set -euo pipefail
set +x   # never trace: a credential may be expanded below

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
placeholder="proxy-managed-placeholder"   # not a credential; only meaningful when the proxy injects the real one
probe_url="https://api.openai.com/v1/models"

if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex >/dev/null 2>&1 || { echo "codex: npm install failed"; exit 1; }
fi
version="$(codex --version 2>/dev/null || echo codex)"

# Codex reads its universal instructions from $CODEX_HOME/AGENTS.md; point it at the vendored copy.
mkdir -p "$codex_home"
agents="$codex_home/AGENTS.md"
if [[ ! -L "$agents" || "$(readlink "$agents")" != "$here/AGENTS.md" ]]; then
  [[ -e "$agents" || -L "$agents" ]] && mv "$agents" "$agents.bak"
  ln -s "$here/AGENTS.md" "$agents"
fi

# HTTP status of an authenticated request as Codex would send it. 200 means the request was
# accepted with the given bearer value, so either it is a real key or the proxy replaced it.
probe() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $1" "$probe_url" 2>/dev/null || echo 000
}

# `codex login status` exits 0 when logged in and reports on stderr, so only its exit code is used.
logged_in() { codex login status >/dev/null 2>&1; }

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  if [[ "$(probe "$OPENAI_API_KEY")" == "200" ]] && printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1 && logged_in; then
    echo "codex: $version, authenticated with the OPENAI_API_KEY variable"
    exit 0
  fi
  echo "codex: $version, OPENAI_API_KEY was rejected or the login failed; review unavailable"
  exit 3
fi

status="$(probe "$placeholder")"
if [[ "$status" == "200" ]]; then
  if logged_in || { printf '%s' "$placeholder" | codex login --with-api-key >/dev/null 2>&1 && logged_in; }; then
    echo "codex: $version, authenticated through the proxy network secret (placeholder login)"
    exit 0
  fi
  echo "codex: $version, proxy supplies authentication but the placeholder login failed; review unavailable"
  exit 3
fi

echo "codex: $version, no working credential (probe returned HTTP $status, OPENAI_API_KEY unset); review unavailable"
exit 3
