"""Automation services: VSCode control, program monitoring, screenshot capture."""
from __future__ import annotations

import logging
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from queue import Queue
from typing import Any, Dict, List, Optional

from config import AutomationConfig, VSCodeConfig, VSCodeError
from utils import ensure_dir, truncate_text

logger = logging.getLogger(__name__)

try:  # Optional dependency for GUI automation
    import pyautogui  # type: ignore
except Exception:  # pragma: no cover
    pyautogui = None


@dataclass
class CodeOperation:
    type: str
    filepath: str
    content: str = ""
    start_line: Optional[int] = None
    end_line: Optional[int] = None


@dataclass
class Rect:
    x: int
    y: int
    width: int
    height: int

    @property
    def center(self) -> tuple[int, int]:
        return (self.x + self.width // 2, self.y + self.height // 2)


class GUIOverlayManager:
    def __init__(self, overlay_config: Dict[str, Any]) -> None:
        self.regions = {
            key: Rect(**value) for key, value in overlay_config.get("regions", {}).items()
        }

    def click_region(self, region_name: str) -> bool:
        if not pyautogui:
            logger.warning("pyautogui not available, cannot click %s", region_name)
            return False
        region = self.regions.get(region_name)
        if not region:
            logger.warning("Region %s not configured", region_name)
            return False
        pyautogui.click(*region.center)
        return True

    def perform_open(self, folder: str, files: List[str]) -> bool:
        logger.info("Performing GUI open via overlay for folder %s", folder)
        if not self.click_region("file_menu"):
            return False
        time.sleep(0.5)
        self.click_region("open_folder")
        time.sleep(0.5)
        if pyautogui:
            pyautogui.write(folder)
            pyautogui.press("enter")
        return True


class VSCodeController:
    def __init__(self, config: VSCodeConfig) -> None:
        self.config = config
        self.overlay_manager = (
            GUIOverlayManager(config.overlay_config) if config.enable_gui_overlay else None
        )

    def open_files(self, folder: str, files: List[str]) -> bool:
        if self.config.use_code_command:
            return self._open_via_command(folder, files)
        if self.overlay_manager:
            return self.overlay_manager.perform_open(folder, files)
        raise VSCodeError("Neither code command nor GUI overlay available")

    def _open_via_command(self, folder: str, files: List[str]) -> bool:
        command = ["code", folder, *files]
        logger.debug("Running command: %s", command)
        try:
            subprocess.Popen(command)
        except FileNotFoundError as exc:
            raise VSCodeError("VSCode 'code' command not found") from exc
        return True

    def execute_code_operation(self, operation: CodeOperation) -> bool:
        filepath = Path(operation.filepath)
        if not filepath.exists():
            raise VSCodeError(f"File not found: {filepath}")
        logger.info("Applying code operation %s on %s", operation.type, filepath)
        if operation.type == "replace" and operation.start_line is not None:
            lines = filepath.read_text(encoding="utf-8").splitlines()
            start = max(0, operation.start_line - 1)
            end = operation.end_line if operation.end_line is not None else start + 1
            new_lines = lines[:start] + operation.content.splitlines() + lines[end:]
            filepath.write_text("\n".join(new_lines), encoding="utf-8")
            return True
        if operation.type == "write":
            filepath.write_text(operation.content, encoding="utf-8")
            return True
        if operation.type == "append":
            with filepath.open("a", encoding="utf-8") as handle:
                handle.write(operation.content)
            return True
        raise VSCodeError(f"Unsupported code operation: {operation.type}")


@dataclass
class ProcessInfo:
    process: subprocess.Popen
    start_time: float
    command: List[str]


class LogMonitor:
    def __init__(self, filepath: Path) -> None:
        self.filepath = filepath
        self.last_position = 0

    def get_new_lines(self) -> str:
        if not self.filepath.exists():
            return ""
        with self.filepath.open("r", encoding="utf-8", errors="ignore") as handle:
            handle.seek(self.last_position)
            data = handle.read()
            self.last_position = handle.tell()
            return data


class ProgramMonitor:
    def __init__(self) -> None:
        self.processes: Dict[int, ProcessInfo] = {}
        self.output_queues: Dict[int, Queue[str]] = {}
        self.log_monitors: Dict[Path, LogMonitor] = {}

    def run_program(self, command: List[str], cwd: Optional[Path] = None) -> int:
        logger.info("Running command: %s", command)
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        queue: Queue[str] = Queue()
        self.output_queues[process.pid] = queue
        self.processes[process.pid] = ProcessInfo(process=process, start_time=time.time(), command=command)
        threading.Thread(target=self._stream_output, args=(process, queue), daemon=True).start()
        return process.pid

    def _stream_output(self, process: subprocess.Popen, queue: Queue[str]) -> None:
        assert process.stdout
        for line in iter(process.stdout.readline, ""):
            queue.put(line.rstrip())
        process.stdout.close()

    def get_terminal_output(self, pid: int) -> str:
        queue = self.output_queues.get(pid)
        if not queue:
            return ""
        lines: List[str] = []
        while not queue.empty():
            lines.append(queue.get())
        return "\n".join(lines)

    def monitor_log_file(self, filepath: Path) -> str:
        monitor = self.log_monitors.get(filepath)
        if not monitor:
            monitor = LogMonitor(filepath)
            self.log_monitors[filepath] = monitor
        return monitor.get_new_lines()

    def terminate(self, pid: int) -> None:
        info = self.processes.get(pid)
        if not info:
            return
        info.process.terminate()
        info.process.wait(timeout=5)
        self.processes.pop(pid, None)
        self.output_queues.pop(pid, None)


class ScreenshotAnalyzer:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        ensure_dir(output_dir)

    def capture_window(self, window_title: str) -> Dict[str, Any]:
        filename = f"screenshot_{int(time.time())}.txt"
        path = self.output_dir / filename
        path.write_text(f"Screenshot placeholder for window: {window_title}")
        return {"path": str(path), "analysis": "(placeholder)"}

    def capture_for_ui_analysis(self, window_title: str) -> Dict[str, Any]:
        result = self.capture_window(window_title)
        result.update({
            "ui_elements": ["chat-container", "input-box", "send-button"],
            "layout_info": {
                "theme": "light",
                "dominant_colors": ["#ffffff", "#f1f5f9", "#2563eb"],
            },
        })
        return result


@dataclass
class IterationResult:
    iteration: int
    request: str
    ai_response: str
    terminal_output: str
    logs: str
    screenshot: Dict[str, Any]
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "iteration": self.iteration,
            "request": self.request,
            "ai_response": self.ai_response,
            "terminal_output": truncate_text(self.terminal_output, 4000),
            "logs": truncate_text(self.logs, 4000),
            "screenshot": self.screenshot,
            "summary": self.summary,
        }


