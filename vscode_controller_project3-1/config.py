"""Application configuration module following 2025 best practices."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import os

CONFIG_PATH = Path("data/app_config.json")


class AppError(Exception):
    """Base application error."""


class ConfigError(AppError):
    """Raised when configuration loading fails."""


class ValidationError(AppError):
    """Raised when incoming request data is invalid."""


class AIServiceError(AppError):
    """Errors related to AI providers."""

    def __init__(self, message: str, code: str = "ai_error") -> None:
        super().__init__(message)
        self.code = code


class AutomationError(AppError):
    """Errors produced by automation services."""

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class VSCodeError(AutomationError):
    """Raised when VSCode operations fail."""


class ProgramExecutionError(AutomationError):
    """Raised when program execution fails."""

    def __init__(self, message: str, exit_code: Optional[int] = None, stderr: str = "") -> None:
        super().__init__(message, retryable=False)
        self.exit_code = exit_code
        self.stderr = stderr


@dataclass
class TokenLimits:
    """Token threshold configuration."""

    max_context_tokens: int = 100_000
    warning_threshold: int = 80_000
    auto_switch_threshold: int = 95_000


@dataclass
class MemoryConfig:
    """Configuration for the memory subsystem."""

    enable_memory: bool = True
    short_term_size: int = 10
    long_term_summary_interval: int = 20
    memory_storage_path: str = "data/memory"


@dataclass
class AIConfig:
    """AI provider configuration."""

    provider: str = "gemini"
    api_key: str = ""
    model_name: str = "gemini-1.5-flash"
    generation_params: Dict[str, Any] = field(
        default_factory=lambda: {"temperature": 0.4, "top_p": 0.9, "top_k": 32}
    )
    memory_config: MemoryConfig = field(default_factory=MemoryConfig)
    token_limits: TokenLimits = field(default_factory=TokenLimits)


@dataclass
class AutomationConfig:
    """Automation controller configuration."""

    enable_host_mode: bool = False
    max_iterations: int = 10
    timeout_seconds: int = 300
    enable_ui_analysis: bool = True
    log_file_paths: List[str] = field(default_factory=list)


@dataclass
class VSCodeConfig:
    """Configuration for VSCode automation."""

    use_code_command: bool = True
    enable_gui_overlay: bool = False
    overlay_config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PathConfig:
    """Various filesystem paths used by the app."""

    base_dir: str = "."
    projects_dir: str = "data/projects"
    logs_dir: str = "logs"
    conversations_dir: str = "data/conversations"
    static_dir: str = "static"


@dataclass
class FeatureFlags:
    """Feature toggles."""

    enable_host_mode: bool = True
    enable_memory_ui: bool = True
    enable_prompt_presets: bool = True


@dataclass
class AppConfig:
    """Root configuration dataclass."""

    ai_config: AIConfig = field(default_factory=AIConfig)
    automation_config: AutomationConfig = field(default_factory=AutomationConfig)
    vscode_config: VSCodeConfig = field(default_factory=VSCodeConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    feature_flags: FeatureFlags = field(default_factory=FeatureFlags)

    def ensure_directories(self) -> None:
        """Create all necessary directories."""
        for path in [
            Path(self.paths.projects_dir),
            Path(self.paths.logs_dir),
            Path(self.paths.conversations_dir),
            Path(self.ai_config.memory_config.memory_storage_path),
        ]:
            path.mkdir(parents=True, exist_ok=True)


def _serialize_dataclass(data: Any) -> Any:
    if is_dataclass(data):
        return {key: _serialize_dataclass(value) for key, value in asdict(data).items()}
    if isinstance(data, list):
        return [_serialize_dataclass(item) for item in data]
    return data


def get_default_config() -> AppConfig:
    """Return an AppConfig instance with default values."""
    config = AppConfig()
    config.ensure_directories()
    return config


def load_config() -> AppConfig:
    """Load configuration from disk with environment overrides."""
    config = get_default_config()
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            _apply_payload(config, payload)
        except json.JSONDecodeError as exc:
            raise ConfigError(f"Invalid configuration JSON: {exc}") from exc
    _apply_env_overrides(config)
    config.ensure_directories()
    return config


def save_config(config: AppConfig) -> None:
    """Persist configuration to disk."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as fh:
        json.dump(_serialize_dataclass(config), fh, indent=2, ensure_ascii=False)


def _apply_payload(instance: Any, payload: Dict[str, Any]) -> None:
    for key, value in payload.items():
        if not hasattr(instance, key):
            continue
        current = getattr(instance, key)
        if is_dataclass(current) and isinstance(value, dict):
            _apply_payload(current, value)
        else:
            setattr(instance, key, value)


def _apply_env_overrides(config: AppConfig) -> None:
    """Override configuration values from environment variables."""
    api_key = os.getenv("AI_API_KEY")
    if api_key:
        config.ai_config.api_key = api_key
    model_name = os.getenv("AI_MODEL_NAME")
    if model_name:
        config.ai_config.model_name = model_name

