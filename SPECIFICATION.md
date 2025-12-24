Google Drive → Local Index + DAG Spec (My Drive Only)
Goals

Build a local, queryable mirror of My Drive metadata that supports:

All files metadata you can access (My Drive scope)

All parent relationships (graph edges)

All shortcut targets

Enough capability info to know what actions are legal later

No permissions list

No content bytes download

Incremental sync using Drive “Changes” tokens (like React diff/reconcile)

Non-goals (for v1):

Shared Drives / Team Drives

Permission/ACL enumeration (permissions.list)

Exporting Google Docs to compute hashes

Full-text indexing of document content

High-level Architecture
Components

DriveClient

Auth + Drive API calls (files.list, changes.*).

IndexDB (SQLite)

Stores normalized columns + raw_json for lossless fidelity.

FullCrawl

Enumerates all My Drive items and builds file table + parent edges.

ChangeSync

Replays diffs since last startPageToken into the DB.

GraphQueries

DAG-ish view, path reconstruction, duplicate grouping, folder traversals.

Invariants / HealthChecks

Post-run validation to detect corruption/drift.

Key invariants

Files are nodes; parent links are edges.

A file can have 0..N parents.

“Appears in two locations” can mean:

two different IDs (true duplicate candidates if same (md5,size)), OR

one ID with multiple parents (multi-location reference; not a duplicate file).

Shortcuts are separate nodes with an additional pointer to a targetId.

Google Drive API Usage (My Drive Only)
Auth

OAuth2 user credentials.

Scopes (choose one):

Prefer drive.metadata.readonly for indexing-only.

Use drive.readonly if you need download links later (still not downloading bytes in v1).

For future delete actions, you’ll need broader scopes (defer until action module exists).

File listing (full crawl)

Use files.list over My Drive:

q: typically trashed = false (or index trashed too; see below)

pageSize: 1000

corpora: "user"

spaces: "drive"

includeItemsFromAllDrives=false

supportsAllDrives=false

Fields (must request explicitly):

nextPageToken

files(…) with these subfields:

Minimum normalized set + safety:

id

name

mimeType

parents

trashed

createdTime

modifiedTime

size

md5Checksum

ownedByMe

owners(displayName,emailAddress,permissionId)

capabilities(canTrash,canDelete,canMoveItemWithinDrive,canRemoveChildren,canAddChildren,canRename,canShare)

shortcutDetails(targetId,targetMimeType)

headRevisionId (optional; helpful for future)

resourceKey (optional; relevant with link-sharing/resource keys)

starred (optional)

webViewLink (optional UI)

iconLink (optional UI)

Additionally store raw JSON for the entire file object as returned.

Note: Google-native files (Docs/Sheets/Slides) generally won’t have size/md5Checksum—that’s OK. You still index them.

Incremental sync (changes)

Use Changes API:

Get initial token after full crawl:

changes.getStartPageToken()

Then periodically:

changes.list(pageToken=<storedToken>, spaces="drive", includeItemsFromAllDrives=false, supportsAllDrives=false)

request fields:

nextPageToken

newStartPageToken

changes(fileId,removed,file(<same file fields as above>))

Handling changes:

If removed=true: mark file as removed locally + delete all edges where child_id=fileId

Else: upsert file row + replace its parent edges from file.parents

Local Storage (SQLite) Schema
Table: files

Stores normalized columns + raw JSON.

Columns:

id TEXT PRIMARY KEY

name TEXT

mime_type TEXT

trashed INTEGER NOT NULL (0/1)

created_time TEXT (ISO 8601)

modified_time TEXT (ISO 8601)

size INTEGER NULL

md5 TEXT NULL

owned_by_me INTEGER (0/1)

owners_json TEXT NULL (serialized subset)

capabilities_json TEXT NULL (serialized subset)

is_shortcut INTEGER NOT NULL (0/1)

shortcut_target_id TEXT NULL

shortcut_target_mime TEXT NULL

starred INTEGER NULL (0/1)

web_view_link TEXT NULL

icon_link TEXT NULL

raw_json TEXT NOT NULL (the full file object payload)

Recommended indexes:

CREATE INDEX idx_files_md5_size ON files(md5, size);

CREATE INDEX idx_files_mime ON files(mime_type);

CREATE INDEX idx_files_modified ON files(modified_time);

CREATE INDEX idx_files_trashed ON files(trashed);

Table: parents

Adjacency list for the “contains” edges.

parent_id TEXT NOT NULL

child_id TEXT NOT NULL

PRIMARY KEY(parent_id, child_id)

Indexes:

CREATE INDEX idx_parents_parent ON parents(parent_id);

CREATE INDEX idx_parents_child ON parents(child_id);

Table: sync_state

Stores sync tokens and metadata.

key TEXT PRIMARY KEY

value TEXT NOT NULL

Keys you will store:

schema_version

start_page_token (latest token to pass into changes.list)

last_full_crawl_time

last_sync_time

Optional table: file_errors

Track per-file processing errors (debug + robustness).

id INTEGER PRIMARY KEY AUTOINCREMENT

file_id TEXT

stage TEXT (crawl|sync|edge_replace)

error TEXT

created_time TEXT

Full Crawl Algorithm (My Drive)
Behavior

Enumerate all files you can see.

Upsert normalized fields + store raw_json.

Write edges into parents.

Must be idempotent:

If interrupted, rerun should converge without duplicates.

Pseudocode

db.begin()

pageToken = None

Loop:

Call files.list(...)

For each file in response:

upsert_file(file)

