"""Derived analytics computed from full scan results.

These computations are meant to run once per full_scan cache version and be persisted
to a derived analytics cache (see backend.cache AnalyticsCacheMetadata).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import time
from typing import Any, Dict, List, Optional, Tuple


# ---- Helpers


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _parse_iso_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        # Handles e.g. '2025-01-01T12:34:56.000Z' by replacing Z
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _date_key(dt: datetime) -> str:
    # YYYY-MM-DD
    return dt.date().isoformat()


def _month_key(dt: datetime) -> str:
    # YYYY-MM
    return f"{dt.year:04d}-{dt.month:02d}"


def _week_key(dt: datetime) -> str:
    # ISO week start (Monday) as YYYY-MM-DD
    # Python's isoweekday: Monday=1..Sunday=7
    start = dt.date()
    start = start.fromordinal(start.toordinal() - (dt.isoweekday() - 1))
    return start.isoformat()


def _is_folder(file_obj: Dict[str, Any]) -> bool:
    return file_obj.get("mimeType") == "application/vnd.google-apps.folder"


def _file_size(file_obj: Dict[str, Any]) -> int:
    # Prefer calculatedSize for folders; fall back to size.
    return _safe_int(file_obj.get("calculatedSize") or file_obj.get("size") or 0)


# ---- Semantic categories (mirror frontend intent, simplified)


@dataclass(frozen=True)
class _SemanticCategory:
    name: str
    keywords: Tuple[str, ...]


_SEMANTIC_CATEGORIES: Tuple[_SemanticCategory, ...] = (
    _SemanticCategory("Backup/Archive", ("backup", "backup_", "old", "old_", "archive", "legacy", "bak", "oldbackup")),
    _SemanticCategory("Photos", ("photo", "photos", "picture", "pictures", "images", "camera", "pic", "pics", "img")),
    _SemanticCategory("Work", ("work", "business", "client", "project", "projects", "office", "corporate", "job")),
    _SemanticCategory("Personal", ("personal", "home", "family", "private", "my", "self")),
    _SemanticCategory("Documents", ("document", "doc", "documents", "files", "paperwork")),
    _SemanticCategory("Music", ("music", "audio", "song", "songs", "mp3", "sound", "tunes")),
    _SemanticCategory("Videos", ("video", "videos", "movie", "movies", "film", "films")),
    _SemanticCategory("Downloads", ("download", "downloaded", "temp", "tmp")),
    _SemanticCategory("Code", ("code", "dev", "development", "src", "source", "script", "scripts", "programming")),
    _SemanticCategory("School", ("school", "education", "study", "studies", "course", "courses", "class", "university")),
)


def _classify_folder_by_name(name: str) -> Optional[str]:
    lower = (name or "").lower()
    for cat in _SEMANTIC_CATEGORIES:
        for kw in cat.keywords:
            if kw in lower:
                return cat.name
    return None


def _classify_folder_by_content(
    folder_id: str,
    child_ids: List[str],
    file_by_id: Dict[str, Dict[str, Any]],
    now: datetime,
) -> Optional[str]:
    if not child_ids:
        return None

    total_files = 0
    image_count = 0
    video_count = 0
    audio_count = 0
    doc_count = 0
    old_file_count = 0

    one_year_seconds = 365 * 24 * 60 * 60
    now_ts = now.timestamp()

    for cid in child_ids:
        child = file_by_id.get(cid)
        if not child:
            continue
        if _is_folder(child):
            continue
        total_files += 1
        mime = (child.get("mimeType") or "").lower()
        if mime.startswith("image/"):
            image_count += 1
        elif mime.startswith("video/"):
            video_count += 1
        elif mime.startswith("audio/"):
            audio_count += 1
        elif ("document" in mime) or ("pdf" in mime):
            doc_count += 1

        mdt = _parse_iso_date(child.get("modifiedTime"))
        if mdt and (now_ts - mdt.timestamp()) > one_year_seconds:
            old_file_count += 1

    if total_files == 0:
        return None

    # Mirror frontend heuristics (>80% rule)
    if image_count / total_files > 0.8:
        return "Photos"
    if old_file_count / total_files > 0.8:
        return "Backup/Archive"
    if video_count / total_files > 0.8:
        return "Videos"
    if audio_count / total_files > 0.8:
        return "Music"
    if doc_count / total_files > 0.8:
        return "Documents"

    return None


# ---- Analytics computations


def compute_duplicates(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Group potential duplicates by name+size.
    Returns groups sorted by potential savings (desc).
    """
    groups: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    for f in files:
        if _is_folder(f):
            continue
        name = f.get("name") or ""
        size = _safe_int(f.get("size") or 0)
        key = (name, size)
        groups.setdefault(key, []).append(f)

    out_groups: List[Dict[str, Any]] = []
    total_potential_savings = 0

    for (name, size), flist in groups.items():
        if len(flist) < 2:
            continue
        potential_savings = (len(flist) - 1) * size
        total_potential_savings += potential_savings

        first = flist[0]
        identical_metadata = True
        for f in flist[1:]:
            if (
                f.get("name") != first.get("name")
                or _safe_int(f.get("size") or 0) != _safe_int(first.get("size") or 0)
                or f.get("mimeType") != first.get("mimeType")
                or f.get("createdTime") != first.get("createdTime")
                or f.get("modifiedTime") != first.get("modifiedTime")
            ):
                identical_metadata = False
                break

        out_groups.append(
            {
                "name": name,
                "size": size,
                "file_ids": [f.get("id") for f in flist if f.get("id")],
                "count": len(flist),
                "potential_savings": potential_savings,
                "identical_metadata": identical_metadata,
                "mimeType": first.get("mimeType"),
            }
        )

    out_groups.sort(key=lambda g: g["potential_savings"], reverse=True)
    return {"groups": out_groups, "total_potential_savings": total_potential_savings}


