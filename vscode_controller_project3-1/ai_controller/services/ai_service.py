"""AI service layer implementation."""
from __future__ import annotations

import asyncio
import logging
import uuid
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional

import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from ..config import AIConfig, AIServiceError, MemoryConfig, TokenLimits, TokenStatus
from ..utils import count_tokens, format_timestamp, retry_on_error

logger = logging.getLogger(__name__)


@dataclass
class Message:
    """Single conversation message."""

    role: str
    content: str
    timestamp: str = field(default_factory=lambda: format_timestamp(datetime.utcnow()))


@dataclass
class ConversationContext:
    """AI context information."""

    project_dir: str
    history: List[Message]
    files: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AIResponse:
    """Structured AI response."""

    text: str
    raw: Dict[str, Any]
    tokens_used: int
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "raw": self.raw,
            "tokens_used": self.tokens_used,
            "warnings": self.warnings,
            "metadata": self.metadata,
        }


class AIServiceBase(ABC):
    """Abstract AI service definition."""

    @abstractmethod
    async def generate(self, prompt: str, context: ConversationContext) -> AIResponse:
        raise NotImplementedError

    @abstractmethod
    def count_tokens(self, text: str) -> int:
        raise NotImplementedError


class PromptManager:
    """Centralised prompt templates."""

    SYSTEM_PROMPTS: Dict[str, str] = {
        "code_generation": "你是資深軟體工程師，請依照需求輸出 JSON 格式回答。",
        "bug_analysis": "你是測試專家，解析程式輸出與日誌並提供修復建議，請輸出 JSON。",
        "ui_review": "你是 UI/UX 評審，針對截圖提供建議並給出 0-100 分評分。",
        "code_review": "你是代碼審查專家，請找出潛在問題並輸出 JSON 結構結果。",
    }

    def get_prompt(self, prompt_type: str, *, extras: Optional[Dict[str, Any]] = None) -> str:
        extras = extras or {}
        template = self.SYSTEM_PROMPTS.get(prompt_type)
        if not template:
            raise ValueError(f"Unknown prompt type: {prompt_type}")
        return template.format(**extras)


class MemoryManager:
    """Conversation memory management."""

    def __init__(self, config: MemoryConfig, storage_dir: Path) -> None:
        self.config = config
        self.storage_dir = storage_dir
        self.short_term: Deque[Message] = deque(maxlen=config.short_term_size)
        self.long_term: List[str] = []
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("Memory manager initialised at %s", storage_dir)

    def add_message(self, message: Message) -> None:
        if not self.config.enable_memory:
            return
        self.short_term.append(message)
        logger.debug("Added message to memory: %s", message)
        if len(self.short_term) >= self.config.long_term_summary_interval:
            summary = self._summarize_short_term()
            if summary:
                self.long_term.append(summary)
                logger.debug("Long-term memory appended (%d)", len(self.long_term))

    def _summarize_short_term(self) -> Optional[str]:
        if not self.short_term:
            return None
        joined = "\n".join(f"{msg.role}: {msg.content}" for msg in self.short_term)
        return f"短期記憶摘要 ({format_timestamp()}):\n{joined}"

    def get_context(self) -> str:
        if not self.config.enable_memory:
            return ""
        parts: List[str] = []
        if self.long_term:
            parts.append("=== 長期記憶摘要 ===")
            parts.extend(self.long_term)
        if self.short_term:
            parts.append("=== 近期對話 ===")
            parts.extend(f"{msg.role}: {msg.content}" for msg in self.short_term)
        return "\n".join(parts)

    def reset(self) -> None:
        self.short_term.clear()
        self.long_term.clear()


class TokenManager:
    """Token accounting for conversation."""

    def __init__(self, limits: TokenLimits) -> None:
        self.limits = limits
        self.current_tokens = 0
        self.conversation_id = self._generate_conversation_id()

    @staticmethod
    def _generate_conversation_id() -> str:
        return uuid.uuid4().hex

    def add_tokens(self, tokens: int) -> TokenStatus:
        self.current_tokens += tokens
        if self.current_tokens >= self.limits.auto_switch_threshold:
            return TokenStatus.NEED_SWITCH
        if self.current_tokens >= self.limits.warning_threshold:
            return TokenStatus.WARNING
        return TokenStatus.NORMAL

    def reset(self) -> None:
        self.current_tokens = 0
        self.conversation_id = self._generate_conversation_id()


