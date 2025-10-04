"""Application factory for the AI automation controller."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from flask import Flask

from .api.routes import ServiceContainer, register_routes
from .config import AppConfig, load_config, setup_logging
from .services import (
    AIServiceFactory,
    AutomationService,
    ProjectService,
)
from .services.automation_service import ProgramMonitor, ScreenshotAnalyzer, VSCodeController

logger = logging.getLogger(__name__)


def create_app(config_path: Optional[Path] = None) -> Flask:
    """Application factory used by Flask and standalone runner."""

    config: AppConfig = load_config(config_path)
    setup_logging(config.paths)

    project_root = Path(__file__).resolve().parent.parent

    flask_app = Flask(
        __name__,
        static_folder=str(project_root / "static"),
        template_folder=str(project_root / "templates"),
    )

    ai_service = AIServiceFactory.create(config.ai, config.paths.conversations)
    automation_service = AutomationService(
        vscode=VSCodeController(config.vscode),
        monitor=ProgramMonitor(),
        screenshot_analyzer=ScreenshotAnalyzer(config.paths.screenshots),
        automation_config=config.automation,
    )
    project_service = ProjectService(config)

    services = ServiceContainer(
        config=config,
        ai_service=ai_service,
        automation=automation_service,
        project_service=project_service,
    )

    register_routes(flask_app, services)
    logger.info("Application initialised")
    return flask_app


__all__ = ["create_app"]
