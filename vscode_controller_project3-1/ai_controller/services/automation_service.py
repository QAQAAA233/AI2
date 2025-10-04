"""Automation service components for VSCode, program execution and monitoring."""
from __future__ import annotations

import base64
import logging
import os
import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import mss
from PIL import Image

from ..config import AutomationConfig, AutomationError, VSCodeConfig
from ..utils import atomic_write, ensure_dir, format_timestamp

logger = logging.getLogger(__name__)


@dataclass
class CodeOperation:
    """Describes a code modification."""

    type: str
    file_path: str
    content: str = ""
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    metadata: Dict[str, str] = field(default_factory=dict)


@dataclass
class OperationResult:
    """Result of a code operation."""

    success: bool
    detail: str
    file_path: Optional[str] = None


@dataclass
class AutomationIterationResult:
    """Results returned by a hosting-mode iteration."""

    operations: List[OperationResult]
    terminal_output: str
    log_updates: Dict[str, str]
    screenshots: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operations": [op.__dict__ for op in self.operations],
            "terminal_output": self.terminal_output,
            "log_updates": self.log_updates,
            "screenshots": self.screenshots,
        }


class VSCodeController:
    """Control VSCode either via CLI or GUI overlay."""

    def __init__(self, config: VSCodeConfig) -> None:
        self.config = config

    def open_files(self, folder: str, files: Iterable[str]) -> OperationResult:
        logger.info("Opening files in VSCode: folder=%s files=%s", folder, list(files))
        if self.config.use_code_command:
            return self._open_via_command(folder, files)
        return OperationResult(success=True, detail="GUI overlay not implemented in headless mode")

    def _open_via_command(self, folder: str, files: Iterable[str]) -> OperationResult:
        command = ["code", folder]
        command.extend(files)
        try:
            subprocess.run(command, check=False)
            return OperationResult(success=True, detail="VSCode command executed", file_path=str(folder))
        except FileNotFoundError as exc:
            logger.error("code command not available: %s", exc)
            return OperationResult(success=False, detail="code 指令不存在，請確認 VSCode CLI 已安裝")

    def apply_operation(self, op: CodeOperation, base_path: Path) -> OperationResult:
        file_path = base_path / op.file_path
        ensure_dir(file_path.parent)
        try:
            if op.type == "replace":
                return self._replace_content(file_path, op)
            if op.type == "append":
                return self._append_content(file_path, op.content)
            if op.type == "overwrite":
                return self._overwrite_content(file_path, op.content)
            if op.type == "delete":
                return self._delete_range(file_path, op)
            return OperationResult(False, f"未知操作類型: {op.type}", str(file_path))
        except OSError as exc:
            logger.exception("File operation failed")
            raise AutomationError(str(exc)) from exc

    def _replace_content(self, file_path: Path, op: CodeOperation) -> OperationResult:
        content = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
        lines = content.splitlines()
        start = max((op.start_line or 1) - 1, 0)
        end = (op.end_line or start + 1)
        new_lines = lines[:start] + op.content.splitlines() + lines[end:]
        atomic_write(file_path, "\n".join(new_lines) + "\n")
        return OperationResult(True, "內容已更新", str(file_path))

    def _append_content(self, file_path: Path, content: str) -> OperationResult:
        existing = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
        atomic_write(file_path, existing + "\n" + content)
        return OperationResult(True, "內容已追加", str(file_path))

    def _overwrite_content(self, file_path: Path, content: str) -> OperationResult:
        atomic_write(file_path, content)
        return OperationResult(True, "檔案已覆寫", str(file_path))

    def _delete_range(self, file_path: Path, op: CodeOperation) -> OperationResult:
        if not file_path.exists():
            return OperationResult(False, "檔案不存在", str(file_path))
        lines = file_path.read_text(encoding="utf-8").splitlines()
        start = max((op.start_line or 1) - 1, 0)
        end = min(op.end_line or start + 1, len(lines))
        new_lines = lines[:start] + lines[end:]
        atomic_write(file_path, "\n".join(new_lines) + "\n")
        return OperationResult(True, "指定範圍已刪除", str(file_path))


