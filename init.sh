#!/usr/bin/env bash
# init.sh — set up Google Drive Manager (FastAPI backend in venv/, Vite frontend). Delegates to
# scripts/init.sh, which is a CLEAN init: it removes venv/, frontend/node_modules and caches
# before reinstalling, so it is reproducible rather than incremental. Credentials are separate:
# see CREDENTIALS_SETUP.md (./add_credentials_help.sh).
#   ./init.sh          rebuild venv/ and frontend/node_modules from scratch
#   ./init.sh --help
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
exec ./scripts/init.sh "$@"
