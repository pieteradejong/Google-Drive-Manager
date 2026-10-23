# Decisions

Choices someone could reasonably reopen, newest last. Each entry has a `Verified:` line: the
command run and its output, or `NOT YET`.

## 1. Push new work while the published Drive-index history stays undecided

**Date:** 2026-10-23
**Context:** Pieter asked for all uncommitted work to be committed and pushed. This repo is public,
and its history (Dec 2025) holds Drive scan caches: file IDs, which amount to an index of Drive
contents. Whether to rewrite that history, delete the repo, or accept it is still open (private
findings register GT-1). `cache/` has been gitignored since `79c98a8`.
**Decision:** Committed and pushed the work in progress (DAG compute, stale-files view,
`CACHE_DATAFLOW.md`, `ROADMAP.md`) and added `.github/workflows/security.yml`, which calls the
shared gitleaks + gate workflow; the push gate blocks every push without it. The new commits add
no Drive data, so pushing them doesn't widen the existing exposure.
Rejected:
- Holding everything back until the history decision is made. The new work is clean, and an
  unpushed tree is not backed up.
- Rewriting the history now. That's Pieter's call (`TODO.md`).
**Verified:** `gate.sh scan-tree` → exit 0. Drive-ID-shaped tokens (`\b1[A-Za-z0-9_-]{27,43}\b`)
in the diff plus new files → 0. Fixture names are generic ("My Drive", "Budget.xlsx", "file1.txt").
`./test.sh`: backend 324 passed, visualization safety 6 passed, cache loading 4 passed. The API
integration checks fail because they need a running server, and they fail the same way on the
committed tree with no changes (`git stash`).
