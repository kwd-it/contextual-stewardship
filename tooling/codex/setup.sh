#!/usr/bin/env bash
# Prepares the bounded Codex review in the Routine's cloud environment and reports
# whether a review can run. Safe to re-run. Never prints a credential.
#
#   bash tooling/codex/setup.sh
#
# Exit 0: Codex is installed and authenticated; reviews may run through review.mjs.
# Exit 3: Codex is installed but has no credential (OPENAI_API_KEY unset or rejected);
#         the run must stay in safe stewardship mode (governance/routine.md).
# Exit 1: installation failed.
set -euo pipefail
set +x   # never trace: the credential is expanded below

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
codex_home="${CODEX_HOME:-$HOME/.codex}"

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

# `codex login status` exits 0 when logged in and reports on stderr, so only its exit code is used.
if codex login status >/dev/null 2>&1; then
  echo "codex: $version, authenticated"
  exit 0
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  if printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1 \
     && codex login status >/dev/null 2>&1; then
    echo "codex: $version, authenticated with API key"
    exit 0
  fi
  echo "codex: $version, API key login failed; review unavailable"
  exit 3
fi

echo "codex: $version, no credential (OPENAI_API_KEY unset); review unavailable"
exit 3
