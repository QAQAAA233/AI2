# AI 自動化開發控制器 · 模組化重構版

這是一套依照 2025 年 Python/Flask 最佳實踐重構的 AI 自動化控制平台，整合 Google Gemini、VS Code 自動化與托管模式流程。專案採用模組化的服務層架構，將配置、AI、專案管理、自動化操作與前端對話介面完整分離，便於維護與擴充。

## ✨ 核心特色

- **🧠 AI 服務層抽象**：以 `AIServiceBase` 定義統一介面，預設提供 Gemini 實作並整合長短期記憶、Token 監控與提示詞管理。
- **⚙️ 自動化服務**：`AutomationService` 封裝 VSCode 操作、程式執行監控、日誌追蹤與螢幕截圖輸出，支援托管模式循環。
- **📁 專案與對話管理**：`ProjectService` 以檔案系統為儲存媒介維護專案資訊、對話歷史與記憶摘要。
- **🌐 前後端分離**：Flask 只提供 API 與模板渲染，前端使用 ChatGPT 風格的亮色主題，具備專案列表、對話歷程、托管模式視覺化面板。
- **🛡️ 統一錯誤處理**：以自訂例外類別與 Blueprint error handler，確保回傳格式一致、易於前端顯示。

## 📦 專案結構

```text
vscode_controller_project3-1/
├── ai_controller/
│   ├── __init__.py              # Flask 應用工廠
│   ├── api/
│   │   └── routes.py            # API 與視圖註冊
│   ├── config.py                # 配置、資料類別與日誌設定
│   ├── services/
│   │   ├── __init__.py
│   │   ├── ai_service.py        # AI 抽象層、記憶與 Token 管理
│   │   ├── automation_service.py# VSCode、自動化、截圖
│   │   └── project_service.py   # 專案與對話管理
│   └── utils/
│       ├── __init__.py
│       └── common.py            # 檔案、JSON、Retry 等工具
├── static/
│   ├── css/main.css             # ChatGPT 亮色 UI
│   └── js/main.js               # 前端互動邏輯
├── templates/index.html         # 主介面模板
├── main.py                      # 進入點，啟動 Flask + Webview
├── requirements.txt
└── README.md
```

## 🚀 快速開始

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

啟動後系統會在 `http://127.0.0.1:5001` 提供服務，並透過 PyWebview 顯示亮色系 ChatGPT 介面，可直接在瀏覽器操作。

## 🧩 主要模組說明

### ai_controller/config.py
- 定義 `AppConfig`、`AIConfig`、`AutomationConfig` 等資料類別。
- 提供 `load_config`、`save_config`、`setup_logging`，支援環境變數覆寫與自動建立目錄。

### ai_controller/services/ai_service.py
- `AIServiceBase`：AI 服務抽象。
- `GeminiService`：Gemini 實作，整合安全設定、Token 計數與長短期記憶。
- `MemoryManager`、`TokenManager`、`PromptManager`：記憶體與提示詞管理。

### ai_controller/services/automation_service.py
- `VSCodeController`：負責檔案寫入與 VSCode CLI 呼叫。
- `ProgramMonitor`：非同步擷取執行程式輸出。
- `ScreenshotAnalyzer`：使用 `mss` 擷取畫面並輸出 Base64。
- `AutomationService`：托管模式執行指令、讀取日誌、整合結果。

### ai_controller/services/project_service.py
- `ProjectManager`：維護專案列表與 `PROJECT_INFO.json`。
- `ConversationManager`：儲存對話歷史於 `conversations/` 目錄。
- `ProjectService`：對外統一介面。

### 前端 (templates/index.html, static/css/main.css, static/js/main.js)
- 亮色 ChatGPT 風格 UI，提供專案列表、AI 對話、托管模式結果面板。
- JavaScript 以 `fetch` 呼叫後端 API，支援按鍵送出、托管模式示範流程。

## 🧪 測試建議

1. 建立專案 → 送出 prompt，確認 AI 回應與對話面板刷新。
2. 點擊「啟動托管模式」，觀察 terminal 輸出與截圖區域更新。
3. 檢查 `~/.ai_automation_controller/` 目錄：應生成 `config.json`、`projects/`、`conversations/` 等檔案。

## 📄 授權

本專案以 MIT License 授權，歡迎二次開發與貢獻改進！
