"""Structured logging with performance timing utilities."""

import logging
import time
import functools
from contextlib import contextmanager
from typing import Optional, Dict, Any
from datetime import datetime

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s] [%(message)s]",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name."""
    return logging.getLogger(name)


class PerformanceLogger:
    """Logger with performance timing capabilities."""

    def __init__(self, name: str):
        self.logger = get_logger(name)

    def _log_with_duration(
        self,
        level: int,
        operation: str,
        duration_ms: float,
        message: str = "",
        **extra: Any,
    ) -> None:
        """Log with duration and optional extra fields."""
        duration_str = (
            f"{duration_ms:.2f}ms" if duration_ms < 1000 else f"{duration_ms/1000:.2f}s"
        )

        # Build log message with operation and duration
        parts = [f"[{operation}]"]
        if duration_ms > 0:
            parts.append(f"duration={duration_str}")

        # Add extra fields
        for key, value in extra.items():
            if value is not None:
                parts.append(f"{key}={value}")

        if message:
            parts.append(f"- {message}")

        log_msg = " ".join(parts)

        # Choose log level based on duration
        if duration_ms > 5000:
            actual_level = logging.ERROR
        elif duration_ms > 1000:
            actual_level = logging.WARNING
        else:
            actual_level = level

        self.logger.log(actual_level, log_msg)

    def info(
        self, operation: str, duration_ms: float = 0.0, message: str = "", **extra: Any
    ) -> None:
        """Log info message with optional duration."""
        self._log_with_duration(logging.INFO, operation, duration_ms, message, **extra)

    def warning(
        self, operation: str, duration_ms: float = 0.0, message: str = "", **extra: Any
    ) -> None:
        """Log warning message with optional duration."""
        self._log_with_duration(
            logging.WARNING, operation, duration_ms, message, **extra
        )

    def error(
        self, operation: str, duration_ms: float = 0.0, message: str = "", **extra: Any
    ) -> None:
        """Log error message with optional duration."""
        self._log_with_duration(logging.ERROR, operation, duration_ms, message, **extra)

    def debug(
        self, operation: str, duration_ms: float = 0.0, message: str = "", **extra: Any
    ) -> None:
        """Log debug message with optional duration."""
        self._log_with_duration(logging.DEBUG, operation, duration_ms, message, **extra)


def timed_operation(
    operation_name: Optional[str] = None, logger_name: Optional[str] = None
):
    """
    Decorator to automatically time function execution.

    Usage:
        @timed_operation("build_tree_structure")
        def build_tree_structure(files):
            ...
    """

    def decorator(func):
        op_name = operation_name or func.__name__
        perf_logger = PerformanceLogger(logger_name or func.__module__)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000

                # Try to extract useful metadata from result
                extra = {}
                if isinstance(result, dict):
                    if "files" in result:
                        extra["files"] = len(result.get("files", []))
                    if "file_count" in result:
                        extra["files"] = result.get("file_count")
                    if "stats" in result and hasattr(result["stats"], "total_files"):
                        extra["files"] = result["stats"].total_files
                elif isinstance(result, list):
                    extra["count"] = len(result)

                perf_logger.info(op_name, duration_ms=duration_ms, **extra)
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                perf_logger.error(
                    op_name, duration_ms=duration_ms, message=f"Failed: {str(e)}"
                )
                raise

        return wrapper

    return decorator


@contextmanager
def log_timing(operation: str, logger_name: Optional[str] = None, **extra: Any):
    """
    Context manager for timing code blocks.

    Usage:
        with log_timing("building_tree", files=1000):
            # code to time
            ...
    """
    perf_logger = PerformanceLogger(logger_name or "performance")
    start_time = time.perf_counter()

    try:
        yield
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.error(
            operation, duration_ms=duration_ms, message=f"Failed: {str(e)}", **extra
        )
        raise
    else:
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.info(operation, duration_ms=duration_ms, **extra)


def log_operation(
    operation: str,
    logger_name: Optional[str] = None,
    level: str = "info",
    message: str = "",
    **extra: Any,
) -> None:
    """
    Log an operation without timing.

    Usage:
        log_operation("cache_check", logger_name="cache", found=True)
    """
    perf_logger = PerformanceLogger(logger_name or "app")
    getattr(perf_logger, level.lower())(
        operation, duration_ms=0.0, message=message, **extra
    )
