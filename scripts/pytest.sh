#!/bin/bash
# Reliable pytest runner for this repo.
#
# Why: calling `pytest` directly can hit a broken PATH shim (e.g. Homebrew) or the
# wrong interpreter. This wrapper always uses the repo venv and `python -m pytest`.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

if [ ! -d "venv" ]; then
  echo "Error: venv not found. Run ./scripts/init.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1091
source venv/bin/activate

# Default to disabling HTML coverage unless user explicitly asks for it.
# (Root pytest.ini already avoids it; this is just extra safety when overriding addopts.)
python -m pytest "$@"

