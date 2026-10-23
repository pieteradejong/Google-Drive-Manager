# Google Drive Manager — Roadmap

## What This Project Does Today

### Backend (FastAPI + SQLite)
- **Full crawl**: Fetches all My Drive file metadata via `files.list`
- **Incremental sync**: Applies diffs via Google Drive Changes API (efficient, avoids re-crawling)
- **SQLite index**: Normalized schema with `files`, `parents`, and `sync_state` tables
- **Analytics pipeline** (`analytics.py`):
  - Duplicate detection: MD5-based (verified) + name/size heuristic for Workspace files
  - Orphan detection (files with missing parent references)
  - Folder depth distribution
  - Semantic categorization by name and content type
  - Age + semantic matrix (folder age buckets by category)
  - File type stats (Images, Videos, Audio, Documents, Other)
  - Activity timeline (by day/week/month)
  - Large file/folder rankings
- **DAG computation**: Full directed acyclic graph of the folder structure with shortcut handling
- **Health checks**: Dangling edges, cycle detection, shortcut target validation
- **Caching**: Server-side JSON cache with smart invalidation; extended TTLs for rarely-changing drives
- **CLI**: `crawl_full`, `sync`, `stats`, `dedupe_report` commands

### Frontend (React + Vite + TypeScript)
- Navigation views: Folder First, Sidebar Tree, Breadcrumb, Card View
- Analysis views:
  - Storage Dashboard
  - Large Files Finder
  - Duplicate Finder (verified vs. potential, with savings estimate)
  - File Age Analysis
  - Folder Depth Analysis
  - Activity Timeline
  - Multi-Parent Files
  - Shared With Me
  - Orphaned Files
  - Semantic Analysis
  - Age + Semantic matrix
  - Type + Semantic matrix
  - **Stale Files** *(added)*
- Visualizations: Size Grid, Timeline, Type Grouped, Search First, Folder Tree, DAG View, List

---

## Known Gaps

| Gap | Notes |
|-----|-------|
| **Read-only** | Scope is `drive.metadata.readonly` — no delete, move, or rename |
| No action layer | Can identify issues but cannot act on them |
| No empty folder detection | Trivial query, no view yet |
| No broken shortcut resolution | Detected in health checks, no frontend action |
| No storage quota trend | Point-in-time only, no historical tracking |
| No AI-assisted suggestions | Could use Claude API to suggest reorganization |
| No bulk operation UI | No select-all, no batch actions |

---

## Roadmap Options

### Option 1 — Action Capabilities (High Value, High Effort)
Upgrade scope to `drive.file` or `drive` and add write endpoints:

- **Delete duplicates** — analysis is already done, just needs a DELETE API call
- **Empty folder cleanup** — trivial SQL query → DELETE
- **Broken shortcut cleanup** — already detected in health checks
- **Bulk trash** — move identified waste to trash with confirmation dialog

**Why valuable**: All the hard analysis work is done. Actions are the missing last mile.

**Risk**: Write scope is irreversible. Needs careful confirmation UX and trash-first (not permanent delete) approach.

---

### Option 2 — Stale File Cleanup Mode *(in progress)*
Files don't change often but accumulate. Detect using `modifiedTime`:

- **Long Untouched**: Files not modified in N years (configurable), not starred
- **Large & Old**: Files >100MB not modified in 3+ years
- **Duplicate-Named Folders**: Folders like `Photos 2019` + `Photos 2019 (1)` that look like accidental copies

**Implementation**: Pure client-side analytics from existing `files` array — no backend changes needed.

**Status**: Frontend view `StaleFilesView.tsx` added under Analysis & Insights.

---

### Option 3 — AI-Assisted Organization Suggestions (Interesting, Medium Effort)
Send folder name lists + file type summaries to Claude API and get back:

- Consolidation suggestions ("7 folders look like photo archives from different years")
- Naming convention violations ("14 folders break your `YYYY-MM-DD` naming pattern")
- Merge candidates for similar-named sibling folders

**Implementation**: New backend endpoint → calls Anthropic API → returns structured suggestions → new frontend view.

**Dependency**: Requires `ANTHROPIC_API_KEY` in environment.

---

### Option 4 — External Tool: `rclone` (Separate, Production-Grade)
Best for actual bulk operations from the CLI without building an action layer here.

```bash
rclone dedupe google-drive:          # Interactive duplicate resolution
rclone sync google-drive: /local/    # Sync Drive locally
rclone size google-drive:            # Storage breakdown by folder
```

**Complements this project**: Use this project to *identify* waste, use rclone to *act* on it.

**Setup**: `brew install rclone && rclone config` — adds OAuth for Google Drive.

---

### Option 5 — External Tool: `dupeGuru` / `jdupes` (Separate)
After syncing Drive locally via rclone or Google Drive desktop app:

- `jdupes -r ~/GoogleDrive` — fast byte-identical duplicate finder
- `dupeGuru` — GUI, handles similar-but-not-identical files (fuzzy matching)

**More powerful than MD5-only** for near-duplicate detection, but requires local copies of files.

---

### Option 6 — Google Drive Native (No Code)
- **Storage Analyzer**: `drive.google.com/drive/quota` — shows usage breakdown by type
- **Gemini in Workspace**: Can summarize and search content natively
- **Limitation**: No custom analysis, no bulk operations beyond what Google provides

---

## Priority Order (Suggested)

1. **Stale Files view** *(done)* — zero infrastructure cost, high visibility value
2. **Empty folder detection** — one SQL query, new view, low effort
3. **Action layer (trash-first)** — requires scope upgrade; highest practical value
4. **AI suggestions** — requires Claude API integration; exploratory
5. **rclone integration** — document as companion tool in README

---

## Non-Goals (v1)

- Shared Drives / Team Drives
- Permission/ACL enumeration
- Full-text content indexing
- Downloading file bytes
- Cross-user deduplication