class GeminiService(AIServiceBase):
    """Google Gemini API implementation."""

    SAFETY_SETTINGS: Dict[Any, HarmBlockThreshold] = {}
    for attr in [
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_SEXUAL_CONTENT",
        "HARM_CATEGORY_SEXUAL",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
    ]:
        category = getattr(HarmCategory, attr, None)
        if category is not None:
            SAFETY_SETTINGS[category] = HarmBlockThreshold.BLOCK_NONE

    def __init__(self, config: AIConfig, memory_manager: MemoryManager, token_manager: TokenManager) -> None:
        if not config.api_key:
            raise AIServiceError("Gemini API 金鑰尚未設定", code="missing_api_key")
        self.config = config
        self.memory = memory_manager
        self.tokens = token_manager
        self.prompt_manager = PromptManager()
        genai.configure(api_key=config.api_key)
        self._client: Optional[genai.GenerativeModel] = None
        logger.info("Gemini service initialised with model %s", config.model_name)

    @property
    def client(self) -> genai.GenerativeModel:
        if self._client is None:
            self._client = genai.GenerativeModel(
                model_name=self.config.model_name,
                generation_config=self.config.generation_params,
                system_instruction=self.config.system_instruction,
                safety_settings=self.SAFETY_SETTINGS,
            )
        return self._client

    def count_tokens(self, text: str) -> int:  # pragma: no cover - thin wrapper
        return count_tokens(text, model=self.config.model_name)

    @retry_on_error(exceptions=(Exception,), max_retries=2, delay=2)
    async def generate(self, prompt: str, context: ConversationContext) -> AIResponse:
        logger.info("Invoking Gemini with prompt length %d", len(prompt))
        memory_context = self.memory.get_context()
        full_prompt = "\n".join(filter(None, [memory_context, prompt]))
        tokens = self.count_tokens(full_prompt)
        status = self.tokens.add_tokens(tokens)
        if status == TokenStatus.NEED_SWITCH:
            logger.warning("Token limit reached; resetting conversation")
            self.tokens.reset()
            self.memory.reset()

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.generate_content(full_prompt, request_options={"timeout": 300}),
        )
        text = response.text if hasattr(response, "text") else str(response)
        used_tokens = self.count_tokens(text)
        self.tokens.add_tokens(used_tokens)
        self.memory.add_message(Message(role="assistant", content=text))
        logger.debug("Gemini response tokens=%d", used_tokens)
        warnings: List[str] = []
        if status == TokenStatus.WARNING:
            warnings.append("對話即將超出 Token 限制，已自動紀錄摘要。")
        return AIResponse(text=text, raw=response.to_dict() if hasattr(response, "to_dict") else {"raw": text}, tokens_used=used_tokens, warnings=warnings)


class StubAIService(AIServiceBase):
    """Fallback AI service for development when API key is missing."""

    def __init__(self) -> None:
        self.memory = MemoryManager(MemoryConfig(enable_memory=False), Path("./"))

    def count_tokens(self, text: str) -> int:
        return len(text)

    async def generate(self, prompt: str, context: ConversationContext) -> AIResponse:
        logger.warning("Using stub AI service because no API key is configured")
        reply = (
            "（開發模式）尚未設定 Gemini API Key。\n"
            "收到的需求：\n"
            f"{prompt}\n\n"
            "請在設定中填入 API Key 後重新嘗試。"
        )
        return AIResponse(text=reply, raw={"stub": True}, tokens_used=len(reply), warnings=["stub_mode"])


class AIServiceFactory:
    """Factory creating AI services based on configuration."""

    @staticmethod
    def create(config: AIConfig, conversations_dir: Path) -> AIServiceBase:
        memory_dir = conversations_dir / "memory"
        memory_manager = MemoryManager(config.memory, memory_dir)
        token_manager = TokenManager(config.token_limits)
        if not config.api_key:
            return StubAIService()
        if config.provider.lower() != "gemini":
            raise AIServiceError("目前僅支援 Gemini 服務", code="unsupported_provider")
        return GeminiService(config, memory_manager, token_manager)


__all__ = [
    "Message",
    "ConversationContext",
    "AIResponse",
    "AIServiceBase",
    "PromptManager",
    "MemoryManager",
    "TokenManager",
    "GeminiService",
    "StubAIService",
    "AIServiceFactory",
]
