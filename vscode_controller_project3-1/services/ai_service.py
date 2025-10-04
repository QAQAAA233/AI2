"""AI service layer handling model interactions and conversation memory."""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional

import google.generativeai as genai
from google.generativeai import types as genai_types

from config import AIConfig, MemoryConfig, TokenLimits
from utils.common import count_tokens, dataclass_to_dict

logger = logging.getLogger(__name__)


@dataclass
class Message:
    role: str
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Context:
    project_dir: str
    files: List[str] = field(default_factory=list)
    history: List[Message] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AIResponse:
    text: str
    tokens_used: int
    raw: Dict[str, Any]
    code_blocks: List[str] = field(default_factory=list)
    suggested_changes: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AnalysisResult:
    is_complete: bool
    summary: str
    next_request: str
    issues: List[str] = field(default_factory=list)
    diagnostics: Dict[str, Any] = field(default_factory=dict)


class TokenStatus:
    NORMAL = "normal"
    WARNING = "warning"
    NEED_SWITCH = "need_switch"


class AIServiceError(RuntimeError):
    pass


class MemoryManager:
    """Manages short and long term memory of conversations."""

    def __init__(self, config: MemoryConfig):
        self.config = config
        self.short_term: Deque[Message] = deque(maxlen=config.short_term_size)
        self.long_term: List[str] = []
        self.iteration_counter = 0

    def add_message(self, message: Message) -> None:
        if not self.config.enable_memory:
            return
        self.short_term.append(message)
        self.iteration_counter += 1
        if self.iteration_counter >= self.config.long_term_summary_interval:
            self.iteration_counter = 0
            summary = self._summarize_short_term()
            if summary:
                self.long_term.append(summary)
                self.short_term.clear()

    def _summarize_short_term(self) -> Optional[str]:
        if not self.short_term:
            return None
        summary_lines = [f"{msg.role}: {msg.content}" for msg in self.short_term]
        return "\n".join(summary_lines[-10:])

    def get_context(self) -> str:
        if not self.config.enable_memory:
            return ""
        long_term_text = "\n".join(self.long_term)
        short_term_text = "\n".join(f"{msg.role}: {msg.content}" for msg in self.short_term)
        return (
            "=== 長期記憶摘要 ===\n"
            f"{long_term_text}\n\n=== 短期對話 ===\n{short_term_text}"
        ).strip()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "long_term": list(self.long_term),
            "short_term": [dataclass_to_dict(msg) for msg in self.short_term],
        }


class TokenManager:
    """Tracks token usage and conversation switching."""

    def __init__(self, limits: TokenLimits):
        self.limits = limits
        self.current_tokens = 0
        self.conversation_id = self._new_conversation_id()

    def _new_conversation_id(self) -> str:
        return uuid.uuid4().hex

    def add(self, token_count: int) -> str:
        self.current_tokens += token_count
        if self.current_tokens >= self.limits.auto_switch_threshold:
            return TokenStatus.NEED_SWITCH
        if self.current_tokens >= self.limits.warning_threshold:
            return TokenStatus.WARNING
        return TokenStatus.NORMAL

    def reset(self) -> str:
        self.current_tokens = 0
        self.conversation_id = self._new_conversation_id()
        return self.conversation_id


class PromptManager:
    """Provides reusable prompt templates."""

    SYSTEM_PROMPTS = {
        "code_generation": "你是專業的 AI 開發助手，將以下需求轉換為模組化代碼。",
        "bug_detection": "你是資深測試工程師，請分析執行輸出並指出問題及修復方案。",
        "ui_analysis": "你是 UI/UX 評估師，請根據截圖資訊判斷介面是否符合 ChatGPT 明亮風格。",
        "code_review": "你是代碼審查專家，請檢查以下變更是否符合最佳實踐。",
    }

    def get_prompt(self, prompt_type: str, **kwargs: Any) -> str:
        template = self.SYSTEM_PROMPTS.get(prompt_type)
        if not template:
            raise KeyError(f"未知的提示詞類型: {prompt_type}")
        return template.format(**kwargs)


