"""SQLite database layer for Google Drive metadata index.

This module provides the persistence layer for storing Drive file metadata
in a normalized SQLite database with support for:
- Full file metadata + raw JSON for future-proofing
- Parent-child relationships (edges) for DAG traversal
- Sync state management for incremental updates via Changes API
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .utils.logger import PerformanceLogger

# Performance logger for database operations
db_logger = PerformanceLogger("index_db")

# Default database path
DEFAULT_DB_PATH = Path(__file__).parent.parent / "data" / "drive_index.db"

# Schema version for migrations
SCHEMA_VERSION = 1


def get_db_path() -> Path:
    """Get the database file path, creating parent directory if needed."""
    db_path = DEFAULT_DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


@contextmanager
def get_connection(db_path: Optional[Path] = None) -> Iterator[sqlite3.Connection]:
    """Context manager for database connections with proper cleanup."""
    path = db_path or get_db_path()
    conn = sqlite3.connect(str(path), timeout=30.0)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys and WAL mode for better concurrency
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: Optional[Path] = None) -> None:
    """
    Initialize the database schema.
    
    Creates tables and indexes if they don't exist.
    Safe to call multiple times (idempotent).
    """
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        
        # Files table with normalized columns + raw_json
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                name TEXT,
                mime_type TEXT,
                trashed INTEGER NOT NULL DEFAULT 0,
                created_time TEXT,
                modified_time TEXT,
                size INTEGER,
                md5 TEXT,
                owned_by_me INTEGER,
                owners_json TEXT,
                capabilities_json TEXT,
                is_shortcut INTEGER NOT NULL DEFAULT 0,
                shortcut_target_id TEXT,
                shortcut_target_mime TEXT,
                starred INTEGER,
                web_view_link TEXT,
                icon_link TEXT,
                raw_json TEXT NOT NULL,
                removed INTEGER NOT NULL DEFAULT 0
            )
        """)
        
        # Parents adjacency table for containment edges
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS parents (
                parent_id TEXT NOT NULL,
                child_id TEXT NOT NULL,
                PRIMARY KEY(parent_id, child_id)
            )
        """)
        
        # Sync state table for tokens and metadata
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        
        # Optional: file_errors table for debugging
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS file_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT,
                stage TEXT,
                error TEXT,
                created_time TEXT
            )
        """)
        
        # Create indexes for common queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_md5_size ON files(md5, size)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_mime ON files(mime_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_time)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(trashed)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_removed ON files(removed)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_parents_parent ON parents(parent_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_parents_child ON parents(child_id)")
        
        # Store schema version
        cursor.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
            ("schema_version", str(SCHEMA_VERSION))
        )
        
        conn.commit()
        db_logger.info("init_db", message="Database initialized", schema_version=SCHEMA_VERSION)


