"""Flask API routes for the AI automation controller."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Dict

from dataclasses import asdict
from flask import Blueprint, Flask, current_app, jsonify, render_template, request

from ..config import AIServiceError, AppConfig, AutomationError, ConfigError
from ..services import (
    AIServiceBase,
    AutomationService,
    CodeOperation,
    ConversationContext,
    Message,
    ProjectService,
)

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)


class ServiceContainer:
    """Stores shared services for dependency injection."""

    def __init__(
        self,
        *,
        config: AppConfig,
        ai_service: AIServiceBase,
        automation: AutomationService,
        project_service: ProjectService,
    ) -> None:
        self.config = config
        self.ai_service = ai_service
        self.automation = automation
        self.projects = project_service


def register_routes(app: Flask, services: ServiceContainer) -> None:
    """Register blueprint and attach routes."""

    app.config["services"] = services
    app.register_blueprint(api_bp)


@api_bp.route("/")
def index():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    return render_template(
        "index.html",
        feature_flags=services.config.feature_flags,
    )


@api_bp.route("/api/config", methods=["GET", "POST"])
def handle_config():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    if request.method == "GET":
        return jsonify({"success": True, "data": asdict(services.config)})
    try:
        data = request.get_json(force=True)
        for section, values in data.items():
            if hasattr(services.config, section):
                section_obj = getattr(services.config, section)
                for key, value in values.items():
                    if hasattr(section_obj, key):
                        setattr(section_obj, key, value)
        return jsonify({"success": True})
    except Exception as exc:
        logger.exception("Failed to update config")
        raise ConfigError(str(exc)) from exc


@api_bp.route("/api/projects", methods=["GET", "POST"])
def handle_projects():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    if request.method == "GET":
        return jsonify({"success": True, "projects": services.projects.list_projects()})
    payload = request.get_json(force=True)
    info = services.projects.create_project(payload["name"], payload.get("base_dir"))
    return jsonify({"success": True, "project": info.to_dict()})


@api_bp.route("/api/ai/generate", methods=["POST"])
def ai_generate():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    payload = request.get_json(force=True)
    conversation = services.projects.get_or_create_conversation(payload["project_dir"], payload.get("conversation_id"))
    services.projects.append_message(conversation, Message(role="user", content=payload["prompt"]))
    context = ConversationContext(
        project_dir=payload["project_dir"],
        history=conversation.messages,
        files=payload.get("files", []),
        metadata=payload.get("metadata", {}),
    )

    async def _run() -> Dict[str, Any]:
        response = await services.ai_service.generate(payload["prompt"], context)
        services.projects.append_message(conversation, Message(role="assistant", content=response.text))
        return {"success": True, "response": response.to_dict(), "conversation_id": conversation.id}

    return asyncio.run(_run())


@api_bp.route("/api/automation/operations", methods=["POST"])
def apply_operations():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    payload = request.get_json(force=True)
    project_dir = payload["project_dir"]
    operations = [CodeOperation(**item) for item in payload.get("operations", [])]
    results = services.automation.apply_operations(operations, Path(project_dir))
    return jsonify({"success": True, "results": [res.__dict__ for res in results]})


@api_bp.route("/api/automation/run", methods=["POST"])
def run_command():
    services: ServiceContainer = current_app.config["services"]  # type: ignore[attr-defined]
    payload = request.get_json(force=True)
    result = services.automation.run_command(payload["command"], Path(payload["project_dir"]))
    return jsonify({"success": True, "result": result.to_dict()})


@api_bp.errorhandler(AIServiceError)
def handle_ai_error(error: AIServiceError):
    return jsonify({"success": False, "error": str(error), "code": error.code}), 500


@api_bp.errorhandler(AutomationError)
def handle_automation_error(error: AutomationError):
    return jsonify({"success": False, "error": str(error), "retryable": error.retryable}), 500


@api_bp.errorhandler(ConfigError)
def handle_config_error(error: ConfigError):
    return jsonify({"success": False, "error": str(error)}), 400


__all__ = ["register_routes", "ServiceContainer", "api_bp"]
