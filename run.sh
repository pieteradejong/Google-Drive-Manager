#!/usr/bin/env bash
# run.sh — entry points. Run ./init.sh once first.
#   ./run.sh [both]      backend (FastAPI :8000) + frontend (Vite :5173)   (scripts/run.sh)
#   ./run.sh backend     backend only
#   ./run.sh frontend    frontend only
#   ./run.sh test        every check (delegates to ./test.sh)
#   ./run.sh help
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-both}" in
    test)           shift; exec ./test.sh "$@" ;;
    help|-h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' ;;
    both|backend|frontend) exec ./scripts/run.sh "$@" ;;
    *) echo "Unknown command: $1" >&2; sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
