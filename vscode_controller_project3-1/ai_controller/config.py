"""Application configuration and data models for the AI automation controller."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from logging.handlers import RotatingFileHandler

# ---------------------------------------------------------------------------
# Configuration directories
# ---------------------------------------------------------------------------

BASE_CONFIG_DIR = Path.home() / ".ai_automation_controller"
DEFAULT_LOG_DIR = BASE_CONFIG_DIR / "logs"
DEFAULT_SCREENSHOT_DIR = BASE_CONFIG_DIR / "screenshots"
DEFAULT_PROJECTS_DIR = BASE_CONFIG_DIR / "projects"
DEFAULT_CONVERSATIONS_DIR = BASE_CONFIG_DIR / "conversations"
DEFAULT_CONFIG_FILE = BASE_CONFIG_DIR / "config.json"
DEFAULT_PROJECT_LIST_FILE = BASE_CONFIG_DIR / "project_list.json"


class AppError(Exception):
    """Base error class for the application."""


class ConfigError(AppError):
    """Raised when configuration cannot be loaded or saved."""


class AIServiceError(AppError):
    """Raised for AI service related errors."""

    def __init__(self, message: str, *, code: str = "unknown") -> None:
        super().__init__(message)
        self.code = code


class AutomationError(AppError):
    """Raised for automation failures."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class TokenStatus(str, Enum):
    """Token counter status levels."""

    NORMAL = "normal"
    WARNING = "warning"
    NEED_SWITCH = "need_switch"


@dataclass
class TokenLimits:
    """Token usage thresholds."""

    max_context_tokens: int = 100_000
    warning_threshold: int = 80_000
    auto_switch_threshold: int = 95_000


@dataclass
class MemoryConfig:
    """Configuration for memory management."""

    enable_memory: bool = True
    short_term_size: int = 12
    long_term_summary_interval: int = 20
    memory_storage_path: Optional[str] = None


@dataclass
class AutomationConfig:
    """Configuration for automation / hosting loop behaviour."""

    enable_hosting_mode: bool = False
    max_iterations: int = 10
    iteration_timeout: int = 300
    enable_ui_analysis: bool = True
    log_file_paths: List[str] = field(default_factory=list)


@dataclass
class VSCodeOverlayConfig:
    """Configuration for GUI overlay automation."""

    regions: Dict[str, Dict[str, int]] = field(default_factory=dict)


@dataclass
class VSCodeConfig:
    """Configuration for VSCode automation."""

    use_code_command: bool = True
    enable_gui_overlay: bool = False
    overlay: VSCodeOverlayConfig = field(default_factory=VSCodeOverlayConfig)


@dataclass
class AIConfig:
    """Configuration for the AI model."""

    provider: str = "gemini"
    api_key: str = ""
    model_name: str = "gemini-2.0-flash-exp"
    system_instruction: str = "你是專業的 AI 自動化助手，會完整回答並提供 JSON 結構化資訊。"
    generation_params: Dict[str, Any] = field(
        default_factory=lambda: {
            "temperature": 0.6,
            "top_p": 0.95,
            "top_k": 32,
            "max_output_tokens": 8192,
        }
    )
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    token_limits: TokenLimits = field(default_factory=TokenLimits)


@dataclass
class PathConfig:
    """Filesystem paths used by the app."""

    base_dir: Path = BASE_CONFIG_DIR
    logs: Path = DEFAULT_LOG_DIR
    screenshots: Path = DEFAULT_SCREENSHOT_DIR
    projects: Path = DEFAULT_PROJECTS_DIR
    conversations: Path = DEFAULT_CONVERSATIONS_DIR
    config_file: Path = DEFAULT_CONFIG_FILE
    project_list_file: Path = DEFAULT_PROJECT_LIST_FILE

    def __post_init__(self) -> None:
        for field_name in (
            "base_dir",
            "logs",
            "screenshots",
            "projects",
            "conversations",
            "config_file",
            "project_list_file",
        ):
            value = getattr(self, field_name)
            if isinstance(value, str):
                setattr(self, field_name, Path(value))


@dataclass
class FeatureFlags:
    """Feature toggles used for gradual rollout."""

    enable_prompt_library: bool = True
    enable_automation_hosting: bool = True
    enable_memory_panel: bool = True


