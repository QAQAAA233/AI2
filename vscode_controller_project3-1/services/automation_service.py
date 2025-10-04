"""Automation layer for VS Code operations, program execution, and screenshots."""
from __future__ import annotations

import asyncio
import base64
import logging
import queue
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import mss

try:  # pragma: no cover - optional dependency in headless environments
    import pyautogui
except Exception:  # noqa: BLE001
    pyautogui = None

try:  # pragma: no cover - optional dependency in headless environments
    import pywinctl as pwc
except Exception:  # noqa: BLE001
    pwc = None

from config import AutomationConfig, VSCodeConfig
from utils.common import ensure_dir

logger = logging.getLogger(__name__)


@dataclass
class Rect:
    x: int
    y: int
    width: int
    height: int

    @property
    def center(self) -> tuple[int, int]:
        return (self.x + self.width // 2, self.y + self.height // 2)


@dataclass
class ProcessInfo:
    pid: int
    command: List[str]
    cwd: Path
    start_time: float


class AutomationError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class GUIOverlayManager:
    def __init__(self, config: Dict[str, Dict[str, int]]):
        self.regions: Dict[str, Rect] = {
            name: Rect(**region) for name, region in config.get("regions", {}).items()
        }

    def click(self, region_name: str) -> None:
        region = self.regions.get(region_name)
        if not region:
            raise AutomationError(f"未定義的 GUI 區域: {region_name}")
        if pyautogui is None:
            raise AutomationError("此環境不支援 GUI 操作", retryable=False)
        pyautogui.click(*region.center)
        time.sleep(0.2)


class VSCodeController:
    def __init__(self, config: VSCodeConfig):
        self.config = config
        self.overlay = GUIOverlayManager(config.overlay_config or {}) if config.enable_gui_overlay else None

    def open_folder(self, folder: Path) -> None:
        logger.info("開啟 VSCode 資料夾: %s", folder)
        if self.config.use_code_command:
            subprocess.Popen(["code", str(folder)])
        elif self.overlay:
            if pyautogui is None:
                raise AutomationError("此環境不支援 GUI 操作", retryable=False)
            self.overlay.click("file_menu")
            self.overlay.click("open_folder")
            pyautogui.write(str(folder))
            pyautogui.press("enter")
        else:
            raise AutomationError("未配置可用的 VSCode 開啟方式")

    def apply_changes(self, changes: List[Dict[str, str]]) -> None:
        for change in changes:
            file_path = Path(change["path"])
            ensure_dir(file_path.parent)
            file_path.write_text(change.get("content", ""), encoding="utf-8")
            logger.info("已更新檔案: %s", file_path)


class LogMonitor:
    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.last_position = 0

    def read_new(self) -> str:
        if not self.file_path.exists():
            return ""
        with self.file_path.open("r", encoding="utf-8", errors="ignore") as handle:
            handle.seek(self.last_position)
            data = handle.read()
            self.last_position = handle.tell()
            return data


class ProgramMonitor:
    def __init__(self):
        self.processes: Dict[int, ProcessInfo] = {}
        self.output_queues: Dict[int, "queue.Queue[str]"] = {}
        self.log_monitors: Dict[Path, LogMonitor] = {}

    def run(self, command: List[str], cwd: Path) -> int:
        logger.info("執行指令: %s", command)
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        info = ProcessInfo(pid=process.pid, command=command, cwd=cwd, start_time=time.time())
        self.processes[process.pid] = info
        output_queue: "queue.Queue[str]" = queue.Queue()
        self.output_queues[process.pid] = output_queue
        threading.Thread(target=self._stream_output, args=(process, output_queue), daemon=True).start()
        return process.pid

    def _stream_output(self, process: subprocess.Popen, q: "queue.Queue[str]") -> None:
        assert process.stdout is not None
        for line in iter(process.stdout.readline, ""):
            q.put(line)
        process.stdout.close()

    def fetch_output(self, pid: int) -> str:
        q = self.output_queues.get(pid)
        if not q:
            return ""
        lines: List[str] = []
        while True:
            try:
                lines.append(q.get_nowait())
            except queue.Empty:
                break
        return "".join(lines)

    def monitor_log(self, file_path: Path) -> str:
        monitor = self.log_monitors.setdefault(file_path, LogMonitor(file_path))
        return monitor.read_new()


class ScreenshotAnalyzer:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        ensure_dir(self.output_dir)

    def capture_window(self, title_keyword: str) -> Optional[Path]:
        try:
            if pwc is None:
                raise AutomationError("目前環境無法存取視窗資訊", retryable=False)
            window = next(win for win in pwc.getAllWindows() if title_keyword in win.title)
        except StopIteration:
            logger.warning("找不到包含關鍵字 '%s' 的視窗", title_keyword)
            return None
        except AutomationError:
            return None
        bbox = window.getClientRect()
        with mss.mss() as sct:
            monitor = {"left": bbox.left, "top": bbox.top, "width": bbox.width, "height": bbox.height}
            image = sct.grab(monitor)
            path = self.output_dir / f"screenshot_{int(time.time())}.png"
            mss.tools.to_png(image.rgb, image.size, output=str(path))
            return path

    def capture_encoded(self, title_keyword: str) -> Optional[str]:
        path = self.capture_window(title_keyword)
        if not path:
            return None
        with path.open("rb") as handle:
            return base64.b64encode(handle.read()).decode("ascii")


class AutomationService:
    def __init__(self, config: AutomationConfig, vscode: VSCodeController, monitor: ProgramMonitor, screenshots: ScreenshotAnalyzer):
        self.config = config
        self.vscode = vscode
        self.monitor = monitor
        self.screenshots = screenshots

    async def run_iteration(
        self,
        *,
        command: Optional[List[str]] = None,
        cwd: Optional[Path] = None,
        log_files: Optional[List[Path]] = None,
        window_title: Optional[str] = None,
    ) -> Dict[str, str]:
        results: Dict[str, str] = {}
        if command and cwd:
            pid = self.monitor.run(command, cwd)
            await asyncio.sleep(3)
            results["terminal"] = self.monitor.fetch_output(pid)
        if log_files:
            for file in log_files:
                results[f"log::{file.name}"] = self.monitor.monitor_log(file)
        if window_title and self.config.enable_ui_analysis:
            encoded = self.screenshots.capture_encoded(window_title)
            if encoded:
                results["screenshot_base64"] = encoded
        return results
