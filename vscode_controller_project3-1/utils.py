"""Utility helpers for the AI automation controller."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import contextmanager
from dataclasses import asdict, is_dataclass
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


def ensure_dir(path: Path) -> None:
    """Ensure the directory exists."""
    path.mkdir(parents=True, exist_ok=True)


def safe_read_file(filepath: Path, encoding: str = "utf-8") -> Optional[str]:
    """Read a file safely and return its content."""
    try:
        with filepath.open("r", encoding=encoding) as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def atomic_write(filepath: Path, content: str, encoding: str = "utf-8") -> None:
    """Atomically write file content."""
    ensure_dir(filepath.parent)
    tmp_path = filepath.with_suffix(filepath.suffix + ".tmp")
    with tmp_path.open("w", encoding=encoding) as handle:
        handle.write(content)
    tmp_path.replace(filepath)


def safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    """Parse JSON with heuristics for trailing commas and backticks."""
    if not text:
        return None
    attempts = [text, text.strip().strip("`"), text.replace("'", '"')]
    for attempt in attempts:
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    return None


def truncate_text(text: str, max_length: int = 2000) -> str:
    """Truncate text with ellipsis."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def extract_code_blocks(text: str) -> List[str]:
    """Extract triple-backtick code blocks from text."""
    blocks: List[str] = []
    if not text:
        return blocks
    delimiter = "```"
    segments = text.split(delimiter)
    for index in range(1, len(segments), 2):
        blocks.append(segments[index].strip())
    return blocks


def count_tokens(text: str, average_chars_per_token: int = 4) -> int:
    """Approximate token count."""
    if not text:
        return 0
    return max(1, len(text) // max(1, average_chars_per_token))


def format_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def parse_time_ago(timestamp: datetime) -> str:
    delta = datetime.now() - timestamp
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    return f"{days}d ago"


def retry_on_error(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Iterable[type[Exception]] = (Exception,),
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Retry decorator supporting async and sync callables."""

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if asyncio.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                retries = 0
                wait = delay
                while True:
                    try:
                        return await func(*args, **kwargs)
                    except exceptions as exc:  # type: ignore[arg-type]
                        retries += 1
                        if retries > max_retries:
                            raise
                        logger.warning(
                            "Retry %s (%s/%s): %s", func.__name__, retries, max_retries, exc
                        )
                        await asyncio.sleep(wait)
                        wait *= backoff

            return async_wrapper

        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            retries = 0
            wait = delay
            while True:
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:  # type: ignore[arg-type]
                    retries += 1
                    if retries > max_retries:
                        raise
                    logger.warning(
                        "Retry %s (%s/%s): %s", func.__name__, retries, max_retries, exc
                    )
                    time.sleep(wait)
                    wait *= backoff

        return sync_wrapper

    return decorator


@contextmanager
def working_directory(path: Path) -> Iterable[None]:
    original = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(original)


def dataclass_to_dict(obj: Any) -> Dict[str, Any]:
    if is_dataclass(obj):
        return asdict(obj)
    raise TypeError("Expected dataclass instance")