def upsert_file(conn: sqlite3.Connection, file_dict: Dict[str, Any]) -> None:
    """
    Insert or update a file record from Drive API response.
    
    Maps Drive API fields to normalized columns and stores raw JSON.
    
    Args:
        conn: Database connection
        file_dict: File object from Drive API response
    """
    file_id = file_dict.get("id")
    if not file_id:
        return
    
    # Determine if this is a shortcut
    mime_type = file_dict.get("mimeType", "")
    is_shortcut = 1 if mime_type == "application/vnd.google-apps.shortcut" else 0
    
    # Extract shortcut details if present
    shortcut_details = file_dict.get("shortcutDetails") or {}
    shortcut_target_id = shortcut_details.get("targetId")
    shortcut_target_mime = shortcut_details.get("targetMimeType")
    
    # Serialize complex fields
    owners = file_dict.get("owners")
    owners_json = json.dumps(owners) if owners else None
    
    capabilities = file_dict.get("capabilities")
    capabilities_json = json.dumps(capabilities) if capabilities else None
    
    # Store the full raw JSON
    raw_json = json.dumps(file_dict)
    
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO files (
            id, name, mime_type, trashed, created_time, modified_time,
            size, md5, owned_by_me, owners_json, capabilities_json,
            is_shortcut, shortcut_target_id, shortcut_target_mime,
            starred, web_view_link, icon_link, raw_json, removed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            mime_type = excluded.mime_type,
            trashed = excluded.trashed,
            created_time = excluded.created_time,
            modified_time = excluded.modified_time,
            size = excluded.size,
            md5 = excluded.md5,
            owned_by_me = excluded.owned_by_me,
            owners_json = excluded.owners_json,
            capabilities_json = excluded.capabilities_json,
            is_shortcut = excluded.is_shortcut,
            shortcut_target_id = excluded.shortcut_target_id,
            shortcut_target_mime = excluded.shortcut_target_mime,
            starred = excluded.starred,
            web_view_link = excluded.web_view_link,
            icon_link = excluded.icon_link,
            raw_json = excluded.raw_json,
            removed = 0
    """, (
        file_id,
        file_dict.get("name"),
        mime_type,
        1 if file_dict.get("trashed") else 0,
        file_dict.get("createdTime"),
        file_dict.get("modifiedTime"),
        int(file_dict.get("size")) if file_dict.get("size") else None,
        file_dict.get("md5Checksum"),
        1 if file_dict.get("ownedByMe") else 0,
        owners_json,
        capabilities_json,
        is_shortcut,
        shortcut_target_id,
        shortcut_target_mime,
        1 if file_dict.get("starred") else 0,
        file_dict.get("webViewLink"),
        file_dict.get("iconLink"),
        raw_json,
    ))


def replace_parents(conn: sqlite3.Connection, child_id: str, parent_ids: List[str]) -> None:
    """
    Replace all parent edges for a file.
    
    This handles file moves - when a file's parents change, we delete
    all existing edges and insert the new ones.
    
    Args:
        conn: Database connection
        child_id: The file ID whose parents are being updated
        parent_ids: List of new parent folder IDs
    """
    cursor = conn.cursor()
    
    # Delete existing edges for this child
    cursor.execute("DELETE FROM parents WHERE child_id = ?", (child_id,))
    
    # Insert new edges
    for parent_id in parent_ids:
        cursor.execute(
            "INSERT OR IGNORE INTO parents (parent_id, child_id) VALUES (?, ?)",
            (parent_id, child_id)
        )


def mark_file_removed(conn: sqlite3.Connection, file_id: str) -> None:
    """
    Mark a file as removed (from Changes API 'removed' flag).
    
    This preserves the file record for history but marks it as no longer accessible.
    Also removes all parent edges.
    
    Args:
        conn: Database connection
        file_id: The file ID to mark as removed
    """
    cursor = conn.cursor()
    cursor.execute("UPDATE files SET removed = 1 WHERE id = ?", (file_id,))
    cursor.execute("DELETE FROM parents WHERE child_id = ?", (file_id,))


def get_sync_state(conn: sqlite3.Connection, key: str) -> Optional[str]:
    """Get a value from sync_state table."""
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM sync_state WHERE key = ?", (key,))
    row = cursor.fetchone()
    return row["value"] if row else None


def set_sync_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Set a value in sync_state table."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
        (key, value)
    )


def log_file_error(
    conn: sqlite3.Connection,
    file_id: Optional[str],
    stage: str,
    error: str
) -> None:
    """Log a processing error for debugging."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO file_errors (file_id, stage, error, created_time) VALUES (?, ?, ?, ?)",
        (file_id, stage, error, datetime.now(timezone.utc).isoformat())
    )


def get_file_by_id(conn: sqlite3.Connection, file_id: str) -> Optional[Dict[str, Any]]:
    """Get a file record by ID."""
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM files WHERE id = ? AND removed = 0", (file_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def get_all_files(
    conn: sqlite3.Connection,
    include_trashed: bool = False,
    include_removed: bool = False
) -> List[Dict[str, Any]]:
    """
    Get all files from the database.
    
    Args:
        conn: Database connection
        include_trashed: Whether to include trashed files
        include_removed: Whether to include removed files
        
    Returns:
        List of file dictionaries
    """
    cursor = conn.cursor()
    
    conditions = []
    if not include_removed:
        conditions.append("removed = 0")
    if not include_trashed:
        conditions.append("trashed = 0")
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    cursor.execute(f"SELECT * FROM files WHERE {where_clause}")
    return [dict(row) for row in cursor.fetchall()]


def get_parents(conn: sqlite3.Connection, child_id: str) -> List[str]:
    """Get parent IDs for a file."""
    cursor = conn.cursor()
    cursor.execute("SELECT parent_id FROM parents WHERE child_id = ?", (child_id,))
    return [row["parent_id"] for row in cursor.fetchall()]


def get_children(conn: sqlite3.Connection, parent_id: str) -> List[str]:
    """Get child IDs for a folder."""
    cursor = conn.cursor()
    cursor.execute("SELECT child_id FROM parents WHERE parent_id = ?", (parent_id,))
    return [row["child_id"] for row in cursor.fetchall()]


def get_file_count(conn: sqlite3.Connection, include_trashed: bool = False) -> int:
    """Get total count of files."""
    cursor = conn.cursor()
    if include_trashed:
        cursor.execute("SELECT COUNT(*) as count FROM files WHERE removed = 0")
    else:
        cursor.execute("SELECT COUNT(*) as count FROM files WHERE removed = 0 AND trashed = 0")
    return cursor.fetchone()["count"]


def clear_database(db_path: Optional[Path] = None) -> None:
    """Clear all data from the database (for testing or reset)."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM parents")
        cursor.execute("DELETE FROM files")
        cursor.execute("DELETE FROM file_errors")
        # Keep schema_version in sync_state
        cursor.execute("DELETE FROM sync_state WHERE key != 'schema_version'")
        conn.commit()
        db_logger.info("clear_database", message="Database cleared")


def database_exists(db_path: Optional[Path] = None) -> bool:
    """Check if the database file exists and has been initialized."""
    path = db_path or get_db_path()
    if not path.exists():
        return False
    
    try:
        with get_connection(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM sync_state WHERE key = 'schema_version'")
            row = cursor.fetchone()
            return row is not None
    except Exception:
        return False
