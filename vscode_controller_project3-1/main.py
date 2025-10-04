"""Entrypoint for the AI automation controller application."""
from __future__ import annotations

import argparse
import logging
import threading
from pathlib import Path

import webview

from ai_controller import create_app

logger = logging.getLogger(__name__)


def _run_flask(app, host: str, port: int) -> None:
    logger.info("Starting Flask on %s:%s", host, port)
    app.run(host=host, port=port, debug=False, use_reloader=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Automation Controller")
    parser.add_argument("--host", default="127.0.0.1", help="Flask host")
    parser.add_argument("--port", type=int, default=5001, help="Flask port")
    parser.add_argument("--config", type=Path, help="Custom config path", default=None)
    parser.add_argument("--no-ui", action="store_true", help="Run without launching webview UI")
    args = parser.parse_args()

    app = create_app(args.config)
    threading.Thread(target=_run_flask, args=(app, args.host, args.port), daemon=True).start()

    if args.no_ui:
        logger.info("Running without UI; press Ctrl+C to exit.")
        threading.Event().wait()
        return

    window = webview.create_window(
        "AI 自動化開發控制器",
        url=f"http://{args.host}:{args.port}",
        width=1280,
        height=800,
    )
    webview.start()


if __name__ == "__main__":
    main()