replace_parents(file.id, file.parents or [])

If no nextPageToken: break

token = changes.getStartPageToken()

sync_state["start_page_token"] = token

sync_state["last_full_crawl_time"] = now

db.commit()

Run health_checks()

Edge replacement rule

replace_parents(child_id, parents[]):

DELETE FROM parents WHERE child_id = ?

For each p in parents: INSERT OR IGNORE INTO parents(parent_id, child_id) VALUES (?, ?)

Incremental Sync Algorithm (Changes)
Behavior

Applies diffs from Drive since last token.

Handles additions, updates, moves (parent changes), trash/untrash, and removals.

Pseudocode

token = sync_state["start_page_token"] (must exist)

pageToken = token

Loop:

resp = changes.list(pageToken=pageToken, ...)

For each chg in resp.changes:

If chg.removed == true:

mark_removed(chg.fileId) OR delete row (prefer mark removed)

DELETE FROM parents WHERE child_id = chg.fileId

Else:

file = chg.file

upsert_file(file)

replace_parents(file.id, file.parents or [])

If resp.nextPageToken: pageToken = resp.nextPageToken and continue

Else:

sync_state["start_page_token"] = resp.newStartPageToken

break

sync_state["last_sync_time"] = now

db.commit()

Run health_checks()

“removed” vs “trashed”

trashed=true means it exists but is in trash.

removed=true in Changes means it’s no longer accessible / deleted / removed from view.

Store both:

Keep file row with removed=1 (optional) or delete it.

Recommendation: add removed INTEGER NOT NULL DEFAULT 0 to files table so you can preserve history if useful.

File Upsert Mapping

From Drive file object → normalized columns:

id ← file.id

name ← file.name

mime_type ← file.mimeType

trashed ← file.trashed ? 1 : 0

created_time ← file.createdTime

modified_time ← file.modifiedTime

size ← file.size (nullable)

md5 ← file.md5Checksum (nullable)

owned_by_me ← file.ownedByMe ? 1 : 0

owners_json ← serialize file.owners subset

capabilities_json ← serialize file.capabilities subset

is_shortcut ← file.mimeType == "application/vnd.google-apps.shortcut"

if shortcut:

shortcut_target_id ← file.shortcutDetails.targetId

shortcut_target_mime ← file.shortcutDetails.targetMimeType

raw_json ← full file JSON

DAG / Graph View Spec (including shortcuts)
Core graph edges

Parent containment is represented by parents(parent_id -> child_id).

Shortcut representation

Shortcuts are nodes themselves, with an additional pointer:

containment edges: normal edges via parents

shortcut target edge: special “shortcut” edge from shortcut_node_id -> target_id

In your DAG view, support two modes:

Mode A: “Shortcut as node”

Show shortcut as its own node in the folder it lives in.

Draw a dotted/special edge to its target.

Mode B: “Inline shortcut target”

In rendering, replace the shortcut node with the target node visually.

Still keep the shortcut node in underlying data for correctness.

UI must indicate this is an alias (e.g., “↪ shortcut” badge).

Path reconstruction

Because multi-parent exists, a node can have multiple paths.
Provide:

get_paths(file_id, max_paths=N, max_depth=D) returning possible folder paths.

For UI, choose a primary path:

heuristic: shortest path, or path containing “canonical” root, or stable first-parent ordering.

Duplicate Detection (Exact Binary, v1)

Definition (v1):

Only consider files where:

md5 IS NOT NULL

size IS NOT NULL

trashed=0

mime_type != shortcut (exclude shortcuts)

Group by (md5, size) with count > 1.

Treat those groups as “byte-identical” candidates.

Important distinction:

This finds distinct IDs that are identical.

It does not confuse multi-parent single-ID items because grouping is by id rows.
(Still: if you later act, check parent count and capabilities.)

Health Checks (Run after crawl/sync)

Must-have checks:

Dangling edges

Any (parent_id, child_id) where child_id missing in files.

Any where parent_id missing (this can happen; decide if you allow “unknown parent”).

Shortcut targets missing

For any shortcut with shortcut_target_id, confirm target exists locally; if not, mark as unresolved.

Cycle detection (folders only)

Graph should be acyclic for folder containment; verify no cycles among folder nodes.

Basic counts

Total files, folders, shortcuts, trashed, google-native vs binaries.

If checks fail:

Record into file_errors / log, but don’t necessarily abort (unless data corruption is severe).

CLI / Runner Spec

Provide a simple CLI interface:

Commands:

crawl_full
Builds from scratch (optionally clears DB or does upserts).

sync
Applies changes since last token.

stats
Prints counts and health summary.

dedupe_report
Outputs duplicate groups based on (md5,size).

Config:

DB path

OAuth credential location

Logging verbosity

Idempotency:

Running sync multiple times with no changes should do near-zero work.

Running crawl_full should converge to same state.

Implementation Notes / “Don’t mess this up” List

Always store raw_json so you never regret missing a field later.

Edges must be replaceable per file (moves are parent list changes).

Don’t treat shortcuts as duplicates.

Don’t need shared drives—keep flags off for simplicity.

Changes API is the real win: use it early, even if you only run weekly.

Avoid downloading bytes. MD5 comes from metadata for binaries.

Deliverables (What Cursor should generate)

SQLite schema migration file

drive_client.py (auth + API wrappers)

index_db.py (schema init + upsert + edge replace + state)

crawl_full.py (full crawl runner)

sync_changes.py (incremental sync runner)

queries.py (graph/path + dedupe report)

health_checks.py

cli.py (argparse entrypoint)