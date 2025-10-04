"""Application entrypoint for the AI automation controller."""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

from flask import Flask, render_template

from api.routes import api_bp, register_routes
from config import AppConfig, load_config
from services.ai_service import GeminiService
from services.automation_service import AutomationService, ProgramMonitor, ScreenshotAnalyzer, VSCodeController
from services.project_service import ConversationManager, ProjectManager, ProjectService

logger = logging.getLogger(__name__)


def setup_logging(log_dir: Path) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("[%(asctime)s] %(levelname)s | %(name)s | %(message)s")
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    stream_handler.setLevel(logging.INFO)
    file_handler = logging.FileHandler(log_dir / "application.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)
    logging.basicConfig(level=logging.DEBUG, handlers=[stream_handler, file_handler])


def create_app(config: AppConfig) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")

    ai_service = GeminiService(config.ai)
    vscode = VSCodeController(config.vscode)
    monitor = ProgramMonitor()
    screenshots = ScreenshotAnalyzer(config.paths.screenshot_dir)
    automation = AutomationService(config.automation, vscode, monitor, screenshots)

    project_manager = ProjectManager(config.paths.projects_dir)
    conversation_manager = ConversationManager(config.paths.conversations_dir)
    project_service = ProjectService(project_manager, conversation_manager)

    blueprint = register_routes(
        ai_service=ai_service,
        automation_service=automation,
        project_service=project_service,
        project_manager=project_manager,
        conversation_manager=conversation_manager,
        config=config,
    )
    app.register_blueprint(blueprint)

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    return app


def run_app(app: Flask, host: str = "127.0.0.1", port: int = 5001) -> None:
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Automation Controller")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=5001, type=int)
    args = parser.parse_args()

    config = load_config()
    setup_logging(config.paths.log_dir)
    flask_app = create_app(config)
    run_app(flask_app, host=args.host, port=args.port)
