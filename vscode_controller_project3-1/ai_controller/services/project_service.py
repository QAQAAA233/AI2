"""Project and conversation management services."""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional

from ..config import AppConfig
from ..utils import atomic_write, ensure_dir, format_timestamp, json_dumps, safe_read_file
from .ai_service import Message

logger = logging.getLogger(__name__)


@dataclass
class ProjectInfo:
    """Metadata describing a project."""

    name: str
    root_path: str
    created_at: str
    description: str = ""

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


@dataclass
class Conversation:
    """Conversation stored for a project."""

    id: str
    project_dir: str
    created_at: str = field(default_factory=format_timestamp)
    messages: List[Message] = field(default_factory=list)

    def to_dict(self) -> Dict[str, any]:
        return {
            "id": self.id,
            "project_dir": self.project_dir,
            "created_at": self.created_at,
            "messages": [asdict(msg) for msg in self.messages],
        }


class ProjectManager:
    """Manage project metadata and persistence."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        ensure_dir(config.paths.projects)
        self.projects: Dict[str, ProjectInfo] = {}
        self._load_project_list()

    def _project_file(self, project_dir: Path) -> Path:
        return project_dir / "PROJECT_INFO.json"

    def _load_project_list(self) -> None:
        path = self.config.paths.project_list_file
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Project list file invalid; resetting")
            data = []
        for item in data:
            info = ProjectInfo(**item)
            self.projects[info.root_path] = info

    def _save_project_list(self) -> None:
        data = [info.to_dict() for info in self.projects.values()]
        atomic_write(self.config.paths.project_list_file, json_dumps(data))

    def create_project(self, name: str, base_dir: Optional[str] = None) -> ProjectInfo:
        base = Path(base_dir) if base_dir else self.config.paths.projects
        project_dir = base / name
        ensure_dir(project_dir)
        info = ProjectInfo(name=name, root_path=str(project_dir), created_at=format_timestamp())
        self.projects[info.root_path] = info
        atomic_write(self._project_file(project_dir), json_dumps(info.to_dict()))
        self._save_project_list()
        logger.info("Project created at %s", project_dir)
        return info

    def load_project(self, root_path: str) -> Optional[ProjectInfo]:
        info = self.projects.get(root_path)
        if info:
            return info
        path = Path(root_path)
        if not path.exists():
            return None
        project_info_file = self._project_file(path)
        text = safe_read_file(project_info_file)
        if not text:
            return None
        data = json.loads(text)
        info = ProjectInfo(**data)
        self.projects[info.root_path] = info
        return info

    def list_projects(self) -> List[ProjectInfo]:
        return list(self.projects.values())


class ConversationManager:
    """Manage conversation histories."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        ensure_dir(config.paths.conversations)
        self.active: Dict[str, Conversation] = {}

    def _conversation_path(self, conversation_id: str) -> Path:
        return self.config.paths.conversations / f"{conversation_id}.json"

    def get_conversation(self, project_dir: str, conversation_id: Optional[str] = None) -> Conversation:
        if conversation_id and conversation_id in self.active:
            return self.active[conversation_id]
        if conversation_id:
            path = self._conversation_path(conversation_id)
            text = safe_read_file(path)
            if text:
                data = json.loads(text)
                conversation = Conversation(
                    id=data["id"],
                    project_dir=data["project_dir"],
                    created_at=data["created_at"],
                    messages=[Message(**msg) for msg in data.get("messages", [])],
                )
                self.active[conversation.id] = conversation
                return conversation
        new_id = uuid.uuid4().hex
        conversation = Conversation(id=new_id, project_dir=project_dir)
        self.active[new_id] = conversation
        return conversation

    def append_message(self, conversation: Conversation, message: Message) -> None:
        conversation.messages.append(message)
        self._save(conversation)

    def _save(self, conversation: Conversation) -> None:
        path = self._conversation_path(conversation.id)
        atomic_write(path, json_dumps(conversation.to_dict()))


class ProjectService:
    """High level facade for project + conversation operations."""

    def __init__(self, config: AppConfig) -> None:
        self.project_manager = ProjectManager(config)
        self.conversation_manager = ConversationManager(config)

    def create_project(self, name: str, base_dir: Optional[str] = None) -> ProjectInfo:
        return self.project_manager.create_project(name, base_dir)

    def list_projects(self) -> List[Dict[str, str]]:
        return [proj.to_dict() for proj in self.project_manager.list_projects()]

    def get_or_create_conversation(self, project_dir: str, conversation_id: Optional[str] = None) -> Conversation:
        return self.conversation_manager.get_conversation(project_dir, conversation_id)

    def append_message(self, conversation: Conversation, message: Message) -> None:
        self.conversation_manager.append_message(conversation, message)


__all__ = [
    "ProjectInfo",
    "Conversation",
    "ProjectManager",
    "ConversationManager",
    "ProjectService",
]
