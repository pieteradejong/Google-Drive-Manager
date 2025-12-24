"""Performance tracking middleware for FastAPI requests."""

import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..utils.logger import PerformanceLogger

perf_logger = PerformanceLogger("middleware")


class PerformanceMiddleware(BaseHTTPMiddleware):
    """Middleware to track request performance and log slow requests."""

    def __init__(self, app: ASGIApp, slow_request_threshold_ms: float = 1000.0):
        """
        Initialize performance middleware.

        Args:
            app: The ASGI application
            slow_request_threshold_ms: Log as warning if request takes longer than this (ms)
        """
        super().__init__(app)
        self.slow_request_threshold_ms = slow_request_threshold_ms

    async def dispatch(self, request: Request, call_next):
        """Process request and track timing."""
        start_time = time.perf_counter()

        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            # If exception occurs, still track timing
            duration_ms = (time.perf_counter() - start_time) * 1000
            perf_logger.error(
                "request",
                duration_ms=duration_ms,
                method=request.method,
                path=request.url.path,
                message=f"Request failed: {str(e)}",
            )
            raise

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Add response time header
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

        # Extract useful metadata from response
        extra_fields = {
            "method": request.method,
            "path": request.url.path,
            "status": status_code,
        }

        # Try to get file count from response if it's a scan endpoint
        if "scan" in request.url.path and status_code == 200:
            # Note: We can't easily get the response body here without consuming it
            # So we just log the endpoint
            if "/scan/quick" in request.url.path:
                extra_fields["endpoint"] = "quick_scan"
            elif "/scan/full" in request.url.path:
                extra_fields["endpoint"] = "full_scan"

        # Log based on duration
        if duration_ms > 5000:
            perf_logger.error("request", duration_ms=duration_ms, **extra_fields)
        elif duration_ms > self.slow_request_threshold_ms:
            perf_logger.warning("request", duration_ms=duration_ms, **extra_fields)
        elif duration_ms > 500:
            perf_logger.info("request", duration_ms=duration_ms, **extra_fields)
        # Skip logging very fast requests (<500ms) to reduce noise

        return response