class LogMonitor:
    """Tail-like log monitoring."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._position = 0

    def read_new(self) -> str:
        if not self.path.exists():
            return ""
        with self.path.open("r", encoding="utf-8", errors="ignore") as handle:
            handle.seek(self._position)
            data = handle.read()
            self._position = handle.tell()
            return data


class ProgramMonitor:
    """Capture stdout/stderr from running processes."""

    def __init__(self) -> None:
        self.processes: Dict[int, subprocess.Popen[str]] = {}
        self.queues: Dict[int, "queue.Queue[str]"] = {}

    def run_program(self, command: str, *, cwd: Optional[Path] = None) -> int:
        logger.info("Running command: %s", command)
        proc = subprocess.Popen(
            command,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            text=True,
        )
        output_queue: "queue.Queue[str]" = queue.Queue()
        self.queues[proc.pid] = output_queue
        self.processes[proc.pid] = proc

        threading.Thread(target=self._drain_output, args=(proc, output_queue), daemon=True).start()
        return proc.pid

    def _drain_output(self, proc: subprocess.Popen[str], output_queue: "queue.Queue[str]") -> None:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            output_queue.put(line.rstrip("\n"))
        proc.wait()
        output_queue.put(f"[process exited with code {proc.returncode}]")

    def collect_output(self, pid: int) -> str:
        queue_ = self.queues.get(pid)
        if not queue_:
            return ""
        parts: List[str] = []
        while not queue_.empty():
            parts.append(queue_.get())
        return "\n".join(parts)


class ScreenshotAnalyzer:
    """Capture screenshots for UI review."""

    def __init__(self, screenshot_dir: Path) -> None:
        self.screenshot_dir = screenshot_dir
        ensure_dir(screenshot_dir)

    def capture(self, title: str) -> str:
        filename = f"screenshot_{format_timestamp().replace(' ', '_').replace(':', '-')}.png"
        path = self.screenshot_dir / filename
        with mss.mss() as sct:
            monitor = sct.monitors[0]
            img = sct.grab(monitor)
            Image.frombytes("RGB", img.size, img.rgb).save(path)
        return str(path)

    def capture_base64(self, title: str) -> str:
        path = self.capture(title)
        data = Path(path).read_bytes()
        return base64.b64encode(data).decode("ascii")


class AutomationService:
    """High level automation orchestrator used by the API layer."""

    def __init__(
        self,
        *,
        vscode: VSCodeController,
        monitor: ProgramMonitor,
        screenshot_analyzer: ScreenshotAnalyzer,
        automation_config: AutomationConfig,
    ) -> None:
        self.vscode = vscode
        self.monitor = monitor
        self.screenshot_analyzer = screenshot_analyzer
        self.config = automation_config
        self.log_monitors: Dict[str, LogMonitor] = {}

    def apply_operations(self, operations: Iterable[CodeOperation], project_dir: Path) -> List[OperationResult]:
        results: List[OperationResult] = []
        for op in operations:
            result = self.vscode.apply_operation(op, project_dir)
            results.append(result)
        return results

    def run_command(self, command: str, project_dir: Path) -> AutomationIterationResult:
        pid = self.monitor.run_program(command, cwd=project_dir)
        time.sleep(3)
        terminal_output = self.monitor.collect_output(pid)
        log_updates: Dict[str, str] = {}
        for path_str in self.config.log_file_paths:
            monitor = self.log_monitors.setdefault(path_str, LogMonitor(Path(path_str)))
            log_updates[path_str] = monitor.read_new()
        screenshot = self.screenshot_analyzer.capture_base64("automation")
        return AutomationIterationResult(
            operations=[],
            terminal_output=terminal_output,
            log_updates=log_updates,
            screenshots=[screenshot],
        )


__all__ = [
    "CodeOperation",
    "OperationResult",
    "AutomationIterationResult",
    "VSCodeController",
    "ProgramMonitor",
    "ScreenshotAnalyzer",
    "AutomationService",
]
