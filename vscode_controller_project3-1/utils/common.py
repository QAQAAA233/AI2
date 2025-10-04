"""Common utility helpers shared across the project."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import time
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

try:
    import tiktoken
except ImportError:  # pragma: no cover - optional dependency
    tiktoken = None

logger = logging.getLogger(__name__)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def safe_read_file(path: Path, encoding: str = "utf-8") -> Optional[str]:
    try:
        return path.read_text(encoding=encoding)
    except FileNotFoundError:
        return None


def atomic_write(path: Path, content: str, encoding: str = "utf-8") -> None:
    ensure_dir(path.parent)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(content, encoding=encoding)
    temp_path.replace(path)


def safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        fixed = re.sub(r",\s*([}\]])", r"\\1", text)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            logger.debug("Failed to coerce JSON text", exc_info=True)
            return None


def truncate_text(text: str, max_length: int = 4000) -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def extract_code_blocks(text: str) -> List[str]:
    pattern = re.compile(r"```(?:[a-zA-Z0-9_+-]+)?\n(.*?)```", re.DOTALL)
    return [match.strip() for match in pattern.findall(text)]


def count_tokens(text: str, model: str = "gpt-4") -> int:
    if tiktoken is None:
        return max(1, len(text) // 4)
    try:
        enc = tiktoken.encoding_for_model(model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def format_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def retry_on_error(
    *,
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Iterable[type[BaseException]] = (Exception,),
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if asyncio.iscoroutinefunction(func):

            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                retries = 0
                wait = delay
                while True:
                    try:
                        return await func(*args, **kwargs)
                    except exceptions as error:  # type: ignore[arg-type]
                        retries += 1
                        if retries > max_retries:
                            raise
                        logger.warning("重試 %s (%s/%s): %s", func.__name__, retries, max_retries, error)
                        await asyncio.sleep(wait)
                        wait *= backoff

            return async_wrapper

        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            retries = 0
            wait = delay
            while True:
                try:
                    return func(*args, **kwargs)
                except exceptions as error:  # type: ignore[arg-type]
                    retries += 1
                    if retries > max_retries:
                        raise
                    logger.warning("重試 %s (%s/%s): %s", func.__name__, retries, max_retries, error)
                    time.sleep(wait)
                    wait *= backoff

        return sync_wrapper

    return decorator


def dataclass_to_dict(data: Any) -> Any:
    if is_dataclass(data):
        return {key: dataclass_to_dict(value) for key, value in asdict(data).items()}
    if isinstance(data, dict):
        return {key: dataclass_to_dict(value) for key, value in data.items()}
    if isinstance(data, list):
        return [dataclass_to_dict(item) for item in data]
    return data


def copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


async def gather_dict(tasks: Dict[str, asyncio.Future]) -> Dict[str, Any]:
    results: Dict[str, Any] = {}
    for key, task in tasks.items():
        results[key] = await task
    return results
