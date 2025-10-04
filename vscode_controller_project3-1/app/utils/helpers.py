"""Utility helpers for the AI automation controller."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import string
from dataclasses import asdict
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional

import tiktoken

logger = logging.getLogger(__name__)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_read_text(path: Path, encoding: str = "utf-8") -> Optional[str]:
    try:
        return path.read_text(encoding=encoding)
    except FileNotFoundError:
        logger.warning("File not found: %s", path)
        return None
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Failed to read file %s: %s", path, exc)
        return None


def atomic_write(path: Path, content: str, encoding: str = "utf-8") -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding=encoding)
    tmp_path.replace(path)


def truncate_text(text: str, max_length: int = 4000) -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def extract_code_blocks(text: str) -> List[str]:
    pattern = re.compile(r"```(.*?)```", re.DOTALL)
    return [match.strip() for match in pattern.findall(text)]


def to_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def from_json(text: str) -> Dict[str, Any]:
    return json.loads(text)


def format_timestamp(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.utcnow()
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def relative_time(dt: datetime) -> str:
    delta = datetime.utcnow() - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds} 秒前"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} 分鐘前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} 小時前"
    days = hours // 24
    return f"{days} 天前"


def generate_conversation_id() -> str:
    token = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"conv_{token}"


def count_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:  # pragma: no cover - fallback path
        logger.debug("tiktoken encoding failed, using naive length")
        return len(text.split())


def retry_async(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Iterable[type[BaseException]] = (Exception,),
) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    def decorator(func: Callable[..., Awaitable[Any]]):
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            retries = 0
            current_delay = delay
            while True:
                try:
                    return await func(*args, **kwargs)
                except exceptions as exc:
                    retries += 1
                    if retries > max_retries:
                        raise
                    logger.warning("Retry %s (%s/%s): %s", func.__name__, retries, max_retries, exc)
                    await asyncio.sleep(current_delay)
                    current_delay *= backoff

        return wrapper

    return decorator


def serialize_dataclass(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    raise TypeError("Object is not a dataclass instance")


def environment_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes"}