class AutomationService:
    def __init__(
        self,
        automation_config: AutomationConfig,
        vscode_config: VSCodeConfig,
        projects_dir: Path,
    ) -> None:
        self.config = automation_config
        self.vscode = VSCodeController(vscode_config)
        self.monitor = ProgramMonitor()
        self.screenshot = ScreenshotAnalyzer(Path("data/screenshots"))
        self.projects_dir = projects_dir

    def open_project(self, project_dir: str) -> bool:
        folder = str(Path(self.projects_dir) / project_dir)
        return self.vscode.open_files(folder, [])

    def apply_code_changes(self, operations: List[CodeOperation]) -> None:
        for op in operations:
            self.vscode.execute_code_operation(op)

    def run_iteration(
        self,
        iteration: int,
        request_text: str,
        ai_response: str,
        command: List[str],
        logs: List[Path],
    ) -> IterationResult:
        pid = self.monitor.run_program(command)
        time.sleep(2)
        terminal_output = self.monitor.get_terminal_output(pid)
        aggregated_logs = "\n".join(self.monitor.monitor_log_file(path) for path in logs)
        screenshot = self.screenshot.capture_for_ui_analysis("AI Automation UI")
        return IterationResult(
            iteration=iteration,
            request=request_text,
            ai_response=ai_response,
            terminal_output=terminal_output,
            logs=aggregated_logs,
            screenshot=screenshot,
            summary="迭代完成",
        )


__all__ = [
    "AutomationService",
    "CodeOperation",
    "GUIOverlayManager",
    "IterationResult",
    "LogMonitor",
    "ProgramMonitor",
    "Rect",
    "ScreenshotAnalyzer",
    "VSCodeController",
]

