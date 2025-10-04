"""Common utility helpers for the AI automation controller."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import asdict
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

try:  # Optional dependency for token counting
    import tiktoken
except ImportError:  # pragma: no cover - optional dependency
    tiktoken = None


# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------


def ensure_dir(path: Path) -> None:
    """Ensure directory exists."""

    path.mkdir(parents=True, exist_ok=True)


def safe_read_file(path: Path, encoding: str = "utf-8") -> Optional[str]:
    """Read a file returning ``None`` when it does not exist."""

    try:
        return path.read_text(encoding=encoding)
    except FileNotFoundError:
        return None


def atomic_write(path: Path, content: str, encoding: str = "utf-8") -> None:
    """Write file atomically by using a temporary file."""

    ensure_dir(path.parent)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding=encoding)
    tmp_path.replace(path)


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------


def safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    """Parse JSON returning ``None`` for invalid strings."""

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.debug("JSON parse failed", exc_info=True)
        return None


def json_dumps(data: Any, *, ensure_ascii: bool = False) -> str:
    """Dump JSON with consistent formatting."""

    return json.dumps(data, ensure_ascii=ensure_ascii, indent=2)


# ---------------------------------------------------------------------------
# String helpers
# ---------------------------------------------------------------------------


def truncate_text(text: str, max_length: int = 2000) -> str:
    """Truncate text to ``max_length`` adding ellipsis."""

    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def extract_code_blocks(text: str) -> List[str]:
    """Extract Markdown code blocks."""

    blocks: List[str] = []
    current: List[str] = []
    inside = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            if inside:
                blocks.append("\n".join(current))
                current = []
                inside = False
            else:
                inside = True
            continue
        if inside:
            current.append(line)
    if current:
        blocks.append("\n".join(current))
    return blocks


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------


def count_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    """Estimate tokens for a text using ``tiktoken`` when available."""

    if not text:
        return 0
    if tiktoken is None:  # pragma: no cover - fallback estimation
        return max(1, len(text) // 4)
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------


def format_timestamp(dt: Optional[datetime] = None) -> str:
    """Return human friendly timestamp."""

    dt = dt or datetime.utcnow()
    return dt.strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------


CallableType = Callable[..., Any]


def retry_on_error(
    *,
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Iterable[type[BaseException]] = (Exception,),
) -> Callable[[CallableType], CallableType]:
    """Retry decorator supporting ``async`` and sync functions."""

    def decorator(func: CallableType) -> CallableType:
        if asyncio.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                retries = 0
                wait = delay
                while True:
                    try:
                        return await func(*args, **kwargs)
                    except exceptions as exc:  # type: ignore[catching-non-exception]
                        retries += 1
                        if retries > max_retries:
                            raise
                        logger.warning("%s failed (%s), retry %s/%s", func.__name__, exc, retries, max_retries)
                        await asyncio.sleep(wait)
                        wait *= backoff

            return async_wrapper  # type: ignore[return-value]

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            retries = 0
            wait = delay
            while True:
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:  # type: ignore[catching-non-exception]
                    retries += 1
                    if retries > max_retries:
                        raise
                    logger.warning("%s failed (%s), retry %s/%s", func.__name__, exc, retries, max_retries)
                    import time

                    time.sleep(wait)
                    wait *= backoff

        return sync_wrapper  # type: ignore[return-value]

    return decorator


__all__ = [
    "ensure_dir",
    "safe_read_file",
    "atomic_write",
    "safe_json_loads",
    "json_dumps",
    "truncate_text",
    "extract_code_blocks",
    "count_tokens",
    "format_timestamp",
    "retry_on_error",
]
