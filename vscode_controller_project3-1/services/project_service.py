"""Project and conversation management services."""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils import ensure_dir, format_timestamp
from services.ai_service import Message

logger = logging.getLogger(__name__)


@dataclass
class Conversation:
    id: str
    project_dir: Path
    messages: List[Message] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_dir": str(self.project_dir),
            "created_at": format_timestamp(self.created_at),
            "messages": [msg.to_dict() for msg in self.messages],
        }


@dataclass
class ProjectInfo:
    name: str
    path: Path
    created_at: datetime
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "path": str(self.path),
            "created_at": format_timestamp(self.created_at),
            "description": self.description,
        }


class ProjectManager:
    def __init__(self, projects_dir: Path) -> None:
        self.projects_dir = projects_dir
        ensure_dir(projects_dir)
        self.cache: Dict[str, ProjectInfo] = {}

    def create_project(self, folder: str, name: str, description: str = "") -> ProjectInfo:
        project_path = self.projects_dir / folder
        ensure_dir(project_path)
        info = ProjectInfo(name=name, path=project_path, created_at=datetime.utcnow(), description=description)
        self.cache[str(project_path)] = info
        self._save_project_info(info)
        return info

    def load_project(self, folder: str) -> ProjectInfo:
        project_path = self.projects_dir / folder
        if str(project_path) in self.cache:
            return self.cache[str(project_path)]
        info_file = project_path / "PROJECT_INFO.json"
        if info_file.exists():
            data = json.loads(info_file.read_text(encoding="utf-8"))
            info = ProjectInfo(
                name=data.get("name", project_path.name),
                path=project_path,
                created_at=self._safe_parse_datetime(data.get("created_at")),
                description=data.get("description", ""),
            )
        else:
            info = ProjectInfo(name=project_path.name, path=project_path, created_at=datetime.utcnow())
        self.cache[str(project_path)] = info
        return info

    def list_projects(self) -> List[ProjectInfo]:
        ensure_dir(self.projects_dir)
        projects = []
        for directory in self.projects_dir.iterdir():
            if directory.is_dir():
                projects.append(self.load_project(directory.name))
        return projects

    def get_project_structure(self, folder: str, max_depth: int = 3) -> str:
        project_path = self.projects_dir / folder
        if not project_path.exists():
            return "(Project not found)"
        lines: List[str] = []
        self._build_tree(project_path, lines, prefix="", depth=0, max_depth=max_depth)
        return "\n".join(lines)

    def _build_tree(self, path: Path, lines: List[str], prefix: str, depth: int, max_depth: int) -> None:
        if depth > max_depth:
            return
        entries = sorted(path.iterdir())
        for index, entry in enumerate(entries):
            connector = "└── " if index == len(entries) - 1 else "├── "
            lines.append(f"{prefix}{connector}{entry.name}")
            if entry.is_dir():
                extension = "    " if index == len(entries) - 1 else "│   "
                self._build_tree(entry, lines, prefix + extension, depth + 1, max_depth)

    def _save_project_info(self, info: ProjectInfo) -> None:
        data = info.to_dict()
        data["created_at"] = info.created_at.isoformat()
        (info.path / "PROJECT_INFO.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def _safe_parse_datetime(self, value: Optional[str]) -> datetime:
        if not value:
            return datetime.utcnow()
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return datetime.utcnow()


class ConversationManager:
    def __init__(self, conversations_dir: Path) -> None:
        self.conversations_dir = conversations_dir
        ensure_dir(conversations_dir)
        self.active_conversations: Dict[str, Conversation] = {}

    def get_conversation(self, project_dir: Path, conversation_id: Optional[str] = None) -> Conversation:
        if conversation_id:
            return self._load_conversation(project_dir, conversation_id)
        conv_dir = self._conversation_dir(project_dir)
        existing = sorted(conv_dir.glob("*.json"))
        if existing:
            return self._load_conversation(project_dir, existing[-1].stem)
        return self.create_new_conversation(project_dir)

    def create_new_conversation(self, project_dir: Path, from_memory: Optional[List[str]] = None) -> Conversation:
        conv_id = uuid.uuid4().hex
        conversation = Conversation(id=conv_id, project_dir=project_dir)
        if from_memory:
            for summary in from_memory:
                conversation.messages.append(Message(role="system", content=summary))
        self.active_conversations[conv_id] = conversation
        self._save_conversation(conversation)
        return conversation

    def add_message(self, conversation: Conversation, role: str, content: str) -> None:
        message = Message(role=role, content=content)
        conversation.messages.append(message)
        self._save_conversation(conversation)

    def _conversation_dir(self, project_dir: Path) -> Path:
        conv_dir = self.conversations_dir / project_dir.name
        ensure_dir(conv_dir)
        return conv_dir

    def _save_conversation(self, conversation: Conversation) -> None:
        conv_dir = self._conversation_dir(conversation.project_dir)
        file_path = conv_dir / f"{conversation.id}.json"
        payload = conversation.to_dict()
        payload["messages"] = [msg.to_dict() for msg in conversation.messages]
        file_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _load_conversation(self, project_dir: Path, conversation_id: str) -> Conversation:
        conv_dir = self._conversation_dir(project_dir)
        file_path = conv_dir / f"{conversation_id}.json"
        if not file_path.exists():
            return self.create_new_conversation(project_dir)
        data = json.loads(file_path.read_text(encoding="utf-8"))
        conversation = Conversation(
            id=data.get("id", conversation_id),
            project_dir=project_dir,
            created_at=datetime.fromisoformat(data.get("created_at", datetime.utcnow().isoformat())),
            messages=[
                Message(role=msg["role"], content=msg["content"]) for msg in data.get("messages", [])
            ],
        )
        self.active_conversations[conversation.id] = conversation
        return conversation


__all__ = ["Conversation", "ProjectInfo", "ProjectManager", "ConversationManager"]

