"""Blueprint routes for the AI automation controller."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List

from flask import Blueprint, Flask, jsonify, request

from config import AppConfig, ValidationError
from services.ai_service import AIResponse, Context
from services.project_service import ConversationManager, ProjectManager
from services.automation_service import AutomationService, CodeOperation
from utils import extract_code_blocks

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api")

_ai_service = None
_project_manager: ProjectManager | None = None
_conversation_manager: ConversationManager | None = None
_automation_service: AutomationService | None = None
_app_config: AppConfig | None = None


def register_routes(app: Flask, services: Dict[str, Any]) -> None:
    global _ai_service, _project_manager, _conversation_manager, _automation_service, _app_config
    _ai_service = services["ai"]
    _project_manager = services["project"]
    _conversation_manager = services["conversation"]
    _automation_service = services["automation"]
    _app_config = services["config"]
    app.register_blueprint(api_bp)


def _run_async(coro):
    return asyncio.run(coro)


def _require_services() -> None:
    if not all([_ai_service, _project_manager, _conversation_manager, _automation_service, _app_config]):
        raise RuntimeError("Services not registered")


def _validate_json(required: List[str]) -> Dict[str, Any]:
    payload = request.get_json() or {}
    missing = [field for field in required if field not in payload]
    if missing:
        raise ValidationError(f"Missing fields: {', '.join(missing)}")
    return payload


@api_bp.route("/config", methods=["GET", "POST"])
def handle_config():
    _require_services()
    if request.method == "GET":
        return jsonify({"success": True, "config": asdict(_app_config)})
    payload = request.get_json() or {}
    for key, value in payload.items():
        if hasattr(_app_config, key):
            setattr(_app_config, key, value)
    return jsonify({"success": True})


@api_bp.route("/project/create", methods=["POST"])
def create_project():
    _require_services()
    payload = _validate_json(["folder", "name"])
    info = _project_manager.create_project(payload["folder"], payload["name"], payload.get("description", ""))
    projects = [project.to_dict() for project in _project_manager.list_projects()]
    return jsonify({"success": True, "project": info.to_dict(), "projects": projects})


@api_bp.route("/project/load", methods=["POST"])
def load_project():
    _require_services()
    payload = _validate_json(["folder"])
    info = _project_manager.load_project(payload["folder"])
    return jsonify({"success": True, "project": info.to_dict()})


@api_bp.route("/project/list", methods=["GET"])
def list_projects():
    _require_services()
    projects = [info.to_dict() for info in _project_manager.list_projects()]
    return jsonify({"success": True, "projects": projects})


@api_bp.route("/project/structure", methods=["GET"])
def project_structure():
    _require_services()
    folder = request.args.get("folder")
    if not folder:
        raise ValidationError("Missing folder parameter")
    structure = _project_manager.get_project_structure(folder)
    return jsonify({"success": True, "structure": structure})


@api_bp.route("/ai/generate", methods=["POST"])
def ai_generate():
    _require_services()
    payload = _validate_json(["project", "prompt"])
    project_info = _project_manager.load_project(payload["project"])
    conversation = _conversation_manager.get_conversation(project_info.path)
    _conversation_manager.add_message(conversation, "user", payload["prompt"])
    context = Context(project_dir=str(project_info.path), history=conversation.messages)
    response: AIResponse = _run_async(_ai_service.generate(payload["prompt"], context))
    if asyncio.isfuture(response):  # type: ignore[attr-defined]
        response = response.result()
    response.code_blocks = extract_code_blocks(response.text)
    _conversation_manager.add_message(conversation, "assistant", response.text)
    return jsonify({"success": True, "response": response.to_dict()})


@api_bp.route("/ai/host-mode", methods=["POST"])
def ai_host_mode():
    _require_services()
    payload = _validate_json(["project", "request", "command"])
    project_info = _project_manager.load_project(payload["project"])
    conversation = _conversation_manager.get_conversation(project_info.path)
    request_text = payload["request"]
    _conversation_manager.add_message(conversation, "user", request_text)
    iterations = payload.get("max_iterations", _app_config.automation_config.max_iterations)
    logs = [Path(path) for path in _app_config.automation_config.log_file_paths]
    results: List[Dict[str, Any]] = []
    for iteration in range(1, iterations + 1):
        context = Context(project_dir=str(project_info.path), history=conversation.messages)
        response: AIResponse = _run_async(_ai_service.generate(request_text, context))
        if asyncio.isfuture(response):  # type: ignore[attr-defined]
            response = response.result()
        response.code_blocks = extract_code_blocks(response.text)
        _conversation_manager.add_message(conversation, "assistant", response.text)
        iteration_result = _automation_service.run_iteration(
            iteration=iteration,
            request_text=request_text,
            ai_response=response.text,
            command=payload["command"],
            logs=logs,
        )
        analysis = _run_async(
            _ai_service.analyze(
                {
                    "terminal": iteration_result.terminal_output,
                    "logs": iteration_result.logs,
                    "ui": iteration_result.screenshot,
                }
            )
        )
        if asyncio.isfuture(analysis):  # type: ignore[attr-defined]
            analysis = analysis.result()
        results.append(
            {
                "iteration": iteration_result.to_dict(),
                "analysis": analysis.to_dict(),
            }
        )
        if analysis.is_complete:
            break
        request_text = analysis.next_request or request_text
        _conversation_manager.add_message(conversation, "system", analysis.summary)
        if request_text:
            _conversation_manager.add_message(conversation, "user", request_text)
    return jsonify({"success": True, "results": results})


@api_bp.route("/automation/execute", methods=["POST"])
def execute_automation():
    _require_services()
    payload = _validate_json(["operations"])
    operations = [CodeOperation(**op) for op in payload["operations"]]
    _automation_service.apply_code_changes(operations)
    return jsonify({"success": True})


@api_bp.route("/program/run", methods=["POST"])
def run_program():
    _require_services()
    payload = _validate_json(["command"])
    pid = _automation_service.monitor.run_program(payload["command"])
    return jsonify({"success": True, "pid": pid})


@api_bp.route("/screenshot/capture", methods=["POST"])
def capture_screenshot():
    _require_services()
    payload = request.get_json() or {}
    title = payload.get("title", "AI Automation UI")
    result = _automation_service.screenshot.capture_for_ui_analysis(title)
    return jsonify({"success": True, "screenshot": result})


@api_bp.errorhandler(Exception)
def handle_error(error: Exception):
    logger.exception("API error: %s", error)
    status = 400 if isinstance(error, ValidationError) else 500
    return jsonify({"success": False, "error": str(error), "type": type(error).__name__}), status


__all__ = ["register_routes", "api_bp"]

