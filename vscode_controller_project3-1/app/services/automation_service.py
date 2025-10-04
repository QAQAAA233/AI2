"""Automation services for VS Code control, program execution, and monitoring."""
from __future__ import annotations

import logging
import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

try:
    import pyautogui
except Exception:  # pragma: no cover - optional dependency
    pyautogui = None

try:
    import pywinctl as pwc
except Exception:  # pragma: no cover - optional dependency
    pwc = None

import mss
from PIL import Image

from app.config import AutomationConfig, VSCodeConfig
from app.utils.helpers import ensure_dir

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Rect:
    x: int
    y: int
    width: int
    height: int

    @property
    def center(self) -> tuple[int, int]:
        return (self.x + self.width // 2, self.y + self.height // 2)


@dataclass(slots=True)
class CodeOperation:
    type: str
    target: str
    payload: str = ""
    metadata: Dict[str, str] = field(default_factory=dict)


class GUIOverlayManager:
    def __init__(self, regions: Dict[str, Dict[str, int]]):
        self.regions = {name: Rect(**coords) for name, coords in regions.items()}

    def click_region(self, name: str) -> bool:
        if pyautogui is None:
            logger.warning("pyautogui not available, cannot perform GUI click")
            return False
        rect = self.regions.get(name)
        if not rect:
            logger.error("Region %s not defined", name)
            return False
        pyautogui.click(*rect.center)
        time.sleep(0.2)
        return True


class VSCodeController:
    def __init__(self, config: VSCodeConfig):
        self.config = config
        self.overlay = GUIOverlayManager(config.overlay.regions) if config.enable_gui_overlay else None

    def open_files(self, folder: str, files: Optional[List[str]] = None) -> bool:
        files = files or []
        if self.config.use_code_command:
            return self._open_with_command(folder, files)
        return self._open_with_gui(folder, files)

    def _open_with_command(self, folder: str, files: List[str]) -> bool:
        cmd = ["code", folder, *files]
        try:
            subprocess.Popen(cmd)
            logger.info("VSCode command executed: %s", cmd)
            return True
        except FileNotFoundError:
            logger.error("VS Code command not found. Falling back to GUI mode")
            return self._open_with_gui(folder, files)
        except Exception as exc:
            logger.exception("Failed to open VS Code: %s", exc)
            return False

    def _open_with_gui(self, folder: str, files: List[str]) -> bool:
        if self.overlay is None:
            logger.error("GUI overlay disabled; cannot automate VS Code GUI")
            return False
        logger.info("Opening folder via GUI overlay: %s", folder)
        sequence = ["file_menu", "open_folder"]
        for action in sequence:
            if not self.overlay.click_region(action):
                return False
        time.sleep(0.5)
        if pyautogui:
            pyautogui.typewrite(folder)
            pyautogui.press("enter")
        return True

    def execute_operation(self, operation: CodeOperation) -> bool:
        logger.info("Executing code operation: %s", operation)
        if operation.type == "open":
            return self.open_files(operation.target)
        return False


@dataclass(slots=True)
class ProcessInfo:
    pid: int
    command: List[str]
    cwd: Path


class ProgramMonitor:
    def __init__(self) -> None:
        self.processes: Dict[int, ProcessInfo] = {}
        self.output: Dict[int, "queue.Queue[str]"] = {}

    def run(self, command: List[str], cwd: Optional[Path] = None) -> int:
        logger.info("Running command: %s", command)
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        info = ProcessInfo(pid=process.pid, command=command, cwd=cwd or Path.cwd())
        self.processes[process.pid] = info
        q: "queue.Queue[str]" = queue.Queue()
        self.output[process.pid] = q

        def reader() -> None:
            assert process.stdout is not None
            for line in process.stdout:
                q.put(line.rstrip())
            process.stdout.close()

        threading.Thread(target=reader, daemon=True).start()
        return process.pid

    def get_output(self, pid: int) -> str:
        q = self.output.get(pid)
        if not q:
            return ""
        lines: List[str] = []
        while not q.empty():
            lines.append(q.get())
        return "\n".join(lines)


class LogMonitor:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.position = 0

    def read_new_lines(self) -> str:
        if not self.path.exists():
            return ""
        with self.path.open("r", encoding="utf-8", errors="ignore") as fp:
            fp.seek(self.position)
            data = fp.read()
            self.position = fp.tell()
        return data


class ScreenshotAnalyzer:
    def __init__(self, output_dir: Path):
        self.output_dir = ensure_dir(output_dir)

    def capture(self, window_title: Optional[str] = None) -> Path:
        filename = f"screenshot_{int(time.time())}.png"
        path = self.output_dir / filename
        try:
            with mss.mss() as sct:
                monitor = sct.monitors[0]
                img = sct.grab(monitor)
                mss.tools.to_png(img.rgb, img.size, output=str(path))
        except Exception as exc:  # pragma: no cover - hardware dependent
            logger.error("Screenshot capture failed: %s", exc)
            path.write_bytes(b"")
        return path

    def analyze(self, image_path: Path) -> Dict[str, str]:
        try:
            image = Image.open(image_path)
            width, height = image.size
            return {
                "path": str(image_path),
                "width": width,
                "height": height,
                "resolution": f"{width}x{height}",
            }
        except Exception as exc:  # pragma: no cover - corrupt image fallback
            logger.error("Failed to analyze screenshot %s: %s", image_path, exc)
            return {
                "path": str(image_path),
                "width": 0,
                "height": 0,
                "resolution": "0x0",
                "error": str(exc),
            }


class AutomationService:
    def __init__(self, config: AutomationConfig, vscode: VSCodeConfig, screenshot_dir: Path):
        self.config = config
        self.vscode = VSCodeController(vscode)
        self.monitor = ProgramMonitor()
        self.log_monitors: Dict[str, LogMonitor] = {}
        self.screenshots = ScreenshotAnalyzer(screenshot_dir)

    def execute_operation(self, operation: CodeOperation) -> bool:
        return self.vscode.execute_operation(operation)

    def run_program(self, command: List[str], cwd: Optional[Path] = None) -> int:
        return self.monitor.run(command, cwd)

    def read_output(self, pid: int) -> str:
        return self.monitor.get_output(pid)

    def tail_log(self, path: Path) -> str:
        monitor = self.log_monitors.setdefault(str(path), LogMonitor(path))
        return monitor.read_new_lines()

    def capture_and_analyze(self) -> Dict[str, str]:
        image_path = self.screenshots.capture()
        return self.screenshots.analyze(image_path)
