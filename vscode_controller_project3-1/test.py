"""簡易健康檢查腳本：驗證核心模組是否可載入。"""
from ai_controller import create_app


def smoke_test() -> None:
    app = create_app()
    assert app is not None
    print("Flask 應用初始化成功，已註冊藍圖:", app.blueprints.keys())


if __name__ == "__main__":
    smoke_test()