@dataclass
class AppConfig:
    """Full application configuration dataclass."""

    ai: AIConfig = field(default_factory=AIConfig)
    automation: AutomationConfig = field(default_factory=AutomationConfig)
    vscode: VSCodeConfig = field(default_factory=VSCodeConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    feature_flags: FeatureFlags = field(default_factory=FeatureFlags)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def ensure_directories(paths: PathConfig) -> None:
    """Ensure all directories defined in :class:`PathConfig` exist."""

    for directory in [
        paths.base_dir,
        paths.logs,
        paths.screenshots,
        paths.projects,
        paths.conversations,
    ]:
        directory.mkdir(parents=True, exist_ok=True)


def _merge_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge dictionaries (override wins)."""

    result = dict(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def _resolve_env_overrides(data: Dict[str, Any]) -> Dict[str, Any]:
    """Apply environment variable overrides using APP__NESTED__KEY pattern."""

    overrides: Dict[str, Any] = {}
    prefix = "AI_CONTROLLER__"
    for env_key, env_value in os.environ.items():
        if not env_key.startswith(prefix):
            continue
        path = env_key[len(prefix) :].lower().split("__")
        cursor = overrides
        for segment in path[:-1]:
            cursor = cursor.setdefault(segment, {})
        cursor[path[-1]] = env_value
    return _merge_dict(data, overrides)


def _dataclass_from_dict(data: Dict[str, Any]) -> AppConfig:
    """Construct :class:`AppConfig` from dictionary."""

    def convert(cls, value):
        if isinstance(value, dict):
            return cls(**value)
        return value

    ai = convert(AIConfig, data.get("ai", {}))
    automation = convert(AutomationConfig, data.get("automation", {}))
    vscode_data = data.get("vscode", {})
    vscode_overlay = convert(VSCodeOverlayConfig, vscode_data.get("overlay", {}))
    vscode = VSCodeConfig(
        use_code_command=vscode_data.get("use_code_command", True),
        enable_gui_overlay=vscode_data.get("enable_gui_overlay", False),
        overlay=vscode_overlay,
    )
    paths = convert(PathConfig, data.get("paths", {}))
    feature_flags = convert(FeatureFlags, data.get("feature_flags", {}))
    ai.memory = convert(MemoryConfig, data.get("ai", {}).get("memory", {}))
    ai.token_limits = convert(
        TokenLimits, data.get("ai", {}).get("token_limits", {})
    )
    return AppConfig(
        ai=ai,
        automation=automation,
        vscode=vscode,
        paths=paths,
        feature_flags=feature_flags,
    )


def load_config(config_path: Optional[Path] = None) -> AppConfig:
    """Load configuration from disk, applying environment overrides."""

    path = config_path or DEFAULT_CONFIG_FILE
    if not path.exists():
        config = get_default_config()
        save_config(config, path)
        return config

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"配置文件格式錯誤: {exc}") from exc

    merged = _resolve_env_overrides(raw)
    config = _dataclass_from_dict(merged)
    ensure_directories(config.paths)
    return config


def save_config(config: AppConfig, config_path: Optional[Path] = None) -> None:
    """Persist configuration to disk."""

    path = config_path or config.paths.config_file
    ensure_directories(config.paths)
    try:
        path.write_text(
            json.dumps(asdict(config), ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    except OSError as exc:
        raise ConfigError(f"無法寫入配置: {exc}") from exc


def get_default_config() -> AppConfig:
    """Return application defaults."""

    config = AppConfig()
    ensure_directories(config.paths)
    return config


# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------


def setup_logging(paths: PathConfig) -> None:
    """Configure application logging."""

    ensure_directories(paths)
    log_format = "[%(asctime)s] %(levelname)s | %(name)s | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(level=logging.INFO, format=log_format, datefmt=date_format)

    rotating = RotatingFileHandler(paths.logs / "app.log", maxBytes=10 * 1024 * 1024, backupCount=5)
    rotating.setLevel(logging.DEBUG)
    rotating.setFormatter(logging.Formatter(log_format, datefmt=date_format))

    errors = RotatingFileHandler(paths.logs / "error.log", maxBytes=10 * 1024 * 1024, backupCount=3)
    errors.setLevel(logging.ERROR)
    errors.setFormatter(logging.Formatter(log_format, datefmt=date_format))

    root_logger = logging.getLogger()
    root_logger.addHandler(rotating)
    root_logger.addHandler(errors)


__all__ = [
    "AppError",
    "AIServiceError",
    "AutomationError",
    "ConfigError",
    "TokenStatus",
    "TokenLimits",
    "MemoryConfig",
    "AutomationConfig",
    "VSCodeOverlayConfig",
    "VSCodeConfig",
    "AIConfig",
    "PathConfig",
    "FeatureFlags",
    "AppConfig",
    "ensure_directories",
    "load_config",
    "save_config",
    "get_default_config",
    "setup_logging",
]
