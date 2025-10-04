"""Project and conversation management services."""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from config import CONVERSATIONS_DIR, PROJECT_LIST_FILE, PROJECTS_DIR
from services.ai_service import Message
from utils.common import atomic_write, ensure_dir, safe_read_file

logger = logging.getLogger(__name__)


@dataclass
class Conversation:
    conversation_id: str
    project_dir: Path
    created_at: datetime = field(default_factory=datetime.utcnow)
    messages: List[Message] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "conversation_id": self.conversation_id,
            "project_dir": str(self.project_dir),
            "created_at": self.created_at.isoformat(),
            "messages": [
                {"role": msg.role, "content": msg.content, "timestamp": msg.timestamp.isoformat()}
                for msg in self.messages
            ],
        }


@dataclass
class ProjectInfo:
    name: str
    root: Path
    description: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    conversations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "root": str(self.root),
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "conversations": self.conversations,
        }


class ProjectManager:
    def __init__(self, root: Path = PROJECTS_DIR):
        self.root = root
        ensure_dir(self.root)
        self.cache: Dict[str, ProjectInfo] = {}
        self._load_project_index()

    def _load_project_index(self) -> None:
        if PROJECT_LIST_FILE.exists():
            data = json.loads(PROJECT_LIST_FILE.read_text(encoding="utf-8"))
            for item in data:
                info = ProjectInfo(
                    name=item["name"],
                    root=Path(item["root"]),
                    description=item.get("description", ""),
                    created_at=datetime.fromisoformat(item["created_at"]),
                    conversations=item.get("conversations", []),
                )
                self.cache[info.name] = info
        else:
            PROJECT_LIST_FILE.write_text("[]", encoding="utf-8")

    def _save_project_index(self) -> None:
        payload = [info.to_dict() for info in self.cache.values()]
        PROJECT_LIST_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def create_project(self, name: str, description: str = "") -> ProjectInfo:
        project_dir = self.root / name
        ensure_dir(project_dir)
        info = ProjectInfo(name=name, root=project_dir, description=description)
        self.cache[name] = info
        self._save_project_index()
        return info

    def get_project(self, name: str) -> Optional[ProjectInfo]:
        return self.cache.get(name)

    def list_projects(self) -> List[ProjectInfo]:
        return list(self.cache.values())


class ConversationManager:
    def __init__(self, root: Path = CONVERSATIONS_DIR):
        self.root = root
        ensure_dir(self.root)
        self.active_conversations: Dict[str, Conversation] = {}

    def _conversation_file(self, conversation_id: str) -> Path:
        return self.root / f"{conversation_id}.json"

    def create(self, project_dir: Path, *, from_memory: Optional[List[str]] = None) -> Conversation:
        conversation_id = uuid.uuid4().hex
        conv = Conversation(conversation_id=conversation_id, project_dir=project_dir)
        if from_memory:
            conv.messages.append(Message(role="system", content="\n".join(from_memory)))
        self.active_conversations[conversation_id] = conv
        self.save(conv)
        return conv

    def get(self, conversation_id: str) -> Optional[Conversation]:
        if conversation_id in self.active_conversations:
            return self.active_conversations[conversation_id]
        file_path = self._conversation_file(conversation_id)
        payload = safe_read_file(file_path)
        if not payload:
            return None
        data = json.loads(payload)
        conversation = Conversation(
            conversation_id=data["conversation_id"],
            project_dir=Path(data["project_dir"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            messages=[
                Message(role=item["role"], content=item["content"], timestamp=datetime.fromisoformat(item["timestamp"]))
                for item in data.get("messages", [])
            ],
        )
        self.active_conversations[conversation_id] = conversation
        return conversation

    def add_message(self, conversation_id: str, message: Message) -> None:
        conversation = self.get(conversation_id)
        if not conversation:
            raise ValueError(f"找不到對話: {conversation_id}")
        conversation.messages.append(message)
        self.save(conversation)

    def save(self, conversation: Conversation) -> None:
        path = self._conversation_file(conversation.conversation_id)
        atomic_write(path, json.dumps(conversation.to_dict(), indent=2, ensure_ascii=False))


class ProjectService:
    def __init__(self, project_manager: ProjectManager, conversation_manager: ConversationManager):
        self.projects = project_manager
        self.conversations = conversation_manager

    def ensure_project(self, name: str) -> ProjectInfo:
        project = self.projects.get_project(name)
        if not project:
            project = self.projects.create_project(name)
        return project

    def append_conversation(self, project: ProjectInfo, conversation: Conversation) -> None:
        project.conversations.append(conversation.conversation_id)
        self.projects.cache[project.name] = project
        self.projects._save_project_index()
