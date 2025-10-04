"""AI service abstractions and implementations."""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Deque, Dict, List, Optional

from config import AIConfig, AIServiceError, MemoryConfig, TokenLimits
from utils import count_tokens, format_timestamp

logger = logging.getLogger(__name__)

try:  # Optional dependency
    import google.generativeai as genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None


@dataclass
class Message:
    role: str
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": format_timestamp(self.timestamp),
        }


@dataclass
class Context:
    project_dir: str
    files: List[str] = field(default_factory=list)
    history: List[Message] = field(default_factory=list)


@dataclass
class AIResponse:
    text: str
    code_blocks: List[str] = field(default_factory=list)
    token_usage: int = 0
    conversation_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "code_blocks": self.code_blocks,
            "token_usage": self.token_usage,
            "conversation_id": self.conversation_id,
        }


@dataclass
class AnalysisResult:
    is_complete: bool
    next_request: str
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_complete": self.is_complete,
            "next_request": self.next_request,
            "summary": self.summary,
        }


class TokenStatus(Enum):
    NORMAL = "normal"
    WARNING = "warning"
    NEED_SWITCH = "need_switch"


class TokenManager:
    def __init__(self, limits: TokenLimits) -> None:
        self.limits = limits
        self.current_tokens = 0
        self.conversation_id = self._generate_conversation_id()

    def reset(self) -> None:
        self.current_tokens = 0
        self.conversation_id = self._generate_conversation_id()

    def add_tokens(self, count: int) -> TokenStatus:
        self.current_tokens += count
        if self.current_tokens >= self.limits.auto_switch_threshold:
            return TokenStatus.NEED_SWITCH
        if self.current_tokens >= self.limits.warning_threshold:
            return TokenStatus.WARNING
        return TokenStatus.NORMAL

    def _generate_conversation_id(self) -> str:
        return uuid.uuid4().hex


class MemoryManager:
    def __init__(self, config: MemoryConfig) -> None:
        self.config = config
        self.short_term: Deque[Message] = deque(maxlen=config.short_term_size)
        self.long_term: List[str] = []

    def add_message(self, message: Message) -> None:
        if not self.config.enable_memory:
            return
        self.short_term.append(message)
        if len(self.short_term) >= self.config.long_term_summary_interval:
            self._summarize_to_long_term()

    def _summarize_to_long_term(self) -> None:
        if not self.short_term:
            return
        summary = "\n".join(f"{msg.role}: {msg.content}" for msg in list(self.short_term))
        self.long_term.append(summary)
        self.short_term.clear()

    def get_context_for_ai(self) -> str:
        if not self.config.enable_memory:
            return ""
        long_term_block = "\n".join(self.long_term)
        short_term_block = "\n".join(
            f"[{format_timestamp(msg.timestamp)}] {msg.role}: {msg.content}"
            for msg in list(self.short_term)
        )
        return (
            "=== 長期記憶(摘要) ===\n"
            + (long_term_block or "(無)")
            + "\n=== 短期記憶(詳情) ===\n"
            + (short_term_block or "(無)")
        )

    def export_state(self) -> Dict[str, Any]:
        return {
            "long_term": self.long_term,
            "short_term": [msg.to_dict() for msg in self.short_term],
        }


class PromptManager:
    SYSTEM_PROMPTS: Dict[str, str] = {
        "code_generation": "你是專業的全棧工程師,請根據上下文生成乾淨且可測試的程式碼。",
        "bug_detection": "你是資深的除錯專家,請協助找出程式中的問題並提供修正建議。",
        "ui_analysis": "你是UI/UX顧問,請從螢幕截圖資訊中評估界面美觀與一致性。",
        "code_review": "你是嚴謹的程式碼審查員,請針對以下改動提供回饋。",
    }

    def get_prompt(self, prompt_type: str, **kwargs: Any) -> str:
        template = self.SYSTEM_PROMPTS.get(prompt_type)
        if not template:
            return ""
        return template.format(**kwargs)


class AIServiceBase:
    def __init__(self, config: AIConfig) -> None:
        self.config = config
        self.memory_manager = MemoryManager(config.memory_config)
        self.token_manager = TokenManager(config.token_limits)
        self.prompt_manager = PromptManager()

    async def generate(self, prompt: str, context: Context) -> AIResponse:
        raise NotImplementedError

    async def analyze(self, data: Dict[str, Any]) -> AnalysisResult:
        raise NotImplementedError

    def record_message(self, role: str, content: str) -> None:
        self.memory_manager.add_message(Message(role=role, content=content))


