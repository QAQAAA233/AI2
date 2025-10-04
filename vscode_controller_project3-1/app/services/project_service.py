"""Project and conversation management services."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from app.utils.helpers import ensure_dir, generate_conversation_id

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ConversationMessage:
    role: str
    content: str
    timestamp: str


@dataclass(slots=True)
class Conversation:
    id: str
    project_dir: Path
    messages: List[ConversationMessage] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "messages": [message.__dict__ for message in self.messages],
        }


@dataclass(slots=True)
class ProjectInfo:
    name: str
    path: Path
    description: str = ""
    conversations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "path": str(self.path),
            "description": self.description,
            "conversations": self.conversations,
        }


class ProjectManager:
    def __init__(self, projects_dir: Path, conversations_dir: Path):
        self.projects_dir = ensure_dir(projects_dir)
        self.conversations_dir = ensure_dir(conversations_dir)
        self._cache: Dict[str, ProjectInfo] = {}

    def create_project(self, name: str, description: str = "") -> ProjectInfo:
        project_path = self.projects_dir / name
        ensure_dir(project_path)
        info = ProjectInfo(name=name, path=project_path, description=description)
        self._cache[name] = info
        self._save_project(info)
        return info

    def load_project(self, name: str) -> Optional[ProjectInfo]:
        if name in self._cache:
            return self._cache[name]
        project_path = self.projects_dir / name
        info_path = project_path / "project.json"
        if not info_path.exists():
            return None
        data = json.loads(info_path.read_text(encoding="utf-8"))
        info = ProjectInfo(name=data["name"], path=project_path, description=data.get("description", ""))
        info.conversations = data.get("conversations", [])
        self._cache[name] = info
        return info

    def list_projects(self) -> List[ProjectInfo]:
        result: List[ProjectInfo] = []
        for item in self.projects_dir.iterdir():
            if not item.is_dir():
                continue
            info = self.load_project(item.name)
            if info:
                result.append(info)
        return result

    def _save_project(self, info: ProjectInfo) -> None:
        path = info.path / "project.json"
        path.write_text(json.dumps(info.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    def save(self, info: ProjectInfo) -> None:
        self._save_project(info)


class ConversationManager:
    def __init__(self, conversations_dir: Path) -> None:
        self.conversations_dir = ensure_dir(conversations_dir)
        self._active: Dict[str, Conversation] = {}

    def get_conversation(self, project: ProjectInfo, conversation_id: Optional[str] = None) -> Conversation:
        if conversation_id is None:
            conversation_id = project.conversations[-1] if project.conversations else generate_conversation_id()
        conv = self._active.get(conversation_id)
        if conv:
            return conv
        path = self._conversation_path(project, conversation_id)
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            messages = [ConversationMessage(**msg) for msg in data.get("messages", [])]
            conv = Conversation(id=conversation_id, project_dir=project.path, messages=messages)
        else:
            conv = Conversation(id=conversation_id, project_dir=project.path)
        self._active[conversation_id] = conv
        if conversation_id not in project.conversations:
            project.conversations.append(conversation_id)
        return conv

    def append_message(self, project: ProjectInfo, conversation_id: str, message: ConversationMessage) -> None:
        conv = self.get_conversation(project, conversation_id)
        conv.messages.append(message)
        self._save(project, conv)

    def create_new_conversation(self, project: ProjectInfo, seed_messages: Optional[List[ConversationMessage]] = None) -> Conversation:
        conversation_id = generate_conversation_id()
        conv = Conversation(id=conversation_id, project_dir=project.path, messages=seed_messages or [])
        self._active[conversation_id] = conv
        project.conversations.append(conversation_id)
        self._save(project, conv)
        return conv

    def _conversation_path(self, project: ProjectInfo, conversation_id: str) -> Path:
        return self.conversations_dir / f"{project.name}_{conversation_id}.json"

    def _save(self, project: ProjectInfo, conversation: Conversation) -> None:
        path = self._conversation_path(project, conversation.id)
        path.write_text(json.dumps(conversation.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


class ProjectService:
    def __init__(self, project_manager: ProjectManager, conversation_manager: ConversationManager):
        self.projects = project_manager
        self.conversations = conversation_manager

    def ensure_project(self, name: str) -> ProjectInfo:
        project = self.projects.load_project(name)
        if not project:
            project = self.projects.create_project(name)
        return project

    def ensure_conversation(self, project_name: str, conversation_id: Optional[str] = None) -> Conversation:
        project = self.ensure_project(project_name)
        conversation = self.conversations.get_conversation(project, conversation_id)
        self.projects.save(project)
        return conversation

    def add_message(self, project_name: str, conversation_id: str, message: ConversationMessage) -> None:
        project = self.ensure_project(project_name)
        self.conversations.append_message(project, conversation_id, message)
        self.projects.save(project)

    def get_history(self, project_name: str, conversation_id: Optional[str] = None) -> List[ConversationMessage]:
        project = self.ensure_project(project_name)
        conversation = self.conversations.get_conversation(project, conversation_id)
        self.projects.save(project)
        return conversation.messages