class AIServiceBase:
    async def generate(self, prompt: str, context: Context) -> AIResponse:  # pragma: no cover - interface
        raise NotImplementedError

    async def analyze(self, prompt: str, context: Context) -> AnalysisResult:  # pragma: no cover - interface
        raise NotImplementedError

    def get_memory_snapshot(self) -> Dict[str, Any]:  # pragma: no cover - interface
        raise NotImplementedError


class GeminiService(AIServiceBase):
    """Concrete implementation backed by Google Gemini models."""

    def __init__(self, config: AIConfig):
        self.config = config
        self.memory = MemoryManager(config.memory)
        self.tokens = TokenManager(config.token_limits)
        self.prompts = PromptManager()
        self._client: Optional[genai.GenerativeModel] = None
        if config.api_key:
            genai.configure(api_key=config.api_key)

    def record_user_message(self, content: str) -> None:
        self.memory.add_message(Message(role="user", content=content))

    @property
    def client(self) -> genai.GenerativeModel:
        if self._client is None:
            logger.info("初始化 Gemini 模型: %s", self.config.model_name)
            self._client = genai.GenerativeModel(model_name=self.config.model_name)
        return self._client

    async def generate(self, prompt: str, context: Context) -> AIResponse:
        logger.info("呼叫 Gemini 生成內容")
        compiled_prompt = self._build_prompt(prompt, context)
        prompt_tokens = count_tokens(compiled_prompt)
        status = self.tokens.add(prompt_tokens)
        if status == TokenStatus.NEED_SWITCH:
            logger.info("Token 超出上限，開啟新對話")
            self.tokens.reset()

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.generate_content(
                compiled_prompt,
                generation_config=genai_types.GenerationConfig(**self.config.generation_params),
            ),
        )

        text = response.text or ""
        response_tokens = count_tokens(text)
        self.tokens.add(response_tokens)
        code_blocks = []
        try:
            if response.candidates:
                parts = response.candidates[0].content.parts
                code_blocks = parts if isinstance(parts, list) else []
        except AttributeError:
            logger.debug("Gemini 回應不包含 parts 資訊", exc_info=True)
        data = AIResponse(
            text=text,
            tokens_used=prompt_tokens + response_tokens,
            raw=response.to_dict(),
            code_blocks=[getattr(part, "text", "") for part in code_blocks],
        )
        self.memory.add_message(Message(role="assistant", content=text))
        return data

    async def analyze(self, prompt: str, context: Context) -> AnalysisResult:
        analysis_prompt = self.prompts.get_prompt("bug_detection") + "\n" + prompt
        response = await self.generate(analysis_prompt, context)
        issues: List[str] = []
        summary = response.text
        next_request = "請依據以上分析修復問題。"
        try:
            payload = response.raw
            if isinstance(payload, dict):
                candidates = payload.get("candidates", [])
                if candidates:
                    content = candidates[0]["content"]["parts"][0].get("text", "")
                    summary = content or summary
        except Exception:  # pragma: no cover - best effort parsing
            logger.debug("無法解析分析結果", exc_info=True)
        return AnalysisResult(
            is_complete="已完成" in summary,
            summary=summary,
            next_request=next_request,
            issues=issues,
            diagnostics={"tokens": response.tokens_used},
        )

    def _build_prompt(self, prompt: str, context: Context) -> str:
        memory_text = self.memory.get_context()
        history_text = "\n".join(f"{msg.role}: {msg.content}" for msg in context.history)
        files_text = "\n".join(context.files)
        return (
            f"{self.prompts.get_prompt('code_generation')}\n"
            f"專案路徑: {context.project_dir}\n"
            f"相關檔案: {files_text}\n"
            f"歷史對話:\n{history_text}\n"
            f"記憶:\n{memory_text}\n"
            f"使用者需求:\n{prompt}"
        )

    def get_memory_snapshot(self) -> Dict[str, Any]:
        return {
            "conversation_id": self.tokens.conversation_id,
            "token_usage": self.tokens.current_tokens,
            "memory": self.memory.to_dict(),
        }
