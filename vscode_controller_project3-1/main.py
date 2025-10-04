"""Application entry point for the AI automation controller."""
from __future__ import annotations

import logging
import threading

from flask import Flask, render_template
import webview

from app.api.routes import register_routes
from app.config import AppConfig, load_config
from app.services.ai_service import create_ai_service
from app.services.automation_service import AutomationService
from app.services.project_service import ConversationManager, ProjectManager, ProjectService

logger = logging.getLogger(__name__)


def create_app(config: AppConfig) -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index():  # pragma: no cover - rendering only
        return render_template("index.html")

    services = build_services(config)
    register_routes(app, services)

    return app


def build_services(config: AppConfig):
    ai_service = create_ai_service(config.ai)
    automation = AutomationService(config.automation, config.vscode, config.paths.screenshot_dir)  # type: ignore[arg-type]
    project_manager = ProjectManager(config.paths.projects_dir, config.paths.conversations_dir)  # type: ignore[arg-type]
    conversation_manager = ConversationManager(config.paths.conversations_dir)  # type: ignore[arg-type]
    project_service = ProjectService(project_manager, conversation_manager)

    return {
        "ai": ai_service,
        "automation": automation,
        "project": project_service,
        "config": config,
    }


def run_flask(app: Flask, host: str = "127.0.0.1", port: int = 5001) -> None:
    app.run(host=host, port=port, threaded=True)


def start_webview(url: str) -> None:  # pragma: no cover - UI wrapper
    window = webview.create_window("AI 控制中心", url)
    webview.start()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(name)s | %(levelname)s | %(message)s",
    )

    config = load_config()
    app = create_app(config)

    server_thread = threading.Thread(target=run_flask, args=(app,), daemon=True)
    server_thread.start()

    start_webview("http://127.0.0.1:5001/")


if __name__ == "__main__":
    main()