def compute_orphans(files: List[Dict[str, Any]], file_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Find files with missing parent references."""
    orphans: List[Dict[str, Any]] = []
    for f in files:
        parents = f.get("parents") or []
        if not parents:
            continue
        missing = [pid for pid in parents if pid not in file_by_id]
        if missing:
            orphans.append({"file_id": f.get("id"), "missing_parent_ids": missing})
    return {"orphans": orphans, "count": len(orphans)}


def compute_depths(files: List[Dict[str, Any]], file_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Compute folder depth (max parent depth + 1), with cycle protection."""
    depth_by_id: Dict[str, int] = {}
    visiting: set[str] = set()

    def depth(node_id: str) -> int:
        if node_id in depth_by_id:
            return depth_by_id[node_id]
        if node_id in visiting:
            # cycle, treat as root-ish
            return 0
        visiting.add(node_id)
        node = file_by_id.get(node_id)
        if not node or not _is_folder(node):
            visiting.remove(node_id)
            depth_by_id[node_id] = 0
            return 0
        parents = node.get("parents") or []
        if not parents:
            visiting.remove(node_id)
            depth_by_id[node_id] = 0
            return 0

        parent_depths = [depth(pid) for pid in parents]
        d = (max(parent_depths) if parent_depths else 0) + 1
        visiting.remove(node_id)
        depth_by_id[node_id] = d
        return d

    folders = [f for f in files if _is_folder(f) and f.get("id")]
    for folder in folders:
        depth(folder["id"])

    # Distribution
    dist: Dict[int, Dict[str, Any]] = {}
    for folder in folders:
        fid = folder["id"]
        d = depth_by_id.get(fid, 0)
        entry = dist.setdefault(d, {"depth": d, "folder_count": 0, "total_size": 0})
        entry["folder_count"] += 1
        entry["total_size"] += _file_size(folder)

    dist_list = sorted(dist.values(), key=lambda x: x["depth"])
    max_depth = max(depth_by_id.values(), default=0)
    # Precompute deepest folder ids for convenience (small list)
    deepest = sorted(depth_by_id.items(), key=lambda kv: kv[1], reverse=True)[:50]
    deepest_folder_ids = [fid for fid, _ in deepest]
    return {
        "depth_by_id": depth_by_id,
        "distribution": dist_list,
        "max_depth": max_depth,
        "deepest_folder_ids": deepest_folder_ids,
    }


def compute_semantic(
    files: List[Dict[str, Any]],
    children_map: Dict[str, List[str]],
    file_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute semantic category per folder + totals."""
    now = datetime.now().astimezone()
    folder_category: Dict[str, Dict[str, Any]] = {}
    category_folder_ids: Dict[str, List[str]] = {cat.name: [] for cat in _SEMANTIC_CATEGORIES}
    uncategorized_folder_ids: List[str] = []

    totals: Dict[str, Dict[str, Any]] = {cat.name: {"folder_count": 0, "total_size": 0} for cat in _SEMANTIC_CATEGORIES}
    uncategorized_count = 0

    for f in files:
        if not _is_folder(f):
            continue
        fid = f.get("id")
        if not fid:
            continue
        name = f.get("name") or ""

        cat_name = _classify_folder_by_name(name)
        confidence = None
        method = None

        if cat_name:
            confidence = "high"
            method = "name"
        else:
            child_ids = children_map.get(fid) or []
            cat_name = _classify_folder_by_content(fid, child_ids, file_by_id, now)
            if cat_name:
                confidence = "medium"
                method = "content"

        if cat_name:
            folder_category[fid] = {"category": cat_name, "confidence": confidence, "method": method}
            totals[cat_name]["folder_count"] += 1
            totals[cat_name]["total_size"] += _file_size(f)
            category_folder_ids[cat_name].append(fid)
        else:
            uncategorized_count += 1
            uncategorized_folder_ids.append(fid)

    # Only keep non-empty totals for frontend lists
    totals_non_empty = {k: v for k, v in totals.items() if v["folder_count"] > 0}
    category_folder_ids_non_empty = {k: v for k, v in category_folder_ids.items() if len(v) > 0}
    return {
        "folder_category": folder_category,
        "totals": totals_non_empty,
        "category_folder_ids": category_folder_ids_non_empty,
        "uncategorized_count": uncategorized_count,
        "uncategorized_folder_ids": uncategorized_folder_ids,
    }


def compute_age_semantic(
    folders: List[Dict[str, Any]],
    folder_category: Dict[str, Dict[str, Any]],
    now: datetime,
) -> Dict[str, Any]:
    """Compute age bucket matrix for folders by semantic category."""
    # Match frontend intent (5 buckets)
    buckets = [
        ("0-30 days", 0, 30),
        ("30-90 days", 30, 90),
        ("90-180 days", 90, 180),
        ("180-365 days", 180, 365),
        ("365+ days", 365, 10_000),
    ]

    matrix: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for f in folders:
        fid = f.get("id")
        if not fid:
            continue
        cat = folder_category.get(fid, {}).get("category", "Uncategorized")
        mdt = _parse_iso_date(f.get("modifiedTime"))
        age_days = 10_000
        if mdt:
            age_days = int((now.timestamp() - mdt.timestamp()) / 86400)

        bucket_label = "365+ days"
        for label, start, end in buckets:
            if age_days >= start and age_days < end:
                bucket_label = label
                break

        matrix.setdefault(cat, {})
        cell = matrix[cat].setdefault(bucket_label, {"folder_count": 0, "total_size": 0})
        cell["folder_count"] += 1
        cell["total_size"] += _file_size(f)

    return {"buckets": [b[0] for b in buckets], "matrix": matrix}


def _file_type_group(mime: str) -> str:
    m = (mime or "").lower()
    if m.startswith("image/"):
        return "Images"
    if m.startswith("video/"):
        return "Videos"
    if m.startswith("audio/"):
        return "Audio"
    if (
        m.startswith("application/pdf")
        or m.startswith("application/vnd.google-apps.document")
        or m.startswith("application/msword")
        or m.startswith("application/vnd.openxmlformats")
    ):
        return "Documents"
    return "Other"


def compute_type_semantic(
    files: List[Dict[str, Any]],
    folder_category: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute file type totals by semantic category (using first parent folder category)."""
    matrix: Dict[str, Dict[str, Dict[str, int]]] = {}
    for f in files:
        if _is_folder(f):
            continue
        fid = f.get("id")
        if not fid:
            continue
        parents = f.get("parents") or []
        parent = parents[0] if parents else None
        cat = "Uncategorized"
        if parent and parent in folder_category:
            cat = folder_category[parent].get("category") or "Uncategorized"

        group = _file_type_group(f.get("mimeType") or "")
        cell = matrix.setdefault(cat, {}).setdefault(group, {"file_count": 0, "total_size": 0})
        cell["file_count"] += 1
        cell["total_size"] += _file_size(f)

    return {"groups": ["Images", "Videos", "Audio", "Documents", "Other"], "matrix": matrix}


def compute_type_stats(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute size+count by broad type group."""
    groups = {
        "Folders": {"count": 0, "total_size": 0},
        "Images": {"count": 0, "total_size": 0},
        "Documents": {"count": 0, "total_size": 0},
        "Videos": {"count": 0, "total_size": 0},
        "Audio": {"count": 0, "total_size": 0},
        "Other": {"count": 0, "total_size": 0},
    }

    for f in files:
        mime = (f.get("mimeType") or "").lower()
        size = _file_size(f)
        if mime == "application/vnd.google-apps.folder":
            groups["Folders"]["count"] += 1
            groups["Folders"]["total_size"] += size
        elif mime.startswith("image/"):
            groups["Images"]["count"] += 1
            groups["Images"]["total_size"] += size
        elif (
            mime.startswith("application/pdf")
            or mime.startswith("application/vnd.google-apps.document")
            or mime.startswith("application/msword")
            or mime.startswith("application/vnd.openxmlformats")
        ):
            groups["Documents"]["count"] += 1
            groups["Documents"]["total_size"] += size
        elif mime.startswith("video/"):
            groups["Videos"]["count"] += 1
            groups["Videos"]["total_size"] += size
        elif mime.startswith("audio/"):
            groups["Audio"]["count"] += 1
            groups["Audio"]["total_size"] += size
        else:
            # exclude folders already handled
            if mime != "application/vnd.google-apps.folder":
                groups["Other"]["count"] += 1
                groups["Other"]["total_size"] += size

    # Remove empty
    groups = {k: v for k, v in groups.items() if v["count"] > 0}
    return {"groups": groups}


def compute_timeline(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute activity buckets by day/week/month for created and modified times."""
    created_day: Dict[str, Dict[str, int]] = {}
    modified_day: Dict[str, Dict[str, int]] = {}
    created_week: Dict[str, Dict[str, int]] = {}
    modified_week: Dict[str, Dict[str, int]] = {}
    created_month: Dict[str, Dict[str, int]] = {}
    modified_month: Dict[str, Dict[str, int]] = {}

    def add(bucket: Dict[str, Dict[str, int]], key: str, size: int):
        entry = bucket.setdefault(key, {"count": 0, "total_size": 0})
        entry["count"] += 1
        entry["total_size"] += size

    for f in files:
        if _is_folder(f):
            continue
        size = _file_size(f)
        cdt = _parse_iso_date(f.get("createdTime"))
        mdt = _parse_iso_date(f.get("modifiedTime"))

        if cdt:
            add(created_day, _date_key(cdt), size)
            add(created_week, _week_key(cdt), size)
            add(created_month, _month_key(cdt), size)
        if mdt:
            add(modified_day, _date_key(mdt), size)
            add(modified_week, _week_key(mdt), size)
            add(modified_month, _month_key(mdt), size)

    return {
        "created": {"day": created_day, "week": created_week, "month": created_month},
        "modified": {"day": modified_day, "week": modified_week, "month": modified_month},
    }


def compute_large_lists(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Precompute top-N largest files/folders by size."""
    folders = [f for f in files if _is_folder(f) and f.get("id")]
    nonfolders = [f for f in files if (not _is_folder(f)) and f.get("id")]

    # Sorting once on backend is okay; keep top lists bounded.
    nonfolders.sort(key=lambda x: _file_size(x), reverse=True)
    folders.sort(key=lambda x: _file_size(x), reverse=True)

    top_files = [f["id"] for f in nonfolders[:2000]]
    top_folders = [f["id"] for f in folders[:1000]]
    return {"top_file_ids": top_files, "top_folder_ids": top_folders}


def build_file_index(files: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {f.get("id"): f for f in files if f.get("id")}


def compute_all_analytics(scan_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute all derived analytics from a ScanResponse-like dict (model_dump).
    Expects:
      - scan_data['files']: list of file dicts
      - scan_data['children_map']: dict parentId -> [childId]
      - scan_data['stats']: dict
    """
    files: List[Dict[str, Any]] = scan_data.get("files") or []
    children_map: Dict[str, List[str]] = scan_data.get("children_map") or {}

    file_by_id = build_file_index(files)

    duplicates = compute_duplicates(files)
    depths = compute_depths(files, file_by_id)
    semantic = compute_semantic(files, children_map, file_by_id)
    folders_only = [f for f in files if _is_folder(f)]
    now = datetime.now().astimezone()
    age_semantic = compute_age_semantic(folders_only, semantic.get("folder_category") or {}, now)
    type_semantic = compute_type_semantic(files, semantic.get("folder_category") or {})
    orphans = compute_orphans(files, file_by_id)
    types = compute_type_stats(files)
    timeline = compute_timeline(files)
    large_lists = compute_large_lists(files)

    return {
        "derived_version": 2,
        "duplicates": duplicates,
        "depths": depths,
        "semantic": semantic,
        "age_semantic": age_semantic,
        "type_semantic": type_semantic,
        "orphans": orphans,
        "types": types,
        "timeline": timeline,
        "large": large_lists,
    }


def compute_full_scan_analytics_cache(full_scan_cache: Dict[str, Any]) -> Tuple[Dict[str, Any], "AnalyticsCacheMetadata"]:
    """
    Compute analytics bundle + metadata from a full_scan cache payload (as returned by load_cache('full_scan')).
    """
    from .cache import AnalyticsCacheMetadata, CacheMetadata

    if "data" not in full_scan_cache or "metadata" not in full_scan_cache:
        raise ValueError("Invalid full_scan cache payload: missing data/metadata")

    source_meta = CacheMetadata(**full_scan_cache["metadata"])

    timings_ms: Dict[str, float] = {}
    t0 = time.perf_counter()
    bundle = compute_all_analytics(full_scan_cache["data"])
    timings_ms["analytics.total"] = (time.perf_counter() - t0) * 1000

    meta = AnalyticsCacheMetadata(
        computed_at=datetime.now(timezone.utc).isoformat(),
        source_cache_timestamp=source_meta.timestamp,
        source_cache_version=source_meta.cache_version,
        source_file_count=source_meta.file_count,
        source_total_size=source_meta.total_size,
        derived_version=bundle.get("derived_version", 1),
        timings_ms=timings_ms,
    )
    return bundle, meta


def save_full_scan_analytics_cache(full_scan_cache: Dict[str, Any]) -> bool:
    """
    Compute and save derived analytics for the given full_scan cache.
    Persists to cache/full_scan_analytics_cache.json via save_cache('full_scan_analytics', ...).
    """
    from .cache import save_cache

    bundle, meta = compute_full_scan_analytics_cache(full_scan_cache)
    return save_cache("full_scan_analytics", bundle, meta)  # type: ignore[arg-type]

