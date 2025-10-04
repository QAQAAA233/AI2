"""Flask API routes for the AI automation controller."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict

from flask import Blueprint, jsonify, request

from app.config import AppConfig, save_config, update_config_from_dict
from app.services.ai_service import AIResponse, AIServiceBase, GenerationContext, Message
from app.services.automation_service import AutomationService, CodeOperation
from app.services.project_service import ConversationMessage, ProjectService
from app.utils.helpers import format_timestamp

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api")

ai_service: AIServiceBase
automation_service: AutomationService
project_service: ProjectService
app_config: AppConfig


def register_routes(app, services: Dict[str, Any]) -> None:
    global ai_service, automation_service, project_service, app_config
    ai_service = services["ai"]
    automation_service = services["automation"]
    project_service = services["project"]
    app_config = services["config"]
    app.register_blueprint(api_bp)


@api_bp.route("/config", methods=["GET", "POST"])
def handle_config():
    if request.method == "GET":
        return jsonify(asdict(app_config))
    payload = request.get_json(force=True)
    update_config_from_dict(app_config, payload)
    save_config(app_config)
    return jsonify({"success": True})


@api_bp.route("/project/<string:project_name>/history", methods=["GET"])
def get_history(project_name: str):
    messages = project_service.get_history(project_name)
    return jsonify([message.__dict__ for message in messages])


@api_bp.route("/ai/generate", methods=["POST"])
async def generate():
    data = request.get_json(force=True)
    project_name = data.get("project", "default")
    conversation_id = data.get("conversation_id")
    prompt = data["prompt"]

    conversation = project_service.ensure_conversation(project_name, conversation_id)
    conversation_id = conversation.id

    user_message = ConversationMessage(role="user", content=prompt, timestamp=datetime.utcnow().isoformat())
    project_service.add_message(project_name, conversation_id, user_message)

    history = project_service.get_history(project_name, conversation_id)
    history_messages = []
    for msg in history:
        try:
            timestamp = datetime.fromisoformat(msg.timestamp)
        except ValueError:
            timestamp = datetime.utcnow()
        history_messages.append(Message(role=msg.role, content=msg.content, timestamp=timestamp))

    context = GenerationContext(project_dir=project_name, history=history_messages)

    response: AIResponse = await ai_service.generate(prompt, context)
    assistant_message = ConversationMessage(
        role="assistant",
        content=response.text,
        timestamp=datetime.utcnow().isoformat(),
    )
    project_service.add_message(project_name, conversation_id, assistant_message)
    return jsonify({
        "text": response.text,
        "metadata": response.metadata,
        "token_count": response.token_count,
        "conversation_id": conversation_id,
    })


@api_bp.route("/automation/vscode", methods=["POST"])
def vscode_operation():
    data = request.get_json(force=True)
    operation = CodeOperation(**data)
    success = automation_service.execute_operation(operation)
    return jsonify({"success": success})


@api_bp.route("/automation/run", methods=["POST"])
def run_program():
    data = request.get_json(force=True)
    command = data.get("command", [])
    project = data.get("project")
    pid = automation_service.run_program(command, cwd=project and app_config.paths.projects_dir / project)
    return jsonify({"pid": pid})


@api_bp.route("/automation/output/<int:pid>", methods=["GET"])
def read_output(pid: int):
    output = automation_service.read_output(pid)
    return jsonify({"output": output})


@api_bp.route("/automation/log", methods=["POST"])
def tail_log():
    data = request.get_json(force=True)
    if not app_config.paths:
        return jsonify({"error": "paths_not_configured"}), 400
    path = app_config.paths.root / data["path"]
    content = automation_service.tail_log(path)
    return jsonify({"content": content})


@api_bp.route("/automation/screenshot", methods=["GET"])
def capture_screenshot():
    analysis = automation_service.capture_and_analyze()
    return jsonify(analysis)


@api_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "timestamp": format_timestamp(datetime.utcnow())})
