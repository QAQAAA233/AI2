"""Flask API routes for the AI automation controller."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Dict

from flask import Blueprint, Response, jsonify, request

from config import AppConfig, merge_into_dataclass, save_config
from services.ai_service import Context, GeminiService, Message
from services.automation_service import AutomationService
from services.project_service import ConversationManager, ProjectManager, ProjectService
from utils.common import dataclass_to_dict

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api")

_ai_service: GeminiService
_automation: AutomationService
_projects: ProjectService
_conversations: ConversationManager
_project_manager: ProjectManager
_app_config: AppConfig


def register_routes(
    *,
    ai_service: GeminiService,
    automation_service: AutomationService,
    project_service: ProjectService,
    project_manager: ProjectManager,
    conversation_manager: ConversationManager,
    config: AppConfig,
) -> Blueprint:
    global _ai_service, _automation, _projects, _app_config, _conversations, _project_manager
    _ai_service = ai_service
    _automation = automation_service
    _projects = project_service
    _project_manager = project_manager
    _conversations = conversation_manager
    _app_config = config
    return api_bp


@api_bp.get("/config")
def get_config() -> Response:
    return jsonify(_app_config.to_dict())


@api_bp.post("/config")
def update_config() -> Response:
    data = request.get_json(force=True)
    merge_into_dataclass(_app_config, data)
    save_config(_app_config)
    return jsonify({"success": True})


@api_bp.post("/project/create")
def create_project() -> Response:
    data = request.get_json(force=True)
    name = data.get("name")
    description = data.get("description", "")
    info = _project_manager.create_project(name, description)
    return jsonify(info.to_dict())


@api_bp.get("/project/list")
def list_projects() -> Response:
    return jsonify([info.to_dict() for info in _project_manager.list_projects()])


@api_bp.post("/conversation/start")
def start_conversation() -> Response:
    data = request.get_json(force=True)
    project = data["project"]
    project_info = _projects.ensure_project(project)
    conversation = _conversations.create(Path(project_info.root))
    _projects.append_conversation(project_info, conversation)
    return jsonify({"conversation_id": conversation.conversation_id})


@api_bp.post("/ai/generate")
async def ai_generate() -> Response:
    payload = request.get_json(force=True)
    project = payload.get("project", "default")
    conversation_id = payload.get("conversation_id")
    prompt = payload["prompt"]

    project_info = _projects.ensure_project(project)
    conversation = (
        _conversations.get(conversation_id)
        if conversation_id
        else _conversations.create(project_info.root)
    )
    _conversations.add_message(conversation.conversation_id, Message(role="user", content=prompt))
    _ai_service.record_user_message(prompt)

    context = Context(project_dir=str(project_info.root), history=conversation.messages)
    response = await _ai_service.generate(prompt, context)
    _conversations.add_message(conversation.conversation_id, Message(role="assistant", content=response.text))

    result = {
        "conversation_id": conversation.conversation_id,
        "response": response.text,
        "tokens_used": response.tokens_used,
        "memory": _ai_service.get_memory_snapshot(),
    }
    return jsonify(result)


@api_bp.post("/ai/autopilot")
async def ai_autopilot() -> Response:
    payload = request.get_json(force=True)
    project_name = payload.get("project", "default")
    request_text = payload["prompt"]
    iterations = int(payload.get("max_iterations", _app_config.automation.max_iterations))

    project_info = _projects.ensure_project(project_name)
    conversation = _conversations.create(project_info.root)

    history = conversation.messages
    current_prompt = request_text
    aggregated: Dict[str, Any] = {"iterations": []}

    for iteration in range(iterations):
        logger.info("Autopilot iteration %s", iteration + 1)
        _conversations.add_message(conversation.conversation_id, Message(role="user", content=current_prompt))
        _ai_service.record_user_message(current_prompt)
        context = Context(project_dir=str(project_info.root), history=list(history))
        ai_response = await _ai_service.generate(current_prompt, context)
        _conversations.add_message(conversation.conversation_id, Message(role="assistant", content=ai_response.text))

        analysis_prompt = (
            f"以下是 AI 產生的輸出:\n{ai_response.text}\n"
            "請判斷是否完成任務，若未完成請提供下一步行動指示。"
        )
        analysis = await _ai_service.analyze(analysis_prompt, context)

        log_files = payload.get("log_files") or []
        cwd_value = payload.get("cwd") or project_info.root
        automation_feedback = await _automation.run_iteration(
            command=payload.get("command"),
            cwd=Path(cwd_value),
            log_files=[Path(path) for path in log_files],
            window_title=payload.get("window_title"),
        )

        iteration_data = {
            "prompt": current_prompt,
            "response": ai_response.text,
            "analysis": dataclass_to_dict(analysis),
            "automation_feedback": automation_feedback,
        }
        aggregated["iterations"].append(iteration_data)
        if analysis.is_complete:
            aggregated["status"] = "complete"
            break
        current_prompt = analysis.next_request
        history.append(Message(role="assistant", content=ai_response.text))
    else:
        aggregated["status"] = "incomplete"

    aggregated["conversation_id"] = conversation.conversation_id
    aggregated["memory"] = _ai_service.get_memory_snapshot()
    return jsonify(aggregated)


@api_bp.errorhandler(Exception)
def handle_error(exc: Exception) -> Response:
    logger.exception("API 錯誤: %s", exc)
    return jsonify({"success": False, "error": str(exc)}), 500
