#!/usr/bin/env bash
# test.sh — every check in one place: backend pytest, frontend vitest, eslint, tsc, plus the
# feature-level suites (cache, DAG, visualization safety, auth). Delegates to scripts/test.sh,
# which runs every section even after a failure and exits non-zero if any failed.
#   ./test.sh          run everything (needs ./init.sh first; frontend steps need node_modules)
#   ./test.sh --help
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
exec ./scripts/test.sh "$@"
