#!/usr/bin/env python3
"""Command-line interface for Google Drive index operations.

Usage:
    python -m backend.cli crawl_full    # Full crawl from scratch
    python -m backend.cli sync          # Incremental sync via Changes API
    python -m backend.cli stats         # Print counts and health summary
    python -m backend.cli dedupe_report # Output duplicate file groups
    python -m backend.cli health        # Run health checks
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from .auth import authenticate
from .index_db import get_db_path, database_exists, get_connection, get_sync_state
from .crawl_full import run_full_crawl, needs_full_crawl, CrawlProgress
from .sync_changes import run_sync, can_sync, SyncProgress
from .health_checks import run_all_health_checks, print_health_summary
from .queries import (
    get_duplicate_groups,
    get_duplicate_files_detail,
    get_total_duplicate_savings,
)


def print_progress(progress):
    """Print progress update to console."""
    if isinstance(progress, CrawlProgress):
        pct = progress._progress_pct()
        print(f"\r[{pct:5.1f}%] {progress.stage}: {progress.message}", end="", flush=True)
    elif isinstance(progress, SyncProgress):
        pct = progress._progress_pct()
        print(f"\r[{pct:5.1f}%] {progress.stage}: {progress.message}", end="", flush=True)


def cmd_crawl_full(args):
    """Run a full crawl of Google Drive."""
    print("=" * 60)
    print("FULL CRAWL - Building complete index from Google Drive")
    print("=" * 60)
    print()
    
    try:
        print("Authenticating with Google Drive...")
        service = authenticate()
        print("✓ Authentication successful")
        print()
        
        db_path = get_db_path()
        print(f"Database: {db_path}")
        print()
        
        print("Starting full crawl...")
        print("-" * 40)
        
        progress = run_full_crawl(
            service,
            db_path=db_path,
            include_trashed=args.include_trashed,
            progress_callback=print_progress
        )
        
        print()  # Newline after progress
        print("-" * 40)
        print()
        
        if progress.stage == "complete":
            print("✓ Crawl completed successfully!")
            print(f"  Files indexed: {progress.total_files:,}")
            print(f"  Errors: {progress.errors}")
            if progress.started_at and progress.completed_at:
                duration = (progress.completed_at - progress.started_at).total_seconds()
                print(f"  Duration: {duration:.1f} seconds")
        else:
            print(f"✗ Crawl ended with status: {progress.stage}")
            print(f"  Message: {progress.message}")
            return 1
        
        # Run health checks
        if not args.skip_health:
            print()
            print("Running health checks...")
            result = run_all_health_checks(db_path)
            if result.passed:
                print("✓ All health checks passed")
            else:
                print("⚠ Health check issues detected")
                for error in result.errors:
                    print(f"  ✗ {error}")
        
        return 0
        
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        import traceback
        if args.verbose:
            traceback.print_exc()
        return 1


def cmd_sync(args):
    """Run an incremental sync using the Changes API."""
    print("=" * 60)
    print("INCREMENTAL SYNC - Fetching changes since last sync")
    print("=" * 60)
    print()
    
    db_path = get_db_path()
    
    if not can_sync(db_path):
        print("✗ Cannot sync: no previous crawl found.")
        print("  Run 'python -m backend.cli crawl_full' first.")
        return 1
    
    try:
        print("Authenticating with Google Drive...")
        service = authenticate()
        print("✓ Authentication successful")
        print()
        
        # Show last sync time
        with get_connection(db_path) as conn:
            last_sync = get_sync_state(conn, "last_sync_time")
            if last_sync:
                print(f"Last sync: {last_sync}")
        print()
        
        print("Fetching changes...")
        print("-" * 40)
        
        progress = run_sync(
            service,
            db_path=db_path,
            progress_callback=print_progress
        )
        
        print()  # Newline after progress
        print("-" * 40)
        print()
        
        if progress.stage == "complete":
            print("✓ Sync completed successfully!")
            print(f"  Changes processed: {progress.total_changes:,}")
            print(f"  Files added: {progress.files_added:,}")
            print(f"  Files updated: {progress.files_updated:,}")
            print(f"  Files removed: {progress.files_removed:,}")
            print(f"  Errors: {progress.errors}")
            if progress.started_at and progress.completed_at:
                duration = (progress.completed_at - progress.started_at).total_seconds()
                print(f"  Duration: {duration:.1f} seconds")
        else:
            print(f"✗ Sync ended with status: {progress.stage}")
            print(f"  Message: {progress.message}")
            return 1
        
        return 0
        
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        import traceback
        if args.verbose:
            traceback.print_exc()
        return 1


def cmd_stats(args):
    """Print index statistics."""
    db_path = get_db_path()
    
    if not database_exists(db_path):
        print("✗ No index found. Run 'python -m backend.cli crawl_full' first.")
        return 1
    
    result = run_all_health_checks(db_path)
    print(print_health_summary(result))
    
    return 0 if result.passed else 1


def cmd_health(args):
    """Run health checks on the index."""
    db_path = get_db_path()
    
    if not database_exists(db_path):
        print("✗ No index found. Run 'python -m backend.cli crawl_full' first.")
        return 1
    
    result = run_all_health_checks(db_path)
    
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        print(print_health_summary(result))
        
        # Show detailed issues if any
        if result.details.get("dangling_edges", {}).get("missing_parent_count", 0) > 0:
            print("\nDangling Edges (missing parents):")
            edges = result.details["dangling_edges"]["missing_parents"][:10]
            for child_id, parent_id in edges:
                print(f"  Child {child_id} -> Missing parent {parent_id}")
            if len(result.details["dangling_edges"]["missing_parents"]) > 10:
                print(f"  ... and {len(result.details['dangling_edges']['missing_parents']) - 10} more")
        
        if result.details.get("shortcuts", {}).get("unresolved_count", 0) > 0:
            print("\nUnresolved Shortcuts:")
            shortcuts = result.details["shortcuts"]["unresolved"][:10]
            for sc in shortcuts:
                print(f"  {sc['name']} -> Missing target {sc['shortcut_target_id']}")
            if len(result.details["shortcuts"]["unresolved"]) > 10:
                print(f"  ... and {len(result.details['shortcuts']['unresolved']) - 10} more")
    
    return 0 if result.passed else 1


def cmd_dedupe_report(args):
    """Generate a duplicate files report."""
    db_path = get_db_path()
    
    if not database_exists(db_path):
        print("✗ No index found. Run 'python -m backend.cli crawl_full' first.")
        return 1
    
    print("=" * 60)
    print("DUPLICATE FILES REPORT")
    print("=" * 60)
    print()
    
    with get_connection(db_path) as conn:
        savings = get_total_duplicate_savings(conn)
        groups = get_duplicate_groups(conn, min_size=args.min_size, limit=args.limit)
        
        print(f"Summary:")
        print(f"  Total duplicate groups: {savings['total_groups']:,}")
        print(f"  Total duplicate files: {savings['total_duplicate_files']:,}")
        print(f"  Potential savings: {savings['total_wasted_bytes'] / (1024**3):.2f} GB")
        print()
        
        if args.json:
            # Output as JSON
            output = {
                "summary": savings,
                "groups": []
            }
            for group in groups:
                group["files"] = get_duplicate_files_detail(conn, group["file_ids"])
                output["groups"].append(group)
            print(json.dumps(output, indent=2))
        else:
            # Human-readable output
            print("-" * 60)
            print()
            
            for i, group in enumerate(groups[:args.limit], 1):
                size_mb = group["size"] / (1024**2)
                wasted_mb = group["total_wasted"] / (1024**2)
                
                print(f"Group {i}: {group['count']} files, {size_mb:.2f} MB each")
                print(f"         Potential savings: {wasted_mb:.2f} MB")
                print(f"         MD5: {group['md5']}")
                
                # Get file details
                files = get_duplicate_files_detail(conn, group["file_ids"])
                for f in files:
                    owned = "✓" if f["owned_by_me"] else " "
                    print(f"         [{owned}] {f['path']}/{f['name']}")
                
                print()
    
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Google Drive Index CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  crawl_full    Run a full crawl to build the index from scratch
  sync          Run an incremental sync using the Changes API
  stats         Print index statistics and health summary
  health        Run detailed health checks
  dedupe_report Generate a duplicate files report

Examples:
  python -m backend.cli crawl_full
  python -m backend.cli sync
  python -m backend.cli stats
  python -m backend.cli dedupe_report --min-size 1000000
        """
    )
    
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # crawl_full command
    crawl_parser = subparsers.add_parser("crawl_full", help="Run a full crawl")
    crawl_parser.add_argument(
        "--include-trashed",
        action="store_true",
        help="Include trashed files in the index"
    )
    crawl_parser.add_argument(
        "--skip-health",
        action="store_true",
        help="Skip health checks after crawl"
    )
    
    # sync command
    sync_parser = subparsers.add_parser("sync", help="Run incremental sync")
    
    # stats command
    stats_parser = subparsers.add_parser("stats", help="Print index statistics")
    
    # health command
    health_parser = subparsers.add_parser("health", help="Run health checks")
    health_parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    
    # dedupe_report command
    dedupe_parser = subparsers.add_parser("dedupe_report", help="Generate duplicate report")
    dedupe_parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Maximum number of groups to show (default: 50)"
    )
    dedupe_parser.add_argument(
        "--min-size",
        type=int,
        default=0,
        help="Minimum file size in bytes (default: 0)"
    )
    dedupe_parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Dispatch to command handler
    commands = {
        "crawl_full": cmd_crawl_full,
        "sync": cmd_sync,
        "stats": cmd_stats,
        "health": cmd_health,
        "dedupe_report": cmd_dedupe_report,
    }
    
    handler = commands.get(args.command)
    if handler:
        return handler(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
