"""AI service layer providing memory management and provider abstractions."""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Deque, Dict, List, Optional

import google.generativeai as genai
from google.generativeai import types as genai_types

from app.config import AIConfig, MemoryConfig, TokenLimits
from app.utils.helpers import count_tokens, generate_conversation_id

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Message:
    role: str
    content: str
    timestamp: datetime


@dataclass(slots=True)
class AIResponse:
    text: str
    raw: Dict[str, str]
    token_count: int
    metadata: Dict[str, str]


@dataclass(slots=True)
class GenerationContext:
    project_dir: str
    history: List[Message]
    attachments: Optional[Dict[str, str]] = None


class TokenStatus:
    NORMAL = "normal"
    WARNING = "warning"
    NEED_SWITCH = "need_switch"


class AIServiceBase(ABC):
    """Abstract service definition."""

    @abstractmethod
    async def generate(self, prompt: str, context: GenerationContext) -> AIResponse:
        raise NotImplementedError

    @abstractmethod
    def summarize(self, text: str) -> str:
        raise NotImplementedError


class MemoryManager:
    """Maintain short-term and long-term memory."""

    def __init__(self, config: MemoryConfig) -> None:
        self.config = config
        self.short_term: Deque[Message] = deque(maxlen=config.short_term_size)
        self.long_term: List[str] = []

    def add_message(self, role: str, content: str) -> None:
        if not self.config.enable_memory:
            return
        msg = Message(role=role, content=content, timestamp=datetime.utcnow())
        self.short_term.append(msg)
        if len(self.short_term) >= self.config.long_term_summary_interval:
            self._promote_to_long_term()

    def _promote_to_long_term(self) -> None:
        if not self.short_term:
            return
        joined = "\n".join(f"{m.role}: {m.content}" for m in self.short_term)
        self.long_term.append(joined)
        self.short_term.clear()

    def get_context(self) -> str:
        sections = []
        if self.long_term:
            sections.append("=== 長期記憶摘要 ===")
            sections.extend(self.long_term[-5:])
        if self.short_term:
            sections.append("=== 近期對話 ===")
            sections.extend(f"{m.role}: {m.content}" for m in self.short_term)
        return "\n".join(sections)

    def rotate(self) -> None:
        self._promote_to_long_term()


class TokenManager:
    def __init__(self, limits: TokenLimits) -> None:
        self.limits = limits
        self.current_tokens = 0
        self.conversation_id = generate_conversation_id()

    def add(self, count: int) -> str:
        self.current_tokens += count
        if self.current_tokens >= self.limits.auto_switch_threshold:
            return TokenStatus.NEED_SWITCH
        if self.current_tokens >= self.limits.warning_threshold:
            return TokenStatus.WARNING
        return TokenStatus.NORMAL

    def reset(self) -> None:
        self.current_tokens = 0
        self.conversation_id = generate_conversation_id()


class PromptManager:
    SYSTEM_PROMPTS: Dict[str, str] = {
        "code_generation": "你是專業的AI程式開發助手，會在回應中提供完整的檔案修改建議。",
        "bug_detection": "你是專業的除錯專家，會細緻分析程式輸出與日誌找出問題。",
        "ui_analysis": "你是UI/UX顧問，請檢視提供的介面資訊並回饋改善建議。",
        "code_review": "你是資深的程式碼審查專家，請檢視代碼品質與最佳實踐。",
    }

    def get(self, prompt_type: str, **kwargs: str) -> str:
        template = self.SYSTEM_PROMPTS.get(prompt_type)
        if not template:
            return ""
        return template.format(**kwargs)


class GeminiService(AIServiceBase):
    """Google Gemini based implementation."""

    def __init__(self, config: AIConfig) -> None:
        self.config = config
        self.memory = MemoryManager(config.memory)
        self.tokens = TokenManager(config.token_limits)
        self.prompt_manager = PromptManager()
        self._client: Optional[genai.GenerativeModel] = None
        if config.api_key:
            genai.configure(api_key=config.api_key)

    @property
    def client(self) -> genai.GenerativeModel:
        if self._client is None:
            logger.debug("Initialising Gemini model: %s", self.config.model_name)
            self._client = genai.GenerativeModel(self.config.model_name)
        return self._client

    async def generate(self, prompt: str, context: GenerationContext) -> AIResponse:
        for message in context.history:
            self.memory.add_message(message.role, message.content)
        self.memory.add_message("user", prompt)
        context_text = self.memory.get_context()
        full_prompt = "\n".join(filter(None, [context_text, prompt]))
        prompt_tokens = count_tokens(full_prompt)
        token_status = self.tokens.add(prompt_tokens)

        if token_status == TokenStatus.NEED_SWITCH:
            logger.info("Token limit reached, rotating conversation ID")
            self.tokens.reset()
            self.memory.rotate()
            context_text = self.memory.get_context()
            full_prompt = "\n".join(filter(None, [context_text, prompt]))

        logger.debug("Sending prompt to Gemini (tokens=%s)", prompt_tokens)
        response = await asyncio.to_thread(
            self.client.generate_content,
            full_prompt,
            generation_config=genai_types.GenerationConfig(**self.config.generation_params),
            safety_settings=self.config.safety_settings or None,
            system_instruction=self.config.system_instruction or None,
        )

        text = response.text or ""
        token_count = count_tokens(text)
        self.memory.add_message("assistant", text)
        self.tokens.add(token_count)
        logger.debug("Gemini response tokens=%s", token_count)

        return AIResponse(
            text=text,
            raw={"raw_text": text},
            token_count=token_count,
            metadata={"conversation_id": self.tokens.conversation_id, "token_status": token_status},
        )

    def summarize(self, text: str) -> str:
        summary_prompt = "請將以下內容整理成200字以內的摘要:\n" + text
        response = self.client.generate_content(
            summary_prompt,
            generation_config=genai_types.GenerationConfig(**self.config.generation_params),
            safety_settings=self.config.safety_settings or None,
            system_instruction=self.config.system_instruction or None,
        )
        return response.text or ""


def create_ai_service(config: AIConfig) -> AIServiceBase:
    provider = config.provider.lower()
    if provider == "gemini":
        return GeminiService(config)
    raise ValueError(f"Unsupported AI provider: {provider}")