class GeminiService(AIServiceBase):
    def __init__(self, config: AIConfig) -> None:
        super().__init__(config)
        self._client: Optional[Any] = None
        if genai and config.api_key:
            genai.configure(api_key=config.api_key)

    def _ensure_client(self) -> None:
        if not genai:
            raise AIServiceError("google.generativeai is not available", code="missing_sdk")
        if not self.config.api_key:
            raise AIServiceError("Gemini API key not configured", code="missing_api_key")
        if not self._client:
            self._client = genai.GenerativeModel(self.config.model_name)

    async def _call_model(self, prompt: str) -> str:
        self._ensure_client()
        loop = asyncio.get_event_loop()

        def sync_call() -> str:
            response = self._client.generate_content(prompt, **self.config.generation_params)  # type: ignore[arg-type]
            return "\n".join(part.text for part in response.candidates[0].content.parts if getattr(part, "text", None))

        return await loop.run_in_executor(None, sync_call)

    async def generate(self, prompt: str, context: Context) -> AIResponse:
        memory_context = self.memory_manager.get_context_for_ai()
        full_prompt = f"{memory_context}\n\n=== 使用者需求 ===\n{prompt}"
        token_status = self.token_manager.add_tokens(count_tokens(full_prompt))
        if token_status == TokenStatus.NEED_SWITCH:
            logger.info("Token limit reached, switching conversation")
            self.token_manager.reset()
            self.memory_manager._summarize_to_long_term()
            token_status = TokenStatus.NORMAL
        try:
            if genai and self.config.api_key:
                text = await self._call_model(full_prompt)
            else:
                text = self._fallback_response(prompt, context)
        except Exception as exc:  # pragma: no cover
            logger.exception("Gemini call failed: %s", exc)
            raise AIServiceError(str(exc)) from exc
        self.record_message("assistant", text)
        tokens = count_tokens(text)
        self.token_manager.add_tokens(tokens)
        return AIResponse(
            text=text,
            code_blocks=[],
            token_usage=self.token_manager.current_tokens,
            conversation_id=self.token_manager.conversation_id,
        )

    async def analyze(self, data: Dict[str, Any]) -> AnalysisResult:
        prompt = self.prompt_manager.get_prompt(
            "bug_detection",
        )
        report = "\n".join(
            [
                "=== Terminal Output ===",
                data.get("terminal", "(no output)"),
                "\n=== Log Output ===",
                data.get("logs", "(no logs)"),
                "\n=== UI Analysis ===",
                data.get("ui", "(no ui analysis)"),
            ]
        )
        full_prompt = f"{prompt}\n\n{report}\n\n請判斷是否完成,輸出JSON格式: {{\"is_complete\": bool, \"next_request\": str, \"summary\": str}}"
        if genai and self.config.api_key:
            text = await self._call_model(full_prompt)
        else:
            text = '{"is_complete": false, "next_request": "請繼續偵錯", "summary": "請檢查日誌"}'
        import json

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"is_complete": False, "next_request": "請繼續檢視錯誤輸出", "summary": text}
        return AnalysisResult(
            is_complete=bool(payload.get("is_complete")),
            next_request=str(payload.get("next_request", "")),
            summary=str(payload.get("summary", "")),
        )

    def _fallback_response(self, prompt: str, context: Context) -> str:
        history_text = "\n".join(f"{msg.role}: {msg.content}" for msg in context.history[-5:])
        return (
            "[本地模擬回應]\n"
            f"你提出的請求是: {prompt}\n"
            "因為目前沒有可用的雲端AI, 系統提供建議:\n"
            "1. 檢查最近的程式輸出與錯誤訊息。\n"
            "2. 根據需求更新專案檔案, 然後重新執行測試。\n"
            "--- 最近對話 ---\n"
            f"{history_text or '(無歷史)'}"
        )


class LocalEchoService(AIServiceBase):
    async def generate(self, prompt: str, context: Context) -> AIResponse:
        echo = self._format_echo(prompt, context)
        self.record_message("assistant", echo)
        tokens = count_tokens(echo)
        self.token_manager.add_tokens(tokens)
        return AIResponse(
            text=echo,
            code_blocks=[],
            token_usage=self.token_manager.current_tokens,
            conversation_id=self.token_manager.conversation_id,
        )

    async def analyze(self, data: Dict[str, Any]) -> AnalysisResult:
        summary = (
            "(模擬分析) 依據終端輸出與日誌資料, 建議繼續排查。"
            if data.get("terminal") or data.get("logs")
            else "(模擬分析) 尚未收到足夠資訊, 請提供更多細節。"
        )
        return AnalysisResult(is_complete=False, next_request="請繼續執行測試", summary=summary)

    def _format_echo(self, prompt: str, context: Context) -> str:
        return (
            "[本地Echo服務]\n"
            f"Prompt: {prompt}\n"
            f"Files: {', '.join(context.files) if context.files else '無'}\n"
            f"Project: {context.project_dir}"
        )


__all__ = [
    "AIResponse",
    "AIServiceBase",
    "AnalysisResult",
    "Context",
    "GeminiService",
    "LocalEchoService",
    "Message",
    "PromptManager",
    "TokenManager",
    "TokenStatus",
]

