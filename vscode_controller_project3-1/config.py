"""Application configuration and datamodel definitions."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.common import ensure_dir


CONFIG_ROOT = Path(os.environ.get("AI_CONTROLLER_CONFIG", Path.home() / ".ai_controller_v6"))
DATA_DIR = CONFIG_ROOT / "data"
LOG_DIR = CONFIG_ROOT / "logs"
SCREENSHOT_DIR = CONFIG_ROOT / "screenshots"
PROJECTS_DIR = CONFIG_ROOT / "projects"
CONVERSATIONS_DIR = CONFIG_ROOT / "conversations"
PROJECT_LIST_FILE = CONFIG_ROOT / "project_list.json"
CONFIG_FILE = CONFIG_ROOT / "config.json"


class ErrorCode(str, Enum):
    """Enumerates high level error categories."""

    VALIDATION = "validation_error"
    AI_SERVICE = "ai_service_error"
    AUTOMATION = "automation_error"
    FILESYSTEM = "filesystem_error"
    UNKNOWN = "unknown_error"


@dataclass
class TokenLimits:
    """Token calculation boundaries used by the AI service."""

    max_context_tokens: int = 100_000
    warning_threshold: int = 80_000
    auto_switch_threshold: int = 95_000


@dataclass
class MemoryConfig:
    """Memory subsystem configuration."""

    enable_memory: bool = True
    short_term_size: int = 12
    long_term_summary_interval: int = 24
    memory_storage_path: str = str(CONVERSATIONS_DIR)


@dataclass
class VSCodeConfig:
    """Configuration for interacting with VS Code."""

    use_code_command: bool = True
    enable_gui_overlay: bool = False
    overlay_config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AutomationConfig:
    """Automation configuration toggles."""

    enable_autopilot: bool = False
    max_iterations: int = 10
    timeout_seconds: int = 300
    enable_ui_analysis: bool = True
    log_file_paths: List[str] = field(default_factory=list)


@dataclass
class AIConfig:
    """AI provider configuration."""

    provider: str = "gemini"
    api_key: str = ""
    model_name: str = "gemini-2.0-flash-exp"
    generation_params: Dict[str, Any] = field(
        default_factory=lambda: {
            "temperature": 0.6,
            "top_p": 0.9,
            "top_k": 40,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        }
    )
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    token_limits: TokenLimits = field(default_factory=TokenLimits)


@dataclass
class PathConfig:
    """Directory layout for runtime assets."""

    config_root: Path = CONFIG_ROOT
    data_dir: Path = DATA_DIR
    log_dir: Path = LOG_DIR
    screenshot_dir: Path = SCREENSHOT_DIR
    projects_dir: Path = PROJECTS_DIR
    conversations_dir: Path = CONVERSATIONS_DIR


@dataclass
class FeatureFlags:
    """Feature toggles for experimental functionality."""

    enable_webview: bool = True
    enable_terminal_capture: bool = True
    enable_ai_guardrails: bool = True


@dataclass
class AppConfig:
    """Top level configuration container used throughout the app."""

    ai: AIConfig = field(default_factory=AIConfig)
    vscode: VSCodeConfig = field(default_factory=VSCodeConfig)
    automation: AutomationConfig = field(default_factory=AutomationConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    feature_flags: FeatureFlags = field(default_factory=FeatureFlags)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["paths"] = {
            "config_root": str(self.paths.config_root),
            "data_dir": str(self.paths.data_dir),
            "log_dir": str(self.paths.log_dir),
            "screenshot_dir": str(self.paths.screenshot_dir),
            "projects_dir": str(self.paths.projects_dir),
            "conversations_dir": str(self.paths.conversations_dir),
        }
        return data


class ConfigError(Exception):
    """Raised when configuration loading fails."""


def ensure_runtime_directories(paths: PathConfig) -> None:
    """Create required runtime directories if they do not exist."""

    for directory in (
        paths.config_root,
        paths.data_dir,
        paths.log_dir,
        paths.screenshot_dir,
        paths.projects_dir,
        paths.conversations_dir,
    ):
        ensure_dir(directory)


def load_config() -> AppConfig:
    """Load configuration from disk with environment overrides."""

    ensure_runtime_directories(PathConfig())

    if CONFIG_FILE.exists():
        try:
            with CONFIG_FILE.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except json.JSONDecodeError as exc:
            raise ConfigError(f"配置文件格式錯誤: {exc}") from exc
    else:
        payload = {}

    config = AppConfig()

    if payload:
        merge_into_dataclass(config, payload)

    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        config.ai.api_key = api_key

    return config


def merge_into_dataclass(instance: Any, data: Dict[str, Any]) -> None:
    """Recursively merge dict data into dataclass instance."""

    for key, value in data.items():
        if not hasattr(instance, key):
            continue
        attr = getattr(instance, key)
        if hasattr(attr, "__dataclass_fields__") and isinstance(value, dict):
            merge_into_dataclass(attr, value)
        else:
            setattr(instance, key, value)


def save_config(config: AppConfig) -> None:
    """Persist the configuration to disk."""

    ensure_runtime_directories(config.paths)
    with CONFIG_FILE.open("w", encoding="utf-8") as handle:
        json.dump(config.to_dict(), handle, indent=2, ensure_ascii=False)
