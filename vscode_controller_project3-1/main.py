"""Application entrypoint following modular 2025 architecture."""
from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict

from flask import Flask, render_template

from api.routes import register_routes
from config import AppConfig, load_config
from services import (
    AutomationService,
    ConversationManager,
    GeminiService,
    LocalEchoService,
    ProjectManager,
)

app: Flask | None = None


def setup_logging(log_dir: Path) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter(
        "[%(asctime)s] %(name)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    file_handler = RotatingFileHandler(log_dir / "app.log", maxBytes=5_000_000, backupCount=5)
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    error_handler = RotatingFileHandler(log_dir / "error.log", maxBytes=5_000_000, backupCount=2)
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)
    root_logger.addHandler(error_handler)


def create_services(config: AppConfig) -> Dict[str, Any]:
    ai_provider = config.ai_config.provider.lower()
    if ai_provider == "gemini":
        try:
            ai_service = GeminiService(config.ai_config)
        except Exception:
            ai_service = LocalEchoService(config.ai_config)
    else:
        ai_service = LocalEchoService(config.ai_config)

    project_manager = ProjectManager(Path(config.paths.projects_dir))
    conversation_manager = ConversationManager(Path(config.paths.conversations_dir))
    automation_service = AutomationService(
        automation_config=config.automation_config,
        vscode_config=config.vscode_config,
        projects_dir=Path(config.paths.projects_dir),
    )
    return {
        "ai": ai_service,
        "project": project_manager,
        "conversation": conversation_manager,
        "automation": automation_service,
        "config": config,
    }


def create_app() -> Flask:
    global app
    config = load_config()
    setup_logging(Path(config.paths.logs_dir))
    app = Flask(__name__, template_folder="templates", static_folder="static")
    services = create_services(config)
    register_routes(app, services)

    @app.route("/")
    def index() -> str:
        return render_template("index.html")

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=True)

