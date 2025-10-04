"""Application configuration and datamodel definitions."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class Environment(str, Enum):
    """Supported runtime environments."""

    DEVELOPMENT = "development"
    PRODUCTION = "production"


@dataclass(slots=True)
class MemoryConfig:
    """Configuration options for the memory subsystem."""

    enable_memory: bool = True
    short_term_size: int = 12
    long_term_summary_interval: int = 24
    memory_storage_path: str = ""


@dataclass(slots=True)
class TokenLimits:
    """Token accounting configuration."""

    max_context_tokens: int = 100_000
    warning_threshold: int = 80_000
    auto_switch_threshold: int = 95_000


@dataclass(slots=True)
class AIConfig:
    """Configuration for AI providers."""

    provider: str = "gemini"
    api_key: str = ""
    model_name: str = "gemini-2.0-flash-exp"
    system_instruction: str = ""
    generation_params: Dict[str, Any] = field(
        default_factory=lambda: {
            "temperature": 0.7,
            "top_p": 0.95,
            "max_output_tokens": 8192,
        }
    )
    safety_settings: Dict[str, str] = field(default_factory=dict)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    token_limits: TokenLimits = field(default_factory=TokenLimits)


@dataclass(slots=True)
class AutomationConfig:
    """Automation and monitoring configuration."""

    enable_hosted_mode: bool = False
    max_iterations: int = 10
    timeout_seconds: int = 300
    enable_ui_analysis: bool = True
    log_file_paths: List[str] = field(default_factory=list)


@dataclass(slots=True)
class VSCodeOverlayConfig:
    """Configuration for GUI overlay regions when automating VS Code."""

    regions: Dict[str, Dict[str, int]] = field(default_factory=dict)


@dataclass(slots=True)
class VSCodeConfig:
    """VS Code controller configuration."""

    use_code_command: bool = True
    enable_gui_overlay: bool = False
    overlay: VSCodeOverlayConfig = field(default_factory=VSCodeOverlayConfig)


@dataclass(slots=True)
class PathConfig:
    """All filesystem paths used by the application."""

    root: Path
    config_dir: Path
    screenshot_dir: Path
    log_dir: Path
    projects_dir: Path
    conversations_dir: Path


@dataclass(slots=True)
class FeatureFlags:
    """Feature flag collection."""

    enable_hosted_mode: bool = True
    enable_log_monitoring: bool = True
    enable_memory: bool = True
    enable_ui_prompt: bool = True


@dataclass(slots=True)
class AppConfig:
    """Top level application configuration."""

    environment: Environment = Environment.DEVELOPMENT
    ai: AIConfig = field(default_factory=AIConfig)
    automation: AutomationConfig = field(default_factory=AutomationConfig)
    vscode: VSCodeConfig = field(default_factory=VSCodeConfig)
    paths: Optional[PathConfig] = None
    feature_flags: FeatureFlags = field(default_factory=FeatureFlags)


DEFAULT_CONFIG_FILENAME = "config.json"


def _default_paths() -> PathConfig:
    root = Path(os.environ.get("AI_CONTROLLER_HOME", Path.home() / ".ai_controller_v6"))
    return PathConfig(
        root=root,
        config_dir=root,
        screenshot_dir=root / "screenshots",
        log_dir=root / "logs",
        projects_dir=root / "projects",
        conversations_dir=root / "conversations",
    )


def ensure_directories(paths: PathConfig) -> None:
    for directory in [
        paths.config_dir,
        paths.screenshot_dir,
        paths.log_dir,
        paths.projects_dir,
        paths.conversations_dir,
    ]:
        directory.mkdir(parents=True, exist_ok=True)


def load_config(config_path: Optional[Path] = None) -> AppConfig:
    """Load configuration from disk and merge with environment overrides."""

    paths = _default_paths()
    ensure_directories(paths)

    path = config_path or paths.config_dir / DEFAULT_CONFIG_FILENAME
    if path.exists():
        with path.open("r", encoding="utf-8") as fp:
            raw = json.load(fp)
    else:
        raw = {}

    config = AppConfig()
    config.paths = paths

    if raw:
        _merge_dict_into_dataclass(raw, config)

    # environment overrides
    api_key = os.environ.get("AI_CONTROLLER_API_KEY")
    if api_key:
        config.ai.api_key = api_key

    return config


def save_config(config: AppConfig, config_path: Optional[Path] = None) -> None:
    """Persist configuration to disk."""

    if config.paths is None:
        raise ValueError("Config paths must be initialised before saving")

    ensure_directories(config.paths)
    path = config_path or config.paths.config_dir / DEFAULT_CONFIG_FILENAME

    serialisable = _serialize(asdict(config))
    with path.open("w", encoding="utf-8") as fp:
        json.dump(serialisable, fp, indent=2, ensure_ascii=False)


def _merge_dict_into_dataclass(data: Dict[str, Any], obj: Any) -> None:
    for key, value in data.items():
        if not hasattr(obj, key):
            continue
        attr = getattr(obj, key)
        if dataclass_is_instance(attr) and isinstance(value, dict):
            _merge_dict_into_dataclass(value, attr)
        else:
            setattr(obj, key, value)


def dataclass_is_instance(obj: Any) -> bool:
    return hasattr(obj, "__dataclass_fields__")


def _serialize(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    return value


def update_config_from_dict(config: AppConfig, data: Dict[str, Any]) -> None:
    _merge_dict_into_dataclass(data, config)
